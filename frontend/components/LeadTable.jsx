'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActivityBadge, Avatar, StatusRibbon, Stars, Tags } from '@/components/ui';
import { currency, recordHref } from '@/lib/format';

function Row({ r, type, selected, onSelect, onPriority }) {
  return (
    <tr className={`border-b border-black/5 last:border-0 hover:bg-paper/60 ${!r.active ? 'opacity-70' : ''}`}>
      <td className="pl-4 pr-1 py-2.5 w-8">
        <input type="checkbox" checked={selected} onChange={() => onSelect(r.id)} className="accent-ledger" aria-label={`Select ${r.name}`} />
      </td>
      <td className="px-3 py-2.5 min-w-[220px]">
        <div className="flex items-center gap-2">
          <Link href={recordHref(r)} className="font-medium hover:text-ledger transition-colors">
            {r.name}
          </Link>
          <StatusRibbon status={r.wonStatus} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-ink-muted">{r.contact?.name || r.contactName || r.email || '—'}</span>
          <Tags tags={r.tags} />
        </div>
      </td>
      <td className="px-3 py-2.5 text-ink-soft">{r.company?.name || r.partnerName || '—'}</td>
      {type === 'opportunity' ? (
        <td className="px-3 py-2.5 text-ink-soft whitespace-nowrap">{r.stage?.name || '—'}</td>
      ) : (
        <td className="px-3 py-2.5 text-ink-soft">{r.source?.name || '—'}</td>
      )}
      <td className="px-3 py-2.5">
        <Stars value={r.priority} onChange={(p) => onPriority(r, p)} />
      </td>
      <td className="px-3 py-2.5">
        <ActivityBadge state={r.activityState} type={r.nextActivity?.activityType} title={r.nextActivity ? `${r.nextActivity.activityType}: ${r.nextActivity.summary || ''} (${r.nextActivity.dueDate})` : undefined} />
      </td>
      <td className="px-3 py-2.5 font-mono-data text-right whitespace-nowrap">{currency(r.expectedRevenue)}</td>
      <td className="px-3 py-2.5 font-mono-data text-right text-ink-muted">{Math.round(r.probability)}%</td>
      <td className="px-3 py-2.5 text-ink-muted whitespace-nowrap text-xs">{r.dateDeadline ? new Date(r.dateDeadline).toLocaleDateString() : ''}</td>
      <td className="px-3 py-2.5 pr-4">
        <Avatar user={r.user} />
      </td>
    </tr>
  );
}

/** Odoo-style list: selectable rows, optional collapsible groups with count and revenue sums. */
export default function LeadTable({ type, records, groups, selected, onSelect, onSelectAll, onPriority }) {
  const [collapsed, setCollapsed] = useState({});
  const allSelected = records.length > 0 && records.every((r) => selected.includes(r.id));
  const total = records.reduce((s, r) => s + r.expectedRevenue, 0);
  const cols = 10;

  return (
    <div className="index-card rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-black/5">
            <th className="pl-4 pr-1 py-3 w-8">
              <input type="checkbox" checked={allSelected} onChange={() => onSelectAll(allSelected ? [] : records.map((r) => r.id))} className="accent-ledger" aria-label="Select all" />
            </th>
            <th className="px-3 py-3 font-medium">{type === 'opportunity' ? 'Opportunity' : 'Lead'}</th>
            <th className="px-3 py-3 font-medium">Company</th>
            <th className="px-3 py-3 font-medium">{type === 'opportunity' ? 'Stage' : 'Source'}</th>
            <th className="px-3 py-3 font-medium">Priority</th>
            <th className="px-3 py-3 font-medium">Activity</th>
            <th className="px-3 py-3 font-medium text-right">Revenue</th>
            <th className="px-3 py-3 font-medium text-right">Prob.</th>
            <th className="px-3 py-3 font-medium">Closing</th>
            <th className="px-3 py-3 pr-4 font-medium">Owner</th>
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.map((g) => (
                <GroupRows key={g.key} g={g} cols={cols} collapsed={collapsed[g.key]} onToggle={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}>
                  {g.records.map((r) => (
                    <Row key={`${g.key}-${r.id}`} r={r} type={type} selected={selected.includes(r.id)} onSelect={onSelect} onPriority={onPriority} />
                  ))}
                </GroupRows>
              ))
            : records.map((r) => <Row key={r.id} r={r} type={type} selected={selected.includes(r.id)} onSelect={onSelect} onPriority={onPriority} />)}
          {records.length === 0 && (
            <tr>
              <td colSpan={cols} className="px-4 py-10 text-center text-ink-muted text-sm">
                Nothing matches these filters.
              </td>
            </tr>
          )}
        </tbody>
        {records.length > 0 && (
          <tfoot>
            <tr className="border-t border-black/10 text-xs text-ink-muted">
              <td colSpan={6} className="px-4 py-2.5">
                {records.length} record{records.length === 1 ? '' : 's'}
              </td>
              <td className="px-3 py-2.5 font-mono-data text-right text-ink">{currency(total)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function GroupRows({ g, cols, collapsed, onToggle, children }) {
  return (
    <>
      <tr className="bg-paper-deep/50 border-b border-black/5 cursor-pointer select-none" onClick={onToggle}>
        <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-ink-soft">
          <span className="inline-block w-4">{collapsed ? '▸' : '▾'}</span>
          {g.label} <span className="font-normal text-ink-muted">({g.records.length})</span>
        </td>
        <td className="px-3 py-2 font-mono-data text-right text-xs">{currency(g.revenue)}</td>
        <td colSpan={cols - 7} />
      </tr>
      {!collapsed && children}
    </>
  );
}
