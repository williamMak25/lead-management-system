import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query, withTransaction, logActivity, LEAD_SOURCES, LEAD_STATUSES } from '../db.js';
import { mapLead, mapNote } from '../db/mappers.js';

const router = Router();

router.get('/sources', (req, res) => res.json(LEAD_SOURCES));
router.get('/statuses', (req, res) => res.json(LEAD_STATUSES));

router.get('/', async (req, res) => {
  const { q, status } = req.query;
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    conditions.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(company_name) LIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`SELECT * FROM leads ${where} ORDER BY created_at DESC`, params);
  res.json(rows.map(mapLead));
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  const notes = await query('SELECT * FROM notes WHERE lead_id = $1 ORDER BY created_at DESC', [req.params.id]);
  res.json({ ...mapLead(rows[0]), notes: notes.rows.map(mapNote) });
});

router.post('/', async (req, res) => {
  const { name, email = '', phone = '', companyName = '', title = '', source = 'Other', value = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid(8);
  const lead = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO leads (id, name, email, phone, company_name, title, source, value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, name, email, phone, companyName, title, source, Number(value) || 0]
    );
    await logActivity(client, { type: 'lead_created', message: `Lead "${name}" added`, entityType: 'lead', entityId: id });
    return rows[0];
  });
  res.status(201).json(mapLead(lead));
});

router.put('/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  const before = mapLead(existingRows[0]);
  if (before.status === 'Converted') {
    return res.status(400).json({ error: 'Converted leads cannot be edited' });
  }
  if (req.body.status === 'Converted') {
    return res.status(400).json({ error: 'Use POST /leads/:id/convert to convert a lead' });
  }
  const updated = { ...before, ...req.body, id: req.params.id };

  const lead = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE leads SET name = $1, email = $2, phone = $3, company_name = $4, title = $5, source = $6, status = $7, value = $8, updated_at = now()
       WHERE id = $9 RETURNING *`,
      [updated.name, updated.email, updated.phone, updated.companyName, updated.title, updated.source, updated.status, Number(updated.value) || 0, req.params.id]
    );
    if (req.body.status && req.body.status !== before.status) {
      await logActivity(client, {
        type: 'lead_status_changed',
        message: `"${updated.name}" moved from ${before.status} to ${updated.status}`,
        entityType: 'lead',
        entityId: req.params.id,
      });
    }
    return rows[0];
  });
  res.json(mapLead(lead));
});

router.post('/:id/convert', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  const lead = mapLead(existingRows[0]);
  if (lead.status === 'Converted') return res.status(400).json({ error: 'Lead is already converted' });

  const { companyId = null, value, dealTitle } = req.body;

  const result = await withTransaction(async (client) => {
    let resolvedCompanyId = companyId;
    let company = null;
    if (!resolvedCompanyId && lead.companyName.trim()) {
      const { rows } = await client.query(
        `INSERT INTO companies (id, name) VALUES ($1, $2) RETURNING *`,
        [nanoid(8), lead.companyName.trim()]
      );
      company = rows[0];
      resolvedCompanyId = company.id;
    } else if (resolvedCompanyId) {
      const { rows } = await client.query('SELECT * FROM companies WHERE id = $1', [resolvedCompanyId]);
      company = rows[0] || null;
    }

    const { rows: contactRows } = await client.query(
      `INSERT INTO contacts (id, name, email, phone, title, company_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nanoid(8), lead.name, lead.email, lead.phone, lead.title, resolvedCompanyId]
    );
    const contact = contactRows[0];

    const { rows: dealRows } = await client.query(
      `INSERT INTO deals (id, title, company_id, contact_id, value, stage) VALUES ($1, $2, $3, $4, $5, 'New Lead') RETURNING *`,
      [nanoid(8), dealTitle || `${lead.name}${company ? ` — ${company.name}` : ''}`, resolvedCompanyId, contact.id, Number(value ?? lead.value) || 0]
    );
    const deal = dealRows[0];

    const { rows: leadRows } = await client.query(
      `UPDATE leads SET status = 'Converted', converted_company_id = $1, converted_contact_id = $2, converted_deal_id = $3, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [resolvedCompanyId, contact.id, deal.id, req.params.id]
    );

    await logActivity(client, {
      type: 'lead_converted',
      message: `Lead "${lead.name}" converted to a deal`,
      entityType: 'lead',
      entityId: req.params.id,
    });

    return { lead: leadRows[0], company, contact, deal };
  });

  res.json({
    lead: mapLead(result.lead),
    companyId: result.company?.id ?? null,
    contactId: result.contact.id,
    dealId: result.deal.id,
  });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM leads WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
