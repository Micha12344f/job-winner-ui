import { dialog, expect, openApp, settle, test } from './fixtures';

// The agent calendar reads four /ext/agents/* feeds from the sidecar. The
// browser tests stub them (the mock API only speaks GraphQL), so the fixture
// clock in fixtures.js sets "today" to Monday 15 June 2026, 10:00 in
// America/Los_Angeles.
const REGISTRY = {
  count: 2,
  items: [
    {
      agent_id: 'job-radar-agent',
      name: 'job-radar-agent',
      description: 'Discovery',
      status: 'active',
      owned_endpoints: ['/ext/radar/jobs'],
    },
    {
      agent_id: 'agent-ops-monitor',
      name: 'agent-ops-monitor',
      description: 'Observability',
      status: 'idle',
      owned_endpoints: ['/ext/agents/health'],
    },
  ],
};

const RUNS = {
  count: 2,
  items: [
    {
      run_id: 'exec-1',
      agent_id: 'job-radar-agent',
      job_name: 'Poll job inbox',
      status: 'ok',
      scheduled_instant: '2026-06-15T08:00:00',
      started_at: '2026-06-15T08:00:00',
      finished_at: '2026-06-15T08:00:02',
      duration_ms: 2000,
      output: 'scanned 14 postings',
    },
    {
      run_id: 'exec-2',
      agent_id: 'agent-ops-monitor',
      job_name: 'Session health check',
      status: 'failed',
      scheduled_instant: '2026-06-15T09:30:00',
      started_at: '2026-06-15T09:30:00',
      finished_at: '2026-06-15T09:30:12',
      duration_ms: 12_000,
      error: 'LinkedIn session expired (401)',
    },
  ],
};

const SCHEDULE = {
  count: 1,
  items: [
    {
      agent_id: 'job-radar-agent',
      job_name: 'Score pipeline',
      schedule: '0 9-18 * * 1-5',
      occurrences: [{ scheduled_instant: '2026-06-17T11:00:00' }],
    },
  ],
};

const HEALTH = {
  sidecar: { status: 'up', version: '1.4.0' },
  cron: { enabled: true, job_count: 6, last_status: 'ok' },
  session: { status: 'authenticated' },
  budget: { remaining_pct: 64 },
  halted: false,
};

async function stubAgentFeeds(page) {
  await page.route('**/ext/agents/registry', route =>
    route.fulfill({ json: REGISTRY })
  );
  await page.route('**/ext/agents/runs**', route =>
    route.fulfill({ json: RUNS })
  );
  await page.route('**/ext/agents/schedule**', route =>
    route.fulfill({ json: SCHEDULE })
  );
  await page.route('**/ext/agents/health', route =>
    route.fulfill({ json: HEALTH })
  );
}

test.describe('agent calendar', () => {
  test('opens from the header and draws runs solid and scheduled work hollow', async ({
    page,
  }) => {
    await stubAgentFeeds(page);
    await openApp(page);

    await page.getByRole('button', { name: 'Agent calendar' }).click();
    await settle(page);
    const calendar = dialog(page, 'Agent calendar');
    await expect(calendar).toBeVisible();
    await expect(calendar.getByText('15 – 21 Jun 2026')).toBeVisible();

    // Registry order drives one swimlane per agent.
    const lanes = calendar.locator('[data-lane]');
    await expect(lanes).toHaveCount(2);
    await expect(lanes.first()).toContainText('job-radar-agent');

    const completed = calendar.getByRole('button', {
      name: 'Poll job inbox at 08:00, Completed',
    });
    await expect(completed).toHaveAttribute('data-variant', 'solid');

    const scheduled = calendar.getByRole('button', {
      name: 'Score pipeline at 11:00, Scheduled',
    });
    await expect(scheduled).toHaveAttribute('data-variant', 'outline');
    await expect(
      calendar.getByRole('button', {
        name: 'Session health check at 09:30, Failed',
      })
    ).toHaveAttribute('data-variant', 'solid');
  });

  test('shows the sidecar and cron health strip', async ({ page }) => {
    await stubAgentFeeds(page);
    await openApp(page);

    await page.getByRole('button', { name: 'Agent calendar' }).click();
    await settle(page);
    const strip = dialog(page, 'Agent calendar').getByTestId(
      'agent-health-strip'
    );
    await expect(strip.getByLabel('Sidecar: Up')).toBeVisible();
    await expect(strip.getByLabel('Cron: enabled · 6 jobs')).toBeVisible();
    await expect(strip.getByLabel('Budget: 64% left')).toBeVisible();
  });

  test('opens a failed run in the detail drawer with its real error', async ({
    page,
  }) => {
    await stubAgentFeeds(page);
    await openApp(page);

    await page.getByRole('button', { name: 'Agent calendar' }).click();
    await settle(page);
    await page
      .getByRole('button', { name: 'Session health check at 09:30, Failed' })
      .click();

    const drawer = page.getByRole('dialog', { name: 'Session health check' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('agent-ops-monitor');
    await expect(drawer).toContainText('15 Jun 2026, 09:30');
    await expect(drawer).toContainText('12.0 s');
    await expect(drawer.getByTestId('agent-run-error')).toHaveText(
      'LinkedIn session expired (401)'
    );

    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toBeHidden();
  });

  test('switches to the month view and reaches July', async ({ page }) => {
    await stubAgentFeeds(page);
    await openApp(page);

    await page.getByRole('button', { name: 'Agent calendar' }).click();
    await settle(page);
    const calendar = dialog(page, 'Agent calendar');
    await calendar.getByRole('button', { name: 'Month' }).click();
    await expect(calendar.getByText('June 2026')).toBeVisible();
    await expect(calendar.locator('[data-day-heading]')).toHaveCount(30);

    await calendar.getByRole('button', { name: 'Next period' }).click();
    await expect(calendar.getByText('July 2026')).toBeVisible();
    await calendar.getByRole('button', { name: 'Today' }).click();
    await expect(calendar.getByText('June 2026')).toBeVisible();
  });

  test('explains an empty registry instead of drawing empty lanes', async ({
    page,
  }) => {
    await page.route('**/ext/agents/registry', route =>
      route.fulfill({ json: { count: 0, items: [] } })
    );
    await page.route('**/ext/agents/runs**', route =>
      route.fulfill({ json: { count: 0, items: [] } })
    );
    await page.route('**/ext/agents/schedule**', route =>
      route.fulfill({ json: { count: 0, items: [] } })
    );
    await page.route('**/ext/agents/health', route =>
      route.fulfill({ json: HEALTH })
    );
    await openApp(page);

    await page.getByRole('button', { name: 'Agent calendar' }).click();
    await settle(page);
    const calendar = dialog(page, 'Agent calendar');
    await expect(calendar.getByText('No agents registered')).toBeVisible();
    await expect(calendar.locator('[data-lane]')).toHaveCount(0);
  });

  // A malformed payload rather than a 5xx: an HTTP error is what the unit test
  // covers, and a failed request would log a browser console error that the
  // shared fixture (rightly) treats as a bug.
  test('survives a malformed registry payload with a retry', async ({
    page,
  }) => {
    await page.route('**/ext/agents/registry', route =>
      route.fulfill({ contentType: 'text/plain', body: 'not json' })
    );
    await page.route('**/ext/agents/runs**', route =>
      route.fulfill({ json: RUNS })
    );
    await page.route('**/ext/agents/schedule**', route =>
      route.fulfill({ json: SCHEDULE })
    );
    await page.route('**/ext/agents/health', route =>
      route.fulfill({ json: HEALTH })
    );
    await openApp(page);

    await page.getByRole('button', { name: 'Agent calendar' }).click();
    await settle(page);
    const calendar = dialog(page, 'Agent calendar');
    await expect(
      calendar.getByText('Could not load the agent registry from the sidecar.')
    ).toBeVisible();
    await expect(calendar.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
