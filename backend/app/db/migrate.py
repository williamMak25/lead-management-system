"""One-time upgrade of a v1 database (separate deals / leads / tasks tables) to the unified v2 model.

Runs inside the startup transaction, after schema.sql has created the v2 tables. Old rows keep their
ids, so links to deals and leads keep working. The v1 tables are renamed to legacy_* rather than
dropped, so nothing is lost if something needs to be checked later.
"""

import logging

log = logging.getLogger(__name__)

# Rows created here get short random ids, same shape as nanoid's.
_ID = "substr(md5(random()::text || clock_timestamp()::text), 1, 8)"

V1_STAGES = ["New Lead", "Contacted", "Proposal Sent", "Negotiation", "Won"]

MIGRATION_SQL = f"""
-- pipeline stages: keep the names the team already uses ("Lost" becomes a status, not a stage)
INSERT INTO stages (id, name, sequence, is_won)
SELECT {_ID}, s.name, s.seq * 10, s.name = 'Won'
FROM unnest(ARRAY{V1_STAGES!r}::text[]) WITH ORDINALITY AS s(name, seq)
WHERE NOT EXISTS (SELECT 1 FROM stages);

INSERT INTO lost_reasons (id, name)
SELECT {_ID}, 'Disqualified' WHERE NOT EXISTS (SELECT 1 FROM lost_reasons WHERE name = 'Disqualified');

INSERT INTO utm_values (id, kind, name)
SELECT {_ID}, 'source', src FROM (SELECT DISTINCT source AS src FROM leads WHERE source <> '') s
ON CONFLICT (kind, name) DO NOTHING;

-- deals -> opportunities
INSERT INTO crm_leads (
  id, type, name, active, contact_id, company_id, contact_name, partner_name, function, email, phone,
  expected_revenue, stage_id, date_deadline, probability, is_automated_probability,
  date_closed, date_conversion, date_last_stage_update, created_at, updated_at
)
SELECT d.id, 'opportunity', d.title, d.stage <> 'Lost', d.contact_id, d.company_id,
       COALESCE(k.name, ''), COALESCE(c.name, ''), COALESCE(k.title, ''), COALESCE(k.email, ''), COALESCE(k.phone, ''),
       d.value,
       COALESCE(s.id, (SELECT id FROM stages ORDER BY sequence LIMIT 1)),
       d.expected_close_date,
       CASE d.stage WHEN 'Won' THEN 100 WHEN 'Lost' THEN 0 ELSE 10 END,
       d.stage NOT IN ('Won', 'Lost'),
       CASE WHEN d.stage IN ('Won', 'Lost') THEN d.updated_at END,
       d.created_at, d.updated_at, d.created_at, d.updated_at
FROM deals d
LEFT JOIN contacts k ON k.id = d.contact_id
LEFT JOIN companies c ON c.id = d.company_id
LEFT JOIN stages s ON s.name = d.stage
ON CONFLICT (id) DO NOTHING;

-- open leads -> leads (converted ones already exist as their deal)
INSERT INTO crm_leads (
  id, type, name, active, contact_name, partner_name, function, email, phone, expected_revenue,
  stage_id, source_id, probability, is_automated_probability, lost_reason_id, date_closed, created_at, updated_at
)
SELECT l.id, 'lead',
       CASE WHEN l.company_name <> '' THEN l.name || ' — ' || l.company_name ELSE l.name END,
       l.status <> 'Disqualified',
       l.name, l.company_name, l.title, l.email, l.phone, l.value,
       (SELECT id FROM stages ORDER BY sequence LIMIT 1),
       (SELECT id FROM utm_values WHERE kind = 'source' AND name = l.source),
       CASE WHEN l.status = 'Disqualified' THEN 0 ELSE 10 END,
       l.status <> 'Disqualified',
       CASE WHEN l.status = 'Disqualified' THEN (SELECT id FROM lost_reasons WHERE name = 'Disqualified' LIMIT 1) END,
       CASE WHEN l.status = 'Disqualified' THEN l.updated_at END,
       l.created_at, l.updated_at
FROM leads l
WHERE l.status <> 'Converted'
ON CONFLICT (id) DO NOTHING;

-- keep the old lead status visible as a tag
INSERT INTO tags (id, name, color)
SELECT {_ID}, st, CASE st WHEN 'Contacted' THEN 3 ELSE 10 END
FROM (SELECT DISTINCT status AS st FROM leads WHERE status IN ('Contacted', 'Qualified')) s
ON CONFLICT (name) DO NOTHING;
INSERT INTO lead_tags (lead_id, tag_id)
SELECT l.id, t.id FROM leads l JOIN tags t ON t.name = l.status
WHERE l.status IN ('Contacted', 'Qualified')
ON CONFLICT DO NOTHING;

-- converted leads: carry their source and conversion date over to the resulting opportunity
UPDATE crm_leads o
SET source_id = (SELECT id FROM utm_values WHERE kind = 'source' AND name = l.source),
    date_conversion = l.updated_at,
    created_at = LEAST(o.created_at, l.created_at)
FROM leads l
WHERE l.status = 'Converted' AND l.converted_deal_id = o.id;

-- tasks -> scheduled activities
INSERT INTO scheduled_activities (id, lead_id, contact_id, activity_type, summary, due_date, done, done_at, created_at)
SELECT t.id, t.deal_id, t.contact_id,
       CASE t.type WHEN 'Follow-up' THEN 'To-Do' WHEN 'Other' THEN 'To-Do' ELSE t.type END,
       t.title, t.due_date::date, t.done, CASE WHEN t.done THEN t.created_at END, t.created_at
FROM tasks t
WHERE t.deal_id IS NULL OR EXISTS (SELECT 1 FROM crm_leads WHERE id = t.deal_id)
ON CONFLICT (id) DO NOTHING;

-- notes: deal_id / lead_id(-> v1 leads) collapse into lead_id(-> crm_leads)
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_lead_id_fkey;
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_deal_id_fkey;
UPDATE notes n SET lead_id = l.converted_deal_id
FROM leads l WHERE n.lead_id = l.id AND l.status = 'Converted';
UPDATE notes SET lead_id = deal_id WHERE deal_id IS NOT NULL;
UPDATE notes SET lead_id = NULL WHERE lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_leads WHERE id = notes.lead_id);
ALTER TABLE notes DROP COLUMN deal_id;
ALTER TABLE notes ADD CONSTRAINT notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

UPDATE activity SET entity_type = 'lead' WHERE entity_type = 'deal';

ALTER TABLE tasks RENAME TO legacy_tasks;
ALTER TABLE leads RENAME TO legacy_leads;
ALTER TABLE deals RENAME TO legacy_deals;
"""


async def migrate_v1(raw_conn) -> bool:
    """Upgrade in place if this is a v1 database. Returns True if a migration ran."""
    is_v1 = await raw_conn.fetchval("SELECT to_regclass('public.deals') IS NOT NULL")
    if not is_v1:
        return False
    log.warning("Upgrading v1 database (deals/leads/tasks) to unified leads & opportunities")
    await raw_conn.execute(MIGRATION_SQL)
    return True
