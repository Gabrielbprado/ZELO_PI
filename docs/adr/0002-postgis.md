# 0002 — PostGIS para geolocalização

**Status:** Aceita · retroativo

## Contexto

O casamento cliente↔profissional é geográfico: "encanador perto de mim". Guardar
latitude/longitude como floats e calcular distância na aplicação (ou com `sqrt` em SQL)
não usa índice espacial e degrada com o volume; além disso, a âncora geográfica do cliente
no recomendador precisa de `ST_Centroid` sobre os últimos bookings.

## Decisão

PostgreSQL **com a extensão PostGIS**. As colunas de local (`ProviderProfile.location`,
`Booking.location`) são `geography(Point, 4326)`, lidas/escritas via SQL cru (`ST_*`) —
são `Unsupported` no Prisma Client, mas o Prisma segue dono do schema.

## Consequências

- **A favor:** consultas por raio usam índice espacial (`GIST`); distância geodésica
  correta; `ST_Centroid` sai de graça para o recomendador.
- **Contra:** a imagem do banco passa a ser `postgis/postgis` (não o Postgres puro), e as
  migrations precisam de `CREATE EXTENSION postgis` — o CI e o entrypoint garantem isso. As
  colunas geográficas exigem SQL cru, fora do type-safety do Prisma.
