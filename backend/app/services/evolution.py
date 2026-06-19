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

    async def register_webhook(self, instance_name: str, webhook_url: str) -> bool:
        """Registers the FastAPI backend webhook inside Evolution API for the instance."""
        url = f"{self.base_url}/webhook/set/{instance_name}"
        payload = {
            "webhook": {
                "enabled": True,
                "url": webhook_url,
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

evolution_client = EvolutionClient()
