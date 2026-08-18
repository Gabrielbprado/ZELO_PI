"""Contrato de features.

A ORDEM desta tupla é parte do artefato serializado. Reordenar, inserir no meio
ou renomear invalida todo modelo já treinado — por isso a lista é gravada dentro
do bundle e conferida no carregamento (`model/artifact.py`), e há um teste de
snapshot que quebra o CI se ela mudar sem intenção.

Ao adicionar uma feature: acrescente NO FIM, treine de novo, e deixe o artefato
antigo ser recusado pela checagem de compatibilidade.
"""

from __future__ import annotations

FEATURE_NAMES: tuple[str, ...] = (
    # ── Prior de qualidade (bayesiano) ──────────────────────────────────
    "p_rating_bayes",
    "p_rating_count_log",
    "p_completion_rate",
    "p_cancel_rate",
    # ── Conteúdo do profissional ────────────────────────────────────────
    "p_years_exp",
    "p_jobs_done_log",
    "p_price_from_log",
    "p_verified",
    "p_available",
    "p_category_count",
    "p_tenure_days_log",
    "p_service_price_median_log",
    # ── Colaborativas (cliente × profissional) ──────────────────────────
    "cf_score",
    "cf_rank_pct",
    "cxp_prior_bookings",
    "cxp_prior_completed",
    "cxp_days_since_last",
    "item_knn_score",
    # ── Afinidade de categoria ──────────────────────────────────────────
    "cat_affinity",
    "cat_affinity_rank",
    "p_category_match",
    "p_category_specialization",
    # ── Faixa de preço ──────────────────────────────────────────────────
    "price_band_fit",
    "price_vs_candidate_median",
    "price_percentile_in_candidates",
    # ── Geográficas ─────────────────────────────────────────────────────
    "geo_distance_km",
    "geo_decay",
    "geo_same_neighborhood",
    "geo_same_city",
    "geo_rank_pct",
    # ── Comportamento do cliente ────────────────────────────────────────
    "c_booking_count_log",
    "c_days_since_last_booking",
    "c_distinct_categories",
    "c_avg_ticket_log",
    "c_is_cold",
    # ── Contexto e sazonalidade ─────────────────────────────────────────
    "ctx_urgency_ord",
    "ctx_hour_sin",
    "ctx_hour_cos",
    "ctx_dow_sin",
    "ctx_dow_cos",
    "ctx_month_sin",
    "ctx_month_cos",
    "p_urgency_fit",
    # ── Responsividade ──────────────────────────────────────────────────
    "p_accept_rate",
    "p_median_response_hours",
    # ── Nota crua (acrescentada depois da primeira avaliação offline) ───
    # `p_rating_bayes` é a POLÍTICA certa (não pune quem é novo), mas sozinha é
    # uma feature preditiva pior: ao puxar quem não tem avaliação para a média
    # global, ela apaga o sinal "não tem histórico" — que na prática é o que
    # mais separa quem é contratado de quem não é. A primeira avaliação offline
    # mostrou o modelo perdendo para `ratingAvg desc` justamente por isso.
    # Reconstruir o valor cru a partir de (bayes, count) exigiria uma interação
    # que a restrição de monotonicidade proíbe, então damos as DUAS ao modelo e
    # deixamos ele decidir quando cada uma vale.
    "p_rating_avg_raw",
    "p_has_reviews",
)

N_FEATURES = len(FEATURE_NAMES)

FEATURE_INDEX: dict[str, int] = {name: i for i, name in enumerate(FEATURE_NAMES)}

#: Colunas em que NaN é um valor LEGÍTIMO (ausência de informação, não erro).
#: Cliente sem histórico não tem sinal colaborativo nem ticket médio; sem
#: âncora geográfica não há distância. HistGradientBoosting trata NaN
#: nativamente, então não imputamos — imputar seria inventar um valor e mentir
#: para o modelo.
NULLABLE_FEATURES: frozenset[str] = frozenset(
    {
        "cf_score",
        "cf_rank_pct",
        "cxp_days_since_last",
        "item_knn_score",
        "price_band_fit",
        "geo_distance_km",
        "geo_decay",
        "geo_rank_pct",
        "c_days_since_last_booking",
        "c_avg_ticket_log",
        "p_median_response_hours",
        "p_service_price_median_log",
    }
)

#: Restrições de monotonicidade passadas ao HistGradientBoostingClassifier.
#: Garantem que "mais perto nunca é pior, tudo o mais igual" e que nota melhor
#: nunca reduz o score. Sem isso o modelo pode aprender artefatos do gerador
#: sintético e produzir explicações que contradizem o ranking mostrado.
_MONOTONIC: dict[str, int] = {
    "p_rating_bayes": 1,
    "cf_score": 1,
    "cat_affinity": 1,
    "geo_decay": 1,
    "p_available": 1,
    "p_verified": 1,
    "cxp_prior_completed": 1,
    "geo_distance_km": -1,
}


def monotonic_constraints() -> list[int]:
    """Vetor de restrições alinhado a ``FEATURE_NAMES``."""
    return [_MONOTONIC.get(name, 0) for name in FEATURE_NAMES]
