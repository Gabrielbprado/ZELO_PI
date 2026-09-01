# Architecture Decision Records (ADR)

Registros curtos das decisões de arquitetura do ZELO — contexto, decisão e consequências.
Vários são **retroativos**: a decisão foi tomada antes do registro, e o material-fonte já
vivia em prosa nos cabeçalhos de `docker-compose.yml`, `backend/Dockerfile`, `render.yaml`
e nos docs. Aqui ficam formalizados para a defesa.

| # | Decisão | Status |
|---|---|---|
| [0001](0001-monorepo-tres-apps.md) | Monorepo de três apps (backend, mobile, ml) | Aceita |
| [0002](0002-postgis.md) | PostGIS para geolocalização | Aceita |
| [0003](0003-gate-de-release-do-recomendador.md) | Gate de release do recomendador | Aceita |
| [0004](0004-redis-dependencia-opcional.md) | Redis como dependência opcional | Aceita |
| [0005](0005-rabbitmq-barramento-de-eventos.md) | RabbitMQ como barramento de eventos | Aceita |
| [0006](0006-outbox-transacional.md) | Outbox transacional | Aceita |
| [0007](0007-extracao-notificacoes-schema-per-service.md) | Extração de notificações + schema-per-service | Aceita |
| 0008 | BullMQ além do RabbitMQ | Proposta (Onda 4, não implementada) |
| [0009](0009-tema-claro-padrao.md) | Tema claro como padrão | Aceita |

Formato: cada ADR tem **Contexto** (a força que empurrou a decisão), **Decisão** (o que se
escolheu) e **Consequências** (o que se ganhou e o que se pagou).
