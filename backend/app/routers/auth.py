import re
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from ..config import ENV
from ..db import get_db
from ..deps import current_user
from ..errors import ApiError
from ..models import Account, CustomerProfile, User
from ..security import COOKIE_NAME, create_token, hash_password, verify_password
from ..utils import audit, new_account_number, notify

router = APIRouter(prefix="/auth", tags=["auth"])
_attempts: dict[str, list[float]] = defaultdict(list)


def _password_rules(v: str) -> str:
    if len(v) < 8 or not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("Password must be at least 8 characters and include letters and numbers")
    return v


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(pattern=r"^[6-9]\d{9}$", description="10-digit Indian mobile number")
    password: str
    account_type: str = Field(default="savings", pattern="^(savings|current)$")
    city: str | None = Field(default=None, max_length=80)
    _pw = field_validator("password")(_password_rules)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, pattern=r"^[6-9]\d{9}$")
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    occupation: str | None = Field(default=None, max_length=80)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str
    _pw = field_validator("new_password")(_password_rules)


def user_out(u: User) -> dict:
    p = u.profile
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "phone": u.phone, "role": u.role,
            "is_active": u.is_active, "created_at": u.created_at.isoformat(),
            "profile": {"address": p.address, "city": p.city, "occupation": p.occupation,
                        "date_of_birth": p.date_of_birth, "monthly_income": p.monthly_income_minor / 100} if p else None}


def _set_cookie(resp: Response, user: User):
    resp.set_cookie(COOKIE_NAME, create_token(user.id, user.role, user.token_version), httponly=True,
                    samesite="strict", secure=ENV != "development", max_age=60 * 60 * 8, path="/")


@router.post("/register", status_code=201)
def register(body: RegisterIn, response: Response, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise ApiError(409, "email_taken", "An account with this email already exists")
    user = User(email=body.email.lower(), full_name=body.full_name.strip(), phone=body.phone,
                password_hash=hash_password(body.password), role="customer")
    db.add(user)
    db.flush()
    db.add(CustomerProfile(user_id=user.id, city=body.city))
    db.add(Account(account_number=new_account_number(), user_id=user.id, type=body.account_type))
    notify(db, user.id, "info", "Welcome to FinSight Bank",
           f"Your {body.account_type} account is active. This is a simulated demo bank.")
    audit(db, user.id, "user.register", "user", user.id, ip=request.client.host if request.client else None)
    db.commit()
    _set_cookie(response, user)
    return {"data": user_out(user)}


@router.post("/login")
def login(body: LoginIn, response: Response, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    now = time.time()
    _attempts[ip] = [t for t in _attempts[ip] if now - t < 300]
    if len(_attempts[ip]) >= 10:
        raise ApiError(429, "rate_limited", "Too many login attempts. Please wait a few minutes.")
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        _attempts[ip].append(now)
        raise ApiError(401, "invalid_credentials", "Incorrect email or password")
    if not user.is_active:
        raise ApiError(403, "account_disabled", "This user has been deactivated. Contact the bank.")
    _attempts.pop(ip, None)
    audit(db, user.id, "user.login", "user", user.id, ip=ip)
    db.commit()
    _set_cookie(response, user)
    return {"data": user_out(user)}


@router.post("/logout")
def logout(response: Response, request: Request, db: Session = Depends(get_db)):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"data": {"ok": True}}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"data": user_out(user)}


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for f in ("full_name", "phone"):
        if (v := getattr(body, f)) is not None:
            setattr(user, f, v)
    if user.profile is None:
        user.profile = CustomerProfile(user_id=user.id)
    for f in ("address", "city", "occupation"):
        if (v := getattr(body, f)) is not None:
            setattr(user.profile, f, v)
    db.commit()
    return {"data": user_out(user)}


@router.post("/change-password")
def change_password(body: PasswordIn, response: Response, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(400, "invalid_password", "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # invalidates every other session
    audit(db, user.id, "user.change_password", "user", user.id)
    db.commit()
    _set_cookie(response, user)
    return {"data": {"ok": True}}
