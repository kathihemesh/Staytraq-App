import logging
import httpx
from app.config import settings

logger = logging.getLogger("backend.services.supabase")

class SupabaseService:
    def __init__(self):
        self.url = settings.SUPABASE_URL.rstrip("/")
        self.headers = {
            "apikey": settings.SUPABASE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_KEY}",
            "Content-Type": "application/json"
        }

    async def get_owner_by_email(self, email: str) -> dict:
        """Retrieves owner matching the email (instance_name)."""
        if not email:
            return None
        url = f"{self.url}/rest/v1/pg_owners?email=eq.{email.strip()}&select=id,name,email,chatbot_enabled"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    records = response.json()
                    if records:
                        return records[0]
                else:
                    logger.error(f"Error fetching owner by email: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query owner by email: {e}")
        return None

    async def get_active_tenant(self, phone_number: str, owner_id: str) -> dict:
        """Looks up active tenant under the owner by phone number (last 10 digits match)."""
        if not phone_number or not owner_id:
            return None

        # Retrieve active tenants under this owner
        url = f"{self.url}/rest/v1/tenants_table?owner_id=eq.{owner_id}&status=eq.active&select=id,name,mobile_number,pg_id,room_id"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    tenants = response.json()
                    # Clean input number (extract digits)
                    clean_input = "".join(c for c in phone_number if c.isdigit())
                    if len(clean_input) >= 10:
                        input_suffix = clean_input[-10:]
                        for t in tenants:
                            db_phone = t.get("mobile_number")
                            if db_phone:
                                db_clean = "".join(c for c in db_phone if c.isdigit())
                                if len(db_clean) >= 10 and db_clean[-10:] == input_suffix:
                                    return t
                else:
                    logger.error(f"Error fetching active tenants: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query active tenants: {e}")
        return None

    async def get_pg_details(self, owner_id: str) -> list:
        """Retrieves list of PG details owned by the owner."""
        url = f"{self.url}/rest/v1/pg_details?owner_id=eq.{owner_id}&select=id,pg_name,city,address"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Error fetching PG details: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query PG details: {e}")
        return []

    async def get_available_rooms(self, owner_id: str) -> list:
        """Retrieves list of rooms that have availability for the owner's PGs."""
        pg_details = await self.get_pg_details(owner_id)
        if not pg_details:
            return []
        
        pg_ids = [str(pg.get("id")) for pg in pg_details]
        pg_ids_str = ",".join(pg_ids)
        
        url = f"{self.url}/rest/v1/rooms_table?pg_id=in.({pg_ids_str})&select=id,room_number,room_type,status,rent_amount,total_beds,occupied_beds,floor_no,maintenance"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    rooms = response.json()
                    # Filter rooms that have availability and are not in maintenance
                    available_rooms = []
                    for r in rooms:
                        if r.get("status") != "maintenance":
                            try:
                                total_beds = int(float(r.get("total_beds") or 0))
                                occupied_beds = int(float(r.get("occupied_beds") or 0))
                                rent_amount = float(r.get("rent_amount") or 0)
                                if rent_amount.is_integer():
                                    rent_amount = int(rent_amount)
                            except (ValueError, TypeError):
                                continue
                            
                            vacant_beds = total_beds - occupied_beds
                            if vacant_beds > 0:
                                floor_no = r.get("floor_no")
                                if floor_no is not None:
                                    try:
                                        floor_no = int(float(floor_no))
                                    except (ValueError, TypeError):
                                        pass

                                maintenance = r.get("maintenance")
                                if maintenance is not None:
                                    try:
                                        maintenance = int(float(maintenance))
                                    except (ValueError, TypeError):
                                        pass

                                available_rooms.append({
                                    "room_number": r.get("room_number"),
                                    "room_type": r.get("room_type"),
                                    "rent_amount": rent_amount,
                                    "vacant_beds": vacant_beds,
                                    "total_beds": total_beds,
                                    "floor_no": floor_no,
                                    "maintenance": maintenance
                                })
                    return available_rooms
                else:
                    logger.error(f"Error fetching rooms: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query rooms: {e}")
        return []

    async def get_latest_payment(self, tenant_id: int) -> dict:
        """Retrieves the latest rent payment status for a tenant."""
        url = f"{self.url}/rest/v1/payments?tenant_id=eq.{tenant_id}&order=year.desc,month.desc&limit=1"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    records = response.json()
                    if records:
                        return records[0]
                else:
                    logger.error(f"Error fetching latest payment: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query latest payment: {e}")
        return None

    async def register_complaint(self, owner_id: str, tenant_phone: str, message: str) -> bool:
        """Registers a new complaint in the complaints table."""
        url = f"{self.url}/rest/v1/complaints"
        # Store clean 10-digit number for tenant_phone
        clean_phone = "".join(c for c in tenant_phone if c.isdigit())
        tenant_phone_db = clean_phone[-10:] if len(clean_phone) >= 10 else clean_phone
        
        payload = {
            "owner_id": owner_id,
            "tenant_phone": tenant_phone_db,
            "complaint_message": message,
            "status": "Under Working"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=10.0)
                if response.status_code in [200, 201]:
                    logger.info(f"Complaint registered successfully for phone {tenant_phone_db}")
                    return True
                else:
                    logger.error(f"Error registering complaint: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to register complaint: {e}")
        return False

    async def get_complaints(self, owner_id: str, tenant_phone: str) -> list:
        """Retrieves recent complaints for a tenant."""
        clean_phone = "".join(c for c in tenant_phone if c.isdigit())
        tenant_phone_db = clean_phone[-10:] if len(clean_phone) >= 10 else clean_phone
        
        url = f"{self.url}/rest/v1/complaints?owner_id=eq.{owner_id}&tenant_phone=eq.{tenant_phone_db}&order=created_at.desc&limit=5"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Error fetching complaints: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query complaints: {e}")
        return []

    async def create_lead(self, owner_id: str, name: str, phone: str, room_type: str, sharing_preference: str, move_in_date: str, room_no: str = None) -> bool:
        """Registers a new lead in the dedicated leads table."""
        url = f"{self.url}/rest/v1/leads"
        clean_phone = "".join(c for c in phone if c.isdigit())
        phone_db = clean_phone[-10:] if len(clean_phone) >= 10 else clean_phone
        
        payload = {
            "owner_id": owner_id,
            "name": name,
            "phone": phone_db,
            "room_type": room_type,
            "sharing_preference": sharing_preference,
            "move_in_date": move_in_date,
            "room_no": room_no
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=10.0)
                if response.status_code in [200, 201]:
                    logger.info(f"Lead registered successfully: {name} ({phone_db})")
                    return True
                else:
                    logger.error(f"Error creating lead: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to create lead: {e}")
        return False

    async def get_lead_by_phone(self, owner_id: str, phone: str) -> dict:
        """Looks up a lead under the owner by phone number (last 10 digits match)."""
        if not phone or not owner_id:
            return None
        clean_phone = "".join(c for c in phone if c.isdigit())
        phone_db = clean_phone[-10:] if len(clean_phone) >= 10 else clean_phone
        url = f"{self.url}/rest/v1/leads?owner_id=eq.{owner_id}&phone=eq.{phone_db}&select=id,name"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    records = response.json()
                    if records:
                        return records[0]
                else:
                    logger.error(f"Error fetching lead: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query lead: {e}")
        return None

    async def get_owner_settings(self, owner_id: str) -> dict:
        """Retrieves settings details for the owner."""
        url = f"{self.url}/rest/v1/settings?owner_id=eq.{owner_id}&select=grace_period_days,default_deposit_fees,refund_deposit,rent_due_day,payment_instructions,upi_id,upi_name,whatsapp_invite_link"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    records = response.json()
                    if records:
                        return records[0]
                else:
                    logger.error(f"Error fetching settings: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to query settings: {e}")
        return {}

    async def check_complaint_rate_limit(self, tenant_phone: str) -> bool:
        """Checks if the tenant has already submitted 3 complaints in the last hour."""
        from datetime import datetime, timedelta, timezone
        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        
        clean_phone = "".join(c for c in tenant_phone if c.isdigit())
        tenant_phone_db = clean_phone[-10:] if len(clean_phone) >= 10 else clean_phone
        
        url = f"{self.url}/rest/v1/complaints"
        params = {
            "tenant_phone": f"eq.{tenant_phone_db}",
            "created_at": f"gte.{one_hour_ago}",
            "select": "id"
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, params=params, timeout=10.0)
                if response.status_code == 200:
                    complaints = response.json()
                    return len(complaints) < 3
                else:
                    logger.error(f"Error checking rate limit: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Failed to check complaint rate limit: {e}")
    async def verify_token(self, token: str) -> dict:
        """Verifies Supabase JWT token by calling Supabase GoTrue user info endpoint."""
        url = f"{self.url}/auth/v1/user"
        headers = {
            "apikey": settings.SUPABASE_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=headers, timeout=10.0)
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Token verification failed: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Error verifying token: {e}")
        return None

    async def get_or_create_payment_link(self, owner_id: str, month: int, year: int) -> str:
        """Retrieves or creates a monthly payment portal token for the given owner, month, and year."""
        url = f"{self.url}/rest/v1/monthly_payment_links?owner_id=eq.{owner_id}&month=eq.{month}&year=eq.{year}&select=portal_token"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    records = response.json()
                    if records:
                        return records[0].get("portal_token")
            except Exception as e:
                logger.error(f"Error fetching monthly payment link: {e}")
                
        # If not found, generate and insert a new one
        import secrets
        portal_token = secrets.token_urlsafe(9)  # Generates ~12 char alphanumeric token
        
        insert_url = f"{self.url}/rest/v1/monthly_payment_links"
        payload = {
            "owner_id": owner_id,
            "month": month,
            "year": year,
            "portal_token": portal_token
        }
        
        async with httpx.AsyncClient() as client:
            try:
                # Use Prefer: return=representation to get the inserted row back
                headers = {**self.headers, "Prefer": "return=representation"}
                response = await client.post(insert_url, json=payload, headers=headers, timeout=10.0)
                if response.status_code in [200, 201]:
                    records = response.json()
                    if records:
                        return records[0].get("portal_token")
                elif response.status_code == 409: # Conflict, already created
                    response_retry = await client.get(url, headers=self.headers, timeout=10.0)
                    if response_retry.status_code == 200:
                        records = response_retry.json()
                        if records:
                            return records[0].get("portal_token")
            except Exception as e:
                logger.error(f"Error inserting monthly payment link: {e}")
                
        return None

    async def get_payment_by_id(self, payment_id: int) -> dict:
        """Retrieves payment details by payment ID."""
        url = f"{self.url}/rest/v1/payments?id=eq.{payment_id}&select=id,tenant_id,owner_id,month,year,rent_amount,extra_charges,total_amount"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    records = response.json()
                    if records:
                        return records[0]
            except Exception as e:
                logger.error(f"Error fetching payment by id {payment_id}: {e}")
        return None

    async def get_tenant_by_id(self, tenant_id: int) -> dict:
        """Retrieves tenant details by tenant ID."""
        url = f"{self.url}/rest/v1/tenants_table?id=eq.{tenant_id}&select=id,name,mobile_number"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    records = response.json()
                    if records:
                        return records[0]
            except Exception as e:
                logger.error(f"Error fetching tenant by id {tenant_id}: {e}")
        return None

supabase_service = SupabaseService()
