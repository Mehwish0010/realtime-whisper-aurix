"""
Deepgram STT/TTS Service
"""

from deepgram import DeepgramClient, PrerecordedOptions, SpeakOptions
from app.core.config import settings


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

    async def text_to_speech(self, text: str, voice: str = "aura-asteria-en") -> bytes:
        """
        Convert text to speech

        Args:
            text: Text to convert
            voice: Voice model to use

        Returns:
            Raw audio bytes (mp3)
        """
        try:
            options = SpeakOptions(model=voice)
            speak_source = {"text": text}
            response = self.client.speak.rest.v("1").stream_memory(speak_source, options)
            return response.stream_memory.getbuffer().tobytes()

        except Exception as e:
            raise Exception(f"TTS failed: {str(e)}")
