"""
API v1 Router - Combines all endpoint routers
"""

from fastapi import APIRouter
from app.api.v1.endpoints import deepgram, groq, rag

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(
    deepgram.router,
    prefix="/deepgram",
    tags=["deepgram"]
)

api_router.include_router(
    groq.router,
    prefix="/groq",
    tags=["groq"]
)

api_router.include_router(
    rag.router,
    prefix="/rag",
    tags=["rag"]
)
