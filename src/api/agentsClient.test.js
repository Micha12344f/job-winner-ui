import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAgentHealth,
  getAgentRegistry,
  getAgentRuns,
  getAgentSchedule,
  normaliseAgent,
  normaliseHealth,
  normaliseOccurrences,
  normaliseRun,
} from './agentsClient';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const lastUrl = () => global.fetch.mock.calls.at(-1)[0];

beforeEach(() => {
  delete window.APP_CONFIG;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete window.APP_CONFIG;
});

describe('feed URLs', () => {
  it('calls the registry under the ext prefix of the local sidecar', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));

    const result = await getAgentRegistry();

    expect(lastUrl()).toBe('http://127.0.0.1:8081/ext/agents/registry');
    expect(result).toEqual({ count: 0, items: [] });
  });

  it('honours window.APP_CONFIG.EXT_URL, the same base every /ext caller uses', async () => {
    window.APP_CONFIG = { EXT_URL: 'https://example.test/api/ext' };
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));

    await getAgentRuns();

    expect(lastUrl()).toBe('https://example.test/api/ext/agents/runs');
  });

  it('adds start and end to the schedule and runs feeds, and omits them when absent', async () => {
    // A fresh Response per call: a Response body can only be read once.
    global.fetch = vi
      .fn()
      .mockImplementation(() => jsonResponse({ items: [] }));

    await getAgentSchedule({
      start: '2026-10-19T00:00:00.000Z',
      end: '2026-10-25T23:59:59.999Z',
    });
    expect(lastUrl()).toBe(
      'http://127.0.0.1:8081/ext/agents/schedule?start=2026-10-19T00%3A00%3A00.000Z&end=2026-10-25T23%3A59%3A59.999Z'
    );

    await getAgentRuns();
    expect(lastUrl()).toBe('http://127.0.0.1:8081/ext/agents/runs');
  });

  it('surfaces the server detail as an ExtApiError', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ detail: 'agents feed unavailable' }, 503)
      );

    await expect(getAgentHealth()).rejects.toMatchObject({
      name: 'ExtApiError',
      message: 'agents feed unavailable',
      status: 503,
    });
  });
});

describe('normaliseAgent', () => {
  it('maps the documented registry shape', () => {
    const agent = normaliseAgent({
      agent_id: 'radar',
      name: 'job-radar-agent',
      description: 'Discovery',
      status: 'active',
      owned_endpoints: ['/ext/radar/jobs'],
      next_run_at: '2026-10-22T09:00:00Z',
    });

    expect(agent).toMatchObject({
      id: 'radar',
      name: 'job-radar-agent',
      description: 'Discovery',
      status: 'active',
      endpoints: ['/ext/radar/jobs'],
      nextRunAt: '2026-10-22T09:00:00Z',
    });
  });

  it('falls back to id/name aliases and empty collections', () => {
    const agent = normaliseAgent({ key: 'ops', label: 'agent-ops-monitor' }, 3);

    expect(agent).toMatchObject({
      id: 'ops',
      name: 'agent-ops-monitor',
      description: '',
      status: '',
      endpoints: [],
      nextRunAt: '',
    });
    expect(normaliseAgent({}, 2).id).toBe('agent-2');
  });
});

describe('normaliseRun', () => {
  it('maps a cron execution row, including a duration from its timestamps', () => {
    const run = normaliseRun({
      execution_id: 41,
      agent_id: 'radar',
      job_name: 'poll-inbox',
      status: 'failed',
      scheduled_instant: '2026-10-20T09:00:00Z',
      started_at: '2026-10-20T09:00:01Z',
      finished_at: '2026-10-20T09:00:03Z',
      error: 'LinkedIn session expired',
      output: 'scanned 12 jobs',
      agent_events: [{ actor: 'radar', summary: 'scored 3 jobs' }, 'plain row'],
    });

    expect(run).toMatchObject({
      id: '41',
      kind: 'run',
      agentId: 'radar',
      jobName: 'poll-inbox',
      status: 'failed',
      scheduledAt: '2026-10-20T09:00:00Z',
      startedAt: '2026-10-20T09:00:01Z',
      finishedAt: '2026-10-20T09:00:03Z',
      durationMs: 2000,
      error: 'LinkedIn session expired',
      detail: 'scanned 12 jobs',
    });
    expect(run.related).toEqual([
      { label: 'radar', value: 'scored 3 jobs' },
      { label: '', value: 'plain row' },
    ]);
  });

  it('accepts duration in ms or seconds and tolerates missing fields', () => {
    expect(normaliseRun({ duration_ms: 940 }).durationMs).toBe(940);
    expect(normaliseRun({ duration_s: 1.5 }).durationMs).toBe(1500);

    const sparse = normaliseRun({}, 7);
    expect(sparse).toMatchObject({
      id: 'run-7',
      agentId: '',
      jobName: '',
      status: 'unknown',
      scheduledAt: '',
      durationMs: null,
      error: '',
      detail: '',
      related: [],
    });
  });

  it('maps the status aliases the cron tables use', () => {
    expect(normaliseRun({ status: 'SUCCESS' }).status).toBe('ok');
    expect(normaliseRun({ status: 'timed out' }).status).toBe('failed');
    expect(normaliseRun({ status: 'degraded' }).status).toBe('incident');
    expect(normaliseRun({ state: 'in progress' }).status).toBe('running');
    expect(normaliseRun({ status: 'weird-new-token' }).status).toBe('unknown');
  });
});

describe('normaliseOccurrences', () => {
  it('keeps a single occurrence row as-is', () => {
    const [occurrence] = normaliseOccurrences({
      agent_id: 'radar',
      job_name: 'poll-inbox',
      scheduled_instant: '2026-10-23T09:00:00Z',
      schedule: '0 9-18 * * 1-5',
    });

    expect(occurrence).toMatchObject({
      kind: 'occurrence',
      status: 'scheduled',
      agentId: 'radar',
      jobName: 'poll-inbox',
      scheduledAt: '2026-10-23T09:00:00Z',
      detail: '0 9-18 * * 1-5',
      durationMs: null,
    });
  });

  it('flattens a nested occurrences array', () => {
    const rows = normaliseOccurrences({
      agent: 'ops',
      name: 'health-probe',
      occurrences: [
        { scheduled_instant: '2026-10-23T09:00:00Z' },
        '2026-10-23T11:00:00Z',
        { instant: '2026-10-23T13:00:00Z', id: 'slot-3' },
      ],
    });

    expect(rows.map(row => row.scheduledAt)).toEqual([
      '2026-10-23T09:00:00Z',
      '2026-10-23T11:00:00Z',
      '2026-10-23T13:00:00Z',
    ]);
    expect(rows.map(row => row.agentId)).toEqual(['ops', 'ops', 'ops']);
    expect(rows[2].id).toBe('slot-3');
  });

  it('drops an occurrence with no parsable instant instead of inventing one', () => {
    const rows = normaliseOccurrences({ agent_id: 'ops', occurrences: [{}] });
    expect(rows[0].scheduledAt).toBe('');
  });
});

describe('normaliseHealth', () => {
  it('maps the documented health payload', () => {
    const health = normaliseHealth({
      sidecar: { status: 'up', version: '1.4.0' },
      cron: {
        enabled: true,
        job_count: 6,
        last_status: 'ok',
        failure_streak: 0,
      },
      session: { status: 'authenticated' },
      budget: { remaining_pct: 64 },
      halted: false,
    });

    expect(health.sidecar.up).toBe(true);
    expect(health.cron).toMatchObject({
      state: 'enabled',
      jobs: 6,
      failureStreak: 0,
    });
    expect(health.session.up).toBe(true);
    expect(health.budget.remainingPct).toBe(64);
    expect(health.halted).toBe(false);
  });

  it('reads flattened keys and treats unknown values as unknown, not down', () => {
    const health = normaliseHealth({ status: 'starting', cron_paused: true });

    expect(health.sidecar.up).toBeNull();
    expect(health.cron.state).toBe('paused');
    expect(health.cron.jobs).toBeNull();
    expect(health.halted).toBeNull();
    expect(normaliseHealth({ service: { up: false } }).sidecar.up).toBe(false);
    expect(normaliseHealth({}).sidecar.up).toBeNull();
  });
});
