import secrets
from datetime import datetime, timedelta
from decimal import Decimal

from .models import AuditLog, Notification, utcnow


def to_minor(amount: Decimal) -> int:
    return int((amount * 100).to_integral_exact())


def to_major(minor: int) -> float:
    # For JSON output only; all arithmetic stays in integer paise.
    return round(minor / 100, 2)


def new_reference(prefix: str = "TXN") -> str:
    return f"{prefix}{utcnow():%y%m%d}{secrets.token_hex(4).upper()}"


def new_account_number() -> str:
    return "50" + "".join(str(secrets.randbelow(10)) for _ in range(10))


def mask_account(number: str) -> str:
    return "XXXX XXXX " + number[-4:]


def mask_name(name: str) -> str:
    return " ".join(p[0] + "*" * (len(p) - 1) if len(p) > 1 else p for p in name.split())


def period_start(period: str) -> datetime:
    days = {"7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365}.get(period, 30)
    return utcnow() - timedelta(days=days)


def audit(db, actor_id, action, entity_type, entity_id=None, details=None, ip=None):
    db.add(AuditLog(actor_id=actor_id, action=action, entity_type=entity_type,
                    entity_id=entity_id, details=details or {}, ip=ip))


def notify(db, user_id, kind, title, body):
    db.add(Notification(user_id=user_id, kind=kind, title=title, body=body))


def paginate(query, page: int, size: int):
    size = max(1, min(size, 100))
    page = max(1, page)
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    return items, {"page": page, "size": size, "total": total, "pages": max(1, -(-total // size))}
