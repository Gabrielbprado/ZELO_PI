# Security Policy

## Reporting a vulnerability

If you discover a security issue, **please do not open a public GitHub issue**.

Instead, email the maintainer privately at
[gabriel.b.prado13@gmail.com](mailto:gabriel.b.prado13@gmail.com) with:

- A description of the issue and its potential impact.
- A minimal reproduction (curl, code, or screenshots).
- Affected commit / version if you can identify it.

You will get an acknowledgement within 72 hours. Coordinated disclosure is
appreciated — we aim to patch and publish a fix before public discussion.

## Scope

This policy covers the backend API (`backend/`) and the mobile client
(`mobile/`). Third-party services (PostgreSQL, Expo, npm registry, etc.) are
out of scope here — please report those upstream.

## Security practices applied in this repository

See [`docs/SECURITY.md`](./docs/SECURITY.md) for the full checklist:
hashing, JWT rotation, brute-force lockout, rate limiting, RBAC, helmet
headers, anti-pollution, logging redaction and storage of tokens on mobile.

## Supported versions

The project currently ships from `main`. Security fixes land directly on
`main` and are documented in the pull request that introduces them.
