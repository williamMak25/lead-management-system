import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { currency } from '../components/Kanban';

export default function CompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.getCompany(id).then(setCompany);
  }, [id]);

  if (!company) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link to="/companies" className="text-xs text-ink-muted hover:text-ledger">← Companies</Link>
        <h1 className="font-display text-2xl mt-1">{company.name}</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {company.industry || 'No industry set'} · {company.size || 'Unknown size'} · {company.website}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Contacts</p>
          <ul className="space-y-2">
            {company.contacts.map((c) => (
              <li key={c.id}>
                <Link to={`/contacts/${c.id}`} className="text-sm font-medium hover:text-ledger transition-colors">
                  {c.name}
                </Link>
                <p className="text-xs text-ink-muted">{c.title}</p>
              </li>
            ))}
            {company.contacts.length === 0 && <p className="text-sm text-ink-muted">No contacts yet.</p>}
          </ul>
        </div>

        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Deals</p>
          <ul className="space-y-2">
            {company.deals.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <Link to={`/deals/${d.id}`} className="font-medium hover:text-ledger transition-colors">
                  {d.title}
                </Link>
                <span className="font-mono-data text-ink-muted">{currency(d.value)}</span>
              </li>
            ))}
            {company.deals.length === 0 && <p className="text-sm text-ink-muted">No deals yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
