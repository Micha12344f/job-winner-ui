// Same-origin proxy for the local Job Winner document store.
//
// The FastAPI sidecar listens on the server's loopback behind the
// job-winner-api Cloudflare tunnel, which routes /files/* to it. This function
// forwards /api/files/<rest> to <upstream origin>/files/<rest>, attaching the
// Cloudflare Access service token exactly like api/graphql.js does.
//
// Multipart bodies must reach the sidecar untouched, so Vercel's body parser is
// disabled and the raw request stream is forwarded as a Buffer.

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

export const MAX_BODY_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const ALLOWED_METHODS = ['GET', 'POST', 'DELETE', 'HEAD'];
const PREFIX = '/api/files';
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

class PayloadTooLarge extends Error {}

function parseTarget(req) {
  const raw = req.url || PREFIX;
  const [pathPart, query] = raw.split('?');
  if (!pathPart.startsWith(PREFIX)) return { error: 404 };
  let rest = pathPart.slice(PREFIX.length);
  if (rest === '' || rest === '/') rest = '/list';
  if (!rest.startsWith('/')) return { error: 404 };
  const segments = rest.slice(1).split('/');
  if (
    segments.some(
      segment => !SEGMENT.test(segment) || segment === '.' || segment === '..'
    )
  ) {
    return { error: 400 };
  }
  return { path: `/files${rest}${query ? `?${query}` : ''}` };
}

function upstreamOrigin() {
  const raw = process.env.JOB_WINNER_UPSTREAM_URL;
  const clientId = process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!raw || !clientId || !clientSecret) return null;
  let target;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    return null;
  }
  return { origin: target.origin, clientId, clientSecret };
}

async function readBody(req) {
  const body = req.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body && typeof body === 'object')
    return Buffer.from(JSON.stringify(body));
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new PayloadTooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const target = parseTarget(req);
  if (target.error === 400) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  if (target.error || !target.path) {
    return res.status(404).json({ error: 'Not found' });
  }

  const upstream = upstreamOrigin();
  if (!upstream) {
    return res.status(503).json({ error: 'File service is not configured' });
  }

  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'File exceeds the 10 MB limit' });
  }

  let body;
  if (method === 'POST' || method === 'GET' || method === 'DELETE') {
    try {
      body = method === 'POST' ? await readBody(req) : undefined;
    } catch (error) {
      if (error instanceof PayloadTooLarge) {
        return res.status(413).json({ error: 'File exceeds the 10 MB limit' });
      }
      return res.status(400).json({ error: 'Could not read the request body' });
    }
  }

  const headers = {
    Accept: req.headers.accept || '*/*',
    'CF-Access-Client-Id': upstream.clientId,
    'CF-Access-Client-Secret': upstream.clientSecret,
  };
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  } else if (body) {
    headers['Content-Type'] = 'application/octet-stream';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${upstream.origin}${target.path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const payload = Buffer.from(await response.arrayBuffer());
    res.status(response.status);
    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'application/json'
    );
    const disposition = response.headers.get('content-disposition');
    if (disposition) res.setHeader('Content-Disposition', disposition);
    res.setHeader('Content-Length', String(payload.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (method === 'HEAD') return res.end();
    return res.send(payload);
  } catch {
    return res
      .status(502)
      .json({ error: 'File service is temporarily unavailable' });
  } finally {
    clearTimeout(timer);
  }
}
