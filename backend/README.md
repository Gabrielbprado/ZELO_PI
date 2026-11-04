# ZELO Backend

REST API powering the ZELO Marketplace. Node.js 20 + TypeScript + Express 4 +
Prisma 5 + PostgreSQL 16 (PostGIS) + Socket.IO 4 + BullMQ + Pino.

> **Setup, Docker, deploy and troubleshooting live in the root
> [`../README.md`](../README.md)** and [`../docs/SETUP.md`](../docs/SETUP.md).
> This file only covers what's specific to the backend package.

---

## Architecture

```
src/
├── server.ts          # production entry — HTTP server, SIGTERM, Sentry init
├── app.ts             # createApp() — testable Express factory
├── config/
│   ├── env.ts         # Zod-validated env (production refuses `dev_only_*` secrets)
│   ├── prisma.ts      # singleton Prisma client
│   ├── redis.ts       # fail-open client (`enableOfflineQueue: false`)
│   ├── amqp.ts        # confirm channel publisher + consumer channels
│   ├── sentry.ts      # gated by SENTRY_DSN; strips sensitive headers in beforeSend
│   └── jobs.ts        # BullMQ connection + kill-switch
├── constants/         # http codes, security thresholds, time, pricing tables
├── errors/            # AppError + typed subclasses (BadRequestError, GoneError, …)
├── selectors/         # reusable Prisma `select` objects (publicUserSelect, …)
├── middleware/        # authenticate, requireRole, rateLimit, validate, errorHandler
├── validators/        # Zod request schemas, grouped by resource
├── services/          # business rules — framework-agnostic, throw AppError
│                      # (payments, bookings, bookingTravel, ledger, moderation, …)
├── controllers/       # thin HTTP adapters wrapped in asyncHandler
├── routes/            # Express routers, mounted at /api/v1
├── realtime/          # Socket.IO (chat + travel tracking)
├── events/
│   ├── domainBus.ts   # recordEvent() → OutboxEvent row inside the domain tx
│   ├── relay.ts       # outbox → broker publisher (SELECT FOR UPDATE SKIP LOCKED)
│   ├── consumers/     # analytics, ledger, travel, reminders
│   └── types.ts       # routing keys + Zod schemas per event
├── jobs/              # BullMQ processors (cleanup, retention, travel housekeeping)
└── utils/             # asyncHandler, password, tokens, logger (with GPS/PII redact)
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

See [`../docs/SETUP.md`](../docs/SETUP.md). Configure `backend/.env` first — the
server refuses to start without `DATABASE_URL`, `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` (each ≥ 32 chars). In production (`NODE_ENV=production`),
`env.ts` also rejects any secret containing `dev_only_`, `troque_isto`, duplicate
JWT secrets, or an admin password shorter than 16 chars.

---

## Payment gateway

**Asaas is the only supported gateway.** Everything about PIX, cards, webhook
validation, idempotency and reconciliation is in
[`../docs/PAYMENTS.md`](../docs/PAYMENTS.md). When the webhook misbehaves (401 /
404 / 405), use
[`../docs/runbooks/WEBHOOK_ASAAS_DIAGNOSTIC.md`](../docs/runbooks/WEBHOOK_ASAAS_DIAGNOSTIC.md).

---

## GPS / travel tracking (Etapa 2)

The `BookingTravel` session model only stores the **lifecycle** (status +
timestamps). Live coordinates live in Redis under `zelo:travel:{bookingId}:location`
with a short TTL and are **deleted on arrival/cancel** by a service +
housekeeping job. Coordinates never reach logs, Sentry, the outbox or Postgres —
the Pino redact list enforces this at the logging layer.

The mobile side of this feature (Etapa 3) is planned but not implemented — see
[`../docs/plans/ETAPA_3_MOBILE_GPS.md`](../docs/plans/ETAPA_3_MOBILE_GPS.md).

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

Status codes used beyond the standard 4xx: **`410 Gone`** for resources that
existed and were explicitly ended (e.g. travel session after arrived/cancel)
and **`503 Service Unavailable`** for graceful degradation when Redis is down
and the read depends on it.

Mobile clients pin to these codes — bumping or renaming one is a breaking
change.
