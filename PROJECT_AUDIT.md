# ZELO — Histórico de auditoria e correções

Documento vivo. Registra o que foi auditado, corrigido, aprovado e o que permanece aberto. Última atualização: **2026-11-04**.

## Decisão arquitetural — Gateway de pagamento exclusivo (2026-11-04)

**O ZELO utiliza exclusivamente o Asaas como gateway de pagamento.** Esta decisão
cobre PIX, cartão de crédito/débito, cobranças, confirmação, cancelamento, estornos,
reembolsos, split (quando habilitado), webhooks, idempotência e conciliação financeira.
Nenhum outro gateway é suportado nem pode ser adicionado sem revisão arquitetural
formal. Documentação canônica: [`docs/PAYMENTS.md`](docs/PAYMENTS.md).

### Auditoria de remoção do Mercado Pago (2026-11-04)

Resultado da auditoria: o Mercado Pago **nunca existiu como integração operacional no
código versionado** (comprovado por `grep` global e `git log --all -S` retornando
zero). As únicas referências encontradas foram:

- 1 comentário técnico em `backend/src/services/payments.service.ts:46` comparando
  APIs (reescrito para não mencionar MP, mantendo o ponto técnico).
- 6 variáveis dead em `.env` local do operador (gitignored; não lidas por nenhum
  `process.env.MERCADOPAGO_*` no código). Removidas após autorização explícita.

Nenhum arquivo de código, migration, schema, dependência, rota, worker, consumer ou
teste foi afetado. Zero risco financeiro. Zero regressão.

**Risco de segurança colateral detectado (fora do escopo desta auditoria):** o `.env`
local do operador contém `ASAAS_API_KEY` com prefixo `aact_prod_` apontando para
`https://api.asaas.com/v3` (produção real). **Operador precisa decidir se mantém ou
troca para sandbox em ambiente de desenvolvimento.** Não alterado nesta rodada por
estar fora do escopo autorizado.

---

## Etapa 2.1 — Fechamento das pendências de integração — 2026-11-04

Fechou os 3 BLOCKED do relatório anterior.

### Lote A — AMQP end-to-end (5/5 PASS)
`backend/tests/integration/bookingTravel.broker.test.ts` — testa fluxo real `outbox → relay → broker → consumer`, sem bypass:
- A.1 publicação do relay marca outbox.
- A.2 consumer grava `ProcessedEvent`.
- A.3 redelivery é duplicata (1 linha).
- A.4 `travel.ended` apaga chave Redis via consumer.
- A.5 payload malformado vai pra DLQ.

### Lote B — travel-timeout-active (6/6 PASS)
`backend/tests/integration/bookingTravel.timeout.test.ts` — cenários B.1 a B.6 com backdating de `startedAt`:
- Filtros por status e idade.
- Idempotência + corrida entre 2 instâncias.
- Bug de métrica descoberto e corrigido (`cancelTravelInternal` agora devolve `{changed}`; job só conta transições efetivas).

### Lote C — Documento do limite 8h
`docs/proposals/TRAVEL_TIMEOUT_8H.md`. Impacto: 30-40% das categorias do catálogo têm chance de atingir timeout com serviços legítimos. Recomenda Alternativa 1 (env var) curto prazo. **Decisão de produto pendente.** Zero alteração de código.

### Critérios PASS/FAIL pré-estabelecidos
`docs/audits/ETAPA_2_1_PASS_FAIL_CRITERIA.md` — 17 critérios objetivos escritos antes da implementação. Resultado: **17 PASS, 0 FAIL, 0 BLOCKED**.

### Suítes executadas contra Postgres+Redis+RabbitMQ reais
- Unit: 14/14 suítes, **116/116** passam.
- Integration com RabbitMQ: 22/24 suítes, **155/159** passam. 4 falhas = `financial.test` + `payments.create.test`, pré-existentes, fora do escopo.

### Decisão desta rodada: **APROVADO**
Todos os pontos BLOCKED do relatório anterior foram resolvidos com evidência REAL de execução.

---

## Etapa 2 (GPS / Travel) — Homologação técnica — 2026-11-04

### Migration `20261104130000_booking_travel`

- **Status local:** aprovada após inspeção. Schema ↔ SQL batem (enum + tabela + 2 índices + 2 FKs RESTRICT).
- **`prisma validate`**: ok.
- **`prisma format`**: schema reformatado automaticamente (não-destrutivo).
- **`prisma migrate deploy` em banco real:** **NÃO EXECUTADO** nesta sessão por falta de acesso a staging. Runbook detalhado em `docs/runbooks/MIGRATE_BOOKING_TRAVEL.md`.

### Testes de integração

- **11 cenários criados** em `backend/tests/integration/bookingTravel.test.ts` cobrindo exatamente a Fase 2 solicitada.
- **Test de transporte Socket** atualizado em `backend/tests/integration/tracking.test.ts` para o novo contrato `travel:*`.
- **Execução:** **NÃO EXECUTADA** — Docker Desktop daemon parado localmente. Para rodar: `docker compose up -d db redis && npm run test:integration -- bookingTravel.test`.
- **Typecheck dos testes:** ✅ (`tsc --noEmit` passa).

### Auditoria dos jobs

Documento completo em `docs/audits/TRAVEL_JOBS_AUDIT.md`. Resumo:

- `travel-redis-cleanup`: idempotente, seguro em multi-instância, sem caminho de encerramento indevido. **Aprovado**. Pendência P1: métrica Prometheus.
- `travel-timeout-active`: idem. **Aprovado** com ressalva de confirmar com produto se 8h é o threshold correto (serviços legítimos de >8h, como mudança, seriam fechados indevidamente). Pendência P2: promover para env var.

### Parecer independente (Agente 1)

| Critério de aprovação | Status |
|---|---|
| Migration aditiva, reversível, validada sintaticamente | ✅ |
| Schema ↔ migration ↔ Client gerado (`prisma generate` ok) | ✅ |
| 11 testes de integração escritos e sintaticamente válidos | ✅ |
| Testes com evidência REAL de execução | ❌ pendente (precisa Postgres+Redis up) |
| Jobs auditados e sem risco de encerramento indevido | ✅ |
| Nenhuma coordenada em logs, Sentry ou DB | ✅ (comprovado em teste unit `loggerRedact.test.ts`) |
| Documentação de pendências externas e trade-offs | ✅ |

**Veredito:** Etapa 2 **tecnicamente concluída no código** com typecheck e testes unit limpos. **Condicionalmente aprovada** para merge: pendências operacionais listadas abaixo precisam ser resolvidas antes de ligar em staging/prod.

### Pendências operacionais pós-Etapa 2 (bloqueantes para prod)

1. **Rodar `docker compose up -d db redis`** localmente + `npm run test:integration -- bookingTravel.test tracking.test` e colar resultado antes de merge.
2. **Aplicar migration em staging** usando `docs/runbooks/MIGRATE_BOOKING_TRAVEL.md`.
3. **Decisão de produto:** threshold de 8h do `travel-timeout-active` é adequado?
4. **Confirmar que o consumer `travel.consumer.ts` está registrado** no RabbitMQ real (staging) — o código registra, mas depende do broker estar up.

---

## Auditoria 360° — 2026-11-04

Cinco auditores paralelos cobriram backend, banco, mobile, infra/CI-CD e segurança/integrações. Consolidação crítica (Agente 2) separou confirmados, hipóteses e falsos positivos. Resumo em `docs/proposals/` (quando há decisão pendente) ou aplicado direto no código.

### P0 — Críticos

| ID | Título | Status | Evidência |
|---|---|---|---|
| P0.1 | Backup automatizado do Postgres | **Proposto** | `scripts/backup-postgres.sh` + `docs/runbooks/BACKUP_RESTORE.md`. Faltam credenciais S3/B2 e workflow GitHub (ver runbook). |
| P0.2 | Retenção de OutboxEvent, ProcessedEvent, AuditLog | **Implementado (desligado por padrão)** | `src/jobs/retentionCleanup.job.ts`, env `RETENTION_CLEANUP_ENABLED=false` por default. Operador liga depois de validar backup. |
| P0.3 | Guard de segredos no boot | **Implementado + testado** | `src/config/env.ts` rejeita `dev_only_*`, secrets iguais, senha admin curta em produção. Testes: `tests/unit/envGuards.test.ts`. |
| P0.4 | FK Payment/Review contra DELETE em cascata | **Implementado** | `prisma/migrations/20261104120000_payment_review_restrict_delete/` + schema atualizado. Precisa rodar `prisma migrate deploy` em staging antes de produção. |
| P0.5 | Throttle Socket.IO `location:update` | **Implementado** | `src/realtime/tracking.ts`, 1 update/s por (socket, booking). |
| P0.6 | Proteção de CPF em repouso | **Proposto** | `docs/proposals/CPF_AT_REST_PROTECTION.md` — aguarda decisão de produto/legal entre hash, encryption ou mixed. |
| P0.7 | Observabilidade remota (Sentry) | **Scaffolded (desligado por default)** | `src/config/sentry.ts` + integração em `server.ts` e `errorHandler.ts`. No-op sem `SENTRY_DSN`. Precisa de DSN no Render dashboard. |

### Correções anteriores (sessão de 2026-11-03)

Mantidas como referência — não re-abrir.

| ID | Título | Arquivo |
|---|---|---|
| BE-006 | Webhook do Asaas: claim de eventId movido para depois do fetch/status | `src/controllers/payments.controller.ts` |
| FE-007 | Single-flight real do refresh JWT no mobile | `mobile/src/api/client.ts` |
| NS-001 | DLQ ack no notifications service: só faz ack após sucesso do `sendToQueue` | `services/notifications/src/events/consumer.ts` |
| BE-002 | Rounding de parcelas em centavos, com guarda de rate desconhecida | `src/services/payments.service.ts` |
| NS-003 | Guard `Number.isFinite` no payment.confirmed | `services/notifications/src/events/consumer.ts` |
| BE-001 | Validador de CPF com checksum + endpoint de update | `src/validators/auth.ts`, `src/services/users.service.ts` |

### Novos achados surgidos durante esta sessão

| ID | Severidade | Descrição | Ação proposta |
|---|---|---|---|
| NEW-1 | ALTA | `npm audit --production` acusa 14 vulnerabilidades (1 crítica em `zod <4.6.6`). O auditor anterior reportou zero — estava errado. | Upgrade de Zod é breaking (3→4). Precisa sprint dedicada; atualizar no roadmap. |
| NEW-2 | MÉDIA | `mobile/src/components/ForYouCarousel.tsx:155` com erro de tipo `ViewToken` (índex `undefined` vs `null`). Arquivo não tocado em nenhuma correção; é regressão de upgrade do React Native. | 15 min de fix — alinhar o tipo do callback. |

## Validação pós-correções

- `backend npm run lint` (tsc --noEmit): ✅ limpo
- `backend npm run test:unit`: ✅ **12 suites / 104 tests** (passou de 11/99)
- `mobile npm run typecheck`: ⚠️ 1 erro pré-existente em `ForYouCarousel.tsx` (NEW-2)
- `backend npm audit --audit-level=high --production`: ❌ 14 vulnerabilidades (NEW-1)

### Validação não executada nesta sessão

- Testes de integração backend (precisam de Postgres rodando).
- Build de produção (`npm run build`).
- `prisma migrate deploy` da nova migration (precisa de banco de staging).
- Testes manuais da migration P0.4 (tentar DELETE em booking com payment deve falhar com FK constraint).

## Dependências externas (nada bloqueando o código; tudo precisa de acesso a painel)

Transcrito do runbook de backup e das propostas.

- [ ] Bucket S3/B2 para backups (sugestão: `zelo-backups-prod`).
- [ ] IAM user com permissão SÓ para `PutObject` nesse bucket.
- [ ] GitHub Secrets: `DATABASE_URL`, `BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- [ ] `.github/workflows/backup-postgres.yml` criado a partir do template do runbook.
- [ ] Projeto Sentry criado; `SENTRY_DSN` + `SENTRY_ENVIRONMENT=production` no Render dashboard.
- [ ] Decisão de produto/legal sobre CPF (ver `docs/proposals/CPF_AT_REST_PROTECTION.md`).
- [ ] Decisão sobre upgrade Zod 3 → 4 (breaking) para zerar vulnerabilidades críticas.

## Como rodar as correções em staging

```bash
# 1) Verificar que a env está limpa (vai falhar se os guards pegarem algo)
cd backend && NODE_ENV=production npm start

# 2) Aplicar a nova migration
cd backend && npx prisma migrate deploy

# 3) Verificar que o cron de retention está agendado (Bull Board)
#    http://.../admin/queues → fila "housekeeping" → scheduler "retention-cleanup"

# 4) Ligar o retention cleanup DEPOIS do primeiro backup S3 validado
#    No Render, setar RETENTION_CLEANUP_ENABLED=true

# 5) Ligar o Sentry
#    No Render, setar SENTRY_DSN=https://...
```

## O que NÃO foi feito e por quê

- **Remover dev_only_\* do docker-compose.yml**: o compose é parte do onboarding (documentado em README). O guard do boot (P0.3) impede uso acidental em produção; remover os defaults quebraria `docker compose up` sem passo manual. Alternativa seria `docker-compose.override.yml.example` versionado + `.override.yml` gitignored, mas isso é P1 de mudança de processo, não P0.
- **Migration que apaga histórico infinito de OutboxEvent/AuditLog**: deliberadamente não feito. O job está no código mas desligado. Operador decide prazos e liga depois do backup.
- **Upgrade de Zod**: breaking change (3→4) — fora do escopo de "correção do P0".
- **Fix do ForYouCarousel**: fora do escopo; não é P0 nem P1.
