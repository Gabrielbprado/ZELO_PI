# 0006 — Outbox transacional

**Status:** Aceita

## Contexto

Publicar um evento DEPOIS de commitar a mudança de estado abre uma fresta: o Postgres
commita, a publicação no broker falha, e o evento se perde. Para `payment.confirmed` isso é
inaceitável — na Onda 7 esse evento vira lançamento no ledger, ou seja, **dinheiro
sumiria**. O caminho inverso (publicar antes de commitar) perde o evento se a transação der
rollback.

## Decisão

**Outbox transacional.** Os services gravam o evento numa tabela `OutboxEvent` dentro da
**mesma** `prisma.$transaction` da mudança de estado (via `recordEvent(tx, …)` — nenhum
service importa `amqplib`). Um *relay* varre `WHERE publishedAt IS NULL` com
`SELECT … FOR UPDATE SKIP LOCKED`, publica com *publisher confirms* e marca `publishedAt`.
Consumidores são idempotentes (`ProcessedEvent`, ou a PK = id do evento no serviço de
notificações), porque a garantia é *at-least-once*.

## Consequências

- **A favor:** ou o estado e o evento persistem juntos, ou nenhum — atomicidade real.
  `SKIP LOCKED` deixa várias instâncias rodarem o relay sem publicar em duplicata. Troca
  "possível perda" por "possível duplicata", que a idempotência absorve.
- **Contra:** uma tabela e um worker a mais; o relay publica dentro de uma transação
  (segura o lock durante o I/O), o que é aceitável no volume de um PI; o índice do outbox é
  parcial (`WHERE publishedAt IS NULL`) para o polling seguir barato.
