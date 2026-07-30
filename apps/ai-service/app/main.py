"""
Trade-Z AI Service — FastAPI Application
Market analysis, confidence scoring, pattern recognition, and signal generation.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, analysis

app = FastAPI(
    title="Trade-Z AI Service",
    description="AI-powered market analysis and signal generation engine",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

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


@app.get("/")
async def root():
    return {
        "service": "Trade-Z AI Service",
        "version": "0.1.0",
        "status": "running",
    }
