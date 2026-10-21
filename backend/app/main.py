from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (register tables)
from .config import FRONTEND_ORIGIN, LLM_API_KEY
from .db import Base, engine
from .errors import register_error_handlers
from .routers import admin, auth, customer

Base.metadata.create_all(engine)

app = FastAPI(title="FinSight Bank API", version="1.0.0",
              description="AI-Powered Finance & Banking Management System — simulated demo money only.")
app.add_middleware(CORSMiddleware, allow_origins=[FRONTEND_ORIGIN], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
register_error_handlers(app)

for r in (auth.router, customer.router, admin.router):
    app.include_router(r, prefix="/api/v1")


@app.get("/api/v1/health")
def health():
    return {"data": {"status": "ok", "assistant_mode": "llm" if LLM_API_KEY else "offline"}}
