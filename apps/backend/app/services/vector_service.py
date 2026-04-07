"""
Qdrant Vector Database Service
"""

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from app.core.config import settings
from typing import List, Dict, Any
import uuid


class VectorService:
    """Service for Qdrant vector database operations"""

    def __init__(self):
        self.client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None
        )
        self.collection_name = settings.QDRANT_COLLECTION

    async def ensure_collection(self, vector_size: int = 1024):
        """
        Ensure collection exists, create if not

        Args:
            vector_size: Dimension of embedding vectors (Cohere v3.0 = 1024)
        """
        try:
            collections = self.client.get_collections().collections
            collection_names = [c.name for c in collections]

            if self.collection_name not in collection_names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=vector_size,
                        distance=Distance.COSINE
                    )
                )

        except Exception as e:
            raise Exception(f"Collection creation failed: {str(e)}")

    async def insert_vectors(
        self,
        vectors: List[List[float]],
        payloads: List[Dict[str, Any]]
    ) -> List[str]:
        """
        Insert vectors into collection

        Args:
            vectors: List of embedding vectors
            payloads: List of metadata for each vector

        Returns:
            List of inserted point IDs
        """
        try:
            await self.ensure_collection()

            points = []
            ids = []

            for vector, payload in zip(vectors, payloads):
                point_id = str(uuid.uuid4())
                ids.append(point_id)
                points.append(
                    PointStruct(
                        id=point_id,
                        vector=vector,
                        payload=payload
                    )
                )

            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )

            return ids

        except Exception as e:
            raise Exception(f"Vector insertion failed: {str(e)}")

    async def search_vectors(
        self,
        query_vector: List[float],
        limit: int = 5,
        score_threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Search for similar vectors

        Args:
            query_vector: Query embedding vector
            limit: Maximum number of results
            score_threshold: Minimum similarity score

        Returns:
            List of search results with scores and payloads
        """
        try:
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold
            )

            return [
                {
                    "id": str(result.id),
                    "score": result.score,
                    "payload": result.payload
                }
                for result in results
            ]

        except Exception as e:
            raise Exception(f"Vector search failed: {str(e)}")

    async def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the collection"""
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                "name": self.collection_name,
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
                "status": info.status
            }
        except Exception as e:
            return {"error": str(e)}
