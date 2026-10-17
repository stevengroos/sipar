from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "SIPAR Core API"
    VERSION: str = "1.0.0"
    
    # Seguridad JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Base de datos Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str
    DATABASE_URL: str

    # CORS
    CORS_ORIGINS: List[str] = ["*"],

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

# Instancia Singleton (Se importa en el resto del proyecto)
settings = Settings()