export const currency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

export const statusBadge = {
  New: 'bg-ledger-soft text-ledger',
  Contacted: 'bg-gold-soft text-gold',
  Qualified: 'bg-ledger text-white',
  Disqualified: 'bg-brick-soft text-brick',
  Converted: 'bg-ink text-paper',
};

export const recordHref = (r) => `/${r.type === 'opportunity' ? 'pipeline' : 'leads'}/${r.id}`;
