import os
from uuid import UUID

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@postgres:5432/championship"

    task_id: UUID | None = None
    worker_id: str = os.getenv("HOSTNAME", "worker-1")
    batch_size: int = 5
    poll_interval: float = 2.0
    max_concurrent_evals: int = 10

    lease_duration_seconds: int = 300
    max_retries: int = 3

    scoring_version: str = "v1.0"
    scoring_config: dict = Field(default_factory=dict)
    submission_secret_key: str = ""

    test_data_bucket: str = "championship-test-data"
    test_data_cache_ttl: int = 300
    max_test_data_bytes: int = 50 * 1024 * 1024

    metrics_port: int = 9090
    health_port: int = 8080

    dev_mode: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
