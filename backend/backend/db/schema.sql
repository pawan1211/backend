-- ============================================================
--  NexusIT Consulting · PostgreSQL Schema
--  Run once: psql -U postgres -d nexusit -f schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS (synced from Supabase Auth) ──────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_id   UUID UNIQUE NOT NULL,           -- auth.users.id from Supabase
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  company       TEXT,
  country       TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'client', -- client | consultant | admin
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONSULTANTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  specialty     TEXT NOT NULL,
  experience_yrs INT NOT NULL DEFAULT 0,
  rating        NUMERIC(3,1) DEFAULT 5.0,
  bio           TEXT,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  tags          TEXT[],
  hourly_rate   NUMERIC(10,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── AVAILABILITY ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  day_of_week   INT NOT NULL,                   -- 0=Sun … 6=Sat
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE
);

-- ── BOOKINGS ────────────────────────────────────────────────
CREATE TYPE booking_status AS ENUM ('pending','confirmed','cancelled','completed','no_show');

CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_code  TEXT UNIQUE NOT NULL DEFAULT 'NIT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT),1,8)),
  client_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  consultant_id   UUID REFERENCES consultants(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INT NOT NULL DEFAULT 60,
  status          booking_status DEFAULT 'pending',
  topic           TEXT NOT NULL,
  notes           TEXT,
  -- Zoom
  zoom_meeting_id TEXT,
  zoom_join_url   TEXT,
  zoom_start_url  TEXT,
  zoom_password   TEXT,
  -- Metadata
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT
);

-- ── EMAIL LOGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    UUID REFERENCES bookings(id) ON DELETE CASCADE,
  recipient     TEXT NOT NULL,
  template_name TEXT NOT NULL,
  sendgrid_msg_id TEXT,
  status        TEXT DEFAULT 'sent',
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── REVIEWS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    UUID UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  client_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  rating        INT CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_bookings_client      ON bookings(client_id);
CREATE INDEX idx_bookings_consultant  ON bookings(consultant_id);
CREATE INDEX idx_bookings_scheduled   ON bookings(scheduled_at);
CREATE INDEX idx_bookings_status      ON bookings(status);
CREATE INDEX idx_availability_consultant ON availability(consultant_id);

-- ── AUTO-UPDATE updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SEED CONSULTANTS ─────────────────────────────────────────
-- (Run after creating real auth users via Supabase dashboard)
-- INSERT INTO users (supabase_id, email, full_name, role) VALUES (...);
