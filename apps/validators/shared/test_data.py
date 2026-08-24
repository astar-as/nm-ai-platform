import asyncio
import hashlib
import json
import os
import time
from dataclasses import dataclass

import aioboto3

from shared.config import settings


@dataclass
class TestSet:
    id: str
    task_id: str
    version: int
    cases: list[dict]
    ground_truth: list[dict]
    checksum: str


class TestDataLoader:
    def __init__(self, bucket: str, cache_ttl: int = 300):
        self.bucket = bucket
        self.cache_ttl = cache_ttl
        self._cache: dict[str, tuple[TestSet, float]] = {}
        self._lock = asyncio.Lock()

    async def load(self, task_id: str, test_set_id: str) -> TestSet:
        cache_key = f"{task_id}:{test_set_id}"

        async with self._lock:
            if cache_key in self._cache:
                test_set, cached_at = self._cache[cache_key]
                if time.time() - cached_at < self.cache_ttl:
                    return test_set

        session = aioboto3.Session()
        async with session.client("s3") as s3:
            cases_obj = await s3.get_object(
                Bucket=self.bucket,
                Key=f"{task_id}/{test_set_id}/cases.json",
            )
            self._validate_size(cases_obj, "cases.json")
            cases_data = await cases_obj["Body"].read()
            cases = json.loads(cases_data)

            truth_obj = await s3.get_object(
                Bucket=self.bucket,
                Key=f"{task_id}/{test_set_id}/ground_truth.json",
            )
            self._validate_size(truth_obj, "ground_truth.json")
            truth_data = await truth_obj["Body"].read()
            ground_truth = json.loads(truth_data)

        if not isinstance(cases, list) or not isinstance(ground_truth, list):
            raise ValueError("Test-set files must contain JSON arrays")

        checksum = hashlib.sha256(cases_data + truth_data).hexdigest()[:16]

        test_set = TestSet(
            id=test_set_id,
            task_id=task_id,
            version=1,
            cases=cases,
            ground_truth=ground_truth,
            checksum=checksum,
        )

        async with self._lock:
            self._cache[cache_key] = (test_set, time.time())

        return test_set

    @staticmethod
    def _validate_size(response: dict, filename: str) -> None:
        size = int(response.get("ContentLength", 0))
        if size <= 0 or size > settings.max_test_data_bytes:
            raise ValueError(
                f"{filename} must be between 1 and {settings.max_test_data_bytes} bytes"
            )

    async def ping(self) -> bool:
        session = aioboto3.Session()
        async with session.client("s3") as s3:
            await s3.head_bucket(Bucket=self.bucket)
        return True

    def clear_cache(self):
        self._cache.clear()


class MockTestDataLoader:
    async def load(self, task_id: str, test_set_id: str) -> TestSet:
        return TestSet(
            id=test_set_id,
            task_id=task_id,
            version=1,
            cases=[],
            ground_truth=[],
            checksum="mock-checksum",
        )

    async def ping(self) -> bool:
        return True

    def clear_cache(self):
        pass


def create_test_data_loader():
    """Factory function to create appropriate test data loader."""
    if os.getenv("MOCK_TEST_DATA", "").lower() in ("1", "true", "yes"):
        return MockTestDataLoader()
    else:
        return TestDataLoader(
            bucket=settings.test_data_bucket,
            cache_ttl=settings.test_data_cache_ttl,
        )


# Default loader (for backwards compatibility in shared health checks)
if os.getenv("MOCK_TEST_DATA", "").lower() in ("1", "true", "yes"):
    test_data_loader = MockTestDataLoader()
else:
    test_data_loader = TestDataLoader(
        bucket=settings.test_data_bucket,
        cache_ttl=settings.test_data_cache_ttl,
    )
