# ─────────────────────────────────────────────────────────────────────────────
# Serviço de recomendação do ZELO — Python + FastAPI
#
# Python 3.12 fixo: em 3.13/3.14 o pip não acha wheels de scipy/scikit-learn e
# cai num build a partir do código-fonte que leva muitos minutos e costuma
# falhar. Só as dependências de SERVING entram aqui (requirements.txt); as de
# desenvolvimento (pytest, ruff, mypy) ficam de fora de propósito.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Camada pesada e estável: fica em cache enquanto requirements.txt não mudar.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml ./
COPY src ./src

# O pacote é usado direto de `src/` via PYTHONPATH, sem `pip install -e .`: o
# modo editável dispara um build isolado só para baixar setuptools, e não há
# nada a compilar aqui — `zelo_ml` é Python puro.
ENV PYTHONPATH=/app/src

# Onde o artefato treinado é gravado quando ML_ARTIFACT_BACKEND=file. Com o
# backend `db` (padrão do compose) o modelo mora no Postgres e estes diretórios
# ficam vazios — mas o serviço espera que eles existam.
RUN mkdir -p artifacts reports \
 && useradd --create-home --uid 1001 zelo \
 && chown -R zelo:zelo /app
USER zelo

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "zelo_ml.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
