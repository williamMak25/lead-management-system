import { Router } from 'express';
import { query, DEAL_STAGES } from '../db.js';
import { mapActivity } from '../db/mappers.js';

const router = Router();

router.get('/summary', async (req, res) => {
  const [
    companyCount,
    contactCount,
    leadCounts,
    dealCounts,
    stageRows,
    taskCounts,
    revenueRows,
    activityRows,
  ] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM companies'),
    query('SELECT COUNT(*)::int AS count FROM contacts'),
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('Converted', 'Disqualified'))::int AS open
      FROM leads
    `),
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('Won', 'Lost'))::int AS open,
        COALESCE(SUM(value) FILTER (WHERE stage NOT IN ('Won', 'Lost')), 0) AS pipeline_value,
        COALESCE(SUM(value) FILTER (WHERE stage = 'Won'), 0) AS won_value,
        COUNT(*) FILTER (WHERE stage = 'Won')::int AS won_count,
        COUNT(*) FILTER (WHERE stage = 'Lost')::int AS lost_count
      FROM deals
    `),
    query(`SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value), 0) AS value FROM deals GROUP BY stage`),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE NOT done AND due_date < now())::int AS overdue,
        COUNT(*) FILTER (WHERE NOT done AND due_date >= now())::int AS upcoming
      FROM tasks
    `),
    query(`
      SELECT to_char(COALESCE(updated_at, created_at), 'YYYY-MM') AS month_key, COALESCE(SUM(value), 0) AS value
      FROM deals
      WHERE stage = 'Won'
      GROUP BY month_key
    `),
    query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 12'),
  ]);

  const stageByName = Object.fromEntries(stageRows.rows.map((r) => [r.stage, r]));
  const stageBreakdown = DEAL_STAGES.map((stage) => ({
    stage,
    count: stageByName[stage]?.count ?? 0,
    value: Number(stageByName[stage]?.value ?? 0),
  }));

  const revenueByMonthKey = Object.fromEntries(revenueRows.rows.map((r) => [r.month_key, Number(r.value)]));
  const months = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const md = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push({
      key: `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}`,
      label: md.toLocaleString('en-US', { month: 'short' }),
    });
  }
  const revenueByMonth = months.map(({ key, label }) => ({
    month: label,
    value: revenueByMonthKey[key] ?? 0,
  }));

  const dc = dealCounts.rows[0];
  const tc = taskCounts.rows[0];
  const lc = leadCounts.rows[0];
  const winRate = dc.won_count + dc.lost_count > 0
    ? Math.round((dc.won_count / (dc.won_count + dc.lost_count)) * 100)
    : 0;

  res.json({
    counts: {
      companies: companyCount.rows[0].count,
      contacts: contactCount.rows[0].count,
      openDeals: dc.open,
      totalDeals: dc.total,
      openLeads: lc.open,
      totalLeads: lc.total,
    },
    pipelineValue: Number(dc.pipeline_value),
    wonValue: Number(dc.won_value),
    winRate,
    stageBreakdown,
    overdueTasks: tc.overdue,
    upcomingTasks: tc.upcoming,
    revenueByMonth,
    recentActivity: activityRows.rows.map(mapActivity),
  });
});

export default router;
