import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LeadsForm from '../LeadsForm';
import { SnackbarProvider } from '../../common/SnackbarContext';
import { appTheme } from '../../../config/theme';
import { formatCalendarDate } from '../../../utils/dateUtil';
import { LEAD_STATUSES } from '../../../api/leadsClient';
import '../../../i18n';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const stubFetch = handler => {
  const fetchMock = vi.fn((url, options = {}) => handler(String(url), options));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const lead = (overrides = {}) => ({
  id: 1,
  application_id: 7,
  name: 'Ana Ruiz',
  role: 'Talent Partner',
  company: 'Stripe',
  email: 'ana@stripe.example',
  phone: '+34600111222',
  linkedin_url: 'https://www.linkedin.com/in/ana-ruiz',
  relationship: 'Recruiter',
  status: 'contacted',
  source: 'LinkedIn',
  last_contact_at: '2026-10-14',
  next_action: 'Send portfolio',
  next_action_due: '2026-10-28',
  notes: 'Prefers email',
  ...overrides,
});

// The dialog owns the lead list, so the tests keep it in state the same way.
function Harness({ initialLeads = [], ...props }) {
  const [leads, setLeads] = useState(initialLeads);
  return (
    <LeadsForm
      jobApplicationId={7}
      leads={leads}
      onLeadsChange={setLeads}
      handleClose={() => {}}
      {...props}
    />
  );
}

// The app theme is a css-variables theme; components read colours through
// theme.vars, so tests render inside it. Transition durations are zeroed so
// dialogs open and close within a tick instead of depending on timers.
const testTheme = createTheme(appTheme, {
  transitions: { duration: { enteringScreen: 0, leavingScreen: 0 } },
});

const renderForm = (props = {}) =>
  render(
    <ThemeProvider theme={testTheme}>
      <SnackbarProvider>
        <Harness {...props} />
      </SnackbarProvider>
    </ThemeProvider>
  );

const fetchCalls = () =>
  global.fetch.mock.calls.map(([url, options = {}]) => ({
    url: String(url),
    method: options.method ?? 'GET',
    body: options.body ? JSON.parse(options.body) : undefined,
  }));

beforeEach(() => {
  stubFetch(() => jsonResponse({ count: 0, items: [] }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LeadsForm', () => {
  it('invites the first lead when none exist', () => {
    renderForm();

    expect(screen.getByText('No leads yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Add the recruiter, hiring manager/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add lead' })
    ).toBeInTheDocument();
  });

  it('lists every lead with role, company, status, next action and last contact', () => {
    renderForm({ initialLeads: [lead()] });

    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('Talent Partner · Stripe')).toBeInTheDocument();
    expect(screen.getByText('Contacted')).toBeInTheDocument();
    expect(screen.getByText('Send portfolio')).toBeInTheDocument();
    expect(
      screen.getByText(formatCalendarDate('2026-10-28', 'en').absolute)
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatCalendarDate('2026-10-14', 'en').absolute)
    ).toBeInTheDocument();
    expect(screen.getByText('Recruiter')).toBeInTheDocument();
    expect(screen.getByText('Prefers email')).toBeInTheDocument();
  });

  it('falls back to an em dash style value when there is no next action or contact date', () => {
    renderForm({
      initialLeads: [
        lead({
          next_action: null,
          next_action_due: null,
          last_contact_at: null,
        }),
      ],
    });

    expect(screen.getAllByText('N/A')).toHaveLength(2);
  });

  it.each(LEAD_STATUSES)('renders the %s status badge', status => {
    renderForm({ initialLeads: [lead({ status })] });

    const labels = {
      identified: 'Identified',
      contacted: 'Contacted',
      replied: 'Replied',
      meeting: 'Meeting',
      referred: 'Referred',
      closed: 'Closed',
    };
    expect(screen.getByText(labels[status])).toBeInTheDocument();
  });

  it('renders mail, phone and LinkedIn links', () => {
    renderForm({ initialLeads: [lead()] });

    expect(
      screen.getByRole('link', { name: 'Email Ana Ruiz' })
    ).toHaveAttribute('href', 'mailto:ana@stripe.example');
    expect(screen.getByRole('link', { name: 'Call Ana Ruiz' })).toHaveAttribute(
      'href',
      'tel:+34600111222'
    );
    const linkedIn = screen.getByRole('link', {
      name: 'Ana Ruiz on LinkedIn',
    });
    expect(linkedIn).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/ana-ruiz'
    );
    expect(linkedIn).toHaveAttribute('target', '_blank');
    expect(linkedIn).toHaveAttribute(
      'rel',
      expect.stringContaining('noopener')
    );
  });

  it('omits contact links that have no value', () => {
    renderForm({
      initialLeads: [
        lead({ email: null, phone: null, linkedin_url: null, notes: null }),
      ],
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not offer to dial a phone number the API has masked', () => {
    renderForm({ initialLeads: [lead({ phone: '+346****1222' })] });

    expect(
      screen.queryByRole('link', { name: 'Call Ana Ruiz' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Email Ana Ruiz' })
    ).toBeInTheDocument();
  });

  it('offers exactly the six lead statuses in the sub-dialog', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Add lead' }));
    await user.click(screen.getByRole('combobox', { name: /^Status/ }));

    expect(
      await screen.findByRole('option', { name: 'Meeting' })
    ).toBeInTheDocument();
    const options = screen
      .getAllByRole('option')
      .map(option => option.getAttribute('data-value'));
    expect(options).toEqual(LEAD_STATUSES);
  }, 15000);

  it('never sends a masked phone number back when saving', async () => {
    const user = userEvent.setup({ delay: null });
    stubFetch((url, options) =>
      options.method === 'PATCH'
        ? jsonResponse({ ...lead(), name: 'Ana Ruiz Gómez' })
        : jsonResponse({ count: 0, items: [] })
    );
    renderForm({ initialLeads: [lead({ phone: '+346****1222' })] });

    await user.click(screen.getByRole('button', { name: 'Edit Ana Ruiz' }));
    const nameField = screen.getByRole('textbox', { name: /^Name/ });
    await user.clear(nameField);
    await user.type(nameField, 'Ana Ruiz Gómez');
    await user.click(screen.getByRole('button', { name: 'Save lead' }));

    await waitFor(() =>
      expect(fetchCalls().filter(call => call.method === 'PATCH')).toHaveLength(
        1
      )
    );
    const [patch] = fetchCalls().filter(call => call.method === 'PATCH');
    expect(patch.body).not.toHaveProperty('phone');
    expect(patch.body.name).toBe('Ana Ruiz Gómez');
  }, 15000);

  it('creates a lead from the sub-dialog', async () => {
    const user = userEvent.setup({ delay: null });
    stubFetch((url, options) =>
      options.method === 'POST'
        ? jsonResponse(
            {
              ...lead({ id: 9, name: 'Sam Okafor', email: 'sam@acme.example' }),
              status: 'meeting',
            },
            201
          )
        : jsonResponse({ count: 0, items: [] })
    );
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Add lead' }));
    expect(
      screen.getByRole('heading', { name: 'Add lead' })
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: /^Name/ }),
      'Sam Okafor'
    );
    await user.type(
      screen.getByRole('textbox', { name: /^Email/ }),
      'sam@acme.example'
    );
    await user.type(screen.getByRole('textbox', { name: /^Company/ }), 'Acme');

    await user.click(screen.getByRole('combobox', { name: /^Status/ }));
    await user.click(screen.getByRole('option', { name: 'Meeting' }));

    await user.click(screen.getByRole('button', { name: 'Save lead' }));

    await waitFor(() =>
      expect(screen.getByText('Sam Okafor')).toBeInTheDocument()
    );
    // The sub-dialog unmounts once its close transition finishes.
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Add lead' })
      ).not.toBeInTheDocument()
    );

    const posts = fetchCalls().filter(call => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toMatch(/\/ext\/leads$/);
    expect(posts[0].body).toMatchObject({
      application_id: 7,
      name: 'Sam Okafor',
      email: 'sam@acme.example',
      company: 'Acme',
      status: 'meeting',
    });
    expect(screen.getByText('Meeting')).toBeInTheDocument();
  }, 15000);

  it('requires a name before saving', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Add lead' }));
    await user.click(screen.getByRole('button', { name: 'Save lead' }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    // The dialog stays open with nothing sent to the server.
    expect(
      screen.getByRole('heading', { name: 'Add lead' })
    ).toBeInTheDocument();
    expect(fetchCalls()).toHaveLength(0);
  }, 15000);

  it('rejects an email that is not an email', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Add lead' }));
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Ana Ruiz');
    await user.type(
      screen.getByRole('textbox', { name: /^Email/ }),
      'ana-at-stripe'
    );
    await user.click(screen.getByRole('button', { name: 'Save lead' }));

    expect(
      await screen.findByText('Enter a valid email address.')
    ).toBeInTheDocument();
    expect(fetchCalls()).toHaveLength(0);
  }, 15000);

  it('edits an existing lead through the same sub-dialog', async () => {
    const user = userEvent.setup({ delay: null });
    stubFetch((url, options) =>
      options.method === 'PATCH'
        ? jsonResponse({ ...lead(), name: 'Ana Ruiz Gómez' })
        : jsonResponse({ count: 0, items: [] })
    );
    renderForm({ initialLeads: [lead()] });

    await user.click(screen.getByRole('button', { name: 'Edit Ana Ruiz' }));
    expect(
      screen.getByRole('heading', { name: 'Edit lead' })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Ana Ruiz'
    );

    const nameField = screen.getByRole('textbox', { name: /^Name/ });
    await user.clear(nameField);
    await user.type(nameField, 'Ana Ruiz Gómez');
    await user.click(screen.getByRole('button', { name: 'Save lead' }));

    expect(await screen.findByText('Ana Ruiz Gómez')).toBeInTheDocument();
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();

    const patches = fetchCalls().filter(call => call.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toMatch(/\/ext\/leads\/1$/);
    expect(patches[0].body).toMatchObject({
      name: 'Ana Ruiz Gómez',
      status: 'contacted',
    });
  }, 15000);

  it('deletes a lead only after the confirmation', async () => {
    const user = userEvent.setup({ delay: null });
    stubFetch(() => jsonResponse({ deleted: 1 }));
    renderForm({ initialLeads: [lead(), lead({ id: 2, name: 'Luis Peña' })] });

    await user.click(screen.getByRole('button', { name: 'Delete Ana Ruiz' }));

    expect(
      screen.getByRole('heading', { name: 'Delete lead' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Delete "Ana Ruiz"\?/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Delete lead' })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
    expect(fetchCalls().filter(call => call.method === 'DELETE')).toHaveLength(
      0
    );

    await user.click(screen.getByRole('button', { name: 'Delete Ana Ruiz' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Luis Peña')).toBeInTheDocument();
    const deletes = fetchCalls().filter(call => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toMatch(/\/ext\/leads\/1$/);
  }, 15000);

  it('shows a loading line while the list is being fetched', () => {
    renderForm({ leadsLoading: true });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows an error when the list cannot be loaded', () => {
    renderForm({ leadsError: true });

    expect(
      screen.getByText('Could not load the leads for this application.')
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
