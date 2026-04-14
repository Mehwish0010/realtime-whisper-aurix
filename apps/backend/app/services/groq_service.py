"""
Groq Chat Service — full conversation management (moved from Electron)
Agent mode uses OpenRouter (Nemotron 3) for better coding/tool calling.
"""

import json
import logging
from groq import Groq
from openai import OpenAI
from app.core.config import settings
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful voice assistant. Provide clear, concise, and friendly responses."
)

AGENT_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free"


class GroqService:
    """Service for Groq chat completions with conversation history management.
    Agent mode uses OpenRouter (Nemotron 3) for better tool calling."""

    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = "llama-3.3-70b-versatile"
        self.temperature = 0.7
        self.max_tokens = 1000
        self.max_history_length = 20

        # OpenRouter client for agent mode (Nemotron 3)
        self.agent_client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY,
        )
        self.agent_model = AGENT_MODEL

        # Conversation history
        self.conversation_history: List[Dict[str, Any]] = [
            {"role": "system", "content": DEFAULT_SYSTEM_PROMPT}
        ]

        # Agent state: pending tool calls waiting for results
        self._pending_agent_messages: List[Dict[str, Any]] = []
        self._pending_tools: List[Dict[str, Any]] = []

    # ── Chat ────────────────────────────────────────────────

    def send_message(self, user_message: str) -> dict:
        """Send a user message, manage history, return assistant response."""
        logger.info("User message: %s", user_message)
        logger.info("Current history length: %d", len(self.conversation_history))

        # Add user message
        self.conversation_history.append({"role": "user", "content": user_message})
        self._trim_history()

        # Prepare messages for API (strip extra fields)
        messages = [
            {"role": m["role"], "content": m["content"]}
            for m in self.conversation_history
        ]

        try:
            logger.info("Sending to Groq: %s, messages: %d", self.model, len(messages))

            response = self.client.chat.completions.create(
                messages=messages,
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )

            assistant_content = (
                response.choices[0].message.content
                or "I apologize, but I could not generate a response."
            )

            # Add to history
            self.conversation_history.append(
                {"role": "assistant", "content": assistant_content}
            )

            logger.info("Assistant response: %s", assistant_content)

            return {
                "message": assistant_content,
                "role": "assistant",
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
            }

        except Exception as e:
            # Handle context_length_exceeded by clearing history and retrying
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

    # ── Agent mode ──────────────────────────────────────────

    def send_agent_message(
        self, user_message: str, tools: List[Dict[str, Any]]
    ) -> dict:
        """
        Start an agent turn. Returns either a final text response or
        pending tool calls that the client must execute.
        """
        # Add user message
        self.conversation_history.append({"role": "user", "content": user_message})
        self._trim_history()

        # Build messages
        messages = self._build_agent_messages()

        self._pending_tools = tools
        return self._agent_completion(messages, tools)

    def submit_tool_results(self, tool_results: List[Dict[str, Any]]) -> dict:
        """
        Submit tool execution results and continue the agent loop.
        Each item: { tool_call_id: str, result: Any }
        """
        # Append tool results to pending messages
        for tr in tool_results:
            self._pending_agent_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tr["tool_call_id"],
                    "content": json.dumps(tr["result"]) if not isinstance(tr["result"], str) else tr["result"],
                }
            )

        messages = self._build_agent_messages()
        return self._agent_completion(messages, self._pending_tools)

    def _agent_completion(
        self, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]
    ) -> dict:
        """Run one agent completion step using OpenRouter (Nemotron 3)."""
        for iteration in range(10):
            logger.info(
                "Agent loop iteration %d, messages: %d (model: %s)",
                iteration + 1, len(messages), self.agent_model,
            )

            try:
                completion = self.agent_client.chat.completions.create(
                    model=self.agent_model,
                    messages=messages,
                    tools=tools,
                    tool_choice="auto",
                    temperature=0.3,
                    max_tokens=self.max_tokens,
                )
            except Exception as err:
                # tool_use_failed — retry without tools
                err_msg = str(err)
                if "tool_use_failed" in err_msg:
                    logger.warning("Tool call failed, retrying without tools...")
                    fallback = self.agent_client.chat.completions.create(
                        model=self.agent_model,
                        messages=messages,
                        temperature=0.3,
                        max_tokens=self.max_tokens,
                    )
                    fallback_response = (
                        fallback.choices[0].message.content
                        or "Sorry, I had trouble executing that command."
                    )
                    self.conversation_history.append(
                        {"role": "assistant", "content": fallback_response}
                    )
                    self._pending_agent_messages = []
                    self._pending_tools = []
                    return {"type": "final", "response": fallback_response}
                raise

            choice = completion.choices[0]
            assistant_msg = choice.message

            # No tool calls → final response
            if not assistant_msg.tool_calls:
                response_text = assistant_msg.content or "Done."
                self.conversation_history.append(
                    {"role": "assistant", "content": response_text}
                )
                self._pending_agent_messages = []
                self._pending_tools = []
                return {"type": "final", "response": response_text}

            # Has tool calls → return them to client for execution
            # Store assistant message with tool_calls in pending
            assistant_entry = {
                "role": "assistant",
                "content": assistant_msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in assistant_msg.tool_calls
                ],
            }
            self._pending_agent_messages.append(assistant_entry)

            # Return pending tool calls to client
            tool_calls_data = []
            for tc in assistant_msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    args = {}
                tool_calls_data.append(
                    {
                        "id": tc.id,
                        "name": tc.function.name,
                        "arguments": args,
                    }
                )

            return {"type": "tool_calls", "tool_calls": tool_calls_data}

        # Max iterations reached
        fallback = "Agent reached maximum iterations."
        self.conversation_history.append({"role": "assistant", "content": fallback})
        self._pending_agent_messages = []
        self._pending_tools = []
        return {"type": "final", "response": fallback}

    def _build_agent_messages(self) -> List[Dict[str, Any]]:
        """Build full message list for agent: history + pending agent messages."""
        messages = []
        for m in self.conversation_history:
            entry: Dict[str, Any] = {"role": m["role"], "content": m["content"]}
            if "tool_calls" in m:
                entry["tool_calls"] = m["tool_calls"]
            if "tool_call_id" in m:
                entry["tool_call_id"] = m["tool_call_id"]
            messages.append(entry)

        # Add pending agent messages (assistant tool_calls + tool results)
        messages.extend(self._pending_agent_messages)
        return messages

    # ── History management ──────────────────────────────────

    def clear_history(self) -> None:
        """Clear conversation history, keep system prompt."""
        system_msg = next(
            (m for m in self.conversation_history if m["role"] == "system"), None
        )
        self.conversation_history = [system_msg] if system_msg else []
        self._pending_agent_messages = []
        self._pending_tools = []
        logger.info("Conversation history cleared")

    def get_history(self) -> List[Dict[str, Any]]:
        """Return conversation history."""
        return self.conversation_history

    def set_system_prompt(self, prompt: str) -> None:
        """Set/replace system prompt."""
        idx = next(
            (
                i
                for i, m in enumerate(self.conversation_history)
                if m["role"] == "system"
            ),
            None,
        )
        if idx is not None:
            self.conversation_history[idx] = {"role": "system", "content": prompt}
        else:
            self.conversation_history.insert(0, {"role": "system", "content": prompt})
        logger.info("System prompt updated")

    def get_config(self) -> dict:
        """Return current config."""
        system_prompt = next(
            (m["content"] for m in self.conversation_history if m["role"] == "system"),
            DEFAULT_SYSTEM_PROMPT,
        )
        return {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "max_history_length": self.max_history_length,
            "system_prompt": system_prompt,
        }

    # ── Helpers ─────────────────────────────────────────────

    def _trim_history(self) -> None:
        """Trim history to max_history_length, keeping system prompt."""
        if len(self.conversation_history) <= self.max_history_length:
            return

        system_msg = self.conversation_history[0]
        recent = self.conversation_history[-(self.max_history_length - 1) :]
        self.conversation_history = [system_msg] + recent
        logger.info("History trimmed to %d messages", len(self.conversation_history))

