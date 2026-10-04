'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { currency, recordHref } from '@/lib/format';
import { groupRecords } from '@/lib/views';
import { useMeta } from '@/context/MetaContext';
import SearchBar from '@/components/SearchBar';
import LeadTable from '@/components/LeadTable';
import Kanban from '@/components/Kanban';
import { Button, Select } from '@/components/ui';
import { ImportModal, LeadFormModal, LostModal, MergeModal } from '@/components/LeadModals';

const VIEW_KEY = (type) => `ledgerline.view.${type}`;

/** The Leads (list) and Pipeline (kanban / list) screens. */
export default function RecordsView({ type }) {
  const meta = useMeta();
  const router = useRouter();
  const isOpp = type === 'opportunity';
  const [params, setParams] = useState({});
  const [groupBy, setGroupBy] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(isOpp ? 'kanban' : 'list');
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [quickStage, setQuickStage] = useState(null);
  const [bulkUser, setBulkUser] = useState(null);
  const [bulkTeam, setBulkTeam] = useState(null);
  const [bulkStage, setBulkStage] = useState(null);
  const [bulkTag, setBulkTag] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY(type));
      if (saved) setMode(saved);
    } catch {
      /* storage unavailable */
    }
  }, [type]);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .getLeads({ ...params, type })
      .then((rows) => {
        setRecords(rows);
        setSelected((sel) => sel.filter((id) => rows.some((r) => r.id === id)));
      })
      .finally(() => setLoading(false));
  }, [params, type]);

  useEffect(() => {
    load();
  }, [load]);

  function switchMode(m) {
    setMode(m);
    try {
      localStorage.setItem(VIEW_KEY(type), m);
    } catch {
      /* storage unavailable */
    }
  }

  const groups = useMemo(() => (mode === 'list' && groupBy ? groupRecords(records, groupBy, meta) : null), [mode, groupBy, records, meta]);
  const selectedRecords = records.filter((r) => selected.includes(r.id));

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  }

  async function bulk(action, extra = {}) {
    const res = await api.bulkLeads({ ids: selected, action, ...extra });
    flash(`${res.count} record${res.count === 1 ? '' : 's'} updated`);
    if (action === 'delete') setSelected([]);
    await load();
  }

  async function onStageChange(rec, stage) {
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, stage } : r)));
    try {
      await api.updateLead(rec.id, { stageId: stage.id });
    } finally {
      load();
    }
  }

  async function onPriority(rec, priority) {
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, priority } : r)));
    await api.updateLead(rec.id, { priority });
  }

  const total = records.reduce((s, r) => s + r.expectedRevenue, 0);
  const prorated = records.reduce((s, r) => s + r.proratedRevenue, 0);
  const kanbanStages = meta.stages.filter((s) => !params.stageId || s.id === params.stageId);

  return (
    <div className="space-y-4 animate-fade-in h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{isOpp ? 'Pipeline' : 'Leads'}</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {loading ? 'Loading…' : `${records.length} record${records.length === 1 ? '' : 's'} · ${currency(total)}`}
            {isOpp && !loading && <> · weighted {currency(prorated)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOpp && (
            <div className="flex rounded-md border border-black/10 overflow-hidden text-xs">
              {['kanban', 'list'].map((m) => (
                <button key={m} type="button" onClick={() => switchMode(m)} className={`px-3 py-1.5 capitalize ${mode === m ? 'bg-ink text-paper' : 'bg-card text-ink-soft hover:bg-paper'}`}>
                  {m}
                </button>
              ))}
            </div>
          )}
          <Button onClick={() => setModal('import')}>Import</Button>
          <a href={api.exportUrl({ ...params, type })} className="text-xs px-3 py-1.5 rounded-md border border-black/10 bg-card text-ink-soft hover:border-ledger/40">
            Export
          </a>
          <button
            type="button"
            onClick={() => {
              setQuickStage(null);
              setModal('new');
            }}
            className="bg-ink text-paper text-sm px-4 py-2 rounded-md hover:bg-ink-soft transition-colors"
          >
            + New {isOpp ? 'opportunity' : 'lead'}
          </button>
        </div>
      </div>

      <SearchBar view={isOpp ? 'pipeline' : 'leads'} type={type} params={params} onParams={setParams} groupBy={groupBy} onGroupBy={setGroupBy} allowGroupBy={mode === 'list'} />

      {notice && <p className="text-xs text-ledger bg-ledger-soft rounded px-3 py-1.5 self-start">{notice}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-ink text-paper rounded-md px-3 py-2 text-xs">
          <span className="font-medium mr-1">{selected.length} selected</span>
          <span className="flex items-center gap-1">
            <Select value={bulkUser} onChange={setBulkUser} options={meta.users} placeholder="Salesperson…" className="text-ink rounded px-1.5 py-1 text-xs" />
            <Select value={bulkTeam} onChange={setBulkTeam} options={meta.teams} placeholder="Team…" className="text-ink rounded px-1.5 py-1 text-xs" />
            <Button variant="secondary" disabled={!bulkUser && !bulkTeam} onClick={() => bulk('assign', { userId: bulkUser ?? undefined, teamId: bulkTeam ?? undefined })}>
              Assign
            </Button>
          </span>
          <Button onClick={() => bulk('auto_assign')}>Auto-assign</Button>
          {isOpp && (
            <span className="flex items-center gap-1">
              <Select value={bulkStage} onChange={setBulkStage} options={meta.stages} placeholder="Stage…" className="text-ink rounded px-1.5 py-1 text-xs" />
              <Button disabled={!bulkStage} onClick={() => bulk('stage', { stageId: bulkStage })}>
                Move
              </Button>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Select value={bulkTag} onChange={setBulkTag} options={meta.tags} placeholder="Tag…" className="text-ink rounded px-1.5 py-1 text-xs" />
            <Button disabled={!bulkTag} onClick={() => bulk('tag', { tagIds: [bulkTag] })}>
              Add tag
            </Button>
          </span>
          {!isOpp && <Button onClick={() => bulk('convert')}>Convert to opportunities</Button>}
          <Button disabled={selected.length < 2} onClick={() => setModal('merge')}>
            Merge
          </Button>
          {selectedRecords.some((r) => !r.active) ? (
            <Button onClick={() => bulk('restore')}>Restore</Button>
          ) : (
            <Button onClick={() => setModal('lost')}>Mark lost</Button>
          )}
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Delete ${selected.length} record(s)? This can't be undone.`)) bulk('delete');
            }}
          >
            Delete
          </Button>
          <button type="button" onClick={() => setSelected([])} className="ml-auto text-paper/60 hover:text-paper">
            Clear
          </button>
        </div>
      )}

      {mode === 'kanban' ? (
        <Kanban
          stages={kanbanStages}
          records={records.filter((r) => r.active)}
          onStageChange={onStageChange}
          onPriority={onPriority}
          onQuickCreate={(stage) => {
            setQuickStage(stage.id);
            setModal('new');
          }}
        />
      ) : (
        <LeadTable
          type={type}
          records={records}
          groups={groups}
          selected={selected}
          onSelect={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onSelectAll={setSelected}
          onPriority={onPriority}
        />
      )}

      <LeadFormModal
        open={modal === 'new'}
        onClose={() => setModal(null)}
        type={type}
        defaultStageId={quickStage}
        onCreated={(rec) => {
          flash(`Created "${rec.name}"${rec.user ? ` · assigned to ${rec.user.name}` : ''}`);
          load();
        }}
      />
      <LostModal
        open={modal === 'lost'}
        count={selected.length}
        onClose={() => setModal(null)}
        onSubmit={async (data) => {
          setModal(null);
          await bulk('lost', data);
        }}
      />
      <MergeModal
        open={modal === 'merge'}
        records={selectedRecords}
        onClose={() => setModal(null)}
        onMerged={(merged) => {
          setModal(null);
          setSelected([]);
          router.push(recordHref(merged));
        }}
      />
      <ImportModal
        open={modal === 'import'}
        type={type}
        onClose={() => setModal(null)}
        onImported={(n) => {
          flash(`${n} record${n === 1 ? '' : 's'} imported`);
          meta.refresh();
          load();
        }}
      />
    </div>
  );
}
