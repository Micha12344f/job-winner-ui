const MAX_BODY_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const contentType = req.headers['content-type'] || '';
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    return res.status(415).json({ error: 'Unsupported content type' });
  }
  const body =
    typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request too large' });
  }
  const upstream = process.env.JOB_WINNER_UPSTREAM_URL;
  const clientId = process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!upstream || !clientId || !clientSecret) {
    return res.status(503).json({ error: 'GraphQL service is not configured' });
  }
  let target;
  try {
    target = new URL(upstream);
  } catch {
    return res.status(503).json({ error: 'GraphQL service is not configured' });
  }
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    return res.status(503).json({ error: 'GraphQL service is not configured' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(target.toString(), {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'CF-Access-Client-Id': clientId,
        'CF-Access-Client-Secret': clientSecret,
      },
      signal: controller.signal,
    });
    const payload = await response.text();
    res.status(response.status);
    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'application/json'
    );
    return res.send(payload);
  } catch {
    return res
      .status(502)
      .json({ error: 'GraphQL service is temporarily unavailable' });
  } finally {
    clearTimeout(timer);
  }
}
