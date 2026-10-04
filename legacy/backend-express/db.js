import pg from 'pg';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString =
  process.env.DATABASE_URL || 'postgresql://crm:crm_dev_password@localhost:5432/crm_dev';

export const pool = new Pool({ connectionString });

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const DEAL_STAGES = [
  'New Lead',
  'Contacted',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
];

export const TASK_TYPES = ['Call', 'Email', 'Meeting', 'Follow-up', 'Other'];

export const LEAD_SOURCES = ['Website', 'Referral', 'Cold Call', 'Event', 'Advertisement', 'Other'];

export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Disqualified', 'Converted'];

export async function logActivity(client, { type, message, entityType, entityId }) {
  await (client || pool).query(
    `INSERT INTO activity (id, type, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)`,
    [nanoid(8), type, message, entityType, entityId]
  );
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function daysAgo(n) {
  return daysFromNow(-n);
}

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
}

async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM companies');
  if (rows[0].count > 0) return; // already seeded

  await withTransaction(async (client) => {
    const companySeeds = [
      ['Aurora Freight Co.', 'Logistics', 'aurorafreight.com', '51-200', daysAgo(80)],
      ['Basalt Robotics', 'Manufacturing', 'basaltrobotics.io', '11-50', daysAgo(64)],
      ['Fernwood Health', 'Healthcare', 'fernwoodhealth.com', '201-500', daysAgo(120)],
      ['Cobalt & Vine Retail', 'Retail', 'cobaltvine.com', '1-10', daysAgo(30)],
      ['Meridian Legal Group', 'Legal', 'meridianlegal.com', '11-50', daysAgo(45)],
      ['Northstar Analytics', 'Software', 'northstaranalytics.dev', '51-200', daysAgo(200)],
    ];
    const companies = [];
    for (const [name, industry, website, size, createdAt] of companySeeds) {
      const id = nanoid(8);
      await client.query(
        `INSERT INTO companies (id, name, industry, website, size, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, name, industry, website, size, createdAt]
      );
      companies.push({ id, name });
    }

    const contactSeeds = [
      ['Priya Nandakumar', 'priya.n@aurorafreight.com', '+1 415 555 0148', 'VP Operations', 0],
      ['Diego Marchetti', 'd.marchetti@aurorafreight.com', '+1 415 555 0149', 'Logistics Manager', 0],
      ['Wren Okafor', 'wren@basaltrobotics.io', '+1 212 555 0110', 'Founder', 1],
      ['Sana Blythe', 'sana.blythe@fernwoodhealth.com', '+1 617 555 0177', 'Director of IT', 2],
      ['Tomas Reyes', 't.reyes@fernwoodhealth.com', '+1 617 555 0178', 'Procurement Lead', 2],
      ['Iris Falk', 'iris@cobaltvine.com', '+1 312 555 0192', 'Owner', 3],
      ['Malcolm Deveraux', 'malcolm@meridianlegal.com', '+1 646 555 0133', 'Managing Partner', 4],
      ['Yuki Tanaka', 'yuki.tanaka@northstaranalytics.dev', '+1 206 555 0166', 'Head of Sales', 5],
      ['Odette Villanueva', 'odette@northstaranalytics.dev', '+1 206 555 0167', 'CFO', 5],
    ];
    const contacts = [];
    for (let i = 0; i < contactSeeds.length; i++) {
      const [name, email, phone, title, companyIdx] = contactSeeds[i];
      const id = nanoid(8);
      const tags = i % 3 === 0 ? ['decision-maker'] : [];
      await client.query(
        `INSERT INTO contacts (id, name, email, phone, title, company_id, tags, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, name, email, phone, title, companies[companyIdx].id, tags, daysAgo(70 - i * 3)]
      );
      contacts.push({ id, name });
    }

    const dealSeeds = [
      ['Fleet tracking platform rollout', 0, 0, 42000, 'Negotiation', 15],
      ['Warehouse IoT sensors — Phase 1', 0, 1, 18500, 'Proposal Sent', 22],
      ['Robotics arm service contract', 1, 2, 76000, 'Contacted', 40],
      ['EMR integration package', 2, 3, 125000, 'Won', 5],
      ['Patient portal add-on', 2, 4, 31000, 'New Lead', 60],
      ['POS system refresh', 3, 5, 8600, 'New Lead', 12],
      ['Contract review automation', 4, 6, 27500, 'Proposal Sent', 18],
      ['Analytics dashboard seats — annual', 5, 7, 54000, 'Won', 90],
      ['Data warehouse migration', 5, 8, 61000, 'Lost', 30],
    ];
    const deals = [];
    for (let i = 0; i < dealSeeds.length; i++) {
      const [title, companyIdx, contactIdx, value, stage, closeInDays] = dealSeeds[i];
      const id = nanoid(8);
      const expectedCloseDate = daysFromNow(
        stage === 'Won' || stage === 'Lost' ? -Math.abs(closeInDays) : closeInDays
      );
      const createdAt = daysAgo(90 - i * 5);
      const updatedAt = daysAgo(Math.max(1, 20 - i * 2));
      await client.query(
        `INSERT INTO deals (id, title, company_id, contact_id, value, stage, expected_close_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, title, companies[companyIdx].id, contacts[contactIdx].id, value, stage, expectedCloseDate, createdAt, updatedAt]
      );
      deals.push({ id, title });
    }

    const taskSeeds = [
      ['Call Priya to confirm rollout timeline', 'Call', 0, 0, 1, false],
      ['Send updated proposal PDF', 'Email', 1, 1, -1, false],
      ['Discovery call with Wren', 'Meeting', 2, 2, 2, false],
      ['Check in on EMR go-live', 'Follow-up', 3, 3, 5, false],
      ['Prep demo for patient portal', 'Meeting', 4, 4, 3, false],
      ['Follow up on POS quote', 'Follow-up', 5, 5, -2, false],
      ['Review contract redlines', 'Other', 6, 6, 0, false],
      ['Renewal call — annual seats', 'Call', 7, 7, 10, true],
    ];
    for (let i = 0; i < taskSeeds.length; i++) {
      const [title, type, dealIdx, contactIdx, dueInDays, done] = taskSeeds[i];
      const id = nanoid(8);
      await client.query(
        `INSERT INTO tasks (id, title, type, deal_id, contact_id, due_date, done, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, title, type, deals[dealIdx].id, contacts[contactIdx].id, daysFromNow(dueInDays), done, daysAgo(10 - i)]
      );
    }

    const noteSeeds = [
      [0, 0, "Priya wants a pilot with 5 trucks before committing to the full fleet."],
      [2, 2, "Wren is comparing us against two competitors, price sensitive."],
      [3, 3, "Sana confirmed budget is approved for Q3."],
      [7, 7, "Yuki mentioned they may expand seats by 20% next renewal."],
    ];
    for (let i = 0; i < noteSeeds.length; i++) {
      const [dealIdx, contactIdx, body] = noteSeeds[i];
      const id = nanoid(8);
      await client.query(
        `INSERT INTO notes (id, body, deal_id, contact_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [id, body, deals[dealIdx].id, contacts[contactIdx].id, daysAgo(15 - i * 3)]
      );
    }

    for (const deal of deals) {
      await logActivity(client, {
        type: 'deal_created',
        message: `Deal "${deal.title}" created`,
        entityType: 'deal',
        entityId: deal.id,
      });
    }

    const leadSeeds = [
      ['Harper Voss', 'harper.voss@brightlanefinance.com', '+1 503 555 0121', 'Brightlane Finance', 'Ops Director', 'Website', 'New', 15000, daysAgo(2)],
      ['Callum Reid', 'callum@ridgeportbrew.com', '+1 971 555 0134', 'Ridgeport Brewing Co.', 'Owner', 'Referral', 'Contacted', 9000, daysAgo(5)],
      ['Nadia Farouk', 'nadia.farouk@stellarhealth.io', '+1 720 555 0187', 'Stellar Health', 'VP Engineering', 'Event', 'Qualified', 48000, daysAgo(9)],
      ['Owen Blackwood', 'owen.b@ferrousmetal.com', '+1 314 555 0165', 'Ferrous Metalworks', 'Plant Manager', 'Cold Call', 'New', 22000, daysAgo(1)],
      ['Simone Achterberg', 'simone@lumen-creative.studio', '+1 646 555 0198', 'Lumen Creative Studio', 'Founder', 'Advertisement', 'Disqualified', 4000, daysAgo(20)],
    ];
    for (const [name, email, phone, companyName, title, source, status, value, createdAt] of leadSeeds) {
      const id = nanoid(8);
      await client.query(
        `INSERT INTO leads (id, name, email, phone, company_name, title, source, status, value, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        [id, name, email, phone, companyName, title, source, status, value, createdAt]
      );
      await logActivity(client, { type: 'lead_created', message: `Lead "${name}" added`, entityType: 'lead', entityId: id });
    }
  });
}

export async function init() {
  await migrate();
  await seed();
}

await init();

export default pool;
