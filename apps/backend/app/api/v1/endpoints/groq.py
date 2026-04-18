"""
Groq Chat Endpoints — backend-managed conversation history & agent mode
"""

import json
import base64
import logging
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import (
    ChatResponse,
    SimpleMessageRequest,
    StreamTTSRequest,
    SystemPromptRequest,
    AgentRequest,
    AgentToolResultsRequest,
    AgentResponse,
)
from app.services.groq_service import GroqService
from app.services.inworld_tts_service import InWorldTTSService

logger = logging.getLogger(__name__)

router = APIRouter()
groq_service = GroqService()
inworld_tts = InWorldTTSService()


# ── Sentence splitting helper ──────────────────────────────

_SENTENCE_END_RE = re.compile(r'(?<=[.!?;:,])\s')


def _split_sentences(buffer: str):
    """Split buffer into (ready_sentence, remaining_buffer).
    Splits on punctuation followed by whitespace (. ! ? ; : ,)
    or forces a split at last space when buffer > 60 chars.
    Smaller chunks = lower time-to-first-audio."""
    parts = _SENTENCE_END_RE.split(buffer)
    if len(parts) > 1:
        return parts[0].strip(), buffer[len(parts[0]):].lstrip()

    # No punctuation boundary — force split if buffer is long
    if len(buffer) > 60:
        last_space = buffer.rfind(" ", 0, 60)
        if last_space > 10:
            return buffer[:last_space].strip(), buffer[last_space:].strip()

    return None, buffer


@router.post("/chat", response_model=ChatResponse)
async def chat(request: SimpleMessageRequest):
    """
    Send a message — backend manages conversation history.
    """
    try:
        response = groq_service.send_message(request.message)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream-tts")
async def chat_stream_tts(request: StreamTTSRequest):
    """
    Stream LLM tokens via SSE. Accumulates sentences and sends InWorld TTS
    audio for each chunk. Emits:
      event: text   — partial token for live text display
      event: audio  — base64-encoded audio chunk
      event: done   — end of stream
    """
    def _tts_sync(text: str, voice: str) -> bytes:
        """Run async InWorld TTS in a sync context."""
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(
                inworld_tts.text_to_speech(text=text, voice=voice)
            )
        finally:
            loop.close()

    def generate():
        sentence_buffer = ""
        voice = request.voice

        try:
            for token in groq_service.send_message_stream(request.message):
                yield f"event: text\ndata: {json.dumps({'text': token})}\n\n"

                sentence_buffer += token

                ready, sentence_buffer = _split_sentences(sentence_buffer)
                if ready:
                    try:
                        audio_bytes = _tts_sync(ready, voice)
                        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                        yield f"event: audio\ndata: {json.dumps({'audio': audio_b64})}\n\n"
                    except Exception as tts_err:
                        logger.error("InWorld TTS error for chunk: %s", tts_err)

            # Flush remaining buffer
            remaining = sentence_buffer.strip()
            if remaining:
                try:
                    audio_bytes = _tts_sync(remaining, voice)
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                    yield f"event: audio\ndata: {json.dumps({'audio': audio_b64})}\n\n"
                except Exception as tts_err:
                    logger.error("InWorld TTS error for final chunk: %s", tts_err)

        except Exception as e:
            logger.error("Stream error: %s", e)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/agent", response_model=AgentResponse)
async def agent_chat(request: AgentRequest):
    """
    Start an agent turn. Returns either a final response or pending tool calls.
    """
    try:
        result = groq_service.send_agent_message(request.message, request.tools)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/agent/tool-results", response_model=AgentResponse)
async def agent_tool_results(request: AgentToolResultsRequest):
    """
    Submit tool execution results and continue the agent loop.
    """
    try:
        tool_results = [
            {"tool_call_id": tr.tool_call_id, "result": tr.result}
            for tr in request.tool_results
        ]
        result = groq_service.submit_tool_results(tool_results)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/chat/history")
async def clear_history():
    """
    Clear conversation history (keeps system prompt).
    """
    try:
        groq_service.clear_history()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chat/history")
async def get_history():
    """
    Get conversation history.
    """
    return {"history": groq_service.get_history()}


@router.put("/chat/system-prompt")
async def set_system_prompt(request: SystemPromptRequest):
    """
    Set/replace the system prompt.
    """
    try:
        groq_service.set_system_prompt(request.prompt)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """
    List available Groq models.
    """
    return {
        "models": [
            "llama-3.3-70b-versatile",
            "llama-3.1-70b-versatile",
            "mixtral-8x7b-32768",
            "gemma2-9b-it"
        ]
    }
