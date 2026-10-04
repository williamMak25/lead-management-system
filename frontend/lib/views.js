// Filter and group-by definitions shared by the Leads and Pipeline views (Odoo's search panel).

function monthRange(offset = 0) {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return [iso(start), iso(end)];
}

// Each preset sets one or more query params; presets touching the same param are mutually exclusive.
export const FILTER_PRESETS = {
  lead: [
    { id: 'mine', label: 'My leads', params: { userId: 'me' } },
    { id: 'unassigned', label: 'Unassigned', params: { userId: 'none' } },
    { divider: true },
    { id: 'late', label: 'Late activities', params: { activity: 'overdue' } },
    { id: 'today', label: "Today's activities", params: { activity: 'today' } },
    { id: 'future', label: 'Future activities', params: { activity: 'planned' } },
    { id: 'noact', label: 'No activity scheduled', params: { activity: 'none' } },
    { divider: true },
    { id: 'hot', label: 'Priority ★★ and up', params: { priority: '2' } },
    { id: 'created-month', label: 'Created this month', params: () => { const [a, b] = monthRange(); return { createdFrom: a, createdTo: b }; } },
    { divider: true },
    { id: 'lost', label: 'Lost', params: { status: 'lost' } },
    { id: 'all', label: 'Active & lost', params: { status: 'all' } },
  ],
  opportunity: [
    { id: 'mine', label: 'My pipeline', params: { userId: 'me' } },
    { id: 'unassigned', label: 'Unassigned', params: { userId: 'none' } },
    { divider: true },
    { id: 'open', label: 'Open', params: { status: 'open' } },
    { id: 'won', label: 'Won', params: { status: 'won' } },
    { id: 'lost', label: 'Lost', params: { status: 'lost' } },
    { divider: true },
    { id: 'late', label: 'Late activities', params: { activity: 'overdue' } },
    { id: 'today', label: "Today's activities", params: { activity: 'today' } },
    { id: 'future', label: 'Future activities', params: { activity: 'planned' } },
    { id: 'noact', label: 'No activity scheduled', params: { activity: 'none' } },
    { divider: true },
    { id: 'hot', label: 'Priority ★★ and up', params: { priority: '2' } },
    { id: 'closing-month', label: 'Closing this month', params: () => { const [a, b] = monthRange(); return { deadlineFrom: a, deadlineTo: b }; } },
    { id: 'closing-next', label: 'Closing next month', params: () => { const [a, b] = monthRange(1); return { deadlineFrom: a, deadlineTo: b }; } },
    { id: 'created-month', label: 'Created this month', params: () => { const [a, b] = monthRange(); return { createdFrom: a, createdTo: b }; } },
  ],
};

export function presetParams(preset) {
  return typeof preset.params === 'function' ? preset.params() : preset.params;
}

export function presetActive(preset, params) {
  const p = presetParams(preset);
  return Object.entries(p).every(([k, v]) => params[k] === v);
}

const month = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, d.toLocaleString('en-US', { month: 'short', year: 'numeric' })];
};
const ref = (o) => (o ? [o.id, o.name] : null);

export const GROUP_BYS = [
  { id: 'stage', label: 'Stage', key: (r) => [ref(r.stage)], sort: (a, b, meta) => stageSeq(meta, a) - stageSeq(meta, b) },
  { id: 'user', label: 'Salesperson', key: (r) => [ref(r.user)] },
  { id: 'team', label: 'Sales team', key: (r) => [ref(r.team)] },
  { id: 'source', label: 'Source', key: (r) => [ref(r.source)] },
  { id: 'medium', label: 'Medium', key: (r) => [ref(r.medium)] },
  { id: 'campaign', label: 'Campaign', key: (r) => [ref(r.campaign)] },
  { id: 'priority', label: 'Priority', key: (r) => [[String(r.priority), r.priority ? '★'.repeat(r.priority) : 'Normal']], sort: (a, b) => Number(b) - Number(a) },
  { id: 'tag', label: 'Tag', key: (r) => (r.tags.length ? r.tags.map((t) => [t.id, t.name]) : [null]) },
  { id: 'lostReason', label: 'Lost reason', key: (r) => [ref(r.lostReason)] },
  { id: 'country', label: 'Country', key: (r) => [r.country ? [r.country.toLowerCase(), r.country] : null] },
  { id: 'created', label: 'Created (month)', key: (r) => [month(r.createdAt)], sort: (a, b) => b.localeCompare(a) },
  { id: 'deadline', label: 'Expected closing (month)', key: (r) => [month(r.dateDeadline)], sort: (a, b) => a.localeCompare(b) },
];

function stageSeq(meta, id) {
  return meta.stages.find((s) => s.id === id)?.sequence ?? 1e9;
}

export function groupRecords(records, groupById, meta) {
  const def = GROUP_BYS.find((g) => g.id === groupById);
  if (!def) return null;
  const groups = new Map();
  for (const r of records) {
    for (const kv of def.key(r)) {
      const [key, label] = kv || ['__none__', 'None'];
      if (!groups.has(key)) groups.set(key, { key, label, records: [], revenue: 0, prorated: 0 });
      const g = groups.get(key);
      g.records.push(r);
      g.revenue += r.expectedRevenue;
      g.prorated += r.proratedRevenue;
    }
  }
  const list = [...groups.values()];
  list.sort((a, b) => {
    if (a.key === '__none__') return 1;
    if (b.key === '__none__') return -1;
    return def.sort ? def.sort(a.key, b.key, meta) : b.records.length - a.records.length || a.label.localeCompare(b.label);
  });
  return list;
}
