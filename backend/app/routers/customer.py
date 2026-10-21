import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import banking
from ..ai import assistant
from ..ai.categorizer import CATEGORIES
from ..ai.insights import forecast, insights, monthly_series
from ..db import get_db
from ..deps import require_customer
from ..errors import ApiError
from ..models import (Account, AnomalyAlert, LoanApplication, LoanStatusHistory, Notification,
                      Transaction, User, utcnow)
from ..utils import mask_account, mask_name, new_account_number, notify, paginate, to_major, to_minor

router = APIRouter(tags=["customer"])
Money = Field(gt=0, max_digits=12, decimal_places=2)


def account_out(a: Account) -> dict:
    return {"id": a.id, "account_number": a.account_number, "masked_number": mask_account(a.account_number),
            "type": a.type, "status": a.status, "balance": to_major(a.balance_minor), "currency": a.currency,
            "opened_at": a.opened_at.isoformat()}


# ---------- Accounts ----------
class OpenAccountIn(BaseModel):
    type: str = Field(pattern="^(savings|current)$")


@router.get("/accounts")
def list_accounts(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    accs = db.query(Account).filter(Account.user_id == user.id).order_by(Account.opened_at).all()
    return {"data": [account_out(a) for a in accs]}


@router.post("/accounts", status_code=201)
def open_account(body: OpenAccountIn, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    if db.query(Account).filter(Account.user_id == user.id, Account.status != "closed").count() >= 4:
        raise ApiError(422, "limit_reached", "A maximum of 4 open accounts is allowed")
    acc = Account(account_number=new_account_number(), user_id=user.id, type=body.type)
    db.add(acc)
    notify(db, user.id, "info", "New account opened", f"Your {body.type} account {mask_account(acc.account_number)} is active.")
    db.commit()
    return {"data": account_out(acc)}


@router.get("/accounts/{account_id}")
def get_account(account_id: int, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return {"data": account_out(banking.owned_account(db, user, account_id))}


# ---------- Money movement ----------
class CashIn(BaseModel):
    amount: Decimal = Money
    description: str = Field(default="", max_length=200)
    category: str | None = Field(default=None)


class TransferIn(BaseModel):
    from_account_id: int
    to_account_number: str = Field(pattern=r"^\d{12}$")
    amount: Decimal = Money
    description: str = Field(default="", max_length=200)
    category: str | None = None


def _cat(c):
    if c and c not in CATEGORIES:
        raise ApiError(422, "invalid_category", "Unknown category")
    return c


@router.post("/accounts/{account_id}/deposit", status_code=201)
def deposit(account_id: int, body: CashIn, user: User = Depends(require_customer), db: Session = Depends(get_db),
            idempotency_key: str | None = Header(default=None, max_length=64)):
    t = banking.deposit(db, user, account_id, to_minor(body.amount), body.description, idempotency_key)
    return {"data": banking.serialize_txn(t)}


@router.post("/accounts/{account_id}/withdraw", status_code=201)
def withdraw(account_id: int, body: CashIn, user: User = Depends(require_customer), db: Session = Depends(get_db),
             idempotency_key: str | None = Header(default=None, max_length=64)):
    t = banking.withdraw(db, user, account_id, to_minor(body.amount), body.description, _cat(body.category),
                         idempotency_key)
    return {"data": banking.serialize_txn(t)}


@router.post("/transfers", status_code=201)
def transfer(body: TransferIn, user: User = Depends(require_customer), db: Session = Depends(get_db),
             idempotency_key: str | None = Header(default=None, max_length=64)):
    t = banking.transfer(db, user, body.from_account_id, body.to_account_number, to_minor(body.amount),
                         body.description, _cat(body.category), idempotency_key)
    return {"data": banking.serialize_txn(t)}


@router.get("/transfers/lookup")
def lookup(account_number: str = Query(pattern=r"^\d{12}$"), user: User = Depends(require_customer),
           db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.account_number == account_number).first()
    if not acc or acc.status != "active":
        raise ApiError(404, "recipient_not_found", "No active account found with that number")
    return {"data": {"name": mask_name(acc.user.full_name), "masked_number": mask_account(acc.account_number),
                     "own_account": acc.user_id == user.id}}


# ---------- Transactions ----------
def _txn_query(db, account_ids, type_=None, status=None, category=None, start=None, end=None,
               min_amount=None, max_amount=None, q=None, sort="-created_at"):
    query = db.query(Transaction).filter(Transaction.account_id.in_(account_ids))
    if type_:
        query = query.filter(Transaction.type == type_)
    if status:
        query = query.filter(Transaction.status == status)
    if category:
        query = query.filter(Transaction.category == category)
    if start:
        query = query.filter(Transaction.created_at >= datetime.combine(start, datetime.min.time()))
    if end:
        query = query.filter(Transaction.created_at < datetime.combine(end + timedelta(days=1), datetime.min.time()))
    if min_amount is not None:
        query = query.filter(Transaction.amount_minor >= int(min_amount * 100))
    if max_amount is not None:
        query = query.filter(Transaction.amount_minor <= int(max_amount * 100))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Transaction.description.ilike(like), Transaction.reference.ilike(like)))
    col = {"created_at": Transaction.created_at, "amount": Transaction.amount_minor}.get(sort.lstrip("-"),
                                                                                      Transaction.created_at)
    return query.order_by(col.desc() if sort.startswith("-") else col.asc(), Transaction.id.desc())


@router.get("/transactions")
def list_transactions(account_id: int | None = None, type: str | None = None, status: str | None = None,
                      category: str | None = None, start: date | None = None, end: date | None = None,
                      min_amount: float | None = None, max_amount: float | None = None, q: str | None = None,
                      sort: str = "-created_at", page: int = 1, size: int = 15,
                      user: User = Depends(require_customer), db: Session = Depends(get_db)):
    ids = [a.id for a in db.query(Account.id).filter(Account.user_id == user.id)]
    if account_id is not None:
        if account_id not in ids:
            raise ApiError(404, "not_found", "Account not found")
        ids = [account_id]
    items, meta = paginate(_txn_query(db, ids, type, status, category, start, end, min_amount, max_amount, q, sort),
                           page, size)
    return {"data": [banking.serialize_txn(t) for t in items], "meta": meta}


@router.get("/categories")
def categories():
    return {"data": CATEGORIES}


# ---------- Statements ----------
@router.get("/accounts/{account_id}/statement")
def statement(account_id: int, start: date, end: date, format: str = Query("pdf", pattern="^(pdf|csv)$"),
              user: User = Depends(require_customer), db: Session = Depends(get_db)):
    acc = banking.owned_account(db, user, account_id)
    if end < start or (end - start).days > 366:
        raise ApiError(422, "invalid_range", "Choose a date range of up to one year")
    txns = _txn_query(db, [acc.id], start=start, end=end, sort="created_at").all()
    fname = f"statement_{acc.account_number[-4:]}_{start}_{end}.{format}"
    headers = {"Content-Disposition": f'attachment; filename="{fname}"'}
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Date", "Reference", "Description", "Category", "Type", "Debit", "Credit", "Balance", "Status"])
        for t in txns:
            s = banking.serialize_txn(t)
            w.writerow([t.created_at.strftime("%Y-%m-%d %H:%M"), t.reference, t.description, t.category, t.type,
                        s["amount"] if s["direction"] == "debit" else "", s["amount"] if s["direction"] == "credit" else "",
                        s["balance_after"], t.status])
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers=headers)
    from ..statements import build_pdf
    return StreamingResponse(io.BytesIO(build_pdf(user, acc, txns, start, end)), media_type="application/pdf",
                             headers=headers)


# ---------- Dashboard ----------
@router.get("/dashboard/customer")
def customer_dashboard(days: int = Query(30, ge=7, le=365), user: User = Depends(require_customer),
                       db: Session = Depends(get_db)):
    accs = db.query(Account).filter(Account.user_id == user.id).all()
    ids = [a.id for a in accs]
    ins = insights(db, user.id, days)
    recent = (db.query(Transaction).filter(Transaction.account_id.in_(ids))
              .order_by(Transaction.created_at.desc()).limit(6).all()) if ids else []
    # daily balance trend reconstructed from balance_after on each transaction
    since = utcnow() - timedelta(days=days)
    trend_rows = (db.query(func.date(Transaction.created_at), Transaction.account_id, Transaction.balance_after_minor)
                  .filter(Transaction.account_id.in_(ids), Transaction.created_at >= since)
                  .order_by(Transaction.created_at).all()) if ids else []
    last, trend = {}, {}
    for d, aid, bal in trend_rows:
        last[aid] = bal
        trend[d] = sum(last.values())
    loans = db.query(LoanApplication).filter(LoanApplication.user_id == user.id).order_by(
        LoanApplication.created_at.desc()).limit(3).all()
    unread = db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).count()
    alerts = db.query(AnomalyAlert).filter(AnomalyAlert.user_id == user.id, AnomalyAlert.status == "open").count()
    return {"data": {
        "total_balance": to_major(sum(a.balance_minor for a in accs if a.status != "closed")),
        "accounts": [account_out(a) for a in accs],
        "summary": ins["summary"], "categories": ins["categories"][:6],
        "monthly": monthly_series(db, user.id, 6),
        "balance_trend": [{"date": d, "balance": v / 100} for d, v in trend.items()],
        "recent": [banking.serialize_txn(t) for t in recent],
        "loans": [loan_out(l) for l in loans], "unread_notifications": unread, "open_alerts": alerts,
    }}


# ---------- Notifications ----------
@router.get("/notifications")
def notifications(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    rows = db.query(Notification).filter(Notification.user_id == user.id).order_by(
        Notification.created_at.desc()).limit(50).all()
    return {"data": [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "is_read": n.is_read,
                      "created_at": n.created_at.isoformat()} for n in rows]}


@router.post("/notifications/read-all")
def read_all(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id).update({"is_read": True})
    db.commit()
    return {"data": {"ok": True}}


# ---------- Loans ----------
LOAN_RATES = {"personal": 11.5, "home": 8.6, "car": 9.2, "education": 9.8, "business": 12.5}


class LoanIn(BaseModel):
    account_id: int
    loan_type: str = Field(pattern="^(personal|home|car|education|business)$")
    amount: Decimal = Field(gt=0, le=Decimal("5000000"), max_digits=12, decimal_places=2)
    term_months: int = Field(ge=6, le=360)
    purpose: str = Field(min_length=5, max_length=300)
    monthly_income: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    employment_type: str = Field(pattern="^(salaried|self_employed|student|other)$")


def emi(principal: float, annual_rate: float, months: int) -> float:
    r = annual_rate / 12 / 100
    return principal * r * (1 + r) ** months / ((1 + r) ** months - 1)


def eligibility(db, user, body: LoanIn) -> tuple[int, list[str], float]:
    """Educational estimate only — transparent points model, not a lending decision."""
    rate = LOAN_RATES[body.loan_type]
    e = emi(float(body.amount), rate, body.term_months)
    income = float(body.monthly_income)
    dti = e / income
    score, reasons = 50, []
    if dti <= 0.3:
        score += 25; reasons.append(f"EMI ₹{e:,.0f} is {dti*100:.0f}% of income (≤30% is comfortable)")
    elif dti <= 0.5:
        score += 5; reasons.append(f"EMI ₹{e:,.0f} is {dti*100:.0f}% of income (moderate burden)")
    else:
        score -= 30; reasons.append(f"EMI ₹{e:,.0f} is {dti*100:.0f}% of income (above 50% is high risk)")
    emp = {"salaried": 10, "self_employed": 5, "student": -10, "other": -5}[body.employment_type]
    score += emp
    reasons.append(f"Employment type '{body.employment_type.replace('_', ' ')}' ({'+' if emp >= 0 else ''}{emp})")
    bal = sum(a.balance_minor for a in user.accounts) / 100
    if bal >= float(body.amount) * 0.2:
        score += 10; reasons.append(f"Balance ₹{bal:,.0f} covers ≥20% of requested amount")
    elif bal < e * 2:
        score -= 10; reasons.append("Balance is below two months of EMI")
    age_days = (utcnow() - min((a.opened_at for a in user.accounts), default=utcnow())).days
    if age_days >= 180:
        score += 5; reasons.append(f"Banking relationship of {age_days // 30} months")
    open_alerts = db.query(AnomalyAlert).filter(AnomalyAlert.user_id == user.id, AnomalyAlert.status == "open").count()
    if open_alerts:
        score -= 10; reasons.append(f"{open_alerts} unresolved account alert(s)")
    return max(0, min(100, score)), reasons, round(e, 2)


def loan_out(l: LoanApplication, detail=False) -> dict:
    out = {"id": l.id, "loan_type": l.loan_type, "amount": to_major(l.amount_minor), "term_months": l.term_months,
           "interest_rate": l.interest_rate, "emi": round(emi(l.amount_minor / 100, l.interest_rate, l.term_months), 2),
           "purpose": l.purpose, "status": l.status, "eligibility_score": l.eligibility_score,
           "eligibility_reasons": l.eligibility_reasons, "employment_type": l.employment_type,
           "monthly_income": to_major(l.monthly_income_minor), "account": mask_account(l.account.account_number),
           "review_comment": l.review_comment, "created_at": l.created_at.isoformat(),
           "reviewed_at": l.reviewed_at.isoformat() if l.reviewed_at else None,
           "applicant": l.user.full_name, "applicant_email": l.user.email}
    if detail:
        out["history"] = [{"from": h.from_status, "to": h.to_status, "comment": h.comment,
                           "at": h.created_at.isoformat()} for h in l.history]
    return out


@router.post("/loans/estimate")
def loan_estimate(body: LoanIn, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    banking.owned_account(db, user, body.account_id)
    score, reasons, e = eligibility(db, user, body)
    band = "Strong" if score >= 75 else "Fair" if score >= 55 else "Weak"
    return {"data": {"score": score, "band": band, "reasons": reasons, "emi": e,
                     "interest_rate": LOAN_RATES[body.loan_type],
                     "disclaimer": "Educational estimate only — not a real lending decision."}}


@router.post("/loans", status_code=201)
def apply_loan(body: LoanIn, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    acc = banking.owned_account(db, user, body.account_id)
    if acc.status != "active":
        raise ApiError(409, "account_inactive", "Loans can only be credited to an active account")
    if db.query(LoanApplication).filter(LoanApplication.user_id == user.id, LoanApplication.status == "pending").count() >= 2:
        raise ApiError(409, "too_many_pending", "You already have 2 pending applications")
    score, reasons, _ = eligibility(db, user, body)
    loan = LoanApplication(user_id=user.id, account_id=acc.id, loan_type=body.loan_type,
                           amount_minor=to_minor(body.amount), term_months=body.term_months,
                           interest_rate=LOAN_RATES[body.loan_type], purpose=body.purpose,
                           monthly_income_minor=to_minor(body.monthly_income), employment_type=body.employment_type,
                           eligibility_score=score, eligibility_reasons=reasons)
    db.add(loan)
    db.flush()
    db.add(LoanStatusHistory(loan_id=loan.id, from_status=None, to_status="pending", changed_by=user.id,
                             comment="Application submitted"))
    notify(db, user.id, "loan", "Loan application received",
           f"Your {body.loan_type} loan application #{loan.id} for ₹{body.amount:,.2f} is under review.")
    db.commit()
    return {"data": loan_out(loan, True)}


@router.get("/loans")
def my_loans(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    rows = db.query(LoanApplication).filter(LoanApplication.user_id == user.id).order_by(
        LoanApplication.created_at.desc()).all()
    return {"data": [loan_out(l, True) for l in rows]}


# ---------- AI ----------
class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=500)


@router.get("/ai/insights")
def ai_insights(days: int = Query(30, ge=7, le=365), user: User = Depends(require_customer),
                db: Session = Depends(get_db)):
    data = insights(db, user.id, days)
    data["monthly"] = monthly_series(db, user.id, 6)
    return {"data": data}


@router.get("/ai/forecast")
def ai_forecast(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return {"data": forecast(db, user.id)}


@router.get("/ai/alerts")
def my_alerts(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    rows = db.query(AnomalyAlert).filter(AnomalyAlert.user_id == user.id).order_by(AnomalyAlert.created_at.desc()).all()
    return {"data": [{"id": a.id, "risk_score": a.risk_score, "severity": a.severity, "reasons": a.reasons,
                      "status": a.status, "created_at": a.created_at.isoformat(),
                      "transaction": banking.serialize_txn(a.transaction)} for a in rows]}


@router.post("/ai/assistant")
def ask(body: AskIn, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return {"data": assistant.answer(db, user, body.question)}
