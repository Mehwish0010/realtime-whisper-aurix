

import logging
from typing import List, Dict, Any, Optional

# LangGraph ---- graph builder for creating node-based workflows
from langgraph.graph import StateGraph, START, END

# ChatGroq ----- LangChain wrapper around Groq SDK, used instead of raw Groq client
from langchain_groq import ChatGroq

# LangChain message types ------ history is stored as these objects, not plain dicts
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage

from app.core.config import settings

logger = logging.getLogger(__name__)

# default system prompt ------ same as before, moved here from groq_service.py
DEFAULT_SYSTEM_PROMPT = (
    "You are a voice assistant. STRICT RULE: Reply in 1-2 sentences ONLY. "
    "Never exceed 30 words. No lists, no bullet points, no elaboration. "
    "Be casual and direct like a quick chat with a friend."
)

# max messages to keep in history (including system prompt)
MAX_HISTORY_LENGTH = 20


class LangGraphChatManager:
    """Owns the chat graph, LLM instances, and conversation history.
    GroqService delegates all chat + history calls here."""

    def __init__(
        self,
        model: str = "llama-3.1-8b-instant",
        temperature: float = 0.7,
        max_tokens: int = 80,
        max_history_length: int = MAX_HISTORY_LENGTH,
    ):
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.max_history_length = max_history_length

        # conversation history — stored as LangChain message objects
        # e.g. [SystemMessage("..."), HumanMessage("hello"), AIMessage("hi")]
        self.messages: List[BaseMessage] = [
            SystemMessage(content=DEFAULT_SYSTEM_PROMPT)
        ]

        # LLM for raw (non-streaming) responses — used by chat graph
        self._llm = ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # LLM for streaming — yields tokens one by one, used by TTS pipeline
        self._stream_llm = ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            streaming=True,
        )

        # compile the chat graph once at init
        self.chat_graph = self._build_chat_graph()

    def _build_chat_graph(self):
        """Build a simple graph: START -> chat_node -> END.
        Only 1 node now, but can be extended later with RAG, memory, guardrails."""
        llm = self._llm

        def chat_node(state: dict) -> dict:
            """Takes messages from state, calls LLM, returns response."""
            messages = state["messages"]
            result = llm.invoke(messages)
            return {
                "messages": messages + [result],
                "response": result.content,
            }

        graph = StateGraph(dict)
        graph.add_node("chat", chat_node)  # single node — LLM call
        graph.add_edge(START, "chat")       # entry point
        graph.add_edge("chat", END)         # exit point

        return graph.compile()

    # ── Chat ──────────────────────────────────────────────

    def send_message(self, user_message: str) -> dict:
        """Add user message to history, run graph, return AI response.
        Returns same dict format as old groq_service so endpoints don't break."""
        logger.info("User message: %s", user_message)
        logger.info("Current history length: %d", len(self.messages))

        # add user message as LangChain HumanMessage
        self.messages.append(HumanMessage(content=user_message))
        self._trim_history()

        try:
            logger.info("Sending to LangGraph chat: %s, messages: %d", self.model, len(self.messages))

            # invoke the graph — passes messages through chat_node
            result = self.chat_graph.invoke({"messages": self.messages, "response": ""})

            assistant_content = (
                result.get("response")
                or "I apologize, but I could not generate a response."
            )

            # add AI response to history
            self.messages.append(AIMessage(content=assistant_content))
            logger.info("Assistant response: %s", assistant_content)

            # usage is None — LangGraph doesn't expose token counts same way
            return {
                "message": assistant_content,
                "role": "assistant",
                "usage": None,
            }

        except Exception as e:
            # if context too long, clear history and retry with just this message
            if "context_length_exceeded" in str(e):
                logger.warning("Context length exceeded, clearing history and retrying")
                self.clear_history()
                return self.send_message(user_message)

            status = getattr(e, "status_code", None) or getattr(e, "status", None)
            if status == 401:
                raise Exception("Invalid Groq API key. Please check your configuration.")
            elif status == 429:
                raise Exception("Groq API rate limit exceeded. Please try again in a moment.")
            elif status == 400:
                raise Exception(f"Invalid request: {str(e)}")

            raise Exception(f"Chat error: {str(e)}")

    def send_message_stream(self, user_message: str):
        """Stream tokens one by one. TTS pipeline needs this to generate
        audio per sentence as tokens arrive."""
        logger.info("User message (stream): %s", user_message)

        self.messages.append(HumanMessage(content=user_message))
        self._trim_history()

        try:
            full_response = ""
            # stream() yields AIMessageChunk objects with .content
            for chunk in self._stream_llm.stream(self.messages):
                if chunk.content:
                    full_response += chunk.content
                    yield chunk.content

            if not full_response:
                full_response = "I apologize, but I could not generate a response."

            # after stream ends, save full response to history
            self.messages.append(AIMessage(content=full_response))
            logger.info("Streaming response complete, length: %d", len(full_response))

        except Exception as e:
            if "context_length_exceeded" in str(e):
                logger.warning("Context length exceeded during stream, clearing history")
                self.clear_history()
                self.messages.append(HumanMessage(content=user_message))
                yield from self.send_message_stream(user_message)
                return

            raise Exception(f"Chat stream error: {str(e)}")

    # ── History Management ────────────────────────────────

    def clear_history(self) -> None:
        """Reset messages list, keep only system prompt."""
        system_msg = next(
            (m for m in self.messages if isinstance(m, SystemMessage)), None
        )
        self.messages = [system_msg] if system_msg else []
        logger.info("Conversation history cleared")

    def get_history(self) -> List[Dict[str, Any]]:
        """Convert LangChain messages back to dicts for API responses.
        Endpoints expect [{"role": "user", "content": "..."}] format."""
        return [
            {"role": self._msg_role(m), "content": m.content}
            for m in self.messages
        ]

    def set_system_prompt(self, prompt: str) -> None:
        """Find SystemMessage in list and replace it. If none exists, insert at start."""
        for i, m in enumerate(self.messages):
            if isinstance(m, SystemMessage):
                self.messages[i] = SystemMessage(content=prompt)
                logger.info("System prompt updated")
                return
        self.messages.insert(0, SystemMessage(content=prompt))
        logger.info("System prompt set")

    def get_config(self) -> dict:
        """Return current model config and system prompt."""
        system_prompt = next(
            (m.content for m in self.messages if isinstance(m, SystemMessage)),
            DEFAULT_SYSTEM_PROMPT,
        )
        return {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "max_history_length": self.max_history_length,
            "system_prompt": system_prompt,
        }

    # ── Helpers ───────────────────────────────────────────

    def _trim_history(self) -> None:
        """Keep system prompt (first msg) + last (max-1) messages. Discard old ones."""
        if len(self.messages) <= self.max_history_length:
            return

        system_msg = self.messages[0] if isinstance(self.messages[0], SystemMessage) else None
        recent = self.messages[-(self.max_history_length - 1):]
        self.messages = ([system_msg] if system_msg else []) + recent
        logger.info("History trimmed to %d messages", len(self.messages))

    @staticmethod
    def _msg_role(msg: BaseMessage) -> str:
        """Convert LangChain message type to role string for API dicts."""
        if isinstance(msg, SystemMessage):
            return "system"
        elif isinstance(msg, HumanMessage):
            return "user"
        elif isinstance(msg, AIMessage):
            return "assistant"
        return "unknown"
