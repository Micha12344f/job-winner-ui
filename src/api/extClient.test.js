import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATEGORY_SUGGESTIONS,
  extBaseUrl,
  groupDocumentsByCategory,
  listDocuments,
  markDocumentPrimary,
  mergeCategorySuggestions,
  patchDocument,
} from './extClient';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const document = (overrides = {}) => ({
  file_id: 'a'.repeat(32),
  category: 'Finance',
  headline: 'Finance CV',
  original_filename: 'finance-cv.pdf',
  size_bytes: 1024,
  uploaded_at: '2026-10-01T10:00:00Z',
  is_primary: 0,
  ...overrides,
});

beforeEach(() => {
  delete window.APP_CONFIG;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete window.APP_CONFIG;
});

describe('extBaseUrl', () => {
  it('defaults to the local sidecar outside production', () => {
    expect(extBaseUrl()).toBe('http://127.0.0.1:8081/ext');
  });

  it('honours window.APP_CONFIG.EXT_URL in development', () => {
    window.APP_CONFIG = { EXT_URL: 'http://localhost:9999/ext' };
    expect(extBaseUrl()).toBe('http://localhost:9999/ext');
  });
});

describe('listDocuments', () => {
  it('returns items, categories and count', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        count: 1,
        items: [document()],
        categories: [{ category: 'Finance', count: 1 }],
      })
    );

    const result = await listDocuments();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/ext/documents',
      { headers: { Accept: 'application/json' } }
    );
    expect(result.count).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.categories).toEqual([{ category: 'Finance', count: 1 }]);
  });

  it('normalises a sparse payload', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await listDocuments();
    expect(result).toEqual({ count: 0, items: [], categories: [] });
  });

  it('adds category and application filters as query parameters', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    await listDocuments({ category: 'Data', applicationId: 42 });
    expect(global.fetch.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8081/ext/documents?category=Data&application_id=42'
    );
  });

  it('throws an ExtApiError with the server detail', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'document not found' }, 404));

    await expect(listDocuments()).rejects.toMatchObject({
      name: 'ExtApiError',
      message: 'document not found',
      status: 404,
    });
  });

  it('falls back to the status text when the body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('boom', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      })
    );

    await expect(listDocuments()).rejects.toMatchObject({
      name: 'ExtApiError',
      message: 'Request failed with status 500',
      status: 500,
    });
  });
});

describe('patchDocument', () => {
  it('PATCHes the document with only patchable fields', async () => {
    const updated = document({ is_primary: 1 });
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(updated));

    const result = await patchDocument(document().file_id, {
      is_primary: true,
      category: 'Finance',
      headline: 'Lead CV',
      notes: 'Primary copy',
      ignored: 'nope',
      size_bytes: 12,
    });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(
      `http://127.0.0.1:8081/ext/documents/${document().file_id}`
    );
    expect(options.method).toBe('PATCH');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      category: 'Finance',
      headline: 'Lead CV',
      is_primary: true,
      notes: 'Primary copy',
    });
    expect(result).toEqual(updated);
  });

  it('drops undefined fields and encodes the id', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(document()));
    await patchDocument('a b/c', { headline: undefined, notes: 'x' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8081/ext/documents/a%20b%2Fc');
    expect(JSON.parse(options.body)).toEqual({ notes: 'x' });
  });

  it('rejects a missing id or an empty change set before fetching', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(patchDocument('', { is_primary: true })).rejects.toMatchObject(
      { status: 400 }
    );
    await expect(patchDocument(document().file_id, {})).rejects.toMatchObject({
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces server validation errors', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'category is required' }, 422));
    await expect(
      patchDocument(document().file_id, { category: '' })
    ).rejects.toMatchObject({ message: 'category is required', status: 422 });
  });
});

describe('mergeCategorySuggestions', () => {
  it('offers existing categories first, then the built-ins', () => {
    const suggestions = mergeCategorySuggestions([
      { category: 'Legal', count: 2 },
      { category: 'Data', count: 1 },
    ]);

    expect(suggestions.slice(0, 5)).toEqual([
      'Data',
      'Legal',
      'Finance',
      'Engineering',
      'Consulting',
    ]);
    expect(suggestions).toContain('General');
    expect(CATEGORY_SUGGESTIONS.every(name => suggestions.includes(name))).toBe(
      true
    );
  });

  it('deduplicates case-insensitively and accepts plain strings', () => {
    const suggestions = mergeCategorySuggestions([
      { category: 'finance' },
      'General',
      null,
    ]);
    expect(
      suggestions.filter(name => name.toLowerCase() === 'finance')
    ).toEqual(['finance']);
    expect(
      suggestions.filter(name => name.toLowerCase() === 'general')
    ).toHaveLength(1);
  });
});

describe('groupDocumentsByCategory', () => {
  it('groups by category with a count and alphabetical headers', () => {
    const groups = groupDocumentsByCategory([
      document({ file_id: '1', category: 'Finance', headline: 'A' }),
      document({ file_id: '2', category: 'Engineering', headline: 'B' }),
      document({ file_id: '3', category: 'Finance', headline: 'C' }),
    ]);

    expect(groups.map(group => group.category)).toEqual([
      'Engineering',
      'Finance',
    ]);
    expect(groups[1].count).toBe(2);
    expect(groups[1].items.map(item => item.headline)).toEqual(['A', 'C']);
  });

  it('puts the primary document first inside its category', () => {
    const groups = groupDocumentsByCategory([
      document({
        file_id: '1',
        headline: 'Newest',
        uploaded_at: '2026-10-05T10:00:00Z',
      }),
      document({
        file_id: '2',
        headline: 'Primary',
        uploaded_at: '2026-09-01T10:00:00Z',
        is_primary: 1,
      }),
    ]);

    expect(groups[0].items.map(item => item.headline)).toEqual([
      'Primary',
      'Newest',
    ]);
  });

  it('never badges two primaries within one category', () => {
    const groups = groupDocumentsByCategory([
      document({
        file_id: '1',
        headline: 'First',
        is_primary: 1,
        uploaded_at: '2026-10-05T10:00:00Z',
      }),
      document({
        file_id: '2',
        headline: 'Second',
        is_primary: 1,
        uploaded_at: '2026-09-01T10:00:00Z',
      }),
    ]);

    expect(groups[0].items.filter(item => item.is_primary)).toHaveLength(1);
  });

  it('falls back to General for a blank category and survives junk rows', () => {
    const groups = groupDocumentsByCategory([
      document({ file_id: '1', category: '  ', headline: 'Blank' }),
      null,
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('General');
    expect(groups[0].count).toBe(1);
  });
});

describe('markDocumentPrimary', () => {
  it('demotes the previous primary in the same category only', () => {
    const finance = document({ file_id: '1', is_primary: 1 });
    const otherFinance = document({ file_id: '2', headline: 'Second' });
    const engineering = document({
      file_id: '3',
      category: 'Engineering',
      is_primary: 1,
    });

    const result = markDocumentPrimary([finance, otherFinance, engineering], {
      ...otherFinance,
      is_primary: 1,
    });

    expect(result.find(item => item.file_id === '1').is_primary).toBe(0);
    expect(result.find(item => item.file_id === '2').is_primary).toBe(1);
    expect(result.find(item => item.file_id === '3').is_primary).toBe(1);
  });

  it('keeps the list untouched without an id', () => {
    const documents = [document()];
    expect(markDocumentPrimary(documents, {})).toBe(documents);
  });
});
