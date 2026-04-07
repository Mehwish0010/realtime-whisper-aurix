"""
RAG Retrieval Service - Combines Embedding and Vector services
"""

from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from typing import Dict, Any, Optional


class RetrievalService:
    """High-level service for RAG operations"""

    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()

    async def search(
        self,
        query: str,
        limit: int = 5,
        score_threshold: float = 0.7
    ) -> Dict[str, Any]:
        """
        Perform semantic search

        Args:
            query: Search query text
            limit: Maximum results
            score_threshold: Minimum similarity score

        Returns:
            Search results with relevant documents
        """
        try:
            # Generate query embedding
            query_embedding = await self.embedding_service.generate_embedding(
                text=query,
                input_type="search_query"
            )

            # Search in vector database
            results = await self.vector_service.search_vectors(
                query_vector=query_embedding,
                limit=limit,
                score_threshold=score_threshold
            )

            # Format results
            formatted_results = [
                {
                    "id": result["id"],
                    "score": result["score"],
                    "content": result["payload"].get("content", ""),
                    "metadata": result["payload"].get("metadata", {})
                }
                for result in results
            ]

            return {
                "query": query,
                "results": formatted_results
            }

        except Exception as e:
            raise Exception(f"Search failed: {str(e)}")

    async def upload_document(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Upload document to RAG pipeline

        Args:
            content: Document text content
            metadata: Optional metadata

        Returns:
            Upload status and document ID
        """
        try:
            # Generate embedding
            embedding = await self.embedding_service.generate_embedding(
                text=content,
                input_type="search_document"
            )

            # Prepare payload
            payload = {
                "content": content,
                "metadata": metadata or {}
            }

            # Insert into vector database
            ids = await self.vector_service.insert_vectors(
                vectors=[embedding],
                payloads=[payload]
            )

            return {
                "id": ids[0],
                "message": "Document uploaded successfully",
                "status": "success"
            }

        except Exception as e:
            raise Exception(f"Document upload failed: {str(e)}")

    async def get_collection_info(self) -> Dict[str, Any]:
        """Get vector collection information"""
        return await self.vector_service.get_collection_info()
