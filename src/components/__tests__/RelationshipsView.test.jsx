import { render, screen, waitFor } from '@testing-library/react';
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

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('RelationshipsView', () => {
  test('shows leads attached to an applied job', async () => {
    mockData({
      applications: [
        application({ id: '1', appliedDate: '2026-10-22', status: 'active' }),
      ],
      leads: [lead({ id: 10, application_id: 1, name: 'Jane Recruiter' })],
    });

    render(
      <ThemeContextProvider>
        <RelationshipsView />
      </ThemeContextProvider>
    );

    expect(await screen.findByText('Jane Recruiter')).not.toBeNull();
    expect(screen.getByText('Finance Analyst')).not.toBeNull();
    expect(screen.getByText('Applied 2026-10-22')).not.toBeNull();
  });

  test('hides leads on jobs with no submission evidence', async () => {
    mockData({
      applications: [
        application({ id: '1', appliedDate: null, status: 'active' }),
      ],
      leads: [lead({ id: 10, application_id: 1, name: 'Unsubmitted Contact' })],
    });

    render(
      <ThemeContextProvider>
        <RelationshipsView />
      </ThemeContextProvider>
    );

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

    render(
      <ThemeContextProvider>
        <RelationshipsView />
      </ThemeContextProvider>
    );

    expect(await screen.findByText('Rejected Contact')).not.toBeNull();
    expect(screen.getByText('Ghosted Contact')).not.toBeNull();
    expect(screen.getAllByText('Applied date not recorded')).toHaveLength(2);
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

    render(
      <ThemeContextProvider>
        <RelationshipsView />
      </ThemeContextProvider>
    );

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

    render(
      <ThemeContextProvider>
        <RelationshipsView />
      </ThemeContextProvider>
    );

    expect(await screen.findByText('Attached Contact')).not.toBeNull();
    expect(screen.queryByText('Standalone Contact')).toBeNull();
    expect(screen.getByText('1 applied jobs, 1 contacts')).not.toBeNull();
  });
});
