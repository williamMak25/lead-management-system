import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query, withTransaction, logActivity } from '../db.js';
import { mapCompany, mapContact, mapDeal } from '../db/mappers.js';

const router = Router();

router.get('/', async (req, res) => {
  const { q } = req.query;
  const { rows } = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM contacts k WHERE k.company_id = c.id)::int AS contact_count,
       (SELECT COUNT(*) FROM deals d WHERE d.company_id = c.id)::int AS deal_count
     FROM companies c
     WHERE $1::text IS NULL OR c.name ILIKE '%' || $1 || '%'
     ORDER BY c.created_at DESC`,
    [q || null]
  );
  res.json(rows.map((row) => ({ ...mapCompany(row), contactCount: row.contact_count, dealCount: row.deal_count })));
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Company not found' });
  const [contacts, deals] = await Promise.all([
    query('SELECT * FROM contacts WHERE company_id = $1', [req.params.id]),
    query('SELECT * FROM deals WHERE company_id = $1', [req.params.id]),
  ]);
  res.json({
    ...mapCompany(rows[0]),
    contacts: contacts.rows.map(mapContact),
    deals: deals.rows.map(mapDeal),
  });
});

router.post('/', async (req, res) => {
  const { name, industry = '', website = '', size = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid(8);
  const company = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO companies (id, name, industry, website, size) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, name, industry, website, size]
    );
    await logActivity(client, { type: 'company_created', message: `Company "${name}" added`, entityType: 'company', entityId: id });
    return rows[0];
  });
  res.status(201).json(mapCompany(company));
});

router.put('/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Company not found' });
  const existing = mapCompany(existingRows[0]);
  const updated = { ...existing, ...req.body, id: req.params.id };
  const { rows } = await query(
    `UPDATE companies SET name = $1, industry = $2, website = $3, size = $4 WHERE id = $5 RETURNING *`,
    [updated.name, updated.industry, updated.website, updated.size, req.params.id]
  );
  res.json(mapCompany(rows[0]));
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM companies WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
