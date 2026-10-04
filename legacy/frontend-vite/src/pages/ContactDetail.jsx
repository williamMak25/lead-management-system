import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { currency } from '../components/Kanban';

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
        <Link to="/contacts" className="text-xs text-ink-muted hover:text-ledger">← Contacts</Link>
        <h1 className="font-display text-2xl mt-1">{contact.name}</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {contact.title || 'No title'}
          {contact.company && (
            <>
              {' '}at{' '}
              <Link to={`/companies/${contact.company.id}`} className="hover:text-ledger">
                {contact.company.name}
              </Link>
            </>
          )}
          {' · '}{contact.email || 'no email'}{' · '}{contact.phone || 'no phone'}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Deals</p>
          <ul className="space-y-2">
            {contact.deals.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <Link to={`/deals/${d.id}`} className="font-medium hover:text-ledger transition-colors">{d.title}</Link>
                <span className="font-mono-data text-ink-muted">{currency(d.value)}</span>
              </li>
            ))}
            {contact.deals.length === 0 && <p className="text-sm text-ink-muted">No deals.</p>}
          </ul>
        </div>

        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Open tasks</p>
          <ul className="space-y-2">
            {contact.tasks.filter((t) => !t.done).map((t) => (
              <li key={t.id} className="text-sm">
                <p className="font-medium">{t.title}</p>
                <p className="text-xs text-ink-muted">{t.type} · due {new Date(t.dueDate).toLocaleDateString()}</p>
              </li>
            ))}
            {contact.tasks.filter((t) => !t.done).length === 0 && <p className="text-sm text-ink-muted">No open tasks.</p>}
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
