<div align="center">

# ZELO Marketplace

**Mobile-first marketplace for local services — verified providers, smart pricing, 24/7 emergency mode.**

![status](https://img.shields.io/badge/status-active-success)
![license](https://img.shields.io/badge/license-MIT-blue)
![backend](https://img.shields.io/badge/backend-Node.js%20%2B%20TypeScript%20%2B%20Prisma-3178c6)
![mobile](https://img.shields.io/badge/mobile-React%20Native%20%2B%20Expo-61dafb)
![database](https://img.shields.io/badge/database-PostgreSQL-336791)

</div>

---

## Overview

ZELO connects clients with verified professionals (plumbers, electricians,
cleaners, etc.) through a transparent, opinionated workflow:

- 🛠️ Browse and filter providers by category, city, rating, or price.
- 🧮 Get a guided **Smart Budget** estimate before requesting a quote.
- 🚨 Trigger **Emergency Mode** to be matched with the highest-rated nearby
  verified professional in seconds.
- 💬 Chat 1:1 inside an active booking.
- 💳 Settle the job via PIX or card (mock gateway included).
- ⭐ Review the professional after completion and feed the trust score.

The project is delivered as a **TypeScript monorepo** with a clear separation
between the API and the mobile client.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│                       Mobile (Expo / RN)                         │
│  AuthContext · ThemeContext · Stack + Tab navigators · 17 screens│
│        Axios client with refresh-token interceptor               │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTPS  (Bearer JWT)
┌──────────────────────────▼───────────────────────────────────────┐
│                    Backend API (Express)                         │
│  routes → controllers → services → Prisma → PostgreSQL           │
│  middleware: helmet · cors · hpp · rate-limit · zod · auth       │
└──────────────────────────────────────────────────────────────────┘
```

| Layer    | Technologies                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Mobile   | React Native 0.81, Expo 54, React Navigation v7, Axios, Lucide, `expo-secure-store`, `react-native-web` |
| Backend  | Node.js 20+, Express 4, TypeScript 5, Prisma 5, Zod, Pino                                               |
| Database | PostgreSQL 14+                                                                                          |
| Security | bcryptjs, JWT (access + rotating refresh), Helmet, CORS allow-list, `express-rate-limit`, `hpp`         |
| Testing  | Jest + Supertest (unit + integration projects)                                                          |

See **[`docs/SETUP.md`](./docs/SETUP.md)** for the full setup walkthrough and
**[`docs/SECURITY.md`](./docs/SECURITY.md)** for the security checklist.

---

## Repository layout

```
ZELO_PI/
├── backend/                # Node.js + TypeScript + Prisma API
│   ├── prisma/             # schema, migrations, seed
│   ├── src/
│   │   ├── config/         # env loader (Zod) + Prisma client
│   │   ├── constants/      # central place for magic numbers / strings
│   │   ├── errors/         # AppError + typed subclasses
│   │   ├── middleware/     # auth, rate-limit, validate, error handler
│   │   ├── selectors/      # reusable Prisma select objects
│   │   ├── utils/          # asyncHandler, password, tokens, logger
│   │   ├── validators/     # Zod request schemas
│   │   ├── services/       # business rules — framework-agnostic
│   │   ├── controllers/    # thin HTTP adapters (req → service → res)
│   │   └── routes/         # Express routers
│   └── tests/
│       ├── unit/           # pure logic, no DB
│       └── integration/    # full HTTP + PostgreSQL
│
├── mobile/                 # React Native (Expo) app
│   └── src/
│       ├── api/            # one Axios module per resource
│       ├── components/     # presentational atoms (Button, Input, ...)
│       ├── constants/      # storage keys, API config
│       ├── contexts/       # AuthContext, ThemeContext
│       ├── hooks/          # reusable hooks (useAsync, ...)
│       ├── navigation/     # tab + stack navigators
│       ├── screens/        # 17 screens
│       ├── theme/          # light/dark palettes + tokens
│       ├── types/          # shared TS types
│       └── utils/          # storage abstraction
│
├── docs/
│   ├── SETUP.md            # detailed install + run guide
│   └── SECURITY.md         # backend security checklist
│
├── .github/                # PR + issue templates
├── CONTRIBUTING.md         # branching, commits, review workflow
├── CODE_OF_CONDUCT.md
├── SECURITY.md             # vulnerability reporting policy
├── LICENSE                 # MIT
└── README.md
```

---

## Quickstart

> Requires Node.js 20+ (`.nvmrc`) and PostgreSQL 14+.

```bash
# 1. Backend
cd backend
cp .env.example .env                # fill DATABASE_URL + JWT secrets
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev                         # http://localhost:4000

# 2. Mobile (in another terminal)
cd ../mobile
npm install
npm run web                         # or: npm run android | npm run ios
```

Default seed credentials and full installation details live in
[`docs/SETUP.md`](./docs/SETUP.md).

---

## Continuous integration & deployment

| Pipeline                                                                          | Trigger                              | Target                  |
| --------------------------------------------------------------------------------- | ------------------------------------ | ----------------------- |
| [`ci.yml`](./.github/workflows/ci.yml)                                            | push / PR to `develop` and `main`    | Typecheck + unit tests  |
| [`sonarcloud.yml`](./.github/workflows/sonarcloud.yml)                            | push / PR to `develop` and `main`    | Code-quality analysis   |
| [`deploy-backend.yml`](./.github/workflows/deploy-backend.yml)                    | push to `develop` (paths: `backend/**`) | Render web service   |
| [`deploy-frontend.yml`](./.github/workflows/deploy-frontend.yml)                  | push to `develop` (paths: `mobile/**`)  | Vercel static deploy |

Full setup walkthrough (secrets, blueprint, project-link instructions) lives
in [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

Branch protection enforces 1+ approving review, dismissal of stale reviews,
linear history, and blocks force-pushes / deletions on both `develop` and
`main`. The full rule set and promotion flow are documented in
[`docs/BRANCHING.md`](./docs/BRANCHING.md).

---

## Implemented screens (17)

**From the original design (7)**

1. Home / Marketplace — search, Smart Budget banner, SOS button, 8 categories,
   trending providers, nearby providers.
2. Provider list — filters + sorting.
3. Provider profile — KYC, stats, prices, portfolio, reviews, sticky CTA.
4. Smart Budget — multi-step flow with final estimate.
5. Emergency — pulsing SOS button + matching state with ETA.
6. Provider dashboard — weekly earnings (chart), stats, agenda.
7. Conversations / chat.

**Extras (functional)**

- Welcome / Login / Register — full flow with real-time password validation.
- Booking detail — accept, start, complete, cancel.
- 1:1 chat — with polling.
- Notifications — list, mark as read.
- Payment — PIX / card (mock confirmation).
- Settings — notifications, privacy, 2FA, **light/dark mode toggle**.

The theme preference is persisted on device (SecureStore on native,
AsyncStorage on web) and defaults to the system theme.

---

## API surface

| Method  | Path                      | Auth   | Description                              |
| ------- | ------------------------- | ------ | ---------------------------------------- |
| `POST`  | `/auth/register`          | public | Create a CLIENT or PROVIDER account      |
| `POST`  | `/auth/login`             | public | Returns access + refresh tokens          |
| `POST`  | `/auth/refresh`           | public | Rotates the refresh token                |
| `POST`  | `/auth/logout`            | public | Revokes refresh token                    |
| `GET`   | `/auth/me`                | bearer | Profile of the logged-in user            |
| `GET`   | `/providers`              | public | List providers (filters + pagination)    |
| `GET`   | `/providers/categories`   | public | List categories                          |
| `GET`   | `/providers/:id`          | public | Full profile                             |
| `POST`  | `/bookings`               | client | Create a booking                         |
| `GET`   | `/bookings/mine`          | bearer | User's own bookings                      |
| `PATCH` | `/bookings/:id/status`    | bearer | Status transition (RBAC by role)         |
| `POST`  | `/reviews`                | client | Review a completed booking               |
| `GET`   | `/reviews/provider/:id`   | public | Reviews of a provider                    |
| `GET`   | `/messages`               | bearer | Grouped conversations                    |
| `GET`   | `/messages/:userId`       | bearer | Thread + mark as read                    |
| `POST`  | `/messages`               | bearer | Send a message                           |
| `POST`  | `/budget/estimate`        | opt.   | Estimate a price for a category          |
| `GET`   | `/notifications`          | bearer | User notifications                       |
| `POST`  | `/notifications/read-all` | bearer | Mark all as read                         |
| `POST`  | `/emergency/match`        | client | Match a verified provider for an SOS     |
| `POST`  | `/payments`               | client | Create a payment for a booking           |

Errors follow a consistent envelope:

```json
{ "error": { "code": "BAD_REQUEST", "message": "PT-BR message", "details": {} } }
```

Codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`TOO_MANY_REQUESTS`, `VALIDATION_ERROR`, `INTERNAL_ERROR`.

---

## Roadmap

- Real geolocation (PostGIS + `earth_distance`) for "Near you".
- WebSocket / SSE for chat and notifications.
- Real payment gateway (PIX, Stripe, Mercado Pago).
- Object storage (S3, R2) for portfolio and KYC uploads.
- KYC workflow with identity verification (Stripe Identity, Idwall).
- E2E mobile tests (Maestro or Detox).

---

## Contributing

Pull requests are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for the branching strategy, Conventional Commits rules and review checklist
before opening a PR.

Security vulnerabilities? See [`SECURITY.md`](./SECURITY.md) — please do not
file public issues for sensitive reports.

---

## License

Released under the [MIT License](./LICENSE).
