# ZELO Backend

REST API powering the ZELO Marketplace. Node.js + TypeScript + Express + Prisma + PostgreSQL.

---

## Architecture

```
src/
├── server.ts          # production entry — boots HTTP server, wires SIGTERM
├── app.ts             # createApp() — testable Express factory
├── config/
│   ├── env.ts         # Zod-validated environment loader
│   └── prisma.ts      # singleton Prisma client
├── constants/         # http codes, security thresholds, time, pricing tables
├── errors/            # AppError + typed subclasses (BadRequestError, …)
├── selectors/         # reusable Prisma `select` objects (publicUserSelect, …)
├── middleware/        # authenticate, requireRole, rateLimit, validate, errorHandler
├── validators/        # Zod request schemas, grouped by resource
├── services/          # business rules — framework-agnostic, throw AppError
├── controllers/       # thin HTTP adapters wrapped in asyncHandler
├── routes/            # Express routers, mounted at /api/v1
└── utils/             # asyncHandler, password, tokens, logger
```

Design choices worth knowing:

- **No `try { ... } catch (e) { next(e) }` in controllers** — `asyncHandler`
  forwards rejections to the central error pipeline.
- **Errors are classes, not factories** — `throw new NotFoundError('…')` instead
  of `throw NotFound('…')`. Plays nicer with `instanceof` and stack traces.
- **Magic numbers live in `constants/`** — bcrypt cost, password TTLs,
  refresh-token bytes, urgency multipliers, etc. Tweaking them is a single-file PR.
- **`publicUserSelect` lives in `selectors/`** — every response that returns a
  user goes through it, so `passwordHash` and lock fields cannot leak.
- **Validators are plain objects** `{ body?, query?, params? }`, not wrapped
  `z.object({body: …})`. The `validate()` middleware can therefore parse and
  *replace* each `req` slice with the coerced, stripped value.

---

## Scripts

| Command                       | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `npm run dev`                 | Hot-reload (`tsx watch`).                                     |
| `npm run build`               | Compile TS to `dist/`.                                        |
| `npm start`                   | Run the compiled production build.                            |
| `npm run prisma:migrate`      | Create migrations in development.                             |
| `npm run prisma:deploy`       | Apply migrations in production.                               |
| `npm run prisma:seed`         | Populate the database with example data.                      |
| `npm run prisma:studio`       | Launch Prisma Studio.                                         |
| `npm run lint`                | `tsc --noEmit` — strict type-check.                           |
| `npm test`                    | Unit + integration suites.                                    |
| `npm run test:unit`           | Pure-logic unit tests (no DB).                                |
| `npm run test:integration`    | Integration tests — needs Postgres + `TEST_DATABASE_URL`.     |

---

## Setup

See [`docs/SETUP.md`](../docs/SETUP.md). Configure `backend/.env` first — the
server refuses to start without `DATABASE_URL`, `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` (each ≥ 32 chars).

---

## Error contract

Every error response follows the same envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Mensagem em português",
    "details": {}
  }
}
```

Stable codes (`backend/src/constants/http.ts`):

`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`TOO_MANY_REQUESTS`, `VALIDATION_ERROR`, `INTERNAL_ERROR`.

Mobile clients pin to these codes — bumping or renaming one is a breaking
change.
