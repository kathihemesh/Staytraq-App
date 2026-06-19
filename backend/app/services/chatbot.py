import json
import logging
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger("backend.services.chatbot")

class ChatbotService:
    def __init__(self):
        self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self.session_ttl = 3600  # Sessions expire in 1 hour

    async def get_user_state(self, sender_jid: str) -> dict:
        """Retrieves user conversation session. Default state is 'START'."""
        key = f"chatbot:session:{sender_jid}"
        try:
            data = await self.redis.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Error reading session from Redis: {e}")
        return {"state": "START"}

    async def set_user_state(self, sender_jid: str, state: str, additional_data: dict = None) -> None:
        """Saves user conversation session to Redis."""
        key = f"chatbot:session:{sender_jid}"
        session_data = {"state": state}
        if additional_data:
            session_data.update(additional_data)
        try:
            await self.redis.setex(key, self.session_ttl, json.dumps(session_data))
        except Exception as e:
            logger.error(f"Error saving session to Redis: {e}")

    async def get_response(self, sender_jid: str, text: str) -> str:
        """Processes incoming user input, updates state in Redis, and returns the chatbot's response."""
        session = await self.get_user_state(sender_jid)
        current_state = session.get("state", "START")
        clean_text = text.strip().lower()

        # State Machine Logic
        if current_state == "START":
            await self.set_user_state(sender_jid, "MENU")
            return (
                "👋 Hello! Welcome to Staytraq Support. How can we help you today?\n\n"
                "Please choose an option by typing the number:\n"
                "1️⃣ View properties\n"
                "2️⃣ Booking availability\n"
                "3️⃣ Talk to a human"
            )

        elif current_state == "MENU":
            if clean_text in ["1", "1.", "view properties"]:
                await self.set_user_state(sender_jid, "MENU")  # Stay on menu
                return (
                    "🏡 *Our Properties:*\n"
                    "- 🌴 Beachfront Villa: 3BHK with pool\n"
                    "- 🏔️ Mountain Cottage: Cozy fireplace cabin\n\n"
                    "Reply with 0 to go back to the Main Menu."
                )
            elif clean_text in ["2", "2.", "booking availability"]:
                await self.set_user_state(sender_jid, "BOOKING")
                return (
                    "📅 Please reply with your desired check-in date (Format: YYYY-MM-DD)."
                )
            elif clean_text in ["3", "3.", "talk to a human"]:
                await self.set_user_state(sender_jid, "HUMAN")
                return (
                    "🚨 I am notifying our support team now. A customer agent will message you directly shortly!\n\n"
                    "Reply with 0 to return to the Main Menu."
                )
            else:
                return "⚠️ Invalid option. Please select 1, 2, or 3."

        elif current_state == "BOOKING":
            if clean_text == "0":
                await self.set_user_state(sender_jid, "MENU")
                return "Returned to Main Menu. Choose 1, 2, or 3."
            # Simulating date capture
            await self.set_user_state(sender_jid, "MENU")
            return (
                f"✅ Checked availability for *{text}*. We have open slots!\n\n"
                "We have sent your details to the booking manager. Reply with 0 to return to the Main Menu."
            )

        elif current_state == "HUMAN":
            if clean_text == "0":
                await self.set_user_state(sender_jid, "MENU")
                return "Returned to Main Menu. Choose 1, 2, or 3."
            return "Support agent is on their way. If you want to return to menu, reply with 0."

        # Fallback state reset
        await self.set_user_state(sender_jid, "START")
        return "Oops! Let's start over. Reply with anything to view the menu."

chatbot_service = ChatbotService()
