"""SQL de treino.

Escrito à mão, sem ORM: são cinco consultas analíticas com funções PostGIS, e um
ORM só as esconderia atrás de uma camada a mais para depurar. O acesso é
somente-leitura — o Prisma continua dono do schema.
"""

from __future__ import annotations

PROVIDERS = """
SELECT
  p."id"                                        AS provider_id,
  p."userId"                                    AS user_id,
  p."yearsExp"                                  AS years_exp,
  p."priceFrom"                                 AS price_from,
  (p."kycStatus" = 'VERIFIED')                  AS verified,
  p."available"                                 AS available,
  p."createdAt"                                 AS created_at,
  u."city"                                      AS city,
  u."neighborhood"                              AS neighborhood,
  ST_Y(p."location"::geometry)                  AS lat,
  ST_X(p."location"::geometry)                  AS lng,
  COALESCE(cats.ids, ARRAY[]::text[])           AS category_ids,
  svc.median_price                              AS service_median_price
FROM "ProviderProfile" p
JOIN "User" u ON u."id" = p."userId"
LEFT JOIN LATERAL (
  SELECT ARRAY_AGG(pc."categoryId" ORDER BY pc."categoryId") AS ids
    FROM "ProviderCategory" pc WHERE pc."providerId" = p."id"
) cats ON TRUE
LEFT JOIN LATERAL (
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s."priceMin")::double precision AS median_price
    FROM "ProviderService" s WHERE s."providerId" = p."id"
) svc ON TRUE
WHERE u."isActive" = true
"""

CLIENTS = """
SELECT u."id" AS client_id, u."city" AS city, u."neighborhood" AS neighborhood
  FROM "User" u
 WHERE u."role" = 'CLIENT'
"""

BOOKINGS = """
SELECT
  b."id"                            AS booking_id,
  b."clientId"                      AS client_id,
  b."providerId"                    AS provider_id,
  b."categoryId"                    AS category_id,
  b."urgency"::text                 AS urgency,
  b."status"::text                  AS status,
  b."priceFinal"                    AS price_final,
  b."priceEstimate"                 AS price_estimate,
  b."createdAt"                     AS created_at,
  b."updatedAt"                     AS updated_at,
  b."completedAt"                   AS completed_at,
  ST_Y(b."location"::geometry)      AS lat,
  ST_X(b."location"::geometry)      AS lng
FROM "Booking" b
ORDER BY b."createdAt" ASC
"""

REVIEWS = """
SELECT
  r."bookingId"  AS booking_id,
  r."rating"     AS rating,
  r."createdAt"  AS created_at,
  p."id"         AS provider_id
FROM "Review" r
JOIN "User" u            ON u."id" = r."targetId"
JOIN "ProviderProfile" p ON p."userId" = u."id"
ORDER BY r."createdAt" ASC
"""

#: Telemetria real do carrossel. Vira a fonte de rótulos quando houver volume
#: (`--source events`), substituindo o proxy baseado em bookings.
REC_EVENTS = """
SELECT
  e."requestId"    AS request_id,
  e."userId"       AS user_id,
  e."providerId"   AS provider_id,
  e."type"::text   AS type,
  e."position"     AS position,
  e."categoryId"   AS category_id,
  e."createdAt"    AS created_at
FROM "RecEvent" e
ORDER BY e."createdAt" ASC
"""
