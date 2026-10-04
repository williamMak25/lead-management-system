import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Modal from '../components/Modal';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', companyId: '' });

  const load = () => api.getContacts(q ? { q } : {}).then(setContacts);

  useEffect(() => {
    api.getCompanies().then(setCompanies);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createContact({ ...form, companyId: form.companyId || null });
    setForm({ name: '', email: '', phone: '', title: '', companyId: '' });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Contacts</h1>
          <p className="text-sm text-ink-muted mt-0.5">{contacts.length} on record</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-ink text-paper text-sm px-4 py-2 rounded-md hover:bg-ink-soft transition-colors"
        >
          + New contact
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search contacts by name or email…"
        className="w-full max-w-sm px-3 py-2 rounded-md border border-black/10 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ledger/40"
      />

      <div className="index-card rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-black/5">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-paper/60">
                <td className="px-4 py-3">
                  <Link to={`/contacts/${c.id}`} className="font-medium hover:text-ledger transition-colors">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-soft">{c.title || '—'}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {c.company ? (
                    <Link to={`/companies/${c.company.id}`} className="hover:text-ledger">
                      {c.company.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{c.email || '—'}</td>
                <td className="px-4 py-3 text-ink-muted">{c.phone || '—'}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-muted text-sm">
                  No contacts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New contact">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name">
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required />
          </Field>
          <Field label="Title">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
          </Field>
          <Field label="Company">
            <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="input">
              <option value="">— None —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" type="email" />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </Field>
          <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors mt-2">
            Add contact
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
