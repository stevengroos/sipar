import os
import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from supabase import create_client, Client

from app.db.session import get_db
from app.models import models
from app.api import deps
# Si tu proyecto usa un archivo de configuración centralizado (ej: app.core.config), puedes importarlo:
#from app.core.config import config, security

router = APIRouter()

BUCKET_NAME = "products"

# Función segura para obtener el cliente de Supabase leyendo dinámicamente del entorno
def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        raise HTTPException(
            status_code=500, 
            detail="Faltan las credenciales de Supabase (SUPABASE_URL o SUPABASE_KEY) en el archivo .env"
        )
    return create_client(url, key)

# --- ESQUEMAS PYDANTIC ---
class ProductCreate(BaseModel):
    name: str
    sku: str
    price: float
    image_url: Optional[str] = None

class ProductResponse(ProductCreate):
    id: int
    stock: int
    is_active: bool
    class Config:
        from_attributes = True

class StockAdjust(BaseModel):
    product_id: int
    movement_type: str # 'ingreso' o 'salida'
    quantity: int
    notes: Optional[str] = None

class UserSimple(BaseModel):
    first_name: str
    last_name: str
    class Config:
        from_attributes = True

class StockHistoryResponse(BaseModel):
    id: int
    movement_type: str
    quantity: int
    notes: Optional[str]
    created_at: datetime
    product: ProductResponse
    user: Optional[UserSimple]
    class Config:
        from_attributes = True

# --- RUTAS DE PRODUCTOS ---
@router.get("/products", response_model=List[ProductResponse])
def get_products(db: Session = Depends(get_db)):
    """Obtiene todos los productos activos."""
    return db.query(models.Product).filter(models.Product.is_active == True).order_by(models.Product.id.desc()).all()

@router.post("/products", response_model=ProductResponse)
def create_product(
    name: str = Form(...),
    sku: str = Form(...),
    price: float = Form(...),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Crea un nuevo producto y sube la imagen a Supabase Storage."""
    if db.query(models.Product).filter(models.Product.sku == sku).first():
        raise HTTPException(status_code=400, detail="El SKU ya existe.")
    
    image_url = None
    if image and image.filename:
        try:
            supabase = get_supabase_client()
            # Generar un nombre único para evitar colisiones
            file_ext = image.filename.split(".")[-1]
            filename = f"{sku}_{int(time.time())}.{file_ext}"
            
            # Leer el archivo en memoria y subirlo a Supabase
            file_bytes = image.file.read()
            supabase_client.storage.from_(BUCKET_NAME).upload(
                file=file_bytes,
                path=filename,
                file_options={"content-type": image.content_type}
            )
            
            # Obtener la URL pública oficial de Supabase
            image_url = supabase_client.storage.from_(BUCKET_NAME).get_public_url(filename)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al subir imagen: {str(e)}")
            
    new_product = models.Product(
        name=name, sku=sku, price=price, image_url=image_url
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product

@router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    name: str = Form(...),
    sku: str = Form(...),
    price: float = Form(...),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Edita un producto existente y actualiza su imagen en Supabase."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
        
    if product.sku != sku:
        if db.query(models.Product).filter(models.Product.sku == sku).first():
            raise HTTPException(status_code=400, detail="El SKU ya está en uso.")
            
    product.name = name
    product.sku = sku
    product.price = price
    
    if image and image.filename:
        try:
            file_ext = image.filename.split(".")[-1]
            filename = f"{sku}_{int(time.time())}.{file_ext}"
            
            file_bytes = image.file.read()
            supabase_client.storage.from_(BUCKET_NAME).upload(
                file=file_bytes,
                path=filename,
                file_options={"content-type": image.content_type}
            )
            product.image_url = supabase_client.storage.from_(BUCKET_NAME).get_public_url(filename)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al subir nueva imagen: {str(e)}")
            
    db.commit()
    db.refresh(product)
    return product

@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Borrado lógico de un producto."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    
    product.is_active = False
    db.commit()
    return {"detail": "Producto eliminado de la tienda."}

# --- RUTAS DE STOCK ---
@router.post("/stock")
def adjust_stock(
    adjust_in: StockAdjust,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "operador"]))
):
    product = db.query(models.Product).filter(models.Product.id == adjust_in.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
        
    if adjust_in.quantity <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")
        
    if adjust_in.movement_type == "salida" and product.stock < adjust_in.quantity:
        raise HTTPException(status_code=400, detail="No hay suficiente stock.")
        
    if adjust_in.movement_type == "ingreso":
        product.stock += adjust_in.quantity
    else:
        product.stock -= adjust_in.quantity
        
    history = models.StockHistory(
        product_id=product.id,
        user_id=current_user.id,
        movement_type=adjust_in.movement_type,
        quantity=adjust_in.quantity,
        notes=adjust_in.notes
    )
    db.add(history)
    db.commit()
    return {"detail": "Stock actualizado."}

@router.get("/stock/history", response_model=List[StockHistoryResponse])
def get_stock_history(db: Session = Depends(get_db)):
    return db.query(models.StockHistory).order_by(models.StockHistory.id.desc()).all()