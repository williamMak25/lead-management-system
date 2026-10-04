export default function StatCard({ label, value, sublabel, accent = 'ledger' }) {
  const accentMap = {
    ledger: 'text-ledger',
    brick: 'text-brick',
    gold: 'text-gold',
    ink: 'text-ink',
  };
  return (
    <div className="index-card rounded-lg px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-ink-muted font-medium">{label}</p>
      <p className={`font-mono-data text-2xl font-semibold mt-1.5 ${accentMap[accent] || 'text-ink'}`}>
        {value}
      </p>
      {sublabel && <p className="text-xs text-ink-muted mt-1">{sublabel}</p>}
    </div>
  );
}
