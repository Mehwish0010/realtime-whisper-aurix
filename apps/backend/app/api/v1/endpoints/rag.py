"""
RAG Pipeline Endpoints (Cohere + Qdrant)
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import SearchRequest, SearchResponse, DocumentUpload, DocumentResponse
from app.services.retrieval_service import RetrievalService

router = APIRouter()
retrieval_service = RetrievalService()


@router.post("/search", response_model=SearchResponse)
async def semantic_search(request: SearchRequest):
    """
    Perform semantic search in vector database
    """
    try:
        results = await retrieval_service.search(
            query=request.query,
            limit=request.limit,
            score_threshold=request.score_threshold
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(document: DocumentUpload):
    """
    Upload document to RAG pipeline
    Generates embeddings and stores in Qdrant
    """
    try:
        result = await retrieval_service.upload_document(
            content=document.content,
            metadata=document.metadata
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collection/info")
async def collection_info():
    """
    Get information about the vector collection
    """
    try:
        info = await retrieval_service.get_collection_info()
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
