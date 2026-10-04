'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { currency, recordHref } from '@/lib/format';

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
        <Link href="/companies" className="text-xs text-ink-muted hover:text-ledger">← Companies</Link>
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
                <Link href={`/contacts/${c.id}`} className="text-sm font-medium hover:text-ledger transition-colors">
                  {c.name}
                </Link>
                <p className="text-xs text-ink-muted">{c.title}</p>
              </li>
            ))}
            {company.contacts.length === 0 && <p className="text-sm text-ink-muted">No contacts yet.</p>}
          </ul>
        </div>

        <div className="index-card rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-medium mb-3">Leads &amp; opportunities</p>
          <ul className="space-y-2">
            {company.opportunities.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <Link href={recordHref(d)} className="font-medium hover:text-ledger transition-colors">
                  {d.name}
                </Link>
                <span className="text-xs text-ink-muted ml-auto mr-3">{d.type === 'lead' ? 'Lead' : d.wonStatus === 'pending' ? d.stage?.name : d.wonStatus === 'won' ? 'Won' : 'Lost'}</span>
                <span className="font-mono-data text-ink-muted">{currency(d.expectedRevenue)}</span>
              </li>
            ))}
            {company.opportunities.length === 0 && <p className="text-sm text-ink-muted">None yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
