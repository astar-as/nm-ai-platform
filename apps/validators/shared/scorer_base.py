from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ScoreResult:
    score: float
    metrics: dict


class BaseScorer(ABC):
    @abstractmethod
    def score(
        self,
        predictions: list[dict],
        ground_truth: list[dict],
    ) -> ScoreResult:
        pass
