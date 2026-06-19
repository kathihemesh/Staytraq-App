import logging
from fastapi import APIRouter, Request, Header, HTTPException, status
from app.config import settings
from app.services.chatbot import chatbot_service
from app.services.evolution import evolution_client

logger = logging.getLogger("backend.webhooks")
router = APIRouter()

@router.post("/whatsapp")
async def receive_whatsapp_webhook(request: Request, authorization: str = Header(None)):
    # Authenticating incoming webhook from Evolution API
    # Expected Header: Authorization: Bearer staytraq_chatbot_secret_key
    if authorization != f"Bearer {settings.EVOLUTION_API_KEY}":
        logger.warning(f"Unauthorized Webhook request blocked: {authorization}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Authorization header"
        )
    
    payload = await request.json()
    event_type = payload.get("event")
    instance_name = payload.get("instance")
    
    logger.info(f"Received WhatsApp event: {event_type} for instance: {instance_name}")
    
    # Process MESSAGES_UPSERT event
    if event_type in ["messages.upsert", "MESSAGES_UPSERT"]:
        data = payload.get("data", {})
        key = data.get("key", {})
        
        # Guard clause: ignore messages sent by the bot itself to prevent infinite loops
        if key.get("fromMe", False):
            return {"status": "ignored", "reason": "sent_from_me"}
            
        sender_jid = key.get("remoteJid")
        
        # Get content type of message
        message_content = data.get("message", {})
        conversation_text = message_content.get("conversation", "")
        
        if not conversation_text and "extendedTextMessage" in message_content:
            conversation_text = message_content["extendedTextMessage"].get("text", "")
            
        if not conversation_text:
            logger.info(f"Ignoring non-text message type from {sender_jid}")
            return {"status": "ignored", "reason": "non_text_message"}
            
        logger.info(f"Incoming message from {sender_jid}: {conversation_text}")
        
        # 1. Feed the message to the chatbot logic to get the response and transition state
        response_text = await chatbot_service.get_response(sender_jid, conversation_text)
        
        # 2. Call the Evolution client to send the message back to the sender
        await evolution_client.send_text_message(instance_name, sender_jid, response_text)
        
    return {"status": "success"}
