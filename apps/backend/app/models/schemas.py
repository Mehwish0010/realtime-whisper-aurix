"""
Pydantic Models for Request/Response Schemas
"""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any


# Deepgram STT Models
class TranscriptionRequest(BaseModel):
    """Request model for audio transcription"""
    audio_url: Optional[str] = None
    language: str = "en"
    model: str = "nova-2"


class TranscriptionResponse(BaseModel):
    """Response model for transcription"""
    transcript: str
    confidence: float
    words: Optional[List[Dict[str, Any]]] = None


# Deepgram TTS Models
class TTSRequest(BaseModel):
    """Request model for text-to-speech"""
    text: str
    voice: str = "aura-asteria-en"
    model: str = "aura-asteria-en"


# Groq Chat Models
class ChatMessage(BaseModel):
    """Single chat message"""
    role: str  # system, user, assistant
    content: str


class ChatRequest(BaseModel):
    """Request model for chat completion"""
    messages: List[ChatMessage]
    model: str = "llama-3.3-70b-versatile"
    temperature: float = 0.7
    max_tokens: int = 1024
    stream: bool = False


class ChatResponse(BaseModel):
    """Response model for chat"""
    message: str
    role: str = "assistant"
    usage: Optional[Dict[str, int]] = None


class SimpleMessageRequest(BaseModel):
    """Request model for simple chat (backend manages history)"""
    message: str


class SystemPromptRequest(BaseModel):
    """Request model for setting system prompt"""
    prompt: str


class AgentToolDefinition(BaseModel):
    """Tool definition for agent mode"""
    type: str = "function"
    function: Dict[str, Any]


class AgentRequest(BaseModel):
    """Request model for agent mode"""
    message: str
    tools: List[Dict[str, Any]]


class AgentToolResult(BaseModel):
    """Single tool result"""
    tool_call_id: str
    result: Any


class AgentToolResultsRequest(BaseModel):
    """Request model for submitting tool results"""
    tool_results: List[AgentToolResult]


class AgentResponse(BaseModel):
    """Response model for agent mode"""
    type: str  # "final" or "tool_calls"
    response: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None


# RAG Models
class EmbeddingRequest(BaseModel):
    """Request for generating embeddings"""
    text: str
    model: str = "embed-english-v3.0"


class SearchRequest(BaseModel):
    """Request for semantic search"""
    query: str
    limit: int = 5
    score_threshold: float = 0.7


class SearchResult(BaseModel):
    """Single search result"""
    id: str
    score: float
    content: str
    metadata: Optional[Dict[str, Any]] = None


class SearchResponse(BaseModel):
    """Response with search results"""
    results: List[SearchResult]
    query: str


# Document Models
class DocumentUpload(BaseModel):
    """Request for uploading document to RAG"""
    content: str
    metadata: Optional[Dict[str, Any]] = None


class DocumentResponse(BaseModel):
    """Response after document upload"""
    id: str
    message: str
    status: str
