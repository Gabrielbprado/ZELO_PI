# 0007 — Extração de notificações + schema-per-service

**Status:** Aceita

## Contexto

Para demonstrar uma fronteira de microserviço real, era preciso extrair um domínio. As
notificações eram a candidata de menor risco: a tabela `Notification` era **morta** (sem
escritor), a fronteira já era assíncrona (push best-effort), e o repo já tinha o padrão de
gateway degradável (`mlClient.service.ts`) para copiar. Falta a decisão de **onde ficam os
dados** do serviço: o Render free dá **um** Postgres, compartilhado.

## Decisão

Extrair `services/notifications/` (Node + Prisma + Express). Dados em **schema-per-service**:
as tabelas vivem no schema `notifications` (via `?schema=notifications`), no mesmo Postgres,
isoladas do `public`. **Sem FK entre serviços** — `Notification.userId` é só texto; o
acoplamento é por evento. O serviço mantém uma réplica de push token (`PushToken`),
sincronizada pelo evento `user.pushtoken.set`. O backend vira **gateway**
(`notificationsClient.service.ts`): degrada para lista vazia se o serviço cai.

## Consequências

- **A favor:** fronteira lógica real e reversível — promover a banco físico separado depois
  é só trocar a `DATABASE_URL`. Latência: os 4 `pushToUser` inline saíram do caminho da
  request. `GET /notifications` nunca vira 500 por causa do serviço.
- **Contra:** admite-se a restrição do free tier (um Postgres) em vez de
  database-per-service puro; o contrato de eventos é duplicado (ver ADR 0001); a réplica de
  token é eventualmente-consistente (janela entre registrar o token e poder usá-lo).
