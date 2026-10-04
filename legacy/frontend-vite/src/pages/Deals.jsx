import { useEffect, useState } from 'react';
import { api } from '../api';
import Kanban from '../components/Kanban';
import Modal from '../components/Modal';

export default function Deals() {
  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', companyId: '', contactId: '', value: '', stage: '', expectedCloseDate: '' });

  const load = () => api.getDeals().then(setDeals);

  useEffect(() => {
    api.getDealStages().then((s) => {
      setStages(s);
      setForm((f) => ({ ...f, stage: s[0] }));
    });
    api.getCompanies().then(setCompanies);
    api.getContacts().then(setContacts);
    load();
  }, []);

  async function onStageChange(id, stage) {
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage } : d)));
    await api.updateDeal(id, { stage });
    load();
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await api.createDeal({
      ...form,
      companyId: form.companyId || null,
      contactId: form.contactId || null,
      value: Number(form.value) || 0,
    });
    setForm({ title: '', companyId: '', contactId: '', value: '', stage: stages[0], expectedCloseDate: '' });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Pipeline</h1>
          <p className="text-sm text-ink-muted mt-0.5">Drag cards between stages to update them.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-ink text-paper text-sm px-4 py-2 rounded-md hover:bg-ink-soft transition-colors"
        >
          + New deal
        </button>
      </div>

      <Kanban stages={stages} deals={deals} onStageChange={onStageChange} />

      <Modal open={open} onClose={() => setOpen(false)} title="New deal">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" required />
          </Field>
          <Field label="Company">
            <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="input">
              <option value="">— None —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Contact">
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className="input">
              <option value="">— None —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Value ($)">
              <input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="input" />
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="input">
                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Expected close date">
            <input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} className="input" />
          </Field>
          <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors mt-2">
            Add deal
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
