"""
InWorld TTS Service — low-latency text-to-speech via InWorld API
"""

import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

INWORLD_TTS_URL = "https://api.inworld.ai/tts/v1/voice"


class InWorldTTSService:
    def __init__(self):
        self.api_key = settings.INWORLD_API_KEY
        if not self.api_key:
            logger.warning("INWORLD_API_KEY not set — InWorld TTS unavailable")

    async def text_to_speech(
        self,
        text: str,
        voice: str = "Ashley",
        model: str = "inworld-tts-1.5-mini",
    ) -> bytes:
        """Convert text to speech using InWorld TTS API.
        Returns raw audio bytes (MP3)."""
        if not self.api_key:
            raise Exception("InWorld API key not configured")

        headers = {
            "Authorization": f"Basic {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "text": text,
            "voiceId": voice,
            "modelId": model,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                INWORLD_TTS_URL,
                headers=headers,
                json=payload,
            )

            if response.status_code != 200:
                logger.error(
                    "InWorld TTS error: %d %s", response.status_code, response.text[:200]
                )
                raise Exception(f"InWorld TTS failed: {response.status_code}")

            data = response.json()
            audio_b64 = data.get("audioContent", "")
            if not audio_b64:
                raise Exception("InWorld TTS returned empty audio")

            import base64
            return base64.b64decode(audio_b64)
