# Submission MCP client

This server is a thin authenticated client for the platform API. It has no
database or object-storage credentials and cannot choose a team identity.

Run one instance per participant:

```bash
PLATFORM_API_URL=https://competition.example \
PLATFORM_ACCESS_TOKEN=cmp_replace_with_personal_token \
python server.py
```

Create the personal token from an authenticated browser session using
`POST /auth/tokens`. The raw token is shown once, stored only as a digest by the
platform, expires, and can be revoked.

For local HTTP development only, set `ALLOW_INSECURE_HTTP=true`. HTTP transport
mode also requires a separate `AUTH_TOKEN` protecting access to this MCP
process. Never deploy one shared instance containing a participant token; every
caller would act as that participant.
