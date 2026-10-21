import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JobApplicationDialog from '../JobApplicationDialog';
import { SnackbarProvider } from '../common/SnackbarContext';
import { appTheme } from '../../config/theme';
import '../../i18n';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const jobApplication = {
  id: 42,
  companyName: 'Stripe',
  jobTitle: 'Senior engineer',
  salaryRange: '120k',
  description: 'Referred by Ana; evidence note.',
  note: '',
  jobUrl: 'https://jobs.example.com/roles/senior-engineer',
  appliedDate: '2026-09-01',
  status: 'open',
};

const lead = (overrides = {}) => ({
  id: 1,
  application_id: 42,
  name: 'Ana Ruiz',
  role: 'Talent Partner',
  company: 'Stripe',
  email: 'ana@stripe.example',
  phone: null,
  linkedin_url: null,
  relationship: 'Recruiter',
  status: 'contacted',
  source: 'LinkedIn',
  last_contact_at: '2026-10-14',
  next_action: 'Send portfolio',
  next_action_due: '2026-10-28',
  notes: null,
  ...overrides,
});

const stubFetch = ({ leads = [], jdStatus = 404 } = {}) => {
  const fetchMock = vi.fn(url => {
    const target = String(url);
    if (target.includes('/ext/leads')) {
      return jsonResponse({ count: leads.length, items: leads });
    }
    if (target.includes('/ext/jd/')) {
      return jdStatus === 404
        ? jsonResponse({ detail: 'no job description stored' }, 404)
        : jsonResponse({});
    }
    return jsonResponse({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderDialog = () =>
  render(
    <ThemeProvider theme={appTheme}>
      <MockedProvider mocks={[]}>
        <SnackbarProvider>
          <JobApplicationDialog
            jobApplication={jobApplication}
            open
            isNew={false}
            handleClose={() => {}}
          />
        </SnackbarProvider>
      </MockedProvider>
    </ThemeProvider>
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('JobApplicationDialog leads tab', () => {
  it('adds a fourth tab with the lead count badge', async () => {
    const fetchMock = stubFetch({
      leads: [lead(), lead({ id: 2, name: 'Luis Peña' })],
    });
    renderDialog();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveTextContent('Application');
    expect(tabs[1]).toHaveTextContent('Interviews');
    expect(tabs[2]).toHaveTextContent('Offer');
    expect(tabs[3]).toHaveTextContent('Leads');

    // The count shows before the tab is opened.
    await waitFor(() => expect(tabs[3]).toHaveTextContent('Leads 2'));
    expect(
      fetchMock.mock.calls.some(call =>
        String(call[0]).includes('/ext/leads?application_id=42')
      )
    ).toBe(true);
  });

  it('shows no badge when the application has no leads', async () => {
    stubFetch({ leads: [] });
    renderDialog();

    const tab = screen.getByRole('tab', { name: /Leads/ });
    await waitFor(() => expect(tab).toHaveTextContent(/^Leads$/));
  });

  it('lists the leads of this application in the Leads tab', async () => {
    const user = userEvent.setup();
    stubFetch({ leads: [lead(), lead({ id: 2, name: 'Luis Peña' })] });
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Leads/ })).toHaveTextContent(
        'Leads 2'
      )
    );
    await user.click(screen.getByRole('tab', { name: /Leads/ }));

    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('Luis Peña')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add lead' })
    ).toBeInTheDocument();
  });

  it('keeps the application tab and its stored description panel', async () => {
    const fetchMock = stubFetch({ leads: [] });
    renderDialog();

    // Existing application fields are untouched.
    expect(screen.getByDisplayValue('Stripe')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Referred by Ana; evidence note.')
    ).toBeInTheDocument();

    // The stored full posting loads with the tab, then waits to be opened.
    expect(
      await screen.findByRole('button', { name: /Full job description/ })
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(call => String(call[0]).includes('/ext/jd/'))
    ).toBe(false);
  });
});
