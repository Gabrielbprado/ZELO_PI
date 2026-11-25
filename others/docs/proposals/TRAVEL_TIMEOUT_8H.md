# Proposta — Limite de 8h do `travel-timeout-active`

**Status:** aguardando decisão de produto · **Impacto se alterado:** UX de serviços longos · **Risco se mantido:** encerramento inesperado de sessão para serviços > 8h · **Não altera código nesta rodada.**

## 1. Comportamento atual

- **Threshold:** 8 horas a partir de `BookingTravel.startedAt`.
- **Local no código:** `backend/src/jobs/travelHousekeeping.job.ts` linha 32:
  ```ts
  const STALE_ACTIVE_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8h
  ```
- **Cadência do job:** a cada 15 minutos (`*/15 * * * *` em `backend/src/jobs/index.ts`).
- **O que acontece quando dispara:**
  1. Sessão `BookingTravel` passa de `ACTIVE` para `CANCELLED` com `endReason='timeout'`, `endedAt=now`.
  2. Evento `travel.ended` é publicado no outbox com `reason='timeout'`.
  3. O consumer `travel.consumer` consome o evento e:
     - Apaga a chave Redis `zelo:travel:{bookingId}:location`.
     - Faz broadcast `travel:ended` para a sala Socket.IO.
  4. Cliente mobile (quando conectado) reage ao broadcast e fecha o mapa.

**Importante:** o timeout **não afeta o Booking em si**. O serviço (agendamento) continua vivo e o prestador pode marcar conclusão por outros fluxos — só a sessão de rastreamento em tempo real é encerrada.

**Evidência:** teste B.2 em `bookingTravel.timeout.test.ts` demonstra o comportamento completo contra DB real.

## 2. Consequências para serviços longos

### Casos onde 8h é insuficiente

Estimativa de prevalência baseada em categorias do seed (`backend/prisma/seed.ts` lista: encanador, eletricista, diarista, pintor, pedreiro, montador, jardineiro, chaveiro):

| Categoria | Duração típica | Timeout 8h é problema? |
|---|---|---|
| Chaveiro | 15 min – 1 h | Não |
| Encanador (reparo pontual) | 30 min – 2 h | Não |
| Eletricista (reparo) | 30 min – 2 h | Não |
| Diarista (limpeza padrão) | 3 – 6 h | Marginal — próximo do limite |
| Diarista pesada / pós-obra | 6 – 10 h | **Sim, atinge timeout** |
| Pintura de 1 cômodo | 4 – 8 h | Marginal |
| Pintura de casa inteira | 2 – 5 **dias** | **Sim, gritante** |
| Mudança residencial | 4 – 12 h | **Sim, frequente** |
| Jardinagem grande | 4 – 8 h | Marginal |
| Montagem de móveis complexos | 2 – 6 h | Marginal |

**Conclusão de impacto:** cerca de **30–40% dos agendamentos possíveis no catálogo atual têm chance real de atingir o timeout**. Para esses casos, o prestador verá a sessão encerrar no meio do serviço; o cliente verá o mapa "congelar" e, se o mobile tratar o `travel:ended`, verá modal de "deslocamento encerrado" apesar de o profissional ainda estar no local. UX ruim e confusa.

**Observação:** hoje a feature de GPS **nem está conectada no mobile** (Etapa 3 bloqueada), então o impacto é **zero em produção** enquanto a Etapa 3 não acontecer. Mas o problema precisa estar resolvido antes do lançamento mobile.

### Semântica implícita do threshold

O valor 8h assume que **a sessão de rastreamento cobre só o DESLOCAMENTO até o cliente**, não o serviço todo. Isto é consistente com o modelo (`ACTIVE` = "a caminho"; `ARRIVED` = "chegou"). Um prestador diligente marca `arrived` logo que chega, e nunca atinge 8h.

O caso-limite é o prestador que esquece de marcar `arrived` e segue fazendo o serviço. Neste cenário:
- 8h é **adequado** se a maioria dos deslocamentos leva < 2h (margem de 4×).
- 8h é **excessivo** para deslocamentos urbanos típicos (< 1h) — poderia ser mais curto para fechar sessões abandonadas mais rápido.
- 8h é **insuficiente** se for comum deslocamentos intermunicipais com trânsito > 4h.

## 3. Alternativas

### Alternativa 1 — Promover para env var (TRAVEL_TIMEOUT_HOURS)

**Como:** substituir o literal `8 * 60 * 60 * 1000` por `env.TRAVEL_TIMEOUT_HOURS * 60 * 60 * 1000`, com default 8h.

**Custo:** < 1h. Toca `env.ts`, `travelHousekeeping.job.ts` e a documentação.

**Trade-off:**
- ✅ Operador ajusta por ambiente (staging pode ter 1h para teste rápido).
- ✅ Decisão pode ser revertida sem redeploy.
- ❌ Ainda é valor global — serviço de limpeza pesada e de reparo compartilham o mesmo número.
- ❌ Se o operador esquecer, continua 8h.

### Alternativa 2 — Threshold por categoria do Booking

**Como:** campo opcional em `Category` (ex.: `travelTimeoutHours Int?`) que sobrescreve o default. Job consulta por categoria na hora de filtrar.

**Custo:** 1–2 dias. Migration + ajuste no query do job + telaadmin para configurar + seed atualizado.

**Trade-off:**
- ✅ Cada tipo de serviço tem seu limite realista.
- ✅ Previne encerramento indevido para pintura/mudança.
- ❌ Complexidade extra: mais um campo pra configurar, mais um ponto de bug.
- ❌ Produto precisa definir o valor para cada categoria.

### Alternativa 3 — Estender timeout automaticamente quando há movimento

**Como:** job verifica `receivedAt` da última posição no Redis. Se houve update nos últimos N minutos, a sessão é "viva" e o timeout **conta a partir do último update**, não de `startedAt`.

**Custo:** 2–3 dias. Precisa consultar Redis dentro do job (atualmente só toca Postgres); se Redis cair, cai para o comportamento atual. Métrica nova para monitorar.

**Trade-off:**
- ✅ Serviços longos com GPS ativo **nunca** atingem timeout indevido.
- ✅ Serviços abandonados (prestador desligou o app) são fechados rápido.
- ❌ Requer Redis disponível no momento do job.
- ❌ Lógica mais complexa; mais superfície de bug.

### Alternativa 4 — Timeout baseado em `arrivedAt` previsto

**Como:** se o booking tiver `scheduledAt` (que é opcional), calcular timeout como `scheduledAt + 1h buffer`. Caso contrário, cai no default global.

**Custo:** 1 dia.

**Trade-off:**
- ✅ Alinhado com a expectativa do cliente (ele agendou pra 14h, prestador chegar depois das 15h é anomalia).
- ❌ Requer `scheduledAt` preenchido — nem sempre está.
- ❌ Ainda não resolve o caso de serviço longo (prestador CHEGA no horário, mas o SERVIÇO dura muito).

## 4. Recomendação técnica

**Curto prazo (antes da Etapa 3):** adotar a **Alternativa 1** — promover para env var com default 8h. Custo baixo, destrava a Etapa 3 sem introduzir complexidade. Operador pode ajustar com segurança em staging antes de abrir para usuários.

**Médio prazo (após 3 meses de produção):** reavaliar com dados reais. Se os logs mostrarem > 5% de `travel.ended{reason=timeout}` por mês, migrar para **Alternativa 3** (threshold adaptativo por movimento), que é a mais robusta semanticamente.

**Não recomendo** Alternativa 2 (por categoria) agora — adiciona superfície de configuração antes de haver dados que justifiquem. Reconsiderar se catálogo crescer em diversidade.

## 5. Decisão de produto obrigatória

- [ ] **Decisão:** manter 8h fixo | adotar Alternativa 1 | adotar outra | aguardar dados.
- [ ] **Se Alternativa 1:** valor default? (recomendação: 8h; alternativas defensáveis: 6h ou 12h.)
- [ ] **Autorização para implementar:** sim | não.

## 6. O que NÃO foi alterado nesta rodada

- `backend/src/jobs/travelHousekeeping.job.ts` permanece intocado. `grep "STALE_ACTIVE_THRESHOLD_MS"` mostra a constante original.
- `backend/src/config/env.ts` permanece sem `TRAVEL_TIMEOUT_HOURS`.
- Testes B.1 a B.6 assumem exatamente o comportamento atual (8h hardcoded) e passam contra ele.
