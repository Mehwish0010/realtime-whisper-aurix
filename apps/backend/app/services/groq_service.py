

import json
import logging
from openai import OpenAI
from app.core.config import settings
from typing import List, Dict, Any

# LangGraphChatManager replaces direct Groq SDK for all chat operations
from app.services.langgraph_chat import LangGraphChatManager

logger = logging.getLogger(__name__)

AGENT_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free"


class GroqService:
    """Thin wrapper — chat goes through LangGraph, agent mode still manual.
    Chat history is fully managed by LangGraphChatManager."""

    def __init__(self):
        # all chat + history managed by LangGraph (replaces old self.client = Groq(...))
        self.chat_manager = LangGraphChatManager(
            model="llama-3.1-8b-instant",
            temperature=0.7,
            max_tokens=80,
            max_history_length=20,
        )

        # agent mode still uses OpenRouter directly (will migrate to LangGraph later)
        self.agent_client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY,
        )
        self.agent_model = AGENT_MODEL

        # agent state — tracks pending tool calls between request/response cycles
        self._pending_agent_messages: List[Dict[str, Any]] = []
        self._pending_tools: List[Dict[str, Any]] = []

    # ── Chat — delegated to LangGraph ────────────────────
    # these were 50+ lines each, now just pass through to chat_manager

    def send_message(self, user_message: str) -> dict:
        """Send message via LangGraph chat graph. Returns full response."""
        return self.chat_manager.send_message(user_message)

    def send_message_stream(self, user_message: str):
        """Stream tokens via LangGraph. Used by /chat/stream-tts endpoint."""
        yield from self.chat_manager.send_message_stream(user_message)

    # ── History — delegated to LangGraph ─────────────────
    # history is now LangChain messages inside chat_manager, not dicts here

    def clear_history(self) -> None:
        """Clear chat history + reset agent state."""
        self.chat_manager.clear_history()
        self._pending_agent_messages = []
        self._pending_tools = []

    def get_history(self) -> List[Dict[str, Any]]:
        """Get history as dicts. chat_manager converts from LangChain messages."""
        return self.chat_manager.get_history()

    def set_system_prompt(self, prompt: str) -> None:
        """Set system prompt in LangGraph state."""
        self.chat_manager.set_system_prompt(prompt)

    def get_config(self) -> dict:
        """Get model config from LangGraph chat manager."""
        return self.chat_manager.get_config()

    # ── Agent mode — NOT migrated, still manual loop ─────
    # will be replaced with LangGraph ReAct agent in next phase

    def send_agent_message(
        self, user_message: str, tools: List[Dict[str, Any]]
    ) -> dict:
        """Start agent turn. Returns final response or tool calls for frontend."""
        history = self.chat_manager.get_history()
        history.append({"role": "user", "content": user_message})

        messages = self._build_agent_messages(history)
        self._pending_tools = tools
        return self._agent_completion(messages, tools)

    def submit_tool_results(self, tool_results: List[Dict[str, Any]]) -> dict:
        """Frontend sends tool results back, agent loop continues."""
        for tr in tool_results:
            self._pending_agent_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tr["tool_call_id"],
                    "content": json.dumps(tr["result"]) if not isinstance(tr["result"], str) else tr["result"],
                }
            )

        history = self.chat_manager.get_history()
        messages = self._build_agent_messages(history)
        return self._agent_completion(messages, self._pending_tools)

    def _agent_completion(
        self, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]
    ) -> dict:
        """Agent loop — call LLM, check for tool calls, repeat. Max 10 iterations."""
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
                    max_tokens=80,
                )
            except Exception as err:
                err_msg = str(err)
                if "tool_use_failed" in err_msg:
                    logger.warning("Tool call failed, retrying without tools...")
                    fallback = self.agent_client.chat.completions.create(
                        model=self.agent_model,
                        messages=messages,
                        temperature=0.3,
                        max_tokens=80,
                    )
                    fallback_response = (
                        fallback.choices[0].message.content
                        or "Sorry, I had trouble executing that command."
                    )
                    self._pending_agent_messages = []
                    self._pending_tools = []
                    return {"type": "final", "response": fallback_response}
                raise

            choice = completion.choices[0]
            assistant_msg = choice.message

            # no tool calls = final answer, return to user
            if not assistant_msg.tool_calls:
                response_text = assistant_msg.content or "Done."
                self._pending_agent_messages = []
                self._pending_tools = []
                return {"type": "final", "response": response_text}

            # has tool calls — store and return to frontend for execution
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

            # format tool calls for frontend
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

        # safety net — stop after 10 iterations
        fallback = "Agent reached maximum iterations."
        self._pending_agent_messages = []
        self._pending_tools = []
        return {"type": "final", "response": fallback}

    def _build_agent_messages(self, history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Combine chat history + pending agent messages for next LLM call."""
        messages = []
        for m in history:
            entry: Dict[str, Any] = {"role": m["role"], "content": m["content"]}
            if "tool_calls" in m:
                entry["tool_calls"] = m["tool_calls"]
            if "tool_call_id" in m:
                entry["tool_call_id"] = m["tool_call_id"]
            messages.append(entry)

        messages.extend(self._pending_agent_messages)
        return messages
