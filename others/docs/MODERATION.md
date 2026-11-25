# Moderação assistida por IA

Denúncias de **perfis, serviços e conversas**, classificadas automaticamente e decididas
por um administrador — com a IA autorizada a agir sozinha nos casos em que errar sai mais
caro do que esperar.

## O fluxo

```
usuário denuncia ──▶ POST /reports ──▶ backend monta o contexto ──▶ ml/ POST /v1/moderate
                                            │                              │
                                            │                       categoria, gravidade,
                                            │                       prioridade, confiança,
                                            │                       sinais, ação sugerida
                                            ▼                              │
                              veredito gravado na denúncia ◀────────────────┘
                                            │
                        auto_enforce? ──sim──▶ applyAction(actorId = null)   ← a IA age
                                            │
                                           não
                                            ▼
                              fila /admin/reports (ordenada por prioridade)
                                            │
                                            ▼
                        applyAction(actorId = admin)   ← a pessoa decide (e pode desfazer)
```

Os dois caminhos passam pelo **mesmo** `applyAction`. É isso que garante que uma suspensão
automática e uma manual produzam o mesmo estado, a mesma linha de histórico, a mesma
auditoria e a mesma notificação.

## O que a IA decide

O classificador vive em `ml/src/zelo_ml/moderation/` e é servido em `POST /v1/moderate`
(mesmo token e mesmo circuit breaker do ranking).

| Saída | O que é |
|---|---|
| `category` | FRAUD · SPAM · INAPPROPRIATE · HARASSMENT · SAFETY · OFF_PLATFORM · NONE |
| `severity` | LOW · MEDIUM · HIGH · CRITICAL |
| `priority` | 0–100 — a ordem da fila do admin |
| `confidence` | 0–1 |
| `action` | consequência sugerida |
| `auto_enforce` | se o backend deve aplicar a ação sozinho |
| `signals` | **por que** — os termos casados e os sinais comportamentais |

Entradas: o motivo escolhido, a descrição, trechos do que foi denunciado (mensagens do
alvo, título/descrição do serviço), o número de evidências, e contadores de comportamento
(denunciantes distintos em 30d, advertências e suspensões anteriores, idade da conta,
serviços concluídos, denúncias abertas pelo denunciante em 7d).

**É um classificador lexical + sinais, não um modelo treinado.** Modelo supervisionado
precisa de denúncias rotuladas, e um produto que acabou de ligar a moderação não tem
nenhuma — é este fluxo que as produz. Caminho de upgrade e limiares estão documentados no
cabeçalho de `classifier.py`.

## Os guarda-corpos

Duas assimetrias definem os limiares:

1. **Errar bloqueando é pior que errar deixando passar.** Bloqueio indevido tira o
   sustento de um profissional; denúncia que espera 6h por um humano custa 6h.
2. **Denúncia é uma arma.** Quem denuncia muita gente em poucos dias pode estar
   retaliando.

Em regra:

- Auto-suspensão e auto-bloqueio exigem `confidence ≥ 0.85` **e** corroboração
  (denunciantes distintos) ou evidência anexada. A palavra de uma pessoa só, sem anexo,
  nunca bloqueia sozinha.
- `reporter_reports_7d ≥ 5` (denúncia em massa) trava a ação automática e derruba a
  prioridade — o caso vai para um humano.
- `ACCEPT` e `REJECT` **nunca** são automáticos: arquivar é juízo de mérito, e o falso
  negativo silencioso não deixa rastro para ninguém revisar.
- Administradores não podem ser suspensos nem bloqueados pela moderação.
- Serviço de IA fora do ar ⇒ a denúncia fica com os campos `ai*` **nulos**. Nulo é "não
  triada", não "sem problema": ela sobe no topo da fila do admin. Nenhuma denúncia é
  arquivada por falta de IA, e nenhuma punição acontece sem veredito.

## As decisões e o que cada uma faz

| Ação | Efeito | Notifica |
|---|---|---|
| `ACCEPT` | denúncia → RESOLVED | ninguém |
| `REJECT` | denúncia → DISMISSED | ninguém |
| `REQUEST_INFO` | denúncia → AWAITING_INFO | o **denunciante** |
| `WARN` | só registro | o alvo |
| `SUSPEND` | `suspendedUntil`, sessões revogadas, login recusado até a data | o alvo |
| `BLOCK` | `isActive = false`, sessões revogadas, perfil sai das buscas | o alvo |
| `UNBLOCK` | reativa e limpa a suspensão | o alvo |

`ACCEPT`/`REJECT` não notificam de propósito: o resultado de uma denúncia contra alguém
não é dessa pessoa — contar seria entregar quem denunciou.

`suspendedUntil` é uma coluna separada de `lockedUntil` (o bloqueio por tentativas de
senha, zerado no primeiro login bem-sucedido). Se dividissem a mesma coluna, acertar a
senha apagaria uma suspensão de 7 dias.

Toda notificação de decisão automática se identifica como automática e aponta o suporte —
moderação por máquina que a pessoa não consegue contestar é caixa-preta.

## Histórico

Duas trilhas, com propósitos diferentes:

- **`ModerationAction`** — a linha do tempo do caso, incluindo o registro `AI_CLASSIFIED`
  com os sinais e a confiança daquela análise. `actorId = null` é a assinatura da IA.
- **`AuditLog`** — a trilha administrativa geral (`MODERATION_*`), junto de KYC e do resto.

O veredito guarda `aiModelVersion`: sem ele, uma decisão antiga não teria como ser
explicada depois que os pesos mudassem.

## Endpoints

| Método | Rota | Quem |
|---|---|---|
| `POST` | `/reports` | qualquer autenticado |
| `GET` | `/admin/reports?status=` | ADMIN — fila por prioridade |
| `GET` | `/admin/reports/:id` | ADMIN — veredito, sinais, evidências e histórico |
| `POST` | `/admin/reports/:id/action` | ADMIN — a decisão |
| `POST` | `/admin/reports/:id/reanalyze` | ADMIN — reexecuta a IA |
| `PATCH` | `/admin/reports/:id` | ADMIN — só muda o status |
| `GET` | `/admin/users/:id/moderation` | ADMIN — histórico do usuário |

No app: ícone de bandeira no perfil do profissional, em cada linha da tabela de preços, no
cabeçalho da conversa e no detalhe do agendamento. O painel fica em Perfil → **Moderação de
denúncias** (só ADMIN).

## Limites conhecidos

- **Evidências são referências (links), não upload.** Mesma decisão do KYC — o projeto não
  tem storage de arquivos.
- **A triagem é síncrona na criação da denúncia.** Quem denuncia espera ~1s a mais, e em
  troca uma ameaça corroborada pode ser bloqueada na hora. O custo é limitado pelo timeout
  (`ML_MODERATION_TIMEOUT_MS`) e pelo circuit breaker. Se isso virar problema, o caminho é
  um evento `report.created` com consumidor próprio.
- **O token de acesso já emitido sobrevive até expirar.** Suspender e bloquear revogam os
  refresh tokens, então a sessão morre no próximo refresh — não instantaneamente.
- **O léxico é pt-BR.** Denúncia em outro idioma cai em `NONE` e vai para o humano.
