import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query, withTransaction, logActivity } from '../db.js';
import { mapNote } from '../db/mappers.js';

const router = Router();

router.get('/', async (req, res) => {
  const { dealId, contactId, leadId } = req.query;
  const conditions = [];
  const params = [];
  if (dealId) {
    params.push(dealId);
    conditions.push(`deal_id = $${params.length}`);
  }
  if (contactId) {
    params.push(contactId);
    conditions.push(`contact_id = $${params.length}`);
  }
  if (leadId) {
    params.push(leadId);
    conditions.push(`lead_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`SELECT * FROM notes ${where} ORDER BY created_at DESC`, params);
  res.json(rows.map(mapNote));
});

router.post('/', async (req, res) => {
  const { body, dealId = null, contactId = null, leadId = null } = req.body;
  if (!body) return res.status(400).json({ error: 'body is required' });
  const id = nanoid(8);
  const note = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO notes (id, body, deal_id, contact_id, lead_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, body, dealId, contactId, leadId]
    );
    await logActivity(client, { type: 'note_added', message: 'Note added', entityType: 'note', entityId: id });
    return rows[0];
  });
  res.status(201).json(mapNote(note));
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM notes WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
