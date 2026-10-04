'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { currency, recordHref } from '@/lib/format';
import { useMeta } from '@/context/MetaContext';
import Chatter from '@/components/Chatter';
import { Avatar, Button, Select, StatusRibbon, Stars, TagPicker, Tags } from '@/components/ui';
import { ConvertModal, DuplicateList, LostModal, MergeModal } from '@/components/LeadModals';
import Modal from '@/components/Modal';

const dateInput = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '');

function toForm(r) {
  return {
    name: r.name,
    contactId: r.contact?.id || null,
    companyId: r.company?.id || null,
    contactName: r.contactName,
    partnerName: r.partnerName,
    function: r.function,
    email: r.email,
    phone: r.phone,
    website: r.website,
    city: r.city,
    country: r.country,
    userId: r.user?.id || null,
    teamId: r.team?.id || null,
    expectedRevenue: r.expectedRevenue,
    probability: r.probability,
    dateDeadline: dateInput(r.dateDeadline),
    tagIds: r.tags.map((t) => t.id),
    sourceId: r.source?.id || null,
    mediumId: r.medium?.id || null,
    campaignId: r.campaign?.id || null,
    description: r.description,
    lostFeedback: r.lostFeedback,
  };
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3 py-1.5 min-h-[34px]">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <div className="text-sm min-w-0 wrap-anywhere">{children}</div>
    </div>
  );
}

/** One form for leads and opportunities, like Odoo's crm.lead form view. */
export default function LeadDetail() {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();
  const [rec, setRec] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null);
  const [dupes, setDupes] = useState([]);
  const [mergeIds, setMergeIds] = useState([]);

  const load = useCallback(
    () =>
      api
        .getLead(id)
        .then((r) => {
          setRec(r);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  // opportunities live under /pipeline/<id>, leads under /leads/<id> (keeps the sidebar right after converting)
  useEffect(() => {
    if (rec && rec.id === id && pathname !== recordHref(rec)) router.replace(recordHref(rec));
  }, [rec, id, pathname, router]);

  function startEdit() {
    setForm(toForm(rec));
    setEditing(true);
    if (!contacts.length) api.getContacts().then(setContacts);
    if (!companies.length) api.getCompanies().then(setCompanies);
  }

  async function save() {
    const payload = { ...form, expectedRevenue: Number(form.expectedRevenue) || 0, dateDeadline: form.dateDeadline || null };
    if (Number(form.probability) === rec.probability) delete payload.probability;
    else payload.probability = Number(form.probability) || 0;
    try {
      await api.updateLead(id, payload);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function act(fn) {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function openDupes() {
    setDupes(await api.getDuplicates(id));
    setMergeIds([]);
    setModal('dupes');
  }

  if (error && !rec) return <p className="text-sm text-brick">{error}</p>;
  if (!rec) return <p className="text-sm text-ink-muted">Loading…</p>;

  const isOpp = rec.type === 'opportunity';
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const f = form || {};
  const text = (key, props = {}) =>
    editing ? <input value={f[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} className="input py-1!" {...props} /> : rec[key] || <span className="text-ink-muted">—</span>;

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl">
      {/* control panel */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={isOpp ? '/pipeline' : '/leads'} className="text-xs text-ink-muted hover:text-ledger">
          ← {isOpp ? 'Pipeline' : 'Leads'}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button variant="primary" onClick={save}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Discard
              </Button>
            </>
          ) : (
            <Button onClick={startEdit}>Edit</Button>
          )}
          {rec.duplicateCount > 0 && (
            <Button onClick={openDupes} title="Records with the same email, phone or company">
              ⚠ Similar ({rec.duplicateCount})
            </Button>
          )}
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('Delete this record?')) return;
              await api.deleteLead(id);
              router.push(isOpp ? '/pipeline' : '/leads');
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}

      {/* header: actions + stage bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {rec.active && !isOpp && (
            <Button variant="primary" onClick={() => setModal('convert')}>
              Convert to opportunity
            </Button>
          )}
          {rec.active && rec.wonStatus !== 'won' && isOpp && (
            <Button variant="primary" aria-label="Mark as won" onClick={() => act(() => api.markWon(id))}>
              Won
            </Button>
          )}
          {rec.active && rec.wonStatus !== 'won' && (
            <Button aria-label={isOpp ? 'Mark as lost' : 'Mark as lost / disqualify'} onClick={() => setModal('lost')}>
              {isOpp ? 'Lost' : 'Lost / disqualify'}
            </Button>
          )}
          {!rec.active && (
            <Button variant="primary" onClick={() => act(() => api.restoreLead(id))}>
              Restore
            </Button>
          )}
        </div>
        {isOpp && (
          <div className="flex flex-wrap" role="group" aria-label="Pipeline stage">
            {meta.stages.map((s, i) => {
              const current = rec.stage?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!rec.active}
                  aria-current={current ? 'step' : undefined}
                  onClick={() => !current && act(() => api.updateLead(id, { stageId: s.id }))}
                  title={s.requirements || undefined}
                  className={`text-xs px-3 py-1.5 border-y border-r first:border-l first:rounded-l-md last:rounded-r-md transition-colors ${i === 0 ? 'border-l' : ''} ${
                    current ? 'bg-ledger text-white border-ledger' : 'bg-card text-ink-soft border-black/10 hover:bg-ledger-soft disabled:hover:bg-card'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        <div className="index-card rounded-lg p-6 space-y-5">
          {/* title */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">{isOpp ? 'Opportunity' : 'Lead'}</p>
              {editing ? (
                <input value={f.name} onChange={(e) => set({ name: e.target.value })} className="input text-xl! font-display mt-1" />
              ) : (
                <h1 className="font-display text-2xl mt-0.5 break-words">{rec.name}</h1>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StatusRibbon status={rec.wonStatus} />
              <Stars value={rec.priority} onChange={(p) => act(() => api.updateLead(id, { priority: p }))} size="text-xl" />
            </div>
          </div>

          {/* revenue / probability */}
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-xs text-ink-muted">Expected revenue</p>
              {editing ? (
                <input type="number" min="0" value={f.expectedRevenue} onChange={(e) => set({ expectedRevenue: e.target.value })} className="input py-1! w-40 font-mono-data" />
              ) : (
                <p className="font-mono-data text-2xl font-semibold text-ledger">{currency(rec.expectedRevenue)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-ink-muted">Probability</p>
              {editing ? (
                <input type="number" min="0" max="100" step="0.01" value={f.probability} onChange={(e) => set({ probability: e.target.value })} className="input py-1! w-28 font-mono-data" />
              ) : (
                <p className="font-mono-data text-2xl font-semibold">{rec.probability}%</p>
              )}
            </div>
            <div className="text-xs text-ink-muted pb-1 space-y-0.5">
              {rec.isAutomatedProbability ? (
                <p title="Predicted from won/lost history (Settings → Lead scoring)">⚙ Automated</p>
              ) : (
                <button type="button" onClick={() => act(() => api.autoProbability(id))} className="text-ledger hover:underline">
                  Use predicted ({rec.automatedProbability}%)
                </button>
              )}
              <p>Weighted: {currency(rec.proratedRevenue)}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-x-8">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1 mt-2">Customer</p>
              <Row label="Contact">
                {editing ? (
                  <Select
                    value={f.contactId}
                    onChange={(v) => {
                      const c = contacts.find((x) => x.id === v);
                      set({ contactId: v, ...(c ? { companyId: c.companyId, contactName: c.name, email: c.email || f.email, phone: c.phone || f.phone } : {}) });
                    }}
                    options={contacts}
                    className="input py-1!"
                  />
                ) : rec.contact ? (
                  <Link href={`/contacts/${rec.contact.id}`} className="text-ledger hover:underline">
                    {rec.contact.name}
                  </Link>
                ) : (
                  rec.contactName || <span className="text-ink-muted">—</span>
                )}
              </Row>
              {(editing || !rec.contact) && <Row label="Contact name">{text('contactName')}</Row>}
              <Row label="Company">
                {editing ? (
                  <Select value={f.companyId} onChange={(v) => set({ companyId: v })} options={companies} className="input py-1!" placeholder="— Not linked —" />
                ) : rec.company ? (
                  <Link href={`/companies/${rec.company.id}`} className="text-ledger hover:underline">
                    {rec.company.name}
                  </Link>
                ) : (
                  rec.partnerName || <span className="text-ink-muted">—</span>
                )}
              </Row>
              {(editing || !rec.company) && <Row label="Company name">{text('partnerName')}</Row>}
              <Row label="Email">{editing ? text('email', { type: 'email' }) : rec.email ? <a href={`mailto:${rec.email}`} className="hover:text-ledger">{rec.email}</a> : '—'}</Row>
              <Row label="Phone">{editing ? text('phone') : rec.phone ? <a href={`tel:${rec.phone}`} className="hover:text-ledger">{rec.phone}</a> : '—'}</Row>
              <Row label="Job position">{text('function')}</Row>
              <Row label="Website">{text('website')}</Row>
              <Row label="City">{text('city')}</Row>
              <Row label="Country">{text('country')}</Row>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1 mt-2">Sales</p>
              <Row label="Salesperson">
                {editing ? (
                  <Select value={f.userId} onChange={(v) => set({ userId: v })} options={meta.users} className="input py-1!" />
                ) : rec.user ? (
                  <span className="flex items-center gap-2">
                    <Avatar user={rec.user} /> {rec.user.name}
                  </span>
                ) : (
                  <span className="text-ink-muted">Unassigned</span>
                )}
              </Row>
              <Row label="Sales team">{editing ? <Select value={f.teamId} onChange={(v) => set({ teamId: v })} options={meta.teams} className="input py-1!" /> : rec.team?.name || '—'}</Row>
              <Row label="Expected closing">
                {editing ? <input type="date" value={f.dateDeadline} onChange={(e) => set({ dateDeadline: e.target.value })} className="input py-1!" /> : rec.dateDeadline ? new Date(rec.dateDeadline).toLocaleDateString() : '—'}
              </Row>
              <Row label="Tags">{editing ? <TagPicker tags={meta.tags} value={f.tagIds} onChange={(tagIds) => set({ tagIds })} /> : <Tags tags={rec.tags} max={10} />}</Row>
              <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1 mt-4">Marketing</p>
              <Row label="Campaign">{editing ? <Select value={f.campaignId} onChange={(v) => set({ campaignId: v })} options={meta.utm.campaign} className="input py-1!" /> : rec.campaign?.name || '—'}</Row>
              <Row label="Medium">{editing ? <Select value={f.mediumId} onChange={(v) => set({ mediumId: v })} options={meta.utm.medium} className="input py-1!" /> : rec.medium?.name || '—'}</Row>
              <Row label="Source">{editing ? <Select value={f.sourceId} onChange={(v) => set({ sourceId: v })} options={meta.utm.source} className="input py-1!" /> : rec.source?.name || '—'}</Row>
              <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1 mt-4">Dates</p>
              <Row label="Created">{new Date(rec.createdAt).toLocaleDateString()}</Row>
              {rec.dateConversion && <Row label="Converted">{new Date(rec.dateConversion).toLocaleDateString()}</Row>}
              {rec.dateOpen && <Row label="Assigned">{new Date(rec.dateOpen).toLocaleDateString()}</Row>}
              {rec.dateClosed && <Row label="Closed">{new Date(rec.dateClosed).toLocaleDateString()}</Row>}
            </div>
          </div>

          {rec.wonStatus === 'lost' && (
            <div className="rounded-md bg-brick-soft px-4 py-3 text-sm">
              <p className="font-medium text-brick">Lost{rec.lostReason ? `: ${rec.lostReason.name}` : ''}</p>
              {editing ? (
                <textarea value={f.lostFeedback} onChange={(e) => set({ lostFeedback: e.target.value })} rows={2} className="input resize-none mt-2" />
              ) : (
                rec.lostFeedback && <p className="text-ink-soft mt-1 whitespace-pre-line">{rec.lostFeedback}</p>
              )}
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-1.5">Internal notes</p>
            {editing ? (
              <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={4} className="input resize-y" />
            ) : (
              <p className="text-sm text-ink-soft whitespace-pre-line">{rec.description || <span className="text-ink-muted">No notes.</span>}</p>
            )}
          </div>
        </div>

        <Chatter leadId={id} activities={rec.activities} timeline={rec.timeline} onChange={load} />
      </div>

      <LostModal
        open={modal === 'lost'}
        onClose={() => setModal(null)}
        onSubmit={(data) => {
          setModal(null);
          act(() => api.markLost(id, data));
        }}
      />
      <ConvertModal
        open={modal === 'convert'}
        lead={rec}
        onClose={() => setModal(null)}
        onConverted={() => {
          setModal(null);
          load();
        }}
      />
      <Modal open={modal === 'dupes'} onClose={() => setModal(null)} title="Similar records" wide>
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">Records sharing this email, phone number, company or contact. Select any to merge them into one.</p>
          <DuplicateList duplicates={dupes} selectable selected={mergeIds} onToggle={(x) => setMergeIds((m) => (m.includes(x) ? m.filter((y) => y !== x) : [...m, x]))} />
          <Button variant="primary" disabled={!mergeIds.length} onClick={() => setModal('merge')}>
            Merge selected with this record
          </Button>
        </div>
      </Modal>
      <MergeModal
        open={modal === 'merge'}
        records={[rec, ...dupes.filter((d) => mergeIds.includes(d.lead.id)).map((d) => d.lead)]}
        onClose={() => setModal(null)}
        onMerged={(merged) => {
          setModal(null);
          if (merged.id !== id) router.push(recordHref(merged));
          else load();
        }}
      />
    </div>
  );
}
