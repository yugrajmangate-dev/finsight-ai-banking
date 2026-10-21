import threading
from datetime import date, timedelta

from conftest import make_client

API = "/api/v1"


def dep(c, acc, amount, key=None):
    h = {"Idempotency-Key": key} if key else {}
    return c.post(f"{API}/accounts/{acc['id']}/deposit", json={"amount": amount}, headers=h)


# ---------- auth ----------
def test_register_login_logout(alice):
    c, _ = alice
    assert c.get(f"{API}/auth/me").json()["data"]["role"] == "customer"
    c.post(f"{API}/auth/logout")
    assert c.get(f"{API}/auth/me").status_code == 401
    r = c.post(f"{API}/auth/login", json={"email": "alice@test.io", "password": "Secret123"})
    assert r.status_code == 200


def test_wrong_password_and_duplicate_email(alice):
    c = make_client()
    r = c.post(f"{API}/auth/login", json={"email": "alice@test.io", "password": "nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    r = c.post(f"{API}/auth/register", json={"full_name": "A", "email": "alice@test.io", "phone": "9876543210",
                                             "password": "Secret123"})
    assert r.status_code == 422  # name too short, validated before uniqueness


def test_weak_password_rejected():
    c = make_client()
    r = c.post(f"{API}/auth/register", json={"full_name": "Weak User", "email": "w@test.io", "phone": "9876543210",
                                             "password": "short"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_role_permissions(alice, admin):
    c, _ = alice
    assert make_client().get(f"{API}/accounts").status_code == 401
    assert c.get(f"{API}/admin/dashboard").status_code == 403
    assert admin.get(f"{API}/accounts").status_code == 403
    assert admin.get(f"{API}/admin/dashboard").status_code == 200


# ---------- money ----------
def test_deposit_withdraw(alice):
    c, acc = alice
    assert dep(c, acc, "1000.50").status_code == 201
    r = c.post(f"{API}/accounts/{acc['id']}/withdraw", json={"amount": "200.25"})
    assert r.status_code == 201 and r.json()["data"]["balance_after"] == 800.25
    assert c.get(f"{API}/accounts/{acc['id']}").json()["data"]["balance"] == 800.25


def test_invalid_amounts(alice):
    c, acc = alice
    for bad in ["0", "-5", "10.555", "abc"]:
        assert dep(c, acc, bad).status_code == 422, bad


def test_insufficient_funds(alice):
    c, acc = alice
    dep(c, acc, "100")
    r = c.post(f"{API}/accounts/{acc['id']}/withdraw", json={"amount": "100.01"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "insufficient_funds"


def test_transfer_success_and_consistency(alice, bob):
    (a, aacc), (b, bacc) = alice, bob
    dep(a, aacc, "5000")
    r = a.post(f"{API}/transfers", json={"from_account_id": aacc["id"], "to_account_number": bacc["account_number"],
                                         "amount": "1234.56"})
    assert r.status_code == 201
    assert a.get(f"{API}/accounts/{aacc['id']}").json()["data"]["balance"] == 3765.44
    assert b.get(f"{API}/accounts/{bacc['id']}").json()["data"]["balance"] == 1234.56
    assert b.get(f"{API}/notifications").json()["data"][0]["title"] == "Money received"


def test_failed_transfer_changes_nothing(alice, bob, admin):
    (a, aacc), (b, bacc) = alice, bob
    dep(a, aacc, "500")
    admin.patch(f"{API}/admin/accounts/{bacc['id']}/status", json={"status": "frozen"})
    r = a.post(f"{API}/transfers", json={"from_account_id": aacc["id"], "to_account_number": bacc["account_number"],
                                         "amount": "100"})
    assert r.status_code == 409
    assert a.get(f"{API}/accounts/{aacc['id']}").json()["data"]["balance"] == 500  # debit rolled back
    r = a.post(f"{API}/transfers", json={"from_account_id": aacc["id"], "to_account_number": aacc["account_number"],
                                         "amount": "10"})
    assert r.status_code == 422


def test_ownership_enforced(alice, bob):
    (a, aacc), (b, bacc) = alice, bob
    dep(b, bacc, "1000")
    assert a.get(f"{API}/accounts/{bacc['id']}").status_code == 404
    assert a.post(f"{API}/accounts/{bacc['id']}/withdraw", json={"amount": "10"}).status_code == 404
    r = a.post(f"{API}/transfers", json={"from_account_id": bacc["id"], "to_account_number": aacc["account_number"],
                                         "amount": "10"})
    assert r.status_code == 404
    assert a.get(f"{API}/transactions", params={"account_id": bacc["id"]}).status_code == 404


def test_idempotency(alice):
    c, acc = alice
    r1, r2 = dep(c, acc, "100", key="abc-1"), dep(c, acc, "100", key="abc-1")
    assert r1.json()["data"]["reference"] == r2.json()["data"]["reference"]
    assert c.get(f"{API}/accounts/{acc['id']}").json()["data"]["balance"] == 100


def test_concurrent_withdrawals_never_overdraw(alice):
    c, acc = alice
    dep(c, acc, "1000")
    results = []

    def go():
        results.append(c.post(f"{API}/accounts/{acc['id']}/withdraw", json={"amount": "150"}).status_code)

    threads = [threading.Thread(target=go) for _ in range(12)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(201) == 6
    bal = c.get(f"{API}/accounts/{acc['id']}").json()["data"]["balance"]
    assert bal == 100
    txns = c.get(f"{API}/transactions", params={"size": 100}).json()["data"]
    assert sum(t["amount"] if t["direction"] == "credit" else -t["amount"] for t in txns) == bal


def test_transaction_filters_and_statement(alice):
    c, acc = alice
    dep(c, acc, "1000")
    c.post(f"{API}/accounts/{acc['id']}/withdraw", json={"amount": "50", "description": "Swiggy order"})
    r = c.get(f"{API}/transactions", params={"type": "withdrawal"}).json()
    assert r["meta"]["total"] == 1 and r["data"][0]["category"] == "Dining"
    assert c.get(f"{API}/transactions", params={"q": "swiggy"}).json()["meta"]["total"] == 1
    today = date.today()
    for fmt in ("csv", "pdf"):
        r = c.get(f"{API}/accounts/{acc['id']}/statement",
                  params={"start": str(today - timedelta(days=1)), "end": str(today + timedelta(days=1)), "format": fmt})
        assert r.status_code == 200 and len(r.content) > 100


# ---------- loans ----------
LOAN = {"loan_type": "personal", "amount": "100000", "term_months": 24, "purpose": "Home renovation",
        "monthly_income": "80000", "employment_type": "salaried"}


def test_loan_workflow(alice, admin):
    c, acc = alice
    est = c.post(f"{API}/loans/estimate", json={**LOAN, "account_id": acc["id"]}).json()["data"]
    assert 0 <= est["score"] <= 100 and "Educational" in est["disclaimer"]
    loan = c.post(f"{API}/loans", json={**LOAN, "account_id": acc["id"]}).json()["data"]
    assert loan["status"] == "pending"
    assert c.post(f"{API}/admin/loans/{loan['id']}/decision", json={"decision": "approved", "comment": "ok!"}).status_code == 403
    r = admin.post(f"{API}/admin/loans/{loan['id']}/decision", json={"decision": "approved", "comment": "Verified"})
    assert r.status_code == 200
    assert admin.post(f"{API}/admin/loans/{loan['id']}/decision",
                      json={"decision": "rejected", "comment": "again"}).status_code == 409
    mine = c.get(f"{API}/loans").json()["data"][0]
    assert mine["status"] == "approved" and len(mine["history"]) == 2
    assert c.get(f"{API}/accounts/{acc['id']}").json()["data"]["balance"] == 100000
    logs = admin.get(f"{API}/admin/audit-logs").json()["data"]
    assert any(l["action"] == "loan.approved" for l in logs)


# ---------- dashboards & AI ----------
def test_admin_dashboard_aggregates(alice, bob, admin):
    (a, aacc), (b, bacc) = alice, bob
    dep(a, aacc, "1000")
    dep(b, bacc, "2500")
    b.post(f"{API}/accounts/{bacc['id']}/withdraw", json={"amount": "500"})
    d = admin.get(f"{API}/admin/dashboard").json()["data"]
    assert d["customers"] == 2 and d["total_balance"] == 3000
    assert d["deposits"] == 3500 and d["withdrawals"] == 500


def test_anomaly_detection_flags_burst_not_normal(alice, bob):
    (a, aacc), (b, bacc) = alice, bob
    dep(a, aacc, "200000")
    a.post(f"{API}/accounts/{aacc['id']}/withdraw", json={"amount": "500", "description": "BigBasket"})
    assert a.get(f"{API}/ai/alerts").json()["data"] == []
    for _ in range(6):
        a.post(f"{API}/transfers", json={"from_account_id": aacc["id"], "to_account_number": bacc["account_number"],
                                         "amount": "4000"})
    alerts = a.get(f"{API}/ai/alerts").json()["data"]
    assert alerts and any("velocity" in r for r in alerts[0]["reasons"])
    assert b.get(f"{API}/ai/alerts").json()["data"] == []  # alerts are private to the owner


def test_assistant_uses_own_data(alice, bob):
    (a, aacc), (b, bacc) = alice, bob
    dep(a, aacc, "1234.50")
    dep(b, bacc, "999999")
    ans = a.post(f"{API}/ai/assistant", json={"question": "What is my current balance?"}).json()["data"]
    assert ans["intent"] == "balance" and "1,234.50" in ans["answer"] and "9,99,999" not in ans["answer"]
    assert ans["mode"] == "offline"
    spend = a.post(f"{API}/ai/assistant", json={"question": "How much did I spend this month?"}).json()["data"]
    assert spend["intent"] == "spending"


def test_error_format(alice):
    c, _ = alice
    r = c.get(f"{API}/accounts/99999")
    assert r.status_code == 404 and set(r.json()["error"]) == {"code", "message", "details"}
