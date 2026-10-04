import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query, withTransaction, logActivity, TASK_TYPES } from '../db.js';
import { mapTask } from '../db/mappers.js';

const router = Router();

function enrich(row) {
  const task = mapTask(row);
  task.deal = row.deal_title ? { id: row.deal_id, title: row.deal_title } : null;
  task.contact = row.contact_name ? { id: row.contact_id, name: row.contact_name } : null;
  return task;
}

const SELECT_WITH_RELATIONS = `
  SELECT tasks.*, deals.title AS deal_title, contacts.name AS contact_name
  FROM tasks
  LEFT JOIN deals ON deals.id = tasks.deal_id
  LEFT JOIN contacts ON contacts.id = tasks.contact_id
`;

router.get('/types', (req, res) => res.json(TASK_TYPES));

router.get('/', async (req, res) => {
  const { done, dealId, contactId, overdue } = req.query;
  const conditions = [];
  const params = [];
  if (done !== undefined) {
    params.push(done === 'true');
    conditions.push(`tasks.done = $${params.length}`);
  }
  if (dealId) {
    params.push(dealId);
    conditions.push(`tasks.deal_id = $${params.length}`);
  }
  if (contactId) {
    params.push(contactId);
    conditions.push(`tasks.contact_id = $${params.length}`);
  }
  if (overdue === 'true') {
    conditions.push(`tasks.done = false AND tasks.due_date < now()`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_WITH_RELATIONS} ${where} ORDER BY tasks.due_date ASC`, params);
  res.json(rows.map(enrich));
});

router.post('/', async (req, res) => {
  const { title, type = 'Other', dealId = null, contactId = null, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const id = nanoid(8);
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO tasks (id, title, type, deal_id, contact_id, due_date, done)
       VALUES ($1, $2, $3, $4, $5, $6, false)`,
      [id, title, type, dealId, contactId, dueDate || new Date().toISOString()]
    );
    await logActivity(client, { type: 'task_created', message: `Task "${title}" created`, entityType: 'task', entityId: id });
  });
  const { rows } = await query(`${SELECT_WITH_RELATIONS} WHERE tasks.id = $1`, [id]);
  res.status(201).json(enrich(rows[0]));
});

router.put('/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Task not found' });
  const before = mapTask(existingRows[0]);
  const updated = { ...before, ...req.body, id: req.params.id };

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE tasks SET title = $1, type = $2, deal_id = $3, contact_id = $4, due_date = $5, done = $6 WHERE id = $7`,
      [updated.title, updated.type, updated.dealId, updated.contactId, updated.dueDate, updated.done, req.params.id]
    );
    if (req.body.done === true && !before.done) {
      await logActivity(client, { type: 'task_completed', message: `Task "${updated.title}" completed`, entityType: 'task', entityId: req.params.id });
    }
  });

  const { rows } = await query(`${SELECT_WITH_RELATIONS} WHERE tasks.id = $1`, [req.params.id]);
  res.json(enrich(rows[0]));
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
