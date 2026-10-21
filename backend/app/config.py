import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

ENV = os.getenv("ENV", "development")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'finsight.db'}")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-insecure-secret-change-me")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "120"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-haiku-5-5")
MODEL_PATH = BASE_DIR / "app" / "ai" / "anomaly_model.joblib"
CURRENCY = "INR"

if ENV != "development" and JWT_SECRET.startswith("dev-only"):
    raise RuntimeError("Set a strong JWT_SECRET outside development")
