-- Kernentitäten aus ADR 0001, angepasst durch ADR 0003/0004/0005.
-- Tabelle heißt "app_user" statt "user", weil USER ein reserviertes Wort in Postgres ist.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE region (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number           text NOT NULL UNIQUE,
    phone_verified_at      timestamptz,
    display_name           text,
    emergency_contact_name  text,
    emergency_contact_phone text,
    created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rescue_org_member (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    display_name  text NOT NULL,
    region_id     uuid NOT NULL REFERENCES region (id),
    verified_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tour (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES app_user (id),
    status     text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'beendet')),
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at   timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE location_ping (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tour_id         uuid NOT NULL REFERENCES tour (id),
    recorded_at     timestamptz NOT NULL,
    received_at     timestamptz NOT NULL DEFAULT now(),
    location        geography(Point, 4326) NOT NULL,
    accuracy_meters numeric,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rescue_org_member_region_id ON rescue_org_member (region_id);
CREATE INDEX idx_tour_user_id ON tour (user_id);
CREATE INDEX idx_location_ping_tour_id_recorded_at ON location_ping (tour_id, recorded_at);
CREATE INDEX idx_location_ping_location ON location_ping USING GIST (location);
