# Validator template

This directory is a deliberately incomplete starting point for one isolated
validator worker. It will refuse to start until you implement deterministic
scoring and set `TEMPLATE_READY = True` in `main.py`.

## Configure it

1. Copy this directory and implement `TemplateScorer` plus the evaluation flow.
2. Set `TASK_ID` to the exact database UUID this worker may claim.
3. Load test data from private object storage. Never place ground truth in this
   repository, a container image, a public bucket, or participant responses.
4. For endpoint submissions, use `SafeHTTPClient.request_json()` so DNS is
   pinned, redirects are disabled, private networks are blocked, and response
   size is bounded.
5. For code submissions, run the artifact in a purpose-built sandbox outside
   the API and validator control plane. At minimum use an unprivileged identity,
   a read-only filesystem, no host mounts, no cloud credentials, no network by
   default, strict CPU/memory/process/time limits, and a fresh disposable
   environment for every submission.

The template itself does not execute uploaded code. A container alone is not a
sufficient hostile-code boundary.

## Run the harness locally

```bash
cd apps/validators
pip install --require-hashes -r shared/requirements.lock
pip install --require-hashes -r validator-template/requirements.txt
TASK_ID=00000000-0000-0000-0000-000000000000 \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/championship \
MOCK_TEST_DATA=1 \
python validator-template/main.py
```

The placeholder UUID must be replaced with a real task UUID. The process will
still refuse to start until the template has been implemented.

The shared harness provides task-scoped leasing, lease fencing, retries,
health checks, encrypted endpoint-secret loading, bounded test-data loading,
and Prometheus metrics. Keep validator database permissions narrow: it should
only claim and score submissions for its configured task.
