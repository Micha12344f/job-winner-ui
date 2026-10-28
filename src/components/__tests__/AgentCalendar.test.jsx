import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { ThemeContextProvider } from '../ThemeContext';
import AgentCalendar from '../AgentCalendar';
import {
  createScheduleException,
  getAgentHealth,
  getAgentRegistry,
  getAgentRuns,
  getAgentSchedule,
} from '../../api/agentsClient';

vi.mock('../../api/agentsClient', () => ({
  getAgentRegistry: vi.fn(),
  getAgentSchedule: vi.fn(),
  getAgentRuns: vi.fn(),
  getAgentHealth: vi.fn(),
  createScheduleException: vi.fn(),
}));

// Wednesday 21 October 2026, local time: the week window is Mon 19 - Sun 25.
const TODAY = new Date(2026, 9, 21, 12, 0, 0);

const agent = (id, name, status = 'active') => ({
  id,
  name,
  description: '',
  status,
  endpoints: [],
  nextRunAt: '',
  raw: {},
});

const run = (overrides = {}) => ({
  id: 'run-1',
  kind: 'run',
  agentId: 'radar',
  jobName: 'Poll job inbox',
  status: 'ok',
  scheduledAt: '2026-10-21T09:00:00',
  startedAt: '2026-10-21T09:00:00',
  finishedAt: '2026-10-21T09:00:02',
  durationMs: 1200,
  error: '',
  detail: '',
  related: [],
  raw: {},
  ...overrides,
});

const occurrence = (overrides = {}) => ({
  id: 'occ-1',
  kind: 'occurrence',
  agentId: 'radar',
  jobName: 'Score pipeline',
  status: 'scheduled',
  scheduledAt: '2026-10-21T11:00:00',
  startedAt: '',
  finishedAt: '',
  durationMs: null,
  error: '',
  detail: 'interval 120 minutes',
  related: [],
  raw: {},
  ...overrides,
});

const health = (overrides = {}) => ({
  sidecar: { up: true, status: 'up', detail: '1.4.0' },
  cron: {
    state: 'enabled',
    jobs: 6,
    lastStatus: 'ok',
    failureStreak: 0,
    nextRunAt: '',
  },
  session: { up: true, status: 'authenticated' },
  budget: { remainingPct: 64, remaining: '' },
  halted: false,
  raw: {},
  ...overrides,
});

const renderCalendar = (props = {}) =>
  render(
    <ThemeContextProvider>
      <AgentCalendar today={TODAY} {...props} />
    </ThemeContextProvider>
  );

const chips = container => [
  ...container.querySelectorAll('[data-testid="agent-chip"]'),
];

beforeEach(() => {
  vi.clearAllMocks();
  createScheduleException.mockResolvedValue({ ok: true });
  getAgentRegistry.mockResolvedValue({
    count: 2,
    items: [
      agent('radar', 'job-radar-agent'),
      agent('ops', 'agent-ops-monitor'),
    ],
  });
  getAgentSchedule.mockResolvedValue({ count: 1, items: [occurrence()] });
  getAgentRuns.mockResolvedValue({ count: 1, items: [run()] });
  getAgentHealth.mockResolvedValue(health());
});

afterEach(() => i18n.changeLanguage('en'));

describe('AgentCalendar', () => {
  describe('day view', () => {
    it('lays one column per hour and puts each run in its own hour', async () => {
      getAgentRuns.mockResolvedValue({
        count: 2,
        items: [
          run({ id: 'r1', scheduledAt: '2026-10-21T09:05:00' }),
          run({ id: 'r2', scheduledAt: '2026-10-21T14:40:00' }),
        ],
      });
      getAgentSchedule.mockResolvedValue({ count: 0, items: [] });
      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');

      const headings = container.querySelectorAll('[data-day-heading]');
      expect(headings).toHaveLength(24);
      expect(
        container.querySelectorAll(
          '[data-agent-cell="radar|2026-10-21|09"] [data-testid="agent-chip"]'
        )
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(
          '[data-agent-cell="radar|2026-10-21|14"] [data-testid="agent-chip"]'
        )
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(
          '[data-agent-cell="radar|2026-10-21|10"] [data-testid="agent-chip"]'
        )
      ).toHaveLength(0);
    });

    it('draws the current-time rule only on the current day', async () => {
      const { unmount } = renderCalendar({
        view: 'day',
        now: new Date(2026, 9, 21, 10, 30, 0),
      });
      await screen.findByText('job-radar-agent');
      expect(screen.getByTestId('agent-calendar-now-line')).toBeInTheDocument();
      expect(screen.getByText('10:30')).toBeInTheDocument();
      unmount();

      renderCalendar({ now: new Date(2026, 9, 22, 10, 30, 0) });
      await screen.findByText('job-radar-agent');
      expect(
        screen.queryByTestId('agent-calendar-now-line')
      ).not.toBeInTheDocument();
    });

    it('renders only the 24 hour columns', async () => {
      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');
      expect(container.querySelectorAll('[data-day-heading]')).toHaveLength(24);
      expect(screen.getByText('21 October 2026')).toBeInTheDocument();
    });
  });

  describe('deleting a run', () => {
    const occurrenceRow = overrides =>
      occurrence({
        jobId: 'f997d17166d8',
        skippable: true,
        ...overrides,
      });

    it('deletes one occurrence after confirmation', async () => {
      getAgentSchedule.mockResolvedValue({
        count: 1,
        items: [occurrenceRow({ scheduledAt: '2026-10-21T11:00:00' })],
      });
      getAgentRuns.mockResolvedValue({ count: 0, items: [] });
      const user = userEvent.setup();
      renderCalendar({ view: 'day' });

      await user.click(
        await screen.findByRole('button', { name: /Score pipeline at 11:00/ })
      );
      const drawer = await screen.findByTestId('agent-run-drawer');
      await user.click(
        within(drawer).getByRole('button', { name: 'Delete this run' })
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(createScheduleException).toHaveBeenCalledWith({
          jobId: 'f997d17166d8',
          occurrenceAt: '2026-10-21T11:00:00',
          scope: 'one',
          note: expect.stringContaining('one'),
        })
      );
    });

    it('ends the series from the chosen run', async () => {
      getAgentSchedule.mockResolvedValue({
        count: 1,
        items: [occurrenceRow({ scheduledAt: '2026-10-21T11:00:00' })],
      });
      getAgentRuns.mockResolvedValue({ count: 0, items: [] });
      const user = userEvent.setup();
      renderCalendar({ view: 'day' });

      await user.click(
        await screen.findByRole('button', { name: /Score pipeline at 11:00/ })
      );
      const drawer = await screen.findByTestId('agent-run-drawer');
      await user.click(
        within(drawer).getByRole('button', {
          name: 'Delete this and future runs',
        })
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(createScheduleException).toHaveBeenCalledWith(
          expect.objectContaining({ scope: 'future' })
        )
      );
    });

    it('cannot skip a single run of an agent-driven schedule', async () => {
      getAgentSchedule.mockResolvedValue({
        count: 1,
        items: [
          occurrenceRow({
            skippable: false,
            scheduledAt: '2026-10-21T11:00:00',
          }),
        ],
      });
      getAgentRuns.mockResolvedValue({ count: 0, items: [] });
      const user = userEvent.setup();
      renderCalendar({ view: 'day' });

      await user.click(
        await screen.findByRole('button', { name: /Score pipeline at 11:00/ })
      );
      const drawer = await screen.findByTestId('agent-run-drawer');
      expect(
        within(drawer).getByRole('button', { name: 'Delete this run' })
      ).toBeDisabled();
      expect(
        within(drawer).getByText(/Agent-driven schedule/)
      ).toBeInTheDocument();
    });
  });

  describe('render', () => {
    it('draws one swimlane per registered agent and both chips', async () => {
      const { container } = renderCalendar();

      expect(await screen.findByText('job-radar-agent')).toBeInTheDocument();
      expect(screen.getByText('agent-ops-monitor')).toBeInTheDocument();
      expect(container.querySelectorAll('[data-lane]')).toHaveLength(2);
      expect(chips(container)).toHaveLength(2);
      expect(screen.getByText('21 October 2026')).toBeInTheDocument();
      expect(screen.getByText('1 recorded · 1 scheduled')).toBeInTheDocument();
    });

    it('shows the health strip for the sidecar and cron state', async () => {
      const { container } = renderCalendar();

      const strip = await screen.findByTestId('agent-health-strip');
      expect(strip).toHaveAttribute('aria-label', 'Agent service health');
      expect(within(strip).getByLabelText('Sidecar: Up')).toBeInTheDocument();
      expect(
        within(strip).getByLabelText('Cron: enabled · 6 jobs')
      ).toBeInTheDocument();
      expect(within(strip).getByLabelText('Session: Up')).toBeInTheDocument();
      expect(
        within(strip).getByLabelText('Budget: 64% left')
      ).toBeInTheDocument();
      // Not halted, so no halt chip.
      expect(container.querySelector('[data-health-chip="halted"]')).toBeNull();
    });

    it('shows the halt chip when the sidecar reports a halt', async () => {
      getAgentHealth.mockResolvedValue(health({ halted: true }));
      const { container } = renderCalendar();

      await screen.findByTestId('agent-health-strip');
      expect(
        container.querySelector('[data-health-chip="halted"]')
      ).toHaveTextContent('halted');
    });

    it('labels every chip for assistive tech', async () => {
      renderCalendar();

      expect(
        await screen.findByRole('button', {
          name: 'Poll job inbox at 09:00',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Score pipeline at 11:00',
        })
      ).toBeInTheDocument();
    });
  });

  describe('loading', () => {
    it('shows a busy placeholder until every feed settles', async () => {
      getAgentRegistry.mockReturnValue(new Promise(() => {}));
      getAgentSchedule.mockReturnValue(new Promise(() => {}));
      getAgentRuns.mockReturnValue(new Promise(() => {}));
      getAgentHealth.mockReturnValue(new Promise(() => {}));

      const { container } = renderCalendar();

      const loading = screen.getByLabelText('Loading agent feeds');
      expect(loading).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('agent-health-loading')).toBeInTheDocument();
      expect(chips(container)).toHaveLength(0);
    });
  });

  describe('empty states', () => {
    it('reports an empty registry instead of drawing an empty grid', async () => {
      getAgentRegistry.mockResolvedValue({ count: 0, items: [] });
      getAgentSchedule.mockResolvedValue({ count: 0, items: [] });
      getAgentRuns.mockResolvedValue({ count: 0, items: [] });

      const { container } = renderCalendar();

      expect(
        await screen.findByText('No agents registered')
      ).toBeInTheDocument();
      expect(container.querySelectorAll('[data-lane]')).toHaveLength(0);
      expect(chips(container)).toHaveLength(0);
    });

    it('keeps the lanes but says so when the window holds no work', async () => {
      getAgentSchedule.mockResolvedValue({ count: 0, items: [] });
      getAgentRuns.mockResolvedValue({ count: 0, items: [] });

      const { container } = renderCalendar();

      expect(await screen.findByText('job-radar-agent')).toBeInTheDocument();
      expect(
        screen.getByText('No runs or scheduled work in this period.')
      ).toBeInTheDocument();
      expect(container.querySelectorAll('[data-lane]')).toHaveLength(2);
      expect(chips(container)).toHaveLength(0);
      expect(screen.getByText('0 recorded · 0 scheduled')).toBeInTheDocument();
    });

    it('still lists an agent the feeds mention but the registry omits', async () => {
      getAgentRegistry.mockResolvedValue({
        count: 1,
        items: [agent('radar', 'job-radar-agent')],
      });
      getAgentRuns.mockResolvedValue({
        count: 1,
        items: [run({ agentId: 'tracker', jobName: 'Reconcile statuses' })],
      });

      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');
      expect(container.querySelector('[data-lane="tracker"]')).not.toBeNull();
      expect(
        screen.getByRole('button', {
          name: 'Reconcile statuses at 09:00',
        })
      ).toBeInTheDocument();
    });
  });

  describe('errors', () => {
    it('surfaces a registry failure and retries on demand', async () => {
      getAgentRegistry.mockRejectedValue(new Error('offline'));
      const user = userEvent.setup();

      renderCalendar();

      expect(
        await screen.findByText(
          'Could not load the agent registry from the sidecar.'
        )
      ).toBeInTheDocument();
      expect(screen.queryByText('No agents registered')).toBeNull();
      expect(screen.queryByText('Loading agent feeds')).toBeNull();

      getAgentRegistry.mockResolvedValue({
        count: 1,
        items: [agent('radar', 'job-radar-agent')],
      });
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('job-radar-agent')).toBeInTheDocument();
      await waitFor(() => expect(getAgentRegistry).toHaveBeenCalledTimes(2));
    });

    it('names the failed feed and keeps the others on screen', async () => {
      getAgentSchedule.mockRejectedValue(new Error('500'));
      const { container } = renderCalendar();

      expect(
        await screen.findByText(
          'Some agent feeds could not be loaded: schedule.'
        )
      ).toBeInTheDocument();
      expect(chips(container)).toHaveLength(1);
      expect(
        screen.getByRole('button', {
          name: 'Poll job inbox at 09:00',
        })
      ).toBeInTheDocument();
    });

    it('degrades the health strip alone when its feed fails', async () => {
      getAgentHealth.mockRejectedValue(new Error('down'));

      renderCalendar();

      expect(await screen.findByTestId('agent-health-error')).toHaveTextContent(
        'Health feed unavailable.'
      );
      expect(await screen.findByText('job-radar-agent')).toBeInTheDocument();
    });
  });

  describe('past runs versus future occurrences', () => {
    it('draws recorded runs solid and projected work as a hollow outline', async () => {
      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');
      const solid = container.querySelector('[data-variant="solid"]');
      const outline = container.querySelector('[data-variant="outline"]');

      expect(solid).not.toBeNull();
      expect(outline).not.toBeNull();
      expect(solid).toHaveAttribute('data-status', 'ok');
      expect(solid).toHaveAttribute('data-kind', 'run');
      expect(solid.getAttribute('data-agent')).toBe('radar');
      expect(outline).toHaveAttribute('data-status', 'scheduled');
      expect(outline).toHaveAttribute('data-kind', 'occurrence');
    });

    it('colours statuses green, red and amber through the theme status tones', async () => {
      getAgentRuns.mockResolvedValue({
        count: 3,
        items: [
          run({ id: 'ok', status: 'ok' }),
          run({ id: 'bad', status: 'failed', jobName: 'Apply' }),
          run({ id: 'warn', status: 'incident', jobName: 'Sync' }),
        ],
      });

      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');
      const byStatus = status =>
        container.querySelector(
          `[data-testid="agent-chip"][data-status="${status}"]`
        );
      expect(byStatus('ok')).toHaveAttribute('data-variant', 'solid');
      expect(byStatus('failed')).toHaveAttribute('data-variant', 'solid');
      expect(byStatus('incident')).toHaveAttribute('data-variant', 'solid');
      // The legend repeats the same variants so the colour key is readable.
      expect(
        container.querySelector(
          '[aria-label="Chip legend"] [data-status="failed"]'
        )
      ).toHaveAttribute('data-variant', 'solid');
      expect(
        container.querySelector(
          '[aria-label="Chip legend"] [data-status="scheduled"]'
        )
      ).toHaveAttribute('data-variant', 'outline');
    });

    it('does not draw a scheduled slot twice when a run already covered it', async () => {
      getAgentSchedule.mockResolvedValue({
        count: 1,
        items: [
          occurrence({
            jobName: 'Poll job inbox',
            scheduledAt: run().scheduledAt,
          }),
        ],
      });

      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');
      expect(chips(container)).toHaveLength(1);
    });
  });

  describe('detail drawer', () => {
    it('opens on click with job, instant, status, duration, error and related rows', async () => {
      getAgentRuns.mockResolvedValue({
        count: 1,
        items: [
          run({
            status: 'failed',
            startedAt: '2026-10-21T09:00:00',
            finishedAt: '2026-10-21T09:01:05',
            durationMs: 65_000,
            error: 'LinkedIn session expired',
            detail: 'scanned 12 jobs',
            related: [{ label: 'tracker', value: 'status reconciled' }],
          }),
        ],
      });
      const user = userEvent.setup();

      renderCalendar();

      await user.click(
        await screen.findByRole('button', {
          name: 'Poll job inbox at 09:00',
        })
      );

      const drawer = await screen.findByRole('dialog', {
        name: 'Poll job inbox',
      });
      expect(within(drawer).getByText('Run detail')).toBeInTheDocument();
      expect(within(drawer).getByText('job-radar-agent')).toBeInTheDocument();
      // The instant is shown as "scheduled for" and, when reported, "started".
      expect(
        within(drawer).getAllByText('21 Oct 2026, 09:00').length
      ).toBeGreaterThan(0);
      // Status appears as the chip and as the detail row.
      expect(within(drawer).getAllByText('Failed').length).toBeGreaterThan(0);
      expect(within(drawer).getByText('1m 05s')).toBeInTheDocument();
      expect(within(drawer).getByTestId('agent-run-error')).toHaveTextContent(
        'LinkedIn session expired'
      );
      expect(within(drawer).getByText('scanned 12 jobs')).toBeInTheDocument();
      expect(within(drawer).getByText('status reconciled')).toBeInTheDocument();

      await user.click(within(drawer).getByRole('button', { name: 'Close' }));
      await waitFor(() =>
        expect(screen.queryByTestId('agent-run-drawer')).toBeNull()
      );
    });

    it('says "not reported" for a scheduled slot without a duration', async () => {
      const user = userEvent.setup();
      renderCalendar();

      await user.click(
        await screen.findByRole('button', {
          name: 'Score pipeline at 11:00',
        })
      );

      const drawer = await screen.findByRole('dialog', {
        name: 'Score pipeline',
      });
      expect(within(drawer).getAllByText('Scheduled').length).toBeGreaterThan(
        0
      );
      expect(
        within(drawer).getAllByText('Not reported').length
      ).toBeGreaterThan(0);
      expect(within(drawer).queryByTestId('agent-run-error')).toBeNull();
    });
  });

  describe('period', () => {
    it('shows one 24-hour period and no view switcher', async () => {
      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');
      expect(container.querySelectorAll('[data-day-heading]')).toHaveLength(24);
      expect(screen.queryByRole('button', { name: 'Week' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Month' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Day' })).toBeNull();
    });

    it('steps a day at a time and returns to today', async () => {
      const user = userEvent.setup();
      const { container } = renderCalendar();

      await screen.findByText('job-radar-agent');
      await user.click(screen.getByRole('button', { name: 'Next period' }));
      expect(await screen.findByText('22 October 2026')).toBeInTheDocument();
      // Tomorrow holds none of today's chips.
      expect(chips(container)).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'Today' }));
      expect(await screen.findByText('21 October 2026')).toBeInTheDocument();
      expect(chips(container)).toHaveLength(2);
    });
  });

  describe('translations', () => {
    it('renders Spanish copy', async () => {
      await i18n.changeLanguage('es');
      renderCalendar();

      expect(await screen.findByText('job-radar-agent')).toBeInTheDocument();
      expect(
        screen.getByText('1 registradas · 1 programadas')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Poll job inbox a las 09:00',
        })
      ).toBeInTheDocument();
    });
  });
});
