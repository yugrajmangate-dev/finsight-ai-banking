from datetime import datetime, timezone

from sqlalchemy import (JSON, BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey,
                        Index, Integer, String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin','customer')", name="ck_user_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(10), default="customer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    profile: Mapped["CustomerProfile"] = relationship(back_populates="user", uselist=False)
    accounts: Mapped[list["Account"]] = relationship(back_populates="user")


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(80))
    date_of_birth: Mapped[str | None] = mapped_column(String(10))
    occupation: Mapped[str | None] = mapped_column(String(80))
    monthly_income_minor: Mapped[int] = mapped_column(BigInteger, default=0)

    user: Mapped[User] = relationship(back_populates="profile")


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("balance_minor >= 0", name="ck_balance_nonneg"),
        CheckConstraint("type IN ('savings','current')", name="ck_account_type"),
        CheckConstraint("status IN ('active','frozen','closed')", name="ck_account_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_number: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default="active")
    balance_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="accounts")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_amount_positive"),
        CheckConstraint(
            "type IN ('deposit','withdrawal','transfer_in','transfer_out','loan_disbursement')",
            name="ck_txn_type"),
        UniqueConstraint("initiated_by", "idempotency_key", name="uq_idempotency"),
        Index("ix_txn_account_created", "account_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(24), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    type: Mapped[str] = mapped_column(String(20))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    balance_after_minor: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10), default="completed")
    category: Mapped[str] = mapped_column(String(30), default="Other", index=True)
    description: Mapped[str] = mapped_column(String(200), default="")
    counterparty_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    initiated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    counterparty: Mapped[Account | None] = relationship(foreign_keys=[counterparty_account_id])


class LoanApplication(Base):
    __tablename__ = "loan_applications"
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected')", name="ck_loan_status"),
        CheckConstraint("amount_minor > 0", name="ck_loan_amount"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    loan_type: Mapped[str] = mapped_column(String(20))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    term_months: Mapped[int] = mapped_column(Integer)
    interest_rate: Mapped[float] = mapped_column(default=10.5)  # display-only annual %
    purpose: Mapped[str] = mapped_column(String(300))
    monthly_income_minor: Mapped[int] = mapped_column(BigInteger)
    employment_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    eligibility_score: Mapped[int] = mapped_column(Integer, default=0)
    eligibility_reasons: Mapped[list] = mapped_column(JSON, default=list)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    review_comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    account: Mapped[Account] = relationship()
    history: Mapped[list["LoanStatusHistory"]] = relationship(
        order_by="LoanStatusHistory.created_at", cascade="all, delete-orphan")


class LoanStatusHistory(Base):
    __tablename__ = "loan_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loan_applications.id", ondelete="CASCADE"))
    from_status: Mapped[str | None] = mapped_column(String(10))
    to_status: Mapped[str] = mapped_column(String(10))
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AnomalyAlert(Base):
    __tablename__ = "anomaly_alerts"
    __table_args__ = (
        CheckConstraint("severity IN ('low','medium','high')", name="ck_alert_severity"),
        CheckConstraint("status IN ('open','reviewed','dismissed','escalated')", name="ck_alert_status"),
        Index("ix_alert_status_sev", "status", "severity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    risk_score: Mapped[int] = mapped_column(Integer)
    severity: Mapped[str] = mapped_column(String(10))
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    model_version: Mapped[str] = mapped_column(String(20), default="hybrid-v1")
    status: Mapped[str] = mapped_column(String(10), default="open")
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    transaction: Mapped[Transaction] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notif_user_read", "user_id", "is_read"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(String(400))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50))
    entity_type: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    actor: Mapped[User | None] = relationship()
