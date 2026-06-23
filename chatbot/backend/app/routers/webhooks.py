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
        
        # Deduplicate duplicate webhook events from Evolution API
        msg_id = key.get("id")
        if msg_id:
            dedup_key = f"webhook:processed:{msg_id}"
            is_new = await chatbot_service.redis.set(dedup_key, "1", ex=60, nx=True)
            if not is_new:
                logger.info(f"Ignoring duplicate message event {msg_id} from {sender_jid}")
                return {"status": "ignored", "reason": "duplicate_event"}
        
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

class SendGroupNoticeRequest(BaseModel):
    message: str

@router.post("/send-group-notice")
async def send_group_notice(payload: SendGroupNoticeRequest, authorization: str = Header(None)):
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
        
    # Fetch owner settings to get whatsapp_invite_link
    settings_data = await supabase_service.get_owner_settings(owner["id"])
    invite_link = settings_data.get("whatsapp_invite_link")
    if not invite_link:
        raise HTTPException(
            status_code=400,
            detail="WhatsApp invite link is not configured in settings."
        )
        
    # Resolve the invite link to get group JID
    jid = await evolution_client.get_group_jid(
        instance_name=owner_email,
        invite_url=invite_link
    )
    if not jid:
        raise HTTPException(
            status_code=500,
            detail="Failed to resolve group JID from invite link."
        )
        
    # Send message to the JID
    success = await evolution_client.send_text_message(
        instance_name=owner_email,
        number=jid,
        text=payload.message
    )
    if success:
        return {"status": "success", "jid": jid}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to send message to the WhatsApp group via Evolution API"
        )

class PaymentRejectionRequest(BaseModel):
    payment_id: int
    rejection_reason: str = ""

@router.post("/send-payment-rejection")
async def send_payment_rejection(payload: PaymentRejectionRequest, authorization: str = Header(None)):
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

    # 1. Fetch payment record
    payment = await supabase_service.get_payment_by_id(payload.payment_id)
    if not payment:
        raise HTTPException(
            status_code=404,
            detail=f"Payment record not found for ID: {payload.payment_id}"
        )
        
    tenant_id = payment.get("tenant_id")
    owner_id = payment.get("owner_id")
    month = payment.get("month")
    year = payment.get("year")
    amount = payment.get("total_amount") or payment.get("rent_amount", 0)

    # 2. Fetch tenant record
    tenant = await supabase_service.get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=f"Tenant not found for ID: {tenant_id}"
        )
        
    tenant_name = tenant.get("name", "Resident")
    phone = tenant.get("mobile_number")
    if not phone:
        raise HTTPException(
            status_code=400,
            detail="Tenant does not have a registered mobile number."
        )

    # 3. Retrieve or create payment link
    portal_token = await supabase_service.get_or_create_payment_link(owner_id, month, year)
    if not portal_token:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate resubmission portal link."
        )
        
    payment_link = f"https://staytraq.vercel.app/pay/{portal_token}"
    
    # 4. Construct message
    months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    month_name = months[month - 1] if 1 <= month <= 12 else f"Month {month}"
    
    message = (
        f"Hi {tenant_name},\n\n"
        f"⚠️ *Your payment submission has been rejected.*\n\n"
        f"📋 *Bill Details*:\n"
        f"- Month: {month_name} {year}\n"
        f"- Amount: ₹{amount}\n"
    )
    
    if payload.rejection_reason and payload.rejection_reason.strip():
        message += f"- Reason: {payload.rejection_reason.strip()}\n"
        
    message += f"\n🔗 Please resubmit your payment and upload correct proof here: {payment_link}\n\nThank you!"

    clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "")
    if len(clean_phone) == 10:
        clean_phone = "91" + clean_phone
        
    # 5. Send message via Evolution client
    success = await evolution_client.send_text_message(
        instance_name=owner_email,
        number=clean_phone,
        text=message
    )
    if success:
        return {"status": "success"}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to deliver WhatsApp rejection message."
        )
