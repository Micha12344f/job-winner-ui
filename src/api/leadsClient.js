// Leads (people in contact about one application) and the stored full job
// description, served by the Job Winner extension API. Address and error type
// come from extClient.js so every /ext caller resolves the base URL the same
// way (same-origin /api/ext in production, the local sidecar in development).

import { ExtApiError, extBaseUrl } from './extClient';

export { ExtApiError, extBaseUrl };

// Exact status tokens the extension API accepts, in pipeline order.
export const LEAD_STATUSES = [
  'identified',
  'contacted',
  'replied',
  'meeting',
  'referred',
  'closed',
];

// Each lead status borrows an existing status tone from the theme palette
// (see config/theme.js -> palette.status). There are five tones for six
// statuses, so both positive outcomes share the green 'active' tone.
export const LEAD_STATUS_TONE = {
  identified: 'all',
  contacted: 'open',
  replied: 'ghosted',
  meeting: 'active',
  referred: 'active',
  closed: 'rejected',
};

// Columns a lead may be written with. `application_id`, `id` and timestamps
// are managed by the API.
export const LEAD_FIELDS = [
  'name',
  'role',
  'company',
  'email',
  'phone',
  'linkedin_url',
  'relationship',
  'status',
  'source',
  'last_contact_at',
  'next_action',
  'next_action_due',
  'notes',
];

// The API reports validation failures as a list of {loc, msg} entries.
async function readError(response) {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (Array.isArray(detail) && detail.length) {
      return detail.map(entry => entry?.msg || String(entry)).join('; ');
    }
    if (typeof detail === 'string' && detail) return detail;
    if (payload?.error) return String(payload.error);
  } catch {
    // fall through to the status text
  }
  return `Request failed with status ${response.status}`;
}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${extBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new ExtApiError(await readError(response), response.status);
  // DELETE answers with a small JSON body; everything else does too.
  return response.json();
}

// The API masks stored phone numbers on read ("+346****1222"), so a masked
// value must never be sent back: it would overwrite the real number.
export const isMaskedValue = value =>
  typeof value === 'string' && value.includes('*');

// Trims text fields and turns empty ones into null so clearing a field in the
// form actually clears it on the server.
export function leadPayload(values) {
  return Object.fromEntries(
    LEAD_FIELDS.filter(
      field => field in values && !isMaskedValue(values[field])
    ).map(field => {
      const value = values[field];
      const text = typeof value === 'string' ? value.trim() : (value ?? null);
      return [field, text === '' ? null : text];
    })
  );
}

export async function listLeads(applicationId) {
  const payload = await request(
    `/leads?application_id=${encodeURIComponent(applicationId)}`
  );
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function createLead(applicationId, values) {
  const payload = leadPayload(values);
  return request('/leads', {
    method: 'POST',
    body: {
      application_id: Number(applicationId),
      ...payload,
      status: payload.status ?? 'identified',
      name: payload.name ?? '',
    },
  });
}

export async function updateLead(leadId, values) {
  return request(`/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    body: leadPayload(values),
  });
}

export async function deleteLead(leadId) {
  return request(`/leads/${encodeURIComponent(leadId)}`, {
    method: 'DELETE',
  });
}

// The full posting text stored by the backend, or null when this application
// has none yet (HTTP 404). Every other failure is thrown.
export async function getJobDescription(applicationId) {
  const response = await fetch(
    `${extBaseUrl()}/jd/${encodeURIComponent(applicationId)}`,
    { headers: { Accept: 'application/json' } }
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new ExtApiError(await readError(response), response.status);
  return response.json();
}
