# Security

## Supported versions

Security fixes are applied to the latest commit on `main`. This project does
not currently maintain older release branches.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature (Security → Report
a vulnerability). Do not open a public issue for a suspected vulnerability.

Include the affected component, reproduction steps, impact and any suggested
mitigation. We will acknowledge a report as soon as practical and coordinate
disclosure after a fix is available.

## Deployment responsibilities

The development defaults are intentionally local and are not production
credentials. Before deployment, configure unique JWT and endpoint-encryption
keys, disable mock authentication, configure OAuth and email credentials, use
separate restricted database roles, and place public services behind TLS and
appropriate request limits. The backend refuses to start with the development
JWT secret unless mock authentication is explicitly enabled.

Uploaded code is hostile. This repository does not include a production-ready
code-execution sandbox. Review [the security model](docs/security-model.md)
before exposing a deployment.
