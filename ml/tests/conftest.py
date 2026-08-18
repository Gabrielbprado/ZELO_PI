"""Fixtures determinísticas — nenhum teste toca no banco."""

from __future__ import annotations

import random
from datetime import datetime, timedelta

import pytest

from zelo_ml.api.schemas import Candidate, ClientProfile, Context, RankRequest
from zelo_ml.data.loader import BookingRow, ClientRow, ProviderRow, RawData, ReviewRow

BASE = datetime(2026, 1, 1, 9, 0, 0)
CATEGORIES = ["plumb", "bolt", "spray"]


def make_raw(
    n_providers: int = 20,
    n_clients: int = 40,
    n_bookings: int = 300,
    seed: int = 7,
) -> RawData:
    """Mundo sintético em miniatura, com a mesma estrutura latente do seed real.

    `skill` fica implícita: entra na probabilidade de escolha e na nota, mas
    nunca vira coluna — igual à produção, onde o modelo precisa inferir
    qualidade a partir de evidência ruidosa.
    """
    rng = random.Random(seed)

    providers: list[ProviderRow] = []
    skills: dict[str, float] = {}
    for i in range(n_providers):
        pid = f"pro-{i}"
        skills[pid] = rng.random()
        providers.append(
            ProviderRow(
                provider_id=pid,
                user_id=f"user-pro-{i}",
                years_exp=rng.randint(1, 20),
                price_from=float(rng.randint(80, 400)),
                verified=rng.random() < 0.85,
                available=True,
                created_at=BASE - timedelta(days=rng.randint(30, 400)),
                city="São Paulo",
                neighborhood=f"bairro-{i % 5}",
                lat=-23.55 + rng.uniform(-0.05, 0.05),
                lng=-46.65 + rng.uniform(-0.05, 0.05),
                category_ids=[CATEGORIES[i % len(CATEGORIES)]],
                service_median_price=float(rng.randint(80, 400)),
            )
        )

    clients = [
        ClientRow(client_id=f"cli-{i}", city="São Paulo", neighborhood=f"bairro-{i % 5}")
        for i in range(n_clients)
    ]

    bookings: list[BookingRow] = []
    reviews: list[ReviewRow] = []
    for i in range(n_bookings):
        client = clients[i % n_clients]
        category = CATEGORIES[i % len(CATEGORIES)]
        pool = [p for p in providers if category in p.category_ids]
        # Escolha enviesada pela skill (não determinística): um ranker perfeito
        # não consegue acertar sempre, o que mantém o teste honesto.
        chosen = max(rng.sample(pool, min(3, len(pool))), key=lambda p: skills[p.provider_id])
        created = BASE + timedelta(hours=6 * i)
        completed = rng.random() < 0.5 + 0.4 * skills[chosen.provider_id]

        bookings.append(
            BookingRow(
                booking_id=f"bk-{i}",
                client_id=client.client_id,
                provider_id=chosen.provider_id,
                category_id=category,
                urgency=["FLEXIBLE", "TODAY", "EMERGENCY"][i % 3],
                status="COMPLETED" if completed else "CANCELLED",
                price_final=int(chosen.price_from * 1.5) if completed else None,
                price_estimate=int(chosen.price_from * 1.5),
                created_at=created,
                updated_at=created + timedelta(hours=2),
                completed_at=created + timedelta(days=1) if completed else None,
                lat=-23.55 + (i % 5) * 0.01,
                lng=-46.65 + (i % 5) * 0.01,
            )
        )
        if completed and rng.random() < 0.7:
            rating = 5 if skills[chosen.provider_id] > 0.6 else rng.randint(2, 4)
            reviews.append(
                ReviewRow(
                    booking_id=f"bk-{i}",
                    rating=rating,
                    created_at=created + timedelta(days=2),
                    provider_id=chosen.provider_id,
                )
            )

    return RawData(providers=providers, clients=clients, bookings=bookings, reviews=reviews)


@pytest.fixture
def raw() -> RawData:
    return make_raw()


def make_candidate(provider_id: str = "pro-1", **overrides) -> Candidate:
    defaults = {
        "provider_id": provider_id,
        "category_ids": ["plumb"],
        "price_from": 150.0,
        "years_exp": 5,
        "jobs_done": 20,
        "rating_avg": 4.5,
        "rating_count": 12,
        "verified": True,
        "available": True,
        "tenure_days": 200.0,
        "distance_km": 3.0,
        "same_neighborhood": True,
        "same_city": True,
        "completed_count": 20,
        "cancelled_count": 2,
        "accepted_count": 22,
        "requested_count": 25,
        "median_response_hours": 1.5,
        "prior_bookings_with_client": 0,
        "prior_completed_with_client": 0,
        "days_since_last_with_client": None,
        "service_median_price": 150.0,
    }
    defaults.update(overrides)
    return Candidate(**defaults)


def make_request(n: int = 5, **client_overrides) -> RankRequest:
    client_defaults = {
        "id": "cli-1",
        "city": "São Paulo",
        "neighborhood": "bairro-1",
        "booking_count": 4,
        "distinct_categories": 2,
        "avg_ticket": 200.0,
        "days_since_last_booking": 10.0,
        "category_counts": {"plumb": 3, "bolt": 1},
    }
    client_defaults.update(client_overrides)
    return RankRequest(
        request_id="11111111-1111-1111-1111-111111111111",
        client=ClientProfile(**client_defaults),
        context=Context(category_id="plumb", urgency="TODAY", at=BASE, limit=3),
        candidates=[
            make_candidate(
                f"pro-{i}",
                rating_avg=3.5 + 0.3 * i,
                distance_km=1.0 + 2.0 * i,
                jobs_done=10 * i,
            )
            for i in range(n)
        ],
    )
