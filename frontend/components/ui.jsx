'use client';

// Small shared building blocks: priority stars, tag pills, avatars, activity badges, buttons.

export const TAG_COLORS = [
  ['#E9EBE3', '#4B5563'], // 0 none
  ['#F5E4DE', '#B54F35'], // 1 brick
  ['#FBE8D3', '#B5651D'], // 2 orange
  ['#F6EFD6', '#9A7B12'], // 3 gold
  ['#DDF0F2', '#2B7A85'], // 4 cyan
  ['#ECE3F3', '#6B4A8A'], // 5 purple
  ['#F3EADF', '#8A6A45'], // 6 almond
  ['#DCEFEA', '#24705E'], // 7 teal
  ['#E0E8F5', '#3B5B92'], // 8 blue
  ['#F7E1E8', '#A13A5C'], // 9 raspberry
  ['#E4EEE9', '#2F6F5E'], // 10 ledger green
  ['#E8E3F5', '#5848A0'], // 11 violet
];

export function TagPill({ tag, onRemove }) {
  const [bg, fg] = TAG_COLORS[tag.color] || TAG_COLORS[0];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      {tag.name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100" aria-label={`Remove ${tag.name}`}>
          ×
        </button>
      )}
    </span>
  );
}

export function Tags({ tags, max = 3 }) {
  if (!tags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.slice(0, max).map((t) => (
        <TagPill key={t.id} tag={t} />
      ))}
      {tags.length > max && <span className="text-[11px] text-ink-muted">+{tags.length - max}</span>}
    </span>
  );
}

export function Stars({ value = 0, onChange, size = 'text-sm' }) {
  return (
    <span className={`inline-flex ${size} leading-none`} onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(value === n ? 0 : n)}
          className={`${n <= value ? 'text-gold' : 'text-ink/20'} ${onChange ? 'hover:text-gold cursor-pointer' : 'cursor-default'} px-px`}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export function Avatar({ user, size = 'w-6 h-6 text-[10px]' }) {
  if (!user) return null;
  if (user.avatarUrl) {
    return (
      <img src={user.avatarUrl} alt={user.name} title={user.name} referrerPolicy="no-referrer" className={`${size} rounded-full shrink-0`} />
    );
  }
  const initials = (user.name || user.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span title={user.name} className={`${size} rounded-full bg-ink text-paper flex items-center justify-center font-medium shrink-0`}>
      {initials}
    </span>
  );
}

const STATE_STYLE = {
  overdue: 'bg-brick text-white',
  today: 'bg-gold text-white',
  planned: 'bg-ledger text-white',
};
const TYPE_ICON = { Email: '✉', Call: '☎', Meeting: '◷', 'To-Do': '✓', 'Upload Document': '⇪' };

export function activityIcon(type) {
  return TYPE_ICON[type] || '•';
}

export function ActivityBadge({ state, type, title }) {
  if (!state) return <span className="w-5 h-5 rounded-full border border-dashed border-ink/20 inline-block" title="No activity" />;
  return (
    <span
      title={title || state}
      className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] ${STATE_STYLE[state] || 'bg-ink/30 text-white'}`}
    >
      {activityIcon(type)}
    </span>
  );
}

export function StatusRibbon({ status }) {
  if (status === 'won') return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider bg-ledger text-white">WON</span>;
  if (status === 'lost') return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider bg-brick text-white">LOST</span>;
  return null;
}

export function Button({ variant = 'secondary', className = '', ...props }) {
  const styles = {
    primary: 'bg-ledger text-white hover:bg-ledger/90 border border-ledger',
    dark: 'bg-ink text-paper hover:bg-ink-soft border border-ink',
    secondary: 'bg-card text-ink-soft border border-black/10 hover:border-ledger/40',
    danger: 'bg-card text-brick border border-brick/30 hover:bg-brick-soft',
    ghost: 'text-ink-muted hover:text-ink hover:bg-black/5 border border-transparent',
  };
  return (
    <button
      type="button"
      className={`text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Select({ value, onChange, options, placeholder = '— None —', className = 'input', allowEmpty = true, ...rest }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={className} {...rest}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.id ?? o.value} value={o.id ?? o.value}>
          {o.name ?? o.label}
        </option>
      ))}
    </select>
  );
}

export function TagPicker({ tags, value, onChange }) {
  const selected = tags.filter((t) => value.includes(t.id));
  const available = tags.filter((t) => !value.includes(t.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5 input min-h-[38px]">
      {selected.map((t) => (
        <TagPill key={t.id} tag={t} onRemove={() => onChange(value.filter((id) => id !== t.id))} />
      ))}
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          className="bg-transparent text-xs text-ink-muted outline-none"
        >
          <option value="">+ tag</option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function EmptyState({ children }) {
  return <p className="text-sm text-ink-muted text-center py-10">{children}</p>;
}
