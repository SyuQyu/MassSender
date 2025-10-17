from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import re

from app.api.api_v1 import api_router
from app.core.config import get_settings
from app.core.scheduler import shutdown_scheduler, start_scheduler


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="WhatsApp Bulk Sender API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # ---- CORS ----
    # Prefer a regex during dev to cover localhost/127.0.0.1 (any port).
    # If you know your exact FE origins, use allow_origins instead.
    allow_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    cors_origins = set()
    if settings.frontend_origin:
        cors_origins.add(str(settings.frontend_origin).rstrip("/"))
    else:
        cors_origins.update({"http://localhost:3000", "http://127.0.0.1:3000"})

    # If you use credentials (cookies, Authorization + fetch with credentials),
    # DO NOT use ["*"]. Use either allow_origins or allow_origin_regex.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cors_origins),          # explicit list (dev defaults above)
        allow_origin_regex=allow_origin_regex,     # also allow any localhost/127.* port
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],                       # includes Authorization, Content-Type, etc.
        expose_headers=["*"],                      # optional: if you need to read custom headers
    )

    @app.middleware("http")
    async def _add_private_network_header(request, call_next):
        response = await call_next(request)
        # Helps with Chrome Private Network Access preflights
        response.headers.setdefault("Access-Control-Allow-Private-Network", "true")
        return response

    app.include_router(api_router, prefix="/api")

    @app.on_event("startup")
    async def _startup() -> None:
        start_scheduler()

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        shutdown_scheduler()

    return app


app = create_app()
