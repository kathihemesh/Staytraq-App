import logging
import httpx
from app.config import settings

logger = logging.getLogger("backend.services.evolution")

class EvolutionClient:
    def __init__(self):
        self.base_url = settings.EVOLUTION_API_URL.rstrip("/")
        self.headers = {
            "apikey": settings.EVOLUTION_API_KEY,
            "Content-Type": "application/json"
        }

    async def send_text_message(self, instance_name: str, number: str, text: str) -> bool:
        """Sends a plain text message to a WhatsApp number."""
        url = f"{self.base_url}/message/sendText/{instance_name}"
        # Clean number from @c.us if passed, Evolution accepts raw numbers or formats like 123456@c.us
        if "@g.us" in number:
            clean_number = number
        else:
            clean_number = number.split("@")[0]
        
        payload = {
            "number": clean_number,
            "text": text
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=10.0)
                if response.status_code in [200, 201]:
                    logger.info(f"Successfully sent message to {clean_number}")
                    return True
                logger.error(f"Failed to send message: {response.status_code} - {response.text}")
                return False
            except Exception as e:
                logger.error(f"Error calling sendText API: {e}")
                return False

    async def get_group_jid(self, instance_name: str, invite_url: str) -> str:
        """Resolves an invite URL to a group JID via inviteInfo endpoint."""
        # Extract invite code
        invite_code = ""
        if invite_url:
            invite_url = invite_url.strip()
            if "/" in invite_url:
                parts = [p for p in invite_url.split("/") if p]
                if parts:
                    last_part = parts[-1]
                    if "?" in last_part:
                        last_part = last_part.split("?")[0]
                    invite_code = last_part
            else:
                invite_code = invite_url

        if not invite_code:
            logger.error("No invite code could be extracted from invite URL.")
            return None

        url = f"{self.base_url}/group/inviteInfo/{instance_name}"
        params = {
            "inviteCode": invite_code
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params, headers=self.headers, timeout=10.0)
                if response.status_code in [200, 201]:
                    data = response.json()
                    # Check both wrapper and nested/direct formats
                    return data.get("id") or data.get("response", {}).get("id")
                logger.error(f"Failed to get group JID: {response.status_code} - {response.text}")
                return None
            except Exception as e:
                logger.error(f"Error calling inviteInfo API: {e}")
                return None

    async def register_webhook(self, instance_name: str, webhook_url: str) -> bool:
        """Registers the FastAPI backend webhook inside Evolution API for the instance."""
        url = f"{self.base_url}/webhook/set/{instance_name}"
        payload = {
            "webhook": {
                "enabled": True,
                "url": webhook_url,
                "headers": {
                    "Authorization": f"Bearer {settings.EVOLUTION_API_KEY}"
                },
                "byEvents": False,
                "events": [
                    "MESSAGES_UPSERT"
                ]
            }
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=10.0)
                if response.status_code in [200, 201]:
                    logger.info(f"Successfully registered webhook {webhook_url} for {instance_name}")
                    return True
                logger.error(f"Failed to register webhook: {response.status_code} - {response.text}")
                return False
            except Exception as e:
                logger.error(f"Error registering webhook: {e}")
                return False

    async def get_instance_status(self, instance_name: str) -> dict:
        """Fetches connection status and phone number of an instance from Evolution API."""
        url = f"{self.base_url}/instance/fetchInstances"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    instances = response.json()
                    for inst in instances:
                        inst_details = inst.get("instance", {})
                        name = inst_details.get("instanceName")
                        if name == instance_name:
                            status = inst_details.get("connectionStatus") or inst_details.get("status")
                            profile = inst.get("profile") or {}
                            number = profile.get("number") or inst.get("owner")
                            if number and "@" in number:
                                number = number.split("@")[0]
                            return {
                                "exists": True,
                                "status": status,
                                "number": number
                            }
                    # Fallback to connectionState if not in fetch list
                    state_url = f"{self.base_url}/instance/connectionState/{instance_name}"
                    state_response = await client.get(state_url, headers=self.headers, timeout=10.0)
                    if state_response.status_code == 200:
                        data = state_response.json()
                        status = data.get("instance", {}).get("status") or data.get("connectionStatus")
                        return {
                            "exists": True,
                            "status": status,
                            "number": None
                        }
                    elif state_response.status_code == 404:
                        return {"exists": False, "status": "not_created", "number": None}
                    return {"exists": False, "status": "error", "number": None}
                else:
                    logger.error(f"Failed to fetch instances: {response.status_code} - {response.text}")
                    # Fallback to connectionState
                    state_url = f"{self.base_url}/instance/connectionState/{instance_name}"
                    state_response = await client.get(state_url, headers=self.headers, timeout=10.0)
                    if state_response.status_code == 200:
                        data = state_response.json()
                        status = data.get("instance", {}).get("status") or data.get("connectionStatus")
                        return {
                            "exists": True,
                            "status": status,
                            "number": None
                        }
                    elif state_response.status_code == 404:
                        return {"exists": False, "status": "not_created", "number": None}
                    return {"exists": False, "status": "error", "number": None}
            except Exception as e:
                logger.error(f"Error checking instance status: {e}")
                return {"exists": False, "status": "error", "number": None}

    async def create_instance(self, instance_name: str) -> dict:
        """Creates an instance in Evolution API."""
        url = f"{self.base_url}/instance/create"
        payload = {
            "instanceName": instance_name,
            "token": settings.EVOLUTION_API_KEY,
            "qrcode": True,
            "integration": "WHATSAPP-BAILEYS"
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=15.0)
                if response.status_code in [200, 201]:
                    return response.json()
                logger.error(f"Failed to create instance: {response.status_code} - {response.text}")
                return None
            except Exception as e:
                logger.error(f"Error creating instance: {e}")
                return None

    async def connect_instance(self, instance_name: str) -> dict:
        """Retrieves connection QR code from Evolution API."""
        url = f"{self.base_url}/instance/connect/{instance_name}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=15.0)
                if response.status_code == 200:
                    return response.json()
                logger.error(f"Failed to connect instance: {response.status_code} - {response.text}")
                return None
            except Exception as e:
                logger.error(f"Error connecting instance: {e}")
                return None

    async def delete_instance(self, instance_name: str) -> bool:
        """Deletes an instance in Evolution API."""
        url = f"{self.base_url}/instance/delete/{instance_name}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.delete(url, headers=self.headers, timeout=15.0)
                if response.status_code in [200, 204]:
                    logger.info(f"Successfully deleted instance {instance_name}")
                    return True
                logger.error(f"Failed to delete instance: {response.status_code} - {response.text}")
                return False
            except Exception as e:
                logger.error(f"Error deleting instance: {e}")
                return False

evolution_client = EvolutionClient()
