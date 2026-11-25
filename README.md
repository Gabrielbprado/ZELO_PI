# ZELO — Marketplace de Serviços

Aplicativo de marketplace para contratação de prestadores de serviço (encanador, eletricista, diarista, etc.) com rastreamento em tempo real, orçamento inteligente e pagamentos via PIX/cartão.

---

## 📁 Estrutura do projeto

| Pasta | O que contém |
|-------|--------------|
| `back/` | API backend (Node.js + TypeScript + Prisma + PostgreSQL) |
| `mobile/` | App mobile (Expo / React Native) |
| `web/` | Frontend web (placeholder — servido pela API quando definido `WEB_DIST_DIR`) |
| `others/` | Código de suporte: ML, serviço de notificações, Docker, scripts, docs |

```
ZELO_PI/
├── back/           # API Node.js
├── mobile/         # App Expo/React Native
├── web/            # Web (placeholder)
├── others/         # ml, services/notifications, docker, scripts, docs
├── .env.example    # Exemplo de variáveis de ambiente
├── .env            # Suas variáveis locais (crie a partir do .env.example)
├── docker-compose.yml
└── render.yaml
```

---

## 🚀 Como rodar (100% funcional)

### Opção 1: Docker Compose (recomendado)

Sobe banco (PostGIS), Redis, RabbitMQ, API, serviço de notificações e build do web.

```bash
# 1. Clone o repositório
git clone https://github.com/Gabrielbprado/ZELO_PI.git
cd ZELO_PI

# 2. Crie o arquivo de ambiente
cp .env.example .env

# 3. Preencha os valores obrigatórios no .env
#    (DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, etc.)

# 4. Suba tudo
docker compose up --build
```

Acesse:
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/v1/health`
- Banco: `localhost:55432`
- Redis: `localhost:56379`
- RabbitMQ UI: `http://localhost:15672` (guest/guest)

---

### Opção 2: Rodar só o backend (local)

```bash
cd back

# Instale dependências
npm ci

# Gere o cliente Prisma
npx prisma generate

# Rode as migrações
npx prisma migrate dev

# Inicie a API (desenvolvimento)
npm run dev
```

A API sobe em `http://localhost:4000`.

---

### Opção 3: Rodar só o mobile

```bash
cd mobile

# Instale dependências
npm ci

# Inicie o Expo
npx expo start
```

Use o app Expo no celular ou emulador.

---

## ⚙️ Configuração do `.env`

Copie `.env.example` para `.env` e preencha, pelo menos:

```env
NODE_ENV=development
PORT=4000

# Banco (obrigatório)
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/zelo_marketplace?schema=public

# JWT (obrigatório — gere com: openssl rand -base64 32)
JWT_ACCESS_SECRET=sua_chave_aqui
JWT_REFRESH_SECRET=sua_chave_aqui

# CORS (origens permitidas)
CORS_ORIGINS=http://localhost:4000,http://localhost:8081,http://localhost:19006

# Redis (opcional — API sobe sem ele, mas com limitações)
REDIS_ENABLED=true
REDIS_URL=redis://localhost:56379

# RabbitMQ (opcional)
RABBITMQ_ENABLED=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Notificações (opcional)
NOTIFICATIONS_ENABLED=true

# ML (opcional — fallback automático se desligado)
ML_ENABLED=true
ML_SERVICE_URL=http://localhost:8001
```

> **Nunca commite o `.env`.** Ele já está ignorado pelo `.gitignore`.

---

## 🧪 Comandos úteis

```bash
# Backend
cd back
npm run dev          # inicia com hot-reload
npm run build        # build de produção
npm start            # inicia build de produção
npm test             # roda os testes
npx prisma studio    # interface visual do banco

# Mobile
cd mobile
npx expo start       # inicia o servidor Expo
npx expo run:android # roda no Android
npx expo run:ios     # roda no iOS

# Docker
docker compose up --build      # sobe tudo
docker compose down            # derruba tudo
docker compose logs -f         # acompanha logs
```

---

## ☁️ Deploy (Render)

O arquivo `render.yaml` já está configurado para deploy no Render:

1. Conecte o repositório no Render (Blueprint).
2. Defina as variáveis secretas no dashboard (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, etc.).
3. O serviço `zelo-api` sobe a partir da pasta `back/`.

---

## 🧭 Principais rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/auth/register` | Cadastro de usuário |
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/providers` | Lista prestadores |
| `POST` | `/api/v1/bookings` | Cria agendamento |
| `GET` | `/api/v1/payments/:id` | Detalhe do pagamento |

---

## 📄 Licença

MIT — veja o arquivo `LICENSE`.
