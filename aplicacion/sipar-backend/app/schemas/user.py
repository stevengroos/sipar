# app/schemas/user.py
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    company_id: int = 1
    role: str = "operador"
    
class UserResponse(BaseModel):
    id: int
    email: str
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    role: str
    is_active: bool
    mfa_enabled: Optional[bool] = False
    failed_login_attempts: Optional[int] = 0
    locked_until: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    password_changed_at: Optional[datetime] = None
    must_change_password: Optional[bool] = False

    class Config:
        from_attributes = True