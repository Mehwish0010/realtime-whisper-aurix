"""
Cohere Embedding Service
"""

import cohere
from app.core.config import settings
from typing import List


class EmbeddingService:
    """Service for generating embeddings with Cohere"""

    def __init__(self):
        self.client = cohere.Client(settings.COHERE_API_KEY)

    async def generate_embedding(
        self,
        text: str,
        model: str = "embed-english-v3.0",
        input_type: str = "search_document"
    ) -> List[float]:
        """
        Generate embedding for text

        Args:
            text: Text to embed
            model: Cohere embedding model
            input_type: Type of input (search_document or search_query)

        Returns:
            List of float values (embedding vector)
        """
        try:
            response = self.client.embed(
                texts=[text],
                model=model,
                input_type=input_type
            )

            return response.embeddings[0]

        except Exception as e:
            raise Exception(f"Embedding generation failed: {str(e)}")

    async def generate_embeddings_batch(
        self,
        texts: List[str],
        model: str = "embed-english-v3.0",
        input_type: str = "search_document"
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts

        Args:
            texts: List of texts to embed
            model: Cohere embedding model
            input_type: Type of input

        Returns:
            List of embedding vectors
        """
        try:
            response = self.client.embed(
                texts=texts,
                model=model,
                input_type=input_type
            )

            return response.embeddings

        except Exception as e:
            raise Exception(f"Batch embedding generation failed: {str(e)}")
