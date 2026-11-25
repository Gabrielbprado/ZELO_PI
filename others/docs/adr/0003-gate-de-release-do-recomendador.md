# 0003 — Gate de release do recomendador

**Status:** Aceita · retroativo

## Contexto

O recomendador é um modelo treinado (SVD colaborativo) que pode piorar entre versões. Um
modelo ruim em produção degrada silenciosamente a Home — o pior tipo de falha, porque
ninguém vê um erro, só métricas caindo depois.

## Decisão

Um **gate de release**: o treino só ativa um artefato novo se ele bate o baseline nas
métricas de avaliação; o relatório vai para `ml/reports/` e o contrato de ranking
(`ml/contracts/rank.schema.json`) é regenerado e comparado no CI, que **falha em caso de
diff** não intencional. O artefato ativo mora no Postgres (o filesystem do Render free é
efêmero), e o serviço faz *poll* dele para trocar de modelo sem redeploy.

## Consequências

- **A favor:** nunca se promove um modelo pior que o atual; a troca de modelo é
  quente (poll), sem downtime; o contrato backend↔ML é verificado automaticamente.
- **Contra:** mais cerimônia no pipeline de treino; o artefato no banco acopla o serviço
  Python ao schema do Prisma (mitigado: o Python só faz SELECT/INSERT do blob).
