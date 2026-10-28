import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import i18n from '../../i18n';
import { GET_ALL_INTERVIEWS, GET_JOB_APPLICATIONS } from '../../graphql/query';
import { listAllLeads } from '../../api/leadsClient';
import RelationshipsView from '../RelationshipsView';
import { ThemeContextProvider } from '../ThemeContext';

vi.mock('@apollo/client/react', () => ({ useQuery: vi.fn() }));
vi.mock('../../api/leadsClient', () => ({ listAllLeads: vi.fn() }));

const { useQuery } = await import('@apollo/client/react');

const application = overrides => ({
  id: '1',
  companyName: 'Acme',
  jobTitle: 'Finance Analyst',
  status: 'active',
  appliedDate: null,
  ...overrides,
});

const lead = overrides => ({
  id: 1,
  application_id: 1,
  name: 'Jane Recruiter',
  role: 'Talent Partner',
  status: 'contacted',
  email: 'jane@acme.test',
  notes: null,
  next_action: null,
  next_action_due: null,
  last_contact_at: null,
  linkedin_url: null,
  ...overrides,
});

function mockData({ applications = [], interviews = [], leads = [] }) {
  useQuery.mockImplementation(query => {
    if (query === GET_JOB_APPLICATIONS) {
      return {
        data: { allJobApplication: applications },
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    if (query === GET_ALL_INTERVIEWS) {
      return {
        data: { allInterview: interviews },
        loading: false,
        error: null,
      };
    }
    return { data: undefined, loading: false, error: null };
  });
  listAllLeads.mockResolvedValue(leads);
}

const renderView = () =>
  render(
    <ThemeContextProvider>
      <RelationshipsView />
    </ThemeContextProvider>
  );

// Contacts sit behind a per-job dropdown, so a test that asserts on a contact
// has to open that job's row first.
const openJob = async company => {
  const summary = await screen.findByRole('button', {
    name: new RegExp(company),
  });
  expect(summary.getAttribute('aria-expanded')).toBe('false');
  await userEvent.click(summary);
  expect(summary.getAttribute('aria-expanded')).toBe('true');
  return summary;
};

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('RelationshipsView', () => {
  test('makes the profile obvious and keeps the explanation in a note', async () => {
    mockData({
      applications: [application({ appliedDate: '2026-10-22' })],
      leads: [
        lead({ linkedin_url: 'https://www.linkedin.com/in/jane-recruiter' }),
      ],
    });
    renderView();
    expect(await screen.findByText('Finance Analyst')).not.toBeNull();
    expect(
      screen.queryByText(
        'Only contacts attached to jobs you have actually applied to.'
      )
    ).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'About relationships' })
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Only contacts attached to jobs you have actually applied to.'
    );
    await openJob('Acme');
    const profile = screen.getByRole('link', { name: /Open profile/i });
    expect(profile).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/jane-recruiter'
    );
    expect(profile).toHaveAttribute('target', '_blank');
  });

  test('does not offer an unsafe or missing profile link', async () => {
    mockData({
      applications: [application({ appliedDate: '2026-10-22' })],
      leads: [lead({ linkedin_url: 'javascript:alert(1)' })],
    });
    renderView();
    await openJob('Acme');
    expect(screen.queryByRole('link', { name: /Open profile/i })).toBeNull();
  });

  test('reveals contacts when the job row is opened', async () => {
    mockData({
      applications: [
        application({ id: '1', appliedDate: '2026-10-22', status: 'active' }),
      ],
      leads: [lead({ id: 10, application_id: 1, name: 'Jane Recruiter' })],
    });

    renderView();

    expect(await screen.findByText('Finance Analyst')).not.toBeNull();
    expect(screen.getByText('Applied 2026-10-22')).not.toBeNull();

    await openJob('Acme');

    expect(await screen.findByText('Jane Recruiter')).not.toBeNull();
    expect(screen.getByText('1 contact')).not.toBeNull();
  });

  test('hides leads on jobs with no submission evidence', async () => {
    mockData({
      applications: [
        application({ id: '1', appliedDate: null, status: 'active' }),
      ],
      leads: [lead({ id: 10, application_id: 1, name: 'Unsubmitted Contact' })],
    });

    renderView();

    await waitFor(() =>
      expect(screen.queryByText('Unsubmitted Contact')).toBeNull()
    );
    expect(screen.getByText('No contacts on applied jobs')).not.toBeNull();
  });

  test('treats a rejected or ghosted job as applied even without a date', async () => {
    mockData({
      applications: [
        application({ id: '2', companyName: 'Beta', status: 'rejected' }),
        application({ id: '3', companyName: 'Gamma', status: 'ghosted' }),
      ],
      leads: [
        lead({ id: 11, application_id: 2, name: 'Rejected Contact' }),
        lead({ id: 12, application_id: 3, name: 'Ghosted Contact' }),
      ],
    });

    renderView();

    expect(
      await screen.findAllByText('Applied date not recorded')
    ).toHaveLength(2);

    await openJob('Beta');
    await openJob('Gamma');

    expect(await screen.findByText('Rejected Contact')).not.toBeNull();
    expect(screen.getByText('Ghosted Contact')).not.toBeNull();
  });

  test('counts a job as applied when an interview was recorded', async () => {
    mockData({
      applications: [
        application({
          id: '4',
          companyName: 'Delta',
          status: 'active',
          appliedDate: null,
        }),
      ],
      interviews: [
        { id: '1', jobApplicationId: 4, interviewDate: '2026-10-20' },
      ],
      leads: [lead({ id: 13, application_id: 4, name: 'Interviewed Contact' })],
    });

    renderView();

    await openJob('Delta');

    expect(await screen.findByText('Interviewed Contact')).not.toBeNull();
  });

  test('ignores standalone leads that are not attached to any application', async () => {
    mockData({
      applications: [application({ id: '1', appliedDate: '2026-10-22' })],
      leads: [
        lead({ id: 14, application_id: null, name: 'Standalone Contact' }),
        lead({ id: 15, application_id: 1, name: 'Attached Contact' }),
      ],
    });

    renderView();

    expect(await screen.findByText('Jobs 1 · Contacts 1')).not.toBeNull();
    await openJob('Acme');

    expect(await screen.findByText('Attached Contact')).not.toBeNull();
    expect(screen.queryByText('Standalone Contact')).toBeNull();
  });

  test('filters jobs by status', async () => {
    mockData({
      applications: [
        application({
          id: '1',
          companyName: 'Acme',
          appliedDate: '2026-10-22',
        }),
        application({
          id: '2',
          companyName: 'Beta',
          status: 'ghosted',
          appliedDate: '2026-10-20',
        }),
      ],
      leads: [
        lead({ id: 10, application_id: 1, name: 'Acme Contact' }),
        lead({ id: 11, application_id: 2, name: 'Beta Contact' }),
      ],
    });

    renderView();

    expect(await screen.findByText('Acme')).not.toBeNull();
    expect(screen.getByText('Beta')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Ghosted 1' }));

    await waitFor(() => expect(screen.queryByText('Acme')).toBeNull());
    expect(screen.getByText('Beta')).not.toBeNull();
    expect(screen.getByText('Jobs 1 · Contacts 1')).not.toBeNull();
  });

  test('orders jobs by the selected order', async () => {
    mockData({
      applications: [
        application({
          id: '1',
          companyName: 'Acme',
          appliedDate: '2026-10-20',
        }),
        application({
          id: '2',
          companyName: 'Beta',
          appliedDate: '2026-10-22',
        }),
      ],
      leads: [
        lead({ id: 10, application_id: 1, name: 'Acme One' }),
        lead({ id: 11, application_id: 2, name: 'Beta One' }),
        lead({ id: 12, application_id: 2, name: 'Beta Two' }),
      ],
    });

    renderView();

    const jobRows = () =>
      screen
        .getAllByRole('button', { name: /Acme|Beta/ })
        .map(node => node.textContent);

    // Newest applied is the default, so Beta (22 Oct) comes first.
    await waitFor(() => expect(jobRows()).toHaveLength(2));
    expect(jobRows()[0]).toContain('Beta');

    await userEvent.click(screen.getByRole('combobox', { name: /Order/ }));
    await userEvent.click(
      screen.getByRole('option', { name: 'Oldest applied' })
    );
    await waitFor(() => expect(jobRows()[0]).toContain('Acme'));

    await userEvent.click(screen.getByRole('combobox', { name: /Order/ }));
    await userEvent.click(
      screen.getByRole('option', { name: 'Company A to Z' })
    );
    await waitFor(() => expect(jobRows()[0]).toContain('Acme'));
  });
});
