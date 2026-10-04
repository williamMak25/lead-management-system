import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { currency } from '../components/Kanban';

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [stages, setStages] = useState([]);
  const [noteText, setNoteText] = useState('');

  const load = () => api.getDeal(id).then(setDeal);

  useEffect(() => {
    load();
    api.getDealStages().then(setStages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStage(stage) {
    await api.updateDeal(id, { stage });
    load();
  }

  async function addNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await api.createNote({ body: noteText, dealId: id });
    setNoteText('');
    load();
  }

  async function remove() {
    if (!confirm('Delete this deal?')) return;
    await api.deleteDeal(id);
    navigate('/deals');
  }

  if (!deal) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/deals" className="text-xs text-ink-muted hover:text-ledger">← Pipeline</Link>
          <h1 className="font-display text-2xl mt-1">{deal.title}</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {deal.company && <Link to={`/companies/${deal.company.id}`} className="hover:text-ledger">{deal.company.name}</Link>}
            {deal.contact && <> · <Link to={`/contacts/${deal.contact.id}`} className="hover:text-ledger">{deal.contact.name}</Link></>}
          </p>
        </div>
        <button onClick={remove} className="text-xs text-brick hover:underline">Delete deal</button>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1">Value</p>
          <p className="font-mono-data text-2xl font-semibold text-ledger">{currency(deal.value)}</p>
          {deal.expectedCloseDate && (
            <p className="text-xs text-ink-muted mt-2">
              Expected close: {new Date(deal.expectedCloseDate).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="index-card rounded-lg p-5 md:col-span-2">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Stage</p>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <button
                key={s}
                onClick={() => changeStage(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  deal.stage === s
                    ? 'bg-ledger text-white border-ledger'
                    : 'border-black/10 text-ink-soft hover:border-ledger/40'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Tasks</p>
          <ul className="space-y-2">
            {deal.tasks.map((t) => (
              <li key={t.id} className="text-sm">
                <p className={`font-medium ${t.done ? 'line-through text-ink-muted' : ''}`}>{t.title}</p>
                <p className="text-xs text-ink-muted">{t.type} · due {new Date(t.dueDate).toLocaleDateString()}</p>
              </li>
            ))}
            {deal.tasks.length === 0 && <p className="text-sm text-ink-muted">No tasks linked.</p>}
          </ul>
        </div>

        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Notes</p>
          <form onSubmit={addNote} className="space-y-2 mb-4">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Log context on this deal…"
              className="input resize-none"
            />
            <button type="submit" className="bg-ledger text-white text-xs px-3 py-1.5 rounded-md hover:bg-ledger/90 transition-colors">
              Save note
            </button>
          </form>
          <ul className="space-y-3">
            {deal.notes.map((n) => (
              <li key={n.id} className="text-sm border-t border-black/5 pt-2 first:border-0 first:pt-0">
                <p className="text-ink-soft">{n.body}</p>
                <p className="text-xs text-ink-muted mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
              </li>
            ))}
            {deal.notes.length === 0 && <p className="text-sm text-ink-muted">No notes yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
