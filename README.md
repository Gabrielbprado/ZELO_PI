<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo/zelo-wordmark-cream.png">
  <img src="docs/brand/logo/zelo-wordmark-ink.png" alt="zelo" width="220">
</picture>

**Marketplace mobile de serviços locais — profissionais verificados, orçamento guiado, modo emergência e recomendação personalizada.**

![status](https://img.shields.io/badge/status-ativo-success)
![licença](https://img.shields.io/badge/licença-MIT-blue)
![backend](https://img.shields.io/badge/backend-Node.js%20%2B%20TypeScript%20%2B%20Prisma-3178c6)
![mobile](https://img.shields.io/badge/mobile-React%20Native%20%2B%20Expo-61dafb)
![ml](https://img.shields.io/badge/ml-Python%20%2B%20FastAPI-3776ab)
![banco](https://img.shields.io/badge/banco-PostgreSQL%20%2B%20PostGIS-336791)

</div>

---

## Sumário

- [O que é](#o-que-é)
- [Telas](#telas)
- [Arquitetura](#arquitetura)
- [Rodar com Docker](#rodar-com-docker) ← **caminho mais curto**
- [Rodar sem Docker](#rodar-sem-docker)
- [Cache e resiliência (Redis)](#cache-e-resiliência-redis)
- [Testes](#testes)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Estrutura do repositório](#estrutura-do-repositório)
- [API](#api)
- [CI/CD e deploy](#cicd-e-deploy)
- [Documentação](#documentação)

---

## O que é

O ZELO conecta clientes a profissionais verificados (encanador, eletricista,
diarista, pintor…) com um fluxo transparente de ponta a ponta:

- 🛠️ **Buscar e filtrar** profissionais por categoria, cidade, avaliação ou preço.
- ✨ **Para você** — carrossel personalizado, servido por um modelo de
  recomendação treinado no histórico de contratações (com degradação segura:
  sem o serviço de ML no ar, o app cai na ordenação por avaliação).
- 🧮 **Orçamento inteligente** — estimativa guiada antes de pedir a proposta.
- 🚨 **Modo emergência** — casa você com o profissional verificado mais bem
  avaliado *de fato* mais próximo, usando distância real (PostGIS).
- 💬 **Chat 1:1** em tempo real (WebSocket) dentro de um agendamento.
- 🔔 **Notificações push** (Expo) para eventos do agendamento.
- 💳 **Pagamento** via PIX ou cartão (gateway simulado).
- ⭐ **Avaliação** ao final, alimentando a nota de confiança do profissional.

Entregue como um **monorepo** com três aplicações independentes: API em
TypeScript, app React Native e serviço de recomendação em Python.

---

## Telas

30 capturas do app rodando de verdade estão em
[`docs/screenshots/`](./docs/screenshots/README.md). Uma amostra:

| Início | Perfil do profissional | Orçamento inteligente |
|---|---|---|
| <img src="docs/screenshots/06-home.png" width="230"> | <img src="docs/screenshots/09-provider-profile.png" width="230"> | <img src="docs/screenshots/16-smart-budget-resultado.png" width="230"> |

| Emergência | Conversa | Painel do prestador |
|---|---|---|
| <img src="docs/screenshots/18-emergency-match.png" width="230"> | <img src="docs/screenshots/20-chat.png" width="230"> | <img src="docs/screenshots/27-provider-dashboard.png" width="230"> |

---

## Arquitetura

Plataforma distribuída: API + gateway, um **microserviço** de notificações extraído
(schema-per-service), **RabbitMQ** como barramento de eventos com **outbox transacional**,
**Redis** para cache/rate limit/breaker, o serviço de **ML**, e observabilidade
(Prometheus + Grafana). Diagramas Mermaid (contexto C4, sequência de `payment.confirmed`,
topologia AMQP) e o detalhamento em **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```
        📱 Mobile (Expo/RN)
          │ HTTPS (JWT) · WebSocket
┌─────────▼───────────────────────────────────────────────┐
│  Backend — Node/Express                                  │
│  API · gateway · WebSocket · domínio · outbox · relay    │
└──┬────────┬──────────────┬───────────────┬───────────────┘
   │ cache  │ AMQP publish  │ HTTP /rank    │ HTTP /internal
┌──▼───┐  ┌─▼──────────┐    │            ┌──▼───────────────┐
│Redis │  │ RabbitMQ   │    │            │ Notificações     │
│(opc.)│  │ zelo.events│──notifications.q─▶ (Node · inbox ·  │
└──────┘  └─┬──────────┘    │            │  push · schema   │
            │ analytics.q   │            │  notifications)  │
        ┌───▼──────────┐ ┌──▼─────────┐  └──────┬───────────┘
        │ consumidor   │ │ ML         │         │
        │ analytics    │ │ (FastAPI)  │         │
        └──────────────┘ └────────────┘         │
   ┌──────────────────────────────────────────────────────┐
   │  PostgreSQL + PostGIS                                 │
   │  schema public (backend)  ·  schema notifications     │
   └──────────────────────────────────────────────────────┘
   observabilidade: Prometheus + Grafana (profile obs)
```

Tudo o que é infra é **degradável**: Redis, RabbitMQ, ML e o serviço de notificações fora
do ar viram degradações nomeadas (cache passthrough, outbox represado, ranking por nota,
inbox vazio), nunca uma queda. Decisões formalizadas em **[docs/adr/](docs/adr/README.md)**.

| Camada | Tecnologias |
|---|---|
| Mobile | React Native 0.81, Expo 54, React Navigation v7, Axios, socket.io-client, Lucide, `expo-secure-store`, `expo-notifications` |
| Backend | Node.js 20+, Express 4, TypeScript 5, Prisma 5, Zod, Pino, Socket.IO 4 |
| Notificações | Node 20, Express, Prisma (schema `notifications`), amqplib — consome eventos, persiste o inbox, envia push |
| ML | Python 3.12, FastAPI, scikit-learn, NumPy, SciPy (sem pandas em produção) |
| Banco | PostgreSQL 16 **com PostGIS** — schemas `public` e `notifications` |
| Cache | Redis 7 — **opcional**: cache de leitura, rate limit entre instâncias e estado do circuit breaker |
| Mensageria | RabbitMQ 3 — **opcional**: barramento `zelo.events` (topic), outbox transacional, DLQ + retry |
| Observabilidade | `prom-client` (Node) + `prometheus-fastapi-instrumentator` (Python), Prometheus + Grafana (profile `obs`), correlation id ponta a ponta |
| Segurança | bcryptjs, JWT (access + refresh rotativo), Helmet, allow-list de CORS, `express-rate-limit`, `hpp`, tokens de serviço (`X-ML-Token`, `X-SERVICE-TOKEN`) |
| Testes | Jest + Supertest (backend + serviço, unit + integração com broker real), pytest (ML) |

---

## Rodar com Docker (recomendado)

Um único comando sobe **tudo**: PostgreSQL + PostGIS (com os schemas `public` e
`notifications`), Redis, RabbitMQ, o microserviço de notificações, a API já **migrada e
populada com o seed**, e o app web servido pela própria API. Só é preciso ter o Docker
instalado.

### 1. Instale o Docker

- **Windows** → [Docker Desktop](https://www.docker.com/products/docker-desktop/) (inclui o
  Docker Compose). Abra o Docker Desktop e espere ficar "Running".
- **Linux** → Docker Engine + plugin Compose:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER   # e reabra o terminal
  ```

### 2. Baixe o projeto e suba

O comando é **o mesmo nos dois sistemas**. Abra o terminal (no Windows, PowerShell ou o
terminal do Docker Desktop) na pasta do projeto:

```bash
git clone https://github.com/Gabrielbprado/ZELO_PI.git
cd ZELO_PI
docker compose up --build
```

Na primeira vez leva alguns minutos (baixa as imagens e compila). Quando aparecer
`ZERO API rodando`, abra:

**<http://localhost:4000>** — e entre com **`marina@zero.dev`** / **`Senha@123`** (cliente).
Para ver o **painel administrativo** (GMV, funil), entre como **`admin@zelo.dev`** / **`Senha@123`**.

Para parar: `Ctrl+C`. Para subir em segundo plano: `docker compose up --build -d`; para
derrubar tudo: `docker compose down` (ou `docker compose down -v` para apagar também o
banco e recomeçar do zero).

### O que fica disponível

| Serviço | Endereço |
|---|---|
| App web + API | <http://localhost:4000> |
| Health check | <http://localhost:4000/api/v1/health/ready> |
| Métricas (Prometheus) | <http://localhost:4000/metrics> |
| Filas (Bull Board) | <http://localhost:4000/admin/queues> — Basic auth `admin` / `zelo-admin` |
| RabbitMQ (UI das filas) | <http://localhost:15672> — `guest` / `guest` |
| PostgreSQL | `localhost:55432` — `postgres` / `postgres` |
| Redis | `localhost:56379` |

### Extras opcionais

```bash
# Recomendação por ML (sobe o ranker em :8001) + treino do modelo
docker compose --profile ml up --build
docker compose exec backend npm run prisma:seed:ml -- --verify
docker compose --profile train run --rm ml-train

# Observabilidade: Prometheus (:9090) + Grafana (:3000, painel já provisionado)
docker compose --profile obs up
```

Comandos do dia a dia, controle do seed (`SEED_ON_START`), testes dentro do
contêiner e solução de problemas: **[`docs/DOCKER.md`](./docs/DOCKER.md)**.

> As imagens copiam o código na build, sem recarga automática. Para desenvolver com
> hot-reload, use a instalação nativa abaixo.

---

## Rodar sem Docker

### Pré-requisitos

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | 20 LTS ou 22 (veja `.nvmrc`) | obrigatório |
| PostgreSQL | 14, 15 ou 16 **com PostGIS** | obrigatório |
| Python | **3.12** (3.11 serve) | só para o serviço de ML — opcional |
| Expo Go | última | só para rodar em celular físico |

> **Python 3.13/3.14 não.** As wheels de `scipy`/`scikit-learn` demoram a sair
> para versões muito novas e o `pip` cai num build a partir do código-fonte que
> costuma falhar.

### 1. Banco de dados (PostgreSQL + PostGIS)

O casamento por proximidade e a âncora geográfica do recomendador usam
**PostGIS** — o Postgres puro não serve, a migração `postgis_location` roda
`CREATE EXTENSION postgis`.

**Com Docker (caminho mais curto):**

```bash
docker run -d --name zelo-postgis -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=zero_marketplace \
  postgis/postgis:16-3.4

# banco de testes de integração
docker exec zelo-postgis psql -U postgres -c "CREATE DATABASE zero_marketplace_test;"
```

**Instalação nativa:** instale o pacote PostGIS da sua distribuição
(`postgresql-16-postgis-3` no Debian/Ubuntu, `brew install postgis` no macOS,
*Stack Builder* no Windows) e crie os dois bancos. O passo a passo por sistema
operacional está em [`docs/SETUP.md`](./docs/SETUP.md#2-postgresql-sem-docker).

### 2. Backend (API)

```bash
cd backend
cp .env.example .env
```

Preencha no `.env`:

```bash
# gere DOIS segredos diferentes, de 32+ caracteres cada
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

```ini
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zero_marketplace?schema=public"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zero_marketplace_test?schema=public"
JWT_ACCESS_SECRET="<primeiro segredo>"
JWT_REFRESH_SECRET="<segundo segredo>"
```

```bash
npm install
npm run prisma:generate
npm run prisma:migrate     # cria tabelas + habilita PostGIS
npm run prisma:seed        # categorias e profissionais de exemplo
npm run dev                # http://localhost:4000
```

Verifique: `curl http://localhost:4000/api/v1/health` → `{"status":"ok",...}`.

**Contas criadas pelo seed** (senha `Senha@123` para todas):
`marina@zero.dev` (cliente) · `carlos@zero.dev`, `ana@zero.dev`,
`roberto@zero.dev`, `julia@zero.dev`, `pedro@zero.dev`, `lucia@zero.dev`
(prestadores). São contas de desenvolvimento — não suba isso para produção.

### 3. App mobile

```bash
cd mobile
npm install
npm run web        # navegador — http://localhost:8081
# ou: npm run android | npm run ios | npm start
```

Sem configuração extra o app descobre a API sozinho: `localhost:4000` no
navegador e no simulador iOS, `10.0.2.2:4000` no emulador Android.

**Celular físico:** rode `npm run start:lan`, leia o QR-code no Expo Go e aponte
o app para o IP da sua máquina na LAN — `EXPO_PUBLIC_API_BASE_URL` no ambiente
ou `expo.extra.apiBaseUrl` no `app.json`:

```bash
EXPO_PUBLIC_API_BASE_URL="http://192.168.0.123:4000/api/v1" npm run start:lan
```

### 4. Serviço de ML (opcional)

**Pode pular.** Sem ele o carrossel "Para você" continua funcionando: a resposta
volta com `strategy: "fallback"` e a lista ordenada por avaliação. Para ligar:

```bash
cd ml
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pip install -e .
```

O seed padrão tem 6 profissionais e nenhum agendamento — não há o que treinar.
Use o seed sintético (**destrutivo: apaga os dados do banco apontado por
`DATABASE_URL`**):

```bash
cd backend && npm run prisma:seed:ml -- --verify   # ~200 clientes, 60 pros, ~3000 bookings
```

```bash
cd ml
ML_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zero_marketplace" \
  .venv/bin/python -m zelo_ml.training.train --activate
```

O relatório de avaliação sai em `ml/reports/eval-<versão>.md`. Se o modelo não
superar a ordenação atual do app por uma margem mínima, o artefato é gravado
como **inativo** — um modelo pior nunca chega ao usuário em silêncio.

### Rodando tudo (3 terminais)

```bash
cd backend && npm run dev                                             # :4000
cd ml && .venv/bin/uvicorn zelo_ml.api.main:app --reload --port 8001  # :8001
cd mobile && npm start                                                # :8081
```

`curl localhost:8001/health` deve mostrar `"strategy": "ranker"` depois do
treino (e `"heuristic_fallback"` antes dele).

> Problemas para subir? A seção de
> [troubleshooting do `docs/SETUP.md`](./docs/SETUP.md#8-troubleshooting) cobre
> os erros mais comuns (segredo curto demais, Postgres fora do ar, CORS no web,
> celular sem alcançar a LAN, `pip` compilando scipy).

---

## Cache e resiliência (Redis)

O Redis entra como **dependência opcional** e cobre três papéis:

| Papel | O que resolve |
|---|---|
| Cache de leitura | Categorias, detalhe do profissional, listagens e avaliações. A listagem sai de ~16 ms para ~2 ms. |
| Rate limit distribuído | Com o store em memória, duas instâncias contam janelas separadas e o limite efetivo **dobra** — um furo no `authLimiter`, que existe para conter força bruta. |
| Circuit breaker do ML | O estado era por processo, então cada instância pagava o timeout do serviço de ML por conta própria antes de proteger o próprio tráfego. |

**Opcional é para valer.** Com `REDIS_ENABLED=false`, ou com o Redis fora do ar, a API
funciona igual — mais lenta nas listagens e com o limite contado por processo. Isso é
verificado por teste, e dá para conferir à mão:

```bash
docker compose stop redis
curl -s localhost:4000/api/v1/providers -o /dev/null -w '%{http_code} em %{time_total}s\n'
curl -s localhost:4000/api/v1/health/ready   # → "degraded", com HTTP 200
docker compose start redis                   # volta a cachear sozinho, sem reiniciar a API
```

Três decisões que sustentam isso:

- `enableOfflineQueue: false` no cliente de cache. Com o padrão (`true`), o ioredis
  enfileira comandos em memória enquanto está desconectado e cada requisição fica
  pendurada até o timeout — trocaria "sem cache" por "API travada".
- `passOnStoreError: true` nos limitadores. Um contador indisponível libera a
  requisição em vez de devolver 500: rejeitar todo o tráfego porque o Redis caiu seria
  um apagão auto-infligido.
- O store do rate limit é construído **sob demanda**. O `rate-limit-redis` dispara
  `SCRIPT LOAD` dentro do construtor, no import do módulo, sem aguardar a promessa — com
  o Redis fora, essa rejeição derrubava o processo em loop de restart.

Health checks: `/api/v1/health` é liveness e não toca em dependência alguma (é o que o
Render e o Docker consultam); `/api/v1/health/ready` consulta tudo e só devolve 503
quando o **Postgres** cai — Redis ou ML fora produzem `degraded` com HTTP 200, porque o
sistema de fato continua servindo.

---

## Testes

```bash
# Backend — unitários (não precisam de banco)
cd backend && npm run test:unit

# Backend — integração (precisa do banco de testes migrado)
cd backend
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
npm run test:integration

# Backend — tudo
npm test

# Mobile — typecheck
cd mobile && npm run typecheck

# ML — lint, tipos e testes
cd ml
.venv/bin/ruff check . && .venv/bin/mypy src && .venv/bin/pytest -q
```

> Os testes de integração truncam todas as tabelas entre as suítes — **não rode
> contra um banco com dados que você queira preservar**.

---

## Variáveis de ambiente

O `backend/.env.example` é a referência completa. As essenciais:

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DATABASE_URL` | sim | — | Postgres de desenvolvimento |
| `TEST_DATABASE_URL` | testes | — | Postgres de testes de integração |
| `JWT_ACCESS_SECRET` | sim | — | ≥ 32 caracteres |
| `JWT_REFRESH_SECRET` | sim | — | ≥ 32 caracteres, diferente do anterior |
| `PORT` | não | `4000` | porta HTTP |
| `CORS_ORIGINS` | não | `http://localhost:8081` | allow-list separada por vírgula |
| `WEB_DIST_DIR` | não | — | serve o bundle web do Expo pela própria API |
| `PUSH_ENABLED` | não | `true` | notificações push via Expo |
| `ML_ENABLED` | não | `true` | `false` desliga a chamada ao serviço de ML |
| `ML_SERVICE_URL` | não | — | ex.: `http://localhost:8001` |
| `ML_SERVICE_TOKEN` | condicional | — | obrigatório quando `ML_SERVICE_URL` está definida |
| `ML_TIMEOUT_MS` | não | `700` | acima disso, degrada para ordenação por nota |
| `REDIS_ENABLED` | não | `false` | `true` liga cache, rate limit distribuído e breaker compartilhado |
| `REDIS_URL` | condicional | — | obrigatória quando `REDIS_ENABLED=true` |
| `REDIS_KEY_PREFIX` | não | `zelo` | isola ambientes que dividem a mesma instância |

Detalhes de rate limit, bcrypt e das variáveis do serviço Python:
[`docs/SETUP.md`](./docs/SETUP.md#6-variáveis-de-ambiente).

---

## Estrutura do repositório

```
ZELO_PI/
├── backend/                # API Node.js + TypeScript + Prisma
│   ├── prisma/             # schema, migrations, seed padrão e seed sintético (ML)
│   ├── src/
│   │   ├── config/         # env (Zod) + cliente Prisma
│   │   ├── constants/      # números e strings mágicos em um lugar só
│   │   ├── errors/         # AppError + subclasses tipadas
│   │   ├── middleware/     # auth, rate-limit, validate, error handler
│   │   ├── realtime/       # socket.io (chat e notificações)
│   │   ├── selectors/      # selects de Prisma reaproveitáveis
│   │   ├── services/       # regras de negócio — sem Express
│   │   ├── controllers/    # adaptadores HTTP finos
│   │   └── routes/         # routers do Express
│   └── tests/              # unit/ (sem banco) e integration/ (HTTP + Postgres)
│
├── mobile/                 # App React Native (Expo)
│   └── src/                # api · components · contexts · hooks · navigation
│                           # screens · theme · types · utils
│
├── ml/                     # Serviço de recomendação (Python)
│   ├── src/zelo_ml/
│   │   ├── api/            # FastAPI: /health, /v1/rank, /v1/model/reload
│   │   ├── data/           # leitura do Postgres
│   │   ├── features/       # engenharia de features (geo, bayes, ...)
│   │   ├── model/          # ranker, colaborativo, fallback, artefato
│   │   └── training/       # treino, baselines e avaliação com gate
│   ├── contracts/          # JSON Schema do contrato Node ↔ Python
│   └── tests/
│
├── docs/                   # SETUP · ML · SECURITY · DEPLOYMENT · BRANCHING
│                           # brand/ (logo, ícones) · screenshots/
├── .github/workflows/      # CI, SonarCloud, deploys, retreino do modelo
└── render.yaml             # blueprint de infraestrutura
```

---

## API

Base: `/api/v1`. Autenticação por `Authorization: Bearer <access token>`.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/auth/register` | público | Cria conta CLIENT ou PROVIDER |
| `POST` | `/auth/login` | público | Retorna access + refresh token |
| `POST` | `/auth/refresh` | público | Rotaciona o refresh token |
| `POST` | `/auth/logout` | público | Revoga o refresh token |
| `GET` | `/auth/me` | bearer | Perfil do usuário logado |
| `PATCH` | `/users/me` | bearer | Atualiza o próprio perfil |
| `POST` | `/users/me/change-password` | bearer | Troca a senha |
| `POST` | `/users/forgot-password` · `/users/reset-password` | público | Recuperação de senha |
| `POST`/`DELETE` | `/users/me/push-token` | bearer | Registra/remove o token de push |
| `GET` | `/providers` | público | Lista profissionais (filtros + paginação) |
| `GET` | `/providers/categories` | público | Lista categorias |
| `GET` | `/providers/:id` | público | Perfil completo |
| `GET`/`PATCH` | `/providers/me` | prestador | Autogestão do perfil |
| `POST`/`PATCH`/`DELETE` | `/providers/me/services[/:id]` | prestador | Serviços e preços |
| `GET` | `/recommendations/for-you` | bearer | Carrossel personalizado (ML, com fallback) |
| `POST` | `/recommendations/events` | bearer | Telemetria de impressão/clique |
| `POST` | `/bookings` | cliente | Cria um agendamento |
| `GET` | `/bookings/mine` · `/bookings/:id` | bearer | Agendamentos do usuário |
| `PATCH` | `/bookings/:id/status` | bearer | Transição de status (RBAC por papel) |
| `POST` | `/reviews` | cliente | Avalia um serviço concluído |
| `GET` | `/reviews/provider/:id` | público | Avaliações de um profissional |
| `GET` | `/messages` · `/messages/:userId` | bearer | Conversas e thread |
| `POST` | `/messages` | bearer | Envia mensagem |
| `POST` | `/budget/estimate` | opcional | Estimativa de preço |
| `GET` | `/notifications` | bearer | Notificações |
| `POST` | `/notifications/read-all` · `/notifications/:id/read` | bearer | Marca como lida |
| `POST` | `/emergency/match` | cliente | Casa um profissional para o SOS |
| `POST` | `/payments` · `/payments/:bookingId/confirm` | cliente | Pagamento do agendamento |
| `GET` | `/health` | público | Health check |

Tempo real: `socket.io` em `/realtime`, autenticado pelo mesmo access token
(`auth.token` no handshake).

Erros seguem sempre o mesmo envelope:

```json
{ "error": { "code": "BAD_REQUEST", "message": "mensagem em pt-BR", "details": {} } }
```

Códigos: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS`, `VALIDATION_ERROR`, `INTERNAL_ERROR`.

---

## CI/CD e deploy

| Pipeline | Gatilho | Alvo |
|---|---|---|
| [`ci.yml`](./.github/workflows/ci.yml) | push / PR em `develop` e `main` | Typecheck + testes unitários e **de integração** (backend), tipos + cores + contraste WCAG (mobile), lint + tipos + testes e contrato (ML) |
| [`sonarcloud.yml`](./.github/workflows/sonarcloud.yml) | push / PR em `develop` e `main` | Análise de qualidade |
| [`deploy-backend.yml`](./.github/workflows/deploy-backend.yml) | push em `develop` (`backend/**`) | Render |
| [`deploy-frontend.yml`](./.github/workflows/deploy-frontend.yml) | push em `develop` (`mobile/**`) | Vercel |
| [`ml-train.yml`](./.github/workflows/ml-train.yml) | segundas 06:00 UTC · manual | Retreino, avaliação com gate e reload do modelo |

Segredos, blueprint e vínculo dos projetos: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/SETUP.md`](./docs/SETUP.md) | Instalação detalhada por sistema operacional, testes, troubleshooting |
| [`docs/DOCKER.md`](./docs/DOCKER.md) | Ambiente completo em contêineres: seed automático, perfis de ML, treino |
| [`docs/ML.md`](./docs/ML.md) | Model card: dados, features, avaliação, limites e riscos do recomendador |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Checklist de segurança do backend |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Deploy em Render e Vercel: secrets, blueprint e vínculo dos projetos |
| [`docs/BRANCHING.md`](./docs/BRANCHING.md) | Estratégia de branches e regras de proteção |
| [`docs/brand/BRAND-KIT.md`](./docs/brand/BRAND-KIT.md) | Logo, paleta, tipografia e ícones |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Commits convencionais, fluxo de review |

---

## Contribuindo

Pull requests são bem-vindos. Leia o [`CONTRIBUTING.md`](./CONTRIBUTING.md)
antes de abrir um: branches saem de `develop`, commits seguem Conventional
Commits e todo PR precisa de ao menos uma aprovação.

Encontrou uma vulnerabilidade? Veja o [`SECURITY.md`](./SECURITY.md) — por
favor, não abra issue pública para relatos sensíveis.

---

## Licença

Distribuído sob a [Licença MIT](./LICENSE).
