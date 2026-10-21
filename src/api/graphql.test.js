import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/graphql.js';

const env = { ...process.env };
const request = (method = 'POST', body = '{"query":"{ ping }"}', headers = { 'content-type': 'application/json' }) => ({ method, headers, body });
const response = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = JSON.stringify(body); return this; }, send(body) { this.body = body; return this; }, end(body) { this.body = body; } });

afterEach(() => { vi.restoreAllMocks(); process.env = { ...env }; });

describe('GraphQL proxy', () => {
  it('forwards only to configured upstream with Access headers and returns response', async () => {
    process.env.JOB_WINNER_UPSTREAM_URL = 'https://api.example.test/graphql';
    process.env.CF_ACCESS_CLIENT_ID = 'test-id'; process.env.CF_ACCESS_CLIENT_SECRET = 'test-secret';
    global.fetch = vi.fn().mockResolvedValue(new Response('{"data":{"ping":"ok"}}', { status: 200 }));
    const res = response(); await handler(request(), res);
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/graphql', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'CF-Access-Client-Id': 'test-id', 'CF-Access-Client-Secret': 'test-secret' }) }));
    expect(res.statusCode).toBe(200); expect(res.body).toContain('"ping":"ok"');
    expect(res.body).not.toContain('test-secret');
  });
  it('rejects unsupported methods and content types', async () => {
    const res = response(); await handler(request('GET'), res); expect(res.statusCode).toBe(405);
    const bad = response(); await handler(request('POST', '{}', { 'content-type': 'text/plain' }), bad); expect(bad.statusCode).toBe(415);
  });
  it('fails closed when config is missing and does not call upstream', async () => {
    delete process.env.JOB_WINNER_UPSTREAM_URL; const fetch = vi.fn(); global.fetch = fetch;
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });
});
