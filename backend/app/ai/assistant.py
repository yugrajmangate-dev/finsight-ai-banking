"""Financial assistant.

Default mode is fully offline: an intent classifier routes the question to backend
functions scoped to the signed-in customer, and answers are built from those values.
If LLM_API_KEY is configured, the same customer-scoped facts are passed to an LLM that
only phrases the answer; it never computes balances itself. Any LLM failure falls back
to the offline answer.
"""
import json
import re
from difflib import SequenceMatcher

import httpx

from ..config import LLM_API_KEY, LLM_MODEL
from ..models import Account, Transaction
from ..utils import mask_account
from .insights import forecast, insights

INTENTS = {
    "balance": ["balance", "how much money", "account balance", "funds", "how much do i have"],
    "spending": ["spend", "spent", "expense", "expenses", "spending this month", "how much did i spend"],
    "categories": ["category", "categories", "where does my money go", "largest spending", "top spending"],
    "recent": ["recent", "last transactions", "latest", "history", "show my transactions"],
    "summary": ["summary", "summarize", "overview", "financial activity", "report"],
    "budget": ["budget", "save", "saving", "tips", "advice", "manage", "reduce"],
    "income": ["income", "earn", "salary", "credited", "received"],
    "forecast": ["forecast", "predict", "next month", "future", "estimate"],
    "alerts": ["alert", "suspicious", "fraud", "unusual", "security"],
    "greeting": ["hi", "hello", "hey", "help", "what can you do"],
}
SUGGESTIONS = ["What is my current balance?", "How much did I spend this month?",
               "What are my largest spending categories?", "Show my recent transactions",
               "Summarize my financial activity", "Give me budget tips", "Forecast next month's spending"]


def classify(question: str) -> str:
    q = question.lower()
    words = set(re.findall(r"[a-z]+", q))
    best, best_score = "fallback", 0.0
    for intent, keys in INTENTS.items():
        for k in keys:
            if " " in k:
                s = 1.0 if k in q else SequenceMatcher(None, k, q).ratio() * 0.6
            else:
                s = 1.0 if k in words else max((SequenceMatcher(None, k, w).ratio() for w in words), default=0) * 0.8
            if intent == "greeting" and s == 1.0 and len(words) > 3:
                s = 0.3  # "hi" inside a real question shouldn't win
            if s > best_score:
                best, best_score = intent, s
    return best if best_score >= 0.7 else "fallback"


def _period(question: str) -> tuple[int, str]:
    q = question.lower()
    if "week" in q:
        return 7, "the last 7 days"
    if "quarter" in q or "3 month" in q:
        return 90, "the last 90 days"
    if "year" in q:
        return 365, "the last 12 months"
    return 30, "the last 30 days"


def _inr(v: float) -> str:
    """Indian digit grouping, e.g. ₹3,84,179.40."""
    sign, v = ("-" if v < 0 else ""), abs(v)
    whole, frac = f"{v:.2f}".split(".")
    head, tail = whole[:-3], whole[-3:]
    while len(head) > 2:
        tail = head[-2:] + "," + tail
        head = head[:-2]
    return f"{sign}₹{head + ',' if head else ''}{tail}.{frac}"


def _facts(db, user, intent, days):
    accounts = db.query(Account).filter(Account.user_id == user.id, Account.status != "closed").all()
    data = {"accounts": [{"account": mask_account(a.account_number), "type": a.type, "status": a.status,
                          "balance": a.balance_minor / 100} for a in accounts],
            "total_balance": sum(a.balance_minor for a in accounts) / 100}
    if intent in ("spending", "categories", "summary", "budget", "income", "fallback"):
        data["insights"] = insights(db, user.id, days)
    if intent in ("recent", "summary"):
        ids = [a.id for a in accounts]
        rec = (db.query(Transaction).filter(Transaction.account_id.in_(ids))
               .order_by(Transaction.created_at.desc()).limit(5).all()) if ids else []
        data["recent"] = [{"date": t.created_at.strftime("%d %b"), "description": t.description,
                           "type": t.type, "amount": t.amount_minor / 100} for t in rec]
    if intent == "forecast":
        data["forecast"] = forecast(db, user.id)
    if intent == "alerts":
        from ..models import AnomalyAlert
        data["alerts"] = [{"severity": a.severity, "status": a.status, "reasons": a.reasons}
                          for a in db.query(AnomalyAlert).filter(AnomalyAlert.user_id == user.id)
                          .order_by(AnomalyAlert.created_at.desc()).limit(5)]
    return data


def _offline_answer(user, intent, d, label):
    first = user.full_name.split()[0]
    if intent == "greeting":
        return (f"Hi {first}! I'm your FinSight assistant. I can tell you your balance, analyse your spending, "
                "summarise activity, forecast expenses and suggest budget improvements — all from your own account data.")
    if intent == "balance":
        lines = [f"- {a['type'].title()} {a['account']}: **{_inr(a['balance'])}**" + ("" if a["status"] == "active" else f" ({a['status']})")
                 for a in d["accounts"]]
        return f"Your total available balance is **{_inr(d['total_balance'])}** across {len(lines)} account(s):\n" + "\n".join(lines)
    if intent == "recent":
        if not d["recent"]:
            return "You don't have any transactions yet."
        lines = [f"- {r['date']} · {r['description']} · {'+' if r['type'] in ('deposit', 'transfer_in', 'loan_disbursement') else '−'}{_inr(r['amount'])}"
                 for r in d["recent"]]
        return "Here are your 5 most recent transactions:\n" + "\n".join(lines)
    if intent == "forecast":
        f = d["forecast"]
        if not f["available"]:
            return f["reason"]
        return (f"**Estimate (not actual data):** based on your last {len(f['history'])} months, next month's spending is projected at "
                f"about **{_inr(f['next_month_estimate'])}** (likely range {_inr(f['range'][0])} – {_inr(f['range'][1])}). "
                f"Your spending trend is **{f['trend']}**. Method: {f['method']}.")
    if intent == "alerts":
        if not d["alerts"]:
            return "There are no unusual-activity alerts on your accounts. 👍"
        a = d["alerts"][0]
        return (f"You have {len(d['alerts'])} recent alert(s). The latest is **{a['severity']}** severity ({a['status']}): "
                f"{'; '.join(a['reasons'])}. Alerts are reviewed by our team and are not confirmed fraud.")
    ins = d.get("insights")
    s = ins["summary"]
    cats = ins["categories"]
    if intent == "spending":
        chg = s["expense_change_pct"]
        tail = f" That's {'up' if chg > 0 else 'down'} {abs(chg):.0f}% from the previous period." if chg is not None else ""
        top = f" Your biggest category was **{cats[0]['category']}** ({_inr(cats[0]['amount'])})." if cats else ""
        return f"In {label} you spent **{_inr(s['expense'])}** across {s['transactions']} transactions.{tail}{top}"
    if intent == "income":
        return f"In {label} you received **{_inr(s['income'])}** and spent {_inr(s['expense'])}, leaving a net of **{_inr(s['net'])}**."
    if intent == "categories":
        if not cats:
            return f"No spending recorded in {label}."
        lines = [f"{i}. **{c['category']}** — {_inr(c['amount'])} ({c['share']}%)" for i, c in enumerate(cats[:5], 1)]
        return f"Your largest spending categories in {label}:\n" + "\n".join(lines)
    if intent == "budget":
        tips = ins["tips"] or [{"title": "Looking good", "text": "Your spending is within the 50/30/20 guideline."}]
        b = ins["budget"]["actual"]
        head = f"Your split in {label}: needs {b['needs']}%, wants {b['wants']}%, savings {b['savings']}% (guideline 50/30/20)."
        return head + "\n" + "\n".join(f"- **{t['title']}**: {t['text']}" for t in tips[:4])
    if intent == "summary":
        top = ", ".join(c["category"] for c in cats[:3]) or "none"
        return (f"**Summary for {label}**\n- Total balance: **{_inr(d['total_balance'])}**\n- Income: {_inr(s['income'])}\n"
                f"- Spending: {_inr(s['expense'])}\n- Net: {_inr(s['net'])} (savings rate {s['savings_rate']}%)\n"
                f"- Top categories: {top}\n- Transactions: {s['transactions']}")
    return ("I can only answer questions about your own FinSight accounts. Try one of: "
            + "; ".join(f"“{q}”" for q in SUGGESTIONS[:4]) + ".")


def _llm_answer(question, facts):
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": LLM_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": LLM_MODEL, "max_tokens": 500,
              "system": ("You are a banking assistant for a simulated educational bank. Answer ONLY using the JSON facts "
                         "provided, which belong to the signed-in customer. Never invent numbers or do your own balance "
                         "arithmetic beyond what is given. Use ₹ and Indian number formatting. Label forecasts as estimates. "
                         "Be concise and use markdown bullet points where helpful."),
              "messages": [{"role": "user", "content": f"FACTS:\n{json.dumps(facts, default=str)}\n\nQUESTION: {question}"}]},
        timeout=20)
    resp.raise_for_status()
    return "".join(b.get("text", "") for b in resp.json()["content"])


def answer(db, user, question: str) -> dict:
    intent = classify(question)
    days, label = _period(question)
    facts = _facts(db, user, intent, days)
    offline = _offline_answer(user, intent, facts, label)
    mode, text = "offline", offline
    if LLM_API_KEY and intent not in ("greeting",):
        try:
            text, mode = _llm_answer(question, facts), "llm"
        except Exception:
            mode = "offline-fallback"
    return {"answer": text, "intent": intent, "mode": mode, "suggestions": SUGGESTIONS}
