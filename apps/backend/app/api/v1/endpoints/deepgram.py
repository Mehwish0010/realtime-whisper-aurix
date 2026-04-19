"""
Deepgram STT Endpoints (TTS handled by InWorld via streaming endpoint)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from app.models.schemas import TranscriptionResponse
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
