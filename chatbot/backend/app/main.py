import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from app.routers import webhooks
from app.services.chatbot import chatbot_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

app = FastAPI(title="Staytraq Chatbot Backend")

# Include webhooks router
app.include_router(webhooks.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Staytraq Chatbot Backend"}

# Diagnostics Console Route
@app.get("/debug", response_class=HTMLResponse)
def get_debug_console():
    try:
        template_path = os.path.join(os.path.dirname(__file__), "templates", "debug.html")
        with open(template_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content, status_code=200)
    except Exception as e:
        logger.error(f"Error serving debug template: {e}")
        raise HTTPException(status_code=500, detail="Debug template not found or unreadable.")

class DebugChatRequest(BaseModel):
    sender_jid: str
    text: str
    instance_name: str

@app.post("/api/v1/debug-chat")
async def debug_chat(payload: DebugChatRequest):
    try:
        reply = await chatbot_service.get_response(
            sender_jid=payload.sender_jid,
            text=payload.text,
            instance_name=payload.instance_name
        )
        # Fetch current Redis session state to inspect it
        session_state = await chatbot_service.get_session(payload.sender_jid)
        return {
            "reply": reply or "No message returned (Instance not mapped).",
            "session_state": session_state
        }
    except Exception as e:
        logger.error(f"Error in debug chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/debug-reset")
async def debug_reset(sender_jid: str):
    try:
        key = f"chatbot:session:{sender_jid}"
        await chatbot_service.redis.delete(key)
        return {"status": "success", "message": "Session reset"}
    except Exception as e:
        logger.error(f"Error resetting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
