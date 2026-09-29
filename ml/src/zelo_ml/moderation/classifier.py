"""Classificador de denúncias — o "moderador automático" do ZELO.

O que ele decide, em uma passada: **categoria** (fraude, spam, conteúdo impróprio,
assédio, segurança, contato fora da plataforma), **gravidade**, **prioridade** na fila
do admin e a **consequência sugerida** — e, quando a evidência é forte o bastante,
aplica a consequência sozinho (o Node obedece `auto_enforce`).

ponytail: o classificador é LEXICAL + sinais comportamentais, não um modelo treinado.
A razão é honesta: modelo supervisionado precisa de denúncias rotuladas, e um produto
que acabou de ligar a moderação não tem nenhuma. Isto produz o rótulo — cada decisão de
admin em cima de uma sugestão é um par (texto, rótulo). Quando houver algumas centenas,
o caminho de upgrade é trocar `_score_categories` por um TF-IDF + LogisticRegression
carregado pelo mesmo `ModelRegistry` do ranker, mantendo este arquivo como fallback
(exatamente a relação que `model/fallback.py` tem com o ranker).

Duas assimetrias guiam os limiares, e valem para qualquer versão futura:

1. **Errar bloqueando é pior que errar deixando passar.** Um bloqueio indevido tira o
   sustento de um profissional; uma denúncia que espera 6h por um humano custa 6h. Por
   isso auto-bloqueio exige corroboração (denunciantes distintos ou evidência anexada),
   nunca a palavra de uma pessoa só.
2. **Denúncia é uma arma.** Quem denuncia muita gente em poucos dias pode estar
   retaliando, e a máquina segura a mão nesse caso em vez de virar o instrumento.
"""

from __future__ import annotations

import re
import time
import unicodedata

from ..api.schemas import ModerateRequest, ModerateResponse, Signal
from .lexicon import BASE_SEVERITY, LEXICON, REASON_PRIOR, SEVERITY_ORDER

#: Versão do conjunto de regras. Viaja na resposta e fica gravada na denúncia: sem ela,
#: uma decisão antiga não tem como ser explicada depois que os pesos mudarem.
MODEL_VERSION = "moderation-rules-1.0.0"

_PHONE = re.compile(r"(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[\s.-]?\d{4}")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_URL = re.compile(r"https?://|www\.|\b[\w-]+\.(?:com|net|org|br|io|shop)\b")
_PIX_KEY = re.compile(r"\bpix\b.{0,20}\b(chave|copia|cola)\b")

#: Peso a partir do qual a categoria vencedora é considerada sustentada pelo texto.
_EVIDENCE_FLOOR = 0.8
#: Confiança mínima para a máquina agir sozinha.
_AUTO_ENFORCE_CONFIDENCE = 0.85
#: A partir de quantas denúncias em 7 dias o denunciante vira suspeito de retaliação.
_MASS_REPORTER = 5

_SEVERITY_PRIORITY = {"LOW": 20, "MEDIUM": 45, "HIGH": 70, "CRITICAL": 88}


def _normalize(text: str) -> str:
    """Minúsculas, sem acento, espaços colapsados — é sobre esta forma que o léxico casa."""
    folded = unicodedata.normalize("NFKD", text.lower())
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", folded)


def _bump(severity: str, steps: int) -> str:
    idx = SEVERITY_ORDER.index(severity) + steps
    return SEVERITY_ORDER[max(0, min(len(SEVERITY_ORDER) - 1, idx))]


def _score_categories(text: str) -> tuple[dict[str, float], list[Signal]]:
    """Soma os pesos dos termos casados, por categoria.

    Cada termo conta UMA vez por categoria: repetir "golpe" dez vezes é ênfase, não
    dez indícios independentes — sem isto um desabafo longo venceria uma denúncia
    curta e precisa.
    """
    scores: dict[str, float] = {}
    signals: list[Signal] = []
    for category, terms in LEXICON.items():
        matched = [(term, weight) for term, weight in terms if term in text]
        if not matched:
            continue
        scores[category] = round(sum(w for _, w in matched), 3)
        signals.append(
            Signal(
                code=f"LEXICON_{category}",
                weight=scores[category],
                detail=", ".join(term for term, _ in matched[:5]),
            )
        )
    return scores, signals


def _contact_signals(text: str) -> tuple[float, list[Signal]]:
    """Telefone, e-mail, link e chave PIX no corpo de uma denúncia quase sempre são a
    CITAÇÃO da tentativa de levar a negociação (e o risco) para fora da plataforma."""
    found: list[Signal] = []
    total = 0.0
    for code, pattern, weight in (
        ("CONTACT_PHONE", _PHONE, 0.6),
        ("CONTACT_EMAIL", _EMAIL, 0.4),
        ("EXTERNAL_LINK", _URL, 0.7),
        ("PIX_KEY", _PIX_KEY, 0.9),
    ):
        if pattern.search(text):
            found.append(Signal(code=code, weight=weight))
            total += weight
    return total, found


def _repetition_signal(samples: list[str]) -> Signal | None:
    """Spam clássico em conversa: a mesma mensagem repetida. Barato de medir e um dos
    poucos sinais de spam que não depende de vocabulário nenhum."""
    if len(samples) < 3:
        return None
    normalized = [_normalize(s) for s in samples if s.strip()]
    if len(normalized) < 3:
        return None
    unique_ratio = len(set(normalized)) / len(normalized)
    if unique_ratio > 0.5:
        return None
    return Signal(
        code="REPEATED_MESSAGES",
        weight=round((1 - unique_ratio) * 1.5, 3),
        detail=f"{len(normalized)} mensagens, {len(set(normalized))} distintas",
    )


def classify(request: ModerateRequest) -> ModerateResponse:
    started = time.perf_counter()
    ctx = request.context
    signals: list[Signal] = []

    haystack = _normalize(" \n ".join([request.text, *request.samples]))
    scores, lexicon_signals = _score_categories(haystack)
    signals.extend(lexicon_signals)

    contact_weight, contact_signals = _contact_signals(haystack)
    if contact_weight:
        scores["OFF_PLATFORM"] = scores.get("OFF_PLATFORM", 0.0) + contact_weight
        signals.extend(contact_signals)

    repetition = _repetition_signal(request.samples)
    if repetition:
        scores["SPAM"] = scores.get("SPAM", 0.0) + repetition.weight
        signals.append(repetition)

    # O motivo escolhido pelo denunciante entra como prior fraco: ele desempata e
    # sustenta uma denúncia sem texto, mas não vence indício textual de outra categoria.
    prior = REASON_PRIOR.get(request.reason, "NONE")
    if prior != "NONE":
        scores[prior] = scores.get(prior, 0.0) + 0.5
        signals.append(Signal(code="REPORTER_REASON", weight=0.5, detail=request.reason))

    category = max(scores, key=lambda k: scores[k]) if scores else "NONE"
    top_score = scores.get(category, 0.0)
    text_backed = top_score - (0.5 if prior == category else 0.0) >= _EVIDENCE_FLOOR

    # ─── Gravidade ───────────────────────────────────────────────────────────
    severity = BASE_SEVERITY[category]

    corroborated = ctx.target_distinct_reporters_30d >= 2
    recidivist = ctx.target_prior_suspensions >= 1 or ctx.target_prior_warnings >= 2
    if ctx.target_distinct_reporters_30d >= 3:
        severity = _bump(severity, 1)
        signals.append(
            Signal(
                code="MULTIPLE_REPORTERS",
                weight=1.0,
                detail=f"{ctx.target_distinct_reporters_30d} denunciantes em 30d",
            )
        )
    elif corroborated:
        signals.append(
            Signal(
                code="CORROBORATED",
                weight=0.6,
                detail=f"{ctx.target_distinct_reporters_30d} denunciantes em 30d",
            )
        )
    if recidivist:
        severity = _bump(severity, 1)
        signals.append(
            Signal(
                code="REPEAT_OFFENDER",
                weight=1.0,
                detail=f"{ctx.target_prior_warnings} advertências, {ctx.target_prior_suspensions} suspensões",
            )
        )
    # Conta nova sem histórico é o perfil típico do golpe descartável.
    if (
        ctx.target_account_age_days < 7
        and ctx.target_completed_bookings == 0
        and category == "FRAUD"
    ):
        severity = _bump(severity, 1)
        signals.append(
            Signal(
                code="NEW_ACCOUNT_NO_HISTORY",
                weight=0.8,
                detail=f"{ctx.target_account_age_days:.0f} dias",
            )
        )

    mass_reporter = ctx.reporter_reports_7d >= _MASS_REPORTER
    if mass_reporter:
        # Não zera a denúncia — segura a máquina e manda para o humano.
        severity = min(severity, "MEDIUM", key=SEVERITY_ORDER.index)
        signals.append(
            Signal(
                code="MASS_REPORTER",
                weight=-1.0,
                detail=f"{ctx.reporter_reports_7d} denúncias em 7d",
            )
        )

    # ─── Confiança ───────────────────────────────────────────────────────────
    confidence = 0.2
    if text_backed:
        confidence += min(0.45, top_score * 0.18)
    if corroborated:
        confidence += 0.15
    if recidivist:
        confidence += 0.1
    if request.evidence_count > 0:
        confidence += 0.1
        signals.append(
            Signal(code="HAS_EVIDENCE", weight=0.5, detail=f"{request.evidence_count} anexo(s)")
        )
    if prior == category and text_backed:
        confidence += 0.1
    if mass_reporter:
        confidence -= 0.25
    if ctx.target_kyc_verified:
        # Identidade verificada não inocenta, mas encarece o falso positivo: há a quem
        # responsabilizar por outros meios, então a máquina age com mais margem.
        confidence -= 0.05
    confidence = round(max(0.0, min(1.0, confidence)), 3)

    # ─── Prioridade ──────────────────────────────────────────────────────────
    priority = _SEVERITY_PRIORITY[severity]
    priority += 6 if corroborated else 0
    priority += 4 if request.evidence_count else 0
    priority += 4 if recidivist else 0
    priority -= 10 if mass_reporter else 0
    priority = max(0, min(100, round(priority * (0.65 + 0.35 * confidence))))

    # ─── Consequência ────────────────────────────────────────────────────────
    action, suspend_days = _decide(category, severity, confidence, text_backed)
    auto_enforce = _can_enforce(
        action=action,
        severity=severity,
        confidence=confidence,
        text_backed=text_backed,
        corroborated=corroborated,
        evidence_count=request.evidence_count,
        mass_reporter=mass_reporter,
    )

    return ModerateResponse(
        model_version=MODEL_VERSION,
        category=category,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        priority=priority,
        confidence=confidence,
        action=action,  # type: ignore[arg-type]
        auto_enforce=auto_enforce,
        suspend_days=suspend_days,
        signals=signals,
        latency_ms=round((time.perf_counter() - started) * 1000, 3),
    )


def _decide(
    category: str, severity: str, confidence: float, text_backed: bool
) -> tuple[str | None, int | None]:
    """Consequência sugerida. `None` = sem opinião, decide o humano."""
    if category == "NONE" or (not text_backed and confidence < 0.4):
        # Denúncia vazia não é denúncia falsa: pedir detalhes é mais útil (e mais
        # barato) do que arquivar e do que acordar um admin.
        return ("REQUEST_INFO", None) if confidence < 0.4 else (None, None)
    if severity == "CRITICAL":
        return "BLOCK", None
    if severity == "HIGH":
        return "SUSPEND", 7
    if severity == "MEDIUM":
        return "WARN", None
    return "WARN", None


def _can_enforce(
    *,
    action: str | None,
    severity: str,
    confidence: float,
    text_backed: bool,
    corroborated: bool,
    evidence_count: int,
    mass_reporter: bool,
) -> bool:
    """Guarda-corpo do moderador automático.

    A máquina só age sozinha quando a decisão é reversível barato (advertência) ou
    quando há corroboração independente. `REQUEST_INFO` e `REJECT` nunca são
    automáticos: arquivar denúncia é juízo de mérito, e é justamente onde o silêncio
    de um falso negativo não deixa rastro para ninguém revisar.
    """
    if action in (None, "REQUEST_INFO", "REJECT"):
        return False
    if mass_reporter or not text_backed or confidence < _AUTO_ENFORCE_CONFIDENCE:
        return False
    if action == "WARN":
        return True
    # Suspensão e bloqueio tiram o sustento de alguém: exigem mais de uma voz, ou a
    # palavra de uma pessoa acompanhada de evidência anexada.
    return corroborated or evidence_count > 0
