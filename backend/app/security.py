from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import JWT_EXPIRE_MINUTES, JWT_SECRET

COOKIE_NAME = "fs_session"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user_id: int, role: str, token_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "role": role, "tv": token_version,
               "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
