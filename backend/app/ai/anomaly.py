"""Hybrid suspicious-transaction detection.

Score (0-100) = explainable rules + robust statistics (median/MAD z-score)
                + an unsupervised IsolationForest signal.
Results are *alerts for human review*, never confirmed fraud.
"""
import math
from datetime import timedelta
from statistics import median

import joblib
import numpy as np

from ..config import MODEL_PATH
from ..models import Account, AnomalyAlert, Transaction
from ..utils import notify

DEBIT_TYPES = ("withdrawal", "transfer_out")
ALERT_THRESHOLD = 40
MODEL_VERSION = "hybrid-v1"
_model_cache = {"model": None, "loaded": False}


def _load_model():
    if not _model_cache["loaded"]:
        _model_cache["model"] = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None
        _model_cache["loaded"] = True
    return _model_cache["model"]


def reset_model_cache():
    _model_cache.update(model=None, loaded=False)


def compute_features(t, history: list) -> dict:
    """history: earlier transactions of the same customer (any account), oldest first."""
    amt = t.amount_minor
    window = [h for h in history if h.created_at >= t.created_at - timedelta(days=90)]
    all_debits = [h for h in window if h.type in DEBIT_TYPES]
    same_cat = [h.amount_minor for h in all_debits if h.category == t.category]
    # Compare rent with rent, groceries with groceries; fall back to all debits.
    debits = same_cat if len(same_cat) >= 2 else [h.amount_minor for h in all_debits]
    med = median(debits) if debits else amt
    mad = median([abs(d - med) for d in debits]) if len(debits) >= 5 else 0
    z = (amt - med) / (1.4826 * mad) if mad else 0.0
    cnt_1h = sum(1 for h in window if h.type in DEBIT_TYPES and h.created_at >= t.created_at - timedelta(hours=1))
    cnt_24h = sum(1 for h in window if h.type in DEBIT_TYPES and h.created_at >= t.created_at - timedelta(hours=24))
    new_payee = (t.type == "transfer_out" and t.counterparty_account_id is not None and not any(
        h.counterparty_account_id == t.counterparty_account_id and h.type == "transfer_out" for h in history))
    before = t.balance_after_minor + amt
    drain = amt / before if before else 0
    rapid_in = any(h.type in ("deposit", "transfer_in") and h.amount_minor >= 0.8 * amt
                   and h.created_at >= t.created_at - timedelta(minutes=30) for h in window)
    return {
        "amount": amt, "log_amount": math.log1p(amt / 100), "median": med,
        "ratio": amt / med if med else 1.0, "z": z, "hour": t.created_at.hour,
        "weekday": t.created_at.weekday(), "cnt_1h": cnt_1h, "cnt_24h": cnt_24h,
        "new_payee": bool(new_payee), "drain": drain, "rapid_in_out": rapid_in,
        "history_size": len(debits),
    }


def feature_vector(f: dict) -> list:
    return [f["log_amount"], f["hour"], f["weekday"], f["cnt_1h"], f["cnt_24h"],
            min(f["ratio"], 20), int(f["new_payee"]), f["drain"]]


def score(f: dict) -> tuple[int, list[str]]:
    pts, reasons = 0, []
    rupees = f["amount"] / 100
    if f["history_size"] >= 2 and f["ratio"] >= 4 and rupees >= 10000:
        pts += 30
        reasons.append(f"Amount is {f['ratio']:.1f}× this customer's typical spend in this category (₹{f['median']/100:,.0f})")
    if f["z"] >= 5 and rupees >= 10000:
        pts += 10
        reasons.append(f"Statistical outlier: robust z-score {f['z']:.1f} vs 90-day history")
    if f["hour"] < 5:
        pts += 15
        reasons.append(f"Initiated at an unusual hour ({f['hour']:02d}:00)")
    if f["cnt_1h"] >= 4:
        pts += 40
        reasons.append(f"High velocity: {f['cnt_1h'] + 1} debits within one hour")
    elif f["cnt_24h"] >= 8:
        pts += 10
        reasons.append(f"{f['cnt_24h'] + 1} debits within 24 hours")
    if f["new_payee"] and rupees >= 25000:
        pts += 20
        reasons.append("Large first-time transfer to a new beneficiary")
    if f["drain"] >= 0.8 and rupees >= 10000:
        pts += 20
        reasons.append(f"Moves {f['drain']*100:.0f}% of the available balance")
    if f["rapid_in_out"] and rupees >= 10000:
        pts += 20
        reasons.append("Funds moved out within 30 minutes of a matching credit")

    model = _load_model()
    if model is not None and pts > 0:
        raw = float(model.decision_function(np.array([feature_vector(f)]))[0])
        if raw < 0:  # IsolationForest marks it as an outlier
            ml_pts = min(20, int(-raw * 100))
            pts += ml_pts
            reasons.append(f"Isolation Forest model flags pattern as anomalous (score {raw:.3f})")
    return min(pts, 100), reasons


def severity_for(s: int) -> str:
    return "high" if s >= 70 else "medium" if s >= 55 else "low"


def customer_history(db, user_id: int, before):
    return (db.query(Transaction).join(Account, Transaction.account_id == Account.id)
            .filter(Account.user_id == user_id, Transaction.created_at < before,
                    Transaction.created_at >= before - timedelta(days=90))
            .order_by(Transaction.created_at).all())


def score_and_alert(db, t: Transaction, history=None, send_notification=True):
    if t.type not in DEBIT_TYPES:
        return None
    user_id = t.account.user_id
    if history is None:
        history = [h for h in customer_history(db, user_id, t.created_at) if h.id != t.id]
    f = compute_features(t, history)
    s, reasons = score(f)
    if s < ALERT_THRESHOLD:
        return None
    alert = AnomalyAlert(transaction_id=t.id, user_id=user_id, risk_score=s,
                         severity=severity_for(s), reasons=reasons, model_version=MODEL_VERSION,
                         created_at=t.created_at)
    db.add(alert)
    if send_notification:
        notify(db, user_id, "security", "Unusual activity detected",
               f"We noticed an unusual transaction ({t.reference}) of ₹{t.amount_minor/100:,.2f}. "
               "Our team will review it.")
    return alert


def train_model(feature_rows: list[list]):
    from sklearn.ensemble import IsolationForest
    model = IsolationForest(n_estimators=200, contamination=0.03, random_state=42)
    model.fit(np.array(feature_rows))
    joblib.dump(model, MODEL_PATH)
    reset_model_cache()
    return model
