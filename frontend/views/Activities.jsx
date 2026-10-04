'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { recordHref } from '@/lib/format';
import { useMeta } from '@/context/MetaContext';
import { activityIcon, Avatar, Button, EmptyState } from '@/components/ui';
import { ActivityModal, DoneModal } from '@/components/LeadModals';
import { dueLabel } from '@/components/Chatter';

const STATES = [
  ['open', 'All open'],
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['planned', 'Planned'],
  ['done', 'Done'],
];
const STATE_TEXT = { overdue: 'text-brick font-semibold', today: 'text-gold font-semibold', planned: 'text-ledger', done: 'text-ink-muted' };
const GROUPS = [
  ['state', 'Due'],
  ['type', 'Type'],
  ['user', 'Assigned to'],
  ['none', 'No grouping'],
];

/** "My activities": every scheduled call, email, meeting and to-do across leads and contacts. */
export default function Activities() {
  const meta = useMeta();
  const [state, setState] = useState('open');
  const [mine, setMine] = useState(true);
  const [type, setType] = useState('');
  const [groupBy, setGroupBy] = useState('state');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [doneFor, setDoneFor] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .getActivities({ state, userId: mine ? 'me' : undefined, type: type || undefined })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [state, mine, type]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: null, rows }];
    const order = { overdue: 0, today: 1, planned: 2, done: 3 };
    const keyOf = (a) => (groupBy === 'state' ? a.state : groupBy === 'type' ? a.activityType : a.user?.name || 'Unassigned');
    const map = new Map();
    for (const a of rows) {
      const k = keyOf(a);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(a);
    }
    const label = (k) => (groupBy === 'state' ? { overdue: 'Overdue', today: 'Today', planned: 'Planned', done: 'Done' }[k] : k);
    return [...map.entries()]
      .sort(([a], [b]) => (groupBy === 'state' ? order[a] - order[b] : a.localeCompare(b)))
      .map(([k, list]) => ({ key: k, label: label(k), rows: list }));
  }, [rows, groupBy]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Activities</h1>
          <p className="text-sm text-ink-muted mt-0.5">Calls, emails, meetings and to-dos scheduled on your leads and contacts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/calendar" className="text-xs px-3 py-1.5 rounded-md border border-black/10 bg-card text-ink-soft hover:border-ledger/40">
            Calendar view
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATES.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setState(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${state === v ? 'bg-ink text-paper border-ink' : 'border-black/10 text-ink-soft hover:border-ink/30'}`}
          >
            {l}
          </button>
        ))}
        <span className="w-px h-5 bg-black/10 mx-1" />
        <div className="flex rounded-md border border-black/10 overflow-hidden text-xs">
          {[
            [true, 'Mine'],
            [false, 'Everyone'],
          ].map(([v, l]) => (
            <button key={l} type="button" onClick={() => setMine(v)} className={`px-3 py-1.5 ${mine === v ? 'bg-ink text-paper' : 'bg-card text-ink-soft hover:bg-paper'}`}>
              {l}
            </button>
          ))}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="text-xs px-2 py-1.5 rounded-md border border-black/10 bg-card">
          <option value="">All types</option>
          {meta.activityTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="text-xs px-2 py-1.5 rounded-md border border-black/10 bg-card">
          {GROUPS.map(([v, l]) => (
            <option key={v} value={v}>
              Group: {l}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.key} className="index-card rounded-lg overflow-hidden">
            {g.label && (
              <p className="px-4 py-2 text-xs font-semibold text-ink-soft bg-paper-deep/50 border-b border-black/5">
                {g.label} <span className="font-normal text-ink-muted">({g.rows.length})</span>
              </p>
            )}
            <ul className="divide-y divide-black/5">
              {g.rows.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-7 h-7 rounded-full bg-ledger-soft text-ledger flex items-center justify-center text-xs shrink-0">{activityIcon(a.activityType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${a.done ? 'line-through text-ink-muted' : 'font-medium'}`}>
                      {a.activityType}
                      {a.summary && <span className="font-normal"> — {a.summary}</span>}
                    </p>
                    <p className="text-xs text-ink-muted truncate">
                      {a.lead && (
                        <Link href={recordHref(a.lead)} className="hover:text-ledger">
                          {a.lead.type === 'opportunity' ? '◆ ' : '⚑ '}
                          {a.lead.name}
                        </Link>
                      )}
                      {a.contact && (
                        <>
                          {a.lead && ' · '}
                          <Link href={`/contacts/${a.contact.id}`} className="hover:text-ledger">
                            {a.contact.name}
                          </Link>
                        </>
                      )}
                      {a.feedback && <> · “{a.feedback}”</>}
                    </p>
                  </div>
                  <span className={`text-xs font-mono-data shrink-0 ${STATE_TEXT[a.state]}`}>{dueLabel(a.dueDate, a.state)}</span>
                  <Avatar user={a.user} />
                  {!a.done && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="primary" onClick={() => setDoneFor(a)}>
                        Done
                      </Button>
                      <Button variant="ghost" onClick={() => setEdit(a)}>
                        Edit
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="index-card rounded-lg">
            <EmptyState>Nothing here. Schedule activities from a lead or opportunity.</EmptyState>
          </div>
        )}
      </div>

      <ActivityModal open={!!edit} activity={edit} onClose={() => setEdit(null)} onSaved={load} />
      <DoneModal open={!!doneFor} activity={doneFor} onClose={() => setDoneFor(null)} onDone={load} />
    </div>
  );
}
