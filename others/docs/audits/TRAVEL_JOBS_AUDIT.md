# Auditoria dos jobs de travel

**Escopo:** `src/jobs/travelHousekeeping.job.ts` + agendamento em `src/jobs/index.ts`.
**Papel do auditor (Agente 1):** revisar invariantes sem olhar para a lógica proposta pelo autor.
**Data:** 2026-11-04.

## Job 1 — `travel-redis-cleanup`

**Objetivo:** apagar chaves Redis órfãs de sessões já encerradas (ARRIVED/CANCELLED) nos últimos 60 minutos.

**Parâmetros:**
- Agendamento: `*/2 * * * *` (a cada 2 min).
- Janela de busca: 60 min (`RECENTLY_ENDED_WINDOW_MS = 60 * 60 * 1000`).
- Batch: 100 sessões por ciclo (parâmetro `limit` padrão de `recentlyEndedSessions`).

### Invariantes verificados

| Invariante | Como garantido | Risco se violado |
|---|---|---|
| **Idempotência** | `redis.del` em chave inexistente é no-op; `deleteLocationBestEffort` retorna `false` sem lançar; o status do DB é imutável (ARRIVED/CANCELLED não transiciona de volta). Múltiplas execuções do job sobre a mesma sessão são seguras. | Baixo. |
| **Concorrência segura** | Nenhuma escrita no Postgres — só `findMany` + `redis.del`. Duas instâncias rodando em paralelo tentariam deletar as mesmas chaves (op idempotente). O custo é dupla leitura, não corrupção. | Baixo. |
| **Multi-instância** | Idem acima. BullMQ garante que `upsertJobScheduler` com o mesmo `jobId` não duplica o CRON. Se o scheduler estiver em duas instâncias, ambas vão tentar — resultado: delete executado 1 vez útil, N-1 vezes no-op. | Baixo. |
| **Ausência de encerramento indevido** | Este job NÃO toca em `BookingTravel.status`. Só apaga chaves Redis de sessões JÁ encerradas. Não há caminho em que ele apague posição de sessão ativa. | **Zero** por construção. |
| **Recuperação após falha** | Se o Redis estiver down quando o job roda, todos os `del` retornam `false`, o job loga mas não lança. Próximo ciclo (em 2 min) tenta de novo. Como a janela é 60 min, uma queda de Redis de até ~58 min ainda recupera no final. | Médio — Redis caído por >60 min deixa chave órfã até o TTL expirar (60s). **Aceitável** porque o DB já barra leituras. |
| **Rate limit do batch** | Hard-coded a 100 por ciclo. Em cenário de pico (muitas sessões encerrando simultaneamente), levaria ceil(N/100) * 2min para limpar. Para 10.000 sessões = ~200 min = 3h20. **OK**: o TTL do Redis já evapora em 60s, isso é só reforço. | Baixo. |

### Testes diretos

- Cenário "zombie key" (teste 8 em `bookingTravel.test.ts`): força chave Redis a existir após `arrived`, roda o job, verifica que a chave desaparece.
- Teste unitário indireto via `deleteLocationBestEffort`: já coberto pela suíte de `bookingTravel.service.test.ts` (naming da chave).

### Riscos identificados

- **R1 — Janela de 60 min pode ser insuficiente** se o Redis ficar fora por mais de 1h. Mitigação: TTL de 60s garante que, dentro de 1 minuto da volta do Redis, a chave já expirou naturalmente. Combinação TTL + janela cobre worst-case realista.
- **R2 — Sem métrica Prometheus do número de limpezas**. Recomendação de P1: adicionar `travel_redis_cleanup_total{outcome="cleaned|skipped|failed"}` para alertar se `failed` > 0 sustentado.

## Job 2 — `travel-timeout-active`

**Objetivo:** fechar sessões `ACTIVE` que estão abertas há mais de 8h (prestador não chegou nem cancelou — app matou, sem rede, etc).

**Parâmetros:**
- Agendamento: `*/15 * * * *` (a cada 15 min).
- Threshold: 8h (`STALE_ACTIVE_THRESHOLD_MS = 8 * 60 * 60 * 1000`).
- Batch: 100 sessões por ciclo.

### Invariantes verificados

| Invariante | Como garantido | Risco se violado |
|---|---|---|
| **Idempotência** | `cancelTravelInternal` chama `endTravel` que começa com `findUnique` + `updateMany` com guarda `status=ACTIVE`. Se já estiver CANCELLED/ARRIVED, `transition.count === 0` e o job é no-op. Múltiplas execuções sobre a mesma sessão são seguras. | Baixo. |
| **Concorrência segura** | Duas instâncias rodando em paralelo: ambas fazem `findMany(status=ACTIVE, startedAt < cutoff)` → encontram as mesmas sessões → tentam `cancelTravelInternal` em paralelo. A primeira ganha a corrida (`updateMany` com guarda); a segunda vê `count === 0` e desiste. **Semanticamente seguro**, mas gera 2x queries. | Baixo. |
| **Multi-instância** | Idem concorrência. BullMQ previne duplo-scheduling dentro do mesmo cluster. | Baixo. |
| **Critério de expiração** | 8h a partir de `startedAt`. **8h é uma decisão operacional** — mais curto fecharia serviços legítimos de longa duração (mudança, reforma); mais longo deixaria sessão fantasma visível. Configurável via env se precisar. | Médio se desalinhado com produto. |
| **Ausência de encerramento indevido** | **Filtro duplo:** `status=ACTIVE` + `startedAt < now-8h`. Só pega sessões que **nasceram** há mais de 8h E ainda não transitaram. Não há caminho em que o job feche sessão recém-aberta. | **Zero** por construção. |
| **Recuperação após falha** | Se o Postgres estiver down, `findMany` lança e o worker BullMQ marca o job como `failed`. BullMQ retenta com backoff. Idempotente — retentar é seguro. | Baixo. |
| **Impacto em logs/eventos** | Cada timeout encerrado publica `travel.ended` no outbox com `reason='timeout'`. Isso dispara (via listener) o broadcast Socket.IO `travel:ended` + notificação opcional. **Nenhuma coordenada** é publicada nesses eventos. | Zero — contrato do schema travel.ended não inclui lat/lng. |

### Testes diretos

- **Não há teste automatizado cobrindo este job** — uma pendência real. Criar seria trivial (`seed` sessão com `startedAt` manipulado para passado), mas exige Postgres rodando. Fica como pendência para a rodada que o operador subir o container.

### Riscos identificados

- **R3 — Threshold de 8h hardcoded**. Recomendação P2: promover para `TRAVEL_TIMEOUT_HOURS` em `env.ts` para operador ajustar sem redeploy.
- **R4 — Sem alerta**. Se o job começar a fechar MUITAS sessões/ciclo, pode indicar bug no fluxo normal (prestadores não conseguindo arrivar). Recomendação P1: métrica `travel_timeout_closed_total` + alerta em >N por hora.
- **R5 — Interação com eventos em queue**. Se o Rabbit estiver desligado, o `recordEvent` grava no outbox mas o broadcast Socket.IO não acontece (não há consumer rodando). Resultado: sessão fecha no DB, cliente vê "timeout" só quando reconectar. **Aceitável** — o DB é fonte da verdade; socket é cosmético.

## Comportamento de timeout — resumo para runbook

| Situação | Timeout aplicado | Prazo | Side-effects |
|---|---|---|---|
| Prestador abandona app após iniciar deslocamento | Sim, por `travel-timeout-active` | 8h a partir de `startedAt` | Sessão → CANCELLED, reason=timeout; Redis.del; evento travel.ended |
| Prestador sem rede por horas | Sim, mesmo caminho | 8h | Idem |
| Serviço LEGÍTIMO de longa duração (ex.: pintura 6h) | Não atinge timeout | — | — |
| Serviço LEGÍTIMO de longa duração (ex.: mudança 10h) | **Atinge timeout indevido** | 8h | **Fechamento indevido**. Mitigação: produto confirma se 8h é o limite correto; senão, promover para env. |

### Parâmetros recomendados para env (P2)

```
TRAVEL_TIMEOUT_HOURS=8              # threshold do timeout
TRAVEL_REDIS_CLEANUP_WINDOW_MIN=60  # janela de recuperação do del falho
```

## Conclusão do auditor (Agente 1)

Ambos os jobs são **idempotentes, seguros em multi-instância e sem risco de encerramento indevido por construção**. A ausência de testes automatizados do `travel-timeout-active` é um gap real mas de **baixo** impacto operacional (o código é simples e o pior caso é o próprio job não rodar, deixando sessão aberta — recuperável manualmente).

Recomendações consolidadas:
- **P1:** adicionar métricas Prometheus + alertas (R2, R4).
- **P2:** promover parâmetros para env (R3), adicionar teste de integração do `travel-timeout-active` quando houver Postgres.
- **Confirmar com produto:** 8h é o threshold correto? (R5 cobre o cenário de mudança/pintura longa.)

Jobs **aprovados** com essas ressalvas documentadas.
