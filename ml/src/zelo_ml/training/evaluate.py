"""Avaliação offline.

Protocolo: para cada exemplo de validação, reconstruímos o conjunto de
candidatos daquela época, pontuamos e olhamos em que posição ficou o
profissional que o cliente de fato escolheu E aprovou.

Só exemplos POSITIVOS entram nas métricas de ranking. Premiar o modelo por
colocar no topo uma contratação que terminou cancelada ou com 2 estrelas seria
medir a coisa errada.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np

from ..features.builders import GlobalStats, build_feature_matrix
from ..model.collaborative import CollaborativeModel
from .baselines import BASELINES, PRIMARY_BASELINE
from .dataset import Example

logger = logging.getLogger(__name__)

K_VALUES = (1, 3, 5, 8, 20)

# ── Gate de release ───────────────────────────────────────────────────────
#: O modelo precisa superar a ordenação ATUAL do app por uma margem que
#: justifique um serviço a mais em produção.
NDCG_LIFT_REQUIRED = 1.15
HIT_RATE_GAIN_REQUIRED = 0.05
MIN_COVERAGE = 0.35


@dataclass
class EvalResult:
    name: str
    metrics: dict[str, float] = field(default_factory=dict)

    def get(self, key: str) -> float:
        return self.metrics.get(key, 0.0)


def evaluate_scorer(
    examples: list[Example],
    scores_fn,
    cf: CollaborativeModel | None,
    stats: GlobalStats,
    name: str,
    n_providers: int,
) -> EvalResult:
    ranks: list[int] = []
    all_scores: list[float] = []
    all_labels: list[int] = []
    top_providers: set[str] = set()
    top_distances: list[float] = []
    new_provider_hits = 0
    top_slots = 0

    for ex in examples:
        matrix = build_feature_matrix(
            client=ex.client,
            context=ex.context,
            candidates=ex.candidates,
            cf=cf,
            stats=stats,
            hired_provider_ids=ex.hired_provider_ids,
        )
        scores = np.asarray(scores_fn(ex, matrix), dtype=np.float64)
        scores = np.nan_to_num(scores, nan=-1e9)

        order = list(np.argsort(-scores, kind="stable"))

        # Métricas de diversidade valem para TODOS os exemplos: elas descrevem o
        # que o carrossel mostraria, não o acerto.
        for idx in order[:8]:
            cand = ex.candidates[idx]
            top_providers.add(cand.provider_id)
            top_slots += 1
            if cand.distance_km is not None:
                top_distances.append(cand.distance_km)
            if cand.tenure_days <= 60:
                new_provider_hits += 1

        # AUC pontual sobre todos os candidatos.
        for idx in range(len(ex.candidates)):
            all_scores.append(float(scores[idx]))
            all_labels.append(1 if (idx == ex.chosen_index and ex.label == 1) else 0)

        if ex.label != 1:
            continue
        ranks.append(order.index(ex.chosen_index) + 1)

    metrics: dict[str, float] = {}
    n = len(ranks)
    if n:
        for k in K_VALUES:
            hits = sum(1 for r in ranks if r <= k)
            metrics[f"hit_rate@{k}"] = hits / n
            metrics[f"precision@{k}"] = hits / (n * k)
            metrics[f"ndcg@{k}"] = sum(1.0 / math.log2(r + 1) for r in ranks if r <= k) / n
        metrics["mrr"] = sum(1.0 / r for r in ranks) / n
        metrics["mean_rank"] = float(np.mean(ranks))
        metrics["n_avaliados"] = float(n)

    metrics["auc"] = _roc_auc(all_scores, all_labels)
    metrics["coverage@8"] = len(top_providers) / max(1, n_providers)
    metrics["mean_distance@8"] = float(np.mean(top_distances)) if top_distances else math.nan
    metrics["new_provider_share@8"] = new_provider_hits / max(1, top_slots)

    return EvalResult(name=name, metrics={k: round(v, 4) for k, v in metrics.items()})


def _roc_auc(scores: list[float], labels: list[int]) -> float:
    """AUC via estatística de Mann-Whitney (evita depender do sklearn.metrics)."""
    positives = [s for s, y in zip(scores, labels, strict=True) if y == 1]
    negatives = [s for s, y in zip(scores, labels, strict=True) if y == 0]
    if not positives or not negatives:
        return float("nan")

    order = np.argsort(np.asarray(scores, dtype=np.float64), kind="stable")
    ranks = np.empty(len(scores), dtype=np.float64)
    sorted_scores = np.asarray(scores, dtype=np.float64)[order]

    # Empates recebem o rank médio, senão a AUC fica inflada quando muitos
    # candidatos têm exatamente o mesmo score (caso comum em `rating_desc`,
    # onde todo mundo sem avaliação vale 0.0).
    i = 0
    while i < len(sorted_scores):
        j = i
        while j + 1 < len(sorted_scores) and sorted_scores[j + 1] == sorted_scores[i]:
            j += 1
        average_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = average_rank
        i = j + 1

    positive_rank_sum = sum(ranks[i] for i, y in enumerate(labels) if y == 1)
    n_pos, n_neg = len(positives), len(negatives)
    return float((positive_rank_sum - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def gate(model: EvalResult, baseline: EvalResult) -> tuple[bool, list[str]]:
    """Aplica o gate de release. Devolve (passou, motivos das falhas)."""
    failures: list[str] = []

    base_ndcg = baseline.get("ndcg@8")
    model_ndcg = model.get("ndcg@8")
    if base_ndcg > 0 and model_ndcg < NDCG_LIFT_REQUIRED * base_ndcg:
        failures.append(
            f"NDCG@8 {model_ndcg:.4f} < {NDCG_LIFT_REQUIRED}× baseline ({base_ndcg:.4f})"
        )

    gain = model.get("hit_rate@5") - baseline.get("hit_rate@5")
    if gain < HIT_RATE_GAIN_REQUIRED:
        failures.append(f"ganho de hit-rate@5 {gain:+.4f} < {HIT_RATE_GAIN_REQUIRED} exigido")

    if model.get("coverage@8") < MIN_COVERAGE:
        failures.append(
            f"coverage@8 {model.get('coverage@8'):.4f} < {MIN_COVERAGE} "
            "(ranking colapsando em poucos profissionais)"
        )

    return not failures, failures


# ── Relatório ─────────────────────────────────────────────────────────────

REPORT_METRICS = (
    "ndcg@8",
    "ndcg@5",
    "hit_rate@5",
    "hit_rate@8",
    "precision@1",
    "mrr",
    "mean_rank",
    "auc",
    "coverage@8",
    "mean_distance@8",
    "new_provider_share@8",
)


def render_markdown(
    version: str,
    results: list[EvalResult],
    dataset_summary: dict[str, float | str],
    passed: bool,
    failures: list[str],
) -> str:
    baseline = next((r for r in results if r.name == PRIMARY_BASELINE), None)
    lines = [
        f"# Avaliação offline — `{version}`",
        "",
        "> **Estes números são lift offline sobre dados SINTÉTICOS.** O gerador",
        "> define a utilidade verdadeira e o modelo é avaliado contra o mesmo",
        '> gerador, então eles medem "o ranker recupera um logit conhecido a',
        '> partir de evidência ruidosa", e **não** ganho de conversão em',
        "> produção. O que importa aqui é a DISTÂNCIA para o baseline, não o",
        "> valor absoluto.",
        "",
        "## Conjunto",
        "",
        "| métrica | valor |",
        "| --- | ---: |",
    ]
    for key, value in dataset_summary.items():
        lines.append(f"| {key} | {value} |")

    lines += [
        "",
        "## Resultados",
        "",
        "| modelo | " + " | ".join(REPORT_METRICS) + " |",
        "| --- | " + " | ".join(["---:"] * len(REPORT_METRICS)) + " |",
    ]
    for result in results:
        cells = []
        for metric in REPORT_METRICS:
            metric_value: float | None = result.metrics.get(metric)
            cells.append(
                "—"
                if metric_value is None
                or (isinstance(metric_value, float) and math.isnan(metric_value))
                else f"{metric_value:.4f}"
            )
        marker = " **(modelo)**" if result.name == "model" else ""
        lines.append(f"| `{result.name}`{marker} | " + " | ".join(cells) + " |")

    model = next((r for r in results if r.name == "model"), None)
    if model and baseline and baseline.get("ndcg@8") > 0:
        lift = model.get("ndcg@8") / baseline.get("ndcg@8")
        lines += [
            "",
            f"**Lift de NDCG@8 sobre a ordenação atual do app: {lift:.2f}×** "
            f"(hit-rate@5 {baseline.get('hit_rate@5'):.4f} → {model.get('hit_rate@5'):.4f}).",
        ]

    lines += ["", "## Gate de release", ""]
    if passed:
        lines.append("PASSOU — artefato apto a ser ativado.")
    else:
        lines.append("**REPROVADO** — artefato gravado como inativo:")
        lines += [f"- {reason}" for reason in failures]

    return "\n".join(lines) + "\n"


__all__ = [
    "BASELINES",
    "EvalResult",
    "evaluate_scorer",
    "gate",
    "render_markdown",
]
