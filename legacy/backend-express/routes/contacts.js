import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query, withTransaction, logActivity } from '../db.js';
import { mapContact, mapDeal, mapNote, mapTask } from '../db/mappers.js';

const router = Router();

function enrich(row) {
  const contact = mapContact(row);
  contact.company = row.company_name ? { id: row.company_id, name: row.company_name } : null;
  return contact;
}

const SELECT_WITH_COMPANY = `
  SELECT contacts.*, companies.name AS company_name
  FROM contacts
  LEFT JOIN companies ON companies.id = contacts.company_id
`;

router.get('/', async (req, res) => {
  const { q, companyId } = req.query;
  const conditions = [];
  const params = [];
  if (companyId) {
    params.push(companyId);
    conditions.push(`contacts.company_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    conditions.push(`(LOWER(contacts.name) LIKE $${params.length} OR LOWER(contacts.email) LIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_WITH_COMPANY} ${where} ORDER BY contacts.created_at DESC`, params);
  res.json(rows.map(enrich));
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`${SELECT_WITH_COMPANY} WHERE contacts.id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
  const [deals, notes, tasks] = await Promise.all([
    query('SELECT * FROM deals WHERE contact_id = $1', [req.params.id]),
    query('SELECT * FROM notes WHERE contact_id = $1 ORDER BY created_at DESC', [req.params.id]),
    query('SELECT * FROM tasks WHERE contact_id = $1', [req.params.id]),
  ]);
  res.json({
    ...enrich(rows[0]),
    deals: deals.rows.map(mapDeal),
    notes: notes.rows.map(mapNote),
    tasks: tasks.rows.map(mapTask),
  });
});

router.post('/', async (req, res) => {
  const { name, email = '', phone = '', title = '', companyId = null, tags = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid(8);
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO contacts (id, name, email, phone, title, company_id, tags) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, email, phone, title, companyId, tags]
    );
    await logActivity(client, { type: 'contact_created', message: `Contact "${name}" added`, entityType: 'contact', entityId: id });
  });
  const { rows } = await query(`${SELECT_WITH_COMPANY} WHERE contacts.id = $1`, [id]);
  res.status(201).json(enrich(rows[0]));
});

router.put('/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Contact not found' });
  const existing = mapContact(existingRows[0]);
  const updated = { ...existing, ...req.body, id: req.params.id };
  await query(
    `UPDATE contacts SET name = $1, email = $2, phone = $3, title = $4, company_id = $5, tags = $6 WHERE id = $7`,
    [updated.name, updated.email, updated.phone, updated.title, updated.companyId, updated.tags, req.params.id]
  );
  const { rows } = await query(`${SELECT_WITH_COMPANY} WHERE contacts.id = $1`, [req.params.id]);
  res.json(enrich(rows[0]));
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
