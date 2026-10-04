'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { currency } from '@/lib/format';
import { useMeta } from '@/context/MetaContext';
import { Button } from '@/components/ui';

const PRESETS = [
  { id: 'pipeline', label: 'Pipeline by stage', q: { rows: 'stage', cols: 'user', measure: 'expected_revenue', type: 'opportunity', status: 'open' } },
  { id: 'forecast', label: 'Forecast', q: { rows: 'deadline_month', cols: '', measure: 'prorated_revenue', type: 'opportunity', status: 'open' } },
  { id: 'winloss', label: 'Win / loss by salesperson', q: { rows: 'user', cols: 'status', measure: 'count', type: 'opportunity', status: 'all' } },
  { id: 'winrate', label: 'Win rate by source', q: { rows: 'source', cols: '', measure: 'win_rate', type: '', status: 'all' } },
  { id: 'lost', label: 'Lost reasons', q: { rows: 'lost_reason', cols: 'type', measure: 'count', type: '', status: 'lost' } },
  { id: 'conversion', label: 'Lead conversion', q: { rows: 'created_month', cols: '', measure: 'conversion_rate', type: '', status: 'all' } },
  { id: 'won-month', label: 'Won revenue by month', q: { rows: 'closed_month', cols: 'team', measure: 'won_revenue', type: 'opportunity', status: 'won' } },
];
const SERIES_COLORS = ['#2F6F5E', '#C9A227', '#B54F35', '#3B5B92', '#6B4A8A', '#2B7A85', '#8A6A45', '#A13A5C', '#5848A0', '#B5651D'];
const MONEY = new Set(['expected_revenue', 'prorated_revenue', 'won_revenue']);
const PCT = new Set(['avg_probability', 'win_rate', 'conversion_rate']);

/** Odoo-style analysis: pick rows, optional columns and a measure; get a chart and a pivot table. */
export default function Reports() {
  const meta = useMeta();
  const [options, setOptions] = useState({ dimensions: [], measures: [] });
  const [q, setQ] = useState(PRESETS[0].q);
  const [preset, setPreset] = useState(PRESETS[0].id);
  const [extra, setExtra] = useState({ userId: '', teamId: '', createdFrom: '', createdTo: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.reportOptions().then(setOptions);
  }, []);

  useEffect(() => {
    api
      .report({ ...q, ...extra })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [q, extra]);

  const fmt = (v) => (MONEY.has(q.measure) ? currency(v) : PCT.has(q.measure) ? `${v}%` : v?.toLocaleString?.() ?? v);
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.rows.map((r) => {
      const point = { label: r.label };
      for (const c of data.cols) point[c.key] = data.cells[r.key]?.[c.key] ?? 0;
      return point;
    });
  }, [data]);
  const stacked = q.cols && !PCT.has(q.measure);

  function update(patch) {
    setPreset(null);
    setQ((prev) => ({ ...prev, ...patch }));
  }

  function downloadCsv() {
    if (!data) return;
    const header = [options.dimensions.find((d) => d.key === q.rows)?.label || q.rows, ...data.cols.map((c) => c.label), ...(q.cols ? ['Total'] : [])];
    const lines = data.rows.map((r) => [r.label, ...data.cols.map((c) => data.cells[r.key]?.[c.key] ?? ''), ...(q.cols ? [data.rowTotals[r.key]] : [])]);
    lines.push(['Total', ...data.cols.map((c) => data.colTotals[c.key] ?? ''), ...(q.cols ? [data.total] : [])]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `report-${q.rows}${q.cols ? `-by-${q.cols}` : ''}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const sel = (value, onChange, opts, empty) => (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="text-xs px-2 py-1.5 rounded-md border border-black/10 bg-card">
      {empty && <option value="">{empty}</option>}
      {opts.map((o) => (
        <option key={o.key ?? o.id} value={o.key ?? o.id}>
          {o.label ?? o.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Reports</h1>
          <p className="text-sm text-ink-muted mt-0.5">Pipeline, forecast, win/loss and conversion analysis.</p>
        </div>
        <Button onClick={downloadCsv} disabled={!data}>
          Download CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPreset(p.id);
              setQ(p.q);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${preset === p.id ? 'bg-ink text-paper border-ink' : 'border-black/10 text-ink-soft hover:border-ink/30'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="index-card rounded-lg p-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-muted">Rows</span>
        {sel(q.rows, (v) => update({ rows: v }), options.dimensions)}
        <span className="text-ink-muted">Columns</span>
        {sel(q.cols, (v) => update({ cols: v }), options.dimensions, '— none —')}
        <span className="text-ink-muted">Measure</span>
        {sel(q.measure, (v) => update({ measure: v }), options.measures)}
        <span className="w-px h-5 bg-black/10 mx-1" />
        {sel(q.type, (v) => update({ type: v }), [{ key: 'lead', label: 'Leads' }, { key: 'opportunity', label: 'Opportunities' }], 'Leads & opportunities')}
        {sel(q.status, (v) => update({ status: v }), [
          { key: 'all', label: 'All statuses' },
          { key: 'active', label: 'Active' },
          { key: 'open', label: 'Open' },
          { key: 'won', label: 'Won' },
          { key: 'lost', label: 'Lost' },
        ])}
        {sel(extra.userId, (v) => setExtra((x) => ({ ...x, userId: v })), meta.users, 'Any salesperson')}
        {sel(extra.teamId, (v) => setExtra((x) => ({ ...x, teamId: v })), meta.teams, 'Any team')}
        <span className="text-ink-muted">Created</span>
        <input type="date" value={extra.createdFrom} onChange={(e) => setExtra((x) => ({ ...x, createdFrom: e.target.value }))} className="px-2 py-1 rounded-md border border-black/10 bg-card" />
        <span className="text-ink-muted">→</span>
        <input type="date" value={extra.createdTo} onChange={(e) => setExtra((x) => ({ ...x, createdTo: e.target.value }))} className="px-2 py-1 rounded-md border border-black/10 bg-card" />
      </div>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}

      {data && (
        <>
          <div className="index-card rounded-lg p-5">
            <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-4">
              {data.measure.label} · {data.recordCount} records
            </p>
            {data.rows.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-10">No records match.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DCDFD3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} interval={0} angle={data.rows.length > 8 ? -30 : 0} textAnchor={data.rows.length > 8 ? 'end' : 'middle'} height={data.rows.length > 8 ? 60 : 30} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => (MONEY.has(q.measure) ? `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}` : PCT.has(q.measure) ? `${v}%` : v)} />
                  <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: 'rgba(47,111,94,0.08)' }} />
                  {q.cols && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {data.cols.map((c, i) => (
                    <Bar key={c.key} dataKey={c.key} name={c.label} stackId={stacked ? 'a' : undefined} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={stacked ? 0 : [4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="index-card rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-black/5">
                  <th className="px-4 py-3 font-medium">{options.dimensions.find((d) => d.key === q.rows)?.label}</th>
                  {data.cols.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-medium text-right">
                      {c.label}
                    </th>
                  ))}
                  {q.cols && <th className="px-4 py-3 font-medium text-right">Total</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key} className="border-b border-black/5 last:border-0 hover:bg-paper/60">
                    <td className="px-4 py-2.5 font-medium">{r.label}</td>
                    {data.cols.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 text-right font-mono-data">
                        {data.cells[r.key]?.[c.key] !== undefined ? fmt(data.cells[r.key][c.key]) : <span className="text-ink-muted/40">—</span>}
                      </td>
                    ))}
                    {q.cols && <td className="px-4 py-2.5 text-right font-mono-data font-semibold">{fmt(data.rowTotals[r.key])}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/10 font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  {data.cols.map((c) => (
                    <td key={c.key} className="px-4 py-2.5 text-right font-mono-data">
                      {fmt(q.cols ? data.colTotals[c.key] : data.total)}
                    </td>
                  ))}
                  {q.cols && <td className="px-4 py-2.5 text-right font-mono-data">{fmt(data.total)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
