"""
Groq Chat Service
"""

from groq import Groq
from app.core.config import settings
from typing import List, Dict


class GroqService:
    """Service for Groq chat completions"""

    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "llama-3.3-70b-versatile",
        temperature: float = 0.7,
        max_tokens: int = 1024
    ) -> dict:
        """
        Get chat completion from Groq

        Args:
            messages: List of message dictionaries
            model: Model to use
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Returns:
            dict with message and usage info
        """
        try:
            response = self.client.chat.completions.create(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            return {
                "message": response.choices[0].message.content,
                "role": "assistant",
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                }
            }

        except Exception as e:
            raise Exception(f"Groq chat failed: {str(e)}")
