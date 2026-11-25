# Recomendação personalizada — model card

Documento de referência do serviço `ml/`: o que o modelo faz, com que dados
aprende, quanto ele vale, e onde ele **não** deve ser usado.

---

## 1. O problema

A ordenação de profissionais do ZELO era `ORDER BY "ratingAvg" DESC`
(`backend/src/services/providers.service.ts`). Isso tem dois defeitos concretos:

1. **Não é personalizada.** Todo cliente vê a mesma lista, independentemente do
   que já contratou, de onde mora ou de quanto costuma gastar.
2. **Pune quem é novo.** `ratingAvg` tem default `0.0`, então um profissional
   recém-cadastrado aparece **abaixo** de um profissional avaliado com 1 estrela.

O recomendador ataca os dois.

## 2. Arquitetura

```
App (Expo)                Backend (Node/Express)              Serviço ML (Python/FastAPI)
─────────                 ──────────────────────              ──────────────────────────
ForYouCarousel  ──GET──►  /recommendations/for-you
                          ├─ perfil do cliente (1 groupBy)
                          ├─ âncora geográfica (PostGIS)
                          ├─ candidatos (1 query, ≤150)  ──POST /v1/rank──►  features → SVD → ranker
                          │                              ◄──ids+scores+códigos──┘
                          ├─ hidrata DTO (serializeProvider)
                          └─ traduz códigos → pt-BR
                ◄─JSON──
      ──POST /events──►   telemetria (RecEvent)  ─────────────► retreino semanal
```

**Fronteira de dados:** o serviço Python recebe apenas ids e números. Nome,
e-mail, telefone e endereço nunca cruzam essa fronteira.

**O Node monta o DTO.** `serializeProvider()` continua fonte única do formato, e
os itens de `/for-you` são compatíveis com os de `GET /providers` — o app estende
o tipo `Provider` em vez de bifurcá-lo.

## 3. Modelo

| Componente | Escolha |
|---|---|
| Sinal colaborativo | `TruncatedSVD` (24 componentes) sobre a matriz cliente × profissional |
| Ranker | `HistGradientBoostingClassifier` com restrições de monotonicidade |
| Features | 47, congeladas em `features/names.py` |
| Artefato | ~340 KB (joblib), versionado `<timestamp>-<git sha>` |

**Por que não LightFM** (a escolha "óbvia" para recomendação híbrida): último
release em março de 2023, publica apenas sdist (build de extensão C) e tem
problemas conhecidos de instalação em Python 3.12+. Num free tier sem cache de
build, é falha de deploy esperando acontecer — e numa matriz desta escala o WARP
não compra nada mensurável sobre SVD. Se o catálogo passar de ~10⁵ usuários, o
caminho é `implicit` (ALS, com wheels publicadas), não LightFM.

**Por que HistGradientBoosting:** trata NaN nativamente (cliente sem histórico
legitimamente não tem sinal colaborativo — imputar zero seria inventar
informação), aceita restrições de monotonicidade, e cabe em segundos de treino.

**Restrições de monotonicidade** (`+1`): `p_rating_bayes`, `cf_score`,
`cat_affinity`, `geo_decay`, `p_available`, `p_verified`, `cxp_prior_completed`.
(`−1`): `geo_distance_km`. Elas garantem que "mais perto nunca é pior, tudo o
mais igual" — o que mantém as explicações mostradas ao usuário coerentes com o
ranking.

## 4. Rótulo

`y = 1` ⟺ o booking chegou a `COMPLETED` **e** (não teve avaliação **ou** teve
nota ≥ 4).

Ou seja: prevemos **escolha ponderada por satisfação**, não escolha crua. Um
booking concluído e avaliado com 2 estrelas é exemplo NEGATIVO, ainda que o
cliente tenha clicado nele — senão o modelo aprenderia a repetir os erros de
contratação do passado.

## 5. Resultados (validação temporal, últimos 20%)

| Modelo | NDCG@8 | hit-rate@5 | precision@1 | AUC | coverage@8 |
|---|---:|---:|---:|---:|---:|
| **Recomendador** | **0,3493** | **0,4614** | **0,1309** | **0,6552** | **0,8583** |
| `rating_desc` (ordenação atual do app) | 0,3000 | 0,3994 | 0,0821 | 0,6079 | 0,4833 |
| `bayes_geo` (heurística de fallback) | 0,3151 | 0,4151 | 0,1039 | 0,6218 | 0,7333 |
| `popularity` | 0,2589 | 0,3461 | 0,0663 | 0,5659 | 0,3333 |
| `distance_asc` | 0,2496 | 0,3121 | 0,0759 | 0,5458 | 0,9083 |

**Lift de 1,16× em NDCG@8 sobre a ordenação atual**, e hit-rate@5 sobe 6,2 pontos
percentuais. O `coverage@8` quase dobra (0,48 → 0,86): o carrossel mostra muito
mais profissionais distintos, o que importa num marketplace de dois lados.

> ### Estes números são lift offline sobre dados SINTÉTICOS
>
> O gerador (`backend/prisma/seed.ml.ts`) define a utilidade verdadeira e o
> modelo é avaliado contra o mesmo gerador. Eles medem **"o ranker recupera um
> logit conhecido a partir de evidência ruidosa"** — não ganho de conversão em
> produção. O que tem valor aqui é a **distância para o baseline**, não o valor
> absoluto. Mitigação embutida: a habilidade latente (`skill`) NUNCA vira coluna
> no banco; o modelo só vê as consequências ruidosas dela.

## 6. Gate de release

O treino grava o artefato como **inativo** e falha se qualquer condição abaixo
não for satisfeita:

- `NDCG@8 ≥ 1,15 × rating_desc`
- `hit-rate@5 ≥ rating_desc + 5 pontos percentuais`
- `coverage@8 ≥ 0,35` (impede o ranking de colapsar em poucos profissionais)

Um modelo pior que a ordenação atual **nunca chega ao usuário em silêncio**.

## 7. Dois vazamentos que a avaliação pegou

Vale registrar, porque os dois "funcionavam" e só apareceram por a avaliação
comparar contra um baseline honesto:

1. **`available` fora do conjunto de candidatos.** O gerador só envia bookings a
   profissionais disponíveis, mas o construtor de exemplos não filtrava por isso —
   então "estar disponível" virou um discriminador quase perfeito e artificial. O
   peso de `p_available` disparou para +3,27 e empurrou nota e recontratação para
   valores **negativos**. Corrigido filtrando `available` no treino **e** na
   geração de candidatos do Node.

2. **Sinal colaborativo ajustado sobre os próprios exemplos.** O SVD era treinado
   com todas as interações da janela de treino e depois usado para featurizar
   esses mesmos exemplos: o `cf_score` do profissional escolhido estava inflado
   pela escolha que se queria prever. Custava **−0,08 de NDCG@8**. Corrigido com
   fatoração em blocos cronológicos (`to_training_rows_blocked`): cada bloco é
   featurizado apenas com um SVD ajustado nos blocos anteriores.

## 8. Cold start e exploração

| Situação | Comportamento |
|---|---|
| Cliente com histórico | `strategy="ranker"`, features completas |
| Cliente com 0 bookings | `cf_*`, `price_band_fit` = NaN; conteúdo, geo e prior bayesiano sustentam o ranking |
| Cliente frio **e** sem âncora geográfica | `strategy="cold_start_popularity"` |
| Profissional com 0 avaliações | nota = média global (nunca 0); fator latente = centróide da categoria |
| Sem artefato treinado | `strategy="heuristic_fallback"`, HTTP **200** — o serviço nunca devolve 503 |

**Exploração ε-greedy (12%):** uma vaga do top-8 é reservada a um profissional
verificado com menos de 45 dias de casa, rotulado `NEW_TALENT`. Sem isso, quem
acaba de entrar nunca aparece ⇒ nunca é clicado ⇒ nunca ganha histórico ⇒ nunca
aparece. Esse laço de "rico fica mais rico" seca a oferta e é fatal num
marketplace.

## 9. Explicabilidade

Cada item traz até 2 motivos: `REHIRE`, `SAME_CATEGORY_HISTORY`, `NEARBY`,
`TOP_RATED`, `SIMILAR_CLIENTS`, `PRICE_FIT`, `VERIFIED`, `FAST_RESPONSE`,
`NEW_TALENT`.

São **códigos + números**, nunca texto — a cópia pt-BR vive em
`backend/src/constants/recommendations.ts`, então i18n fica numa camada só.

**Deliberadamente não usamos SHAP:** dependência pesada, ~10× a latência, e
atribuição por feature não vira texto honesto para quem quer contratar um
encanador ("p_rating_bayes contribuiu +0,03" não significa nada).

**Guarda de honestidade:** quando `strategy === 'fallback'`, o app não exibe
chip de justificativa. O produto não alega personalização que não aconteceu.

## 10. Resiliência

O backend **nunca** quebra por causa do serviço de ML:

- timeout (`ML_TIMEOUT_MS`), circuit breaker (3 falhas → 30 s sem tentar);
- qualquer falha vira `null` e cai em `listProviders({ sort: 'rating' })`;
- resposta fora do contrato é tratada como falha (Zod), não como dado válido.

Medido localmente com o serviço derrubado: **HTTP 200 em 30–50 ms**, com
`strategy: "fallback"`.

No Render free isso não é hipotético: o serviço hiberna após ~15 min e leva
30–60 s para acordar, então a primeira requisição do dia **vai** degradar. É
comportamento projetado, não acidente.

## 11. Operação

```bash
# treinar (local, artefato em arquivo)
cd ml && ML_DATABASE_URL=... .venv/bin/python -m zelo_ml.training.train --activate

# produção (artefato no Postgres) — o que o workflow semanal roda
python -m zelo_ml.training.train --backend db --activate --fail-under
```

Retreino: `.github/workflows/ml-train.yml`, segundas 06:00 UTC. Semanal é a
cadência honesta para o volume atual; com telemetria real acumulando em
`RecEvent`, migrar para diário.

**Fonte de rótulos:** hoje o proxy são os bookings. Quando houver volume de
telemetria real, `RecEvent ⋈ Booking` por `requestId` dá rótulos em nível de
impressão (positivo = CLICK/BOOKED, negativo = IMPRESSION sem CLICK).

## 12. Limitações conhecidas

- Métricas validadas apenas em dados sintéticos (§5).
- `p_category_match` e `geo_same_city` são constantes no treino atual (todos os
  candidatos vêm da categoria pedida e da mesma cidade) — só ganham utilidade
  quando houver mais de uma cidade.
- Sem calibração de probabilidade: o `score` serve para ordenar, não para ser
  lido como "chance de contratação".
- O fallback (`ratingAvg desc`) ainda afunda profissionais sem avaliação. Aplicar
  o prior bayesiano também na ordenação SQL é um follow-up natural.
- Feedback loop: o modelo é treinado sobre escolhas influenciadas por ele mesmo.
  A exploração ε-greedy e o gate de `coverage@8` mitigam, mas não eliminam.
