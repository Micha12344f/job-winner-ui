import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JobDescriptionPanel from '../JobDescriptionPanel';
import { appTheme } from '../../config/theme';
import '../../i18n';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const stored = {
  application_id: 42,
  source_url: 'https://jobs.example.com/roles/senior-engineer',
  full_text:
    'About the role\n\nWe build the payments infrastructure behind every checkout.',
  summary: 'Payments platform team, hybrid, London.',
  parser: 'readability',
  http_status: 200,
  char_count: 4123,
  fetched_at: '2026-10-20T09:12:00+00:00',
  updated_at: '2026-10-20T09:12:05+00:00',
};

const renderPanel = () =>
  render(
    <ThemeProvider theme={appTheme}>
      <JobDescriptionPanel applicationId={42} />
    </ThemeProvider>
  );

const expand = async user => {
  await user.click(
    screen.getByRole('button', { name: /Full job description/ })
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('JobDescriptionPanel', () => {
  it('waits for the panel to be opened before requesting the description', () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    expect(screen.getByText('Full job description')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a loading line while the description is fetched', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    await expand(user);

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/ext\/jd\/42$/);
  });

  it('treats a 404 as "nothing stored yet" instead of an error', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ detail: 'no job description stored' }, 404))
    );
    renderPanel();

    await expand(user);

    expect(
      await screen.findByText('No description stored yet')
    ).toBeInTheDocument();
    expect(screen.getByText(/filled in from the posting URL/)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Could not load the stored job description.')
    ).not.toBeInTheDocument();
  });

  it('renders the summary, source link, full text and caption once loaded', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(stored))
    );
    renderPanel();

    await expand(user);

    expect(
      await screen.findByText('Payments platform team, hybrid, London.')
    ).toBeInTheDocument();
    // Summary first, then the posting text.
    expect(screen.getByText('Summary')).toBeInTheDocument();

    const link = screen.getByRole('link', {
      name: 'https://jobs.example.com/roles/senior-engineer',
    });
    expect(link).toHaveAttribute('href', stored.source_url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));

    expect(
      screen.getByLabelText('Full job description text')
    ).toHaveTextContent(/We build the payments infrastructure/);
    expect(screen.getByText(/4,123 characters/)).toBeInTheDocument();
    expect(screen.getByText(/Fetched/)).toBeInTheDocument();
    expect(
      screen.getByText(/keeps your short evidence note/)
    ).toBeInTheDocument();
  });

  it('keeps the posting text readable without a summary', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ ...stored, summary: null, char_count: 12 }))
    );
    renderPanel();

    await expand(user);

    expect(
      await screen.findByLabelText('Full job description text')
    ).toHaveTextContent(/About the role/);
    expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    expect(screen.getByText(/12 characters/)).toBeInTheDocument();
  });

  it('reports a real failure and retries on request', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const fetchMock = vi.fn(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ detail: 'boom' }, 500)
        : jsonResponse(stored);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    await expand(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Could not load the stored job description.'
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(
        screen.getByText('Payments platform team, hybrid, London.')
      ).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
