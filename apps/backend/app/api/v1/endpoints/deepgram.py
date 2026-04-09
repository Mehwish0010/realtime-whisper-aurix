"""
Deepgram STT/TTS Endpoints
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from app.models.schemas import TranscriptionResponse, TTSRequest
from app.services.deepgram_service import DeepgramService

router = APIRouter()
deepgram_service = DeepgramService()


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe audio file to text
    """
    try:
        audio_data = await file.read()
        result = await deepgram_service.transcribe(audio_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """
    Convert text to speech
    Returns binary audio data (audio/mpeg)
    """
    try:
        audio_bytes = await deepgram_service.text_to_speech(
            text=request.text,
            voice=request.voice
        )
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/voices")
async def list_voices():
    """
    List available TTS voices
    """
    return {
        "voices": [
            "aura-asteria-en",
            "aura-luna-en",
            "aura-stella-en",
            "aura-athena-en",
            "aura-hera-en",
            "aura-orion-en",
            "aura-arcas-en",
            "aura-perseus-en",
            "aura-angus-en",
            "aura-orpheus-en",
            "aura-helios-en",
            "aura-zeus-en"
        ]
    }
