// Thin client for the extension API (document metadata), reached through the
// same-origin /api/ext proxy in production and the local sidecar during
// development. Mirrors src/api/filesClient.js.

const DEFAULT_DEV_EXT_URL = 'http://127.0.0.1:8081/ext';

// Categories offered in the picker even before any document uses them.
export const CATEGORY_SUGGESTIONS = [
  'Finance',
  'Engineering',
  'Data',
  'Consulting',
  'General',
];

// Fields PATCH /ext/documents/<id> accepts. Anything else is dropped so a
// stray UI key cannot reach the server.
export const PATCHABLE_FIELDS = [
  'category',
  'headline',
  'application_id',
  'is_primary',
  'notes',
];

export function extBaseUrl() {
  if (import.meta.env.PROD) return '/api/ext';
  return window.APP_CONFIG?.EXT_URL || DEFAULT_DEV_EXT_URL;
}

export class ExtApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ExtApiError';
    this.status = status;
  }
}

async function readError(response) {
  try {
    const payload = await response.json();
    if (payload?.detail) return String(payload.detail);
    if (payload?.error) return String(payload.error);
  } catch {
    // fall through to the status text
  }
  return `Request failed with status ${response.status}`;
}

export async function listDocuments({ category, applicationId } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (applicationId !== undefined && applicationId !== null) {
    if (String(applicationId).trim() !== '') {
      params.set('application_id', String(applicationId));
    }
  }
  const query = params.toString();
  const response = await fetch(
    `${extBaseUrl()}/documents${query ? `?${query}` : ''}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok)
    throw new ExtApiError(await readError(response), response.status);
  const payload = await response.json();
  return {
    count: Number(payload?.count) || 0,
    items: Array.isArray(payload?.items) ? payload.items : [],
    categories: Array.isArray(payload?.categories) ? payload.categories : [],
  };
}

export async function patchDocument(fileId, changes = {}) {
  const id = String(fileId ?? '').trim();
  if (!id) throw new ExtApiError('A document id is required', 400);

  const body = {};
  for (const field of PATCHABLE_FIELDS) {
    if (changes[field] !== undefined) body[field] = changes[field];
  }
  if (Object.keys(body).length === 0) {
    throw new ExtApiError('No changes to save', 400);
  }

  const response = await fetch(
    `${extBaseUrl()}/documents/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok)
    throw new ExtApiError(await readError(response), response.status);
  return response.json();
}

export function documentId(document) {
  return document?.file_id ?? document?.id ?? '';
}

export function documentCategory(document) {
  const category = String(document?.category ?? '').trim();
  return category || 'General';
}

// Category names from the API response (strings or {category, count} rows),
// followed by the built-in suggestions the user does not have yet. Matching is
// case-insensitive so "finance" is not offered next to "Finance".
export function mergeCategorySuggestions(categories = []) {
  const names = [];
  const seen = new Set();

  const add = name => {
    const clean = String(name ?? '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(clean);
  };

  categories
    .map(entry => (typeof entry === 'string' ? entry : entry?.category))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)))
    .forEach(add);
  CATEGORY_SUGGESTIONS.forEach(add);
  return names;
}

// Documents grouped under their category, primary first inside a group, newest
// first after that. The API enforces one primary per category; the grouping
// also enforces it so a stale response can never badge two rows.
export function groupDocumentsByCategory(items = []) {
  const groups = new Map();

  for (const document of items) {
    if (!document) continue;
    const category = documentCategory(document);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(document);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, documents]) => {
      let primarySeen = false;
      const normalised = [...documents]
        .sort((a, b) => {
          const byTime = String(b.uploaded_at ?? '').localeCompare(
            String(a.uploaded_at ?? '')
          );
          if (byTime !== 0) return byTime;
          return String(a.headline ?? a.original_filename ?? '').localeCompare(
            String(b.headline ?? b.original_filename ?? '')
          );
        })
        .map(document => {
          if (!document.is_primary) return document;
          if (primarySeen) return { ...document, is_primary: 0 };
          primarySeen = true;
          return document;
        })
        .sort(
          (a, b) =>
            Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))
        );
      return { category, count: normalised.length, items: normalised };
    });
}

// Local mirror of the server's "only one primary per category" rule, applied
// as soon as a PATCH succeeds and before the list is re-read.
export function markDocumentPrimary(documents = [], target = {}) {
  const id = documentId(target);
  if (!id) return documents;
  const category = documentCategory(target);
  return documents.map(document => {
    const currentId = documentId(document);
    if (currentId === id) {
      return {
        ...document,
        ...Object.fromEntries(
          Object.entries(target).filter(([, value]) => value !== undefined)
        ),
        is_primary: 1,
      };
    }
    if (documentCategory(document) === category) {
      return { ...document, is_primary: 0 };
    }
    return document;
  });
}
