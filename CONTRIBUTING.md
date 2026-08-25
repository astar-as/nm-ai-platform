# Contributing

Thanks for helping improve NM AI-Platform.

## Development setup

The devcontainer is the simplest complete environment. For a local setup,
install Python 3.12+, Node.js 22, pnpm 10, PostgreSQL and `just`, then run:

```bash
just install
just migrate
just test
```

Before opening a pull request, also run the frontend checks:

```bash
cd apps/frontend
pnpm lint
pnpm build
```

Schema changes must work when every migration is applied in filename order to
a fresh PostgreSQL database. Authentication, authorization, scoring, submission
leases and participant-visible error handling require tests.

Never commit credentials, participant data, private evaluation data or real
competition submissions. Report security issues through the private process in
[SECURITY.md](SECURITY.md).

## Licensing

By submitting a contribution, you agree that it may be distributed under the
[MIT License](LICENSE).
