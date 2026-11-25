# ─────────────────────────────────────────────────────────────────────────────
# Microserviço de notificações do ZELO — Node.js + TypeScript + Prisma
# Mesmo padrão multi-stage do backend/Dockerfile.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate


FROM deps AS build

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build


FROM node:20-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4100

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist         ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma                         ./prisma
COPY --chown=node:node docker-entrypoint.sh           ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER node
EXPOSE 4100

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/internal/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
