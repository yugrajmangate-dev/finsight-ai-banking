"""Reset and seed the database with realistic synthetic data (deterministic).

    python -m scripts.seed
"""
import random
from collections import defaultdict
from datetime import timedelta

from app import models  # noqa: F401
from app.ai.anomaly import DEBIT_TYPES, compute_features, feature_vector, score_and_alert, train_model
from app.db import Base, SessionLocal, engine
from app.models import (Account, AuditLog, CustomerProfile, LoanApplication, LoanStatusHistory, Notification,
                        Transaction, User, utcnow)
from app.routers.customer import LOAN_RATES
from app.security import hash_password
from app.utils import new_reference

rnd = random.Random(2026)
NOW = utcnow().replace(second=0, microsecond=0)
START = NOW - timedelta(days=185)

CUSTOMERS = [
    ("Priya Sharma", "priya", "Bengaluru", "Software Engineer", 145000),
    ("Rahul Verma", "rahul", "Mumbai", "Product Manager", 180000),
    ("Ananya Iyer", "ananya", "Chennai", "Data Analyst", 85000),
    ("Arjun Mehta", "arjun", "Pune", "Business Owner", 220000),
    ("Sneha Kulkarni", "sneha", "Pune", "Teacher", 55000),
    ("Vikram Singh", "vikram", "Delhi", "Consultant", 160000),
    ("Kavya Reddy", "kavya", "Hyderabad", "Doctor", 210000),
    ("Rohan Gupta", "rohan", "Noida", "Student", 18000),
    ("Meera Nair", "meera", "Kochi", "Architect", 120000),
    ("Aditya Joshi", "aditya", "Nagpur", "Civil Engineer", 75000),
    ("Ishita Banerjee", "ishita", "Kolkata", "Designer", 90000),
    ("Karan Malhotra", "karan", "Gurugram", "Sales Manager", 130000),
    ("Pooja Patel", "pooja", "Ahmedabad", "Chartered Accountant", 140000),
    ("Siddharth Rao", "siddharth", "Bengaluru", "Startup Founder", 250000),
    ("Neha Agarwal", "neha", "Jaipur", "HR Executive", 65000),
    ("Amit Deshmukh", "amit", "Nashik", "Bank Officer", 70000),
    ("Divya Menon", "divya", "Thiruvananthapuram", "Researcher", 95000),
    ("Harsh Vardhan", "harsh", "Lucknow", "Government Employee", 80000),
    ("Tanvi Shah", "tanvi", "Surat", "Freelancer", 60000),
    ("Nikhil Chauhan", "nikhil", "Chandigarh", "Pilot", 300000),
    ("Riya Kapoor", "riya", "Delhi", "Marketing Lead", 110000),
    ("Manish Yadav", "manish", "Indore", "Pharmacist", 58000),
    ("Shreya Ghosh", "shreya", "Kolkata", "Journalist", 72000),
    ("Varun Pillai", "varun", "Mangaluru", "Mechanical Engineer", 88000),
]

SPEND = [  # (category, descriptions, monthly occurrences, min, max, share of income cap)
    ("Groceries", ["BigBasket order", "DMart groceries", "Blinkit groceries", "Zepto quick commerce", "Reliance Fresh"], 6, 600, 3500),
    ("Dining", ["Swiggy order", "Zomato order", "Starbucks coffee", "Dinner at restaurant", "Domino's pizza"], 7, 250, 2200),
    ("Shopping", ["Amazon purchase", "Flipkart order", "Myntra fashion", "Croma electronics", "Nykaa beauty"], 3, 800, 9000),
    ("Transport", ["Uber ride", "Ola cab", "Metro card recharge", "Indian Oil fuel", "FASTag recharge"], 6, 150, 2800),
    ("Entertainment", ["Netflix subscription", "Spotify premium", "BookMyShow tickets", "Hotstar subscription"], 2, 149, 1200),
    ("Health", ["Apollo pharmacy", "Cult.fit membership", "Clinic consultation", "MedPlus pharmacy"], 1, 300, 3500),
    ("Utilities", ["BESCOM electricity bill", "Airtel broadband", "Jio mobile recharge", "Water bill", "Gas bill"], 3, 299, 2600),
]


def main():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()

    admin = User(email="admin@finsight.demo", full_name="Aisha Khan", phone="9800000001", role="admin",
                 password_hash=hash_password("Admin@123"), created_at=START - timedelta(days=200))
    db.add(admin)
    db.flush()

    users, accounts = [], []
    acct_no = 502610000000
    for i, (name, slug, city, job, income) in enumerate(CUSTOMERS):
        joined = START - timedelta(days=rnd.randint(20, 400))
        u = User(email=f"{slug}@finsight.demo", full_name=name, phone=f"9{rnd.randint(100000000, 999999999)}",
                 role="customer", password_hash=hash_password("Demo@123"), created_at=joined,
                 is_active=i != 21)
        db.add(u)
        db.flush()
        db.add(CustomerProfile(user_id=u.id, city=city, occupation=job, address=f"{rnd.randint(1, 300)}, {city}",
                               date_of_birth=f"{rnd.randint(1975, 2003)}-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}",
                               monthly_income_minor=income * 100))
        acct_no += rnd.randint(1000, 9000)
        sav = Account(account_number=str(acct_no), user_id=u.id, type="savings", opened_at=joined)
        db.add(sav)
        accs = [sav]
        if i % 3 == 0:
            acct_no += rnd.randint(1000, 9000)
            accs.append(Account(account_number=str(acct_no), user_id=u.id, type="current",
                                opened_at=joined + timedelta(days=10)))
            db.add(accs[-1])
        users.append((u, income))
        accounts.append(accs)
    db.flush()
    accounts[17][0].status = "frozen"

    # ---- generate events ----
    events = []  # (time, type, acc, counterparty, amount_minor, desc, category)

    def at(day, h0=8, h1=22):
        return day.replace(hour=rnd.randint(h0, h1), minute=rnd.randint(0, 59))

    for idx, ((u, income), accs) in enumerate(zip(users, accounts)):
        main = accs[0]
        events.append((START - timedelta(days=1), "deposit", main, None, rnd.randint(30000, 150000) * 100,
                       "Opening deposit", "Income"))
        lifestyle = rnd.uniform(0.6, 1.4)
        month = START.replace(day=1)
        while month <= NOW:
            def day(d):
                return month.replace(day=min(d, 28))
            if day(1) >= START:
                events.append((at(day(1), 9, 11), "deposit", main, None, int(income * rnd.uniform(0.98, 1.02)) * 100,
                               "Salary credit - payroll", "Income"))
                rent = int(income * rnd.uniform(0.18, 0.28)) // 100 * 100
                events.append((at(day(3)), "withdrawal", main, None, rent * 100, "House rent payment", "Housing"))
                if rnd.random() < 0.5:
                    events.append((at(day(rnd.randint(5, 25))), "withdrawal", main, None,
                                   rnd.randint(1500, 6000) * 100, rnd.choice(["Udemy course", "Books purchase", "Tuition fees"]),
                                   "Education"))
                if rnd.random() < 0.3:
                    events.append((at(day(rnd.randint(5, 25))), "withdrawal", main, None, rnd.randint(4000, 18000) * 100,
                                   rnd.choice(["MakeMyTrip booking", "IRCTC ticket", "IndiGo flight", "Hotel stay"]), "Travel"))
                if len(accs) > 1:
                    events.append((at(day(5)), "transfer_out", main, accs[1], int(income * 0.1) * 100,
                                   "Transfer to own current account", "Transfers"))
            for cat, descs, n, lo, hi in SPEND:
                scale = income / 100000
                for _ in range(max(1, int(n * rnd.uniform(0.6, 1.4)))):
                    d = month + timedelta(days=rnd.randint(0, 27), hours=0)
                    if START <= d <= NOW:
                        amt = int(rnd.uniform(lo, hi) * lifestyle * max(0.4, min(scale, 2.2)))
                        events.append((at(d), "withdrawal", main, None, max(amt, 49) * 100, rnd.choice(descs), cat))
            if rnd.random() < 0.6:  # peer transfer
                d = month + timedelta(days=rnd.randint(0, 27))
                peer = rnd.choice([a for j, a in enumerate(accounts) if j != idx])[0]
                if START <= d <= NOW:
                    events.append((at(d), "transfer_out", main, peer, rnd.randint(500, 6000) * 100,
                                   f"Transfer to {peer.user.full_name.split()[0]}", "Transfers"))
            if rnd.random() < 0.25:
                d = month + timedelta(days=rnd.randint(0, 27))
                if START <= d <= NOW:
                    events.append((at(d), "deposit", main, None, rnd.randint(2000, 25000) * 100,
                                   rnd.choice(["Freelance payment", "Refund credited", "Cash deposit"]), "Income"))
            month = (month + timedelta(days=32)).replace(day=1)

    # ---- planted anomalies (all within the last 60 days) ----
    def recent_day(min_ago=3, max_ago=55):
        return (NOW - timedelta(days=rnd.randint(min_ago, max_ago))).replace(second=0, microsecond=0)

    planted = [(0, "night_cash"), (1, "burst"), (3, "drain"), (5, "rapid"), (8, "night_cash"), (10, "burst"),
               (13, "rapid"), (15, "drain"), (0, "rapid"), (19, "night_cash"), (6, "burst"), (11, "drain")]
    for idx, kind in planted:
        acc = accounts[idx][0]
        others = [a[0] for j, a in enumerate(accounts) if j != idx]
        d = recent_day()
        if kind == "night_cash":
            events.append((d.replace(hour=rnd.randint(1, 3)), "withdrawal", acc, None, rnd.randint(45000, 90000) * 100,
                           "ATM cash withdrawal", "Cash"))
        elif kind == "burst":
            t0 = d.replace(hour=rnd.randint(13, 20))
            for k in range(6):
                events.append((t0 + timedelta(minutes=6 * k), "transfer_out", acc, rnd.choice(others),
                               rnd.randint(3000, 7000) * 100, "UPI transfer", "Transfers"))
        elif kind == "drain":
            events.append((d.replace(hour=rnd.randint(10, 18)), "transfer_out", acc, rnd.choice(others[15:]),
                           -1, "Transfer to new beneficiary", "Transfers"))  # -1 → 88% of balance
        elif kind == "rapid":
            t0 = d.replace(hour=rnd.randint(10, 20))
            amt = rnd.randint(70000, 150000) * 100
            events.append((t0, "deposit", acc, None, amt, "Cash deposit", "Income"))
            events.append((t0 + timedelta(minutes=rnd.randint(8, 25)), "transfer_out", acc, rnd.choice(others[18:]),
                           int(amt * 0.95), "Transfer to new beneficiary", "Transfers"))

    # ---- apply events in time order with real balance arithmetic ----
    events.sort(key=lambda e: e[0])
    bal = defaultdict(int)
    txns = []
    for when, typ, acc, cp, amt, desc, cat in events:
        if when > NOW:
            continue
        if amt == -1:
            amt = int(bal[acc.id] * 0.88) // 100 * 100
        if typ in DEBIT_TYPES:
            if amt <= 0 or bal[acc.id] < amt or acc.status == "frozen" and when > NOW - timedelta(days=10):
                continue
            bal[acc.id] -= amt
        else:
            bal[acc.id] += amt
        ref = new_reference("TRF" if typ == "transfer_out" else "TXN")
        t = Transaction(reference=ref, account_id=acc.id, type=typ, amount_minor=amt, balance_after_minor=bal[acc.id],
                        category=cat, description=desc, counterparty_account_id=cp.id if cp else None,
                        initiated_by=acc.user_id, created_at=when)
        txns.append(t)
        if typ == "transfer_out":
            bal[cp.id] += amt
            txns.append(Transaction(reference=ref, account_id=cp.id, type="transfer_in", amount_minor=amt,
                                    balance_after_minor=bal[cp.id], category="Transfers",
                                    description=f"Transfer from {acc.user.full_name}", counterparty_account_id=acc.id,
                                    initiated_by=acc.user_id, created_at=when))
    db.add_all(txns)
    for accs in accounts:
        for a in accs:
            a.balance_minor = bal[a.id]
    db.flush()

    # ---- train Isolation Forest on all debit behaviour, then score history ----
    acc_owner = {a.id: a.user_id for accs in accounts for a in accs}
    by_user = defaultdict(list)
    for t in sorted(txns, key=lambda t: t.created_at):
        by_user[acc_owner[t.account_id]].append(t)
    rows = []
    for hist in by_user.values():
        for i, t in enumerate(hist):
            if t.type in DEBIT_TYPES:
                rows.append(feature_vector(compute_features(t, hist[:i])))
    train_model(rows)
    n_alerts = 0
    for hist in by_user.values():
        for i, t in enumerate(hist):
            if t.type in DEBIT_TYPES and t.created_at >= NOW - timedelta(days=90):
                if score_and_alert(db, t, history=hist[:i], send_notification=t.created_at >= NOW - timedelta(days=20)):
                    n_alerts += 1
    db.flush()
    alerts = db.query(models.AnomalyAlert).order_by(models.AnomalyAlert.created_at).all()
    for a in alerts[: len(alerts) // 3]:
        a.status = rnd.choice(["reviewed", "dismissed", "escalated"])
        a.reviewed_by, a.reviewed_at = admin.id, a.created_at + timedelta(hours=rnd.randint(2, 30))
        db.add(AuditLog(actor_id=admin.id, action=f"alert.{a.status}", entity_type="alert", entity_id=a.id,
                        details={"freeze": False}, ip="127.0.0.1", created_at=a.reviewed_at))

    # ---- loans ----
    loan_specs = [
        (0, "home", 4500000, 240, "Purchase of 2BHK apartment in Whitefield", "pending"),
        (0, "personal", 150000, 24, "Home furnishing and appliances", "approved"),
        (1, "car", 900000, 60, "New hatchback for daily commute", "approved"),
        (2, "education", 600000, 48, "Master's degree in data science", "pending"),
        (3, "business", 2500000, 60, "Expanding retail store inventory", "pending"),
        (4, "personal", 300000, 36, "Medical expenses for family member", "rejected"),
        (6, "home", 3800000, 180, "Construction of independent house", "approved"),
        (7, "personal", 400000, 24, "Buying a high-end gaming setup", "rejected"),
        (9, "car", 700000, 60, "Family SUV purchase", "pending"),
        (11, "personal", 250000, 12, "Wedding expenses", "approved"),
        (14, "education", 350000, 36, "Professional certification course", "pending"),
        (20, "business", 1200000, 48, "Launch of digital marketing agency", "rejected"),
    ]
    for idx, typ, amount, term, purpose, status in loan_specs:
        u, income = users[idx]
        created = NOW - timedelta(days=rnd.randint(3, 120), hours=rnd.randint(0, 12))
        rate = LOAN_RATES[typ]
        r = rate / 1200
        emi = amount * r * (1 + r) ** term / ((1 + r) ** term - 1)
        dti = emi / income
        score = max(5, min(95, int(50 + (25 if dti <= .3 else 5 if dti <= .5 else -30)
                                   + (10 if "Student" not in (u.profile.occupation or "") else -10) + rnd.randint(-5, 10))))
        reasons = [f"EMI ₹{emi:,.0f} is {dti * 100:.0f}% of income", f"Monthly income ₹{income:,}",
                   f"Banking relationship of {(NOW - u.created_at).days // 30} months"]
        loan = LoanApplication(user_id=u.id, account_id=accounts[idx][0].id, loan_type=typ, amount_minor=amount * 100,
                               term_months=term, interest_rate=rate, purpose=purpose, monthly_income_minor=income * 100,
                               employment_type="student" if "Student" in u.profile.occupation else
                               "self_employed" if any(k in u.profile.occupation for k in ("Owner", "Founder", "Freelancer")) else "salaried",
                               status=status, eligibility_score=score, eligibility_reasons=reasons, created_at=created)
        db.add(loan)
        db.flush()
        db.add(LoanStatusHistory(loan_id=loan.id, to_status="pending", changed_by=u.id,
                                 comment="Application submitted", created_at=created))
        if status != "pending":
            when = created + timedelta(days=rnd.randint(1, 4))
            comment = ("Income and repayment capacity verified." if status == "approved"
                       else "Debt-to-income ratio exceeds policy threshold.")
            loan.reviewed_by, loan.review_comment, loan.reviewed_at = admin.id, comment, when
            db.add(LoanStatusHistory(loan_id=loan.id, from_status="pending", to_status=status, changed_by=admin.id,
                                     comment=comment, created_at=when))
            db.add(AuditLog(actor_id=admin.id, action=f"loan.{status}", entity_type="loan", entity_id=loan.id,
                            details={"comment": comment}, ip="127.0.0.1", created_at=when))
            db.add(Notification(user_id=u.id, kind="loan", title=f"Loan {status}",
                                body=f"Your {typ} loan #{loan.id} for ₹{amount:,} was {status}. {comment}", created_at=when,
                                is_read=when < NOW - timedelta(days=14)))
            if status == "approved":
                acc = accounts[idx][0]
                acc.balance_minor += amount * 100
                db.add(Transaction(reference=new_reference("LN"), account_id=acc.id, type="loan_disbursement",
                                   amount_minor=amount * 100, balance_after_minor=acc.balance_minor, category="Loan",
                                   description=f"{typ.title()} loan disbursement #{loan.id}", created_at=NOW))

    for u, _ in users:
        db.add(Notification(user_id=u.id, kind="info", title="Welcome to FinSight Bank",
                            body="Your account is active. FinSight is a simulated bank for academic demonstration.",
                            created_at=u.created_at, is_read=True))
    db.add(AuditLog(actor_id=admin.id, action="account.frozen", entity_type="account", entity_id=accounts[17][0].id,
                    details={"from": "active", "to": "frozen", "reason": "KYC documents expired"}, ip="127.0.0.1",
                    created_at=NOW - timedelta(days=9)))
    db.add(AuditLog(actor_id=admin.id, action="customer.deactivate", entity_type="user", entity_id=users[21][0].id,
                    ip="127.0.0.1", created_at=NOW - timedelta(days=30)))
    db.commit()
    print(f"Seeded {len(users)} customers, {sum(len(a) for a in accounts)} accounts, {len(txns)} transactions, "
          f"{len(loan_specs)} loans, {n_alerts} AI alerts.")
    print("Admin:    admin@finsight.demo / Admin@123")
    print("Customer: priya@finsight.demo / Demo@123  (all customers use Demo@123)")


if __name__ == "__main__":
    main()
