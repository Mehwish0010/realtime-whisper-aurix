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
        mimetype = file.content_type or "audio/webm"
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Received audio: {len(audio_data)} bytes, content_type={file.content_type}, filename={file.filename}")
        # Save for debugging
        with open("debug_audio.webm", "wb") as f:
            f.write(audio_data)
        logger.info("Saved debug audio to debug_audio.webm")
        result = await deepgram_service.transcribe(audio_data, mimetype=mimetype)
        logger.info(f"Transcription result: '{result.get('transcript', '')}' confidence={result.get('confidence', 0)}")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
