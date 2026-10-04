'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActivityBadge, Avatar, StatusRibbon, Stars, Tags } from '@/components/ui';
import { currency, recordHref } from '@/lib/format';

/**
 * Pipeline board: one column per stage (folded stages collapse to a strip), drag cards between stages,
 * per-column totals and a won/lost/open progress bar like Odoo's.
 */
export default function Kanban({ stages, records, onStageChange, onPriority, onQuickCreate }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [unfolded, setUnfolded] = useState({});

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 flex-1 min-h-0">
      {stages.map((stage) => {
        const items = records.filter((r) => r.stage?.id === stage.id);
        const total = items.reduce((sum, r) => sum + r.expectedRevenue, 0);
        const isOver = overStage === stage.id;
        const folded = stage.fold && !unfolded[stage.id];
        const drop = {
          onDragOver: (e) => {
            e.preventDefault();
            setOverStage(stage.id);
          },
          onDragLeave: () => setOverStage((s) => (s === stage.id ? null : s)),
          onDrop: (e) => {
            e.preventDefault();
            setOverStage(null);
            const rec = records.find((r) => r.id === dragId);
            if (rec && rec.stage?.id !== stage.id) onStageChange(rec, stage);
            setDragId(null);
          },
        };

        if (folded) {
          return (
            <button
              key={stage.id}
              type="button"
              {...drop}
              onClick={() => setUnfolded((u) => ({ ...u, [stage.id]: true }))}
              className={`w-10 shrink-0 rounded-lg ${isOver ? 'bg-ledger-soft' : 'bg-paper-deep/60'} flex flex-col items-center py-3 gap-2`}
              title={`${stage.name} (${items.length}) — click to expand`}
            >
              <span className="text-[11px] font-mono-data text-ink-muted">{items.length}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft [writing-mode:vertical-rl] rotate-180">{stage.name}</span>
            </button>
          );
        }

        const counts = { overdue: 0, today: 0, planned: 0, none: 0 };
        for (const r of items) counts[r.activityState || 'none'] += 1;
        return (
          <div key={stage.id} className={`flex flex-col w-72 shrink-0 rounded-lg transition-colors ${isOver ? 'bg-ledger-soft' : 'bg-paper-deep/60'}`} {...drop}>
            <div className="px-3 pt-3 pb-2 border-b-2 border-ink/10">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft truncate" title={stage.requirements || undefined}>
                  {stage.name}
                  {stage.isWon && <span className="ml-1 text-ledger">✓</span>}
                </p>
                <div className="flex items-center gap-1.5">
                  {onQuickCreate && (
                    <button type="button" onClick={() => onQuickCreate(stage)} className="text-ink-muted hover:text-ledger text-sm leading-none" aria-label={`Add to ${stage.name}`}>
                      +
                    </button>
                  )}
                  {stage.fold && (
                    <button type="button" onClick={() => setUnfolded((u) => ({ ...u, [stage.id]: false }))} className="text-ink-muted hover:text-ink text-xs" aria-label="Fold">
                      ⇤
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="font-mono-data text-sm text-ink-muted">{currency(total)}</p>
                <span className="text-[11px] font-mono-data text-ink-muted">{items.length}</span>
              </div>
              {items.length > 0 && (
                <div className="flex h-1 mt-1.5 rounded-full overflow-hidden bg-black/5" title={`${counts.overdue} overdue · ${counts.today} today · ${counts.planned} planned · ${counts.none} none`}>
                  <div className="bg-brick" style={{ width: `${(counts.overdue / items.length) * 100}%` }} />
                  <div className="bg-gold" style={{ width: `${(counts.today / items.length) * 100}%` }} />
                  <div className="bg-ledger" style={{ width: `${(counts.planned / items.length) * 100}%` }} />
                </div>
              )}
            </div>
            <div className="flex-1 p-2.5 space-y-2.5 min-h-[120px] overflow-y-auto">
              {items.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={() => setDragId(r.id)}
                  className={`index-card rounded-md p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${r.priority >= 2 ? 'priority' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={recordHref(r)} className="text-sm font-medium leading-snug hover:text-ledger transition-colors">
                      {r.name}
                    </Link>
                    <StatusRibbon status={r.wonStatus} />
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">{r.company?.name || r.partnerName || r.contactName || 'No customer'}</p>
                  {r.tags.length > 0 && (
                    <div className="mt-1.5">
                      <Tags tags={r.tags} />
                    </div>
                  )}
                  <p className="font-mono-data text-sm font-semibold mt-2 text-ink">{currency(r.expectedRevenue)}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <Stars value={r.priority} onChange={(p) => onPriority(r, p)} />
                      <ActivityBadge state={r.activityState} type={r.nextActivity?.activityType} title={r.nextActivity ? `${r.nextActivity.activityType}: ${r.nextActivity.summary || ''} (${r.nextActivity.dueDate})` : undefined} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono-data text-ink-muted">{Math.round(r.probability)}%</span>
                      <Avatar user={r.user} />
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-ink-muted/60 text-center py-6 border border-dashed border-ink/10 rounded-md">Drop a card here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
