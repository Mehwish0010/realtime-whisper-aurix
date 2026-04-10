"""
Groq Chat Endpoints — backend-managed conversation history & agent mode
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    ChatResponse,
    SimpleMessageRequest,
    SystemPromptRequest,
    AgentRequest,
    AgentToolResultsRequest,
    AgentResponse,
)
from app.services.groq_service import GroqService

router = APIRouter()
groq_service = GroqService()


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
