"""Construção do conjunto de treino, ponto-a-ponto no tempo.

Este é o arquivo mais delicado do serviço. Todo agregado usado como feature de
um exemplo precisa ter sido observável ANTES do instante daquele exemplo. Se uma
avaliação escrita depois do booking entrar no cálculo da nota do profissional, o
modelo aprende a "prever" uma escolha usando a consequência dela — e as métricas
offline ficam ótimas enquanto o produto não melhora nada.

A defesa é uma máquina de estado: eventos (booking criado, aceito, resolvido,
avaliado) são ordenados no tempo e aplicados em sequência; o exemplo é emitido
ANTES de qualquer atualização causada pelo próprio booking.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from statistics import median

import numpy as np

from ..api.schemas import Candidate, ClientProfile, Context
from ..data.loader import BookingRow, ProviderRow, RawData, haversine_km
from ..features.builders import GlobalStats, build_feature_matrix
from ..model.collaborative import CollaborativeModel, fit_collaborative

logger = logging.getLogger(__name__)

#: Raio de geração de candidatos. Igual ao usado pelo Node no serving — se
#: divergir, o modelo é treinado num conjunto que nunca verá em produção.
CANDIDATE_RADIUS_KM = 25.0
MAX_CANDIDATES = 150

#: Quantos bookings anteriores compõem a âncora geográfica do cliente.
ANCHOR_HISTORY = 10

#: Quando não há `completedAt`, assumimos a resolução alguns dias depois.
DEFAULT_RESOLUTION_DAYS = 3

TERMINAL_STATUSES = {"COMPLETED", "CANCELLED"}
ACCEPTED_STATUSES = {"ACCEPTED", "IN_PROGRESS", "COMPLETED"}


# ── Estado corrente ───────────────────────────────────────────────────────


@dataclass
class ProviderState:
    requested: int = 0
    accepted: int = 0
    completed: int = 0
    cancelled: int = 0
    rating_sum: float = 0.0
    rating_count: int = 0
    response_hours: list[float] = field(default_factory=list)

    @property
    def rating_avg(self) -> float:
        return self.rating_sum / self.rating_count if self.rating_count else 0.0

    def median_response(self) -> float | None:
        return median(self.response_hours) if self.response_hours else None


@dataclass
class PairState:
    bookings: int = 0
    completed: int = 0
    last_at: datetime | None = None


@dataclass
class ClientState:
    booking_count: int = 0
    category_counts: dict[str, int] = field(default_factory=dict)
    ticket_sum: float = 0.0
    ticket_count: int = 0
    last_booking_at: datetime | None = None
    locations: list[tuple[float, float]] = field(default_factory=list)
    pairs: dict[str, PairState] = field(default_factory=dict)

    def avg_ticket(self) -> float | None:
        return self.ticket_sum / self.ticket_count if self.ticket_count else None

    def anchor(self) -> tuple[float, float] | None:
        """Centróide dos últimos bookings localizados.

        Só usa bookings ANTERIORES — nunca o endereço do booking atual, que no
        fluxo real ainda não existe quando as recomendações são exibidas.
        """
        recent = self.locations[-ANCHOR_HISTORY:]
        if not recent:
            return None
        return (
            sum(p[0] for p in recent) / len(recent),
            sum(p[1] for p in recent) / len(recent),
        )


@dataclass
class Example:
    booking_id: str
    at: datetime
    client: ClientProfile
    context: Context
    candidates: list[Candidate]
    chosen_index: int
    label: int
    hired_provider_ids: list[str]


# ── Rótulo ────────────────────────────────────────────────────────────────


def label_for(status: str, rating: int | None) -> int | None:
    """1 = escolha bem-sucedida, 0 = escolha ruim, None = desfecho desconhecido.

    Prevemos escolha PONDERADA POR SATISFAÇÃO, não escolha crua: um booking
    concluído e avaliado com 2 estrelas é um exemplo negativo, ainda que o
    cliente tenha clicado nele. Sem isso, o modelo aprenderia a repetir os erros
    de contratação do passado.
    """
    if status not in TERMINAL_STATUSES:
        return None
    if status == "CANCELLED":
        return 0
    if rating is None:
        return 1  # concluiu e não reclamou
    return 1 if rating >= 4 else 0


# ── Geração dos exemplos ──────────────────────────────────────────────────


def build_examples(raw: RawData) -> list[Example]:
    providers = raw.provider_index()
    clients = raw.client_index()
    by_category = raw.providers_by_category()
    ratings_by_booking = {r.booking_id: r for r in raw.reviews}

    provider_state: dict[str, ProviderState] = {p: ProviderState() for p in providers}
    client_state: dict[str, ClientState] = {c: ClientState() for c in clients}

    events = _build_event_stream(raw)
    examples: list[Example] = []
    forced_chosen = 0

    for _, _, kind, payload in events:
        if kind == "example":
            booking: BookingRow = payload
            review = ratings_by_booking.get(booking.booking_id)
            label = label_for(booking.status, review.rating if review else None)
            if label is None:
                continue  # desfecho ainda desconhecido: não é exemplo de treino

            cstate = client_state.get(booking.client_id)
            crow = clients.get(booking.client_id)
            if cstate is None or crow is None:
                continue

            pool = _candidate_pool(
                by_category.get(booking.category_id, []),
                at=booking.created_at,
                anchor=cstate.anchor(),
            )
            chosen_row = providers.get(booking.provider_id)
            if chosen_row is None:
                continue
            if all(p.provider_id != booking.provider_id for p in pool):
                # O escolhido precisa estar no conjunto, senão não há positivo.
                pool.append(chosen_row)
                forced_chosen += 1
            if len(pool) < 2:
                continue

            anchor = cstate.anchor()
            candidates = [
                _to_candidate(
                    p,
                    cstate,
                    provider_state.setdefault(p.provider_id, ProviderState()),
                    crow,
                    anchor,
                    booking.created_at,
                )
                for p in pool
            ]
            chosen_index = next(
                i for i, p in enumerate(pool) if p.provider_id == booking.provider_id
            )

            examples.append(
                Example(
                    booking_id=booking.booking_id,
                    at=booking.created_at,
                    client=_to_client_profile(booking.client_id, crow, cstate, booking.created_at),
                    context=Context(
                        category_id=booking.category_id,
                        urgency=booking.urgency,
                        at=booking.created_at,
                        limit=min(len(candidates), MAX_CANDIDATES),
                    ),
                    candidates=candidates,
                    chosen_index=chosen_index,
                    label=label,
                    hired_provider_ids=[
                        pid for pid, pair in cstate.pairs.items() if pair.bookings > 0
                    ],
                )
            )

        elif kind == "booking_created":
            booking = payload
            ps = provider_state.setdefault(booking.provider_id, ProviderState())
            ps.requested += 1
            cs = client_state.setdefault(booking.client_id, ClientState())
            cs.booking_count += 1
            cs.category_counts[booking.category_id] = (
                cs.category_counts.get(booking.category_id, 0) + 1
            )
            cs.last_booking_at = booking.created_at
            if booking.lat is not None and booking.lng is not None:
                cs.locations.append((booking.lat, booking.lng))
            pair = cs.pairs.setdefault(booking.provider_id, PairState())
            pair.bookings += 1
            pair.last_at = booking.created_at

        elif kind == "accepted":
            booking = payload
            ps = provider_state.setdefault(booking.provider_id, ProviderState())
            ps.accepted += 1
            hours = (booking.updated_at - booking.created_at).total_seconds() / 3600.0
            if 0 <= hours < 24 * 30:
                ps.response_hours.append(hours)

        elif kind == "resolved":
            booking = payload
            ps = provider_state.setdefault(booking.provider_id, ProviderState())
            cs = client_state.setdefault(booking.client_id, ClientState())
            if booking.status == "COMPLETED":
                ps.completed += 1
                pair = cs.pairs.setdefault(booking.provider_id, PairState())
                pair.completed += 1
                if booking.price_final:
                    cs.ticket_sum += booking.price_final
                    cs.ticket_count += 1
            else:
                ps.cancelled += 1

        elif kind == "review":
            review = payload
            ps = provider_state.setdefault(review.provider_id, ProviderState())
            ps.rating_sum += review.rating
            ps.rating_count += 1

    if forced_chosen:
        logger.info(
            "%d exemplos tiveram o profissional escolhido reinserido no conjunto "
            "(fora do raio de %.0f km)",
            forced_chosen,
            CANDIDATE_RADIUS_KM,
        )
    logger.info("%d exemplos com desfecho conhecido", len(examples))
    return examples


def _build_event_stream(raw: RawData):
    """Eventos ordenados no tempo.

    A prioridade desempata colisões no mesmo instante: `example` (0) sempre vem
    antes de `booking_created` (1), garantindo que o próprio booking não entre
    nas features que o descrevem.
    """
    events: list[tuple[datetime, int, str, object]] = []
    for b in raw.bookings:
        events.append((b.created_at, 0, "example", b))
        events.append((b.created_at, 1, "booking_created", b))
        if b.status in ACCEPTED_STATUSES:
            events.append((max(b.updated_at, b.created_at), 2, "accepted", b))
        if b.status in TERMINAL_STATUSES:
            resolved_at = b.completed_at or (b.created_at + timedelta(days=DEFAULT_RESOLUTION_DAYS))
            events.append((resolved_at, 3, "resolved", b))
    for r in raw.reviews:
        events.append((r.created_at, 4, "review", r))

    events.sort(key=lambda e: (e[0], e[1]))
    return events


def _candidate_pool(
    pool: list[ProviderRow],
    at: datetime,
    anchor: tuple[float, float] | None,
) -> list[ProviderRow]:
    """Candidatos como o Postgres os selecionaria naquele instante.

    O filtro de `available` NÃO é opcional. Sem ele, profissionais indisponíveis
    entram no conjunto como negativos permanentes — eles nunca poderiam ter sido
    escolhidos — e "estar disponível" vira um discriminador quase perfeito. A
    primeira rodada de treino fez exatamente isso: o peso de `p_available`
    disparou para +3,27 e empurrou nota e recontratação para valores NEGATIVOS,
    porque o modelo já tinha de onde tirar a resposta. O conjunto de candidatos
    do treino precisa ser o mesmo que o serving vê — por isso o Node também
    filtra `available` na geração de candidatos.
    """
    available = [p for p in pool if p.created_at <= at and p.available]
    if anchor is not None:
        near = [
            p
            for p in available
            if p.lat is None
            or p.lng is None
            or haversine_km(anchor[0], anchor[1], p.lat, p.lng) <= CANDIDATE_RADIUS_KM
        ]
        if len(near) >= 2:
            available = near
    return available[:MAX_CANDIDATES]


def _to_candidate(
    p: ProviderRow,
    cstate: ClientState,
    pstate: ProviderState,
    crow,
    anchor: tuple[float, float] | None,
    at: datetime,
) -> Candidate:
    pair = cstate.pairs.get(p.provider_id)
    distance = None
    if anchor is not None and p.lat is not None and p.lng is not None:
        distance = haversine_km(anchor[0], anchor[1], p.lat, p.lng)

    # Tudo relativo ao INSTANTE DO EXEMPLO — nunca a um marco posterior.
    days_since_last = None
    if pair and pair.last_at:
        days_since_last = max(0.0, (at - pair.last_at).total_seconds() / 86400.0)

    tenure_days = max(0.0, (at - p.created_at).total_seconds() / 86400.0)

    return Candidate(
        provider_id=p.provider_id,
        category_ids=list(p.category_ids),
        price_from=float(p.price_from or 0),
        years_exp=int(p.years_exp or 0),
        jobs_done=pstate.completed,
        rating_avg=pstate.rating_avg,
        rating_count=pstate.rating_count,
        verified=bool(p.verified),
        available=bool(p.available),
        tenure_days=tenure_days,
        distance_km=distance,
        same_neighborhood=bool(crow.neighborhood and crow.neighborhood == p.neighborhood),
        same_city=bool(crow.city and crow.city == p.city),
        completed_count=pstate.completed,
        cancelled_count=pstate.cancelled,
        accepted_count=pstate.accepted,
        requested_count=pstate.requested,
        median_response_hours=pstate.median_response(),
        prior_bookings_with_client=pair.bookings if pair else 0,
        prior_completed_with_client=pair.completed if pair else 0,
        days_since_last_with_client=days_since_last,
        service_median_price=p.service_median_price,
    )


def _to_client_profile(client_id: str, crow, cstate: ClientState, at: datetime) -> ClientProfile:
    days_since = None
    if cstate.last_booking_at:
        days_since = max(0.0, (at - cstate.last_booking_at).total_seconds() / 86400.0)
    return ClientProfile(
        id=client_id,
        city=crow.city,
        neighborhood=crow.neighborhood,
        booking_count=cstate.booking_count,
        distinct_categories=len(cstate.category_counts),
        avg_ticket=cstate.avg_ticket(),
        days_since_last_booking=days_since,
        category_counts=dict(cstate.category_counts),
    )


# ── Split temporal e materialização ───────────────────────────────────────


def temporal_split(
    examples: list[Example], validation_fraction: float = 0.2
) -> tuple[list[Example], list[Example]]:
    """Últimos X% no tempo viram validação.

    Split aleatório seria errado: o modelo veria o futuro do mesmo cliente e as
    métricas ficariam otimistas de um jeito que produção nunca reproduz.
    """
    ordered = sorted(examples, key=lambda e: e.at)
    cut = int(len(ordered) * (1.0 - validation_fraction))
    return ordered[:cut], ordered[cut:]


def fit_collaborative_from(examples: list[Example], raw: RawData) -> CollaborativeModel:
    """Fatoração treinada SÓ com as interações da janela de treino."""
    interactions: list[tuple[str, str, float]] = []
    for ex in examples:
        chosen = ex.candidates[ex.chosen_index]
        # Peso maior para escolhas bem-sucedidas: o sinal colaborativo deve
        # refletir satisfação, não apenas clique.
        interactions.append((ex.client.id or "", chosen.provider_id, 1.0 + 1.5 * ex.label))
    provider_categories = {p.provider_id: p.category_ids for p in raw.providers}
    return fit_collaborative(interactions, provider_categories)


#: Em quantos blocos temporais a janela de treino é dividida para featurizar o
#: sinal colaborativo sem vazamento. Mais blocos = menos viés, mais SVDs.
CF_BLOCKS = 6


def to_training_rows_blocked(
    examples: list[Example],
    raw: RawData,
    stats: GlobalStats,
    n_blocks: int = CF_BLOCKS,
) -> tuple[np.ndarray, np.ndarray]:
    """Materializa (X, y) com o sinal colaborativo calculado FORA DA AMOSTRA.

    Este é o segundo vazamento que a avaliação offline pegou, e o mais sutil.
    A versão anterior treinava o SVD com todas as interações da janela de treino
    e depois usava esse mesmo SVD para gerar as features dos exemplos que o
    alimentaram. Resultado: o `cf_score` do profissional escolhido estava
    inflado pela própria escolha que se queria prever. O modelo aprendia
    "cf_score alto ⇒ escolhido" — trivialmente verdadeiro no treino e inútil na
    validação, onde a escolha não estava na matriz. A ablação por grupo mostrou
    o estrago: −0,08 de NDCG@8 só por causa dessas duas colunas.

    A correção segue a mesma disciplina do resto do arquivo: a janela de treino
    é dividida em blocos cronológicos e cada bloco é featurizado com um SVD
    ajustado apenas nos blocos ANTERIORES. O primeiro bloco fica sem sinal
    colaborativo (NaN) — que é exatamente a situação real de um marketplace
    recém-lançado.
    """
    ordered = sorted(examples, key=lambda e: e.at)
    if not ordered:
        return np.empty((0, 0)), np.empty(0)

    blocks = [list(b) for b in np.array_split(np.asarray(ordered, dtype=object), n_blocks)]
    rows: list[np.ndarray] = []
    labels: list[int] = []
    history: list[Example] = []

    for block in blocks:
        cf_block = (
            fit_collaborative_from(history, raw)
            if history
            else CollaborativeModel(category_centroids={}, n_components=1)
        )
        for ex in block:
            matrix = build_feature_matrix(
                client=ex.client,
                context=ex.context,
                candidates=ex.candidates,
                cf=cf_block,
                stats=stats,
                hired_provider_ids=ex.hired_provider_ids,
            )
            for j in range(len(ex.candidates)):
                rows.append(matrix[j])
                labels.append(ex.label if j == ex.chosen_index else 0)
        history.extend(block)

    return np.vstack(rows), np.asarray(labels, dtype=np.int32)


def compute_stats(examples: list[Example]) -> GlobalStats:
    """Estatísticas globais da janela de treino."""
    ratings: list[float] = []
    category_counts: dict[str, int] = {}
    for ex in examples:
        if ex.context.category_id:
            category_counts[ex.context.category_id] = (
                category_counts.get(ex.context.category_id, 0) + 1
            )
        for cand in ex.candidates:
            if cand.rating_count > 0:
                ratings.append(cand.rating_avg)

    total = sum(category_counts.values()) or 1
    return GlobalStats(
        global_rating_mean=float(np.mean(ratings)) if ratings else 4.2,
        category_priors={cid: n / total for cid, n in category_counts.items()},
    )


def describe(examples: list[Example]) -> dict[str, float | str]:
    """Resumo usado pelo `--describe` e pelos logs de treino."""
    if not examples:
        return {}
    positives = sum(e.label for e in examples)
    sizes = [len(e.candidates) for e in examples]
    cold = sum(1 for e in examples if e.client.booking_count == 0)
    no_geo = sum(1 for e in examples if all(c.distance_km is None for c in e.candidates))
    return {
        "exemplos": len(examples),
        "positivos": positives,
        "taxa_positivos": round(positives / len(examples), 4),
        "candidatos_medio": round(float(np.mean(sizes)), 2),
        "candidatos_min": min(sizes),
        "candidatos_max": max(sizes),
        "clientes_frios": cold,
        "sem_ancora_geo": no_geo,
        "primeiro": examples[0].at.isoformat(),
        "ultimo": examples[-1].at.isoformat(),
    }


if __name__ == "__main__":  # pragma: no cover - utilitário de inspeção
    import json
    import sys

    from ..data.loader import load_raw
    from ..logging import configure_logging
    from ..settings import settings

    configure_logging()
    if not settings.database_url:
        sys.exit("defina ML_DATABASE_URL")
    data = load_raw(settings.database_url)
    print(json.dumps(describe(build_examples(data)), indent=2, ensure_ascii=False))
