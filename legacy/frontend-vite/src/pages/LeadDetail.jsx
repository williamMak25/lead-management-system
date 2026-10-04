import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { currency } from '../components/Kanban';
import Modal from '../components/Modal';
import { statusBadge } from './Leads';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({ companyId: '', dealTitle: '', value: '' });

  const load = () => api.getLead(id).then(setLead);

  useEffect(() => {
    load();
    api.getLeadStatuses().then(setStatuses);
    api.getCompanies().then(setCompanies);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStatus(status) {
    await api.updateLead(id, { status });
    load();
  }

  async function addNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await api.createNote({ body: noteText, leadId: id });
    setNoteText('');
    load();
  }

  async function remove() {
    if (!confirm('Delete this lead?')) return;
    await api.deleteLead(id);
    navigate('/leads');
  }

  function openConvert() {
    setConvertForm({
      companyId: '',
      dealTitle: `${lead.name}${lead.companyName ? ` — ${lead.companyName}` : ''}`,
      value: lead.value || '',
    });
    setConvertOpen(true);
  }

  async function submitConvert(e) {
    e.preventDefault();
    const result = await api.convertLead(id, {
      companyId: convertForm.companyId || null,
      dealTitle: convertForm.dealTitle,
      value: Number(convertForm.value) || 0,
    });
    setConvertOpen(false);
    navigate(`/deals/${result.dealId}`);
  }

  if (!lead) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/leads" className="text-xs text-ink-muted hover:text-ledger">← Leads</Link>
          <h1 className="font-display text-2xl mt-1">{lead.name}</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {lead.title || 'No title'}
            {lead.companyName && <> at {lead.companyName}</>}
            {' · '}{lead.email || 'no email'}{' · '}{lead.phone || 'no phone'}
          </p>
        </div>
        <button onClick={remove} className="text-xs text-brick hover:underline">Delete lead</button>
      </div>

      {lead.status === 'Converted' ? (
        <div className="index-card rounded-lg p-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1">Converted</p>
            <p className="text-sm text-ink-soft">This lead became a contact and a deal in the pipeline.</p>
          </div>
          <div className="flex gap-2">
            {lead.convertedContactId && (
              <Link to={`/contacts/${lead.convertedContactId}`} className="text-xs px-3 py-1.5 rounded-md border border-black/10 hover:border-ledger/40 transition-colors">
                View contact
              </Link>
            )}
            {lead.convertedDealId && (
              <Link to={`/deals/${lead.convertedDealId}`} className="text-xs px-3 py-1.5 rounded-md bg-ledger text-white hover:bg-ledger/90 transition-colors">
                View deal
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-5">
          <div className="index-card rounded-lg p-5">
            <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1">Est. value</p>
            <p className="font-mono-data text-2xl font-semibold text-ledger">{currency(lead.value)}</p>
            <p className="text-xs text-ink-muted mt-2">Source: {lead.source}</p>
          </div>

          <div className="index-card rounded-lg p-5 md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wide text-ink-muted font-medium">Status</p>
              <button
                onClick={openConvert}
                className="text-xs px-3 py-1.5 rounded-md bg-ledger text-white hover:bg-ledger/90 transition-colors"
              >
                Convert to deal →
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {statuses.filter((s) => s !== 'Converted').map((s) => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    lead.status === s
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
      )}

      <div className="index-card rounded-lg p-5">
        <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Notes</p>
        <form onSubmit={addNote} className="space-y-2 mb-4">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            placeholder="Log a call, qualification detail, or context…"
            className="input resize-none"
          />
          <button type="submit" className="bg-ledger text-white text-xs px-3 py-1.5 rounded-md hover:bg-ledger/90 transition-colors">
            Save note
          </button>
        </form>
        <ul className="space-y-3">
          {lead.notes.map((n) => (
            <li key={n.id} className="text-sm border-t border-black/5 pt-2 first:border-0 first:pt-0">
              <p className="text-ink-soft">{n.body}</p>
              <p className="text-xs text-ink-muted mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
            </li>
          ))}
          {lead.notes.length === 0 && <p className="text-sm text-ink-muted">No notes yet.</p>}
        </ul>
      </div>

      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="Convert to deal">
        <form onSubmit={submitConvert} className="space-y-3">
          <Field label="Company">
            <select
              value={convertForm.companyId}
              onChange={(e) => setConvertForm({ ...convertForm, companyId: e.target.value })}
              className="input"
            >
              <option value="">
                {lead.companyName ? `— Create new: "${lead.companyName}" —` : '— None —'}
              </option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Deal title">
            <input
              value={convertForm.dealTitle}
              onChange={(e) => setConvertForm({ ...convertForm, dealTitle: e.target.value })}
              className="input"
              required
            />
          </Field>
          <Field label="Value ($)">
            <input
              type="number"
              min="0"
              value={convertForm.value}
              onChange={(e) => setConvertForm({ ...convertForm, value: e.target.value })}
              className="input"
            />
          </Field>
          <p className="text-xs text-ink-muted">
            Creates a contact for {lead.name}{lead.companyName ? ` and links them to ${lead.companyName}` : ''}, plus a
            deal in the "New Lead" stage.
          </p>
          <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors mt-2">
            Convert
          </button>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
