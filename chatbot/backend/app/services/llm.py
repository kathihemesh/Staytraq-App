import logging
import json
import re
import httpx
from app.config import settings

logger = logging.getLogger("backend.services.llm")

def parse_json_robustly(text_content: str) -> dict:
    """Robustly parses JSON content from LLM response, handling markdown code fences."""
    if not text_content:
        return {}
    
    text = text_content.strip()
    logger.info(f"Raw LLM response before parsing: {text}")
    
    # Try parsing directly first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Try removing markdown code fences (e.g. ```json ... ``` or ``` ...)
    cleaned = text
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()
    
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
        
    # As a last resort, find the first '{' and last '}' and parse that substring
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except json.JSONDecodeError as ex:
            logger.error(f"Failed to parse substring JSON: {text[start:end+1]}. Error: {ex}")
            
    logger.error(f"Failed all attempts to parse JSON from: {text}")
    return {}

class BaseLLMProvider:
    async def generate_response(self, system_prompt: str, history: list, user_message: str) -> dict:
        """
        Sends request to LLM provider.
        Returns a dict: {"reply": str, "intent": str, "extracted_data": dict}
        """
        raise NotImplementedError()


class GeminiLLMProvider(BaseLLMProvider):
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model = settings.AI_MODEL or "gemini-2.5-flash"
        self.url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

    async def generate_response(self, system_prompt: str, history: list, user_message: str) -> dict:
        contents = []
        for msg in history:
            role = "model" if msg.get("role") == "assistant" else "user"
            contents.append({
                "role": role,
                "parts": [{"text": msg.get("content", "")}]
            })
        
        contents.append({
            "role": "user",
            "parts": [{"text": user_message}]
        })

        payload = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.url, json=payload, headers={"Content-Type": "application/json"}, timeout=30.0)
                if response.status_code == 200:
                    data = response.json()
                    text_content = data["candidates"][0]["content"]["parts"][0]["text"]
                    return parse_json_robustly(text_content)
                else:
                    logger.error(f"Gemini API returned error: {response.status_code} - {response.text}")
                    return {"reply": "I'm having trouble connecting to my brain right now. Please try again in a bit!", "intent": "general", "extracted_data": {}}
            except Exception as e:
                logger.error(f"Exception during Gemini API call: {e}")
                return {"reply": "I'm having trouble connecting to my brain right now. Please try again in a bit!", "intent": "general", "extracted_data": {}}


class OpenRouterLLMProvider(BaseLLMProvider):
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model = settings.AI_MODEL or "deepseek/deepseek-chat"
        self.url = "https://openrouter.ai/api/v1/chat/completions"

    async def generate_response(self, system_prompt: str, history: list, user_message: str) -> dict:
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg.get("role"), "content": msg.get("content", "")})
        messages.append({"role": "user", "content": user_message})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.url, json=payload, headers=headers, timeout=30.0)
                if response.status_code == 200:
                    data = response.json()
                    text_content = data["choices"][0]["message"]["content"]
                    return parse_json_robustly(text_content)
                else:
                    logger.error(f"OpenRouter API returned error: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Exception during OpenRouter API call: {e}")
        return {"reply": "Service temporarily unavailable.", "intent": "general", "extracted_data": {}}


class OpenAILLMProvider(BaseLLMProvider):
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.model = settings.AI_MODEL or "gpt-4o-mini"
        self.url = "https://api.openai.com/v1/chat/completions"

    async def generate_response(self, system_prompt: str, history: list, user_message: str) -> dict:
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg.get("role"), "content": msg.get("content", "")})
        messages.append({"role": "user", "content": user_message})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.url, json=payload, headers=headers, timeout=30.0)
                if response.status_code == 200:
                    data = response.json()
                    text_content = data["choices"][0]["message"]["content"]
                    return parse_json_robustly(text_content)
                else:
                    logger.error(f"OpenAI API returned error: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Exception during OpenAI API call: {e}")
        return {"reply": "Service temporarily unavailable.", "intent": "general", "extracted_data": {}}


def get_llm_provider() -> BaseLLMProvider:
    provider = settings.AI_PROVIDER.lower()
    if provider == "gemini":
        return GeminiLLMProvider()
    elif provider == "openrouter":
        return OpenRouterLLMProvider()
    elif provider == "openai":
        return OpenAILLMProvider()
    else:
        logger.warning(f"Unknown AI provider '{provider}', falling back to Gemini")
        return GeminiLLMProvider()
