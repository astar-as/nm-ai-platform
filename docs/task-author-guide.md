# Task author guide

A task consists of participant documentation, platform metadata and a validator.
Keep hidden test data and scoring secrets outside this repository.

## 1. Define the contract

Document inputs, outputs, resource limits, scoring, determinism, retry behavior
and participant-visible errors. Decide whether the task accepts an endpoint,
uploaded code or another artifact. Treat the documented contract as stable once
the competition starts.

Add participant documentation under `apps/mcp-challenge/docs/<task>/` and a task
page under `apps/frontend/app/(main)/submit/`. The documentation server hides
all non-public pages when `COMPETITION_START` is unset. Set a reveal timestamp,
use `PUBLIC_DOC_PREFIXES` for pages that are safe before reveal, or set
`REVEAL_ALL_DOCS=true` only when every page may be served.

## 2. Add task metadata

Create competition/task metadata with a private operator provisioning process.
Do not add event data, test fixtures, scoring code, ground truth, participant
data, or storage credentials to the public schema migration.

## 3. Implement the validator

Copy `apps/validators/validator-template/` to a new task-specific directory and
implement the `BaseScorer` contract. Validators must:

- enforce time, memory, network and output limits outside participant code;
- treat submissions as hostile input;
- use deterministic fixtures where scores must be reproducible;
- sanitize participant-visible failures;
- extend their lease during long evaluations and tolerate worker restarts;
- write scores only after the complete evaluation succeeds.
- set the exact `TASK_ID`; a validator must refuse to claim an unscoped queue.

Do not run untrusted participant code directly on the validator host. Use an
appropriately isolated sandbox with no ambient credentials or internal-network
access.

The template is deliberately fail-closed and contains no scorer. A constant,
placeholder, or pass-through score must never be deployed.

Pin every task-specific Python dependency and include its artifact hashes in
the copied `requirements.txt`. The validator image uses `--require-hashes` and
will reject floating or unhashed packages.

## 4. Test the full path

Add unit tests for scoring boundaries and failure cases, then test the vertical
slice: participant submission → storage → lease claim → evaluation → score →
leaderboard. Include malformed archives, oversized output, timeout, worker
death, duplicate delivery and retry behavior.

Before launch, have an independent reviewer reproduce a known score using only
the published task documentation and starter materials.
