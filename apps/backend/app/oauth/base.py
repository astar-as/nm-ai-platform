from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class OAuthUser:
    provider: str
    provider_user_id: str
    email: str
    name: str
    avatar_url: str | None = None


class OAuthProvider(ABC):
    @abstractmethod
    async def get_authorize_url(self, state: str, code_verifier: str) -> str:
        """Build the provider's authorization URL with PKCE verifier (derives challenge internally)."""
        ...

    @abstractmethod
    async def exchange_code(self, code: str, code_verifier: str) -> dict:
        """Exchange authorization code + PKCE verifier for tokens."""
        ...

    @abstractmethod
    async def get_user_info(self, tokens: dict) -> OAuthUser:
        """Fetch user profile from the provider using token response."""
        ...
