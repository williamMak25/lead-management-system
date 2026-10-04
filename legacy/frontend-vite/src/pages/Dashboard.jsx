import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import StatCard from '../components/StatCard';
import { api } from '../api';
import { currency } from '../components/Kanban';

const activityIcon = {
  deal_created: '◆',
  deal_stage_changed: '→',
  task_created: '☐',
  task_completed: '✓',
  note_added: '✎',
  contact_created: '＋',
  company_created: '＋',
  lead_created: '⚑',
  lead_status_changed: '→',
  lead_converted: '⇄',
};

export default function Dashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.getDashboardSummary().then(setSummary);
  }, []);

  if (!summary) {
    return <p className="text-ink-muted text-sm">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-0.5">Where the pipeline stands today.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Open Leads" value={summary.counts.openLeads} sublabel={`${summary.counts.totalLeads} total`} accent="gold" />
        <StatCard label="Open Pipeline" value={currency(summary.pipelineValue)} sublabel={`${summary.counts.openDeals} open deals`} accent="ledger" />
        <StatCard label="Won Revenue" value={currency(summary.wonValue)} sublabel="all-time" accent="ledger" />
        <StatCard label="Win Rate" value={`${summary.winRate}%`} sublabel="closed deals" accent="gold" />
        <StatCard label="Overdue Tasks" value={summary.overdueTasks} sublabel={`${summary.upcomingTasks} upcoming`} accent={summary.overdueTasks > 0 ? 'brick' : 'ledger'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-4">Revenue won — last 6 months</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary.revenueByMonth} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCDFD3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip formatter={(v) => currency(v)} cursor={{ fill: 'rgba(47,111,94,0.08)' }} />
              <Bar dataKey="value" fill="#2F6F5E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-4">Pipeline by stage</p>
          <div className="space-y-3">
            {summary.stageBreakdown.map((s) => {
              const max = Math.max(...summary.stageBreakdown.map((x) => x.value), 1);
              return (
                <div key={s.stage}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-ink-soft font-medium">{s.stage}</span>
                    <span className="font-mono-data text-ink-muted">{currency(s.value)}</span>
                  </div>
                  <div className="h-1.5 bg-paper-deep rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ledger rounded-full"
                      style={{ width: `${(s.value / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="index-card rounded-lg p-5">
        <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-4">Recent activity</p>
        <ul className="space-y-3">
          {summary.recentActivity.map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <span className="w-6 h-6 rounded-full bg-ledger-soft text-ledger flex items-center justify-center text-xs shrink-0 mt-0.5">
                {activityIcon[a.type] || '•'}
              </span>
              <div>
                <p className="text-ink-soft">{a.message}</p>
                <p className="text-xs text-ink-muted">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
            </li>
          ))}
          {summary.recentActivity.length === 0 && (
            <p className="text-sm text-ink-muted">No activity yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
