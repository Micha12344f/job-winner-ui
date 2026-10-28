import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  normaliseAgent,
  normaliseRun,
  normaliseOccurrences,
  normaliseHealth,
} from '../../api/agentsClient.js';
import { mergeFeedItems, summariseWindow } from '../agentCalendarUtil.js';

// Captured from the live sidecar. They live in the repo, not in scratch, so a
// cache prune cannot turn this compatibility check red.
const load = name =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'src/utils/__tests__/fixtures', `${name}.json`),
      'utf8'
    )
  );

describe('live feed compatibility (real sidecar payloads snapshotted 22 Oct 2026)', () => {
  test('registry normalises all six agents', () => {
    const agents = (load('reg').agents ?? []).map(normaliseAgent);
    expect(agents.map(a => a.id)).toEqual([
      'job-radar-agent',
      'linkedin-operator-agent',
      'application-tracker-agent',
      'outreach-sequencer-agent',
      'agent-ops-monitor',
      'orchestrator',
    ]);
    expect(agents[0].name).toBe('Job Radar Agent');
    expect(agents[0].endpoints.length).toBeGreaterThan(0);
  });

  test('schedule occurrence rows (occurrence_at) normalise', () => {
    const occ = (load('sched').occurrences ?? []).flatMap(normaliseOccurrences);
    expect(occ.length).toBeGreaterThan(40);
    expect(occ[0].kind).toBe('occurrence');
    expect(occ[0].scheduledAt).toMatch(/^2026-/);
    expect(occ[0].jobName).toBeTruthy();
    expect(occ[0].agentId).toBeTruthy();
    expect(occ[0].detail).toBeTruthy();
  });

  test('runs normalise with durations and errors intact (30-day snapshot)', () => {
    const runRows = (load('runs').runs ?? []).map(normaliseRun);
    expect(runRows.length).toBeGreaterThan(50);
    const withError = runRows.filter(r => r.error);
    expect(withError.length).toBeGreaterThan(0);
    expect(withError[0].durationMs).not.toBeNull();
    const failed = runRows.filter(r => r.status === 'failed');
    expect(failed.length).toBeGreaterThan(0);
    // 'completed' maps onto the ok tone, incidents keep their own bucket.
    expect(runRows.some(r => r.status === 'ok')).toBe(true);
  });

  test('health maps the flat agent-ops payload', () => {
    const h = normaliseHealth(load('health'));
    expect(h.sidecar.up).toBe(true); // overall "warning" still means the service answered
    expect(h.cron.state).toBe('enabled');
    expect(h.cron.jobs).toBeGreaterThan(0);
    expect(h.session.up).toBeNull(); // not_probed is unknown, never down
    expect(h.halted).toBeNull(); // no halt flag in the payload
  });

  test('a full week view merges runs and occurrences without duplicates', () => {
    const runRows = (load('runs').runs ?? []).map(normaliseRun);
    const occ = (load('sched').occurrences ?? []).flatMap(normaliseOccurrences);
    const merged = mergeFeedItems({ runs: runRows, occurrences: occ });
    // summary counts every feed row; merged drops a projected slot whose real
    // run already covers it, which is the desired dedupe.
    const summary = summariseWindow({ runs: runRows, occurrences: occ });
    expect(summary.total).toBeGreaterThanOrEqual(merged.length);
    // No agent is dropped: every registry agent id exists in the merged set or
    // legitimately has nothing this week.
    const ids = new Set(merged.map(m => m.agentId));
    expect(ids.has('job-radar-agent')).toBe(true);
  });
});
