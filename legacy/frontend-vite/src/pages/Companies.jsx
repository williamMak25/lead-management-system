import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Modal from '../components/Modal';

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', industry: '', website: '', size: '' });

  const load = () => api.getCompanies(q).then(setCompanies);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createCompany(form);
    setForm({ name: '', industry: '', website: '', size: '' });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Companies</h1>
          <p className="text-sm text-ink-muted mt-0.5">{companies.length} on record</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-ink text-paper text-sm px-4 py-2 rounded-md hover:bg-ink-soft transition-colors"
        >
          + New company
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search companies…"
        className="w-full max-w-sm px-3 py-2 rounded-md border border-black/10 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ledger/40"
      />

      <div className="index-card rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-black/5">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Contacts</th>
              <th className="px-4 py-3 font-medium">Deals</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-paper/60">
                <td className="px-4 py-3">
                  <Link to={`/companies/${c.id}`} className="font-medium hover:text-ledger transition-colors">
                    {c.name}
                  </Link>
                  <p className="text-xs text-ink-muted">{c.website}</p>
                </td>
                <td className="px-4 py-3 text-ink-soft">{c.industry || '—'}</td>
                <td className="px-4 py-3 text-ink-soft">{c.size || '—'}</td>
                <td className="px-4 py-3 font-mono-data">{c.contactCount}</td>
                <td className="px-4 py-3 font-mono-data">{c.dealCount}</td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-muted text-sm">
                  No companies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New company">
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
          <Field label="Industry">
            <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="input" />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input" />
          </Field>
          <Field label="Company size">
            <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="input" placeholder="e.g. 11-50" />
          </Field>
          <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors mt-2">
            Add company
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
