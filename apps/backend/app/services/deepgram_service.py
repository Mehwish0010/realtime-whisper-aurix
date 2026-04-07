"""
Deepgram STT/TTS Service
"""

from deepgram import DeepgramClient
from app.core.config import settings
import base64


class DeepgramService:
    """Service for Deepgram speech-to-text and text-to-speech"""

    def __init__(self):
        self.client = DeepgramClient(api_key=settings.DEEPGRAM_API_KEY)

    async def transcribe(self, audio_data: bytes) -> dict:
        """
        Transcribe audio data to text

        Args:
            audio_data: Audio file bytes

        Returns:
            dict with transcript and metadata
        """
        try:
            # Simple version - adjust based on actual Deepgram SDK v6 API
            options = {
                "model": "nova-2",
                "smart_format": True,
                "language": "en",
            }

            # Placeholder - update with actual SDK v6 syntax
            # response = self.client.listen.prerecorded.v("1").transcribe_file(
            #     {"buffer": audio_data},
            #     options
            # )

            return {
                "transcript": "Test transcript",
                "confidence": 0.95,
                "words": []
            }

        except Exception as e:
            raise Exception(f"Transcription failed: {str(e)}")

    async def text_to_speech(self, text: str, voice: str = "aura-asteria-en") -> str:
        """
        Convert text to speech

        Args:
            text: Text to convert
            voice: Voice model to use

        Returns:
            Base64 encoded audio data
        """
        try:
            # Placeholder - update with actual SDK v6 syntax
            # options = {"model": voice}
            # response = self.client.speak.v("1").stream({"text": text}, options)

            # Return placeholder
            return base64.b64encode(b"audio_data_placeholder").decode('utf-8')

        except Exception as e:
            raise Exception(f"TTS failed: {str(e)}")
