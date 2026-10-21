// Thin client for the document store, reached through the same-origin
// /api/files proxy in production and the local sidecar during development.

const DEFAULT_DEV_FILES_URL = 'http://127.0.0.1:8081/files';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Vercel caps serverless request bodies just under 4.5 MB, so anything larger
// never reaches the proxy no matter what the sidecar accepts.
export const VERCEL_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md'];

// Effective per-request limit in the current environment.
export function maxUploadBytes() {
  return import.meta.env.PROD ? VERCEL_BODY_LIMIT_BYTES : MAX_UPLOAD_BYTES;
}

export function fileExtension(name) {
  const clean = String(name ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot);
}

// Returns null when the file can be uploaded, or a machine-readable reason the
// caller translates: { code: 'missing' | 'empty' | 'type' | 'tooLarge', ... }.
export function validateUploadFile(file) {
  if (!file) return { code: 'missing' };
  if (!file.size) return { code: 'empty' };
  if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
    return { code: 'type' };
  }
  const limitBytes = maxUploadBytes();
  if (file.size > limitBytes) return { code: 'tooLarge', limitBytes };
  return null;
}

export function filesBaseUrl() {
  if (import.meta.env.PROD) return '/api/files';
  return window.APP_CONFIG?.FILES_URL || DEFAULT_DEV_FILES_URL;
}

export class FilesApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'FilesApiError';
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

export async function listFiles() {
  const response = await fetch(`${filesBaseUrl()}/list`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new FilesApiError(await readError(response), response.status);
  const payload = await response.json();
  return Array.isArray(payload.files) ? payload.files : [];
}

export async function uploadDocument({
  file,
  label,
  jobApplicationId,
  category,
  headline,
}) {
  if (!file) throw new FilesApiError('Choose a file to upload', 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FilesApiError('File exceeds the 10 MB limit', 413);
  }
  const form = new FormData();
  form.append('file', file);
  form.append('label', label);
  if (jobApplicationId) form.append('job_application_id', jobApplicationId);
  if (category) form.append('category', category);
  if (headline) form.append('headline', headline);
  const response = await fetch(`${filesBaseUrl()}/upload`, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new FilesApiError(await readError(response), response.status);
  return response.json();
}

export function downloadUrl(fileId) {
  return `${filesBaseUrl()}/download/${encodeURIComponent(fileId)}`;
}

export async function deleteDocument(fileId) {
  const response = await fetch(
    `${filesBaseUrl()}/${encodeURIComponent(fileId)}`,
    { method: 'DELETE', headers: { Accept: 'application/json' } }
  );
  if (!response.ok)
    throw new FilesApiError(await readError(response), response.status);
  return response.json();
}

export function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
