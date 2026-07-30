"""Health check endpoint for the AI service."""

from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()


@router.get("")
async def health_check():
    return {
        "success": True,
        "data": {
            "status": "ok",
            "service": "trade-z-ai-service",
            "version": "0.1.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
