import logging
from fastapi import APIRouter, Request, Header, HTTPException, status
from pydantic import BaseModel
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


# ==========================================

@router.get("/chatbot/status")
async def get_chatbot_status(authorization: str = Header(None)):
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
        
    owner = await supabase_service.get_owner_by_email(owner_email)
    if not owner:
        return {
            "status": "error",
            "message": "Owner profile not found in database",
            "exists": False,
            "connectionStatus": "not_created",
            "phoneNumber": None,
            "chatbotEnabled": False,
            "autoReplyEnabled": False
        }

    # Fetch status from Evolution API
    evo_status = await evolution_client.get_instance_status(owner_email)
    exists = evo_status.get("exists", False)
    connection_status = evo_status.get("status", "not_created")
    phone_number = evo_status.get("number")
    
    # Map Evolution connectionStatus: "open" -> "connected"
    if exists:
        if connection_status == "open":
            connection_status = "connected"
        else:
            # "close", "connecting", or other non-open states are treated as disconnected (needs pairing)
            connection_status = "disconnected"
    else:
        connection_status = "not_created"

    # Synchronize chatbot_enabled flag in DB based on connection status
    is_connected = (connection_status == "connected")
    if owner.get("chatbot_enabled") != is_connected:
        await supabase_service.update_owner_chatbot_settings(
            owner_id=owner["id"],
            chatbot_enabled=is_connected
        )
            
    return {
        "status": "success",
        "exists": exists,
        "connectionStatus": connection_status,
        "phoneNumber": phone_number,
        "chatbotEnabled": is_connected,
        "autoReplyEnabled": owner.get("auto_reply_enabled", True)
    }


@router.post("/chatbot/create")
async def create_chatbot_instance(request: Request, authorization: str = Header(None)):
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

    owner = await supabase_service.get_owner_by_email(owner_email)
    if not owner:
        raise HTTPException(
            status_code=400,
            detail="Owner profile not found in database"
        )

    # Check if instance already exists in Evolution API
    evo_status = await evolution_client.get_instance_status(owner_email)
    if not evo_status.get("exists"):
        # Create new instance
        create_res = await evolution_client.create_instance(owner_email)
        if not create_res:
            raise HTTPException(
                status_code=500,
                detail="Failed to create chatbot instance on Evolution API"
            )
            
        # Register webhook
        webhook_url = settings.CHATBOT_WEBHOOK_URL or f"{str(request.base_url).rstrip('/')}/api/v1/whatsapp"
        await evolution_client.register_webhook(owner_email, webhook_url)
        
    return {
        "status": "success",
        "connectionStatus": "disconnected"
    }


class PairingCodeRequest(BaseModel):
    phoneNumber: str


@router.post("/chatbot/pairing-code")
async def generate_pairing_code(payload: PairingCodeRequest, authorization: str = Header(None)):
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
        
    # Clean the phone number (digits only)
    clean_phone = "".join(filter(str.isdigit, payload.phoneNumber))
    if not clean_phone:
        raise HTTPException(
            status_code=400,
            detail="Invalid phone number provided."
        )

    # The Evolution API only returns a pairingCode when the instance is freshly
    # created (in 'close' state). If the instance is in 'connecting' state,
    # it returns pairingCode: null. So we must delete + recreate first.
    import asyncio
    await evolution_client.delete_instance(owner_email)
    await asyncio.sleep(2)
    create_res = await evolution_client.create_instance(owner_email)
    if not create_res:
        raise HTTPException(
            status_code=500,
            detail="Failed to recreate chatbot instance before pairing."
        )
    await asyncio.sleep(1)

    # Register webhook again after recreation
    webhook_url = f"{settings.CHATBOT_WEBHOOK_URL}"
    await evolution_client.register_webhook(owner_email, webhook_url)

    # Call Evolution API to generate pairing code
    code_res = await evolution_client.get_pairing_code(owner_email, clean_phone)
    if not code_res:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate pairing code from Evolution API."
        )

    # Evolution API v2 returns 'pairingCode' as the 8-char code
    pairing_code = code_res.get("pairingCode") or code_res.get("code")
    if not pairing_code:
        raise HTTPException(
            status_code=500,
            detail="No pairing code returned from Evolution API."
        )

    return {
        "status": "success",
        "code": pairing_code
    }

@router.delete("/chatbot/delete")
async def delete_chatbot_instance(authorization: str = Header(None)):
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

    owner = await supabase_service.get_owner_by_email(owner_email)
    if not owner:
        raise HTTPException(
            status_code=400,
            detail="Owner profile not found in database"
        )

    # Call Evolution API to delete
    deleted = await evolution_client.delete_instance(owner_email)
    
    # Force set chatbot_enabled = false in DB
    await supabase_service.update_owner_chatbot_settings(
        owner_id=owner["id"],
        chatbot_enabled=False
    )
    
    return {
        "status": "success",
        "message": "Instance deleted successfully" if deleted else "Instance was not found on Evolution but database updated"
    }
