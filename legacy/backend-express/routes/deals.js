import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query, withTransaction, logActivity, DEAL_STAGES } from '../db.js';
import { mapDeal, mapNote, mapTask } from '../db/mappers.js';

const router = Router();

function enrich(row) {
  const deal = mapDeal(row);
  deal.company = row.company_name ? { id: row.company_id, name: row.company_name } : null;
  deal.contact = row.contact_name ? { id: row.contact_id, name: row.contact_name } : null;
  return deal;
}

const SELECT_WITH_RELATIONS = `
  SELECT deals.*, companies.name AS company_name, contacts.name AS contact_name
  FROM deals
  LEFT JOIN companies ON companies.id = deals.company_id
  LEFT JOIN contacts ON contacts.id = deals.contact_id
`;

router.get('/stages', (req, res) => res.json(DEAL_STAGES));

router.get('/', async (req, res) => {
  const { stage, companyId, contactId } = req.query;
  const conditions = [];
  const params = [];
  if (stage) {
    params.push(stage);
    conditions.push(`deals.stage = $${params.length}`);
  }
  if (companyId) {
    params.push(companyId);
    conditions.push(`deals.company_id = $${params.length}`);
  }
  if (contactId) {
    params.push(contactId);
    conditions.push(`deals.contact_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_WITH_RELATIONS} ${where} ORDER BY deals.created_at DESC`, params);
  res.json(rows.map(enrich));
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`${SELECT_WITH_RELATIONS} WHERE deals.id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Deal not found' });
  const [notes, tasks] = await Promise.all([
    query('SELECT * FROM notes WHERE deal_id = $1 ORDER BY created_at DESC', [req.params.id]),
    query('SELECT * FROM tasks WHERE deal_id = $1', [req.params.id]),
  ]);
  res.json({
    ...enrich(rows[0]),
    notes: notes.rows.map(mapNote),
    tasks: tasks.rows.map(mapTask),
  });
});

router.post('/', async (req, res) => {
  const { title, companyId = null, contactId = null, value = 0, stage = 'New Lead', expectedCloseDate = null } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const id = nanoid(8);
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO deals (id, title, company_id, contact_id, value, stage, expected_close_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, title, companyId, contactId, Number(value) || 0, stage, expectedCloseDate]
    );
    await logActivity(client, { type: 'deal_created', message: `Deal "${title}" created`, entityType: 'deal', entityId: id });
  });
  const { rows } = await query(`${SELECT_WITH_RELATIONS} WHERE deals.id = $1`, [id]);
  res.status(201).json(enrich(rows[0]));
});

router.put('/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Deal not found' });
  const before = mapDeal(existingRows[0]);
  const updated = { ...before, ...req.body, id: req.params.id };

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE deals SET title = $1, company_id = $2, contact_id = $3, value = $4, stage = $5, expected_close_date = $6, updated_at = now()
       WHERE id = $7`,
      [updated.title, updated.companyId, updated.contactId, Number(updated.value) || 0, updated.stage, updated.expectedCloseDate, req.params.id]
    );
    if (req.body.stage && req.body.stage !== before.stage) {
      await logActivity(client, {
        type: 'deal_stage_changed',
        message: `"${updated.title}" moved from ${before.stage} to ${updated.stage}`,
        entityType: 'deal',
        entityId: req.params.id,
      });
    }
  });

  const { rows } = await query(`${SELECT_WITH_RELATIONS} WHERE deals.id = $1`, [req.params.id]);
  res.json(enrich(rows[0]));
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM deals WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
