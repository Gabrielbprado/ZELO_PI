# 0005 — RabbitMQ como barramento de eventos

**Status:** Aceita

## Contexto

A arquitetura original era síncrona e single-instance: o event bus era um `EventEmitter`
in-process. Extrair um microserviço e reagir a fatos de domínio (booking criado, pagamento
confirmado) exige um transporte entre processos, com fan-out (um evento, vários
interessados) e entrega confiável (retry, dead-letter).

## Decisão

**RabbitMQ**, exchange `topic` `zelo.events`. Escolhido sobre um log tipo Kafka porque o
padrão aqui é *integration events* com fan-out e roteamento por chave, não reprocessamento
de streams — e o modelo de filas + DLQ do AMQP resolve retry/erro com menos operação.
Como Redis (ADR 0004), é **dependência opcional**: `RABBITMQ_ENABLED=false` sobe a API e o
outbox represa os eventos até um broker existir. Em produção: CloudAMQP (sem broker
gerenciado no Render free). Topologia detalhada em [`docs/EVENTS.md`](../EVENTS.md).

## Consequências

- **A favor:** fan-out e desacoplamento reais; a UI do RabbitMQ (`:15672`) torna filas,
  binds e DLQ **visíveis** na banca; retry com backoff (TTL+DLX) por consumidor.
- **Contra:** mais uma peça de infra (~), e o AMQP não faz *delay* de negócio nativo — o
  agendamento de jobs (lembretes etc.) pede outra ferramenta (BullMQ, ADR 0008, futura).
