"""Money movement. Every operation is one database transaction; balances only change
through conditional UPDATEs so concurrent requests can never overdraw an account."""
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .ai.categorizer import categorize
from .errors import ApiError
from .models import Account, Transaction, User
from .utils import mask_account, new_reference, notify, to_major

MAX_SINGLE_TXN_MINOR = 10_00_000_00  # ₹10,00,000 demo limit per operation


def serialize_txn(t: Transaction) -> dict:
    return {
        "id": t.id, "reference": t.reference, "account_id": t.account_id,
        "account_number": mask_account(t.account.account_number) if t.account else None,
        "type": t.type, "amount": to_major(t.amount_minor),
        "balance_after": to_major(t.balance_after_minor), "status": t.status,
        "category": t.category, "description": t.description,
        "counterparty": mask_account(t.counterparty.account_number) if t.counterparty else None,
        "counterparty_name": t.counterparty.user.full_name if t.counterparty else None,
        "direction": "credit" if t.type in ("deposit", "transfer_in", "loan_disbursement") else "debit",
        "created_at": t.created_at.isoformat(),
    }


def owned_account(db: Session, user: User, account_id: int) -> Account:
    acc = db.query(Account).filter(Account.id == account_id, Account.user_id == user.id).first()
    if not acc:
        raise ApiError(404, "not_found", "Account not found")
    return acc


def _check_limits(amount_minor: int):
    if amount_minor <= 0:
        raise ApiError(422, "invalid_amount", "Amount must be greater than zero")
    if amount_minor > MAX_SINGLE_TXN_MINOR:
        raise ApiError(422, "limit_exceeded", "Amount exceeds the ₹10,00,000 per-transaction demo limit")


def _replay(db: Session, user: User, key: str | None):
    if not key:
        return None
    return (db.query(Transaction)
            .filter(Transaction.initiated_by == user.id, Transaction.idempotency_key == key).first())


def _credit(db, acc_id, amount):
    res = db.execute(update(Account)
                     .where(Account.id == acc_id, Account.status == "active")
                     .values(balance_minor=Account.balance_minor + amount))
    if res.rowcount != 1:
        raise ApiError(409, "account_inactive", "Destination account is not active")


def _debit(db, acc_id, amount):
    res = db.execute(update(Account)
                     .where(Account.id == acc_id, Account.status == "active",
                            Account.balance_minor >= amount)
                     .values(balance_minor=Account.balance_minor - amount))
    if res.rowcount != 1:
        acc = db.get(Account, acc_id)
        if acc.status != "active":
            raise ApiError(409, "account_inactive", f"Account is {acc.status}")
        raise ApiError(409, "insufficient_funds", "Insufficient balance for this transaction")


def _balance(db, acc_id) -> int:
    return db.query(Account.balance_minor).filter(Account.id == acc_id).scalar()


def _commit(db: Session):
    try:
        db.commit()
        db.expire_all()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "duplicate_request", "This request was already processed")


def deposit(db: Session, user: User, account_id: int, amount_minor: int, description: str,
            key: str | None) -> Transaction:
    _check_limits(amount_minor)
    if (prev := _replay(db, user, key)):
        return prev
    acc = owned_account(db, user, account_id)
    try:
        _credit(db, acc.id, amount_minor)
        t = Transaction(reference=new_reference(), account_id=acc.id, type="deposit",
                        amount_minor=amount_minor, balance_after_minor=_balance(db, acc.id),
                        category="Income", description=description or "Cash deposit",
                        initiated_by=user.id, idempotency_key=key)
        db.add(t)
        _commit(db)
    except ApiError:
        db.rollback()
        raise
    _post_process(db, t)
    return t


def withdraw(db: Session, user: User, account_id: int, amount_minor: int, description: str,
             category: str | None, key: str | None) -> Transaction:
    _check_limits(amount_minor)
    if (prev := _replay(db, user, key)):
        return prev
    acc = owned_account(db, user, account_id)
    try:
        _debit(db, acc.id, amount_minor)
        desc = description or "Cash withdrawal"
        t = Transaction(reference=new_reference(), account_id=acc.id, type="withdrawal",
                        amount_minor=amount_minor, balance_after_minor=_balance(db, acc.id),
                        category=category or categorize(desc, default="Cash"), description=desc,
                        initiated_by=user.id, idempotency_key=key)
        db.add(t)
        _commit(db)
    except ApiError:
        db.rollback()
        raise
    _post_process(db, t)
    return t


def transfer(db: Session, user: User, from_account_id: int, to_account_number: str,
             amount_minor: int, description: str, category: str | None, key: str | None) -> Transaction:
    _check_limits(amount_minor)
    if (prev := _replay(db, user, key)):
        return prev
    src = owned_account(db, user, from_account_id)
    dst = db.query(Account).filter(Account.account_number == to_account_number).first()
    if not dst:
        raise ApiError(404, "recipient_not_found", "No account found with that account number")
    if dst.id == src.id:
        raise ApiError(422, "same_account", "Cannot transfer to the same account")
    ref = new_reference("TRF")
    desc = description or f"Transfer to {dst.user.full_name}"
    try:
        _debit(db, src.id, amount_minor)
        _credit(db, dst.id, amount_minor)
        out = Transaction(reference=ref, account_id=src.id, type="transfer_out",
                          amount_minor=amount_minor, balance_after_minor=_balance(db, src.id),
                          category=category or categorize(desc, default="Transfers"), description=desc,
                          counterparty_account_id=dst.id, initiated_by=user.id, idempotency_key=key)
        inc = Transaction(reference=ref, account_id=dst.id, type="transfer_in",
                          amount_minor=amount_minor, balance_after_minor=_balance(db, dst.id),
                          category="Transfers", description=f"Transfer from {user.full_name}",
                          counterparty_account_id=src.id, initiated_by=user.id)
        db.add_all([out, inc])
        notify(db, dst.user_id, "credit", "Money received",
               f"₹{amount_minor / 100:,.2f} received from {user.full_name} ({mask_account(src.account_number)})")
        _commit(db)
    except ApiError:
        db.rollback()  # neither side is applied
        raise
    _post_process(db, out)
    return out


def disburse_loan(db: Session, loan) -> Transaction:
    """Called inside the admin's approval transaction; caller commits."""
    _credit(db, loan.account_id, loan.amount_minor)
    t = Transaction(reference=new_reference("LN"), account_id=loan.account_id, type="loan_disbursement",
                    amount_minor=loan.amount_minor, balance_after_minor=_balance(db, loan.account_id),
                    category="Loan", description=f"{loan.loan_type.title()} loan disbursement #{loan.id}")
    db.add(t)
    return t


def _post_process(db: Session, t: Transaction):
    from .ai.anomaly import score_and_alert
    try:
        score_and_alert(db, t)
        db.commit()
    except Exception:
        db.rollback()  # detection must never break a completed payment
