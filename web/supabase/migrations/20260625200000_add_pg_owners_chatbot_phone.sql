-- Feature: chatbot one-tap reconnect
--
-- Remember the last WhatsApp number used to pair the chatbot so the owner can
-- regenerate a pairing code (reconnect) without re-typing the number.
ALTER TABLE public.pg_owners ADD COLUMN IF NOT EXISTS chatbot_phone text;
