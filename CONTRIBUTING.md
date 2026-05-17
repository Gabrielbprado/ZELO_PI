# Contributing to ZELO

Thanks for considering a contribution! This document describes the workflow used
in this repository so changes stay reviewable and the history stays useful.

---

## Code of conduct

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Getting started

1. Fork the repository and clone your fork.
2. Follow [`docs/SETUP.md`](./docs/SETUP.md) to install dependencies, set up
   PostgreSQL and configure environment variables (`backend/.env`,
   `mobile/app.json` extras).
3. Create a feature branch off `main`:

   ```bash
   git checkout -b feat/<short-description>
   ```

---

## Branching strategy

| Prefix       | Use for                                          |
| ------------ | ------------------------------------------------ |
| `feat/`      | new user-facing functionality                    |
| `fix/`       | bug fixes                                        |
| `refactor/`  | internal restructuring with no behavior change   |
| `docs/`      | documentation-only changes                       |
| `test/`      | adding or fixing tests                           |
| `chore/`     | tooling, dependencies, build configuration       |

Branches should be small and focused — one concern per PR.

---

## Commit messages

We follow **Conventional Commits** with a scope:

```
<type>(<scope>): <subject>
```

Examples:

- `feat(auth): add refresh token rotation`
- `fix(bookings): block double-cancellation`
- `refactor(backend): extract publicUserSelect to selectors module`
- `docs(readme): describe emergency matching flow`
- `test(integration): cover rate-limit on /auth/login`

Rules:

- Subject in **imperative mood**, lower-case, ≤ 72 characters, no trailing dot.
- Body wraps at 100 chars, explains **why** when not obvious.
- One logical change per commit. Use `git add -p` to split.

---

## Code style

- **TypeScript** everywhere. `npm run lint` (which is `tsc --noEmit`) must pass.
- Functions stay small (≤ ~40 lines). Extract helpers when they grow.
- Prefer **pure functions** in services; keep side effects at the edge
  (controllers, Prisma calls).
- Validate input at the boundary with **Zod schemas** in `backend/src/validators/`.
- Never log secrets — Pino redact rules are already configured, don't bypass them.
- No `any` unless you justify it with a comment.

---

## Tests

- Unit tests live in `backend/tests/unit/` — no database, pure logic.
- Integration tests live in `backend/tests/integration/` — hit a real PostgreSQL
  instance pointed to by `TEST_DATABASE_URL`.

Run them locally before opening a PR:

```bash
cd backend
npm run test:unit
npm run test:integration   # requires Postgres
```

Pull requests touching backend logic should include or update tests.

---

## Pull request checklist

Before clicking **Create pull request**, confirm:

- [ ] Branch is rebased on the latest `main`.
- [ ] All commits follow the Conventional Commits convention.
- [ ] `npm run lint` and tests pass for every affected package.
- [ ] No `.env`, secrets, or generated artifacts are staged.
- [ ] Public behavior changes are reflected in the README or `docs/`.
- [ ] Security-relevant changes are reflected in `docs/SECURITY.md`.

---

## Reporting bugs or vulnerabilities

- **Functional bugs** → open a GitHub issue with reproduction steps, expected
  vs. actual behavior, environment, and logs (with secrets removed).
- **Security vulnerabilities** → please do **not** open a public issue. Email
  the maintainer privately so we can patch before disclosure.

Thank you for helping keep ZELO healthy.
