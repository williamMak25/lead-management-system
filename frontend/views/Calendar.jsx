'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { activityIcon } from '@/components/ui';
import { currency, recordHref } from '@/lib/format';

const iso = (d) => d.toLocaleDateString('en-CA');
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATE_STYLE = {
  overdue: 'bg-brick-soft text-brick',
  today: 'bg-gold-soft text-ink',
  planned: 'bg-ledger-soft text-ledger',
  done: 'bg-paper-deep text-ink-muted line-through',
};

/** Month calendar of scheduled activities and opportunities' expected closing dates. */
export default function Calendar() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [mine, setMine] = useState(false);
  const [show, setShow] = useState({ activities: true, closings: true, done: false });
  const [acts, setActs] = useState([]);
  const [opps, setOpps] = useState([]);

  // grid: Monday-start weeks covering the month
  const days = useMemo(() => {
    const first = new Date(cursor);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const end = new Date(last);
    end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [cursor]);

  const load = useCallback(() => {
    const from = iso(days[0]);
    const to = iso(days[days.length - 1]);
    const user = mine ? 'me' : undefined;
    api.getActivities({ from, to, userId: user, state: show.done ? 'all' : 'open' }).then(setActs);
    api.getLeads({ type: 'opportunity', status: 'open', deadlineFrom: from, deadlineTo: to, userId: user }).then(setOpps);
  }, [days, mine, show.done]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = {};
    const push = (k, item) => (map[k] ||= []).push(item);
    if (show.activities) for (const a of acts) push(a.dueDate, { kind: 'act', a });
    if (show.closings) for (const o of opps) if (o.dateDeadline) push(iso(new Date(o.dateDeadline)), { kind: 'opp', o });
    return map;
  }, [acts, opps, show]);

  const today = iso(new Date());
  const move = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Calendar</h1>
          <p className="text-sm text-ink-muted mt-0.5">Activities by due date, and when open opportunities are expected to close.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => move(-1)} className="px-2.5 py-1.5 rounded-md border border-black/10 bg-card text-sm hover:border-ledger/40" aria-label="Previous month">
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            className="px-3 py-1.5 rounded-md border border-black/10 bg-card text-xs hover:border-ledger/40"
          >
            Today
          </button>
          <button type="button" onClick={() => move(1)} className="px-2.5 py-1.5 rounded-md border border-black/10 bg-card text-sm hover:border-ledger/40" aria-label="Next month">
            ›
          </button>
          <p className="font-display text-lg w-40 text-center">{cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        {[
          ['activities', 'Activities'],
          ['closings', 'Expected closings'],
          ['done', 'Include done'],
        ].map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} className="accent-ledger" /> {l}
          </label>
        ))}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-ledger" /> Only mine
        </label>
      </div>

      <div className="index-card rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-black/5">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-muted font-medium">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = iso(d);
            const items = byDay[k] || [];
            const inMonth = d.getMonth() === cursor.getMonth();
            return (
              <div key={k} className={`min-h-[110px] border-b border-r border-black/5 p-1.5 ${inMonth ? '' : 'bg-paper/60'}`}>
                <p className={`text-xs mb-1 ${k === today ? 'inline-flex w-5 h-5 items-center justify-center rounded-full bg-ledger text-white font-semibold' : inMonth ? 'text-ink-soft' : 'text-ink-muted/50'}`}>
                  {d.getDate()}
                </p>
                <div className="space-y-0.5">
                  {items.slice(0, 4).map((it) =>
                    it.kind === 'act' ? (
                      <Link
                        key={`a${it.a.id}`}
                        href={it.a.lead ? recordHref(it.a.lead) : it.a.contact ? `/contacts/${it.a.contact.id}` : '/activities'}
                        title={`${it.a.activityType}: ${it.a.summary || ''}${it.a.lead ? ` — ${it.a.lead.name}` : ''}${it.a.user ? ` (${it.a.user.name})` : ''}`}
                        className={`block truncate text-[11px] px-1.5 py-0.5 rounded ${STATE_STYLE[it.a.state]}`}
                      >
                        {activityIcon(it.a.activityType)} {it.a.summary || it.a.lead?.name || it.a.activityType}
                      </Link>
                    ) : (
                      <Link
                        key={`o${it.o.id}`}
                        href={recordHref(it.o)}
                        title={`Expected closing: ${it.o.name} — ${currency(it.o.expectedRevenue)} (${Math.round(it.o.probability)}%)`}
                        className="block truncate text-[11px] px-1.5 py-0.5 rounded border border-gold/50 text-ink-soft bg-card"
                      >
                        ◆ {it.o.name}
                      </Link>
                    ),
                  )}
                  {items.length > 4 && <p className="text-[10px] text-ink-muted px-1">+{items.length - 4} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
