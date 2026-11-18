# Relatório de auditoria técnica — ZELO

**Data:** 2026-11-17
**Escopo:** leitura do repositório e execuções locais seguras. Nenhum código de produção, migration ou dado de produção foi alterado. Os relatórios são os únicos arquivos criados nesta auditoria.

## Resumo executivo

Foram identificados **6 bugs confirmados** (2 P1 e 4 P2) e **3 riscos potenciais** (1 P0 e 2 P1). O mobile falha no typecheck; a consulta de parcelamento é interceptada por outra rota; e os fluxos de conclusão de agendamento e confirmação de pagamento em dinheiro não verificam o estado atual do booking. A configuração padrão do Docker também conflita com a validação de segredos em produção.

O risco P0 diz respeito à segurança da suíte de integração: ela pode truncar o banco definido por `DATABASE_URL` e executar `FLUSHDB` em Redis quando `TEST_DATABASE_URL` não está definido. Por isso, a suíte não foi executada. A auditoria não certifica que o ambiente esteja livre de outros bugs: não foi possível rodar integração, E2E, broker, ML ou validação em ambiente publicado.

Durante esta conversa também foi compartilhada uma chave Asaas com aparência de produção. A validade não foi verificada nem a chave usada. Trate-a como comprometida e revogue-a/rotacione-a antes de ativar pagamentos. O valor não foi copiado para este relatório.

## Arquitetura mapeada

| Camada | Componentes identificados |
|---|---|
| App | `mobile/`: React Native/Expo 58, TypeScript, React Navigation, Expo Location, telas para cliente e prestador; inclui implementação OpenStreetMap/WebView no working tree. |
| API | `backend/`: Node.js, Express 4, TypeScript, Prisma 5; rotas de health, admin, relatórios, carteira, auth, usuários, prestadores, bookings/deslocamento, avaliações, mensagens, orçamento, notificações, pagamentos, emergência e recomendações. Prefixo HTTP `/api/v1`; Socket.IO e métricas também presentes. |
| Persistência | PostgreSQL 16/PostGIS via Prisma. Modelos principais incluem Booking, BookingTravel, Payment, Review, OutboxEvent e ProcessedEvent; schema inclui índices, unicidades e FKs. |
| Assíncrono | Redis 7; RabbitMQ 3 com outbox, filas de retry/DLQ; `services/notifications/` persiste inbox e envia push Expo. |
| ML | `ml/`: Python, FastAPI, scikit-learn, NumPy e SciPy; API possui fallback quando recomendação não está disponível. |
| Infra/observabilidade | Docker Compose, Render Blueprint, Prometheus/Grafana e métricas Node/Python. `render.yaml` define serviço `zelo-api`, health check `/api/v1/health`. |
| Pagamentos | Asaas como gateway encontrado no código. Endpoint de webhook: `POST /api/v1/payments/webhook/asaas`; autenticação pelo header `asaas-access-token`, validado contra `ASAAS_WEBHOOK_TOKEN`. |

Versões declaradas relevantes: backend Express 4.21 e Prisma 5.22; mobile Expo `~58.0.25`; serviço de notificações TypeScript/Express/Prisma; ML exige Python `>=3.11,<3.14` e define alvo Python 3.12. Valores secretos de `.env` não foram lidos nem registrados.

### Mercado Pago

Busca no código e documentação (excluindo dependências e arquivos `.env*`) não encontrou referência operacional ao Mercado Pago. A única ocorrência foi histórica em `PROJECT_AUDIT.md`, descrevendo sua remoção. Não foram identificadas rotas, configuração ou dependências ativas de Mercado Pago.

## Bugs confirmados

### BUG-001 — Endpoint de parcelas interceptado pela rota dinâmica

- **Prioridade/categoria/status:** P2 · API/roteamento · bug confirmado por ordem de registro.
- **Arquivo:** `backend/src/routes/payments.routes.ts:29-30`.
- **Comportamento encontrado:** `GET /:bookingId` é registrado antes de `GET /installments`. Uma requisição a `/api/v1/payments/installments?amount=...` casa com `/:bookingId` e é submetida à validação UUID do booking, respondendo erro de validação em vez das opções de parcelas.
- **Comportamento esperado:** a rota de parcelas deve alcançar `ctrl.getInstallments` e validar `amount`.
- **Reprodução:** com API e usuário autenticado, fazer `GET /api/v1/payments/installments?amount=100`. O cliente mobile chama essa rota em `mobile/src/api/payments.ts` e usa as opções em `PaymentScreen`.
- **Evidência:** inspeção estática da ordem das rotas. Sem reprodução HTTP: ambiente de API integrado não foi iniciado.
- **Causa raiz:** precedência de `/:bookingId` sobre a rota estática.
- **Impacto:** seleção de parcelas/cartão pode falhar no fluxo de pagamento.
- **Critério de correção:** a chamada retorna a resposta de parcelas e testes de rota comprovam o caso válido e `amount` inválido sem capturar o segmento como bookingId.

### BUG-002 — Concluir booking repetidamente incrementa `jobsDone` e emite eventos novamente

- **Prioridade/categoria/status:** P1 · regra de negócio/integridade · bug confirmado por código.
- **Arquivo:** `backend/src/services/bookings.service.ts:150-188`.
- **Comportamento encontrado:** a função busca o estado atual, mas valida apenas papel e status-alvo (`assertTransitionAllowed(role, status)`, linha 164). Não valida a transição a partir de `booking.status`; toda chamada cujo alvo é `COMPLETED` atualiza o booking, incrementa `providerProfile.jobsDone` e grava evento de conclusão novamente.
- **Reprodução:** como prestador autorizado, enviar a atualização para `COMPLETED` duas vezes para o mesmo booking. A segunda chamada incrementa o contador e emite novo evento também.
- **Evidência:** incremento incondicional em relação ao estado anterior, dentro do ramo `status === 'COMPLETED'` (linhas 180-188). Nenhum teste de integração foi executado.
- **Causa raiz:** falta de guarda sobre o estado prévio; a transação sozinha não evita repetição lógica.
- **Impacto:** estatística de trabalhos concluídos inflada e efeitos duplicados nos consumidores do outbox; status fora de ordem pode também ser aceito.
- **Critério de correção:** transições inválidas e repetição de conclusão são rejeitadas ou idempotentes; contador e evento aparecem uma única vez por conclusão efetiva, com teste concorrente.

### BUG-003 — Confirmação de pagamento em dinheiro aceita booking cancelado

- **Prioridade/categoria/status:** P1 · pagamentos/integridade financeira · bug confirmado por código.
- **Arquivo:** `backend/src/services/payments.service.ts:442-460`.
- **Comportamento encontrado:** `confirmPayment` valida método e se o chamador é prestador dono/admin, mas não valida `payment.booking.status`. Em seguida chama `markPaidAndEmit`, que muda pagamentos que não sejam `PAID`/`REFUNDED` para `PAID` e emite `payment.confirmed`. O caminho Asaas, em contraste, rejeita booking `CANCELLED`/`DISPUTED` na linha 514.
- **Reprodução:** criar booking com método cash, cancelá-lo e chamar a confirmação como prestador proprietário.
- **Evidência:** código nas funções mencionadas; sem chamada HTTP ou banco de teste.
- **Causa raiz:** ausência da guarda de estado do booking no fluxo manual.
- **Impacto:** pagamento de booking cancelado pode ser marcado como pago e encaminhado aos consumidores financeiros.
- **Critério de correção:** pagamento em dinheiro de booking cancelado/disputado não é confirmado; teste prova que status e eventos/ledger permanecem inalterados.

### BUG-004 — Compose padrão falha na validação de secrets de produção

- **Prioridade/categoria/status:** P2 · configuração/DevOps · conflito confirmado estaticamente.
- **Arquivos:** `docker-compose.yml:123,130-160`; `backend/src/config/env.ts:153-170`; instrução de inicialização em `README.md:197`.
- **Comportamento encontrado:** o serviço API é iniciado com `NODE_ENV=production`, e variáveis de fallback incluem marcadores como `dev_only_`, `troque_isto` e senha admin `zelo_admin_...`. A validação de produção rejeita esses marcadores. Assim, o comando recomendado `docker compose up --build`, sem `.env` com segredos substitutos, falha durante a inicialização.
- **Reprodução:** em instalação limpa, executar o Compose conforme README sem definir overrides de segredos. Execução não feita porque o daemon Docker não estava acessível; a conclusão é estática.
- **Causa raiz:** defaults descritos como suficientes para desenvolvimento são passados a um processo com validação de produção.
- **Impacto:** setup documentado não sobe; onboarding local bloqueado.
- **Critério de correção:** instalação limpa sobe pelo procedimento documentado em modo seguro e um teste valida o boot com defaults e a recusa em produção real.

### BUG-005 — Typecheck do mobile falha em `OpenStreetMapView`

- **Prioridade/categoria/status:** P2 · compilação/mobile · falha reproduzida.
- **Arquivo:** `mobile/src/components/OpenStreetMapView.tsx:43`.
- **Comportamento encontrado:** `npm.cmd run lint` falha no `tsc --noEmit` com `TS2769: No overload matches this call`; props do WebView são inferidas como `never` no JSX.
- **Comportamento esperado:** typecheck/lint concluir sem erro para permitir build e execução do app.
- **Evidência:** comando executado no diretório `mobile`, erro TS2769 na linha 43. O arquivo e outras mudanças de mobile já estavam modificados no working tree antes da auditoria; não foram alterados pela auditoria.
- **Causa raiz:** incompatibilidade de tipos/props no componente (hipótese; não houve correção para confirmar).
- **Impacto:** a verificação estática do app falha e pode bloquear builds automatizados.
- **Critério de correção:** `npm run typecheck` e `npm run lint` passam no estado que inclui o componente; build Android/Expo Go validado em etapa própria.

### BUG-006 — Deslocamento pode iniciar em booking sem estado elegível

- **Prioridade/categoria/status:** P2 · regra de negócio/GPS · bug confirmado por código.
- **Arquivo:** `backend/src/services/bookingTravel.service.ts:80-120`.
- **Comportamento encontrado:** `startTravel` verifica existência e propriedade do prestador, depois cria uma sessão `ACTIVE`; não verifica estado do booking. Portanto, booking solicitado, cancelado ou concluído pode receber deslocamento ativo.
- **Reprodução:** como prestador dono, chamar início de deslocamento para um booking existente sem estar em estado que autorize o serviço.
- **Evidência:** `assertProviderOwnsBooking` e criação da sessão dentro da transação; nenhum filtro/validação de `booking.status` neste fluxo.
- **Causa raiz:** autorização de propriedade é usada sem validação da máquina de estados do booking.
- **Impacto:** cliente pode receber localização/estado de deslocamento associado a serviço não confirmado ou já encerrado.
- **Critério de correção:** apenas estados explicitamente elegíveis podem iniciar deslocamento e teste cobre status cancelado/concluído e corrida com cancelamento.

## Riscos potenciais

### RISK-001 — Testes de integração podem apagar banco e Redis errados

- **Prioridade/categoria/status:** P0 · segurança dos testes/dados · risco potencial grave, não executado.
- **Arquivos:** `backend/tests/env.integration.ts:5-10`; `backend/tests/integration/setup.ts:5-6,16-17,29,35-64`.
- **Evidência:** `TEST_DATABASE_URL` faz fallback para `DATABASE_URL`; o setup executa truncamento amplo de tabelas antes/depois de cada teste e `redis.flushdb()`. Executar a suíte com URL de produção/dev e `TEST_DATABASE_URL` ausente pode destruir os dados correspondentes.
- **Impacto:** perda irreversível de dados de negócio e chaves do banco Redis selecionado.
- **Critério de correção:** falhar fechado se `TEST_DATABASE_URL` não estiver definida e validar explicitamente host/database/schema de teste antes de truncar; testes verificam que URLs não isoladas são recusadas.
- **Decisão de auditoria:** `npm test` e integração não foram executados. O comentário de segurança no arquivo não neutraliza o fallback implementado.

### RISK-002 — Evento do webhook é reivindicado antes da aplicação local

- **Prioridade/categoria/status:** P1 · pagamentos/idempotência · risco potencial.
- **Arquivo:** `backend/src/controllers/payments.controller.ts:128-138,219-239`.
- **Comportamento encontrado:** após buscar status terminal na Asaas, o handler grava `ProcessedEvent` (`claimWebhookEvent`) e depois chama `applyGatewayPaymentStatus`. Se a aplicação local falhar após o claim, o retry do Asaas encontra o evento duplicado e retorna 200 sem repetir a aplicação.
- **Evidência:** ordem sequencial visível no handler. Não houve fault injection nem chamada real ao gateway.
- **Impacto:** pagamento confirmado externamente pode permanecer não reconciliado localmente após falha transitória.
- **Critério de correção:** claim e aplicação devem ter garantia transacional/reprocessável; teste injeta falha após claim e confirma que retry converge o pagamento.

### RISK-003 — Credencial Asaas com aparência de produção foi compartilhada na conversa

- **Prioridade/categoria/status:** P1 · gestão de segredo · exposição confirmada, validade/uso não verificados.
- **Evidência:** a mensagem do usuário continha uma chave API completa. O valor não foi reproduzido neste documento, salvo em arquivo ou utilizado em chamadas.
- **Impacto:** se válida, pode permitir operações na conta Asaas.
- **Ação/critério de encerramento:** revogar a chave no painel Asaas, gerar outra, atualizar apenas o secret store do backend e verificar logs de uso na conta. Confirmar com chave nova em ambiente de teste antes da produção.

## Testes executados e limitações

Resultados detalhados e comandos estão em [EXECUTION_EVIDENCE.md](EXECUTION_EVIDENCE.md). Em resumo: 129 testes unitários/mapper passaram; typechecks de backend e notificações passaram; mobile lint falhou; validação de schemas Prisma passou. Testes que limpam infraestrutura, E2E, broker real, ML pytest, deploy/webhook público e cobrança real não foram executados.

Não foram executadas requisições com credenciais Asaas, cobranças reais, alterações em produção ou migrations. `.env` não foi aberto. A conectividade e o estado publicado do Render/Dev Tunnel não foram verificados.

## Melhorias e ordem recomendada

1. **Imediato:** revogar/rotacionar a credencial Asaas compartilhada.
2. **Imediato:** corrigir o fail-safe dos testes de integração (RISK-001) antes de permitir que qualquer agente/CI os execute.
3. Corrigir validações do estado de booking em conclusão e cash confirmation (BUG-002/003), com transições concorrentes e consumidores financeiros cobertos.
4. Tornar o processamento de webhook reprocessável após falhas (RISK-002) e testar sem gateway real.
5. Corrigir precedência da rota de parcelamento e validar contrato consumido pelo mobile (BUG-001).
6. Definir estados elegíveis para início de deslocamento (BUG-006).
7. Corrigir TS2769 e validar o fluxo Expo Go no Android (BUG-005).
8. Alinhar defaults/modo do Compose e comprovar inicialização limpa (BUG-004).
9. Só então executar integrações contra Postgres/Redis explicitamente isolados; depois ampliar E2E, testes de falha e broker.

### Contagem

- Bugs confirmados: **6** — P1: 2 (BUG-002/003); P2: 4 (BUG-001/004/005/006); P0/P3/P4: 0.
- Riscos potenciais: **3** — P0: 1; P1: 2; P2: 0.
- Exposição operacional confirmada registrada como risco separado: credencial enviada na conversa; validade desconhecida.
- Execução automatizada: **129 testes passaram**, e um comando de lint/typecheck do mobile falhou. Detalhes e bloqueios em evidências.
