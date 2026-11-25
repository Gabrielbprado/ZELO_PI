# Rodar o ZELO com Docker

O ambiente básico usa PostgreSQL/PostGIS, compila o app web e inicia a API. A recomendação por ML é opcional.

```bash
docker compose up --build
```

Abra <http://localhost:4000>. Contas de demonstração:

| Papel | E-mail | Senha |
|---|---|---|
| Cliente | `marina@zero.dev` | `Senha@123` |
| Prestador | `carlos@zero.dev` | `Senha@123` |

## Serviços

| Serviço | Papel |
|---|---|
| `db` | PostgreSQL 16 com PostGIS |
| `web` | Compila o app Expo para web e encerra |
| `backend` | API, WebSocket e arquivos web |
| `ml` | Serviço de recomendação, perfil opcional `ml` |
| `ml-train` | Treinamento do modelo, perfil opcional `train` |

O ML pode ser iniciado separadamente com `docker compose --profile ml up --build ml`. Sem ele, a API continua usando o ranking padrão. O perfil `train` contém o job de treinamento.

A primeira inicialização aplica as migrações e popula o banco se ele estiver vazio. `SEED_ON_START` aceita `auto` (padrão), `off` ou `force` (apaga e recria dados; use com cuidado).

## Comandos úteis

```bash
docker compose up -d --build
docker compose logs -f backend
docker compose ps
docker compose down                 # preserva dados do banco
docker compose down -v              # apaga dados e bundle web
docker compose exec backend npx prisma studio --port 5555
```

Portas padrão: API `4000`, banco `55432` (configurável por `API_PORT` e `DB_PORT`). O bundle web é compilado pelo serviço `web` e entregue pela API na mesma origem.
