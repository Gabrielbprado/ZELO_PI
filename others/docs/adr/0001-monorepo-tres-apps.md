# 0001 — Monorepo de três apps

**Status:** Aceita · retroativo

## Contexto

O ZELO é um produto único (marketplace de serviços locais) composto de três executáveis
com ciclos de vida distintos: a API Node, o app Expo e o serviço de recomendação Python.
Eles compartilham contrato (schemas de eventos, formato de ranking) e evoluem juntos.

## Decisão

Um único repositório com `backend/`, `mobile/`, `ml/` e, a partir da Onda 3,
`services/notifications/`. Cada pacote tem seu próprio gerenciador de dependências
(npm / pip) e seu próprio Dockerfile; o CI roda um job por pacote.

## Consequências

- **A favor:** um PR atravessa fronteiras (mudar um evento no backend e seu consumidor no
  serviço no mesmo commit), o contrato fica versionado junto, e o onboarding é um `git
  clone`. `docker compose up` sobe tudo.
- **Contra:** os contratos entre serviços são **duplicados** (ex.: os schemas Zod de
  eventos no backend e no serviço de notificações), não importados de um pacote comum. Foi
  uma escolha consciente de escopo; num monorepo maior viraria `@zelo/contracts`.
