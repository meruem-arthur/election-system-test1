-- ============================================================
-- DEPARTMENTAL SMART ELECTION SYSTEM - DATABASE SCHEMA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'election_admin', 'observer');
CREATE TYPE election_status AS ENUM ('draft', 'active', 'paused', 'ended', 'results_published');
CREATE TYPE otp_purpose AS ENUM ('first_login', 'password_reset', 'suspicious_activity');
CREATE TYPE support_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE audit_action AS ENUM (
  'login', 'logout', 'vote_cast', 'election_created', 'election_started',
  'election_stopped', 'csv_uploaded', 'candidate_added', 'candidate_approved',
  'results_published', 'password_changed', 'otp_verified', 'admin_created',
  'suspicious_login', 'vote_attempt_duplicate', 'credentials_dispatched',
  'credentials_regenerated', 'admin_election_assigned', 'admin_election_unassigned',
  'admin_deactivated', 'admin_reactivated', 'election_updated'
);

-- ============================================================
-- ADMIN USERS
-- ============================================================

CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'election_admin',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ELECTIONS
-- ============================================================

CREATE TABLE elections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  department VARCHAR(255) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  status election_status DEFAULT 'draft',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  results_published_at TIMESTAMPTZ,
  created_by UUID REFERENCES admins(id) NOT NULL,
  approved_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STUDENTS (loaded from CSV)
-- ============================================================

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  surname VARCHAR(255) NOT NULL,
  index_number VARCHAR(100) UNIQUE,
  reference_number VARCHAR(50) UNIQUE NOT NULL,
  level VARCHAR(20) NOT NULL,
  department VARCHAR(255) NOT NULL,
  program VARCHAR(255) NOT NULL,
  phone_number VARCHAR(30),
  school_email VARCHAR(255),
  password_hash VARCHAR(255),  -- null until first login sets new password
  is_first_login BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,  -- OTP verified
  has_voted BOOLEAN DEFAULT false,
  voted_at TIMESTAMPTZ,
  account_locked BOOLEAN DEFAULT false,
  failed_login_attempts INTEGER DEFAULT 0,
  last_login TIMESTAMPTZ,
  csv_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_students_reference ON students(reference_number);
CREATE INDEX idx_students_election ON students(election_id);
CREATE INDEX idx_students_has_voted ON students(election_id, has_voted);

-- ============================================================
-- POSITIONS
-- ============================================================

CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  max_votes INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CANDIDATES
-- ============================================================

CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  position_id UUID REFERENCES positions(id) ON DELETE CASCADE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  index_number VARCHAR(100),
  program VARCHAR(255),
  level VARCHAR(20),
  bio TEXT,
  image_url VARCHAR(500),
  image_public_id VARCHAR(255),
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES admins(id),
  approved_at TIMESTAMPTZ,
  display_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES admins(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BALLOTS (ANONYMOUS - core privacy table)
-- ============================================================

CREATE TABLE ballots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  position_id UUID REFERENCES positions(id) NOT NULL,
  candidate_id UUID REFERENCES candidates(id) NOT NULL,
  -- NO student_id here — this is the anonymity guarantee
  ballot_token VARCHAR(255) UNIQUE NOT NULL,  -- cryptographic proof of valid vote, not linkable
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voter status is SEPARATE from ballot — tracks who voted without linking to who they voted for
CREATE TABLE voter_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) NOT NULL,
  election_id UUID REFERENCES elections(id) NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  UNIQUE(student_id, election_id)
);

-- ============================================================
-- OTP VERIFICATION
-- ============================================================

CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  purpose otp_purpose NOT NULL,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('sms', 'email')),
  sent_to VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CSV UPLOAD BATCHES
-- ============================================================

CREATE TABLE csv_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  filename VARCHAR(500) NOT NULL,
  total_rows INTEGER DEFAULT 0,
  valid_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'processing',
  error_log JSONB DEFAULT '[]',
  uploaded_by UUID REFERENCES admins(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action audit_action NOT NULL,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('admin', 'student', 'system')),
  actor_id UUID,
  actor_email VARCHAR(255),
  election_id UUID REFERENCES elections(id),
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_election ON audit_logs(election_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  election_id UUID REFERENCES elections(id),
  student_id UUID REFERENCES students(id),
  category VARCHAR(100) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  status support_status DEFAULT 'open',
  priority VARCHAR(20) DEFAULT 'normal',
  assigned_to UUID REFERENCES admins(id),
  resolved_by UUID REFERENCES admins(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE NOT NULL,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('student', 'admin')),
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SESSIONS
-- ============================================================

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('admin', 'student')),
  user_id UUID NOT NULL,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admins_updated BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_elections_updated BEFORE UPDATE ON elections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CREDENTIAL DISPATCH (bulk temp-password generation + delivery queue)
-- Backs services/credentialDispatch.js — bulk regenerate-credentials,
-- the per-student delivery status dashboard, and the Twilio delivery
-- status webhook.
-- ============================================================

CREATE TABLE credential_dispatch (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES admins(id) NOT NULL,

  -- Held only until both channels resolve, so a retry of one channel never
  -- mints a second, different password than the one the other channel sent.
  pending_plaintext TEXT,

  email_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  email_error TEXT,

  sms_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  sms_error TEXT,
  sms_message_sid VARCHAR(64),
  sms_delivery_status VARCHAR(20), -- null until Twilio's webhook reports queued/sent/delivered/undelivered/failed
  sms_delivery_error TEXT,
  sms_delivered_at TIMESTAMPTZ,

  blocked_no_contact BOOLEAN NOT NULL DEFAULT false, -- true when student has neither email nor phone on file
  attempts INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Required by enqueueForElection's ON CONFLICT clause: Postgres needs an
-- index whose definition exactly matches the conflict target, predicate
-- included, or the INSERT ... ON CONFLICT ... DO NOTHING will error out.
-- This also IS the mechanism that makes enqueueing idempotent — a student
-- already mid-flight (still pending on either channel) can't get a second
-- row queued alongside the first.
CREATE UNIQUE INDEX idx_credential_dispatch_one_active_per_student
  ON credential_dispatch(student_id)
  WHERE blocked_no_contact = false AND (email_status = 'pending' OR sms_status = 'pending');

CREATE INDEX idx_credential_dispatch_election ON credential_dispatch(election_id);
CREATE INDEX idx_credential_dispatch_sms_sid ON credential_dispatch(sms_message_sid) WHERE sms_message_sid IS NOT NULL;

CREATE TRIGGER trg_credential_dispatch_updated BEFORE UPDATE ON credential_dispatch FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ADMIN ELECTION ASSIGNMENTS
-- Scopes non-super_admin admins (election_admin, observer) to only the
-- specific election(s) they've been assigned to. super_admin bypasses
-- this entirely and always has full access — no row needed for them.
-- Many-to-many: one admin can be assigned to several elections over time
-- (e.g. running both this year's and next year's departmental election).
-- ============================================================

CREATE TABLE admin_election_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, election_id)
);

CREATE INDEX idx_admin_election_assignments_admin ON admin_election_assignments(admin_id);
CREATE INDEX idx_admin_election_assignments_election ON admin_election_assignments(election_id);

-- ============================================================
-- SEED: Default Super Admin (password: Admin@2025!)
-- ============================================================

INSERT INTO admins (email, password_hash, full_name, role)
VALUES (
  'superadmin@election.edu.gh',
  crypt('Admin@2025!', gen_salt('bf', 12)),
  'System Super Admin',
  'super_admin'
);
