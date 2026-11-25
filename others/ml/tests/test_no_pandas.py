"""Guarda de memória do dyno free.

O caminho de serving não pode depender de pandas: ele custa 70–100 MB
residentes e o plano free do Render dá 512 MB no total, já ocupados por
numpy + scipy + scikit-learn + fastapi.

Um teste ingênuo (`"pandas" not in sys.modules`) NÃO serve: no ambiente de
desenvolvimento pandas está instalado e o `sklearn.utils.fixes` o importa
oportunisticamente, então o teste falharia sem que houvesse problema algum.

O que realmente reproduz produção é BLOQUEAR o import e verificar que a
aplicação sobe e pontua mesmo assim — que é exatamente a condição do dyno, onde
`requirements.txt` não instala pandas.
"""

from __future__ import annotations

import subprocess
import sys
import textwrap

SCRIPT = textwrap.dedent(
    """
    import sys

    class BloqueiaPandas:
        def find_spec(self, name, path=None, target=None):
            if name == "pandas" or name.startswith("pandas."):
                raise ImportError("pandas indisponível (simulando produção)")
            return None

    sys.meta_path.insert(0, BloqueiaPandas())

    from zelo_ml.api.main import create_app
    from zelo_ml.model.pipeline import rank
    from zelo_ml.api.schemas import Candidate, ClientProfile, Context, RankRequest
    from datetime import datetime

    create_app()

    pedido = RankRequest(
        request_id="00000000-0000-0000-0000-000000000000",
        client=ClientProfile(id="c1", booking_count=3, avg_ticket=200.0),
        context=Context(category_id="plumb", urgency="TODAY", at=datetime(2026, 1, 1), limit=3),
        candidates=[
            Candidate(provider_id=f"p{i}", category_ids=["plumb"], price_from=100.0 + i,
                      rating_avg=4.0 + i * 0.2, rating_count=5, distance_km=float(i))
            for i in range(5)
        ],
    )
    itens, estrategia = rank(pedido, None)

    assert len(itens) == 3, itens
    assert estrategia == "heuristic_fallback"
    assert "pandas" not in sys.modules
    print("OK")
    """
)


def test_serving_funciona_sem_pandas():
    resultado = subprocess.run(
        [sys.executable, "-c", SCRIPT],
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert resultado.returncode == 0, resultado.stderr
    assert "OK" in resultado.stdout


def test_requirements_de_serving_nao_incluem_pandas():
    """Segunda barreira: mesmo que o import passasse, a dependência não existe."""
    from pathlib import Path

    requisitos = (Path(__file__).resolve().parents[1] / "requirements.txt").read_text()
    linhas = [
        linha.strip()
        for linha in requisitos.splitlines()
        if linha.strip() and not linha.strip().startswith("#")
    ]
    assert not any(linha.lower().startswith("pandas") for linha in linhas), linhas
