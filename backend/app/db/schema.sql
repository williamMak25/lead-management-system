-- Ledgerline CRM schema (v2: Odoo-style unified leads/opportunities).
-- Idempotent: safe to run on every startup. Upgrading a v1 database (separate
-- deals/leads/tasks tables) is handled by app/db/migrate.py, which runs right after this.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- configuration -------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  leader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sequence INT NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  -- auto-assignment: which unassigned leads this team takes ({sourceIds, tagIds, minRevenue, countries, types})
  assign_enabled BOOLEAN NOT NULL DEFAULT true,
  assign_domain JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES sales_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_leads INT NOT NULL DEFAULT 30, -- assignment capacity per rolling 30 days, 0 = unlimited
  active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS stages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sequence INT NOT NULL DEFAULT 10,
  is_won BOOLEAN NOT NULL DEFAULT false,
  fold BOOLEAN NOT NULL DEFAULT false,
  requirements TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lost_reasons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS utm_values (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('campaign', 'medium', 'source')),
  name TEXT NOT NULL,
  UNIQUE (kind, name)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ---- leads & opportunities -----------------------------------------------

CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'lead' CHECK (type IN ('lead', 'opportunity')),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,

  -- customer: linked records, plus free-text fields used before conversion
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  partner_name TEXT NOT NULL DEFAULT '',
  function TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',

  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  team_id TEXT REFERENCES sales_teams(id) ON DELETE SET NULL,
  stage_id TEXT REFERENCES stages(id) ON DELETE SET NULL,
  priority INT NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),

  expected_revenue NUMERIC NOT NULL DEFAULT 0,
  probability NUMERIC NOT NULL DEFAULT 0,
  automated_probability NUMERIC NOT NULL DEFAULT 0,
  is_automated_probability BOOLEAN NOT NULL DEFAULT true,

  date_deadline TIMESTAMPTZ,
  date_open TIMESTAMPTZ,
  date_closed TIMESTAMPTZ,
  date_conversion TIMESTAMPTZ,
  date_last_stage_update TIMESTAMPTZ,

  lost_reason_id TEXT REFERENCES lost_reasons(id) ON DELETE SET NULL,
  lost_feedback TEXT NOT NULL DEFAULT '',

  campaign_id TEXT REFERENCES utm_values(id) ON DELETE SET NULL,
  medium_id TEXT REFERENCES utm_values(id) ON DELETE SET NULL,
  source_id TEXT REFERENCES utm_values(id) ON DELETE SET NULL,

  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS scheduled_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'To-Do',
  summary TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  feedback TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- v1 notes tables predate author_id (the rest of their upgrade is in migrate.py)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS author_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- field-change history shown in a record's timeline
CREATE TABLE IF NOT EXISTS lead_tracking (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- global "recent activity" feed on the dashboard
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view TEXT NOT NULL,
  name TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_type_active ON crm_leads(type, active);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_user ON crm_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_team ON crm_leads(team_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_contact ON crm_leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company ON crm_leads(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads(lower(email));
CREATE INDEX IF NOT EXISTS idx_crm_leads_created ON crm_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_sched_act_lead ON scheduled_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_sched_act_contact ON scheduled_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_sched_act_user_due ON scheduled_activities(user_id, due_date) WHERE NOT done;
CREATE INDEX IF NOT EXISTS idx_notes_lead ON notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_tracking_lead ON lead_tracking(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON saved_filters(user_id, view);
