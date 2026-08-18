# Rodar o ZELO com Docker

Um comando sobe o projeto inteiro: banco com PostGIS, API migrada e **já
populada**, e o app web servido pela própria API.

```bash
docker compose up --build
```

Quando a saída parar em `ZERO API rodando`, abra **<http://localhost:4000>**.

Entre com uma das contas criadas pelo seed:

| Papel | E-mail | Senha |
|---|---|---|
| Cliente | `marina@zero.dev` | `Senha@123` |
| Prestador | `carlos@zero.dev` | `Senha@123` |

> A primeira execução leva alguns minutos: são dois `npm ci`, a compilação do
> bundle web do Expo e o download da imagem do PostGIS. As seguintes usam o
> cache e sobem em segundos.

---

## O que sobe

| Serviço | Imagem / contexto | Porta no host | Papel |
|---|---|---|---|
| `db` | `postgis/postgis:16-3.4` | `55432` | PostgreSQL 16 **com PostGIS** |
| `web` | `./mobile` | — | Job: compila o bundle web e sai |
| `backend` | `./backend` | `4000` | API + WebSocket + app web |
| `ml` | `./ml` | `8001` | Recomendação (perfil `ml`, opcional) |
| `ml-train` | `./ml` | — | Job de treino (perfil `train`) |

O `web` não serve nada: ele compila o app, entrega o resultado no volume
`web-dist` e termina. Quem serve é a API, pela variável `WEB_DIST_DIR` — uma
origem só, sem CORS e sem porta extra no navegador.

A porta do banco é **55432** e não 5432 porque é comum já haver um PostgreSQL
nativo ocupando a 5432 na máquina. A da API é 4000 de propósito: é a porta que
o app web procura quando descobre a API sozinho.

---

## O que acontece no primeiro `up`

1. `db` sobe e responde ao `pg_isready`.
2. `web` compila o bundle (`expo export --platform web`) e o copia para o volume.
3. `backend` roda `prisma migrate deploy` — o que também executa
   `CREATE EXTENSION postgis`.
4. `backend` verifica se o banco está vazio; estando, roda o seed de
   demonstração (7 contas, 8 categorias, profissionais com coordenadas reais de
   São Paulo).
5. A API sobe na 4000, servindo REST em `/api/v1`, WebSocket em `/realtime` e o
   app em `/`.

### Controlando o seed

A variável `SEED_ON_START` decide o passo 4:

| Valor | Comportamento |
|---|---|
| `auto` (padrão) | Semeia só quando o banco está vazio. Reiniciar o contêiner **não** apaga o que você criou usando o app. |
| `force` | Semeia sempre. **Destrutivo** — o seed limpa todas as tabelas antes. |
| `off` | Nunca semeia. |

```bash
# repopular do zero, descartando tudo o que existe hoje
SEED_ON_START=force docker compose up --force-recreate backend
```

---

## Comandos do dia a dia

```bash
docker compose up --build          # subir (reconstruindo o que mudou)
docker compose up -d               # subir em segundo plano
docker compose logs -f backend     # acompanhar os logs da API
docker compose ps                  # o que está de pé
docker compose down                # parar, preservando o banco
docker compose down -v             # parar e APAGAR o banco e o bundle web
```

Rodar comandos dentro da API — os scripts npm são os mesmos do
desenvolvimento local:

```bash
docker compose exec backend npx prisma studio --port 5555   # inspecionar o banco
docker compose exec backend npm run test:unit               # testes unitários
docker compose exec backend npx prisma migrate status       # estado das migrações
```

Conectar com um cliente SQL de fora:

```
host: localhost   porta: 55432   usuário: postgres   senha: postgres
bancos: zero_marketplace · zero_marketplace_test
```

### Testes de integração

O banco `zero_marketplace_test` é criado junto com o volume. Os testes truncam
todas as tabelas entre as suítes — por isso rodam contra ele, nunca contra o
banco principal:

```bash
docker compose exec backend sh -c \
  'DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy && npm run test:integration'
```

---

## Serviço de recomendação (opcional)

Sem ele o app funciona: o carrossel "Para você" responde com
`strategy: "fallback"` e a lista ordenada por avaliação. Para ligá-lo:

```bash
docker compose --profile ml up --build
curl localhost:8001/health      # deve responder "heuristic_fallback" antes do treino
```

### Treinar o modelo

O seed de demonstração tem 6 profissionais e **zero** agendamentos — não há o
que treinar. O seed sintético gera histórico com estrutura realista
(afinidade de categoria, proximidade, faixa de preço, sazonalidade):

```bash
# 1. histórico sintético — DESTRUTIVO: recria os dados do banco
docker compose exec backend npm run prisma:seed:ml -- --verify

# 2. treinar (o artefato é gravado no Postgres)
docker compose --profile train run --rm ml-train

# 3. se o modelo tiver sido ativado, o serviço o carrega em até 60s;
#    para não esperar:
docker compose restart ml
curl localhost:8001/health
```

O relatório de avaliação sai em `ml/reports/eval-<versão>.md`, comparando o
modelo com a ordenação atual do app e com outros baselines.

**O treino terminar não significa que o modelo entrou no ar.** Há um gate: o
artefato só é ativado se superar a ordenação por avaliação com margem
(≥1.15× de NDCG@8 e +0.05 de hit-rate@5). Reprovando, ele é gravado como
**inativo** — fica no banco para inspeção e o serviço continua respondendo
`heuristic_fallback`. Isso é o desenho, não uma falha: um modelo pior nunca
chega ao usuário em silêncio.

Com o volume de dados do seed sintético é normal o gate reprovar (o lift fica
perto de 1.10×). Para ver o ranker de fato ativo, é preciso mais histórico —
ou ajustar os limiares descritos em [`ML.md`](./ML.md).

Qual artefato existe e se algum está ativo:

```bash
docker compose exec db psql -U postgres -d zero_marketplace \
  -c 'SELECT version, "isActive" FROM "MlModelArtifact" ORDER BY "createdAt" DESC;'
```

---

## Configuração

Tudo tem padrão que funciona sem nenhum passo manual. Para mudar algo, crie um
`.env` na raiz do repositório — o compose o lê automaticamente:

```ini
# portas do host
API_PORT=4000
DB_PORT=55432
ML_PORT=8001

# banco
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=zero_marketplace

# segredos (troque em qualquer ambiente exposto)
JWT_ACCESS_SECRET=...        # 32+ caracteres
JWT_REFRESH_SECRET=...       # 32+ caracteres, diferente do anterior
ML_SERVICE_TOKEN=...

# comportamento
SEED_ON_START=auto           # auto | force | off
ML_ENABLED=true              # false desliga a chamada ao serviço de ML

# só se o seu usuário não for uid 1000 (`id -u` / `id -g`) — o job de treino
# grava o relatório em ml/reports/ no host e precisa da sua identidade
DOCKER_UID=1000
DOCKER_GID=1000
```

> ⚠️ Os segredos JWT que vêm no `docker-compose.yml` são de desenvolvimento e
> estão versionados de propósito, para que o primeiro `up` funcione sem
> configuração. **Não** use esse compose exposto à internet sem sobrescrevê-los.

### Acessar de outro dispositivo na rede

O app web descobre a API a partir do endereço da própria página, então acessar
`http://192.168.0.123:4000` do celular já funciona — desde que a API esteja na
porta 4000. Se você mudar `API_PORT`, recompile o bundle apontando o endereço
certo:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.123:8080/api/v1 \
  docker compose build web && docker compose up -d
```

---

## Problemas comuns

**`port is already allocated`**
Alguma coisa já usa a porta. Mude `API_PORT`, `DB_PORT` ou `ML_PORT` no `.env`.

**A API reinicia em loop com `P1001: Can't reach database server`**
O `db` não passou no healthcheck. `docker compose logs db` costuma mostrar um
volume antigo com dados incompatíveis — `docker compose down -v` resolve, ao
custo de apagar o banco.

**`could not open extension control file ... postgis.control`**
O compose está usando uma imagem `postgres` comum em vez da `postgis/postgis`.
Confira o `image:` do serviço `db`.

**O navegador abre em branco em `localhost:4000`**
O job `web` falhou ou não chegou a rodar. Veja `docker compose logs web` e
reconstrua com `docker compose build web`.

**As alterações no código não aparecem**
As imagens são de produção: o código é copiado na build, não montado. Depois de
mexer no código, `docker compose up --build`. Para desenvolvimento com recarga
automática, rode os serviços nativamente — veja [`SETUP.md`](./SETUP.md).

**`PermissionError` ao gravar `/app/reports/eval-*.md` no treino**
O contêiner roda com o seu uid para conseguir escrever em `ml/reports/`. Se o
seu usuário não for 1000, defina `DOCKER_UID=$(id -u)` e `DOCKER_GID=$(id -g)`
no `.env`.

**O carrossel "Para você" aparece sem os selos de justificativa**
A resposta veio com `strategy: "fallback"`: o serviço de ML não está no ar ou
não tem modelo treinado. É o comportamento esperado.
