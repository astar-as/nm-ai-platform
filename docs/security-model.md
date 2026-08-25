# Security model

The platform assumes participants will inspect the public source, automate every
API call they can reach, submit malformed input, race concurrent requests, and
attempt to learn hidden evaluation data. Security must come from enforced trust
boundaries, not from obscurity.

## Assets

- participant identity, team membership, invitations, and personal data;
- task reveal schedules, private test data, ground truth, and scoring logic;
- endpoint credentials and uploaded artifacts;
- submission quotas, scores, final selections, bans, and certificates;
- operator, database, object-storage, email, OAuth, and worker credentials.

No private test data, scoring implementation, or production credentials belong
in this repository or in a participant-facing image.

## Enforced boundaries

### Identity and browser writes

Browser sessions use signed, HTTP-only cookies. Unsafe cookie-authenticated
requests must come from the configured frontend origin. OAuth state is
single-use, PKCE is enabled, verified email is required, magic-login and team
invitation tokens are single-use hashes, and their raw values stay in URL
fragments rather than request logs.

Personal access tokens are random, stored only as SHA-256 digests, expire, can
be revoked, and are returned only at creation. Admin authorization is enforced
by backend dependencies; any frontend route check is presentation only.

### Team and submission integrity

The database enforces one active team membership per competition, the configured
team-size limit, task/team competition matching, submission-mode matching, and
roster immutability after the first submission. Application transactions use
advisory locks to serialize quota and membership races.

MCP tools call the authenticated backend API. They have no database or object
storage authority and never accept a caller-supplied team identity.

### Endpoint evaluation

Endpoint URLs must use HTTPS. The shared validator client rejects credentials in
URLs, IP literals, non-global DNS results, disallowed ports, redirects, invalid
content lengths, and oversized or non-JSON responses. It validates every DNS
answer and pins the connection to a validated address to reduce DNS-rebinding
risk. Deploy validators without access to control-plane or cloud metadata
networks as a second boundary.

### Artifact evaluation

The backend bounds uploads, checks their media signature, places each artifact
under a task/team/submission key, and revalidates signed uploads before queueing.
That is input validation, not code isolation. The included validator template
does not execute artifacts.

Production code evaluation requires a separate disposable sandbox with no cloud
credentials, no host mounts, no network by default, an unprivileged identity, a
read-only base filesystem, and strict CPU, memory, process, disk, output, and
wall-clock limits. Treat archive extraction, dependency installation, model
loading, and generated output as hostile operations too.

### Scoring

Validators require an exact `TASK_ID`, claim work with `SKIP LOCKED`, and write a
result only while their lease is still valid and owned by their worker ID. An
expired worker cannot overwrite a newer result. Private evaluations are stored
separately and become participant-visible only through the final reveal flow.

Run validator database identities with the narrowest practical permissions and
separate them from the API, migration, and provisioning identities. A database
superuser can bypass application policy by definition.

## Operator responsibilities

The repository does not provide a production network perimeter, web-application
firewall, DDoS protection, hostile-code sandbox, secret manager, immutable task
packaging process, or organization-specific privacy program. Operators must
provide and independently review those controls.

At minimum:

- terminate TLS and apply request/body/rate limits before public services;
- keep PostgreSQL, object storage, validators, and sandbox control planes private;
- isolate private test data from participant-readable data and images;
- pin deployment artifacts by digest and separate roles and credentials;
- monitor authentication, admin, submission, lease, and scoring events without
  logging tokens, endpoint keys, participant artifacts, or ground truth;
- test backup/restore, rollback, abuse handling, secret rotation, and data
  retention before launch.

## Security acceptance

A release is not accepted solely because tests pass or containers build. Verify
the exact deployed commit, database schema, identity-provider configuration,
storage policies, validator task scope, sandbox restrictions, reveal timestamps,
quota races, and live behavior with both participant and admin accounts.
