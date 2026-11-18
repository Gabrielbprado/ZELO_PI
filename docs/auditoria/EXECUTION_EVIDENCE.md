# Evidências de execução — auditoria ZELO

**Data:** 2026-11-17
**Diretório do projeto:** `C:\ANDREY ARQUIVOS\ZELO_PI\ZELO_PI`

Este registro não inclui valores de `.env`, tokens, dados pessoais ou respostas contendo segredos. Os testes de integração não foram executados por segurança: o setup deles trunca tabelas e faz `FLUSHDB`, e o loader usa `DATABASE_URL` como fallback de `TEST_DATABASE_URL`.

## Comandos executados

| Diretório | Comando | Resultado |
|---|---|---|
| `backend` | `npm.cmd run test:unit -- --runInBand` | **PASS** — 14 suites, 116 testes. Jest reportou aviso de opção desconhecida `testTimeout` no nível raiz da configuração; os testes concluíram. Logs de falha de rede para hosts `.invalid` aparecem em cenários mockados de indisponibilidade. |
| `backend` | `npm.cmd run lint` | **PASS** — script executa `tsc --noEmit`. |
| `backend` | `npx.cmd prisma validate` | **PASS** — schema Prisma validado. A CLI informou que carregou ambiente de `.env`; nenhum conteúdo/valor foi aberto ou impresso pela auditoria. |
| `mobile` | `npm.cmd run lint` | **FAIL** — `tsc --noEmit` reportou `mobile/src/components/OpenStreetMapView.tsx(43,6): error TS2769: No overload matches this call`; props do WebView incompatíveis com o overload inferido. As etapas posteriores do lint não rodaram porque o script encadeia verificações com `&&`. |
| `services/notifications` | `npm.cmd run lint` | **PASS** — `tsc --noEmit`. |
| `services/notifications` | `npm.cmd test -- --runInBand tests/mapper.test.ts` | **PASS** — 1 suite, 13 testes. |
| `services/notifications` | `npx.cmd prisma validate` sem variável | **BLOCKED** — Prisma validação exige `DATABASE_URL`, que não estava definida para este processo. |
| `services/notifications` | `DATABASE_URL=postgresql://localhost:5432/zero_test?schema=notifications` (definida somente no processo) + `npx.cmd prisma validate` | **PASS** — schema Prisma validado; não abriu conexão nem alterou banco. A URL foi fictícia e utilizada apenas para satisfazer validação estática. |
| `ml` | `python -m pytest` | **BLOCKED** — `C:\Python313\python.exe: No module named pytest`; não foi encontrado ambiente virtual do ML no repositório. |
| raiz | `docker compose ps` | **BLOCKED** — o Docker daemon/pipe não estava acessível ao processo (`permission denied`). Nenhum container foi iniciado. |
| raiz | busca `rg` por Mercado Pago (`--glob '!node_modules/**' --glob '!**/.env*'`) | **PASS** — nenhuma integração/referência operacional encontrada; uma ocorrência histórica em `PROJECT_AUDIT.md` registra decisão de remoção. |
| raiz | inspeção de `backend/src/routes/payments.routes.ts`, `backend/src/app.ts`, `render.yaml` | **PASS estático** — endpoint de webhook em `POST /api/v1/payments/webhook/asaas`; app monta router em `/api/v1`. `render.yaml` declara serviço Render `zelo-api`, mas isso não prova que deploy esteja ativo nem confirma hostname personalizado. |

## Não executados

- `npm test` completo e `npm run test:integration` do backend: não executados porque `backend/tests/env.integration.ts` permite fallback para `DATABASE_URL`, enquanto `backend/tests/integration/setup.ts` apaga tabelas e roda `redis.flushdb()`. O daemon Docker não estava acessível e não foi possível provar que os endpoints de teste fossem dedicados.
- Testes de integração do serviço de notificações contra banco/broker real: não executados sem identificação segura de infraestrutura isolada.
- Testes de ML: bloqueados pela ausência de `pytest` no Python disponível. A auditoria não instalou dependências.
- E2E, testes concorrentes, falhas de webhook com fault injection, dispositivos Expo Go e builds release: não executados.
- Alcance público do webhook Asaas/Render/Dev Tunnel: não verificado com requisições externas. Nenhuma cobrança real nem chamada autenticada à Asaas foi realizada.
- Auditoria de dependências vulneráveis (`npm audit`/equivalente): não executada nesta rodada; não se afirma ausência de advisories.

## Inspeção estática usada nos achados

- **RISK-001:** `backend/tests/env.integration.ts:5-10`; `backend/tests/integration/setup.ts:5-64` — fallback de URL e truncamento/`FLUSHDB`.
- **BUG-001:** `backend/src/routes/payments.routes.ts:29-30` — rota paramétrica UUID antes da rota estática installments; cliente em `mobile/src/api/payments.ts`.
- **BUG-002:** `backend/src/services/bookings.service.ts:150-188` — falta de validação do status atual antes de incrementar conclusão e gravar evento.
- **BUG-003:** `backend/src/services/payments.service.ts:442-460`, comparado à guarda de booking em `applyGatewayPaymentStatus` linha 514.
- **BUG-004:** fallbacks de `docker-compose.yml:123-160` comparados com o bloqueio de marcadores em `backend/src/config/env.ts:153-170`; Docker Compose não foi iniciado.
- **BUG-005:** erro TS2769 obtido pelo comando de lint do mobile no arquivo e linha citados acima.
- **BUG-006:** `backend/src/services/bookingTravel.service.ts:80-120` — checagem de dono e criação de sessão sem condição sobre estado do booking.
- **RISK-002:** `backend/src/controllers/payments.controller.ts:128-138,219-239` — gravação da idempotência antes da aplicação do status local.
- **Asaas:** chave compartilhada na conversa foi tratada como segredo exposto; valor omitido. Não houve uso, armazenamento em arquivo, ou request ao gateway.

## Estado do working tree

Antes da auditoria havia modificações locais em backend, mobile e documentação, além de arquivos mobile não rastreados (incluindo componente de mapa e APK). Esses itens não foram criados nem alterados pela auditoria. Foram criados apenas `docs/auditoria/BUG_REPORT.md` e `docs/auditoria/EXECUTION_EVIDENCE.md`.
