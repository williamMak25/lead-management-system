function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    hasPassword: Boolean(row.password_hash),
    hasGoogle: Boolean(row.google_id),
    createdAt: iso(row.created_at),
    lastLoginAt: iso(row.last_login_at),
  };
}

export function mapCompany(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    website: row.website,
    size: row.size,
    createdAt: iso(row.created_at),
  };
}

export function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    title: row.title,
    companyId: row.company_id,
    tags: row.tags || [],
    createdAt: iso(row.created_at),
  };
}

export function mapDeal(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    companyId: row.company_id,
    contactId: row.contact_id,
    value: Number(row.value),
    stage: row.stage,
    expectedCloseDate: iso(row.expected_close_date),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    dealId: row.deal_id,
    contactId: row.contact_id,
    dueDate: iso(row.due_date),
    done: row.done,
    createdAt: iso(row.created_at),
  };
}

export function mapLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    companyName: row.company_name,
    title: row.title,
    source: row.source,
    status: row.status,
    value: Number(row.value),
    convertedCompanyId: row.converted_company_id,
    convertedContactId: row.converted_contact_id,
    convertedDealId: row.converted_deal_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    body: row.body,
    dealId: row.deal_id,
    contactId: row.contact_id,
    leadId: row.lead_id,
    createdAt: iso(row.created_at),
  };
}

export function mapActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: iso(row.created_at),
  };
}
