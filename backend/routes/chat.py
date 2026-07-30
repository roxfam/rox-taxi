"""Chat router — Claude live-chat concierge via SSE + history.

Endpoints:
    POST /chat/stream           — server-sent-events stream from Claude Sonnet 4.6
    GET  /chat/history/{sid}    — historical messages for a chat session

Wired up by server.py via `configure()` + `include_router()`. Same
factory-configure pattern as routes/payments.py, routes/admin.py, routes/catalog.py.
"""
from typing import Callable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone


_db = None
_now_iso: Callable = lambda: ""
_llm_key: str = ""
_system_message: str = ""


def configure(*, db, now_iso: Callable, llm_key: str, system_message: str):
    """Called once at app startup."""
    global _db, _now_iso, _llm_key, _system_message
    _db = db
    _now_iso = now_iso
    _llm_key = llm_key
    _system_message = system_message


router = APIRouter()


class ChatIn(BaseModel):
    session_id: str
    message: str


@router.post("/chat/stream")
async def chat_stream(req: ChatIn):
    if not _llm_key:
        raise HTTPException(500, "LLM key not configured")

    await _db.chat_messages.insert_one({
        "session_id": req.session_id, "role": "user", "text": req.message, "ts": _now_iso(),
    })

    chat = LlmChat(
        api_key=_llm_key, session_id=req.session_id, system_message=_system_message,
    ).with_model("anthropic", "claude-sonnet-4-6")

    full_text: list[str] = []

    async def gen():
        try:
            async for ev in chat.stream_message(UserMessage(text=req.message)):
                if isinstance(ev, TextDelta):
                    full_text.append(ev.content)
                    yield f"data: {ev.content}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:  # noqa: BLE001
            yield f"event: error\ndata: {str(e)}\n\n"
        finally:
            await _db.chat_messages.insert_one({
                "session_id": req.session_id, "role": "assistant",
                "text": "".join(full_text), "ts": _now_iso(),
            })
            yield "event: done\ndata: [DONE]\n\n"

    return StreamingResponse(
        gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/chat/history/{session_id}")
async def chat_history(session_id: str):
    docs = await _db.chat_messages.find({"session_id": session_id}).sort("ts", 1).to_list(200)
    return [{"role": d["role"], "text": d["text"], "ts": d["ts"]} for d in docs]
