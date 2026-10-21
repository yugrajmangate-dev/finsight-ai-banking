import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["LLM_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    db.add(User(email="admin@test.io", full_name="Test Admin", role="admin", password_hash=hash_password("Admin@123")))
    db.commit()
    db.close()
    yield


def make_client():
    return TestClient(app)


def register(client, email="alice@test.io", name="Alice Test"):
    r = client.post("/api/v1/auth/register", json={"full_name": name, "email": email, "phone": "9876543210",
                                                   "password": "Secret123", "account_type": "savings"})
    assert r.status_code == 201, r.text
    return client.get("/api/v1/accounts").json()["data"][0]


@pytest.fixture
def alice():
    c = make_client()
    acc = register(c)
    return c, acc


@pytest.fixture
def bob():
    c = make_client()
    acc = register(c, "bob@test.io", "Bob Test")
    return c, acc


@pytest.fixture
def admin():
    c = make_client()
    assert c.post("/api/v1/auth/login", json={"email": "admin@test.io", "password": "Admin@123"}).status_code == 200
    return c
