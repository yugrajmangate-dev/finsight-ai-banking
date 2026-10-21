"""Keyword-based transaction categoriser (transparent and explainable)."""
import re

CATEGORIES = ["Income", "Housing", "Groceries", "Dining", "Shopping", "Utilities", "Transport",
              "Entertainment", "Health", "Education", "Travel", "Transfers", "Cash", "Loan", "Other"]

# Category groups used for the 50/30/20 budgeting guideline.
NEEDS = {"Housing", "Groceries", "Utilities", "Transport", "Health", "Education", "Loan"}
WANTS = {"Dining", "Shopping", "Entertainment", "Travel"}

_RULES = {
    "Housing": r"rent|landlord|maintenance|society|housing",
    "Groceries": r"grocer|bigbasket|blinkit|dmart|zepto|supermarket|kirana|reliance fresh",
    "Dining": r"swiggy|zomato|restaurant|cafe|starbucks|domino|pizza|dinner|lunch|food",
    "Shopping": r"amazon|flipkart|myntra|ajio|mall|shopping|nykaa|croma",
    "Utilities": r"electric|bescom|msedcl|water|gas|broadband|jio|airtel|recharge|bill",
    "Transport": r"uber|ola|rapido|metro|fuel|petrol|indian oil|fastag|parking",
    "Entertainment": r"netflix|prime video|hotstar|spotify|bookmyshow|movie|pvr|gaming",
    "Health": r"pharmacy|apollo|medplus|hospital|clinic|doctor|gym|cult",
    "Education": r"tuition|course|udemy|coursera|college|school|fees|books",
    "Travel": r"irctc|makemytrip|indigo|air india|hotel|goibibo|flight|trip",
    "Income": r"salary|payroll|refund|interest|dividend|freelance",
}
_COMPILED = {k: re.compile(v, re.I) for k, v in _RULES.items()}


def categorize(description: str, default: str = "Other") -> str:
    for cat, rx in _COMPILED.items():
        if rx.search(description or ""):
            return cat
    return default
