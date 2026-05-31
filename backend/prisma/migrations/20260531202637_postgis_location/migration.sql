-- Real geolocation matching with PostGIS (issue #2)
--
-- Migrates ProviderProfile.latitude/longitude (two Float columns) into a single
-- `location geography(Point, 4326)` column, preserving any existing coordinates,
-- and adds a GiST index so ST_DWithin / nearest-neighbour ordering stays fast.

-- 1. Enable PostGIS (no-op if already installed). Requires superuser/`rds_superuser`
--    on the target database — see docs/DEPLOYMENT.md for the Render note.
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add the new geography column (nullable while we backfill).
ALTER TABLE "ProviderProfile" ADD COLUMN "location" geography(Point, 4326);

-- 3. Backfill from the legacy lat/lng pair. PostGIS expects (longitude, latitude).
UPDATE "ProviderProfile"
   SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
 WHERE "latitude" IS NOT NULL
   AND "longitude" IS NOT NULL;

-- 4. Drop the now-redundant float columns.
ALTER TABLE "ProviderProfile" DROP COLUMN "latitude",
                              DROP COLUMN "longitude";

-- 5. Spatial index for distance filters and nearest-neighbour ordering.
CREATE INDEX "ProviderProfile_location_idx" ON "ProviderProfile" USING GIST ("location");
