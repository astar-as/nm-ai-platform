from unittest.mock import AsyncMock
from uuid import uuid4

from app.helpers import compute_overall_rankings
from tests.conftest import make_mock_record


async def test_overall_normalization_uses_fixed_bounds_not_observed_extrema():
    task_id = uuid4()
    honest_team = uuid4()
    extreme_team = uuid4()
    db = AsyncMock()
    db.fetch.side_effect = [
        [
            make_mock_record(
                id=task_id,
                slug="fixed-bounds",
                scoring_config={
                    "score_direction": "maximize",
                    "normalization_min": 0,
                    "normalization_max": 100,
                    "overall_weight": 1,
                },
            )
        ],
        [
            make_mock_record(team_id=honest_team, score=50),
            make_mock_record(team_id=extreme_team, score=-1_000_000_000),
        ],
        [
            make_mock_record(id=honest_team, name="Honest", slug="honest"),
            make_mock_record(id=extreme_team, name="Extreme", slug="extreme"),
        ],
    ]

    entries, _ = await compute_overall_rankings(db, uuid4())
    by_team = {entry["team_id"]: entry for entry in entries}

    assert by_team[str(honest_team)]["normalized_scores"]["fixed_bounds"] == 50
    assert by_team[str(extreme_team)]["normalized_scores"]["fixed_bounds"] == 0


async def test_task_without_fixed_bounds_has_no_overall_weight():
    task_id = uuid4()
    team_id = uuid4()
    db = AsyncMock()
    db.fetch.side_effect = [
        [make_mock_record(id=task_id, slug="unconfigured", scoring_config={})],
        [make_mock_record(team_id=team_id, score=999999)],
        [make_mock_record(id=team_id, name="Team", slug="team")],
    ]

    entries, _ = await compute_overall_rankings(db, uuid4())

    assert entries[0]["normalized_scores"]["unconfigured"] == 0
    assert entries[0]["overall_score"] == 0
