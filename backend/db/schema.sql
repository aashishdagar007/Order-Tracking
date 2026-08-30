-- ─────────────────────────────────────────────────────────────────────────────
-- Warehouse WMS — PostgreSQL Multi-Location Schema
-- Multi-tenancy model: Option B — one company, multiple warehouse locations
-- Row-Level Security enforced on every data table.
--
-- Applied automatically on first container start via docker-entrypoint-initdb.d/
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram index for ILIKE search

-- ── Warehouses (Locations of one company) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,   -- e.g. 'delhi-hub', 'mumbai-dc'
    address     TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Users (company-wide, can access multiple warehouses) ───────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT        NOT NULL UNIQUE,
    name            TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,   -- bcrypt hash
    role            TEXT        NOT NULL DEFAULT 'WAREHOUSE_OPERATOR'
                                CHECK (role IN ('ADMIN','WAREHOUSE_OPERATOR','CLIENT')),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_seen       TIMESTAMPTZ,
    last_action     TEXT,
    last_action_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── User <-> Warehouse access mapping ──────────────────────────────────────────
-- ADMIN users implicitly have access to all warehouses (checked in app logic)
CREATE TABLE IF NOT EXISTS user_warehouse_access (
    user_id      UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id UUID  NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    -- Granular permissions per user per warehouse
    can_view_orders BOOLEAN NOT NULL DEFAULT TRUE,
    can_pick_pack   BOOLEAN NOT NULL DEFAULT TRUE,
    can_dispatch    BOOLEAN NOT NULL DEFAULT FALSE,
    can_upload      BOOLEAN NOT NULL DEFAULT FALSE,
    can_export      BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_logs   BOOLEAN NOT NULL DEFAULT FALSE,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, warehouse_id)
);

-- ── Orders ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id    UUID        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,

    order_no        TEXT        NOT NULL,
    invoice_no      TEXT,
    lr_no           TEXT,

    -- AES-256-GCM encrypted sensitive fields (stored as BYTEA)
    -- Decrypt with backend.security.encryption.decrypt_field()
    customer_name_enc BYTEA,
    extra_enc         BYTEA,    -- all raw Excel columns as JSON

    sent            BOOLEAN     NOT NULL DEFAULT FALSE,
    status          TEXT        NOT NULL DEFAULT 'RECEIVED'
                    CHECK (status IN ('RECEIVED','PICKING','PACKING','QUALITY_CHECK','STAGED','DISPATCHED','ON_HOLD')),
    priority        TEXT        NOT NULL DEFAULT 'STANDARD'
                    CHECK (priority IN ('STANDARD','EXPRESS','URGENT')),

    zone            TEXT,
    dock_bay        TEXT,
    transporter     TEXT,
    vehicle_no      TEXT,
    box_count       INTEGER     NOT NULL DEFAULT 1,
    weight_kg       NUMERIC(10,3),
    sku_list        TEXT,       -- comma-separated or JSON
    notes           TEXT,
    manifest_id     TEXT,
    target_sla      TIMESTAMPTZ,

    entered_by      TEXT,
    entered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    picked_by       TEXT,
    picked_at       TIMESTAMPTZ,
    packed_by       TEXT,
    packed_at       TIMESTAMPTZ,
    dispatched_at   TIMESTAMPTZ,
    updated_by      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_warehouse_order UNIQUE (warehouse_id, order_no)
);

-- Indexes for common filter patterns
CREATE INDEX IF NOT EXISTS idx_orders_warehouse   ON orders (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders (warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_priority    ON orders (warehouse_id, priority);
CREATE INDEX IF NOT EXISTS idx_orders_entered_at  ON orders (warehouse_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_no    ON orders (warehouse_id, order_no);
-- Trigram index for fast ILIKE search on order_no
CREATE INDEX IF NOT EXISTS idx_orders_ordno_trgm  ON orders USING gin (order_no gin_trgm_ops);

-- ── Row-Level Security on Orders ───────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_warehouse_isolation ON orders
    USING (warehouse_id = current_setting('app.warehouse_id', TRUE)::UUID);

-- ADMIN role bypasses RLS (set via SET ROLE wms_admin in the connection)
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- ── Order Events (audit trail) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_events (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    warehouse_id UUID        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL,
    actor_name   TEXT        NOT NULL,
    actor_role   TEXT        NOT NULL,
    note         TEXT,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_order      ON order_events (order_id);
CREATE INDEX IF NOT EXISTS idx_events_warehouse  ON order_events (warehouse_id, timestamp DESC);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_warehouse_isolation ON order_events
    USING (warehouse_id = current_setting('app.warehouse_id', TRUE)::UUID);
ALTER TABLE order_events FORCE ROW LEVEL SECURITY;

-- ── Audit Logs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID        REFERENCES warehouses(id) ON DELETE SET NULL,
    user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
    username     TEXT        NOT NULL,
    role         TEXT        NOT NULL,
    action       TEXT        NOT NULL,
    detail       TEXT,
    ip_address   INET,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_warehouse  ON logs (warehouse_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user       ON logs (user_id);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY logs_warehouse_isolation ON logs
    USING (warehouse_id = current_setting('app.warehouse_id', TRUE)::UUID OR
           current_setting('app.warehouse_id', TRUE) IS NULL);
ALTER TABLE logs FORCE ROW LEVEL SECURITY;

-- ── Config (per-warehouse key/value settings) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS config (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    key          TEXT        NOT NULL,
    value        TEXT        NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (warehouse_id, key)
);

ALTER TABLE config ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_warehouse_isolation ON config
    USING (warehouse_id = current_setting('app.warehouse_id', TRUE)::UUID);
ALTER TABLE config FORCE ROW LEVEL SECURITY;

-- ── DB Roles ───────────────────────────────────────────────────────────────────
-- Application connects as wms_app (RLS enforced)
-- Admin migrations bypass RLS using the superuser role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wms_app') THEN
        CREATE ROLE wms_app LOGIN PASSWORD 'change_in_env';
    END IF;
END $$;

-- Grant minimum required privileges
GRANT CONNECT ON DATABASE warehouse_wms TO wms_app;
GRANT USAGE ON SCHEMA public TO wms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wms_app;

-- ── Updated_at auto-trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_warehouses_updated_at
    BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
