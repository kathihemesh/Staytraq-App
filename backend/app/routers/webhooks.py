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
        response_text = await chatbot_service.get_response(sender_jid, conversation_text, instance_name)
        
        # 2. Call the Evolution client to send the message back to the sender if a reply exists
        if response_text:
            await evolution_client.send_text_message(instance_name, sender_jid, response_text)
        
    return {"status": "success"}

from pydantic import BaseModel
from app.services.supabase import supabase_service

class SendNoticeRequest(BaseModel):
    phone: str
    message: str

@router.post("/send-whatsapp-notice")
async def send_whatsapp_notice(payload: SendNoticeRequest, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header"
        )
    
    token = authorization.split(" ")[1]
    user_data = await supabase_service.verify_token(token)
    if not user_data:
        raise HTTPException(
            status_code=401,
            detail="Invalid Supabase JWT token"
        )
        
    owner_email = user_data.get("email")
    if not owner_email:
        raise HTTPException(
            status_code=400,
            detail="User email not found in auth token"
        )
        
    # Check if chatbot is enabled for this owner
    owner = await supabase_service.get_owner_by_email(owner_email)
    if not owner or not owner.get("chatbot_enabled"):
        raise HTTPException(
            status_code=403,
            detail="Chatbot is not enabled for this owner account."
        )
        
    clean_phone = payload.phone.replace("+", "").replace(" ", "")
    if len(clean_phone) == 10:
        clean_phone = "91" + clean_phone
        
    success = await evolution_client.send_text_message(
        instance_name=owner_email,
        number=clean_phone,
        text=payload.message
    )
    if success:
        return {"status": "success"}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to send message via Evolution API"
        )
