import { useState } from 'react';
import { Link } from 'react-router-dom';

const currency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const stageAccent = {
  'New Lead': 'text-ledger',
  Contacted: 'text-ledger',
  'Proposal Sent': 'text-gold',
  Negotiation: 'text-gold',
  Won: 'text-ledger',
  Lost: 'text-brick',
};

export default function Kanban({ stages, deals, onStageChange }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const dealsByStage = (stage) => deals.filter((d) => d.stage === stage);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
      {stages.map((stage) => {
        const stageDeals = dealsByStage(stage);
        const total = stageDeals.reduce((sum, d) => sum + d.value, 0);
        const isOver = overStage === stage;
        return (
          <div
            key={stage}
            className={`flex flex-col w-72 shrink-0 rounded-lg transition-colors ${
              isOver ? 'bg-ledger-soft' : 'bg-paper-deep/60'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(stage);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setOverStage(null);
              if (dragId) onStageChange(dragId, stage);
              setDragId(null);
            }}
          >
            <div className="px-3 pt-3 pb-2 border-b-2 border-ink/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{stage}</p>
                <span className="text-[11px] font-mono-data text-ink-muted">{stageDeals.length}</span>
              </div>
              <p className="font-mono-data text-sm text-ink-muted mt-0.5">{currency(total)}</p>
            </div>
            <div className="flex-1 p-2.5 space-y-2.5 min-h-[120px]">
              {stageDeals.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDragId(deal.id)}
                  className={`index-card rounded-md p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                    deal.value >= 50000 ? 'priority' : ''
                  }`}
                >
                  <Link to={`/deals/${deal.id}`} className="block">
                    <p className="text-sm font-medium leading-snug hover:text-ledger transition-colors">
                      {deal.title}
                    </p>
                  </Link>
                  <p className="text-xs text-ink-muted mt-1">{deal.company?.name || 'No company'}</p>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className={`font-mono-data text-sm font-semibold ${stageAccent[stage] || 'text-ink'}`}>
                      {currency(deal.value)}
                    </span>
                    {deal.contact && (
                      <span
                        title={deal.contact.name}
                        className="w-6 h-6 rounded-full bg-ink text-paper text-[10px] flex items-center justify-center font-medium"
                      >
                        {deal.contact.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {stageDeals.length === 0 && (
                <p className="text-xs text-ink-muted/60 text-center py-6 border border-dashed border-ink/10 rounded-md">
                  Drop a card here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { currency };
