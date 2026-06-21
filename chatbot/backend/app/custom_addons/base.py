class BaseChatbotAddon:
    def modify_system_prompt(self, system_prompt: str, is_tenant: bool, session: dict) -> str:
        """Modify or append guidelines to the default LLM system prompt."""
        return system_prompt

    def modify_context(self, context: str, is_tenant: bool, session: dict) -> str:
        """Modify or append ground truth context passed to the LLM."""
        return context

    async def handle_custom_intents(self, intents: list[str], extracted_data: dict, session: dict, is_tenant: bool) -> str | None:
        """
        Execute custom backend logic or third-party API integrations when custom intents are matched.
        Returns a string contribution (like an acknowledgement note) to append to the LLM response reply.
        """
        return None
