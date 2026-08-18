"""CLI de treino.

Treino é CLI e não endpoint HTTP de propósito: leva minutos, consome memória que
o dyno de serving não tem, e um endpoint de treino seria uma superfície de DoS
óbvia.

    python -m zelo_ml.training.train
    python -m zelo_ml.training.train --activate --backend db
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys

from ..data.loader import load_raw
from ..logging import configure_logging
from ..model.artifact import ModelBundle, make_version, save_to_db, save_to_file
from ..model.ranker import predict_scores, train_ranker
from ..settings import settings
from . import dataset as ds
from .baselines import BASELINES, PRIMARY_BASELINE
from .evaluate import EvalResult, evaluate_scorer, gate, render_markdown

logger = logging.getLogger(__name__)


def git_sha() -> str | None:
    try:
        return (
            subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Treina o recomendador do ZELO")
    parser.add_argument("--backend", choices=["file", "db"], default=settings.artifact_backend)
    parser.add_argument(
        "--activate", action="store_true", help="marca o artefato como ativo (só se o gate passar)"
    )
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=settings.random_seed)
    parser.add_argument(
        "--fail-under", action="store_true", help="sai com código 1 se o gate de avaliação reprovar"
    )
    args = parser.parse_args(argv)

    configure_logging(settings.log_level)

    if not settings.database_url:
        logger.error("ML_DATABASE_URL não definida")
        return 2

    raw = load_raw(settings.database_url)
    examples = ds.build_examples(raw)
    if len(examples) < 50:
        logger.error(
            "apenas %d exemplos com desfecho conhecido — rode `npm run prisma:seed:ml`",
            len(examples),
        )
        return 2

    train_examples, val_examples = ds.temporal_split(examples, args.validation_fraction)
    logger.info("split temporal: %d treino / %d validação", len(train_examples), len(val_examples))

    # Tudo o que o modelo "sabe" vem SÓ da janela de treino.
    cf = ds.fit_collaborative_from(train_examples, raw)
    stats = ds.compute_stats(train_examples)
    logger.info(
        "sinal colaborativo: %d clientes, %d profissionais, %d componentes; nota média global %.3f",
        len(cf.user_factors),
        len(cf.item_factors),
        cf.n_components,
        stats.global_rating_mean,
    )

    features, labels = ds.to_training_rows_blocked(train_examples, raw, stats)
    logger.info(
        "matriz de treino: %s, positivos=%d (%.1f%%)",
        features.shape,
        int(labels.sum()),
        100.0 * labels.mean(),
    )

    ranker = train_ranker(features, labels, random_state=args.seed)

    # ── Avaliação ────────────────────────────────────────────────────────
    n_providers = len(raw.providers)
    results: list[EvalResult] = [
        evaluate_scorer(
            val_examples,
            lambda _ex, matrix: predict_scores(ranker, matrix),
            cf,
            stats,
            "model",
            n_providers,
        )
    ]
    for name, fn in BASELINES.items():
        results.append(evaluate_scorer(val_examples, fn, cf, stats, name, n_providers))

    model_result = results[0]
    baseline = next(r for r in results if r.name == PRIMARY_BASELINE)
    passed, failures = gate(model_result, baseline)

    version = make_version(git_sha())
    summary = ds.describe(val_examples)
    summary["treino"] = len(train_examples)
    report = render_markdown(version, results, summary, passed, failures)

    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    (settings.reports_dir / f"eval-{version}.md").write_text(report, encoding="utf-8")
    (settings.reports_dir / f"eval-{version}.json").write_text(
        json.dumps({r.name: r.metrics for r in results}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    bundle = ModelBundle(
        version=version,
        ranker=ranker,
        collaborative=cf,
        stats=stats,
        metrics=model_result.metrics,
    )

    activate = args.activate and passed
    if args.backend == "db":
        if not settings.database_url:
            logger.error("backend=db exige ML_DATABASE_URL")
            return 2
        save_to_db(bundle, settings.database_url, activate=activate)
        where = "banco (MlModelArtifact)"
    else:
        # No backend de arquivo, `latest.txt` é o ponteiro do ativo. Só o
        # movemos se o gate passar — senão o serviço continuaria servindo um
        # modelo pior do que o anterior sem ninguém perceber.
        if activate or _no_current_artifact():
            path = save_to_file(bundle, settings.artifact_dir)
            where = str(path)
        else:
            settings.artifact_dir.mkdir(parents=True, exist_ok=True)
            path = settings.artifact_dir / f"model-{version}.joblib"
            from ..model.artifact import to_bytes

            path.write_bytes(to_bytes(bundle))
            where = f"{path} (INATIVO)"

    print(report)
    logger.info("artefato %s gravado em %s", version, where)

    if not passed:
        logger.error("gate de avaliação REPROVOU: %s", "; ".join(failures))
        if args.fail_under:
            return 1
    return 0


def _no_current_artifact() -> bool:
    return not (settings.artifact_dir / "latest.txt").exists()


if __name__ == "__main__":
    sys.exit(main())
