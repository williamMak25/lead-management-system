'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { currency, recordHref } from '@/lib/format';

export default function ContactDetail() {
  const { id } = useParams();
  const [contact, setContact] = useState(null);
  const [noteText, setNoteText] = useState('');

  const load = () => api.getContact(id).then(setContact);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await api.createNote({ body: noteText, contactId: id });
    setNoteText('');
    load();
  }

  if (!contact) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/contacts" className="text-xs text-ink-muted hover:text-ledger">← Contacts</Link>
        <h1 className="font-display text-2xl mt-1">{contact.name}</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {contact.title || 'No title'}
          {contact.company && (
            <>
              {' '}at{' '}
              <Link href={`/companies/${contact.company.id}`} className="hover:text-ledger">
                {contact.company.name}
              </Link>
            </>
          )}
          {' · '}{contact.email || 'no email'}{' · '}{contact.phone || 'no phone'}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Leads &amp; opportunities</p>
          <ul className="space-y-2">
            {contact.opportunities.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <Link href={recordHref(d)} className="font-medium hover:text-ledger transition-colors">{d.name}</Link>
                <span className="font-mono-data text-ink-muted">{currency(d.expectedRevenue)}</span>
              </li>
            ))}
            {contact.opportunities.length === 0 && <p className="text-sm text-ink-muted">None.</p>}
          </ul>
        </div>

        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Planned activities</p>
          <ul className="space-y-2">
            {contact.activities.map((t) => (
              <li key={t.id} className="text-sm">
                <p className="font-medium">
                  {t.activityType}
                  {t.summary && <span className="font-normal"> — {t.summary}</span>}
                </p>
                <p className={`text-xs ${t.state === 'overdue' ? 'text-brick' : 'text-ink-muted'}`}>
                  due {new Date(`${t.dueDate}T00:00:00`).toLocaleDateString()}
                  {t.lead && (
                    <>
                      {' · '}
                      <Link href={recordHref(t.lead)} className="hover:text-ledger">
                        {t.lead.name}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            ))}
            {contact.activities.length === 0 && <p className="text-sm text-ink-muted">Nothing planned.</p>}
          </ul>
        </div>

        <div className="index-card rounded-lg p-5 md:col-span-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Add note</p>
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="Log a call, meeting, or context…"
              className="input resize-none"
            />
            <button type="submit" className="w-full bg-ledger text-white text-sm py-1.5 rounded-md hover:bg-ledger/90 transition-colors">
              Save note
            </button>
          </form>
        </div>
      </div>

      <div className="index-card rounded-lg p-5">
        <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-4">Activity timeline</p>
        <ol className="relative border-l border-black/10 ml-2 space-y-5">
          {contact.notes.map((n) => (
            <li key={n.id} className="ml-4">
              <span className="absolute -ml-[21px] w-2.5 h-2.5 rounded-full bg-ledger mt-1.5" />
              <p className="text-sm text-ink-soft">{n.body}</p>
              <p className="text-xs text-ink-muted mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
            </li>
          ))}
          {contact.notes.length === 0 && <p className="text-sm text-ink-muted ml-4">No notes logged yet.</p>}
        </ol>
      </div>
    </div>
  );
}
