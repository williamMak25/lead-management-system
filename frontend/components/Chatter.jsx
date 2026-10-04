'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { currency } from '@/lib/format';
import { activityIcon, Avatar, Button } from '@/components/ui';
import { ActivityModal, DoneModal } from '@/components/LeadModals';

const FIELD_LABEL = {
  name: 'Name',
  type: 'Type',
  stage_id: 'Stage',
  user_id: 'Salesperson',
  team_id: 'Sales team',
  contact_id: 'Contact',
  company_id: 'Company',
  expected_revenue: 'Expected revenue',
  probability: 'Probability',
  priority: 'Priority',
  date_deadline: 'Expected closing',
  email: 'Email',
  phone: 'Phone',
  partner_name: 'Company name',
  contact_name: 'Contact name',
  lost_reason_id: 'Lost reason',
  status: 'Status',
};
const STATUS = { pending: 'Open', won: 'Won', lost: 'Lost' };

export function dueLabel(dueDate, state) {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (state === 'done') return due.toLocaleDateString();
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days < 0 ? `${-days} days overdue` : `Due in ${days} days`;
}

const STATE_TEXT = { overdue: 'text-brick', today: 'text-gold', planned: 'text-ledger' };

function TrackingLine({ item }) {
  if (item.field === 'created') return <span>Created as {item.newValue === 'opportunity' ? 'an opportunity' : item.newValue === 'Imported' ? 'a record from CSV import' : 'a lead'}</span>;
  if (item.field === 'merged') return <span>Merged <em>{item.oldValue}</em> into this record</span>;
  const label = FIELD_LABEL[item.field] || item.field;
  const fmt = (v) => {
    if (v === null || v === undefined) return <span className="text-ink-muted">empty</span>;
    if (item.field === 'status') return STATUS[v] || v;
    if (item.field === 'priority') return '★'.repeat(Number(v)) || 'Normal';
    if (item.field === 'type') return v === 'opportunity' ? 'Opportunity' : 'Lead';
    if (item.field === 'expected_revenue') return currency(Number(v));
    if (item.field === 'probability') return `${v}%`;
    if (item.field === 'date_deadline') return new Date(`${v}T00:00:00`).toLocaleDateString();
    return v;
  };
  return (
    <span>
      {label}: {fmt(item.oldValue)} <span className="text-ink-muted">→</span> <strong className="font-medium">{fmt(item.newValue)}</strong>
    </span>
  );
}

/** Odoo's chatter: planned activities, log a note, and the record's history. */
export default function Chatter({ leadId, activities, timeline, onChange }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [activityModal, setActivityModal] = useState(null); // 'new' | activity
  const [doneFor, setDoneFor] = useState(null);

  async function saveNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    await api.createNote({ body: note, leadId });
    setNote('');
    setNoteOpen(false);
    onChange();
  }

  return (
    <div className="index-card rounded-lg p-5 space-y-4">
      <div className="flex gap-2">
        <Button variant={noteOpen ? 'primary' : 'secondary'} onClick={() => setNoteOpen((o) => !o)}>
          Log note
        </Button>
        <Button onClick={() => setActivityModal('new')}>Schedule activity</Button>
      </div>

      {noteOpen && (
        <form onSubmit={saveNote} className="space-y-2">
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Log an internal note…" className="input resize-none" />
          <Button type="submit" variant="primary">
            Log
          </Button>
        </form>
      )}

      {activities.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-2">Planned activities</p>
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm rounded-md border border-black/5 px-3 py-2">
                <span className="w-6 h-6 rounded-full bg-ledger-soft text-ledger flex items-center justify-center text-xs shrink-0">{activityIcon(a.activityType)}</span>
                <div className="flex-1 min-w-0">
                  <p>
                    <span className={`font-medium ${STATE_TEXT[a.state]}`}>{dueLabel(a.dueDate, a.state)}</span>
                    {': '}
                    <span className="font-medium">{a.activityType}</span>
                    {a.summary && <> — {a.summary}</>}
                  </p>
                  {a.note && <p className="text-xs text-ink-muted mt-0.5 whitespace-pre-line">{a.note}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="flex items-center gap-1 text-ink-muted">
                      <Avatar user={a.user} size="w-4 h-4 text-[8px]" /> {a.user?.name || 'Unassigned'}
                    </span>
                    <button type="button" onClick={() => setDoneFor(a)} className="text-ledger hover:underline">
                      ✓ Mark done
                    </button>
                    <button type="button" onClick={() => setActivityModal(a)} className="text-ink-muted hover:underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteActivity(a.id);
                        onChange();
                      }}
                      className="text-ink-muted hover:text-brick hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">History</p>
        <ol className="relative border-l border-black/10 ml-2 space-y-4">
          {timeline.map((t) => (
            <li key={`${t.kind}-${t.id}`} className="ml-4">
              <span className={`absolute -ml-[21px] w-2.5 h-2.5 rounded-full mt-1.5 ${t.kind === 'note' ? 'bg-ledger' : t.kind === 'activity_done' ? 'bg-gold' : 'bg-ink/25'}`} />
              <p className="text-xs text-ink-muted flex items-center gap-1.5">
                <Avatar user={t.user} size="w-4 h-4 text-[8px]" />
                {t.user?.name || 'System'} · {new Date(t.createdAt).toLocaleString()}
              </p>
              <div className="text-sm text-ink-soft mt-0.5">
                {t.kind === 'note' && <p className="whitespace-pre-line">{t.body}</p>}
                {t.kind === 'tracking' && <TrackingLine item={t} />}
                {t.kind === 'activity_done' && (
                  <p>
                    <span className="text-ledger">✓</span> {t.activityType} done{t.summary && <>: {t.summary}</>}
                    {t.feedback && <span className="block text-xs text-ink-muted mt-0.5">Feedback: {t.feedback}</span>}
                  </p>
                )}
              </div>
            </li>
          ))}
          {timeline.length === 0 && <p className="text-sm text-ink-muted ml-4">Nothing logged yet.</p>}
        </ol>
      </div>

      <ActivityModal
        open={!!activityModal}
        onClose={() => setActivityModal(null)}
        leadId={leadId}
        activity={activityModal === 'new' ? null : activityModal}
        onSaved={onChange}
      />
      <DoneModal open={!!doneFor} activity={doneFor} onClose={() => setDoneFor(null)} onDone={onChange} />
    </div>
  );
}
