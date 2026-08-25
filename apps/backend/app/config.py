from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-secret-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI Championship Platform"

    database_url: str = "postgresql://postgres:postgres@postgres:5432/championship"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_expire_minutes: int = 60 * 24 * 7
    jwt_issuer: str = "ai-competition-platform"
    jwt_audience: str = "ai-competition-platform"

    # OAuth - Google (primary login)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8003/auth/callback"

    # Loops.so email service
    loops_api_key: str = ""

    # Transactional email IDs (one per email type, configured in Loops dashboard)
    loops_transactional_id: str = ""  # magic link login
    loops_invite_transactional_id: str = ""  # team invite
    loops_member_joined_transactional_id: str = ""  # notify captain when someone joins

    # Auth settings
    allow_mock_auth: bool = False
    allow_insecure_http: bool = False
    frontend_url: str = "http://localhost:3003"
    backend_url: str = "http://localhost:8003"

    # Cookie domain for auth cookies (e.g. ".example.com"). None = host-only cookies.
    cookie_domain: str | None = None
    secure_cookies: bool | None = None

    # Base64-encoded 32-byte AES key used to encrypt participant-supplied
    # endpoint credentials at rest. Required only when such credentials are used.
    submission_secret_key: str = ""

    @property
    def cookie_secure(self) -> bool:
        if self.secure_cookies is not None:
            return self.secure_cookies
        return self.frontend_url.startswith("https://")

    # API docs (disabled by default for production safety)
    docs_enabled: bool = False

settings = Settings()
