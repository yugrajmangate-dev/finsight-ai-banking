from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  (register tables)
from .config import BASE_DIR, FRONTEND_ORIGIN, LLM_API_KEY
from .db import Base, engine
from .errors import ApiError, register_error_handlers
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


# In production the built React app (frontend/dist) is served by this same server,
# so the UI and API share one origin and the session cookie works without CORS.
DIST = BASE_DIR.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise ApiError(404, "not_found", "Endpoint not found")
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
