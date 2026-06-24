import json
import logging
import os
import re
import redis.asyncio as aioredis
from app.config import settings
from app.services.supabase import supabase_service
from app.services.llm import get_llm_provider
from app.custom_addons import get_addon_for_owner

logger = logging.getLogger("backend.services.chatbot")

def extract_sharing_fallback(text: str) -> str:
    text_lower = text.lower()
    if "single" in text_lower or "private" in text_lower or "no sharing" in text_lower or "personal" in text_lower:
        return "single sharing"
    
    # Match digit followed by sharing/shared/bed/seater (e.g. "2 sharing", "3 bed")
    m = re.search(r'\b(\d+)\s*(?:sharing|shared|bed|seater|person|sharing preference)\b', text_lower)
    if m:
        num = int(m.group(1))
        return f"{num} sharing"
    
    # Word mappings
    words = {"two": 2, "double": 2, "three": 3, "triple": 3, "four": 4, "quad": 4, "five": 5}
    for w, val in words.items():
        if w in text_lower:
            return f"{val} sharing"
            
    if "sharing" in text_lower or "shared" in text_lower:
        return "sharing"
        
    return None

def extract_room_type_fallback(text: str) -> str:
    text_lower = text.lower()
    if "non-ac" in text_lower or "non ac" in text_lower:
        return "non-ac"
    if "ac" in text_lower:
        if re.search(r'\bac\b', text_lower):
            return "ac"
    return None

def extract_sharing_capacity_number(text: str) -> int:
    text_lower = text.lower()
    m = re.search(r'\b(\d+)\s*(?:sharing|shared|seater)\b', text_lower)
    if m:
        return int(m.group(1))
    words = {"single": 1, "private": 1, "two": 2, "double": 2, "three": 3, "triple": 3, "four": 4, "quad": 4, "five": 5}
    for word, value in words.items():
        if re.search(rf'\b{word}\s*(?:sharing|shared|seater)?\b', text_lower):
            return value
    return None

def extract_requested_vacant_beds(text: str, sharing_capacity: int = None) -> tuple:
    text_lower = text.lower()
    m = re.search(r'\ball\s+(\d+)\s*beds?\s*(?:available|vacant|free)\b', text_lower)
    if m:
        return int(m.group(1)), True
    m = re.search(r'\b(\d+)\s*beds?\s*(?:available|vacant|free)\b', text_lower)
    if m:
        return int(m.group(1)), False
    if sharing_capacity and re.search(r'\ball\s+beds?\s*(?:available|vacant|free)\b', text_lower):
        return sharing_capacity, True
    return None, False

def extract_date_fallback(text: str) -> str:
    text_lower = text.lower()
    months = {
        "january": "01", "jan": "01",
        "february": "02", "feb": "02",
        "march": "03", "mar": "03",
        "april": "04", "apr": "04",
        "may": "05",
        "june": "06", "jun": "06",
        "july": "07", "jul": "07",
        "august": "08", "aug": "08",
        "september": "09", "sep": "09",
        "october": "10", "oct": "10",
        "november": "11", "nov": "11",
        "december": "12", "dec": "12"
    }
    for month_name, month_num in months.items():
        pattern1 = rf'\b{month_name}\s*(\d{{1,2}})(?:st|nd|rd|th)?\b'
        m1 = re.search(pattern1, text_lower)
        if m1:
            day = int(m1.group(1))
            return f"2026-{month_num}-{day:02d}"
        pattern2 = rf'\b(\d{{1,2}})(?:st|nd|rd|th)?\s*{month_name}\b'
        m2 = re.search(pattern2, text_lower)
        if m2:
            day = int(m2.group(1))
            return f"2026-{month_num}-{day:02d}"
    return None


class ChatbotService:
    def __init__(self):
        self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self.session_ttl = 259200  # Sessions expire in 3 days (3 * 24 * 3600)

    def _get_owner_pg_info(self, owner_email: str) -> dict:
        """Helper to get static info for a specific owner or fallback to default."""
        email = (owner_email or "").strip().lower()
        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        configs_dir = os.path.abspath(os.path.join(current_dir, "..", "pg_configs"))
        
        # Build path to owner's JSON file
        owner_file_path = os.path.join(configs_dir, f"{email}.json")
        default_file_path = os.path.join(configs_dir, "default.json")
        
        # Try loading owner-specific config first
        if email and os.path.exists(owner_file_path):
            try:
                with open(owner_file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading owner pg info from {owner_file_path}: {e}")
                
        # Fallback to default.json
        if os.path.exists(default_file_path):
            try:
                with open(default_file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading default pg info from {default_file_path}: {e}")
                
        return {}

    async def get_session(self, sender_jid: str) -> dict:
        """Retrieves user conversation session from Redis."""
        key = f"chatbot:session:{sender_jid}"
        try:
            data = await self.redis.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Error reading session from Redis: {e}")
        return {
            "state": "CHAT",
            "history": [],
            "lead_info": {
                "name": None,
                "room_type": None,
                "sharing_preference": None,
                "move_in_date": None
            },
            "conversation_state": {
                "current_room": None,
                "pending_action": None,
                "awaiting_field": None
            }
        }

    async def save_session(self, sender_jid: str, session: dict) -> None:
        """Saves user conversation session to Redis."""
        key = f"chatbot:session:{sender_jid}"
        try:
            # Limit history length to prevent prompt inflation (keep last 20 messages)
            if "history" in session:
                session["history"] = session["history"][-20:]
            await self.redis.setex(key, self.session_ttl, json.dumps(session))
        except Exception as e:
            logger.error(f"Error saving session to Redis: {e}")

    def _reply_asks_for_name(self, reply: str) -> bool:
        """Detects lead-form style name requests that hurt early customer flow."""
        reply_lower = (reply or "").lower()
        name_patterns = [
            "provide your name",
            "your name",
            "may i know your name",
            "can i have your name",
            "could you share your name",
            "please share your name",
            "tell me your name",
            "what is your name",
            "what's your name",
        ]
        return any(pattern in reply_lower for pattern in name_patterns)

    def _reply_asks_to_notify_owner(self, reply: str) -> bool:
        reply_lower = (reply or "").lower()
        return "notify" in reply_lower and ("owner" in reply_lower or "pg" in reply_lower)

    def _is_fee_query(self, text: str) -> bool:
        text_lower = (text or "").lower()
        fee_terms = ["advance", "fees", "fee", "maintenance", "maintainance", "deposit", "refund", "security amount", "extra charge", "extra charges"]
        return any(term in text_lower for term in fee_terms)

    def _asks_maintenance_fee(self, text: str) -> bool:
        """Returns True only if the user is genuinely asking about maintenance/fees,
        NOT when they're asking about refund/deposit and just happen to mention 'fee'."""
        text_lower = (text or "").lower()
        # If the message is primarily about refund/deposit, don't trigger maintenance
        refund_terms = ["refund", "refundable", "deposit back", "get back", "return deposit"]
        is_refund_query = any(term in text_lower for term in refund_terms)
        if is_refund_query:
            # Only trigger maintenance if they EXPLICITLY say "maintenance" as a standalone topic
            # e.g., "what about maintenance AND refund" — but not "refund of the maintenance fee"
            maintenance_explicit = any(term in text_lower for term in ["maintenance", "maintainance"])
            fee_words = any(term in text_lower for term in ["fee", "fees"])
            # If they said "maintenance" but also "refund", check if maintenance is the subject
            # Pattern: "refund of the maintenance fee" → refund is the subject, not maintenance
            if maintenance_explicit and fee_words:
                # Check if refund comes before maintenance — means they're asking about refund OF maintenance
                maint_pos = min(
                    (text_lower.find(t) for t in ["maintenance", "maintainance"] if t in text_lower),
                    default=999
                )
                refund_pos = min(
                    (text_lower.find(t) for t in refund_terms if t in text_lower),
                    default=999
                )
                if refund_pos < maint_pos:
                    return False  # "refund of the maintenance" — asking about refund, not maintenance
            elif not maintenance_explicit:
                return False  # Pure refund query without mentioning maintenance
        return any(term in text_lower for term in ["maintenance", "maintainance", "fee", "fees", "advance", "extra charge", "extra charges"])

    def _asks_refund(self, text: str) -> bool:
        text_lower = (text or "").lower()
        return any(term in text_lower for term in ["refund", "refundable", "deposit back", "get back", "return deposit"])

    def _find_room_by_number(self, room_number: str, available_rooms: list) -> dict:
        if not room_number:
            return None
        clean_room = str(room_number).lower().replace("room", "").strip()
        for room in available_rooms:
            if str(room.get("room_number")).lower().strip() == clean_room:
                return room
        return None

    def _extract_room_number(self, text: str) -> str:
        match = re.search(r'\b(?:room\s*)?(\d{2,4})\b', text or "", re.IGNORECASE)
        return match.group(1) if match else None

    def _format_room_option(self, room: dict) -> str:
        sharing_type = f"{room['total_beds']} sharing" if room["total_beds"] > 1 else "single sharing"
        vacancy = f"{room['vacant_beds']} of {room['total_beds']} beds vacant"
        return f"Room {room['room_number']} ({room['room_type']}, {sharing_type}, {vacancy}) - Rent: Rs {room['rent_amount']}/month"

    def _build_requested_public_info_reply(self, text: str, amenities: str = None, visiting_hours: str = None) -> str:
        text_lower = (text or "").lower()
        parts = []
        if "amenit" in text_lower and amenities:
            parts.append(f"Amenities: {amenities}")
        if ("visiting" in text_lower or "visit" in text_lower) and visiting_hours:
            parts.append(f"Visiting hours: {visiting_hours}")
        return "\n".join(parts)

    def _build_strict_availability_reply(self, text: str, available_rooms: list, amenities: str = None, visiting_hours: str = None) -> str:
        sharing_capacity = extract_sharing_capacity_number(text)
        requested_vacant_beds, requires_all_requested_beds = extract_requested_vacant_beds(text, sharing_capacity)
        if not sharing_capacity or not requested_vacant_beds:
            return None

        matching_rooms = [
            room for room in available_rooms
            if int(room.get("total_beds") or 0) == sharing_capacity
            and int(room.get("vacant_beds") or 0) >= requested_vacant_beds
        ]
        if requires_all_requested_beds:
            matching_rooms = [
                room for room in matching_rooms
                if int(room.get("vacant_beds") or 0) == int(room.get("total_beds") or 0)
            ]

        if not matching_rooms:
            return (
                f"I don't see any {sharing_capacity} sharing rooms with {requested_vacant_beds} beds vacant right now. "
                f"I can show other {sharing_capacity} sharing options or rooms with different sharing."
            )

        if requires_all_requested_beds:
            heading = f"These are the {sharing_capacity} sharing rooms with all {requested_vacant_beds} beds vacant:"
        else:
            heading = f"These are the {sharing_capacity} sharing rooms with at least {requested_vacant_beds} beds vacant:"
        room_lines = "\n".join(f"- {self._format_room_option(room)}" for room in matching_rooms)
        public_info = self._build_requested_public_info_reply(text, amenities, visiting_hours)
        if public_info:
            return f"{heading}\n{room_lines}\n\n{public_info}\nWhich room would you like to know more about?"
        return f"{heading}\n{room_lines}\nWhich room would you like to know more about?"

    def _build_fee_reply(self, text: str, conversation_state: dict, available_rooms: list, owner_settings: dict) -> str:
        if not self._is_fee_query(text):
            return None

        room_number = self._extract_room_number(text) or (conversation_state.get("current_room") or "").replace("Room", "").strip()
        room = self._find_room_by_number(room_number, available_rooms)
        default_deposit = owner_settings.get("default_deposit_fees") if owner_settings else None
        refund_deposit = owner_settings.get("refund_deposit") if owner_settings else None
        asks_maintenance = self._asks_maintenance_fee(text)
        asks_refund = self._asks_refund(text)
        parts = []

        if asks_maintenance:
            if default_deposit is not None:
                parts.append(
                    f"There is no monthly maintenance fee for rooms. The default security deposit is Rs {default_deposit}."
                )
            else:
                parts.append("There is no monthly maintenance fee. The security deposit details are not configured yet.")

        if asks_refund:
            if refund_deposit is not None:
                parts.append(
                    f"The refundable deposit amount is Rs {refund_deposit}. "
                    "Note: the security deposit is non-refundable if vacating before 3 months."
                )
            else:
                parts.append(
                    "The exact refundable deposit amount is not configured yet. "
                    "The PG rule says the security deposit is non-refundable if vacating before 3 months — the PG can confirm the exact refund amount."
                )

        if not parts:
            return None

        # Add a natural follow-up to keep the conversation alive and guide toward rooms
        reply = " ".join(parts)
        # Don't add follow-up if they've already picked a room
        if not conversation_state.get("current_room"):
            reply += "\n\nBy the way, are you looking for a room? I can show you what's available."
        return reply

    def _build_room_selection_reply(self, lead_info: dict, available_rooms: list) -> str:
        """Keeps early customer replies focused on choosing a room, not collecting identity."""
        if not available_rooms:
            return "No rooms are currently available. You can ask about amenities, food, rules, or visiting hours."

        matching_rooms = available_rooms
        sharing = (lead_info.get("sharing_preference") or "").lower()
        room_type = (lead_info.get("room_type") or "").lower()
        budget = lead_info.get("budget")

        if sharing:
            matching_rooms = [
                room for room in matching_rooms
                if (f"{room['total_beds']} sharing" if room["total_beds"] > 1 else "single sharing").lower() == sharing
            ]
        if room_type:
            matching_rooms = [
                room for room in matching_rooms
                if str(room.get("room_type", "")).lower() == room_type
            ]
        if budget is not None:
            try:
                budget_value = float(budget)
                matching_rooms = [
                    room for room in matching_rooms
                    if float(room.get("rent_amount") or 0) <= budget_value
                ]
            except (TypeError, ValueError):
                pass

        if not matching_rooms:
            return "I don't see an exact match for that preference. Would you like to see the closest available rooms?"

        top_rooms = matching_rooms[:3]
        room_lines = "\n".join(f"{index}. {self._format_room_option(room)}" for index, room in enumerate(top_rooms, start=1))
        next_question = "Which room would you like to know more about?"
        if not lead_info.get("room_type"):
            next_question = "Do you prefer AC or non-AC?"
        elif not lead_info.get("budget"):
            next_question = "What budget range should I keep in mind?"
        return f"Here are the best available options:\n{room_lines}\n{next_question}"

    async def get_response(self, sender_jid: str, text: str, instance_name: str) -> str:
        """
        Orchestrates AI chatbot logic. Matches owner email, identifies user type,
        queries database contexts, calls LLM, executes backend intents, and saves state.
        """
        # 0. Check global blocklist first
        clean_phone = "".join(c for c in sender_jid.split("@")[0] if c.isdigit())
        
        # Normalize clean phone (e.g. prepending 91 to 10-digit Indian numbers)
        norm_phone = clean_phone
        if len(clean_phone) == 10:
            norm_phone = "91" + clean_phone

        global_blocklist = []
        current_dir = os.path.dirname(os.path.abspath(__file__))
        configs_dir = os.path.abspath(os.path.join(current_dir, "..", "pg_configs"))
        global_blocklist_path = os.path.join(configs_dir, "blocklist.json")
        if os.path.exists(global_blocklist_path):
            try:
                with open(global_blocklist_path, "r", encoding="utf-8") as f:
                    global_blocklist = json.load(f)
            except Exception as e:
                logger.error(f"Error loading global blocklist: {e}")
        
        # Normalize global blocklist numbers for comparison
        norm_global = []
        for num in global_blocklist:
            n = "".join(c for c in str(num) if c.isdigit())
            if len(n) == 10:
                n = "91" + n
            norm_global.append(n)
        
        if norm_phone in norm_global:
            logger.info(f"Ignoring message from globally blocked number: {clean_phone}")
            return None

        # 1. Look up Owner by email (instance_name)
        owner_record = await supabase_service.get_owner_by_email(instance_name)
        if not owner_record:
            logger.warning(f"No owner found for instance name (email): {instance_name}. Ignoring message.")
            return None

        # Check if chatbot is enabled and auto-replies are enabled for the owner
        if not owner_record.get("chatbot_enabled") or not owner_record.get("auto_reply_enabled", True):
            logger.info(f"Chatbot or auto-reply is disabled for owner: {instance_name}. Ignoring message.")
            return None
 
        owner_id = owner_record.get("id")
        owner_name = owner_record.get("name", "PG Manager")

        # 2. Determine User Type (Tenant vs Customer)
        tenant_record = await supabase_service.get_active_tenant(clean_phone, owner_id)
        is_tenant = tenant_record is not None

        # 3. Retrieve Session
        session = await self.get_session(sender_jid)
        session["owner_id"] = owner_id
        session["user_type"] = "tenant" if is_tenant else "customer"

        # 4. Fetch DB and Configuration Contexts
        static_info = self._get_owner_pg_info(instance_name)
        
        # Check owner-specific blocklist
        owner_blocklist = static_info.get("blocklist") or []
        norm_owner = []
        for num in owner_blocklist:
            n = "".join(c for c in str(num) if c.isdigit())
            if len(n) == 10:
                n = "91" + n
            norm_owner.append(n)

        if norm_phone in norm_owner:
            logger.info(f"Ignoring message from owner-blocked number: {clean_phone} for instance: {instance_name}")
            return None

        # Load custom addon for owner if it exists
        addon = get_addon_for_owner(instance_name)

        pg_rules = static_info.get("rules", "Please follow standard code of conduct.")
        food_menu = static_info.get("food_menu", "Food details not configured yet.")
        amenities = static_info.get("amenities", "WIFI, CCTV, Washing Machine")
        
        # New static configurations
        wifi_credentials = static_info.get("wifi_credentials", "WiFi details not available.")
        emergency_contacts = static_info.get("emergency_contacts", "Emergency contacts not available.")
        maintenance_schedule = static_info.get("maintenance_schedule", "Maintenance schedule not available.")
        visiting_hours = static_info.get("visiting_hours", "Normal visiting hours: 10:00 AM to 6:00 PM, Monday to Sunday.")
        fixed_address = static_info.get("address", "Staytraq PG.")

        context = ""
        system_prompt = ""

        if is_tenant:
            tenant_name = tenant_record.get("name", "Tenant")
            tenant_id = tenant_record.get("id")
            
            # Fetch context from DB for Tenant
            pg_details = await supabase_service.get_pg_details(owner_id)
            pg_name = pg_details[0].get("pg_name", "Staytraq PG") if pg_details else "Staytraq PG"
            
            latest_payment = await supabase_service.get_latest_payment(tenant_id)
            recent_complaints = await supabase_service.get_complaints(owner_id, clean_phone)
            owner_settings = await supabase_service.get_owner_settings(owner_id)
            available_rooms = await supabase_service.get_available_rooms(owner_id)

            # Format room availability context
            rooms_context = "No rooms are currently available."
            if available_rooms:
                rooms_list = []
                for r in available_rooms:
                    sharing_type = f"{r['total_beds']} sharing" if r['total_beds'] > 1 else "single sharing"
                    floor_str = f", Floor: {r['floor_no']}" if r.get('floor_no') is not None else ""
                    rooms_list.append(
                        f"- Room {r['room_number']} ({sharing_type}, {r['room_type']}): "
                        f"{r['vacant_beds']} beds vacant out of {r['total_beds']} total, "
                        f"Rent: ₹{r['rent_amount']}/month{floor_str}"
                    )
                rooms_context = "\n".join(rooms_list)

            # Format rent context
            rent_context = "No payment records or bills have been generated for you yet. This means you do not have any pending payments at this time."
            if latest_payment:
                status = latest_payment.get("status", "pending")
                amount = latest_payment.get("total_amount") or latest_payment.get("rent_amount", 0)
                due_date = latest_payment.get("due_date", "N/A")
                month = latest_payment.get("month", 0)
                year = latest_payment.get("year", 0)
                
                # Map raw DB statuses to human-friendly descriptions for the LLM
                status_display = status
                if status == "submitted":
                    status_display = "Under Review (payment proof has been submitted and is awaiting verification by the owner)"
                elif status == "late":
                    status_display = "Late (overdue and unpaid)"
                elif status == "pending":
                    status_display = "Pending (not yet paid)"

                if status == "paid":
                    rent_context = f"Latest bill: Month {month}/{year}, Amount: {amount}, Due Date: {due_date}, Status: Paid. You do not have any pending payments."
                elif status == "submitted":
                    rent_context = f"Latest bill: Month {month}/{year}, Amount: {amount}, Due Date: {due_date}, Status: {status_display}. The tenant does NOT need to pay again or resubmit — the owner will verify the proof as soon as possible."
                else:
                    # Fetch/create payment link for pending/late statuses
                    portal_token = await supabase_service.get_or_create_payment_link(owner_id, month, year)
                    if portal_token:
                        payment_link = f"https://staytraq.vercel.app/pay/{portal_token}"
                        rent_context = (
                            f"Latest bill: Month {month}/{year}, Amount: {amount}, Due Date: {due_date}, Status: {status_display}.\n"
                            f"Payment Submission Link: {payment_link}"
                        )
                    else:
                        rent_context = f"Latest bill: Month {month}/{year}, Amount: {amount}, Due Date: {due_date}, Status: {status_display}."

            # Format complaints context
            complaints_context = "No recent complaints found."
            if recent_complaints:
                complaints_list = []
                for c in recent_complaints:
                    c_status = c.get("status", "pending")
                    c_msg = c.get("complaint_message", "")
                    c_response = c.get("owner_response") or "None"
                    complaints_list.append(f"- [{c_status}] {c_msg} (Response: {c_response})")
                complaints_context = "\n".join(complaints_list)

            settings_context = "No special owner configurations."
            if owner_settings:
                settings_context = (
                    f"Grace Period Days: {owner_settings.get('grace_period_days', 'N/A')}\n"
                    f"Default Deposit Fees: ₹{owner_settings.get('default_deposit_fees', 'N/A')}\n"
                    f"Refund Deposit: ₹{owner_settings.get('refund_deposit', 'N/A')}\n"
                    f"Rent Due Day of Month: {owner_settings.get('rent_due_day', 'N/A')}\n"
                    f"Payment Instructions: {owner_settings.get('payment_instructions', 'N/A')}\n"
                    f"UPI Details: {owner_settings.get('upi_id', 'N/A')} ({owner_settings.get('upi_name', 'N/A')})\n"
                    f"WhatsApp Invite Link: {owner_settings.get('whatsapp_invite_link', 'N/A')}"
                )

            # Build context string
            context = (
                f"Tenant Name: {tenant_name}\n"
                f"PG Name: {pg_name}\n"
                f"PG Owner: {owner_name}\n"
                f"Owner Settings:\n{settings_context}\n"
                f"Rent/Payment Info: {rent_context}\n"
                f"Tenant Complaints History:\n{complaints_context}\n"
                f"PG Rules:\n{pg_rules}\n"
                f"Food Menu:\n{food_menu}\n"
                f"WiFi Credentials:\n{wifi_credentials}\n"
                f"Emergency Contacts:\n{emergency_contacts}\n"
                f"Maintenance Schedule:\n{maintenance_schedule}\n"
                f"Available Rooms and Prices:\n{rooms_context}\n"
            )

            # System prompt for Tenants
            system_prompt = (
                f"You are the virtual assistant for {pg_name}, representing the PG Owner/Manager.\n"
                "Your role is to support existing tenants with: complaint registration, complaint status checking, rent/payment details, PG rules, food menus, WiFi credentials, emergency contacts, and maintenance schedules.\n"
                "You MUST respond ONLY in a JSON object with this exact schema:\n"
                "{\n"
                "  \"reply\": \"Your conversational reply to the tenant here.\",\n"
                "  \"intents\": [\"intent1\", \"intent2\"],\n"
                "  \"extracted_data\": {\n"
                "     \"complaint_message\": \"The description of the complaint if the tenant is registering one\",\n"
                "     \"category\": \"Electricity\" | \"Water\" | \"Internet\" | \"Other\" (choose one if intent is register_complaint)\n"
                "  }\n"
                "}\n"
                "Guidelines:\n"
                f"- When greeting or welcoming the tenant (e.g. hello/hi) at the start of a conversation, welcome them warmly by name representing {pg_name} (e.g., 'Hello {tenant_name}! Welcome to {pg_name}. How can I assist you today?'). You MUST include the tenant's name ({tenant_name}) in the welcome message. Do NOT repeat this welcome greeting prefix in subsequent messages in the conversation history.\n"
                "- Do NOT allow the tenant to choose rooms, do NOT ask them room-related questions (such as budget, room/sharing preference, or move-in date), and do NOT try to collect lead capture details or create leads. Existing tenants cannot create leads or book new rooms through this flow.\n"
                "- Focus on asking helpful follow-up questions regarding the tenant's registered complaints or any new issues they mention (e.g. asking for details, or checking if past complaints are resolved).\n"
                "- If the tenant mentions any issue, problem, request for repair, or complaint (e.g. 'fan not working', 'tap leaking'), you MUST immediately register it. Set intents to include 'register_complaint', extract the complaint description into 'complaint_message', and assign the correct category (Electricity, Water, Internet, or Other). Do NOT ask the user for confirmation or permission first. Register it directly and inform them in the reply that you have registered it.\n"
                "- If the message contains multiple intents (e.g. asking for rent AND registering a complaint), include all matching intents in the 'intents' list.\n"
                "- If the tenant asks about their rent, pending bills, or payment instructions, set intents to include 'check_rent' and answer based on Rent Info and Owner Settings. You MUST prioritize sending the Payment Submission Link from the context for pending/late payments. Do NOT mention direct UPI Details (UPI ID / name) unless the tenant specifically asks for direct bank details or has trouble using the link.\n"
                "- If the payment status is 'Under Review', tell the tenant that their payment proof has been submitted and is currently under review by the owner/manager, who will verify it as soon as possible. Do NOT ask them to pay again or resubmit unless the status is explicitly pending or late.\n"
                "- If the tenant asks about their complaints status, set intents to include 'check_status'.\n"
                "- For other questions (rules, food menu, WiFi, emergency contacts, maintenance, simple greetings, or room availability), set intents to include 'general_query' and answer them using the context data (including Available Rooms and Prices). Remember that tenants cannot choose or book these rooms.\n"
                "- Context is Ground Truth: The information in the static context above (Rent/Payment info, Owner Settings, Rules, Food Menu, WiFi, Emergency Contacts, Available Rooms and Prices, etc.) is the absolute current ground truth. If the context changes, you MUST immediately adopt the new value from the context and ignore any conflicting older values in the chat history.\n"
                "- Stay friendly, polite, and professional."
            )
        else:
            # Fetch context from DB for Customers (Room availability & pricing)
            available_rooms = await supabase_service.get_available_rooms(owner_id)
            pg_details = await supabase_service.get_pg_details(owner_id)
            owner_settings = await supabase_service.get_owner_settings(owner_id)
            pg_name = pg_details[0].get("pg_name", "Staytraq PG") if pg_details else "Staytraq PG"
            default_deposit_fees = owner_settings.get("default_deposit_fees") if owner_settings else None

            # Format room availability context (calculating sharing type based on total beds)
            rooms_context = "No rooms are currently available."
            if available_rooms:
                rooms_list = []
                for r in available_rooms:
                    sharing_type = f"{r['total_beds']} sharing" if r['total_beds'] > 1 else "single sharing"
                    floor_str = f", Floor: {r['floor_no']}" if r.get('floor_no') is not None else ""
                    rooms_list.append(
                        f"- Room {r['room_number']} ({sharing_type}, {r['room_type']}): "
                        f"{r['vacant_beds']} beds vacant out of {r['total_beds']} total, "
                        f"Rent: ₹{r['rent_amount']}/month{floor_str}"
                    )
                rooms_context = "\n".join(rooms_list)

            refund_deposit = owner_settings.get("refund_deposit") if owner_settings else None

            # Build context string
            context = (
                f"PG Name: {pg_name}\n"
                f"Available Rooms and Prices:\n{rooms_context}\n"
                f"Amenities:\n{amenities}\n"
                f"PG Rules:\n{pg_rules}\n"
                f"Food Menu:\n{food_menu}\n"
                f"PG Location/Address: {fixed_address}\n"
                f"Visiting Hours: {visiting_hours}\n"
                f"Default Deposit Fees: Rs {default_deposit_fees if default_deposit_fees is not None else 'Not configured'}\n"
                f"Refundable Deposit: Rs {refund_deposit if refund_deposit is not None else 'Not configured'}\n"
            )

            # Pre-populate already captured lead fields and conversation state to remind LLM
            lead_info = session.get("lead_info", {})
            conversation_state = session.setdefault("conversation_state", {
                "current_room": None,
                "pending_action": None,
                "awaiting_field": None
            })
            lead_status = (
                f"Captured Lead Info So Far:\n"
                f"- Name: {lead_info.get('name')}\n"
                f"- Room Type: {lead_info.get('room_type')}\n"
                f"- Sharing Preference: {lead_info.get('sharing_preference')}\n"
                f"- Expected Move-In Date: {lead_info.get('move_in_date')}\n"
                f"\n"
                f"Conversation State:\n"
                f"- Current Room: {conversation_state.get('current_room')}\n"
                f"- Pending Action: {conversation_state.get('pending_action')}\n"
                f"- Awaiting Field: {conversation_state.get('awaiting_field')}\n"
            )
            context += f"\n{lead_status}"
 
            import datetime
            current_date_str = datetime.date.today().isoformat()

            # System prompt for Customers
            system_prompt = (
                f"You are the virtual assistant for {pg_name}. You talk like a friendly, knowledgeable staff member — not a chatbot.\n"
                f"Today is {current_date_str}.\n"
                "\n"
                "YOUR PERSONALITY\n"
                "- You are a real person having a real conversation. READ what the customer says and RESPOND to it.\n"
                "- If they ask \"how are you?\", answer naturally first (\"I'm doing good, thanks!\") before moving to PG topics.\n"
                "- If they make small talk, engage briefly, then steer toward helping them.\n"
                "- Short replies (2–3 lines max). Only go longer if the customer asks for details.\n"
                "- Use simple, casual language. Many customers chat in casual English or Hinglish.\n"
                "- Never use marketing fluff (\"Great choice!\", \"Perfect for community living!\", \"Excellent option!\").\n"
                "- Never use filler questions (\"Would you like to explore more?\", \"Shall I recommend something?\").\n"
                "- Do NOT copy-paste template responses. Every reply should feel uniquely written for that message.\n"
                "\n"
                "HOW CONVERSATIONS WORK\n"
                "\n"
                "Opening: When the customer greets you, respond naturally to their greeting first, then introduce the PG and ask what sharing they're looking for.\n"
                "  - \"hello how are you\" → respond to \"how are you\" first, then ask about rooms.\n"
                "  - \"hi\" → welcome them warmly and ask about sharing preference.\n"
                "  - \"I need a room\" → skip pleasantries, go straight to helping them find a room.\n"
                "\n"
                "Room Search: Help them find the right room.\n"
                "- If they ask for a sharing type, list ALL matching rooms. Never skip any.\n"
                "- Room availability guidelines: [A] If the conversation history is empty OR does not contain any previous room type or sharing preference, show the rooms matching their current query directly without saying 'based on your previous interest'. [B] If they ask generally about room availability (e.g. 'what rooms do you have?') in their current message without specifying a room type or sharing preference, but they HAVE previously expressed a preference (e.g. 2 sharing) in the conversation history: you MUST filter the rooms to only show options matching that past preference, you MUST explicitly state in your reply that you are showing these specific options based on their previous preference (e.g., 'Since you were interested in 2-sharing rooms earlier, here are the available ones...'), you MUST remind them of the other available options (like 3 sharing, 4 sharing, etc., depending on what is in Available Rooms and Prices), and ask if they would like to explore those other options instead.\n"
                "- Show: Room number, sharing type, AC/non-AC, vacant beds, rent.\n"
                "- Do NOT show maintenance fees, deposits, or advance amounts unless they specifically ask.\n"
                "- You can ask about AC/non-AC preference or sharing ONLY to narrow down options — not to fill a form.\n"
                "- Answer any questions about amenities, food menu, rules, location, visiting hours.\n"
                "\n"
                "Interest Detection: When the customer shows interest in a specific room:\n"
                "  Signs: \"I'll take it\", \"book this\", \"I like Room 203\", \"reserve it\", \"notify the owner\",\n"
                "         or \"yes\" right after you showed them a specific room.\n"
                "  → Confirm the room, then ask for move-in date (optional) and name (optional), ONE at a time.\n"
                "  → If they skip or say \"not sure\", that is perfectly fine — move on.\n"
                "\n"
                "Lead Summary: Once you have what they're willing to share, show a quick summary:\n"
                "  Name: [their name or \"Interested Customer\"]\n"
                "  Move-in: [date or \"Flexible\"]\n"
                "  Room: [room number]\n"
                "  Sharing: [sharing type]\n"
                "  Rent: ₹[amount]/month\n"
                "  Then ask: \"Should I let the PG know about your interest?\"\n"
                "  Set pending_action = \"awaiting_owner_notification_confirmation\".\n"
                "\n"
                "Confirmation: If they say yes/sure/okay when pending_action is \"awaiting_owner_notification_confirmation\",\n"
                "  → set intents to include \"submit_lead\".\n"
                "\n"
                "CRITICAL RULES\n"
                "\n"
                "Data extraction:\n"
                "- Extract every piece of info the customer gives you in their message. If they say \"I'm Raj, looking for 2 sharing AC\", extract name, sharing_preference, and room_type all at once.\n"
                "- NEVER ask for something they already told you. Check lead_info and chat history first.\n"
                "- NEVER assume anything they didn't say. If they said \"yes\", it confirms the last thing you asked — nothing else.\n"
                "\n"
                "What NOT to collect early:\n"
                "- Do NOT ask for name, phone, or move-in date until they've picked a room.\n"
                "- Name and move-in date are always optional. If they refuse or skip, accept it gracefully.\n"
                "\n"
                "Room terminology:\n"
                "- \"3 sharing\" = the room has exactly 3 total beds (total_beds = 3).\n"
                "- \"3 beds available\" = the room has at least 3 vacant beds (vacant_beds >= 3).\n"
                "- A 4-sharing room with 3 vacant beds is NOT a 3-sharing room. Never mislabel.\n"
                "- \"single sharing\" or \"private\" = total_beds = 1.\n"
                "\n"
                "Date resolution:\n"
                f"- Today is {current_date_str}.\n"
                "- \"tomorrow\" → next calendar day.\n"
                "- \"next Wednesday\" → the coming Wednesday after today.\n"
                "- \"next week Wednesday\" → Wednesday of the following week (7+ days from now).\n"
                "- If you're not sure what date they mean, just ask.\n"
                "\n"
                "Off-limits for customers:\n"
                "- WiFi passwords, emergency contacts, UPI IDs, payment instructions → \"Those details are shared after you move in.\"\n"
                "- Owner's personal name → never reveal. Only use PG name.\n"
                "- Maintenance fees / deposits → only share if they explicitly ask. If they ask before picking a room, share the default and say it may vary by room.\n"
                "- Visiting → ask them to call the PG first to check availability. Hours: 10 AM–6 PM, Mon–Sun.\n"
                "\n"
                "Context is Ground Truth:\n"
                "- The information in the static context above (PG Name, Address, Rooms, Rules, Food Menu, etc.) is the absolute current ground truth.\n"
                "- If the context changes (e.g., PG Name or Address is updated in the context compared to what you or the user said earlier in the history), you MUST immediately adopt the new value from the context and ignore any conflicting older values in the chat history.\n"
                "\n"
                "One question at a time. Never ask two things in one message.\n"
                "\n"
                "OUTPUT FORMAT\n"
                "\n"
                "Respond ONLY with a JSON object. No text outside it.\n"
                "{\n"
                "  \"reply\": \"your message to the customer\",\n"
                "  \"intents\": [\"general_query\"] or [\"lead_capture\"] or [\"submit_lead\"],\n"
                "  \"extracted_data\": {\n"
                "    \"name\": string or null,\n"
                "    \"room_type\": \"ac\" | \"non-ac\" | null,\n"
                "    \"sharing_preference\": \"single sharing\" | \"2 sharing\" | \"3 sharing\" | \"4 sharing\" | \"5 sharing\" | null,\n"
                "    \"move_in_date\": \"YYYY-MM-DD\" | null\n"
                "  },\n"
                "  \"conversation_state\": {\n"
                "    \"current_room\": \"Room 203\" | null,\n"
                "    \"pending_action\": \"awaiting_owner_notification_confirmation\" | null,\n"
                "    \"awaiting_field\": \"move_in_date\" | \"name\" | null\n"
                "  }\n"
                "}\n"
                "\n"
                "Intent guide:\n"
                "- \"general_query\" → answering questions, listing rooms, general chat.\n"
                "- \"lead_capture\" → customer is exploring rooms and you're picking up preferences.\n"
                "- \"submit_lead\" → customer confirmed final notification to PG owner."
            )
 
        # Apply custom addon hooks if present
        if addon:
            context = addon.modify_context(context, is_tenant, session)
            system_prompt = addon.modify_system_prompt(system_prompt, is_tenant, session)

        # 5. Call LLM
        llm_provider = get_llm_provider()
        llm_prompt = f"Context:\n{context}\n\nUser Message: {text}"
        
        logger.info(f"Calling LLM provider for JID {sender_jid} (Tenant: {is_tenant})")
        llm_output = await llm_provider.generate_response(system_prompt, session.get("history", []), llm_prompt)
        
        reply = llm_output.get("reply", "Sorry, I am unable to process your request.")
        original_reply = reply
        
        # Resolve multi-intent list
        intents = llm_output.get("intents") or []
        if isinstance(intents, str):
            intents = [intents]
        
        # Fallback support for single intent
        single_intent = llm_output.get("intent")
        if single_intent and single_intent not in intents:
            intents.append(single_intent)
            
        extracted = llm_output.get("extracted_data") or {}
        # Save the PREVIOUS pending_action before the LLM's new state overwrites it
        # This is critical for submit_lead detection — the LLM clears pending_action
        # after processing a confirmation, but we need to know what it WAS
        previous_pending_action = session.get("conversation_state", {}).get("pending_action")
        new_conv_state = llm_output.get("conversation_state") or {}
        if new_conv_state:
            # Maintain and merge keys
            session["conversation_state"] = {
                "current_room": new_conv_state.get("current_room") or session.setdefault("conversation_state", {}).get("current_room"),
                "pending_action": new_conv_state.get("pending_action"),
                "awaiting_field": new_conv_state.get("awaiting_field")
            }

        # 6. Execute Backend Intent / Business Logic
        if is_tenant:
            if "register_complaint" in intents:
                # Check complaint rate limit (max 3 per hour)
                allowed = await supabase_service.check_complaint_rate_limit(clean_phone)
                if not allowed:
                    reply += "\n\n⚠️ *Complaint limit exceeded. You can register at most 3 complaints per hour.*"
                else:
                    msg = extracted.get("complaint_message")
                    cat = extracted.get("category", "Other")
                    if msg:
                        # Prepend category inside complaint text: "Electricity: Fan not working"
                        full_complaint_msg = f"{cat}: {msg}"
                        success = await supabase_service.register_complaint(owner_id, clean_phone, full_complaint_msg)
                        if success:
                            reply += "\n\n✅ *Complaint registered successfully!*"
                        else:
                            reply += "\n\n⚠️ *Sorry, I failed to save your complaint in the database. Please try again later.*"
                    else:
                        reply += "\n\n⚠️ *Please specify your complaint description so I can register it.*"
            
            if "check_rent" in intents:
                pass
            
            if "check_status" in intents:
                pass
        
        else:
            # Customer flow: perform backend regex extraction fallback for null fields
            # Use the PREVIOUS pending_action (before LLM overwrote it) to detect confirmation
            is_confirming_summary = previous_pending_action == "awaiting_owner_notification_confirmation"
            is_generic_yes = text.lower().strip() in ["yes", "y", "okay", "ok", "proceed", "sure", "correct", "yep", "yeah", "yes please", "sure notify"]
            if "submit_lead" in intents and not is_confirming_summary:
                intents = [intent for intent in intents if intent != "submit_lead"]
                if "lead_capture" not in intents:
                    intents.append("lead_capture")
            
            if "submit_lead" in intents or (is_confirming_summary and is_generic_yes):
                lead_info = session.setdefault("lead_info", {})
                lead_submitted = False
                
                # Check if lead already exists before creating a new one
                existing_lead = await supabase_service.get_lead_by_phone(owner_id, clean_phone)
                if existing_lead:
                    reply += "\n\n📢 *We already have your query registered, and our PG Manager will reach out to you soon!*"
                    lead_submitted = True
                else:
                    # Store lead in public.leads table
                    success = await supabase_service.create_lead(
                        owner_id=owner_id,
                        name=str(lead_info.get("name") or "Interested Customer"),
                        phone=clean_phone,
                        room_type=str(lead_info.get("room_type") or "any"),
                        sharing_preference=str(lead_info.get("sharing_preference") or "any"),
                        # Sanitize move_in_date: only pass valid YYYY-MM-DD dates, not "Flexible"/"not sure"/etc.
                        move_in_date=lead_info.get("move_in_date") if (lead_info.get("move_in_date") and re.match(r'^\d{4}-\d{2}-\d{2}$', str(lead_info.get("move_in_date", "")))) else None,
                        room_no=session.setdefault("conversation_state", {}).get("current_room")
                    )
                    if success:
                        reply += "\n\n🎉 *Thank you! I have successfully registered your query. Our PG Manager will contact you shortly!*"
                        lead_submitted = True
                    else:
                        logger.error("Failed to insert lead into Supabase leads table.")
                        reply += "\n\n⚠️ *Sorry, something went wrong. You can say 'try again' and I'll retry.*"
                        # Keep lead_info intact and restore pending_action so user can retry
                        session["conversation_state"]["pending_action"] = "awaiting_owner_notification_confirmation"
                
                # Only clear data on successful submission or duplicate — NOT on failure
                if lead_submitted:
                    session["lead_info"] = {
                        "name": None,
                        "room_type": None,
                        "sharing_preference": None,
                        "move_in_date": None
                    }
                    session["conversation_state"] = {
                        "current_room": None,
                        "pending_action": None,
                        "awaiting_field": None
                    }
                
            elif "lead_capture" in intents or "general_query" in intents:
                lead_info = session.setdefault("lead_info", {})
                
                # Check / apply fallback regex extraction
                if extracted.get("name") is not None:
                    lead_info["name"] = extracted["name"]
                

                # Room type fallback
                extracted_room_type = extracted.get("room_type")
                if extracted_room_type is not None:
                    lead_info["room_type"] = extracted_room_type
                if lead_info.get("room_type") is None:
                    fallback_rt = extract_room_type_fallback(text)
                    if fallback_rt is not None:
                        lead_info["room_type"] = fallback_rt
 
                # Sharing preference fallback
                extracted_sharing = extracted.get("sharing_preference")
                if extracted_sharing is not None:
                    lead_info["sharing_preference"] = extracted_sharing
                if lead_info.get("sharing_preference") is None:
                    fallback_sp = extract_sharing_fallback(text)
                    if fallback_sp is not None:
                        lead_info["sharing_preference"] = fallback_sp
 
                # Move in date fallback
                extracted_date = extracted.get("move_in_date")
                if extracted_date is not None:
                    lead_info["move_in_date"] = extracted_date
                if lead_info.get("move_in_date") is None:
                    fallback_d = extract_date_fallback(text)
                    if fallback_d is not None:
                        lead_info["move_in_date"] = fallback_d

                conv_state = session.setdefault("conversation_state", {})
                has_confirmed_room = bool(conv_state.get("current_room") or conv_state.get("pending_action") == "awaiting_owner_notification_confirmation")
                # Fee queries are now handled by the LLM using context data
                # (default_maintenance_fee and refund_deposit are in the context string)
                strict_availability_reply = self._build_strict_availability_reply(text, available_rooms, amenities, visiting_hours)
                if strict_availability_reply:
                    reply = strict_availability_reply
                    original_reply = reply
                if self._reply_asks_to_notify_owner(reply) and not conv_state.get("pending_action"):
                    if not conv_state.get("current_room"):
                        reply_room_number = self._extract_room_number(reply)
                        if reply_room_number:
                            conv_state["current_room"] = f"Room {reply_room_number}"
                            has_confirmed_room = True
                    if not lead_info.get("move_in_date"):
                        conv_state["awaiting_field"] = "move_in_date"
                        reply = "Before I notify the PG, when are you planning to move in? You can say flexible if not decided."
                        original_reply = reply
                    elif not lead_info.get("name"):
                        conv_state["awaiting_field"] = "name"
                        reply = "What name should I share with the PG? You can skip this if you prefer."
                        original_reply = reply
                if not has_confirmed_room and (conv_state.get("awaiting_field") == "name" or self._reply_asks_for_name(reply)):
                    conv_state["awaiting_field"] = None
                    reply = self._build_room_selection_reply(lead_info, available_rooms)
                    original_reply = reply

        # 6.5 Run Custom Addon Intent Handler if registered
        if addon:
            addon_reply = await addon.handle_custom_intents(intents, extracted, session, is_tenant)
            if addon_reply:
                reply += addon_reply
                original_reply = reply

        # 7. Update History and Save Session (using clean original reply)
        session["history"].append({"role": "user", "content": text})
        session["history"].append({"role": "assistant", "content": original_reply})
        await self.save_session(sender_jid, session)

        return reply

chatbot_service = ChatbotService()
