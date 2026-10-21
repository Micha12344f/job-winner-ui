// Same-origin proxy for the Job Winner extension API.
//
// The FastAPI sidecar exposes its extension surface under /ext/* behind the
// job-winner-api Cloudflare tunnel. This function forwards /api/ext/<rest> to
// <upstream origin>/ext/<rest>, attaching the Cloudflare Access service token
// exactly like api/files.js and api/graphql.js do.
//
// The extension API speaks JSON (document metadata, leads, job descriptions),
// so bodies are forwarded untouched as a Buffer and Vercel's body parser stays
// disabled, matching the files proxy.

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

// JSON payloads are small (a PATCH is a handful of fields); 1 MB is plenty and
// keeps a runaway body from being buffered.
export const MAX_BODY_BYTES = 1024 * 1024;
const TIMEOUT_MS = 30_000;
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const PREFIX = '/api/ext';
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

class PayloadTooLarge extends Error {}

function parseTarget(req) {
  const raw = req.url || PREFIX;
  const [pathPart, query] = raw.split('?');
  if (!pathPart.startsWith(PREFIX)) return { error: 404 };
  const rest = pathPart.slice(PREFIX.length);
  // /api/ext on its own has no upstream endpoint to map to.
  if (rest === '' || rest === '/') return { error: 404 };
  if (!rest.startsWith('/')) return { error: 404 };
  const segments = rest.slice(1).split('/');
  if (
    segments.some(
      segment => !SEGMENT.test(segment) || segment === '.' || segment === '..'
    )
  ) {
    return { error: 400 };
  }
  return { path: `/ext${rest}${query ? `?${query}` : ''}` };
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
    return res.status(400).json({ error: 'Invalid extension path' });
  }
  if (target.error || !target.path) {
    return res.status(404).json({ error: 'Not found' });
  }

  const upstream = upstreamOrigin();
  if (!upstream) {
    return res
      .status(503)
      .json({ error: 'Extension service is not configured' });
  }

  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return res
      .status(413)
      .json({ error: 'Request body exceeds the 1 MB limit' });
  }

  const sendsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
  let body;
  if (sendsBody) {
    try {
      body = await readBody(req);
    } catch (error) {
      if (error instanceof PayloadTooLarge) {
        return res
          .status(413)
          .json({ error: 'Request body exceeds the 1 MB limit' });
      }
      return res.status(400).json({ error: 'Could not read the request body' });
    }
    // An empty POST body is legitimate (action-style endpoints); do not send
    // chunked zero-length bodies upstream.
    if (body.length === 0) body = undefined;
  }

  const headers = {
    Accept: req.headers.accept || 'application/json',
    'CF-Access-Client-Id': upstream.clientId,
    'CF-Access-Client-Secret': upstream.clientSecret,
  };
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  } else if (body) {
    headers['Content-Type'] = 'application/json';
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
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 204s and other empty responses must not carry a Content-Length.
    if (payload.length === 0) return res.end();
    res.setHeader('Content-Length', String(payload.length));
    return res.send(payload);
  } catch {
    return res
      .status(502)
      .json({ error: 'Extension service is temporarily unavailable' });
  } finally {
    clearTimeout(timer);
  }
}
