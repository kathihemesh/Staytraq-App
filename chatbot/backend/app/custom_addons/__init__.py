import importlib
import re
import logging
from app.custom_addons.base import BaseChatbotAddon

logger = logging.getLogger("backend.custom_addons")

def get_addon_for_owner(email: str) -> BaseChatbotAddon | None:
    if not email:
        return None
    
    # Sanitize email to a valid python module identifier
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', email.lower().strip())
    module_path = f"app.custom_addons.{sanitized}"
    
    try:
        module = importlib.import_module(module_path)
        # Look for a class named ChatbotAddon in the imported module
        addon_class = getattr(module, "ChatbotAddon", None)
        if addon_class and issubclass(addon_class, BaseChatbotAddon):
            return addon_class()
        logger.warning(f"Addon module found at {module_path} but ChatbotAddon class is missing or invalid.")
    except ImportError:
        # Expected if the owner does not have a custom addon script
        pass
    except Exception as e:
        logger.error(f"Error loading custom addon for {email}: {e}")
        
    return None
