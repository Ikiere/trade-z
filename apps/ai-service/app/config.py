"""Configuration settings for the AI service."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = True

    # NestJS Backend
    backend_url: str = "http://localhost:3001/api/v1"

    # Market Data
    market_data_api_key: Optional[str] = None
    market_data_provider: str = "twelve_data"

    # AI
    min_confidence_threshold: float = 85.0
    high_confidence_threshold: float = 95.0

    # LLM (optional - for AI chat and explanations)
    llm_api_key: Optional[str] = None
    llm_model: str = "gpt-4o-mini"
    llm_provider: str = "openai"

    class Config:
        env_file = ".env"
        env_prefix = "AI_"


settings = Settings()
