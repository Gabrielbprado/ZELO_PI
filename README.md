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
- [Rodar o projeto](#rodar-o-projeto) — com ou sem Docker
- [Instalar PostGIS no PostgreSQL já instalado](#instalar-postgis-no-postgresql-já-instalado)
- [Testes](#testes)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Estrutura do repositório](#estrutura-do-repositório)
- [API](#api)
- [CI](#ci)
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

A versão básica usa o frontend Expo, uma API Node.js e PostgreSQL com PostGIS. O serviço de recomendação em Python é opcional; sem ele, a API mantém o ranking padrão.

```text
Frontend web (Expo) ──HTTP/WebSocket──▶ API (Express) ──▶ PostgreSQL + PostGIS
                                               └──────▶ ML opcional (FastAPI)
```

| Parte | Tecnologias |
|---|---|
| Frontend | React Native, Expo, React Navigation |
| Backend | Node.js, Express, TypeScript, Prisma, Socket.IO |
| Banco | PostgreSQL com PostGIS |
| ML opcional | Python, FastAPI, scikit-learn, NumPy, SciPy |

## Rodar o projeto

### Requisitos

| Modo | Requisitos |
|---|---|
| **Com Docker** | Git, Docker Desktop (Windows/macOS) ou Docker Engine + Docker Compose v2 (Linux), com o Docker iniciado. O banco PostGIS, API e frontend são iniciados pelos contêineres. |
| **Sem Docker** | Git, Node.js 20 LTS ou 22, npm 10+, PostgreSQL 14–16 com PostGIS instalado, e acesso ao terminal. O PostgreSQL deve estar iniciado. |

O serviço Python de recomendação é opcional nos dois modos. Para desenvolver o app em um simulador, instale também Android Studio (Android) ou Xcode (iOS, somente macOS). Para abrir no navegador, não precisa instalar esses simuladores.

### Windows: API + frontend sem Docker

Instale o **Node.js 20 LTS ou 22** e o **PostgreSQL com PostGIS** (a extensão é obrigatória pelas migrações). Se já tiver PostgreSQL sem PostGIS, siga o [tutorial visual abaixo](#instalar-postgis-no-postgresql-já-instalado). Depois, abra o PowerShell na pasta do projeto. O `.env.example` usa PostgreSQL local na porta `5432`; ajuste `DATABASE_URL` e `TEST_DATABASE_URL` em `.env` para a senha e os bancos da sua instalação.

Na primeira execução, crie a configuração e instale as dependências:

```powershell
Copy-Item .env.example .env
npm install
npm install --prefix backend
npm install --prefix mobile
```

Crie os bancos `zero_marketplace` e `zero_marketplace_test` no PostgreSQL local. Então, para aplicar migrações, preencher um banco vazio com os dados de demonstração e abrir a API e o frontend:

```powershell
npm start
```

Abra **<http://localhost:8081>** para o frontend. A API fica em **<http://localhost:4000>**. Para parar os processos, pressione `Ctrl+C` no PowerShell; o PostgreSQL continua ligado e preserva os dados. As contas de demonstração usam a senha `Senha@123` (`marina@zero.dev`, cliente; `carlos@zero.dev`, prestador).

`npm start` não inicia nem para containers. Ele usa o PostgreSQL/PostGIS que já estiver instalado e rodando na máquina.

### Com Docker: projeto inteiro em contêineres

Com Docker iniciado, rode na pasta do projeto (PowerShell no Windows ou terminal no macOS/Linux):

```powershell
Copy-Item .env.example .env
docker compose up --build
```

O app web e a API ficam em **<http://localhost:4000>**. O Compose baixa a imagem `postgis/postgis`, compila o frontend, prepara o banco e inicia a API. Não é necessário instalar Node.js ou PostgreSQL/PostGIS na máquina para este modo. O banco fica exposto em `localhost:55432`.

O mesmo fluxo pode ser iniciado por `npm run start:docker` (e encerrado com `npm run stop:docker`). Para apagar também os dados do banco, use `docker compose down -v`.

### Instalar PostGIS no PostgreSQL já instalado

O projeto precisa da extensão **PostGIS** para as migrações e recursos geográficos. Ter o servidor PostgreSQL instalado não significa que o PostGIS também esteja instalado. No Windows, instale uma versão do PostGIS que corresponda à versão principal do seu PostgreSQL (por exemplo, PostgreSQL 16 → instalador PostGIS para PostgreSQL 16).

#### 1. Confira a versão do PostgreSQL

No PowerShell, execute `psql --version` ou abra o **SQL Shell (psql)** e rode `SELECT version();`. Anote o número principal, como `16`.

![Exemplo ilustrado de como identificar a versão do PostgreSQL](docs/postgis/01-versao.svg)

#### 2. Baixe o instalador PostGIS compatível

Abra a [página oficial de instaladores PostGIS para Windows](https://postgis.net/documentation/getting_started/install_windows/released_versions/) e baixe o instalador da mesma versão principal do seu PostgreSQL. Os instaladores dessa página são para PostgreSQL 64-bit distribuído pelo EnterpriseDB. Como alternativa, procure **Stack Builder** no menu Iniciar, selecione sua instalação do PostgreSQL, expanda **Spatial Extensions** e escolha PostGIS.

![Exemplo ilustrado da seleção de um instalador PostGIS compatível](docs/postgis/02-download.svg)

Execute o instalador baixado e siga as etapas. Se o assistente pedir os dados do servidor, use `localhost`, a porta configurada no PostgreSQL (normalmente `5432`), o usuário `postgres` e a senha definida ao instalar o banco. Se não encontrar seu PostgreSQL na lista ou a versão não estiver disponível, use o [tutorial oficial do PostGIS](https://postgis.net/documentation/getting_started/install_windows/) para escolher o pacote correto; não misture instaladores de versões principais diferentes.

#### 3. Habilite e confira a extensão

No pgAdmin, conecte-se ao banco `zero_marketplace`, abra **Tools → Query Tool** e execute:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT PostGIS_Version();
```

Repita no banco `zero_marketplace_test` se for executar os testes de integração. Se preferir o terminal, rode o mesmo SQL com `psql -U postgres -d zero_marketplace -c "CREATE EXTENSION IF NOT EXISTS postgis;"`. Depois disso, siga os passos de instalação sem Docker acima.

![Exemplo ilustrado para habilitar e conferir PostGIS no banco](docs/postgis/03-habilitar.svg)

As imagens são esquemas explicativos da sequência, não capturas reais do instalador. As telas podem variar conforme a versão. No macOS/Linux, consulte os comandos de instalação nativa em [`docs/SETUP.md`](./docs/SETUP.md#2-postgresql-sem-docker); ou use Docker para não instalar PostGIS no sistema.

### ML opcional no Windows

O serviço de recomendação fica desligado por padrão. Altere `ML_ENABLED=true` no arquivo `.env` e inicie o serviço pelo PowerShell:

```powershell
docker compose --profile ml up --build -d ml
```

Reinicie a API para ela carregar a configuração.

Detalhes adicionais: **[docs/DOCKER.md](./docs/DOCKER.md)** e **[docs/SETUP.md](./docs/SETUP.md)**.

---

## Testes

```powershell
# Backend — testes unitários
Set-Location backend
npm run test:unit

# Backend — preparar e executar integração (requer Docker Desktop e .env configurado)
..\node_modules\.bin\dotenv.cmd -e ..\.env -v "DATABASE_URL=postgresql://postgres:postgres@localhost:55432/zero_marketplace_test?schema=public" -- npx prisma migrate deploy
..\node_modules\.bin\dotenv.cmd -e ..\.env -- npm run test:integration

# Backend — todas as suítes
npm test

# Mobile — verificação de tipos
Set-Location ..\mobile
npm run typecheck

# ML — depois de criar o ambiente Python no Windows
Set-Location ..\ml
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\mypy.exe src
.\.venv\Scripts\pytest.exe -q
```

> Os testes de integração truncam todas as tabelas entre as suítes — **não rode
> contra um banco com dados que você queira preservar**.

---

## Variáveis de ambiente

O [`.env.example`](./.env.example) da raiz serve para `npm start` e Docker; o `backend/.env.example` contém opções adicionais da API. As essenciais:

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
| `ML_ENABLED` | não | `false` no exemplo da raiz | `true` ativa a chamada ao serviço opcional de ML |
| `ML_SERVICE_URL` | não | — | ex.: `http://localhost:8001` |
| `ML_SERVICE_TOKEN` | condicional | — | obrigatório quando `ML_SERVICE_URL` está definida |
| `ML_TIMEOUT_MS` | não | `700` | acima disso, degrada para ordenação por nota |

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
├── docs/                   # instruções, referências, marca e capturas de tela
│                           # brand/ (logo, ícones) · screenshots/
├── docker/                 # SQL que cria o banco usado nos testes
├── scripts/                # preparação automática para npm start
├── .github/workflows/      # CI
├── docker-compose.yml      # backend, frontend, banco e ML opcional
├── package.json            # comandos npm start e Docker
└── .env.example            # configuração inicial
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

## CI

| Pipeline | Gatilho | Alvo |
|---|---|---|
| [`ci.yml`](./.github/workflows/ci.yml) | push / PR em `develop` e `main` | Typecheck + testes unitários e **de integração** (backend), tipos + cores + contraste WCAG (mobile), lint + tipos + testes e contrato (ML) |


---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/SETUP.md`](./docs/SETUP.md) | Instalação detalhada por sistema operacional, testes, troubleshooting |
| [`docs/DOCKER.md`](./docs/DOCKER.md) | Execução básica com Docker, seed automático e ML opcional |
| [`docs/ML.md`](./docs/ML.md) | Model card: dados, features, avaliação, limites e riscos do recomendador |
| [`docs/MODERATION.md`](./docs/MODERATION.md) | Denúncias, classificação automática, guarda-corpos do bloqueio pela IA e decisão do admin |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Checklist de segurança do backend |
| [`docs/BRANCHING.md`](./docs/BRANCHING.md) | Estratégia de branches e regras de proteção |
| [`docs/brand/BRAND-KIT.md`](./docs/brand/BRAND-KIT.md) | Logo, paleta, tipografia e ícones |

---

## Licença

Distribuído sob a [Licença MIT](./LICENSE).
