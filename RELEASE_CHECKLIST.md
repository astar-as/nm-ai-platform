# Public release checklist

Publish a clean snapshot only after every required item is confirmed against
the exact release commit.

## Repository contents

- [ ] No task implementation, starter kit, fixture, dataset, ground truth,
  scoring secret, participant artifact, event seed, or production runbook.
- [ ] No secrets in the working tree or Git history; the independent secret
  scan is clean.
- [ ] No generated caches, local databases, uploads, logs, or environment files.
- [ ] License and third-party notices cover every shipped asset and dependency.
- [ ] Public documentation matches the current schema and configuration.

## Verification

- [ ] The initial schema applies to an empty PostgreSQL 16 database.
- [ ] Backend tests and lint pass.
- [ ] Frontend lint and production build pass.
- [ ] Validator and MCP tests, lint, and compile checks pass.
- [ ] Production dependency audits have no unresolved high-impact findings.
- [ ] Every container builds and runs as a non-root user.

## Deployment gates

- [ ] Mock authentication is disabled.
- [ ] Frontend, backend, and any public MCP endpoint use HTTPS.
- [ ] JWT, endpoint-encryption, database, email, OAuth, storage, and MCP secrets
  are unique managed values with documented rotation owners.
- [ ] Application, migration, validator, and sandbox roles are separate and
  least-privileged.
- [ ] Uploaded code executes only in an independently reviewed hostile-code
  sandbox; the validator control plane has no code-execution path.
- [ ] Test data and ground truth are in private storage and absent from images.
- [ ] Task reveal, open, close, final-review, and leaderboard-reveal transitions
  have been exercised with a non-admin account.
- [ ] Backups, restore, rollback, retention, abuse response, and vulnerability
  reporting are tested and owned.

If the development history ever contained private material, publish a new
squashed repository snapshot rather than relying on a later deletion commit.
