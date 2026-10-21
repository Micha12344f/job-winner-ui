import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { MAX_BODY_BYTES } from '../../api/ext.js';

const env = { ...process.env };

const request = (url, method = 'GET', overrides = {}) => ({
  url,
  method,
  headers: {},
  ...overrides,
});

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  setHeader(key, value) {
    this.headers[key.toLowerCase()] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = JSON.stringify(body);
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
  end(body) {
    this.body = body;
  },
});

const configure = () => {
  process.env.JOB_WINNER_UPSTREAM_URL = 'https://api.example.test/graphql';
  process.env.CF_ACCESS_CLIENT_ID = 'test-id';
  process.env.CF_ACCESS_CLIENT_SECRET = 'test-secret';
};

const jsonResponse = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...env };
});

describe('extension proxy', () => {
  it('forwards GET /api/ext/documents to the upstream /ext path with Access headers', async () => {
    configure();
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse('{"count":0,"items":[],"categories":[]}')
      );
    const res = response();
    await handler(request('/api/ext/documents'), res);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/ext/documents',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'CF-Access-Client-Id': 'test-id',
          'CF-Access-Client-Secret': 'test-secret',
        }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.body.toString()).toContain('"count":0');
    expect(res.body.toString()).not.toContain('test-secret');
  });

  it('passes query parameters through untouched', async () => {
    configure();
    global.fetch = vi.fn().mockResolvedValue(jsonResponse('{"items":[]}'));
    const res = response();
    await handler(request('/api/ext/documents?category=Finance'), res);

    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.example.test/ext/documents?category=Finance'
    );
    expect(res.statusCode).toBe(200);
  });

  it('forwards a PATCH JSON body and content type', async () => {
    configure();
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse('{"file_id":"abc","is_primary":1}', 200));
    const body = Buffer.from(JSON.stringify({ is_primary: true }));
    const res = response();
    await handler(
      request('/api/ext/documents/abc', 'PATCH', {
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
        },
        body,
      }),
      res
    );

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.test/ext/documents/abc');
    expect(options.method).toBe('PATCH');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(Buffer.compare(options.body, body)).toBe(0);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain('"is_primary":1');
  });

  it('serialises an already parsed object body as JSON', async () => {
    configure();
    global.fetch = vi.fn().mockResolvedValue(jsonResponse('{}'));
    const res = response();
    await handler(
      request('/api/ext/documents/abc', 'PUT', {
        headers: { 'content-type': 'application/json' },
        body: { headline: 'Updated' },
      }),
      res
    );

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body.toString())).toEqual({
      headline: 'Updated',
    });
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('maps POST and DELETE without sending a body on DELETE', async () => {
    configure();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('{"id":1}', 201))
      .mockResolvedValueOnce(jsonResponse('{"deleted":"abc"}'));

    const post = response();
    await handler(
      request('/api/ext/leads', 'POST', {
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"name":"Jane"}'),
      }),
      post
    );
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.example.test/ext/leads'
    );
    expect(global.fetch.mock.calls[0][1].method).toBe('POST');
    expect(post.statusCode).toBe(201);

    const del = response();
    await handler(request('/api/ext/documents/abc', 'DELETE'), del);
    const [url, options] = global.fetch.mock.calls[1];
    expect(url).toBe('https://api.example.test/ext/documents/abc');
    expect(options.method).toBe('DELETE');
    expect(options.body).toBeUndefined();
    expect(del.body.toString()).toContain('"deleted":"abc"');
  });

  it('ends an empty upstream response without a body', async () => {
    configure();
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const res = response();
    await handler(request('/api/ext/documents/abc', 'DELETE'), res);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBeUndefined();
    expect(res.headers['content-length']).toBeUndefined();
  });

  it('rejects traversal, an empty target and unsupported methods', async () => {
    configure();
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const traversal = response();
    await handler(request('/api/ext/../secret'), traversal);
    expect(traversal.statusCode).toBe(400);

    const nested = response();
    await handler(request('/api/ext/documents/%2e%2e/secret'), nested);
    expect(nested.statusCode).toBe(400);

    const empty = response();
    await handler(request('/api/ext'), empty);
    expect(empty.statusCode).toBe(404);

    const wrongPrefix = response();
    await handler(request('/api/extx/documents'), wrongPrefix);
    expect(wrongPrefix.statusCode).toBe(404);

    const head = response();
    await handler(request('/api/ext/documents', 'HEAD'), head);
    expect(head.statusCode).toBe(405);
    expect(head.headers.allow).toBe('GET, POST, PUT, PATCH, DELETE');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies before calling upstream', async () => {
    configure();
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const tooBig = response();
    await handler(
      request('/api/ext/documents/abc', 'PATCH', {
        headers: {
          'content-type': 'application/json',
          'content-length': String(MAX_BODY_BYTES + 1),
        },
        body: Buffer.alloc(1),
      }),
      tooBig
    );
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.body).toContain('1 MB');

    const stream = (async function* () {
      yield Buffer.alloc(MAX_BODY_BYTES);
      yield Buffer.alloc(2);
    })();
    const streamed = response();
    await handler(
      request('/api/ext/documents/abc', 'POST', {
        headers: { 'content-type': 'application/json' },
        body: undefined,
        [Symbol.asyncIterator]: stream[Symbol.asyncIterator].bind(stream),
      }),
      streamed
    );
    expect(streamed.statusCode).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when config is missing or the upstream errors', async () => {
    delete process.env.JOB_WINNER_UPSTREAM_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const missing = response();
    await handler(request('/api/ext/documents'), missing);
    expect(missing.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();

    configure();
    global.fetch = vi.fn().mockRejectedValue(new Error('boom'));
    const failed = response();
    await handler(request('/api/ext/documents'), failed);
    expect(failed.statusCode).toBe(502);
    expect(failed.body).toContain('temporarily unavailable');
  });

  it('refuses a non-https upstream origin', async () => {
    configure();
    process.env.JOB_WINNER_UPSTREAM_URL = 'http://api.example.test/graphql';
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const res = response();
    await handler(request('/api/ext/documents'), res);
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
