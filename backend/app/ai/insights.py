"""Customer spending analysis, budget guidance and expense forecasting.
Every figure is computed from the customer's own transactions in the database."""
from collections import defaultdict
from datetime import timedelta

import numpy as np

from ..models import Account, Transaction, utcnow
from .categorizer import NEEDS, WANTS

CREDIT = ("deposit", "transfer_in")  # loan disbursements are borrowed money, not income
DEBIT = ("withdrawal", "transfer_out")


def _txns(db, user_id, start, end=None):
    q = (db.query(Transaction).join(Account, Transaction.account_id == Account.id)
         .filter(Account.user_id == user_id, Transaction.status == "completed",
                 Transaction.created_at >= start))
    if end:
        q = q.filter(Transaction.created_at < end)
    own = {a for (a,) in db.query(Account.id).filter(Account.user_id == user_id)}
    # Transfers between the customer's own accounts are neither income nor spending.
    return [t for t in q.all() if t.counterparty_account_id not in own]


def _sum(txns, types):
    return sum(t.amount_minor for t in txns if t.type in types)


def _by_category(txns):
    out = defaultdict(int)
    for t in txns:
        if t.type in DEBIT:
            out[t.category] += t.amount_minor
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def monthly_series(db, user_id, months=6):
    now = utcnow()
    first = (now.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1, hour=0, minute=0,
                                                                           second=0, microsecond=0)
    buckets = defaultdict(lambda: {"income": 0, "expense": 0})
    for t in _txns(db, user_id, first):
        key = t.created_at.strftime("%Y-%m")
        if t.type in CREDIT:
            buckets[key]["income"] += t.amount_minor
        elif t.type in DEBIT:
            buckets[key]["expense"] += t.amount_minor
    keys, d = [], first
    while d <= now:
        keys.append(d.strftime("%Y-%m"))
        d = (d + timedelta(days=32)).replace(day=1)
    return [{"month": k, "label": _label(k), "income": buckets[k]["income"] / 100,
             "expense": buckets[k]["expense"] / 100,
             "savings": (buckets[k]["income"] - buckets[k]["expense"]) / 100} for k in keys]


def _label(key):
    import calendar
    y, m = key.split("-")
    return f"{calendar.month_abbr[int(m)]} {y[2:]}"


def insights(db, user_id, days=30):
    now = utcnow()
    start, prev_start = now - timedelta(days=days), now - timedelta(days=2 * days)
    cur, prev = _txns(db, user_id, start), _txns(db, user_id, prev_start, start)
    inc, exp = _sum(cur, CREDIT), _sum(cur, DEBIT)
    p_inc, p_exp = _sum(prev, CREDIT), _sum(prev, DEBIT)
    cats, p_cats = _by_category(cur), _by_category(prev)

    def pct(a, b):
        return round((a - b) / b * 100, 1) if b else None

    categories = [{"category": c, "amount": v / 100, "share": round(v / exp * 100, 1) if exp else 0,
                   "previous": p_cats.get(c, 0) / 100, "change_pct": pct(v, p_cats.get(c, 0))}
                  for c, v in cats.items()]

    needs = sum(v for c, v in cats.items() if c in NEEDS)
    wants = sum(v for c, v in cats.items() if c in WANTS)
    other = exp - needs - wants
    savings = max(inc - exp, 0)
    base = inc or exp or 1
    budget = {
        "guideline": "50/30/20 rule (needs / wants / savings)",
        "actual": {"needs": round(needs / base * 100, 1), "wants": round(wants / base * 100, 1),
                   "savings": round(savings / base * 100, 1), "other": round(other / base * 100, 1)},
        "target": {"needs": 50, "wants": 30, "savings": 20},
        "suggested_limits": {"needs": inc * 0.5 / 100, "wants": inc * 0.3 / 100, "savings": inc * 0.2 / 100},
    }

    tips = []
    if inc and savings / inc < 0.2:
        gap = (0.2 * inc - savings) / 100
        tips.append({"type": "warning", "title": "Savings below 20% target",
                     "text": f"You saved {savings / inc * 100:.0f}% of income. Setting aside another ₹{gap:,.0f} would reach the 20% guideline."})
    elif inc:
        tips.append({"type": "success", "title": "Healthy savings rate",
                     "text": f"You saved {savings / inc * 100:.0f}% of your income this period — above the 20% guideline."})
    if inc and wants / inc > 0.3:
        tips.append({"type": "warning", "title": "Discretionary spending is high",
                     "text": f"Wants (dining, shopping, entertainment, travel) are {wants / inc * 100:.0f}% of income vs. a 30% guideline."})
    for c in categories[:6]:
        if c["change_pct"] is not None and c["change_pct"] >= 25 and c["amount"] >= 1000:
            tips.append({"type": "info", "title": f"{c['category']} up {c['change_pct']:.0f}%",
                         "text": f"₹{c['amount']:,.0f} this period vs ₹{c['previous']:,.0f} previously. Trimming it back to last period's level saves ₹{c['amount'] - c['previous']:,.0f}."})
    if "Dining" in cats and cats["Dining"] > 0.1 * base:
        tips.append({"type": "info", "title": "Savings opportunity: dining",
                     "text": f"Cutting dining/food delivery by 30% would save about ₹{cats['Dining'] * 0.3 / 100:,.0f} per period."})
    subs = [t for t in cur if t.category == "Entertainment"]
    if len(subs) >= 3:
        tips.append({"type": "info", "title": "Review subscriptions",
                     "text": f"{len(subs)} entertainment payments this period totalling ₹{sum(s.amount_minor for s in subs) / 100:,.0f}."})

    largest = sorted((t for t in cur if t.type in DEBIT), key=lambda t: -t.amount_minor)[:5]
    return {
        "period_days": days,
        "summary": {"income": inc / 100, "expense": exp / 100, "net": (inc - exp) / 100,
                    "savings_rate": round(savings / inc * 100, 1) if inc else 0,
                    "income_change_pct": pct(inc, p_inc), "expense_change_pct": pct(exp, p_exp),
                    "transactions": len(cur), "previous_income": p_inc / 100, "previous_expense": p_exp / 100},
        "categories": categories,
        "budget": budget,
        "tips": tips,
        "largest_expenses": [{"reference": t.reference, "description": t.description, "category": t.category,
                              "amount": t.amount_minor / 100, "date": t.created_at.isoformat()} for t in largest],
    }


def forecast(db, user_id):
    """Next-month expense estimate: linear trend on monthly totals blended with a 3-month average."""
    series = monthly_series(db, user_id, months=7)[:-1]  # complete months only
    history = [s for s in series if s["expense"] > 0]
    if len(history) < 3:
        return {"available": False, "reason": "At least 3 months of history are needed for a forecast."}
    y = np.array([s["expense"] for s in history])
    x = np.arange(len(y))
    slope, intercept = np.polyfit(x, y, 1)
    trend = slope * len(y) + intercept
    avg3 = y[-3:].mean()
    estimate = max(0.0, 0.5 * trend + 0.5 * avg3)
    resid = y - (slope * x + intercept)
    spread = float(np.std(resid)) if len(y) > 2 else 0.0

    now = utcnow()
    start = (now.replace(day=1) - timedelta(days=95)).replace(day=1)
    cat_totals = defaultdict(int)
    for t in _txns(db, user_id, start, now.replace(day=1)):
        if t.type in DEBIT:
            cat_totals[t.category] += t.amount_minor
    months = max(1, len({s['month'] for s in series[-3:]}))
    by_cat = sorted(({"category": c, "estimate": round(v / 100 / months, 2)} for c, v in cat_totals.items()),
                    key=lambda r: -r["estimate"])
    return {
        "available": True, "is_estimate": True,
        "method": "Linear trend + 3-month moving average (equal blend)",
        "next_month_estimate": round(estimate, 2),
        "range": [round(max(0, estimate - spread), 2), round(estimate + spread, 2)],
        "trend": "increasing" if slope > 0.03 * avg3 else "decreasing" if slope < -0.03 * avg3 else "stable",
        "history": [{"label": s["label"], "actual": s["expense"]} for s in history],
        "by_category": by_cat[:8],
    }
