'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, api } from '@/lib/api';
import { useMeta } from '@/context/MetaContext';
import { Button, Select, TAG_COLORS, TagPill } from '@/components/ui';

const TABS = [
  ['stages', 'Stages'],
  ['teams', 'Sales teams'],
  ['tags', 'Tags'],
  ['lost', 'Lost reasons'],
  ['utm', 'Campaigns & sources'],
  ['scoring', 'Lead scoring'],
];

/** CRM configuration, like Odoo's CRM → Configuration menu. */
export default function Settings() {
  const [tab, setTab] = useState('stages');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const meta = useMeta();

  // run an API call, surface errors, refresh the shared lookup lists
  const run = useCallback(
    async (fn, ok) => {
      setError(null);
      try {
        const r = await fn();
        await meta.refresh();
        if (ok) {
          setNotice(typeof ok === 'function' ? ok(r) : ok);
          setTimeout(() => setNotice(null), 3500);
        }
        return r;
      } catch (e) {
        setError(e.message);
        return null;
      }
    },
    [meta],
  );

  return (
    <div className="space-y-5 animate-fade-in max-w-5xl">
      <div>
        <h1 className="font-display text-2xl">Settings</h1>
        <p className="text-sm text-ink-muted mt-0.5">Pipeline stages, teams and assignment, tags, lost reasons, marketing sources, and lead scoring.</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-black/10">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k);
              setError(null);
            }}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-ledger text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-ledger bg-ledger-soft rounded-md px-3 py-2">{notice}</p>}
      {tab === 'stages' && <Stages run={run} />}
      {tab === 'teams' && <Teams run={run} />}
      {tab === 'tags' && <TagsTab run={run} />}
      {tab === 'lost' && <LostReasons run={run} />}
      {tab === 'utm' && <Utm run={run} />}
      {tab === 'scoring' && <Scoring run={run} />}
    </div>
  );
}

function Stages({ run }) {
  const { stages } = useMeta();
  const [name, setName] = useState('');
  const move = (i, d) => {
    const ids = stages.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => http.post('/stages/reorder', { ids }));
  };
  return (
    <div className="index-card rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-black/5">
            <th className="px-4 py-3 font-medium w-20">Order</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            <th className="px-4 py-3 font-medium">Won stage</th>
            <th className="px-4 py-3 font-medium">Folded in kanban</th>
            <th className="px-4 py-3 font-medium">Requirements (shown as a tooltip)</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {stages.map((s, i) => (
            <tr key={s.id} className="border-b border-black/5">
              <td className="px-4 py-2 whitespace-nowrap">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="px-1.5 text-ink-muted hover:text-ink disabled:opacity-20" aria-label="Move up">
                  ↑
                </button>
                <button type="button" disabled={i === stages.length - 1} onClick={() => move(i, 1)} className="px-1.5 text-ink-muted hover:text-ink disabled:opacity-20" aria-label="Move down">
                  ↓
                </button>
              </td>
              <td className="px-4 py-2">
                <InlineText value={s.name} onSave={(v) => run(() => http.put(`/stages/${s.id}`, { name: v }))} />
              </td>
              <td className="px-4 py-2">
                <input type="checkbox" checked={s.isWon} onChange={(e) => run(() => http.put(`/stages/${s.id}`, { isWon: e.target.checked }))} className="accent-ledger" />
              </td>
              <td className="px-4 py-2">
                <input type="checkbox" checked={s.fold} onChange={(e) => run(() => http.put(`/stages/${s.id}`, { fold: e.target.checked }))} className="accent-ledger" />
              </td>
              <td className="px-4 py-2">
                <InlineText value={s.requirements} placeholder="e.g. Budget confirmed" onSave={(v) => run(() => http.put(`/stages/${s.id}`, { requirements: v }))} />
              </td>
              <td className="px-4 py-2 text-right">
                <button type="button" onClick={() => confirm(`Delete stage "${s.name}"?`) && run(() => http.del(`/stages/${s.id}`))} className="text-xs text-ink-muted hover:text-brick">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim() && (await run(() => http.post('/stages', { name: name.trim() })))) setName('');
        }}
        className="flex gap-2 p-3 border-t border-black/5"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New stage name" className="input max-w-xs" />
        <Button type="submit" variant="primary">
          Add stage
        </Button>
      </form>
    </div>
  );
}

function InlineText({ value, onSave, placeholder }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value || '') && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full bg-transparent border border-transparent hover:border-black/10 focus:border-ledger/40 rounded px-1.5 py-1 outline-none"
    />
  );
}

function Teams({ run }) {
  const meta = useMeta();
  const [teams, setTeams] = useState([]);
  const [settings, setSettings] = useState(null);
  const [newName, setNewName] = useState('');
  const load = useCallback(() => http.get('/teams').then(setTeams), []);
  useEffect(() => {
    load();
    http.get('/settings').then(setSettings);
  }, [load]);

  const save = async (team, patch) => {
    if (await run(() => http.put(`/teams/${team.id}`, patch))) load();
  };
  const members = (team) => team.members.map((m) => ({ userId: m.user.id, maxLeads: m.maxLeads, active: m.active }));

  return (
    <div className="space-y-4">
      <div className="index-card rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!settings?.autoAssignOnCreate}
            onChange={async (e) => {
              const s = await run(() => http.put('/settings', { autoAssignOnCreate: e.target.checked }));
              if (s) setSettings(s);
            }}
            className="accent-ledger"
          />
          Assign new leads automatically when they're created or imported
        </label>
        <Button
          variant="primary"
          onClick={async () => {
            await run(() => api.autoAssign(), (r) => `${r.assigned} unassigned record${r.assigned === 1 ? '' : 's'} assigned`);
            load();
          }}
        >
          Assign unassigned leads now
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        Teams are checked in order. A team takes a lead when it matches all of the team's rules (empty rules match everything); within the team, the member with the most spare capacity — leads assigned in the last 30 days against their maximum — gets it.
      </p>

      {teams.map((t) => (
        <div key={t.id} className="index-card rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] font-display text-lg">
              <InlineText value={t.name} onSave={(v) => save(t, { name: v })} />
            </div>
            <label className="text-xs flex items-center gap-1.5">
              Order <input type="number" defaultValue={t.sequence} onBlur={(e) => Number(e.target.value) !== t.sequence && save(t, { sequence: Number(e.target.value) })} className="input w-16 py-1!" />
            </label>
            <label className="text-xs flex items-center gap-1.5">
              <input type="checkbox" checked={t.active} onChange={(e) => save(t, { active: e.target.checked })} className="accent-ledger" /> Active
            </label>
            <label className="text-xs flex items-center gap-1.5">
              <input type="checkbox" checked={t.assignEnabled} onChange={(e) => save(t, { assignEnabled: e.target.checked })} className="accent-ledger" /> Auto-assignment
            </label>
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Delete team "${t.name}"?`)) return;
                await run(() => http.del(`/teams/${t.id}`));
                load();
              }}
              className="text-xs text-ink-muted hover:text-brick"
            >
              Delete
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-ink-muted font-medium">Members</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-ink-muted w-16">Leader</span>
                <Select value={t.leader?.id} onChange={(v) => save(t, { leaderId: v })} options={meta.users} className="input py-1!" />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-ink-muted">
                    <th className="py-1 font-medium">User</th>
                    <th className="py-1 font-medium">Max / 30 days</th>
                    <th className="py-1 font-medium">Assigned</th>
                    <th className="py-1 font-medium">Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {t.members.map((m, i) => (
                    <tr key={m.user.id} className="border-t border-black/5">
                      <td className="py-1.5">{m.user.name}</td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          min="0"
                          defaultValue={m.maxLeads}
                          title="0 = unlimited"
                          onBlur={(e) => {
                            const next = members(t);
                            next[i].maxLeads = Number(e.target.value) || 0;
                            if (next[i].maxLeads !== m.maxLeads) save(t, { members: next });
                          }}
                          className="input w-20 py-1!"
                        />
                      </td>
                      <td className="py-1.5 font-mono-data text-xs">{m.assigned30d}</td>
                      <td className="py-1.5">
                        <input
                          type="checkbox"
                          checked={m.active}
                          onChange={(e) => {
                            const next = members(t);
                            next[i].active = e.target.checked;
                            save(t, { members: next });
                          }}
                          className="accent-ledger"
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <button type="button" onClick={() => save(t, { members: members(t).filter((_, j) => j !== i) })} className="text-xs text-ink-muted hover:text-brick">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Select
                value={null}
                onChange={(v) => v && save(t, { members: [...members(t), { userId: v, maxLeads: 30, active: true }] })}
                options={meta.users.filter((u) => !t.members.some((m) => m.user.id === u.id))}
                placeholder="+ Add member…"
                className="input py-1! text-xs!"
              />
            </div>

            <AssignRules team={t} onSave={(assignDomain) => save(t, { assignDomain })} />
          </div>
        </div>
      ))}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (newName.trim() && (await run(() => http.post('/teams', { name: newName.trim() })))) {
            setNewName('');
            load();
          }
        }}
        className="flex gap-2"
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New team name" className="input max-w-xs" />
        <Button type="submit" variant="primary">
          Add team
        </Button>
      </form>
    </div>
  );
}

function AssignRules({ team, onSave }) {
  const meta = useMeta();
  const [rule, setRule] = useState(team.assignDomain || {});
  useEffect(() => setRule(team.assignDomain || {}), [team.assignDomain]);
  const toggle = (key, id) => {
    const cur = rule[key] || [];
    setRule({ ...rule, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const chips = (key, options) => (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => toggle(key, o.id)}
          className={`px-2 py-0.5 rounded-full text-[11px] border ${(rule[key] || []).includes(o.id) ? 'bg-ledger text-white border-ledger' : 'border-black/10 text-ink-soft hover:border-ledger/40'}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-ink-muted font-medium">Assignment rules</p>
      <div className="space-y-2 text-xs">
        <div>
          <p className="text-ink-muted mb-1">Record types</p>
          {chips('types', [
            { id: 'lead', name: 'Leads' },
            { id: 'opportunity', name: 'Opportunities' },
          ])}
        </div>
        <div>
          <p className="text-ink-muted mb-1">Sources</p>
          {chips('sourceIds', meta.utm.source)}
        </div>
        <div>
          <p className="text-ink-muted mb-1">Tags (any of)</p>
          {chips('tagIds', meta.tags)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="text-ink-muted">Countries (comma-separated)</span>
            <input value={(rule.countries || []).join(', ')} onChange={(e) => setRule({ ...rule, countries: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className="input py-1! mt-0.5" />
          </label>
          <label>
            <span className="text-ink-muted">Min. expected revenue</span>
            <input type="number" min="0" value={rule.minRevenue || ''} onChange={(e) => setRule({ ...rule, minRevenue: Number(e.target.value) || undefined })} className="input py-1! mt-0.5" />
          </label>
        </div>
      </div>
      {JSON.stringify(rule) !== JSON.stringify(team.assignDomain || {}) && (
        <Button variant="primary" onClick={() => onSave(Object.fromEntries(Object.entries(rule).filter(([, v]) => (Array.isArray(v) ? v.length : v))))}>
          Save rules
        </Button>
      )}
    </div>
  );
}

function TagsTab({ run }) {
  const { tags } = useMeta();
  const [name, setName] = useState('');
  const [color, setColor] = useState(10);
  return (
    <div className="index-card rounded-lg p-5 space-y-4">
      <ul className="space-y-2">
        {tags.map((t) => (
          <li key={t.id} className="flex items-center gap-3">
            <div className="w-40">
              <TagPill tag={t} />
            </div>
            <InlineText value={t.name} onSave={(v) => run(() => http.put(`/tags/${t.id}`, { name: v }))} />
            <ColorPicker value={t.color} onChange={(c) => run(() => http.put(`/tags/${t.id}`, { color: c }))} />
            <button type="button" onClick={() => confirm(`Delete tag "${t.name}"?`) && run(() => http.del(`/tags/${t.id}`))} className="text-xs text-ink-muted hover:text-brick">
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim() && (await run(() => http.post('/tags', { name: name.trim(), color })))) setName('');
        }}
        className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-4"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" className="input max-w-xs" />
        <ColorPicker value={color} onChange={setColor} />
        <Button type="submit" variant="primary">
          Add tag
        </Button>
      </form>
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <span className="flex gap-1">
      {TAG_COLORS.map(([bg, fg], i) => (
        <button
          key={bg}
          type="button"
          onClick={() => onChange(i)}
          className={`w-4 h-4 rounded-full border ${value === i ? 'ring-2 ring-offset-1 ring-ledger' : ''}`}
          style={{ background: bg, borderColor: fg }}
          aria-label={`Colour ${i}`}
        />
      ))}
    </span>
  );
}

function LostReasons({ run }) {
  const { lostReasons } = useMeta();
  const [name, setName] = useState('');
  return (
    <div className="index-card rounded-lg p-5 space-y-3">
      <ul className="space-y-1">
        {lostReasons.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <InlineText value={r.name} onSave={(v) => run(() => http.put(`/lost-reasons/${r.id}`, { name: v }))} />
            <label className="text-xs flex items-center gap-1.5 shrink-0">
              <input type="checkbox" checked={r.active} onChange={(e) => run(() => http.put(`/lost-reasons/${r.id}`, { active: e.target.checked }))} className="accent-ledger" /> Active
            </label>
            <button type="button" onClick={() => confirm(`Delete "${r.name}"?`) && run(() => http.del(`/lost-reasons/${r.id}`))} className="text-xs text-ink-muted hover:text-brick shrink-0">
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim() && (await run(() => http.post('/lost-reasons', { name: name.trim() })))) setName('');
        }}
        className="flex gap-2 border-t border-black/5 pt-3"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New lost reason" className="input max-w-xs" />
        <Button type="submit" variant="primary">
          Add
        </Button>
      </form>
    </div>
  );
}

function Utm({ run }) {
  const { utm } = useMeta();
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {[
        ['campaign', 'Campaigns'],
        ['medium', 'Mediums'],
        ['source', 'Sources'],
      ].map(([kind, label]) => (
        <UtmColumn key={kind} kind={kind} label={label} items={utm[kind]} run={run} />
      ))}
    </div>
  );
}

function UtmColumn({ kind, label, items, run }) {
  const [name, setName] = useState('');
  return (
    <div className="index-card rounded-lg p-4 space-y-2">
      <p className="text-xs uppercase tracking-wide text-ink-muted font-medium">{label}</p>
      <ul className="space-y-0.5">
        {items.map((u) => (
          <li key={u.id} className="flex items-center gap-2">
            <InlineText value={u.name} onSave={(v) => run(() => http.put(`/utm/${u.id}`, { name: v }))} />
            <button type="button" onClick={() => confirm(`Delete "${u.name}"?`) && run(() => http.del(`/utm/${u.id}`))} className="text-xs text-ink-muted hover:text-brick">
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim() && (await run(() => http.post('/utm', { kind, name: name.trim() })))) setName('');
        }}
        className="flex gap-1.5 pt-1"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${kind}`} className="input py-1! text-xs!" />
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}

function Scoring({ run }) {
  const { scoringFields } = useMeta();
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    http.get('/settings').then(setSettings);
  }, []);
  if (!settings) return null;
  const toggle = async (key) => {
    const next = settings.scoringFields.includes(key) ? settings.scoringFields.filter((k) => k !== key) : [...settings.scoringFields, key];
    const s = await run(() => http.put('/settings', { scoringFields: next }), 'Saved — probabilities recalculated');
    if (s) setSettings(s);
  };
  return (
    <div className="index-card rounded-lg p-5 space-y-4">
      <p className="text-sm text-ink-soft">
        Predictive lead scoring estimates each open record&apos;s chance of being won from your won and lost history, the way Odoo does: for every field below it compares how often each value appears among won versus lost records. Records whose probability you set by hand keep it until you switch them back to the prediction.
      </p>
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-2">Learn from these fields</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {scoringFields.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.scoringFields.includes(f.key)} onChange={() => toggle(f.key)} className="accent-ledger" /> {f.label}
            </label>
          ))}
        </div>
      </div>
      <Button variant="primary" onClick={() => run(() => api.rescore(), (r) => `${r.updated} records rescored`)}>
        Recalculate all probabilities
      </Button>
    </div>
  );
}
