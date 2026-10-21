from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .db import get_db
from .errors import ApiError
from .models import User
from .security import COOKIE_NAME, decode_token


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    payload = decode_token(token) if token else None
    if not payload:
        raise ApiError(401, "unauthenticated", "Please sign in to continue")
    user = db.get(User, int(payload["sub"]))
    # Role always comes from the database, never from the token or the client.
    if not user or not user.is_active or user.token_version != payload.get("tv"):
        raise ApiError(401, "unauthenticated", "Session expired, please sign in again")
    return user


def require_customer(user: User = Depends(current_user)) -> User:
    if user.role != "customer":
        raise ApiError(403, "forbidden", "Customer access only")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise ApiError(403, "forbidden", "Administrator access only")
    return user
