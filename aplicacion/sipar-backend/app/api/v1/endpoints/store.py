# app/api/v1/endpoints/store.py
import os
import time
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Request, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from supabase import create_client, Client

from app.db.session import get_db
from app.models import models
from app.api import deps

router = APIRouter()

BUCKET_NAME = "products"

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"

def log_store_event(
    db: Session,
    user: models.User,
    action: str,
    target: str,
    ip_address: str,
    details: str,
    status: str = "SUCCESS"
):
    try:
        actor_label = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
        log_entry = models.SecurityAuditLog(
            user_id=user.id,
            actor_email=f"{actor_label} ({user.email})",
            action=action,
            target=target,
            ip_address=ip_address,
            status=status,
            details=details
        )
        db.add(log_entry)
        db.commit()
    except Exception:
        db.rollback()

def get_supabase_client() -> Optional[Client]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)

def upload_image_to_supabase(image: UploadFile, sku: str) -> str:
    supabase_client = get_supabase_client()
    if not supabase_client:
        raise HTTPException(
            status_code=500,
            detail="Faltan las variables SUPABASE_URL o SUPABASE_KEY en Render, o puedes ingresar una URL de imagen directa."
        )
    file_ext = image.filename.split(".")[-1].lower() if "." in image.filename else "jpg"
    clean_sku = "".join(c for c in sku if c.isalnum() or c in ("-", "_"))
    filename = f"{clean_sku}_{int(time.time())}.{file_ext}"
    file_bytes = image.file.read()

    try:
        supabase_client.storage.from_(BUCKET_NAME).upload(
            file=file_bytes,
            path=filename,
            file_options={"content-type": image.content_type or "image/jpeg"}
        )
    except Exception:
        try:
            supabase_client.storage.create_bucket(BUCKET_NAME, options={"public": True})
            supabase_client.storage.from_(BUCKET_NAME).upload(
                file=file_bytes,
                path=filename,
                file_options={"content-type": image.content_type or "image/jpeg"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"No se pudo subir la imagen a Supabase Storage: {str(e)}")

    return supabase_client.storage.from_(BUCKET_NAME).get_public_url(filename)


# --- ESQUEMAS PYDANTIC ---
class CategoryCreateInput(BaseModel):
    name: str

class CategoryResponse(BaseModel):
    id: int
    name: str
    product_count: int = 0

    class Config:
        from_attributes = True

class ProductResponse(BaseModel):
    id: int
    name: str
    sku: str
    category: Optional[str] = "Accesorios EV"
    description: Optional[str] = ""
    price: float
    stock: int
    image_url: Optional[str] = None
    show_in_app: Optional[bool] = True
    is_active: bool

    class Config:
        from_attributes = True

class StockAdjust(BaseModel):
    product_id: int
    movement_type: str  # 'ingreso' o 'salida'
    quantity: int
    notes: Optional[str] = None

class UserSimple(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email: Optional[str] = ""

    class Config:
        from_attributes = True

class StockHistoryResponse(BaseModel):
    id: int
    movement_type: str
    quantity: int
    notes: Optional[str] = None
    created_at: datetime
    product: ProductResponse
    user: Optional[UserSimple] = None

    class Config:
        from_attributes = True


# =========================================================================
# 1. GESTIÓN DINÁMICA DE CATEGORÍAS DE LA TIENDA
# =========================================================================
@router.get("/categories", response_model=List[CategoryResponse])
def get_store_categories(db: Session = Depends(get_db)):
    """Obtiene todas las categorías registradas junto con la cantidad de productos activos en cada una."""
    categories = db.query(models.StoreCategory).order_by(models.StoreCategory.name.asc()).all()
    active_products = db.query(models.Product).filter(models.Product.is_active == True).all()

    counts = {}
    for p in active_products:
        cat_name = p.category or "Sin Categoría"
        counts[cat_name] = counts.get(cat_name, 0) + 1

    return [
        CategoryResponse(
            id=cat.id,
            name=cat.name,
            product_count=counts.get(cat.name, 0)
        )
        for cat in categories
    ]

@router.post("/categories", response_model=CategoryResponse)
def create_store_category(
    cat_in: CategoryCreateInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Crea una nueva categoría para los productos de la tienda y App Móvil."""
    clean_name = cat_in.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre de la categoría no puede estar vacío.")

    exists = db.query(models.StoreCategory).filter(models.StoreCategory.name.ilike(clean_name)).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"La categoría '{clean_name}' ya existe.")

    new_cat = models.StoreCategory(name=clean_name)
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)

    log_store_event(
        db, current_user, "STORE_CATEGORY_CREATED", clean_name, get_client_ip(request),
        f"Nueva categoría creada en tienda: '{clean_name}'"
    )
    return CategoryResponse(id=new_cat.id, name=new_cat.name, product_count=0)

@router.delete("/categories/{category_id}")
def delete_store_category(
    category_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Elimina una categoría y reasigna sus productos a 'Sin Categoría' para no perder productos."""
    cat = db.query(models.StoreCategory).filter(models.StoreCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")

    cat_name = cat.name
    # Reasignar productos que tenían esta categoría
    affected_products = db.query(models.Product).filter(models.Product.category == cat_name).all()
    for p in affected_products:
        p.category = "Sin Categoría"

    db.delete(cat)
    db.commit()

    log_store_event(
        db, current_user, "STORE_CATEGORY_DELETED", cat_name, get_client_ip(request),
        f"Categoría '{cat_name}' eliminada ({len(affected_products)} productos reasignados a 'Sin Categoría')",
        "WARNING"
    )
    return {"detail": f"Categoría '{cat_name}' eliminada correctamente."}


# =========================================================================
# 2. CATÁLOGO PARA LA APP MÓVIL (CONDUCTORES) Y PANEL ADMIN
# =========================================================================
@router.get("/products", response_model=List[ProductResponse])
def get_products(
    only_app_visible: bool = Query(False),
    db: Session = Depends(get_db)
):
    query = db.query(models.Product).filter(models.Product.is_active == True)
    if only_app_visible:
        query = query.filter(models.Product.show_in_app == True)
    return query.order_by(models.Product.id.desc()).all()

@router.get("/app-catalog", response_model=List[ProductResponse])
def get_mobile_app_catalog(db: Session = Depends(get_db)):
    return (
        db.query(models.Product)
        .filter(models.Product.is_active == True, models.Product.show_in_app == True)
        .order_by(models.Product.stock.desc(), models.Product.id.desc())
        .all()
    )


# =========================================================================
# 3. CREAR PRODUCTO (CON STOCK INICIAL E IMAGEN HÍBRIDA)
# =========================================================================
@router.post("/products", response_model=ProductResponse)
def create_product(
    request: Request,
    name: str = Form(...),
    sku: str = Form(...),
    price: float = Form(...),
    category: str = Form("Sin Categoría"),
    description: str = Form(""),
    initial_stock: int = Form(0),
    show_in_app: bool = Form(True),
    image_url_input: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    clean_sku = sku.strip().upper()
    existing = db.query(models.Product).filter(models.Product.sku.ilike(clean_sku)).first()
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail=f"El código SKU '{clean_sku}' ya está registrado en otro producto.")
        else:
            existing.sku = f"{existing.sku}_OLD_{int(time.time())}"
            db.commit()

    clean_cat = category.strip() or "Sin Categoría"
    # Si el usuario escribió una categoría que no estaba en la tabla, la registramos automáticamente
    if clean_cat != "Sin Categoría":
        cat_exists = db.query(models.StoreCategory).filter(models.StoreCategory.name.ilike(clean_cat)).first()
        if not cat_exists:
            db.add(models.StoreCategory(name=clean_cat))
            db.commit()

    final_image_url = image_url_input.strip() if image_url_input and image_url_input.strip() else None
    if image and image.filename:
        final_image_url = upload_image_to_supabase(image, clean_sku)

    new_product = models.Product(
        name=name.strip(),
        sku=clean_sku,
        category=clean_cat,
        description=description.strip(),
        price=price,
        stock=max(0, int(initial_stock or 0)),
        image_url=final_image_url,
        show_in_app=bool(show_in_app),
        is_active=True
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    if new_product.stock > 0:
        history = models.StockHistory(
            product_id=new_product.id,
            user_id=current_user.id,
            movement_type="ingreso",
            quantity=new_product.stock,
            notes="Inventario inicial al registrar producto"
        )
        db.add(history)
        db.commit()

    log_store_event(
        db, current_user, "STORE_PRODUCT_CREATED", f"{new_product.name} ({new_product.sku})", get_client_ip(request),
        f"Producto creado | Categoría: {clean_cat} | Precio: {int(price):,} ₲ | Stock inicial: {new_product.stock}".replace(",", ".")
    )
    return new_product


# =========================================================================
# 4. EDITAR PRODUCTO
# =========================================================================
@router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    request: Request,
    name: str = Form(...),
    sku: str = Form(...),
    price: float = Form(...),
    category: str = Form("Sin Categoría"),
    description: str = Form(""),
    show_in_app: bool = Form(True),
    image_url_input: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    product = db.query(models.Product).filter(models.Product.id == product_id, models.Product.is_active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    clean_sku = sku.strip().upper()
    if product.sku.upper() != clean_sku:
        if db.query(models.Product).filter(models.Product.sku.ilike(clean_sku), models.Product.id != product_id).first():
            raise HTTPException(status_code=400, detail=f"El SKU '{clean_sku}' ya está en uso por otro producto.")

    clean_cat = category.strip() or "Sin Categoría"
    product.name = name.strip()
    product.sku = clean_sku
    product.category = clean_cat
    product.description = description.strip()
    product.price = price
    product.show_in_app = bool(show_in_app)

    if image and image.filename:
        product.image_url = upload_image_to_supabase(image, clean_sku)
    elif image_url_input is not None and image_url_input.strip() != "":
        product.image_url = image_url_input.strip()

    db.commit()
    db.refresh(product)

    log_store_event(
        db, current_user, "STORE_PRODUCT_UPDATED", f"{product.name} ({product.sku})", get_client_ip(request),
        f"Producto actualizado | Categoría: {clean_cat} | Precio: {int(price):,} ₲".replace(",", ".")
    )
    return product


# =========================================================================
# 5. INTERRUPTOR RÁPIDO DE VISIBILIDAD EN LA APP MÓVIL
# =========================================================================
@router.patch("/products/{product_id}/toggle-app", response_model=ProductResponse)
def toggle_product_app_visibility(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    product = db.query(models.Product).filter(models.Product.id == product_id, models.Product.is_active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    product.show_in_app = not bool(product.show_in_app)
    db.commit()
    db.refresh(product)

    log_store_event(
        db, current_user, "STORE_APP_VISIBILITY", f"{product.name} ({product.sku})", get_client_ip(request),
        f"Visibilidad en App Móvil cambiada a: {'VISIBLE' if product.show_in_app else 'OCULTO'}"
    )
    return product


# =========================================================================
# 6. ELIMINAR PRODUCTO (BORRADO LÓGICO)
# =========================================================================
@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    
    product.is_active = False
    product.show_in_app = False
    db.commit()

    log_store_event(
        db, current_user, "STORE_PRODUCT_DELETED", f"{product.name} ({product.sku})", get_client_ip(request),
        "Producto dado de baja del inventario y retirado de la App Móvil", "WARNING"
    )
    return {"detail": "Producto eliminado de la tienda."}


# =========================================================================
# 7. GESTIÓN DE STOCK Y MOVIMIENTOS AUDITADOS
# =========================================================================
@router.post("/stock")
def adjust_stock(
    adjust_in: StockAdjust,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "operador", "Super Admin"]))
):
    product = db.query(models.Product).filter(models.Product.id == adjust_in.product_id, models.Product.is_active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
        
    if adjust_in.quantity <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")
        
    if adjust_in.movement_type == "salida" and product.stock < adjust_in.quantity:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente. Disponible actual: {product.stock} unidades.")
        
    if adjust_in.movement_type == "ingreso":
        product.stock += adjust_in.quantity
    else:
        product.stock -= adjust_in.quantity
        
    history = models.StockHistory(
        product_id=product.id,
        user_id=current_user.id,
        movement_type=adjust_in.movement_type,
        quantity=adjust_in.quantity,
        notes=adjust_in.notes or ("Ingreso de mercadería" if adjust_in.movement_type == "ingreso" else "Salida / Venta")
    )
    db.add(history)
    db.commit()

    signo = "+" if adjust_in.movement_type == "ingreso" else "-"
    log_store_event(
        db, current_user, "STORE_STOCK_ADJUSTED", f"{product.name} ({product.sku})", get_client_ip(request),
        f"Ajuste de stock ({signo}{adjust_in.quantity}) -> Stock final: {product.stock} | Nota: {history.notes}"
    )
    return {"detail": "Stock actualizado correctamente.", "new_stock": product.stock}

@router.get("/stock/history", response_model=List[StockHistoryResponse])
def get_stock_history(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    return db.query(models.StockHistory).order_by(models.StockHistory.id.desc()).limit(limit).all()