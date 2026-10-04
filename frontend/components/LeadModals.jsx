'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import Field from '@/components/Field';
import { Button, Select, Stars, StatusRibbon, TagPicker } from '@/components/ui';
import { api } from '@/lib/api';
import { currency, recordHref } from '@/lib/format';
import { useMeta } from '@/context/MetaContext';

const REASON_LABEL = { email: 'same email', phone: 'same phone', company: 'same company', customer: 'same customer' };

export function DuplicateList({ duplicates, selectable, selected, onToggle }) {
  return (
    <ul className="divide-y divide-black/5 border border-black/5 rounded-md max-h-64 overflow-y-auto">
      {duplicates.map(({ lead, reasons }) => (
        <li key={lead.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          {selectable && <input type="checkbox" checked={selected.includes(lead.id)} onChange={() => onToggle(lead.id)} className="accent-ledger" />}
          <div className="flex-1 min-w-0">
            <Link href={recordHref(lead)} className="font-medium hover:text-ledger truncate block">
              {lead.name}
            </Link>
            <p className="text-xs text-ink-muted">
              {lead.type === 'opportunity' ? 'Opportunity' : 'Lead'} · {lead.stage?.name || '—'} · {lead.user?.name || 'Unassigned'} · {reasons.map((r) => REASON_LABEL[r] || r).join(', ')}
            </p>
          </div>
          <StatusRibbon status={lead.wonStatus} />
          <span className="font-mono-data text-xs text-ink-muted">{currency(lead.expectedRevenue)}</span>
        </li>
      ))}
    </ul>
  );
}

const blank = (type) => ({
  name: '',
  type,
  contactName: '',
  partnerName: '',
  email: '',
  phone: '',
  expectedRevenue: '',
  priority: 0,
  tagIds: [],
  userId: null,
  teamId: null,
  sourceId: null,
  stageId: null,
  dateDeadline: '',
  contactId: null,
});

export function LeadFormModal({ open, onClose, type = 'lead', defaultStageId, onCreated }) {
  const meta = useMeta();
  const [form, setForm] = useState(blank(type));
  const [dupes, setDupes] = useState([]);
  const [error, setError] = useState(null);
  const [contacts, setContacts] = useState([]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (open) {
      setForm({ ...blank(type), stageId: defaultStageId || null });
      setDupes([]);
      setError(null);
      if (type === 'opportunity') api.getContacts().then(setContacts);
    }
  }, [open, type, defaultStageId]);

  // live duplicate check, like Odoo's "similar leads" warning
  useEffect(() => {
    if (!open || !(form.email || form.phone || form.partnerName || form.contactId)) {
      setDupes([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .checkDuplicates({ email: form.email, phone: form.phone, partnerName: form.partnerName, contactId: form.contactId })
        .then(setDupes)
        .catch(() => setDupes([]));
    }, 350);
    return () => clearTimeout(t);
  }, [open, form.email, form.phone, form.partnerName, form.contactId]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const name = form.name.trim() || [form.contactName, form.partnerName].filter(Boolean).join(' — ') || form.email;
    if (!name) {
      setError('Give it a name, contact, company or email.');
      return;
    }
    try {
      const created = await api.createLead({
        ...form,
        name,
        expectedRevenue: Number(form.expectedRevenue) || 0,
        dateDeadline: form.dateDeadline || null,
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  function pickContact(id) {
    const c = contacts.find((x) => x.id === id);
    set({ contactId: id, contactName: c?.name || '', partnerName: c?.company?.name || form.partnerName, email: c?.email || form.email, phone: c?.phone || form.phone });
  }

  return (
    <Modal open={open} onClose={onClose} title={type === 'opportunity' ? 'New opportunity' : 'New lead'} wide>
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}
        <Field label={type === 'opportunity' ? 'Opportunity' : 'Lead name'}>
          <input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" placeholder="e.g. Website redesign for Acme" />
        </Field>
        {type === 'opportunity' && (
          <Field label="Existing contact">
            <Select value={form.contactId} onChange={pickContact} options={contacts} placeholder="— New customer —" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact name">
            <input value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} className="input" />
          </Field>
          <Field label="Company">
            <input value={form.partnerName} onChange={(e) => set({ partnerName: e.target.value })} className="input" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className="input" />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className="input" />
          </Field>
          <Field label="Expected revenue ($)">
            <input type="number" min="0" value={form.expectedRevenue} onChange={(e) => set({ expectedRevenue: e.target.value })} className="input" />
          </Field>
          <Field label="Expected closing">
            <input type="date" value={form.dateDeadline} onChange={(e) => set({ dateDeadline: e.target.value })} className="input" />
          </Field>
          <Field label="Salesperson">
            <Select value={form.userId} onChange={(v) => set({ userId: v })} options={meta.users} placeholder="— Auto-assign —" />
          </Field>
          <Field label="Sales team">
            <Select value={form.teamId} onChange={(v) => set({ teamId: v })} options={meta.teams.filter((t) => t.active)} placeholder="— Auto —" />
          </Field>
          {type === 'opportunity' && (
            <Field label="Stage">
              <Select value={form.stageId} onChange={(v) => set({ stageId: v })} options={meta.stages} allowEmpty={false} />
            </Field>
          )}
          <Field label="Source">
            <Select value={form.sourceId} onChange={(v) => set({ sourceId: v })} options={meta.utm.source} />
          </Field>
        </div>
        <Field label="Tags">
          <TagPicker tags={meta.tags} value={form.tagIds} onChange={(tagIds) => set({ tagIds })} />
        </Field>
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          Priority <Stars value={form.priority} onChange={(priority) => set({ priority })} size="text-lg" />
        </div>
        {dupes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gold font-medium">⚠ {dupes.length} similar record{dupes.length > 1 ? 's' : ''} already exist{dupes.length > 1 ? '' : 's'}:</p>
            <DuplicateList duplicates={dupes} />
          </div>
        )}
        <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors">
          Create
        </button>
      </form>
    </Modal>
  );
}

export function LostModal({ open, onClose, onSubmit, count = 1 }) {
  const meta = useMeta();
  const [reasonId, setReasonId] = useState(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (open) {
      setReasonId(null);
      setFeedback('');
    }
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={count > 1 ? `Mark ${count} records as lost` : 'Mark as lost'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ lostReasonId: reasonId, lostFeedback: feedback });
        }}
        className="space-y-3"
      >
        <Field label="Lost reason">
          <Select value={reasonId} onChange={setReasonId} options={meta.lostReasons.filter((r) => r.active)} />
        </Field>
        <Field label="Closing note">
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} className="input resize-none" placeholder="What happened?" />
        </Field>
        <button type="submit" className="w-full bg-brick text-white text-sm py-2 rounded-md hover:bg-brick/90">
          Mark as lost
        </button>
      </form>
    </Modal>
  );
}

export function ConvertModal({ open, onClose, lead, onConverted }) {
  const meta = useMeta();
  const [customer, setCustomer] = useState('create');
  const [contactId, setContactId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [userId, setUserId] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [dupes, setDupes] = useState([]);
  const [mergeIds, setMergeIds] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !lead) return;
    setCustomer(lead.contact ? 'link' : 'create');
    setContactId(lead.contact?.id || null);
    setUserId(lead.user?.id || null);
    setTeamId(lead.team?.id || null);
    setMergeIds([]);
    setError(null);
    api.getContacts().then(setContacts);
    api.getDuplicates(lead.id).then(setDupes);
  }, [open, lead]);

  async function submit(e) {
    e.preventDefault();
    try {
      const result = await api.convertLead(lead.id, { customer, contactId, userId: userId || '', teamId: teamId || '', mergeIds });
      onConverted(result);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!lead) return null;
  return (
    <Modal open={open} onClose={onClose} title="Convert to opportunity" wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-ink-soft mb-1">Customer</legend>
          {[
            ['create', `Create a new customer${lead.contactName || lead.partnerName ? ` (${[lead.contactName, lead.partnerName].filter(Boolean).join(', ')})` : ''}`],
            ['link', 'Link to an existing contact'],
            ['nothing', 'Do not link to a customer'],
          ].map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="customer" checked={customer === v} onChange={() => setCustomer(v)} className="accent-ledger" /> {label}
            </label>
          ))}
          {customer === 'link' && <Select value={contactId} onChange={setContactId} options={contacts} placeholder="— Choose a contact —" />}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salesperson">
            <Select value={userId} onChange={setUserId} options={meta.users} />
          </Field>
          <Field label="Sales team">
            <Select value={teamId} onChange={setTeamId} options={meta.teams} />
          </Field>
        </div>
        {dupes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-soft">Merge with similar records (optional)</p>
            <DuplicateList
              duplicates={dupes}
              selectable
              selected={mergeIds}
              onToggle={(id) => setMergeIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))}
            />
          </div>
        )}
        <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90">
          Convert{mergeIds.length ? ` and merge ${mergeIds.length}` : ''}
        </button>
      </form>
    </Modal>
  );
}

export function MergeModal({ open, onClose, records, onMerged }) {
  const [targetId, setTargetId] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open && records.length) {
      // same default as the server: opportunity, furthest stage, oldest
      const sorted = [...records].sort(
        (a, b) =>
          (a.type === 'opportunity' ? 0 : 1) - (b.type === 'opportunity' ? 0 : 1) ||
          (b.stage?.sequence ?? -1) - (a.stage?.sequence ?? -1) ||
          new Date(a.createdAt) - new Date(b.createdAt),
      );
      setTargetId(sorted[0].id);
      setError(null);
    }
  }, [open, records]);

  async function submit() {
    try {
      const merged = await api.mergeLeads({ ids: records.map((r) => r.id), targetId });
      onMerged(merged);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Merge ${records.length} records`} wide>
      <div className="space-y-3">
        {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}
        <p className="text-xs text-ink-muted">
          Pick the record to keep. Empty fields are filled from the others, tags and notes are combined, and activities and history move to it. The other records are deleted.
        </p>
        <ul className="divide-y divide-black/5 border border-black/5 rounded-md">
          {records.map((r) => (
            <li key={r.id}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                <input type="radio" checked={targetId === r.id} onChange={() => setTargetId(r.id)} className="accent-ledger" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-ink-muted">
                    {r.type === 'opportunity' ? 'Opportunity' : 'Lead'} · {r.stage?.name || '—'} · {r.email || 'no email'} · created {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="font-mono-data text-xs">{currency(r.expectedRevenue)}</span>
              </label>
            </li>
          ))}
        </ul>
        <Button variant="primary" className="w-full py-2! text-sm!" onClick={submit} disabled={records.length < 2}>
          Merge into selected
        </Button>
      </div>
    </Modal>
  );
}

const todayIso = () => new Date().toLocaleDateString('en-CA');

export function ActivityModal({ open, onClose, leadId, contactId, activity, onSaved }) {
  const meta = useMeta();
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      activity
        ? { activityType: activity.activityType, summary: activity.summary, note: activity.note, dueDate: activity.dueDate, userId: activity.user?.id || null }
        : { activityType: meta.activityTypes[0] || 'To-Do', summary: '', note: '', dueDate: todayIso(), userId: null },
    );
  }, [open, activity, meta.activityTypes]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    try {
      const saved = activity
        ? await api.updateActivity(activity.id, form)
        : await api.createActivity({ ...form, leadId: leadId || null, contactId: contactId || null });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  const quick = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    set({ dueDate: d.toLocaleDateString('en-CA') });
  };

  return (
    <Modal open={open} onClose={onClose} title={activity ? 'Edit activity' : 'Schedule an activity'}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}
        <div className="flex flex-wrap gap-1.5">
          {meta.activityTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ activityType: t })}
              className={`px-3 py-1 rounded-full text-xs border ${form.activityType === t ? 'bg-ledger text-white border-ledger' : 'border-black/10 text-ink-soft hover:border-ledger/40'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Field label="Summary">
          <input autoFocus value={form.summary || ''} onChange={(e) => set({ summary: e.target.value })} className="input" placeholder="e.g. Discuss proposal" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input type="date" required value={form.dueDate || ''} onChange={(e) => set({ dueDate: e.target.value })} className="input" />
          </Field>
          <Field label="Assigned to">
            <Select value={form.userId} onChange={(v) => set({ userId: v })} options={meta.users} placeholder="— Me —" />
          </Field>
        </div>
        <div className="flex gap-1.5 text-[11px]">
          {[['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([l, d]) => (
            <button key={l} type="button" onClick={() => quick(d)} className="px-2 py-0.5 rounded border border-black/10 text-ink-muted hover:border-ledger/40">
              {l}
            </button>
          ))}
        </div>
        <Field label="Note">
          <textarea value={form.note || ''} onChange={(e) => set({ note: e.target.value })} rows={2} className="input resize-none" />
        </Field>
        <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90">
          {activity ? 'Save' : 'Schedule'}
        </button>
      </form>
    </Modal>
  );
}

export function DoneModal({ open, onClose, activity, onDone }) {
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (open) setFeedback('');
  }, [open]);
  if (!activity) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Mark done: ${activity.summary || activity.activityType}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const done = await api.doneActivity(activity.id, feedback);
          onDone?.(done);
          onClose();
        }}
        className="space-y-3"
      >
        <Field label="Feedback (optional)">
          <textarea autoFocus value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} className="input resize-none" placeholder="How did it go?" />
        </Field>
        <button type="submit" className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90">
          Done
        </button>
      </form>
    </Modal>
  );
}

export function ImportModal({ open, onClose, type, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
      setError(null);
    }
  }, [open]);

  async function run(dryRun) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.importLeads(file, { dryRun: String(dryRun), type });
      if (dryRun) setPreview(res);
      else {
        onImported?.(res.created);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const mapped = preview ? Object.entries(preview.columns) : [];
  return (
    <Modal open={open} onClose={onClose} title={`Import ${type === 'opportunity' ? 'opportunities' : 'leads'} from CSV`} wide>
      <div className="space-y-3">
        <p className="text-xs text-ink-muted">
          Headers are matched automatically: Name, Contact Name, Company, Email, Phone, Job Position, Expected Revenue, Probability, Priority, Salesperson (email), Sales Team, Stage, Tags, Source, Medium, Campaign, Expected Closing (YYYY-MM-DD), City, Country, Notes. Unknown tags and sources are created.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPreview(null);
          }}
          className="text-sm"
        />
        {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}
        {preview && (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-1">
              {mapped.map(([h, f]) => (
                <span key={h} className={`px-2 py-0.5 rounded ${f ? 'bg-ledger-soft text-ledger' : 'bg-paper-deep text-ink-muted line-through'}`}>
                  {h}
                  {f && ` → ${f}`}
                </span>
              ))}
            </div>
            <p>
              <strong>{preview.validCount}</strong> rows ready to import
              {preview.errors.length > 0 && <>, <strong className="text-brick">{preview.errors.length}</strong> with problems</>}.
            </p>
            {preview.errors.length > 0 && (
              <ul className="text-brick bg-brick-soft rounded p-2 max-h-32 overflow-y-auto space-y-0.5">
                {preview.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {preview.preview.length > 0 && (
              <div className="overflow-x-auto border border-black/5 rounded">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      {['line', 'name', 'contact_name', 'partner_name', 'email', 'expected_revenue', 'tags'].map((h) => (
                        <th key={h} className="px-2 py-1 font-medium">
                          {h.replace('_', ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((r) => (
                      <tr key={r.line} className="border-t border-black/5">
                        {['line', 'name', 'contact_name', 'partner_name', 'email', 'expected_revenue', 'tags'].map((h) => (
                          <td key={h} className="px-2 py-1">
                            {r[h] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={() => run(true)} disabled={!file || busy}>
            Test
          </Button>
          <Button variant="primary" onClick={() => run(false)} disabled={!preview || preview.errors.length > 0 || preview.validCount === 0 || busy}>
            Import {preview?.validCount || ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
