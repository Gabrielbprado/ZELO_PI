# Critérios PASS/FAIL dos Lotes A, B e C — definidos pelo Agente 1 antes da implementação

**Regra:** critérios abaixo são imutáveis. Teste que passa por outro caminho que não o especificado é FAIL. "Comprovar" significa assert programático, não log inspecionado a olho.

## Lote A — AMQP end-to-end

### A.1 — Publicação pelo Outbox Relay
- **PASS:** depois de uma operação de domínio que emite `TRAVEL_STARTED`, a linha `OutboxEvent` correspondente é criada com `publishedAt=null`. Depois de `drainOutboxOnce()`, a mesma linha tem `publishedAt!=null`. O fluxo **não** passa por chamada direta ao publisher — tem que usar `drainOutboxOnce` (que é o relay real).
- **FAIL:** qualquer bypass do relay; qualquer uso de `recordEvent` + leitura imediata sem o drain.

### A.2 — Roteamento até o consumer
- **PASS:** o consumer `travel.consumer` registrado via `startConsumer(travelConsumer)` recebe a mensagem através do broker e aplica o efeito esperado (ex.: `travel.started` dispara broadcast Socket.IO; `travel.ended` dispara broadcast + `redis.del`). Verificar pela presença do registro em `ProcessedEvent` (consumer='travel', eventId=outboxId).
- **FAIL:** `ProcessedEvent` nunca é criado; `consumer.handle` é chamado diretamente.

### A.3 — Idempotência (redelivery)
- **PASS:** uma segunda entrega do MESMO evento (mesmo `messageId`) resulta em `eventsConsumed{result: 'duplicate'}` sem duplicar efeito colateral. Verificar que `ProcessedEvent` continua com exatamente 1 linha para o par `(travel, eventId)`.
- **FAIL:** segunda entrega cria 2ª linha em `ProcessedEvent`, ou re-dispara efeito.

### A.4 — Verificar efeito do `travel.ended`
- **PASS:** depois de encerrar sessão via `arrivedTravel()`, o consumer processa `travel.ended` e: (a) tenta `redis.del` da chave; (b) emite `travel:ended` no Socket.IO (verificável se houver cliente escutando OU indiretamente via mock da função `broadcastTravelEnded`). Como Socket.IO global é singleton, teste pode conectar cliente real e asserar recebimento.
- **FAIL:** chave Redis sobrevive; cliente não recebe broadcast.

### A.5 — ACK/NACK em falha
- **PASS:** payload inválido (schema fora do contrato) vai para DLQ, com `channel.ack` da fila original — verificado por mensagem em `QUEUE_DLQ` e ausência de reentrega. Teste publica mensagem diretamente com payload malformado via canal auxiliar.
- **FAIL:** mensagem fica na fila original esperando reentrega infinita, OU é descartada sem DLQ.

### A.6 — Não usar bypass
- **Critério transversal.** Qualquer chamada direta a `travelConsumer.handle(...)` dentro do teste é FAIL. O único caminho válido é publicar via outbox + drain + consumer registrado.

## Lote B — `travel-timeout-active`

### B.1 — ACTIVE < 8h não é fechada
- **PASS:** sessão com `startedAt = now - 1h`, status ACTIVE. Após rodar o job, status continua ACTIVE. Nenhum evento `travel.ended` novo no outbox.
- **FAIL:** status muda, ou evento é emitido.

### B.2 — ACTIVE > 8h é fechada com `reason=timeout`
- **PASS:** sessão com `startedAt = now - 9h`, status ACTIVE. Após job, status=CANCELLED, `endReason='timeout'`, `endedAt!=null`. Um `OutboxEvent` com `routingKey='travel.ended'` e `payload.reason='timeout'` existe.
- **FAIL:** qualquer desses asserts falha.

### B.3 — ARRIVED > 8h é ignorada
- **PASS:** sessão com `startedAt = now - 10h`, status ARRIVED. Job é no-op nela — status/arrivedAt/endedAt inalterados. Nenhum novo `travel.ended` emitido.
- **FAIL:** job toca a sessão.

### B.4 — CANCELLED > 8h é ignorada
- **PASS:** idem B.3 para CANCELLED.
- **FAIL:** job toca.

### B.5 — Execução duplicada é idempotente
- **PASS:** rodar `travelTimeoutActive()` duas vezes seguidas sobre o mesmo cenário B.2. Resultado final: exatamente 1 transição efetiva, exatamente 1 `travel.ended` no outbox, segunda chamada do job retorna `{ closed: 0 }`.
- **FAIL:** duplicação de evento ou de transição.

### B.6 — Duas instâncias executam o job simultaneamente
- **PASS:** `Promise.all([travelTimeoutActive(), travelTimeoutActive()])` sobre o cenário B.2. Resultado final: 1 transição, 1 `travel.ended`. **Nenhuma** execução deve lançar exceção visível no caller — se houver P2002 ou constraint race interna, o job trata.
- **FAIL:** 2 transições (impossível pelo updateMany com guarda), 2 eventos, ou exceção propagada.

## Lote C — Documento sobre limite 8h

### C.1 — Comportamento atual
- **PASS:** documento contém: (a) valor atual = 8h; (b) consequência observável (sessão vira CANCELLED com `reason=timeout`, evento emitido, chave Redis apagada); (c) referência ao código-fonte (`travelHousekeeping.job.ts`, constante `STALE_ACTIVE_THRESHOLD_MS`).
- **FAIL:** qualquer item faltando.

### C.2 — Consequências para serviços longos
- **PASS:** lista concreta de casos onde 8h é curto (mudança, reforma, limpeza pesada) com **estimativa realista de prevalência**. Explicação do UX resultante (prestador vê encerramento inesperado; cliente perde live tracking; booking em si segue vivo).
- **FAIL:** só diz "pode afetar serviços longos" sem concretizar.

### C.3 — Alternativas
- **PASS:** apresenta ≥ 3 alternativas: (a) promover para env var; (b) threshold por categoria do booking; (c) extender automaticamente quando o prestador está se movimentando; (d) outra opção a critério. Para cada, custo de implementação e trade-off.
- **FAIL:** < 3 alternativas ou sem trade-off.

### C.4 — Recomendação
- **PASS:** recomendação técnica explícita + justificativa + sinalização clara de que **decisão de produto é obrigatória** antes de implementar.
- **FAIL:** recomendação ambígua ou que implica mudança sem aprovação.

### C.5 — Não alteração do código
- **PASS:** nenhuma edição em `travelHousekeeping.job.ts` ou `env.ts` referente ao threshold.
- **FAIL:** qualquer edição.

---

**Compromisso do Agente 1:** vou conferir cada critério acima com evidência REAL de execução (output de teste, diff git, grep por palavra-chave). Quem lê o veredito final deve conseguir rastrear cada PASS para um artefato verificável.
