# app/api/v1/endpoints/wallet.py
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models import models
from app.api import deps
from app.api.v1.endpoints.auth import log_security_event, get_client_ip

router = APIRouter()

class WalletResponse(BaseModel):
    balance_pyg: float

class TopUpInput(BaseModel):
    amount_pyg: float

class TransferInput(BaseModel):
    recipient_email: str
    amount_pyg: float

class DisputeWalletInput(BaseModel):
    reason: str

def get_or_create_wallet(db: Session, user_id: int) -> models.Wallet:
    wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user_id).first()
    if not wallet:
        wallet = models.Wallet(user_id=user_id, balance_pyg=150000.0) # Bono inicial de prueba
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet

@router.get("/balance", response_model=WalletResponse)
def get_wallet_balance(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene el saldo actual de la billetera del conductor."""
    wallet = get_or_create_wallet(db, current_user.id)
    return {"balance_pyg": round(wallet.balance_pyg, 0)}

@router.post("/topup", response_model=WalletResponse)
def top_up_wallet(
    topup_in: TopUpInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Agrega fondos directamente a la billetera (impacto inmediato sin pasarela por ahora)."""
    if topup_in.amount_pyg <= 0 or topup_in.amount_pyg > 10000000:
        raise HTTPException(status_code=400, detail="Monto de recarga inválido (máx. 10.000.000 ₲).")

    wallet = get_or_create_wallet(db, current_user.id)
    wallet.balance_pyg += float(topup_in.amount_pyg)
    db.commit()

    log_security_event(
        db, "WALLET_TOPUP", current_user.email, f"Wallet #{wallet.id}", get_client_ip(request),
        "SUCCESS", f"Recarga de saldo por {int(topup_in.amount_pyg):,} ₲", current_user.id
    )
    return {"balance_pyg": round(wallet.balance_pyg, 0)}

@router.post("/transfer")
def transfer_balance(
    transfer_in: TransferInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Transfiere saldo de la billetera a otro usuario mediante su correo electrónico."""
    amount = float(transfer_in.amount_pyg)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El monto a transferir debe ser mayor a cero.")

    recipient_email = transfer_in.recipient_email.strip().lower()
    if recipient_email == current_user.email.strip().lower():
        raise HTTPException(status_code=400, detail="No puedes transferir saldo a tu propia cuenta.")

    recipient = db.query(models.User).filter(models.User.email.ilike(recipient_email)).first()
    if not recipient or not recipient.is_active:
        raise HTTPException(status_code=404, detail="El correo del destinatario no existe o la cuenta está inactiva.")

    sender_wallet = get_or_create_wallet(db, current_user.id)
    if sender_wallet.balance_pyg < amount:
        raise HTTPException(status_code=400, detail="Saldo insuficiente en tu Wallet para realizar esta transferencia.")

    recipient_wallet = get_or_create_wallet(db, recipient.id)

    # Ejecución atómica de la transferencia
    sender_wallet.balance_pyg -= amount
    recipient_wallet.balance_pyg += amount

    transfer_record = models.WalletTransfer(
        sender_id=current_user.id,
        receiver_id=recipient.id,
        amount_pyg=amount
    )
    db.add(transfer_record)
    db.commit()

    log_security_event(
        db, "WALLET_TRANSFER_SENT", current_user.email, recipient.email, get_client_ip(request),
        "SUCCESS", f"Transferencia de {int(amount):,} ₲ enviada a {recipient.email}", current_user.id
    )
    return {"message": f"Transferencia de {int(amount):,} ₲ realizada con éxito a {recipient.email}."}