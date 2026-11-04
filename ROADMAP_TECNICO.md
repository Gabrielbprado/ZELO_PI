# Roadmap técnico — ZELO

Visão de curto, médio e longo prazo baseada na auditoria de **2026-11-04**. O que já foi implementado está marcado em `PROJECT_AUDIT.md`; aqui ficam as pendências ordenadas por risco/benefício.

## Rastreamento GPS (Etapas 1-7)

Etapas 1 e 2 (backend) concluídas no código em 2026-11-04. Status detalhado:

| Etapa | Escopo | Status |
|---|---|---|
| 1 | Auditoria de mapa/GPS existentes | ✅ feito — `docs/audits/` (notas inline no `PROJECT_AUDIT.md`) |
| 2 | Backend: BookingTravel, Redis, Socket.IO, REST, jobs, listeners, redact | ✅ **código**; ❌ testes integração + migration staging pendentes |
| 3 | Mobile: deps + permissões + hook `useProviderTravel` + background service | ⏳ aguarda aprovação da Etapa 2 em staging |
| 4 | Mapa cliente + marcador ao vivo + indicador de staleness | ⏳ depende de 3 |
| 5 | Chegada/cancelamento/limpeza cliente | ⏳ depende de 3 |
| 6 | Notificações push + observabilidade dos novos eventos | ⏳ depende de 2 em staging |
| 7 | Homologação em dispositivo físico Android + iOS | ⏳ pendência externa (não executável só com código) |

Pendências bloqueantes para prod:
- Testes de integração rodados contra Postgres+Redis real (11 cenários prontos).
- Migration `20261104130000_booking_travel` aplicada em staging.
- Decisão de produto sobre `travel-timeout-active` threshold.
- Scaffolding mobile + validação em device físico.

## Sprint atual — Fechar P0

Já implementado: P0.2, P0.3, P0.4, P0.5, P0.7.

Faltam aprovação/configuração externa:

- [ ] **P0.1 — Backup externo:** criar bucket, secrets no GitHub, workflow. Template em `docs/runbooks/BACKUP_RESTORE.md`.
- [ ] **P0.6 — CPF em repouso:** decidir opção A/B/C. Proposta em `docs/proposals/CPF_AT_REST_PROTECTION.md`.
- [ ] **P0.7 — Sentry live:** criar projeto Sentry, definir `SENTRY_DSN` no Render.
- [ ] **Validar P0.4 em staging:** aplicar `20261104120000_payment_review_restrict_delete` e testar que `DELETE FROM "Booking"` com payment ativo falha com FK constraint.
- [ ] **Ligar o retention após primeiro backup validado:** `RETENTION_CLEANUP_ENABLED=true` no Render.

## Sprint 2 — P1 (próxima publicação)

Ordenado por dependência.

1. **Upgrade Zod 3 → 4** (crítico: `npm audit` acusa). Breaking: validadores precisam de revisão.
2. **Pino redact estendido**: adicionar `*.cpf`, `*.ccv`, `*.cardNumber`, `*.cpfCnpj`, `*.pix.*` ao redact.
3. **HMAC + IP allowlist no webhook Asaas**. Depende da documentação Asaas confirmar que eles assinam. Se não assinarem, fica só IP allowlist.
4. **`npm audit` + `pip safety check` + Trivy na CI**. Adiciona step em `.github/workflows/ci.yml`.
5. **DLQ real para outbox**: tabela `OutboxEventDLQ` (ou campo `isDead` no OutboxEvent) para eventos com `attempts > N`. Métrica `outbox_dead_total` no Prometheus.
6. **ErrorBoundary no mobile** (`App.tsx`) com fallback + "tentar novamente".
7. **Rate limit por email** no `authLimiter`: contador no Redis por `email` key além do IP.
8. **CSP restritiva no Helmet**: `script-src 'self'; frame-ancestors 'none'; object-src 'none'`.
9. **Índices faltantes no Prisma**: `ProviderDocument.reviewedById`, `ModerationAction.actorId`, `RecEvent.categoryId`.
10. **CI testa modo degradado** (sem Redis / sem Rabbit) — dois jobs adicionais.
11. **Timeout explícito em `prisma.$queryRaw`** no `/health/ready`.
12. **Circuit breaker no `notificationsClient.service.ts`**.
13. **Fix `ForYouCarousel.tsx:155`** (NEW-2).

## Sprint 3 — P2 (débito técnico médio)

- Endpoint `DELETE /users/me/anonymize` + soft-delete (`deletedAt`) em `User` e `Booking`.
- 2FA para contas ADMIN (TOTP via `otplib`).
- React Query no mobile (dedup + cache offline + retries).
- Zod validando respostas de API no mobile.
- Tokenização de cartão via SDK do gateway (remover `cardNumber` do state React).
- `requirements.lock` do ML via `pip freeze`.
- Dockerfile de produção sem `tests/`.
- Keepalive UptimeRobot/Pingdom no Render free.
- Rotação trimestral de secrets — runbook.
- Audit log específico para acessos admin a dados sensíveis.

## Sprint 4+ — P3 (optimizações)

- Documentar índices manuais PostGIS no schema + validação pós-deploy.
- Backoff exponencial no polling de chat.
- Normalizar `Location` como tipo compartilhado.
- Enum `RecEventType` com docstrings.
- Modal explicativo antes de pedir permissão de push.
- `RegisterScreen` sem default "São Paulo".

## Dependências e ordem

```
P0.1 (backup) → P0.2 (ligar retention) → libera limpeza histórica
P0.6 (CPF decisão) → migration aditiva → backfill → remove plaintext
P0.7 (Sentry DSN) → ligar prod → alertas úteis
Zod upgrade → precede HMAC Asaas (ambos tocam validators)
CSP → precede DELETE anonymize (CSP ajuda defender da tela de delete)
```

## Avaliação de infraestrutura (fora do código)

- **Render free → tier pago:** $7/mês/serviço + Postgres managed com backup. Muda o perfil de risco (P0.1 deixa de ser crítico manual).
- **Secret management:** AWS Secrets Manager ($0,40/segredo/mês) vs Doppler (free tier existe). Elimina `dev_only_*` do compose e habilita rotação sem downtime.
- **Observabilidade:** Grafana Cloud free + Loki para logs (10GB/mês grátis). Prometheus já instrumentado — só precisa do remote_write.
- **CDN para o bundle web:** Vercel já cobre isso (atual). Se mover para Render static site: Render cobra $1/mês por projeto static.

Decisão de custo recomendada (1 mês): Render Pro ($7 × 3 serviços = $21) + Postgres managed ($7) = **US$ 28/mês** para fechar todos os P0 operacionais.
