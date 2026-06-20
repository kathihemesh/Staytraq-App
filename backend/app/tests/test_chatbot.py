import asyncio
import logging
import sys
import os

# Ensure the parent directory is in sys.path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.config import settings
from app.services.supabase import supabase_service
from app.services.chatbot import chatbot_service

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_chatbot")

async def test_owner_lookup(email: str):
    logger.info(f"--- Testing Owner Lookup by Email: {email} ---")
    owner = await supabase_service.get_owner_by_email(email)
    logger.info(f"Owner result: {owner}")
    return owner

async def test_tenant_lookup(phone: str, owner_id: str):
    logger.info(f"--- Testing Active Tenant Lookup for Phone: {phone} under Owner: {owner_id} ---")
    tenant = await supabase_service.get_active_tenant(phone, owner_id)
    logger.info(f"Tenant result: {tenant}")
    return tenant

async def test_available_rooms(owner_id: str):
    logger.info(f"--- Testing Available Rooms Lookup for Owner: {owner_id} ---")
    rooms = await supabase_service.get_available_rooms(owner_id)
    logger.info(f"Rooms result: {rooms}")
    return rooms

async def test_chatbot_response(sender_jid: str, text: str, instance_email: str):
    logger.info(f"--- Testing Chatbot Response for JID: {sender_jid}, Text: '{text}', Instance: '{instance_email}' ---")
    reply = await chatbot_service.get_response(sender_jid, text, instance_email)
    logger.info(f"Reply: {reply}")
    return reply

async def main():
    # 1. Look up owners in the database to get a valid email
    # Let's test with a mock email or get one from the db first
    logger.info("Initializing connection to Supabase...")
    
    # We can fetch a specific owner who has rooms mapped (reddyhemesh77@gmail.com)
    import httpx
    url = f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1/pg_owners?email=eq.reddyhemesh77@gmail.com&select=email,mobile_number,id"
    headers = {
        "apikey": settings.SUPABASE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_KEY}"
    }
    
    owner_email = None
    owner_id = None
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                owners = resp.json()
                if owners:
                    owner_email = owners[0].get("email")
                    owner_id = owners[0].get("id")
                    logger.info(f"Found owner in DB: {owners[0]}")
                else:
                    # Fallback to limit=1
                    fallback_url = f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1/pg_owners?select=email,mobile_number,id&limit=1"
                    fb_resp = await client.get(fallback_url, headers=headers)
                    if fb_resp.status_code == 200:
                        fb_owners = fb_resp.json()
                        if fb_owners:
                            owner_email = fb_owners[0].get("email")
                            owner_id = fb_owners[0].get("id")
                            logger.info(f"Fallback found owner in DB: {fb_owners[0]}")
            else:
                logger.error(f"Error fetching owner for tests: {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Failed to query DB for test setup: {e}")

    if not owner_email:
        logger.error("Could not find any owner in the database to run tests. Exiting.")
        return

    # 2. Run Database service tests
    await test_owner_lookup(owner_email)
    await test_available_rooms(owner_id)

    # Let's see if we can find a tenant for this owner to test tenant lookup
    tenant_url = f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1/tenants_table?owner_id=eq.{owner_id}&status=eq.active&limit=1"
    tenant_phone = "9999999999" # fallback
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(tenant_url, headers=headers)
            if resp.status_code == 200:
                tenants = resp.json()
                if tenants:
                    tenant_phone = tenants[0].get("mobile_number") or tenant_phone
                    logger.info(f"Found tenant in DB for testing: {tenants[0]}")
        except Exception as e:
            logger.error(e)

    await test_tenant_lookup(tenant_phone, owner_id)

    # 3. Test Chatbot Conversations
    tenant_jid = f"{tenant_phone}@s.whatsapp.net"
    
    # Reset Redis sessions first to start clean
    await chatbot_service.redis.delete(f"chatbot:session:{tenant_jid}")
    customer_jid = "9876543210@s.whatsapp.net"
    await chatbot_service.redis.delete(f"chatbot:session:{customer_jid}")

    # A. Test Tenant flow: ask for rent and payment instructions (verifies Settings integration)
    await test_chatbot_response(tenant_jid, "Hi, what is my rent amount and how do I pay? Do you have a UPI?", owner_email)
    
    # B. Test Tenant flow: register 4 complaints in a row (verifies Complaint Rate Limiting)
    logger.info("Registering complaint 1...")
    await test_chatbot_response(tenant_jid, "My bathroom light is flickering. Please fix it.", owner_email)
    logger.info("Registering complaint 2...")
    await test_chatbot_response(tenant_jid, "Water is leaking from the sink.", owner_email)
    logger.info("Registering complaint 3...")
    await test_chatbot_response(tenant_jid, "The WiFi router in the lobby is down.", owner_email)
    logger.info("Registering complaint 4 (Should exceed rate limit)...")
    await test_chatbot_response(tenant_jid, "The geyser is not heating water.", owner_email)

    # C. Test Customer flow: ask for room availability with AC preference and budget (verifies Alternative Pitching & Inclusivity)
    await test_chatbot_response(customer_jid, "Hello, do you have any room available? My budget is 8k to 12k and I prefer AC.", owner_email)

if __name__ == "__main__":
    asyncio.run(main())
