from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PORT: int = 8000
    HOST: str = "127.0.0.1"
    EVOLUTION_API_URL: str = "http://localhost:8080"
    EVOLUTION_API_KEY: str = "staytraq_chatbot_secret_key"
    # Static service secret used to authenticate internal service-to-service
    # calls (e.g. the identity-reminders Supabase edge function calling the
    # /api/v1/send-whatsapp-notice-service endpoint). Distinct from
    # EVOLUTION_API_KEY so the Evolution credential is never overloaded.
    INTERNAL_SERVICE_KEY: str = ""
    CHATBOT_WEBHOOK_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Supabase Settings
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    
    # LLM Settings
    AI_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    AI_MODEL: str = "gemini-2.5-flash"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
