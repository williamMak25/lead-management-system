const BASE = '/api';

let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

function qs(params) {
  if (!params) return '';
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

async function request(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: isForm ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const send = (method) => (path, body, params) =>
  request(`${path}${qs(params)}`, {
    method,
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });

export const http = {
  get: (path, params) => request(`${path}${qs(params)}`),
  post: send('POST'),
  put: send('PUT'),
  del: (path) => request(path, { method: 'DELETE' }),
  url: (path, params) => `${BASE}${path}${qs(params)}`,
};

export const api = {
  // Auth
  getAuthConfig: () => http.get('/auth/config'),
  me: () => http.get('/auth/me'),
  signup: (data) => http.post('/auth/signup', data),
  login: (data) => http.post('/auth/login', data),
  logout: () => http.post('/auth/logout'),

  meta: () => http.get('/meta'),

  // Companies & contacts
  getCompanies: (q) => http.get('/companies', { q }),
  getCompany: (id) => http.get(`/companies/${id}`),
  createCompany: (data) => http.post('/companies', data),
  updateCompany: (id, data) => http.put(`/companies/${id}`, data),
  deleteCompany: (id) => http.del(`/companies/${id}`),
  getContacts: (params) => http.get('/contacts', params),
  getContact: (id) => http.get(`/contacts/${id}`),
  createContact: (data) => http.post('/contacts', data),
  updateContact: (id, data) => http.put(`/contacts/${id}`, data),
  deleteContact: (id) => http.del(`/contacts/${id}`),

  // Leads & opportunities
  getLeads: (params) => http.get('/leads', params),
  getLead: (id) => http.get(`/leads/${id}`),
  createLead: (data) => http.post('/leads', data),
  updateLead: (id, data) => http.put(`/leads/${id}`, data),
  deleteLead: (id) => http.del(`/leads/${id}`),
  markWon: (id) => http.post(`/leads/${id}/won`),
  markLost: (id, data) => http.post(`/leads/${id}/lost`, data),
  restoreLead: (id) => http.post(`/leads/${id}/restore`),
  autoProbability: (id) => http.post(`/leads/${id}/probability/auto`),
  convertLead: (id, data) => http.post(`/leads/${id}/convert`, data),
  checkDuplicates: (params) => http.get('/leads/duplicates', params),
  getDuplicates: (id) => http.get(`/leads/${id}/duplicates`),
  mergeLeads: (data) => http.post('/leads/merge', data),
  bulkLeads: (data) => http.post('/leads/bulk', data),
  autoAssign: () => http.post('/leads/auto-assign'),
  rescore: () => http.post('/leads/rescore'),
  exportUrl: (params) => http.url('/leads/export.csv', params),
  importLeads: (file, params) => {
    const form = new FormData();
    form.append('file', file);
    return http.post('/leads/import', form, params);
  },

  // Activities & notes
  getActivities: (params) => http.get('/activities', params),
  createActivity: (data) => http.post('/activities', data),
  updateActivity: (id, data) => http.put(`/activities/${id}`, data),
  doneActivity: (id, feedback = '') => http.post(`/activities/${id}/done`, { feedback }),
  deleteActivity: (id) => http.del(`/activities/${id}`),
  createNote: (data) => http.post('/notes', data),
  deleteNote: (id) => http.del(`/notes/${id}`),

  // Reports & dashboard
  reportOptions: () => http.get('/reports/options'),
  report: (params) => http.get('/reports/leads', params),
  getDashboardSummary: () => http.get('/dashboard/summary'),

  // Saved filters
  getFilters: (view) => http.get('/filters', { view }),
  saveFilter: (data) => http.post('/filters', data),
  deleteFilter: (id) => http.del(`/filters/${id}`),
};
