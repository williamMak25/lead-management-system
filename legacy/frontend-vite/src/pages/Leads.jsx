import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Modal from '../components/Modal';
import { currency } from '../components/Kanban';

export const statusBadge = {
  New: 'bg-ledger-soft text-ledger',
  Contacted: 'bg-gold-soft text-gold',
  Qualified: 'bg-ledger text-white',
  Disqualified: 'bg-brick-soft text-brick',
  Converted: 'bg-ink text-paper',
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [sources, setSources] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', companyName: '', title: '', source: '', value: '' });

  const load = () => api.getLeads({ q, status }).then(setLeads);

  useEffect(() => {
    api.getLeadSources().then((s) => {
      setSources(s);
      setForm((f) => ({ ...f, source: s[0] }));
    });
    api.getLeadStatuses().then(setStatuses);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createLead({ ...form, value: Number(form.value) || 0 });
    setForm({ name: '', email: '', phone: '', companyName: '', title: '', source: sources[0], value: '' });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Leads</h1>
          <p className="text-sm text-ink-muted mt-0.5">{leads.length} on record</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-ink text-paper text-sm px-4 py-2 rounded-md hover:bg-ink-soft transition-colors"
        >
          + New lead
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search leads…"
          className="w-full max-w-sm px-3 py-2 rounded-md border border-black/10 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ledger/40"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-md border border-black/10 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ledger/40"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="index-card rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-black/5">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-black/5 last:border-0 hover:bg-paper/60">
                <td className="px-4 py-3">
                  <Link to={`/leads/${l.id}`} className="font-medium hover:text-ledger transition-colors">
                    {l.name}
                  </Link>
                  <p className="text-xs text-ink-muted">{l.email || 'no email'}</p>
                </td>
                <td className="px-4 py-3 text-ink-soft">{l.companyName || '—'}</td>
                <td className="px-4 py-3 text-ink-soft">{l.source}</td>
                <td className="px-4 py-3 font-mono-data">{currency(l.value)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge[l.status] || 'bg-paper-deep text-ink-soft'}`}>
                    {l.status}
                  </span>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-muted text-sm">
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New lead">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company">
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="input" />
            </Field>
            <Field label="Title">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="input">
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Est. value ($)">
              <input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="input" />
            </Field>
          </div>
          <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors mt-2">
            Add lead
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
