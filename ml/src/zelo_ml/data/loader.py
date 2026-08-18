"""Carregamento dos dados brutos de treino."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime

from . import queries

logger = logging.getLogger(__name__)


@dataclass
class ProviderRow:
    provider_id: str
    user_id: str
    years_exp: int
    price_from: float
    verified: bool
    available: bool
    created_at: datetime
    city: str | None
    neighborhood: str | None
    lat: float | None
    lng: float | None
    category_ids: list[str]
    service_median_price: float | None


@dataclass
class ClientRow:
    client_id: str
    city: str | None
    neighborhood: str | None


@dataclass
class BookingRow:
    booking_id: str
    client_id: str
    provider_id: str
    category_id: str
    urgency: str
    status: str
    price_final: int | None
    price_estimate: int | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    lat: float | None
    lng: float | None


@dataclass
class ReviewRow:
    booking_id: str
    rating: int
    created_at: datetime
    provider_id: str


@dataclass
class RawData:
    providers: list[ProviderRow] = field(default_factory=list)
    clients: list[ClientRow] = field(default_factory=list)
    bookings: list[BookingRow] = field(default_factory=list)
    reviews: list[ReviewRow] = field(default_factory=list)

    def provider_index(self) -> dict[str, ProviderRow]:
        return {p.provider_id: p for p in self.providers}

    def client_index(self) -> dict[str, ClientRow]:
        return {c.client_id: c for c in self.clients}

    def providers_by_category(self) -> dict[str, list[ProviderRow]]:
        out: dict[str, list[ProviderRow]] = {}
        for p in self.providers:
            for cid in p.category_ids:
                out.setdefault(cid, []).append(p)
        return out


def load_raw(dsn: str) -> RawData:
    """Lê tudo o que o treino precisa em quatro consultas."""
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(dsn, row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute(queries.PROVIDERS)
        providers = [ProviderRow(**row) for row in cur.fetchall()]

        cur.execute(queries.CLIENTS)
        clients = [ClientRow(**row) for row in cur.fetchall()]

        cur.execute(queries.BOOKINGS)
        bookings = [BookingRow(**row) for row in cur.fetchall()]

        cur.execute(queries.REVIEWS)
        reviews = [ReviewRow(**row) for row in cur.fetchall()]

    logger.info(
        "dados carregados: %d profissionais, %d clientes, %d bookings, %d avaliações",
        len(providers),
        len(clients),
        len(bookings),
        len(reviews),
    )
    return RawData(providers=providers, clients=clients, bookings=bookings, reviews=reviews)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distância em km. Espelha o `ST_DistanceSphere` que o Node usa no serving.

    Reimplementado aqui porque o treino calcula distâncias contra âncoras
    reconstruídas ponto-a-ponto no tempo, que não existem como linha no banco.
    A diferença numérica para o PostGIS é da ordem de metros — irrelevante
    frente ao decaimento exponencial de 5 km.
    """
    radius = 6371.0
    to_rad = math.pi / 180.0
    d_lat = (lat2 - lat1) * to_rad
    d_lng = (lng2 - lng1) * to_rad
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(min(1.0, a)))
