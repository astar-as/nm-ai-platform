# Operator guide

This guide covers the platform shell. A real championship also needs one or
more challenge validators, participant documentation and production
infrastructure appropriate to its threat model.

## 1. Configure the platform

Copy `.env.example` to `.env` and replace the database password and JWT secret.
The local example explicitly enables mock authentication and insecure HTTP.
Production deployments must set both flags to `false`, configure Google OAuth
and serve both frontend and backend over HTTPS. Mock authentication is rejected
unless both configured URLs are loopback addresses. Set `FRONTEND_URL` to the
exact browser origin; it is also the backend CORS allowlist.

Object-storage settings are required for code-upload challenges. Grant the
backend only the bucket permissions it needs and give validator workers their
own least-privilege identity.

Generate `SUBMISSION_SECRET_KEY` as URL-safe base64 for exactly 32 random bytes.
Use the same value in the backend and endpoint validators. It encrypts
participant-supplied endpoint credentials at rest; it is not a general platform
secret.

## 2. Start a local stack

```bash
cp .env.example .env
# edit .env
docker compose up --build
```

The frontend is available at `http://localhost:3003` and the backend health
endpoint at `http://localhost:8003/health`. The one-shot `migrate` service
applies every SQL migration before the backend starts.

## 3. Prepare a competition

1. Add competition and task metadata through a private, operator-only
   provisioning process. Keep the public initial schema data-free.
   Every task included in the overall leaderboard must define finite
   `normalization_min` and `normalization_max` bounds. Participant-observed
   extrema are deliberately never used because they make normalization
   manipulable.
2. Add participant-facing task pages and MCP documentation.
3. Build and deploy one validator per task UUID. Set the exact `TASK_ID`, and
   give every worker a unique `WORKER_ID`.
4. Exercise registration, team creation, submission, scoring, leaderboard and
   certificate flows in a non-production environment.
5. Set launch and reveal timestamps, then verify them from an unauthenticated
   browser and a non-admin participant account.

The [task author guide](task-author-guide.md) describes the task-specific work.

## 4. Production checklist

- Use managed secrets; never bake credentials into images or frontend build
  arguments.
- Use a restricted PostgreSQL application role, automated backups and tested
  restore procedures.
- Put services behind TLS, request limits and platform-level denial-of-service
  controls.
- Run the submission MCP client once per participant token. Do not expose a
  shared instance carrying a participant credential.
- Keep backend, MCP and validator services private unless their endpoint is
  explicitly participant-facing.
- Pin immutable image digests and retain logs for authentication, admin actions,
  submissions and scoring workers.
- Run the repository CI, dependency audit and secret scan against the exact
  release commit.
- Independently review the hostile-code sandbox and validator database role;
  neither is supplied as a production-ready boundary by this repository.

## 5. Upgrades and rollback

Back up PostgreSQL before applying new migrations. Migrations are forward-only;
test them against a restored production snapshot before rollout. Deploy the
backend and workers only after migration succeeds, then verify `/health`, a
participant login and a test submission. Roll application images back by digest
if needed; restore the database only through the operator's tested recovery
procedure.

## 6. End of competition

Disable new submissions, wait for active leases to finish, export final scores
and preserve the audit trail. Revoke temporary credentials and participant-data
access, archive required evidence, and delete personal data according to the
published privacy policy and applicable retention requirements.
