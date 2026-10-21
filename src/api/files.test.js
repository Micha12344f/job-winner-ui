import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { MAX_BODY_BYTES } from '../../api/files.js';

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

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...env };
});

describe('files proxy', () => {
  it('forwards GET list to the upstream /files path with Access headers', async () => {
    configure();
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{"files":[],"count":0}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const res = response();
    await handler(request('/api/files/list'), res);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/files/list',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'CF-Access-Client-Id': 'test-id',
          'CF-Access-Client-Secret': 'test-secret',
        }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain('"count":0');
    expect(res.body.toString()).not.toContain('test-secret');
  });

  it('treats /api/files as the list endpoint', async () => {
    configure();
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"files":[]}', { status: 200 }));
    const res = response();
    await handler(request('/api/files'), res);
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.example.test/files/list'
    );
    expect(res.statusCode).toBe(200);
  });

  it('passes a multipart upload through untouched', async () => {
    configure();
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{"id":"abc","label":"CV"}', { status: 201 })
      );
    const bytes = Buffer.from(
      '------x\r\nContent-Disposition: form-data; name="label"\r\n\r\nCV\r\n------x--\r\n'
    );
    const res = response();
    await handler(
      request('/api/files/upload', 'POST', {
        headers: {
          'content-type': 'multipart/form-data; boundary=----x',
          'content-length': String(bytes.length),
        },
        body: bytes,
      }),
      res
    );

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.test/files/upload');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe(
      'multipart/form-data; boundary=----x'
    );
    expect(Buffer.compare(options.body, bytes)).toBe(0);
    expect(res.statusCode).toBe(201);
    expect(res.body.toString()).toContain('"id":"abc"');
  });

  it('maps download and delete to the file id path', async () => {
    configure();
    global.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from('%PDF-1.4'), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': "attachment; filename*=utf-8''cv.pdf",
        },
      })
    );
    const download = response();
    await handler(request('/api/files/download/abc123'), download);
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.example.test/files/download/abc123'
    );
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toContain('cv.pdf');
    expect(Buffer.from(download.body).toString()).toBe('%PDF-1.4');

    const del = response();
    await handler(request('/api/files/abc123', 'DELETE'), del);
    const [url, options] = global.fetch.mock.calls[1];
    expect(url).toBe('https://api.example.test/files/abc123');
    expect(options.method).toBe('DELETE');
    expect(options.body).toBeUndefined();
  });

  it('rejects traversal, other methods and oversized bodies', async () => {
    configure();
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const traversal = response();
    await handler(request('/api/files/../secret'), traversal);
    expect(traversal.statusCode).toBe(400);

    const method = response();
    await handler(request('/api/files/list', 'PUT'), method);
    expect(method.statusCode).toBe(405);
    expect(method.headers.allow).toBe('GET, POST, DELETE, HEAD');

    const tooBig = response();
    await handler(
      request('/api/files/upload', 'POST', {
        headers: {
          'content-type': 'multipart/form-data; boundary=----x',
          'content-length': String(MAX_BODY_BYTES + 1),
        },
        body: Buffer.alloc(1),
      }),
      tooBig
    );
    expect(tooBig.statusCode).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized streamed body', async () => {
    configure();
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const stream = (async function* () {
      yield Buffer.alloc(MAX_BODY_BYTES);
      yield Buffer.alloc(2);
    })();
    const res = response();
    await handler(
      request('/api/files/upload', 'POST', {
        headers: { 'content-type': 'multipart/form-data; boundary=x' },
        body: undefined,
        [Symbol.asyncIterator]: stream[Symbol.asyncIterator].bind(stream),
      }),
      res
    );
    expect(res.statusCode).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when config is missing or upstream errors', async () => {
    delete process.env.JOB_WINNER_UPSTREAM_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const missing = response();
    await handler(request('/api/files/list'), missing);
    expect(missing.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();

    configure();
    global.fetch = vi.fn().mockRejectedValue(new Error('boom'));
    const failed = response();
    await handler(request('/api/files/list'), failed);
    expect(failed.statusCode).toBe(502);
    expect(failed.body).toContain('temporarily unavailable');
  });
});
