"""
Deepgram STT Service (TTS handled by InWorld)
"""

from deepgram import DeepgramClient, PrerecordedOptions
from app.core.config import settings


class DeepgramService:
    """Service for Deepgram speech-to-text"""

    def __init__(self):
        self.client = DeepgramClient(api_key=settings.DEEPGRAM_API_KEY)

    async def transcribe(self, audio_data: bytes) -> dict:
        try:
            options = PrerecordedOptions(
                model="nova-2",
                smart_format=True,
                language="en",
            )

            payload = {"buffer": audio_data}
            response = self.client.listen.rest.v("1").transcribe_file(payload, options)

            result = response.results
            transcript = result.channels[0].alternatives[0].transcript
            confidence = result.channels[0].alternatives[0].confidence
            words = [
                {
                    "word": w.word,
                    "start": w.start,
                    "end": w.end,
                    "confidence": w.confidence,
                }
                for w in (result.channels[0].alternatives[0].words or [])
            ]

            return {
                "transcript": transcript,
                "confidence": confidence,
                "words": words,
            }

        except Exception as e:
            raise Exception(f"Transcription failed: {str(e)}")
