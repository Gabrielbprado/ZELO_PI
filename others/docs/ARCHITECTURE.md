# Arquitetura do ZELO

De monolito síncrono a plataforma distribuída, com Redis (cache/rate limit/breaker),
RabbitMQ (barramento de eventos com outbox transacional), um microserviço extraído
(notificações, schema-per-service) e observabilidade (Prometheus + Grafana). Cada peça de
infra entrou puxada por um requisito, não como enfeite.

Ver também: [ADRs](adr/README.md) · [barramento de eventos](EVENTS.md) ·
[cache e resiliência](../README.md#cache-e-resiliência-redis).

## Contexto (C4 nível 1–2)

```mermaid
flowchart TB
  mobile["📱 Mobile — Expo / React Native<br/>24 telas · tema claro padrão"]

  subgraph plat["Plataforma ZELO"]
    backend["Backend — Node/Express<br/>API · gateway · WebSocket<br/>domínio · outbox · relay"]
    notif["Notificações — Node<br/>consumidor · inbox · push"]
    ml["ML — Python/FastAPI<br/>ranker + gate de release"]
    redis[("Redis<br/>cache · rate limit · breaker")]
    rabbit{{"RabbitMQ<br/>zelo.events (topic)"}}
    pg[("PostgreSQL + PostGIS<br/>schema public | schema notifications")]
  end

  obs["Prometheus + Grafana<br/>profile obs"]

  mobile -- "HTTPS (JWT)" --> backend
  mobile -- "WebSocket /realtime" --> backend
  backend -- "cache/pubsub" --> redis
  backend -- "publish (outbox relay)" --> rabbit
  backend -- "HTTP /v1/rank (só ids)" --> ml
  backend -- "HTTP /internal (X-SERVICE-TOKEN)" --> notif
  rabbit -- "notifications.q" --> notif
  backend --> pg
  notif --> pg
  ml --> pg
  obs -. "scrape /metrics" .-> backend
  obs -. "scrape /metrics" .-> notif
  obs -. "scrape /metrics" .-> ml
```

Degradação como propriedade de projeto: **Redis, RabbitMQ, ML e o serviço de notificações
são todos opcionais**. Cada um fora do ar vira uma degradação nomeada (cache passthrough,
outbox represado, ranking por nota, inbox vazio), nunca uma queda.

## Sequência — `payment.confirmed` ponta a ponta

O caminho mais crítico (é onde perder um evento custaria dinheiro no ledger da Onda 7), e o
que mostra outbox + correlation id atravessando o broker.

```mermaid
sequenceDiagram
  autonumber
  participant C as Cliente (app)
  participant API as Backend
  participant DB as Postgres
  participant R as Relay (outbox)
  participant MQ as RabbitMQ
  participant N as Notificações
  participant Exp as Expo Push

  C->>API: POST /payments/:id/confirm (x-request-id)
  Note over API: abre contexto (requestId em ALS)
  API->>DB: BEGIN
  API->>DB: UPDATE Payment SET status=PAID
  API->>DB: INSERT OutboxEvent (payment.confirmed, requestId)
  API->>DB: COMMIT
  API-->>C: 200 (sem esperar push)
  loop a cada 1s
    R->>DB: SELECT ... WHERE publishedAt IS NULL FOR UPDATE SKIP LOCKED
    R->>MQ: publish payment.confirmed (confirm, header x-request-id)
    MQ-->>R: ack
    R->>DB: UPDATE publishedAt
  end
  MQ->>N: entrega em notifications.q
  Note over N: reidrata requestId do header
  N->>DB: INSERT Notification (id = eventId → idempotente)
  N->>Exp: push (best-effort)
```

O `x-request-id` nasce na request HTTP, é gravado no outbox, viaja como header AMQP e é
reidratado no serviço — um rastro único do toque no app até o push entregue.

## Topologia AMQP

```mermaid
flowchart LR
  P["outbox relay"] -->|publish| X{{"zelo.events<br/>(topic, durável)"}}

  X -->|booking.*, payment.confirmed,<br/>message.created, review.created,<br/>user.pushtoken.set| NQ["notifications.q"]
  X -->|booking.created| AQ["analytics.q"]

  NQ --> NC["consumidor<br/>(serviço de notificações)"]
  AQ --> AC["consumidor analytics<br/>(backend)"]

  NC -.->|falha| NR["notifications.retry.5s/30s/5m<br/>(TTL + dead-letter → fila principal)"]
  NR -.->|após TTL| NQ
  NC -.->|> 3 tentativas| DLQ["zelo.dlq"]
  AC -.->|> 3 tentativas| DLQ
```

Retry **por consumidor** (não global): um `booking.created` que falha em `notifications`
não reprocessa em `analytics`, que já teve sucesso. Detalhes e o *caveat* de entrega em
[EVENTS.md](EVENTS.md).

## Observabilidade

`prom-client` no backend e no serviço de notificações, `prometheus-fastapi-instrumentator`
no ML — todos expõem `/metrics`. Além das métricas de HTTP, as de **negócio**:
`events_published_total`, `events_consumed_total`, `event_processing_duration_seconds`,
`outbox_pending`, `ml_circuit_state`, `cache_hits_total`, `notifications_persisted_total`,
`push_sent_total`. `docker compose --profile obs up` sobe Prometheus (`:9090`) e Grafana
(`:3000`) com um painel provisionado (`docker/observability/`).
