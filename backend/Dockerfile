# ─────────────────────────────────────────────────────────────────────────────
# API do ZELO — Node.js + TypeScript + Prisma
#
# A imagem final carrega TODAS as dependências (inclusive as de desenvolvimento).
# É deliberado: `prisma migrate deploy` precisa do CLI do Prisma e o seed é
# TypeScript executado por `tsx` — ambos são devDependencies. Podar isso
# economizaria ~150 MB e quebraria justamente o que faz o contêiner subir com o
# banco já populado, que é o objetivo aqui.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS deps

# O Prisma precisa do OpenSSL para escolher o engine binário certo.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# `prisma generate` antes do código-fonte: o cliente só depende do schema, então
# mexer em src/ não invalida esta camada.
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
    PORT=4000

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist         ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma                         ./prisma
COPY --chown=node:node docker-entrypoint.sh           ./docker-entrypoint.sh

# As suítes de teste viajam junto: `docker compose exec backend npm test` é o
# jeito mais direto de conferir o projeto sem instalar Node na máquina. Elas
# importam de `src/`, e não de `dist/`, então o código-fonte também entra — são
# ~300 KB, e sem ele os comandos de teste documentados não rodariam.
COPY --chown=node:node tsconfig.json jest.config.js   ./
COPY --chown=node:node src                            ./src
COPY --chown=node:node tests                          ./tests

RUN chmod +x ./docker-entrypoint.sh

USER node
EXPOSE 4000

# `node -e` em vez de curl: evita instalar um pacote só para o healthcheck.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
