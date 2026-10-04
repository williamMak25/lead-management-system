'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useMeta } from '@/context/MetaContext';
import { FILTER_PRESETS, GROUP_BYS, presetActive, presetParams } from '@/lib/views';

// Labels for active filter chips that don't come from a preset
const PARAM_LABEL = {
  userId: 'Salesperson',
  teamId: 'Team',
  stageId: 'Stage',
  tagId: 'Tag',
  sourceId: 'Source',
  mediumId: 'Medium',
  campaignId: 'Campaign',
  lostReasonId: 'Lost reason',
  status: 'Status',
  activity: 'Activity',
  priority: 'Priority ≥',
  createdFrom: 'Created from',
  createdTo: 'Created to',
  deadlineFrom: 'Closing from',
  deadlineTo: 'Closing to',
};
const RANGE_PAIRS = [['createdFrom', 'createdTo'], ['deadlineFrom', 'deadlineTo']];

/**
 * Search box + Filters / Group by / Favorites menus. `params` is the filter object sent to /api/leads,
 * `groupBy` the client-side grouping. Favorites are saved per view on the server.
 */
export default function SearchBar({ view, type, params, onParams, groupBy, onGroupBy, allowGroupBy = true }) {
  const meta = useMeta();
  const [open, setOpen] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [saveName, setSaveName] = useState('');
  const [saveDefault, setSaveDefault] = useState(false);
  const [saveShared, setSaveShared] = useState(false);
  const [q, setQ] = useState(params.q || '');
  const ref = useRef(null);
  const appliedDefault = useRef(false);

  useEffect(() => {
    api.getFilters(view).then((favs) => {
      setFavorites(favs);
      const def = favs.find((f) => f.isDefault);
      if (def && !appliedDefault.current) {
        appliedDefault.current = true;
        onParams(def.params.filters || {});
        if (def.params.groupBy !== undefined) onGroupBy?.(def.params.groupBy);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.q || '') !== q) onParams({ ...params, q: q || undefined });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function togglePreset(preset) {
    const p = presetParams(preset);
    const next = { ...params };
    if (presetActive(preset, params)) {
      for (const k of Object.keys(p)) delete next[k];
    } else {
      Object.assign(next, p);
    }
    onParams(next);
  }

  function setParam(key, value) {
    const next = { ...params };
    if (value) next[key] = value;
    else delete next[key];
    onParams(next);
  }

  function chipLabel(key, value) {
    const find = (list) => list.find((x) => x.id === value)?.name || value;
    switch (key) {
      case 'userId':
        return value === 'me' ? 'Mine' : value === 'none' ? 'Unassigned' : find(meta.users);
      case 'teamId':
        return find(meta.teams);
      case 'stageId':
        return find(meta.stages);
      case 'tagId':
        return find(meta.tags);
      case 'sourceId':
        return find(meta.utm.source);
      case 'mediumId':
        return find(meta.utm.medium);
      case 'campaignId':
        return find(meta.utm.campaign);
      case 'lostReasonId':
        return find(meta.lostReasons);
      case 'priority':
        return '★'.repeat(Number(value));
      default:
        return value;
    }
  }

  // Merge from/to pairs into one chip
  const chips = [];
  const consumed = new Set(['q']);
  for (const [a, b] of RANGE_PAIRS) {
    if (params[a] || params[b]) {
      chips.push({ keys: [a, b], label: `${PARAM_LABEL[a].replace(' from', '')}: ${params[a] || '…'} → ${params[b] || '…'}` });
      consumed.add(a).add(b);
    }
  }
  for (const [k, v] of Object.entries(params)) {
    if (!consumed.has(k) && v) chips.push({ keys: [k], label: `${PARAM_LABEL[k] || k}: ${chipLabel(k, v)}` });
  }
  const groupLabel = GROUP_BYS.find((g) => g.id === groupBy)?.label;

  async function saveFavorite(e) {
    e.preventDefault();
    if (!saveName.trim()) return;
    const f = await api.saveFilter({
      view,
      name: saveName.trim(),
      params: { filters: params, groupBy: groupBy || null },
      isDefault: saveDefault,
      shared: saveShared,
    });
    setFavorites((prev) => [...prev.map((x) => (saveDefault ? { ...x, isDefault: false } : x)), f]);
    setSaveName('');
    setSaveDefault(false);
    setSaveShared(false);
  }

  async function removeFavorite(f) {
    await api.deleteFilter(f.id);
    setFavorites((prev) => prev.filter((x) => x.id !== f.id));
  }

  const presets = FILTER_PRESETS[type] || [];
  const menuBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setOpen(open === id ? null : id)}
      className={`text-xs px-3 py-2 rounded-md border transition-colors ${open === id ? 'border-ledger/50 bg-ledger-soft' : 'border-black/10 bg-card hover:border-ledger/40'}`}
    >
      {label} ▾
    </button>
  );

  return (
    <div ref={ref} className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[220px] max-w-xl flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border border-black/10 bg-card focus-within:ring-2 focus-within:ring-ledger/40">
          {chips.map((c) => (
            <span key={c.keys.join()} className="inline-flex items-center gap-1 text-[11px] bg-ledger-soft text-ledger px-2 py-0.5 rounded">
              {c.label}
              <button type="button" onClick={() => onParams(Object.fromEntries(Object.entries(params).filter(([k]) => !c.keys.includes(k))))} aria-label="Remove filter">
                ×
              </button>
            </span>
          ))}
          {groupLabel && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-gold-soft text-ink-soft px-2 py-0.5 rounded">
              Group: {groupLabel}
              <button type="button" onClick={() => onGroupBy(null)} aria-label="Remove grouping">
                ×
              </button>
            </span>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, contact, company, email…" className="flex-1 min-w-[160px] bg-transparent text-sm outline-none py-0.5" />
        </div>
        <div className="relative">
          {menuBtn('filters', 'Filters')}
          {open === 'filters' && (
            <div className="absolute z-30 mt-1 w-72 index-card rounded-md p-2 shadow-lg space-y-0.5 max-h-[70vh] overflow-y-auto">
              {presets.map((p, i) =>
                p.divider ? (
                  <div key={`d${i}`} className="border-t border-black/5 my-1" />
                ) : (
                  <button key={p.id} type="button" aria-pressed={presetActive(p, params)} onClick={() => togglePreset(p)} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-paper flex items-center gap-2">
                    <span aria-hidden="true" className={`w-3 ${presetActive(p, params) ? 'text-ledger' : 'text-transparent'}`}>✓</span>
                    {p.label}
                  </button>
                ),
              )}
              <div className="border-t border-black/5 my-1" />
              <div className="grid grid-cols-2 gap-1.5 p-1">
                <FilterSelect label="Salesperson" value={params.userId} onChange={(v) => setParam('userId', v)} options={meta.users} />
                <FilterSelect label="Team" value={params.teamId} onChange={(v) => setParam('teamId', v)} options={meta.teams} />
                <FilterSelect label="Tag" value={params.tagId} onChange={(v) => setParam('tagId', v)} options={meta.tags} />
                <FilterSelect label="Stage" value={params.stageId} onChange={(v) => setParam('stageId', v)} options={meta.stages} />
                <FilterSelect label="Source" value={params.sourceId} onChange={(v) => setParam('sourceId', v)} options={meta.utm.source} />
                <FilterSelect label="Campaign" value={params.campaignId} onChange={(v) => setParam('campaignId', v)} options={meta.utm.campaign} />
                <FilterSelect label="Lost reason" value={params.lostReasonId} onChange={(v) => setParam('lostReasonId', v)} options={meta.lostReasons} />
                <FilterSelect label="Medium" value={params.mediumId} onChange={(v) => setParam('mediumId', v)} options={meta.utm.medium} />
              </div>
            </div>
          )}
        </div>
        {allowGroupBy && (
          <div className="relative">
            {menuBtn('group', 'Group by')}
            {open === 'group' && (
              <div className="absolute z-30 mt-1 w-56 index-card rounded-md p-2 shadow-lg">
                {GROUP_BYS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={groupBy === g.id}
                    onClick={() => {
                      onGroupBy(groupBy === g.id ? null : g.id);
                      setOpen(null);
                    }}
                    className="w-full text-left text-sm px-2 py-1 rounded hover:bg-paper flex items-center gap-2"
                  >
                    <span aria-hidden="true" className={`w-3 ${groupBy === g.id ? 'text-ledger' : 'text-transparent'}`}>✓</span>
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="relative">
          {menuBtn('favorites', '☆ Favorites')}
          {open === 'favorites' && (
            <div className="absolute z-30 right-0 mt-1 w-72 index-card rounded-md p-2 shadow-lg">
              {favorites.length === 0 && <p className="text-xs text-ink-muted px-2 py-1">No saved searches yet.</p>}
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center gap-1 rounded hover:bg-paper">
                  <button
                    type="button"
                    onClick={() => {
                      onParams(f.params.filters || {});
                      onGroupBy?.(f.params.groupBy ?? null);
                      setQ(f.params.filters?.q || '');
                      setOpen(null);
                    }}
                    className="flex-1 text-left text-sm px-2 py-1"
                  >
                    {f.name}
                    {f.isDefault && <span className="text-[10px] text-ledger ml-1">default</span>}
                    {f.shared && !f.mine && <span className="text-[10px] text-ink-muted ml-1">by {f.owner?.name}</span>}
                  </button>
                  {f.mine && (
                    <button type="button" onClick={() => removeFavorite(f)} className="text-ink-muted hover:text-brick px-2" aria-label="Delete saved search">
                      ×
                    </button>
                  )}
                </div>
              ))}
              <form onSubmit={saveFavorite} className="border-t border-black/5 mt-2 pt-2 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-muted px-1">Save current search</p>
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this search" aria-label="Name this search" className="input" />
                <label className="flex items-center gap-2 text-xs px-1">
                  <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} className="accent-ledger" /> Use by default
                </label>
                <label className="flex items-center gap-2 text-xs px-1">
                  <input type="checkbox" checked={saveShared} onChange={(e) => setSaveShared(e.target.checked)} className="accent-ledger" /> Share with all users
                </label>
                <button type="submit" className="w-full bg-ledger text-white text-xs py-1.5 rounded-md hover:bg-ledger/90">
                  Save
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} className="input py-1! text-xs! mt-0.5">
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
