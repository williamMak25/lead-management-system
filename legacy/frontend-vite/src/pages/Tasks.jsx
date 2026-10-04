import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Modal from '../components/Modal';

const FILTERS = ['All', 'Open', 'Overdue', 'Done'];

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('Open');
  const [types, setTypes] = useState([]);
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', type: '', dealId: '', contactId: '', dueDate: '' });

  const load = () => {
    const params = {};
    if (filter === 'Open') params.done = 'false';
    if (filter === 'Done') params.done = 'true';
    if (filter === 'Overdue') { params.done = 'false'; params.overdue = 'true'; }
    api.getTasks(params).then(setTasks);
  };

  useEffect(() => {
    api.getTaskTypes().then((t) => { setTypes(t); setForm((f) => ({ ...f, type: t[0] })); });
    api.getDeals().then(setDeals);
    api.getContacts().then(setContacts);
  }, []);

  useEffect(load, [filter]);

  async function toggleDone(task) {
    await api.updateTask(task.id, { done: !task.done });
    load();
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.dueDate) return;
    await api.createTask({
      ...form,
      dealId: form.dealId || null,
      contactId: form.contactId || null,
      dueDate: new Date(form.dueDate).toISOString(),
    });
    setForm({ title: '', type: types[0], dealId: '', contactId: '', dueDate: '' });
    setOpen(false);
    load();
  }

  const now = new Date();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Tasks</h1>
          <p className="text-sm text-ink-muted mt-0.5">Follow-ups, calls, and reminders.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-ink text-paper text-sm px-4 py-2 rounded-md hover:bg-ink-soft transition-colors"
        >
          + New task
        </button>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f ? 'bg-ink text-paper border-ink' : 'border-black/10 text-ink-soft hover:border-ink/30'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="index-card rounded-lg divide-y divide-black/5">
        {tasks.map((t) => {
          const overdue = !t.done && new Date(t.dueDate) < now;
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggleDone(t)}
                className="w-4 h-4 accent-ledger shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${t.done ? 'line-through text-ink-muted' : ''}`}>{t.title}</p>
                <p className="text-xs text-ink-muted">
                  {t.type}
                  {t.deal && <> · <Link to={`/deals/${t.deal.id}`} className="hover:text-ledger">{t.deal.title}</Link></>}
                  {t.contact && <> · <Link to={`/contacts/${t.contact.id}`} className="hover:text-ledger">{t.contact.name}</Link></>}
                </p>
              </div>
              <span className={`text-xs font-mono-data shrink-0 ${overdue ? 'text-brick font-semibold' : 'text-ink-muted'}`}>
                {new Date(t.dueDate).toLocaleDateString()}
              </span>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <p className="text-sm text-ink-muted text-center py-10">No tasks in this view.</p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New task">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Due date">
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input" required />
            </Field>
          </div>
          <Field label="Related deal">
            <select value={form.dealId} onChange={(e) => setForm({ ...form, dealId: e.target.value })} className="input">
              <option value="">— None —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
          <Field label="Related contact">
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className="input">
              <option value="">— None —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors mt-2">
            Add task
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
