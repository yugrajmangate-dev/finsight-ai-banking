# FinSight Bank — AI-Powered Finance & Banking Management System

An academic mini project that simulates a modern digital bank: customer and admin dashboards, real (simulated) money movement with strict consistency guarantees, loan management, and an AI suite for fraud detection, spending insights, forecasting and a conversational assistant.

> ⚠️ **Educational simulation only.** Demo money, synthetic customers, no connection to real banks or payment networks. Not production-ready.

---

## ✨ Features

### Customer portal
- Registration & secure login (bcrypt + JWT in an httpOnly cookie), profile & password management
- Personal dashboard: balances, money in/out, savings rate, balance trend, income vs expense, category donut
- Multiple savings / current accounts with masked account numbers
- **Payments**: deposit, withdraw, transfer (beneficiary verification, confirmation dialog, receipts)
- Transaction history with search, filters (type, category, date, amount, account), sorting & pagination
- **Account statements** downloadable as **PDF** or **CSV**
- **Loans**: application form, live EMI calculator, AI eligibility estimate, status timeline
- Notifications & security alerts

### Admin console
- Bank-wide dashboard (all metrics aggregated live from the DB): customers, accounts, deposits held, deposits / withdrawals / transfers, daily activity chart, loan pipeline, category spend, account status
- Customer management (search, profile drill-down, activate / deactivate)
- Account controls (freeze / unfreeze / close with validation)
- Bank-wide transaction ledger with filters
- Loan review workflow (approve & auto-disburse / reject with mandatory comment)
- **Fraud monitor**: AI-flagged transactions with risk score, severity, explanations; review / dismiss / escalate & freeze
- **AI analytics**: detection signals, severity mix, risk distribution, model configuration
- **Audit log** of all sensitive actions

### AI features
| Feature | Technique |
|---|---|
| Suspicious transaction detection | Hybrid: 7 explainable rules + robust z-score (median/MAD, category-aware) + scikit-learn **Isolation Forest** on an 8-feature vector. Produces a 0–100 risk score, severity, and human-readable reasons. Runs in real time after every debit. |
| Auto-categorisation | Keyword-rule NLP classifier on transaction descriptions |
| Spending insights | Category breakdown, period-over-period change, 50/30/20 budget analysis, savings opportunities |
| Expense forecast | Linear trend + 3-month moving average (clearly labelled **Estimate**) |
| Loan eligibility | Transparent points model (EMI-to-income, employment, balance, tenure, alerts) — educational only |
| Financial assistant | Offline intent classifier → customer-scoped backend functions → templated answers. Optional LLM mode (Claude API) that only *phrases* backend-computed facts. |

---

## 🏗 Architecture

```
React 18 + Vite + Tailwind + Recharts  ──/api (Vite proxy)──►  FastAPI
                                                               ├─ routers/   auth · customer · admin
                                                               ├─ banking.py  atomic money movement
                                                               ├─ ai/         anomaly · insights · assistant · categorizer
                                                               └─ SQLAlchemy 2.0 → SQLite (PostgreSQL-ready)
```

**Money correctness**
- All amounts stored as **integer paise** (no floats).
- Every operation runs in one DB transaction (`BEGIN IMMEDIATE` on SQLite).
- Debits use a conditional `UPDATE … WHERE balance >= amount` → overdrafts are impossible even under concurrent requests (tested with 12 parallel withdrawals).
- Transfers write paired `transfer_out` / `transfer_in` rows; failure on either side rolls back both.
- `Idempotency-Key` header + unique constraint prevents duplicate processing.
- Each transaction stores `balance_after` → balances are reconcilable.

**Database tables**: `users`, `customer_profiles`, `accounts`, `transactions`, `loan_applications`, `loan_status_history`, `anomaly_alerts`, `notifications`, `audit_logs` (with CHECK constraints, FKs, unique & composite indexes).

---

## 🚀 Setup & run

**Requirements**: Python 3.11+, Node 18+.

### 1. Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # optional — sensible defaults exist
python -m scripts.seed           # creates DB, synthetic data, trains the ML model (~45s)
uvicorn app.main:app --port 8000
```
API docs (Swagger): http://localhost:8000/docs

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**

### Demo credentials
| Role | Email | Password |
|---|---|---|
| Admin | `admin@finsight.demo` | `Admin@123` |
| Customer | `priya@finsight.demo` | `Demo@123` |

All 24 seeded customers (`rahul@`, `ananya@`, `arjun@` … `@finsight.demo`) use `Demo@123`. The login page also has one-click demo buttons.

Seed data: 24 customers, 32 accounts, ~4,400 transactions over 6 months, 12 loans in all states, ~24 AI alerts from planted suspicious patterns (late-night cash, transfer bursts, balance drains, rapid in-out).

---

## 🧪 Testing
```bash
cd backend
python -m pytest -q
```
18 tests cover: registration/login/logout, weak password, role permissions, deposits/withdrawals, invalid amounts, insufficient funds, successful & failed transfers with rollback, ownership isolation, idempotency, **concurrent withdrawals**, filters & statements, full loan workflow + audit, dashboard aggregation, anomaly detection, assistant data isolation, and error format.

Frontend build check: `cd frontend && npm run build`

---

## 🔐 Security
bcrypt password hashing · JWT in httpOnly SameSite=Strict cookie · token versioning (logout-all on password change / deactivation) · server-side role & ownership checks on every endpoint (other customers' resources return 404) · Pydantic validation · parameterised SQL via ORM · login rate limiting · CORS restricted to frontend origin · audit log for admin actions · secrets only via environment variables · app refuses a default JWT secret outside development.

## Optional: LLM-powered assistant
Set `LLM_API_KEY` (Anthropic API key) in `backend/.env` and restart. The assistant then sends only the signed-in customer's backend-computed facts to the model for phrasing, and falls back to offline mode on any error.

## Known limitations
- Single currency (INR); no interest accrual, fees, EMIs or repayments after disbursement
- Notifications are in-app only (no email/SMS)
- Login rate limiter is in-memory (per process)
- Isolation Forest is trained on synthetic data; thresholds tuned for the demo dataset
- No KYC document upload; accounts activate immediately
- Not audited or hardened for production use

---

## ☁️ Deployment (single service)

In production the FastAPI server also serves the built React app, so the UI and API share one URL (no CORS / cookie issues). A multi-stage `Dockerfile` builds the frontend, installs the backend, and bakes in the seeded demo database and trained ML model.

### Render (free, recommended)
1. Push this repo to GitHub.
2. On https://render.com → **New → Blueprint** → select the repo (uses `render.yaml`), or **New → Web Service** → runtime **Docker**.
3. Environment variables: `JWT_SECRET` (any long random string; auto-generated by the blueprint). Optional `LLM_API_KEY`.
4. Deploy. Open `https://<your-service>.onrender.com`.

Notes: free instances sleep after ~15 min idle (first load takes ~1 min); demo data resets on every redeploy/restart.

### Any Docker host (Railway, Fly.io, a VPS)
```bash
docker build -t finsight .
docker run -p 8000:8000 -e JWT_SECRET=change-me-long-random finsight
```
