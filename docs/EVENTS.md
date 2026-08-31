# EVENTS — Barramento de eventos de domínio (RabbitMQ + outbox)

Como o ZELO desacopla o que *aconteceu* (um booking foi criado) de quem *reage*
(notificar, registrar métrica, futuramente lançar no ledger). Introduzido na Onda 2.

## Princípio: nada de infra que possa derrubar o produto

O RabbitMQ é uma dependência **opcional**, exatamente como o Redis. Com `RABBITMQ_ENABLED=false`
(o padrão), a API sobe normal, os eventos são gravados no outbox e ficam represados até
um broker existir. Nenhuma requisição HTTP trava por causa disso. É a mesma disciplina do
`mlClient.service.ts`: degradar, nunca quebrar.

## Fluxo ponta a ponta

```
  service (createBooking)                         relay (loop 1s)              consumidor
  ─────────────────────────                       ───────────────             ───────────────
  prisma.$transaction:                            SELECT … FROM OutboxEvent    valida contra o schema
    ├─ booking.create()          ┌──────────┐     WHERE publishedAt IS NULL    ├─ idempotência (ProcessedEvent)
    └─ recordEvent(tx, …)  ──────►│ OutboxEvent│──► FOR UPDATE SKIP LOCKED  ──► ├─ handler (grava Notification)
        (MESMA transação)        └──────────┘     publish (confirm)            └─ ack
                                                  marca publishedAt
                                        │
                                        ▼
                              exchange  zelo.events (topic, durável)
                                        │  routing key = booking.created
                            ┌───────────┴───────────┐
                            ▼                       ▼
                     notifications.q            analytics.q
```

O ponto que se defende na banca: **`booking.create()` e `recordEvent()` estão na mesma
transação**. Ou os dois persistem, ou nenhum. Sem isso, um `payment.confirmed` poderia
commitar no Postgres e falhar ao publicar — e como esse evento vira lançamento no ledger
(Onda 7), *dinheiro sumiria*. É o **outbox transacional**, e é a decisão central da onda.

## Topologia

- **Exchange** `zelo.events` — `topic`, durável, com *publisher confirms*.
- **Routing keys**: `booking.created`, `booking.accepted`, `booking.completed`,
  `booking.cancelled`, `payment.confirmed`, `message.created`, `review.created`.
- **Filas** (uma por consumidor): `notifications.q` (todos os eventos acima),
  `analytics.q` (`booking.created`, por ora).
- **Retry por consumidor**: `<consumidor>.retry.5s|30s|5m`, cada uma com `x-message-ttl` e
  dead-letter de volta para a fila principal *daquele* consumidor. O retry é por consumidor
  de propósito: um `booking.created` que falha em `notifications` não deve reprocessar em
  `analytics`, que já teve sucesso.
- **DLQ**: `zelo.dlq`, o fim da linha após `EVENT_MAX_ATTEMPTS` (3) tentativas. Fica
  visível na UI do RabbitMQ (`:15672`) — o profundímetro subindo é o alarme.

## Idempotência

Entrega é *at-least-once*: duplicatas acontecem (retry, republicação após falha de
confirm). Cada consumidor grava `(consumer, eventId)` em `ProcessedEvent` **na mesma
transação** do seu efeito colateral. Se a mesma entrega chega duas vezes, a segunda viola a
PK composta, a transação inteira dá rollback e a mensagem é tratada como duplicata. O
`eventId` é o id da linha do outbox, que viaja como `messageId` da mensagem AMQP.

## O que a Onda 2 já corrige de dívida

- A tabela `Notification` **finalmente tem um escritor**: `GET /notifications` deixa de
  devolver lista vazia. O push OS-level continua saindo inline dos services (comportamento
  idêntico); na Onda 3 o consumidor sai para o microserviço e absorve o push.
- `trackBooked` (recomendador) **volta a ser chamado**: o `booking.created` carrega o
  `recRequestId` de origem e o `analytics.q` fecha o laço de conversão que se perdia.

## Configuração

| Var | Padrão | Papel |
|---|---|---|
| `RABBITMQ_ENABLED` | `false` | Liga o relay + consumidores. Off = outbox represa. |
| `RABBITMQ_URL` | — | `amqp://…`. Obrigatória quando `ENABLED=true`. |
| `RABBITMQ_EXCHANGE` | `zelo.events` | Nome da exchange de domínio. |
| `OUTBOX_RELAY_INTERVAL_MS` | `1000` | Intervalo entre varreduras do outbox. |
| `OUTBOX_RELAY_BATCH` | `100` | Eventos por varredura. |
| `EVENT_MAX_ATTEMPTS` | `3` | Tentativas antes da DLQ. |

Em dev: `docker compose up` já sobe o `rabbitmq` (UI em `:15672`, guest/guest). Em produção
no Render (sem broker gerenciado no free tier), use CloudAMQP e preencha `RABBITMQ_URL`.

## Testes

- **Unit** (`tests/unit/events.test.ts`): mapeamento evento→notificação, `recordEvent`,
  contrato ida-e-volta do payload, degraus do backoff. Sem banco, sem broker.
- **Integração** (`tests/integration/events.test.ts`):
  - *sem broker* (sempre roda): evento gravado no outbox na mesma transação; booking
    rejeitado não deixa evento (atomicidade); cobertura de cada service.
  - *com broker* (quando `RABBITMQ_ENABLED=true`): ciclo completo outbox → relay →
    consumidor persiste a `Notification`; `analytics` recupera o `trackBooked`. O CI roda
    esse caminho com um RabbitMQ real.
