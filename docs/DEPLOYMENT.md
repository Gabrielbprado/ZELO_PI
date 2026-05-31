# Deployment

ZELO ships two surfaces: a **Node.js API** on [Render](https://render.com) and
a **React Native web build** on [Vercel](https://vercel.com). Both pipelines
auto-deploy whenever something lands on `develop`, and both target the
free tier so this works for a school / personal project.

> Code quality is enforced separately by the **SonarCloud** workflow on every
> push and pull request — see [`.github/workflows/sonarcloud.yml`](../.github/workflows/sonarcloud.yml).

---

## Architecture

```
develop branch
   │
   ├── path: backend/**        ──▶  GitHub Actions ──▶ Render deploy hook ──▶ zelo-api
   │                                                            │
   │                                                            └── PostgreSQL (Render free)
   │
   └── path: mobile/**         ──▶  GitHub Actions ──▶ Vercel CLI ──▶ Static web build
```

`develop` is the active environment. `main` stays untouched until a release
PR promotes the integrated work — handy for tagging stable demos.

---

## 1. Backend — Render

### 1.1. First-time setup

1. Create a Render account and connect it to GitHub.
2. In the Render dashboard, choose **New → Blueprint** and pick this repo.
   Render will discover [`render.yaml`](../render.yaml) at the root.
3. Render provisions:
   - A free **Web Service** named `zelo-api` from `backend/`.
   - A free **PostgreSQL** named `zelo-postgres` (90-day lifetime on the
     free plan — recreate when it expires).
4. Fill in the secret env vars in the service's **Environment** tab:
   - `JWT_ACCESS_SECRET` — ≥ 32 random chars (`openssl rand -hex 48`).
   - `JWT_REFRESH_SECRET` — ≥ 32 random chars, **different** from the access secret.
   - `CORS_ORIGINS` — comma-separated list including your Vercel URLs
     (e.g. `https://zelo.vercel.app,https://zelo-pr-*.vercel.app`).
5. Open the service → **Settings → Deploy Hook** and copy the URL.
6. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret** and add `RENDER_DEPLOY_HOOK_URL` with the URL from step 5.

The GitHub workflow [`deploy-backend.yml`](../.github/workflows/deploy-backend.yml)
then POSTs to that hook on every `develop` push that touches `backend/**`
or the blueprint, triggering an instant redeploy.

### 1.2. What runs on each deploy

```
buildCommand:  npm ci && npx prisma generate && npm run build
startCommand:  npx prisma migrate deploy && node dist/server.js
healthCheck:   /api/v1/health
```

The Prisma migrate step is idempotent — already-applied migrations are
skipped. New migrations are applied before the new code accepts traffic.

### 1.3. PostGIS extension (geolocation)

Real distance matching (`/providers?sort=distance&lat=…&lng=…` and
`POST /emergency/match`) relies on the **PostGIS** extension. The
`postgis_location` migration runs `CREATE EXTENSION IF NOT EXISTS postgis`
as its first statement, so on a fresh database it is enabled automatically
during `prisma migrate deploy`.

- **Render Postgres** ships PostGIS pre-installed and the migration user has
  rights to `CREATE EXTENSION`, so no manual step is required on the free plan.
  If you ever see `permission denied to create extension "postgis"`, run the
  statement once from the Render database shell as the owner role, then redeploy.
- **Local / Docker**: use a PostGIS-enabled image such as
  `postgis/postgis:16-3.4` rather than the vanilla `postgres` image.

There is **no new secret** for this feature. Two optional request parameters
tune it at call time (no env needed):

| Parameter  | Where                              | Default | Notes                                  |
| ---------- | ---------------------------------- | ------- | -------------------------------------- |
| `radiusKm` | `/providers`, `/emergency/match`   | none    | Max distance; capped at 500 km.        |
| `lat/lng`  | `/providers`, `/emergency/match`   | none    | When omitted, falls back to rating/city. |

### 1.4. Local check before pushing

```bash
cd backend
npm run lint            # tsc --noEmit
npm run test:unit
npm run build           # exercises the same build Render runs
```

---

## 2. Frontend — Vercel

### 2.1. Required secrets

GitHub Actions deploys via the Vercel CLI. Add these three secrets in
**Settings → Secrets and variables → Actions**:

| Secret              | Where to find it                                                              |
| ------------------- | ----------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | Vercel dashboard → **Settings → Tokens** → *Create*. Scope to the team/personal account that owns the project. |
| `VERCEL_ORG_ID`     | Run `vercel link` in `mobile/` once; copy `orgId` from `.vercel/project.json`. |
| `VERCEL_PROJECT_ID` | Same file, `projectId` field.                                                  |

> `.vercel/project.json` is local-only — it's covered by the default
> `.vercelignore` and intentionally not committed.

### 2.2. Vercel project config

[`mobile/vercel.json`](../mobile/vercel.json) tells Vercel how to build the
Expo web bundle:

```jsonc
{
  "buildCommand": "npx expo export --platform web --output-dir dist",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

The SPA rewrite makes React Navigation's web URLs work on hard-refresh.

### 2.3. Deploy workflow

[`deploy-frontend.yml`](../.github/workflows/deploy-frontend.yml) runs the
Vercel CLI three-step on every `develop` push that touches `mobile/**`:

```bash
vercel pull --environment=production --token=$VERCEL_TOKEN
vercel build --prod --token=$VERCEL_TOKEN
vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

### 2.4. Pointing the app at the API

Set `expoConfig.extra.apiBaseUrl` (or the `APP_API_BASE_URL` env var in
your Vercel project) to your Render service's public URL, e.g.
`https://zelo-api.onrender.com/api/v1`. Without it the client falls back
to `http://localhost:4000` and the web build can't reach a real backend.

---

## 3. SonarCloud

1. Sign in at <https://sonarcloud.io> with GitHub and import this repo.
2. Pick **GitHub Actions** as the analysis method when prompted.
3. Copy the generated token and store it as the GitHub secret `SONAR_TOKEN`.
4. Update `sonar.organization` and `sonar.projectKey` in
   [`sonar-project.properties`](../sonar-project.properties) if your
   org/key differs from the defaults baked into the file.

The [`sonarcloud.yml`](../.github/workflows/sonarcloud.yml) workflow then
runs on every push/PR and posts findings as PR comments.

---

## 4. Promotion: `develop` → `main`

When `develop` is stable enough to mark a milestone, open a PR
`develop → main`. The same protection rules apply (1+ review, linear
history, conversation resolution). The production environments stay
pointed at `develop` — `main` is purely a release tag holder.

---

## 5. Rolling back

| Surface  | How                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Backend  | Render dashboard → **Deploys** → pick a previous green deploy → **Roll Back**.                          |
| Frontend | Vercel dashboard → **Deployments** → pick a previous deploy → **Promote to Production**.                |
| Database | Render Postgres has daily backups on paid plans. On free, `pg_dump` regularly into version control.     |
