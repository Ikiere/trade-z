"""
Trade-Z AI Service — FastAPI Application
Market analysis, confidence scoring, pattern recognition, and signal generation.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, analysis, backtest

app = FastAPI(
    title="Trade-Z AI Service",
    description="AI-powered market analysis, backtesting, and signal generation engine",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

import re
import traceback
from starlette.requests import Request
from fastapi.responses import JSONResponse

# Global Exception Handler: Return transparent diagnosis rather than opaque 500
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[Unhandled Exception] {request.method} {request.url.path}: {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": str(exc),
            "error_type": type(exc).__name__,
            "traceback": tb.splitlines()[-6:],
            "path": request.url.path
        }
    )

# Normalize URL paths (e.g. //api/v1/... -> /api/v1/...) to prevent 404s
@app.middleware("http")
async def normalize_path_middleware(request: Request, call_next):
    if request.scope.get("type") == "http" and "//" in request.scope.get("path", ""):
        request.scope["path"] = re.sub(r"/+", "/", request.scope["path"])
    return await call_next(request)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["Analysis"])
app.include_router(backtest.router, prefix="/api/v1/backtest", tags=["Backtest"])


@app.get("/")
async def root():
    return {
        "service": "Trade-Z AI Service",
        "version": "0.1.0",
        "status": "running",
    }
