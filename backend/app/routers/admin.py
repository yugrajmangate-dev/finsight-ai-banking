from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from .. import banking
from ..db import get_db
from ..deps import require_admin
from ..errors import ApiError
from ..models import (Account, AnomalyAlert, AuditLog, LoanApplication, LoanStatusHistory, Transaction, User,
                      utcnow)
from ..utils import audit, notify, paginate, to_major
from .customer import _txn_query, account_out, loan_out

router = APIRouter(prefix="/admin", tags=["admin"])
CREDIT = ("deposit", "transfer_in", "loan_disbursement")


def _ip(r: Request):
    return r.client.host if r.client else None


@router.get("/dashboard")
def dashboard(days: int = Query(30, ge=7, le=365), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    since = utcnow() - timedelta(days=days)
    customers = db.query(User).filter(User.role == "customer").count()
    active_customers = db.query(User).filter(User.role == "customer", User.is_active.is_(True)).count()
    status_counts = dict(db.query(Account.status, func.count()).group_by(Account.status).all())
    total_balance = db.query(func.coalesce(func.sum(Account.balance_minor), 0)).filter(Account.status != "closed").scalar()
    by_type = dict(db.query(Transaction.type, func.coalesce(func.sum(Transaction.amount_minor), 0))
                   .filter(Transaction.created_at >= since).group_by(Transaction.type).all())
    txn_count = db.query(Transaction).filter(Transaction.created_at >= since,
                                             Transaction.type != "transfer_in").count()
    daily = (db.query(func.date(Transaction.created_at).label("d"),
                      func.sum(case((Transaction.type.in_(CREDIT), Transaction.amount_minor), else_=0)),
                      func.sum(case((Transaction.type.in_(("withdrawal", "transfer_out")), Transaction.amount_minor), else_=0)),
                      func.count())
             .filter(Transaction.created_at >= since).group_by("d").order_by("d").all())
    loans = dict(db.query(LoanApplication.status, func.count()).group_by(LoanApplication.status).all())
    loan_amt = db.query(func.coalesce(func.sum(LoanApplication.amount_minor), 0)).filter(
        LoanApplication.status == "approved").scalar()
    alerts = dict(db.query(AnomalyAlert.severity, func.count()).filter(AnomalyAlert.status == "open")
                  .group_by(AnomalyAlert.severity).all())
    acct_types = dict(db.query(Account.type, func.count()).group_by(Account.type).all())
    cats = (db.query(Transaction.category, func.sum(Transaction.amount_minor))
            .filter(Transaction.created_at >= since, Transaction.type.in_(("withdrawal", "transfer_out")))
            .group_by(Transaction.category).order_by(func.sum(Transaction.amount_minor).desc()).limit(8).all())
    recent = db.query(Transaction).filter(Transaction.type != "transfer_in").order_by(
        Transaction.created_at.desc()).limit(8).all()
    top_alerts = db.query(AnomalyAlert).filter(AnomalyAlert.status == "open").order_by(
        AnomalyAlert.risk_score.desc()).limit(5).all()
    return {"data": {
        "customers": customers, "active_customers": active_customers,
        "accounts": {"total": sum(status_counts.values()), **{k: status_counts.get(k, 0) for k in ("active", "frozen", "closed")}},
        "account_types": acct_types,
        "total_balance": to_major(total_balance),
        "deposits": to_major(by_type.get("deposit", 0)), "withdrawals": to_major(by_type.get("withdrawal", 0)),
        "transfers": to_major(by_type.get("transfer_out", 0)), "loan_disbursed": to_major(by_type.get("loan_disbursement", 0)),
        "transaction_count": txn_count,
        "daily": [{"date": d, "inflow": to_major(i), "outflow": to_major(o), "count": c} for d, i, o, c in daily],
        "loans": {k: loans.get(k, 0) for k in ("pending", "approved", "rejected")}, "approved_loan_amount": to_major(loan_amt),
        "alerts": {k: alerts.get(k, 0) for k in ("high", "medium", "low")},
        "categories": [{"category": c, "amount": to_major(v)} for c, v in cats],
        "recent": [banking.serialize_txn(t) for t in recent],
        "top_alerts": [alert_out(a) for a in top_alerts],
    }}


# ---------- Customers ----------
@router.get("/customers")
def customers(q: str | None = None, status: str | None = None, page: int = 1, size: int = 10,
              _: User = Depends(require_admin), db: Session = Depends(get_db)):
    bal = (db.query(Account.user_id, func.sum(Account.balance_minor).label("bal"), func.count().label("n"))
           .group_by(Account.user_id).subquery())
    query = (db.query(User, bal.c.bal, bal.c.n).outerjoin(bal, bal.c.user_id == User.id)
             .filter(User.role == "customer"))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.full_name.ilike(like), User.email.ilike(like), User.phone.ilike(like)))
    if status in ("active", "inactive"):
        query = query.filter(User.is_active.is_(status == "active"))
    rows, meta = paginate(query.order_by(User.created_at.desc()), page, size)
    return {"data": [{"id": u.id, "full_name": u.full_name, "email": u.email, "phone": u.phone,
                      "is_active": u.is_active, "city": u.profile.city if u.profile else None,
                      "total_balance": to_major(b or 0), "accounts": n or 0, "created_at": u.created_at.isoformat()}
                     for u, b, n in rows], "meta": meta}


@router.get("/customers/{user_id}")
def customer_detail(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or u.role != "customer":
        raise ApiError(404, "not_found", "Customer not found")
    from .auth import user_out
    ids = [a.id for a in u.accounts]
    recent = db.query(Transaction).filter(Transaction.account_id.in_(ids)).order_by(
        Transaction.created_at.desc()).limit(10).all() if ids else []
    return {"data": {**user_out(u), "accounts": [account_out(a) for a in u.accounts],
                     "recent": [banking.serialize_txn(t) for t in recent]}}


class CustomerStatusIn(BaseModel):
    is_active: bool


@router.patch("/customers/{user_id}")
def set_customer_status(user_id: int, body: CustomerStatusIn, request: Request, admin: User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or u.role != "customer":
        raise ApiError(404, "not_found", "Customer not found")
    u.is_active = body.is_active
    u.token_version += 1  # sign out immediately
    audit(db, admin.id, "customer.activate" if body.is_active else "customer.deactivate", "user", u.id, ip=_ip(request))
    db.commit()
    return {"data": {"id": u.id, "is_active": u.is_active}}


# ---------- Accounts ----------
@router.get("/accounts")
def accounts(q: str | None = None, status: str | None = None, type: str | None = None, page: int = 1, size: int = 10,
             _: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(Account).join(User)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Account.account_number.ilike(like), User.full_name.ilike(like)))
    if status:
        query = query.filter(Account.status == status)
    if type:
        query = query.filter(Account.type == type)
    rows, meta = paginate(query.order_by(Account.balance_minor.desc()), page, size)
    return {"data": [{**account_out(a), "owner": a.user.full_name, "owner_email": a.user.email} for a in rows],
            "meta": meta}


class AccountStatusIn(BaseModel):
    status: str = Field(pattern="^(active|frozen|closed)$")
    reason: str = Field(default="", max_length=200)


@router.patch("/accounts/{account_id}/status")
def set_account_status(account_id: int, body: AccountStatusIn, request: Request, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc:
        raise ApiError(404, "not_found", "Account not found")
    if acc.status == "closed":
        raise ApiError(409, "account_closed", "Closed accounts cannot be changed")
    if body.status == "closed" and acc.balance_minor != 0:
        raise ApiError(409, "balance_not_zero", "Only accounts with a zero balance can be closed")
    old, acc.status = acc.status, body.status
    audit(db, admin.id, f"account.{body.status}", "account", acc.id,
          {"from": old, "to": body.status, "reason": body.reason}, _ip(request))
    notify(db, acc.user_id, "security", f"Account {body.status}",
           f"Your account ending {acc.account_number[-4:]} is now {body.status}. {body.reason}".strip())
    db.commit()
    return {"data": account_out(acc)}


# ---------- Transactions ----------
@router.get("/transactions")
def transactions(type: str | None = None, status: str | None = None, category: str | None = None,
                 start: date | None = None, end: date | None = None, min_amount: float | None = None,
                 max_amount: float | None = None, q: str | None = None, sort: str = "-created_at", page: int = 1,
                 size: int = 15, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    ids = [a for (a,) in db.query(Account.id)]
    items, meta = paginate(_txn_query(db, ids, type, status, category, start, end, min_amount, max_amount, q, sort),
                           page, size)
    return {"data": [{**banking.serialize_txn(t), "owner": t.account.user.full_name} for t in items], "meta": meta}


# ---------- Loans ----------
@router.get("/loans")
def loans(status: str | None = None, q: str | None = None, page: int = 1, size: int = 10,
          _: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(LoanApplication).join(User, LoanApplication.user_id == User.id)
    if status:
        query = query.filter(LoanApplication.status == status)
    if q:
        query = query.filter(User.full_name.ilike(f"%{q}%"))
    rows, meta = paginate(query.order_by(LoanApplication.created_at.desc()), page, size)
    return {"data": [loan_out(l, True) for l in rows], "meta": meta}


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    comment: str = Field(min_length=3, max_length=500)


@router.post("/loans/{loan_id}/decision")
def decide(loan_id: int, body: DecisionIn, request: Request, admin: User = Depends(require_admin),
           db: Session = Depends(get_db)):
    loan = db.get(LoanApplication, loan_id)
    if not loan:
        raise ApiError(404, "not_found", "Loan application not found")
    if loan.status != "pending":
        raise ApiError(409, "already_decided", f"This application was already {loan.status}")
    loan.status, loan.reviewed_by, loan.review_comment, loan.reviewed_at = body.decision, admin.id, body.comment, utcnow()
    db.add(LoanStatusHistory(loan_id=loan.id, from_status="pending", to_status=body.decision, changed_by=admin.id,
                             comment=body.comment))
    if body.decision == "approved":
        banking.disburse_loan(db, loan)
    notify(db, loan.user_id, "loan", f"Loan {body.decision}",
           f"Your {loan.loan_type} loan #{loan.id} for ₹{loan.amount_minor / 100:,.2f} was {body.decision}. {body.comment}")
    audit(db, admin.id, f"loan.{body.decision}", "loan", loan.id, {"comment": body.comment}, _ip(request))
    db.commit()
    return {"data": loan_out(loan, True)}


# ---------- AI alerts ----------
def alert_out(a: AnomalyAlert) -> dict:
    return {"id": a.id, "risk_score": a.risk_score, "severity": a.severity, "reasons": a.reasons,
            "status": a.status, "model_version": a.model_version, "created_at": a.created_at.isoformat(),
            "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
            "customer": a.user.full_name, "customer_id": a.user_id, "transaction": banking.serialize_txn(a.transaction)}


@router.get("/alerts")
def alerts(status: str | None = None, severity: str | None = None, page: int = 1, size: int = 10,
           _: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(AnomalyAlert)
    if status:
        query = query.filter(AnomalyAlert.status == status)
    if severity:
        query = query.filter(AnomalyAlert.severity == severity)
    rows, meta = paginate(query.order_by(AnomalyAlert.created_at.desc()), page, size)
    stats = dict(db.query(AnomalyAlert.status, func.count()).group_by(AnomalyAlert.status).all())
    return {"data": [alert_out(a) for a in rows], "meta": {**meta, "by_status": stats}}


class AlertReviewIn(BaseModel):
    status: str = Field(pattern="^(reviewed|dismissed|escalated)$")
    freeze_account: bool = False


@router.patch("/alerts/{alert_id}")
def review_alert(alert_id: int, body: AlertReviewIn, request: Request, admin: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    a = db.get(AnomalyAlert, alert_id)
    if not a:
        raise ApiError(404, "not_found", "Alert not found")
    a.status, a.reviewed_by, a.reviewed_at = body.status, admin.id, utcnow()
    if body.freeze_account and a.transaction.account.status == "active":
        a.transaction.account.status = "frozen"
        notify(db, a.user_id, "security", "Account temporarily frozen",
               f"Account ending {a.transaction.account.account_number[-4:]} was frozen pending a security review.")
    audit(db, admin.id, f"alert.{body.status}", "alert", a.id, {"freeze": body.freeze_account}, _ip(request))
    db.commit()
    return {"data": alert_out(a)}


# ---------- Audit ----------
@router.get("/audit-logs")
def audit_logs(page: int = 1, size: int = 20, action: str | None = None, _: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action.ilike(f"{action}%"))
    rows, meta = paginate(query.order_by(AuditLog.created_at.desc()), page, size)
    return {"data": [{"id": l.id, "actor": l.actor.full_name if l.actor else "system", "action": l.action,
                      "entity": f"{l.entity_type}#{l.entity_id}" if l.entity_id else l.entity_type,
                      "details": l.details, "ip": l.ip, "created_at": l.created_at.isoformat()} for l in rows],
            "meta": meta}


@router.get("/ai-analytics")
def ai_analytics(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    from collections import Counter

    from ..ai.anomaly import ALERT_THRESHOLD, MODEL_VERSION, _load_model
    rows = db.query(AnomalyAlert).all()
    reason_kinds = Counter()
    for a in rows:
        for r in a.reasons:
            key = ("Amount vs history" if r.startswith("Amount is") else "Statistical outlier" if r.startswith("Statistical")
                   else "Unusual hour" if r.startswith("Initiated") else "High velocity" if "debits within" in r
                   else "New beneficiary" if "beneficiary" in r else "Balance drain" if r.startswith("Moves")
                   else "Rapid in-out" if r.startswith("Funds moved") else "Isolation Forest" if "Isolation" in r else "Other")
            reason_kinds[key] += 1
    buckets = Counter(min(a.risk_score // 10 * 10, 90) for a in rows)
    daily = Counter(a.created_at.date().isoformat() for a in rows)
    scanned = db.query(Transaction).filter(Transaction.type.in_(("withdrawal", "transfer_out"))).count()
    model = _load_model()
    by_customer = Counter(a.user.full_name for a in rows).most_common(6)
    return {"data": {
        "total_alerts": len(rows), "scanned": scanned,
        "alert_rate": round(len(rows) / scanned * 100, 2) if scanned else 0,
        "by_severity": Counter(a.severity for a in rows), "by_status": Counter(a.status for a in rows),
        "reasons": [{"reason": k, "count": v} for k, v in reason_kinds.most_common()],
        "score_distribution": [{"bucket": f"{b}-{b + 9}", "count": buckets.get(b, 0)} for b in range(40, 100, 10)],
        "daily": [{"date": d, "count": c} for d, c in sorted(daily.items())],
        "top_customers": [{"customer": n, "alerts": c} for n, c in by_customer],
        "model": {"version": MODEL_VERSION, "threshold": ALERT_THRESHOLD,
                  "algorithm": "Rules + robust z-score (median/MAD) + Isolation Forest",
                  "trained": model is not None,
                  "estimators": getattr(model, "n_estimators", None),
                  "contamination": getattr(model, "contamination", None),
                  "n_features": getattr(model, "n_features_in_", None),
                  "features": ["log(amount)", "hour of day", "weekday", "debits in last 1h", "debits in last 24h",
                               "amount ÷ category median", "new beneficiary", "balance drain ratio"]},
    }}
