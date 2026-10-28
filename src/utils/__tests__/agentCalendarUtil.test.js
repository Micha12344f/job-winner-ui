import { describe, expect, it } from 'vitest';
import {
  DATE_KEY,
  agentStatusTone,
  buildCalendarWindow,
  chipVariant,
  dayKeyOf,
  formatDuration,
  formatInstant,
  DAY_HOURS,
  formatTime,
  fractionOfDay,
  fractionOfHour,
  groupByAgentAndDay,
  groupByAgentAndHour,
  hourKeyOf,
  hourLabel,
  mergeFeedItems,
  normaliseRunStatus,
  periodLabel,
  shiftAnchor,
  startOfWeek,
  summariseWindow,
  windowQuery,
} from '../agentCalendarUtil';

// Wednesday, local time.
const TODAY = new Date(2026, 9, 21, 12, 0, 0);

const run = (overrides = {}) => ({
  id: 'r',
  kind: 'run',
  agentId: 'radar',
  jobName: 'poll',
  status: 'ok',
  scheduledAt: '2026-10-20T09:00:00',
  ...overrides,
});

const occurrence = (overrides = {}) => ({
  id: 'o',
  kind: 'occurrence',
  agentId: 'radar',
  jobName: 'poll',
  status: 'scheduled',
  scheduledAt: '2026-10-20T09:00:00',
  ...overrides,
});

describe('normaliseRunStatus', () => {
  it('maps the tokens the cron tables actually use', () => {
    expect(normaliseRunStatus('ok')).toBe('ok');
    expect(normaliseRunStatus('SUCCESS')).toBe('ok');
    expect(normaliseRunStatus('failed')).toBe('failed');
    expect(normaliseRunStatus('timed-out')).toBe('failed');
    expect(normaliseRunStatus('incident')).toBe('incident');
    expect(normaliseRunStatus('warning')).toBe('incident');
    expect(normaliseRunStatus('running')).toBe('running');
    expect(normaliseRunStatus('in_progress')).toBe('running');
  });

  it('falls back to unknown rather than inventing a status', () => {
    expect(normaliseRunStatus(undefined)).toBe('unknown');
    expect(normaliseRunStatus('')).toBe('unknown');
    expect(normaliseRunStatus('new-token')).toBe('unknown');
  });
});

describe('calendar window', () => {
  it('starts the week on Monday, like the application heatmap', () => {
    expect(startOfWeek(TODAY).format(DATE_KEY)).toBe('2026-10-19');
    expect(startOfWeek(new Date(2026, 9, 18)).format(DATE_KEY)).toBe(
      '2026-10-12'
    );
  });

  it('covers seven days for a week and the whole month for a month', () => {
    const week = buildCalendarWindow({ view: 'week', anchor: TODAY });
    expect(week.days.map(day => day.format(DATE_KEY))).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);

    const month = buildCalendarWindow({ view: 'month', anchor: TODAY });
    expect(month.days).toHaveLength(31);
    expect(month.days[0].format(DATE_KEY)).toBe('2026-10-01');
    expect(month.days[30].format(DATE_KEY)).toBe('2026-10-31');
  });

  it('sends UTC instants covering the whole first and last day', () => {
    const week = buildCalendarWindow({ view: 'week', anchor: TODAY });
    expect(windowQuery(week)).toEqual({
      start: new Date(2026, 9, 19, 0, 0, 0, 0).toISOString(),
      end: new Date(2026, 9, 25, 23, 59, 59, 999).toISOString(),
    });
  });

  it('steps by week or by month', () => {
    expect(shiftAnchor(TODAY, 'week', 1).format(DATE_KEY)).toBe('2026-10-28');
    expect(shiftAnchor(TODAY, 'month', -1).format(DATE_KEY)).toBe('2026-09-21');
  });

  it('labels the period in the active language', () => {
    const week = buildCalendarWindow({ view: 'week', anchor: TODAY });
    expect(periodLabel(week, 'en')).toBe('19 – 25 Oct 2026');
    expect(periodLabel(week, 'es')).toBe('19 – 25 oct 2026');

    const month = buildCalendarWindow({ view: 'month', anchor: TODAY });
    expect(periodLabel(month, 'en')).toBe('October 2026');
    expect(periodLabel(month, 'es')).toBe('octubre de 2026');
  });
});

describe('instants', () => {
  it('buckets by the local calendar day and rejects junk', () => {
    expect(dayKeyOf('2026-10-20T09:00:00')).toBe('2026-10-20');
    expect(dayKeyOf('2026-10-20')).toBe('2026-10-20');
    expect(dayKeyOf('not a date')).toBeNull();
    expect(dayKeyOf('')).toBeNull();
    expect(dayKeyOf(null)).toBeNull();
  });

  it('formats a chip time and a drawer instant', () => {
    expect(formatTime('2026-10-20T09:05:00', 'en')).toBe('09:05');
    expect(formatInstant('2026-10-20T09:05:00', 'en')).toBe(
      '20 Oct 2026, 09:05'
    );
    expect(formatTime('', 'en')).toBe('');
    expect(formatInstant('nope', 'en')).toBe('');
  });
});

describe('formatDuration', () => {
  it('scales from milliseconds to hours', () => {
    expect(formatDuration(820)).toBe('820 ms');
    expect(formatDuration(1200)).toBe('1.2 s');
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(formatDuration(3_725_000)).toBe('1h 02m');
  });

  it('returns an empty string when the duration is unknown', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration(-1)).toBe('');
    expect(formatDuration('abc')).toBe('');
  });
});

describe('grouping and merging', () => {
  it('groups per agent and day, earliest first, with an unassigned lane', () => {
    const groups = groupByAgentAndDay([
      run({ id: 'late', scheduledAt: '2026-10-20T17:00:00' }),
      run({ id: 'early', scheduledAt: '2026-10-20T07:00:00' }),
      run({ id: 'other', agentId: 'ops', scheduledAt: '2026-10-21T07:00:00' }),
      run({ id: 'orphan', agentId: '', scheduledAt: '2026-10-21T08:00:00' }),
      run({ id: 'undated', scheduledAt: 'garbage' }),
    ]);

    expect(groups.get('radar|2026-10-20').map(item => item.id)).toEqual([
      'early',
      'late',
    ]);
    expect(groups.get('ops|2026-10-21')).toHaveLength(1);
    expect(groups.get('|2026-10-21').map(item => item.id)).toEqual(['orphan']);
    expect([...groups.keys()].some(key => key.includes('NaN'))).toBe(false);
  });

  it('drops a projected slot a real run already covers', () => {
    const merged = mergeFeedItems({
      runs: [run({ scheduledAt: '2026-10-20T09:00:00' })],
      occurrences: [
        occurrence({ id: 'dup', scheduledAt: '2026-10-20T09:00:00' }),
        occurrence({ id: 'next', scheduledAt: '2026-10-20T11:00:00' }),
      ],
    });

    expect(merged.map(item => item.id)).toEqual(['r', 'next']);
  });

  it('counts runs and scheduled slots separately', () => {
    expect(
      summariseWindow({
        runs: [run()],
        occurrences: [occurrence(), occurrence()],
      })
    ).toEqual({ runs: 1, scheduled: 2, total: 3 });
    expect(summariseWindow()).toEqual({ runs: 0, scheduled: 0, total: 0 });
  });

  it('treats occurrences as outline and runs as solid', () => {
    expect(chipVariant('run')).toBe('solid');
    expect(chipVariant('occurrence')).toBe('outline');
    expect(chipVariant(undefined)).toBe('solid');
  });

  it('maps agent status onto an existing status tone', () => {
    expect(agentStatusTone('active')).toBe('active');
    expect(agentStatusTone('idle')).toBe('ghosted');
    expect(agentStatusTone('paused')).toBe('ghosted');
    expect(agentStatusTone('error')).toBe('rejected');
    expect(agentStatusTone('running')).toBe('open');
    expect(agentStatusTone('')).toBe('all');
    expect(agentStatusTone('mystery')).toBe('all');
  });
});

describe('day view helpers', () => {
  it('builds a single-day window and labels it by date', () => {
    const window = buildCalendarWindow({ view: 'day', anchor: TODAY });
    expect(window.view).toBe('day');
    expect(window.days).toHaveLength(1);
    expect(window.start.format(DATE_KEY)).toBe('2026-10-21');
    expect(window.start.format('HH:mm')).toBe('00:00');
    expect(window.end.format('HH:mm')).toBe('23:59');
    expect(periodLabel(window)).toContain('21');
    expect(DAY_HOURS).toHaveLength(24);
    expect(hourLabel(9)).toBe('09');
    expect(hourLabel(23)).toBe('23');
  });

  it('steps a day at a time', () => {
    expect(shiftAnchor(TODAY, 'day', 1).format(DATE_KEY)).toBe('2026-10-22');
    expect(shiftAnchor(TODAY, 'day', -1).format(DATE_KEY)).toBe('2026-10-20');
  });

  it('buckets instants by hour and offset inside the hour', () => {
    expect(hourKeyOf('2026-10-21T09:05:00')).toBe('2026-10-21|09');
    expect(hourKeyOf('2026-10-21T23:59:00')).toBe('2026-10-21|23');
    expect(hourKeyOf('')).toBeNull();
    expect(hourKeyOf('nonsense')).toBeNull();
    expect(fractionOfHour('2026-10-21T09:30:00')).toBeCloseTo(0.5, 5);
    expect(fractionOfHour('bad')).toBe(0);
    expect(fractionOfDay(new Date(2026, 9, 21, 12, 0, 0))).toBeCloseTo(0.5, 5);
  });

  it('groups per agent and hour, earliest first', () => {
    const groups = groupByAgentAndHour([
      { id: 'a', agentId: 'radar', scheduledAt: '2026-10-21T09:40:00' },
      { id: 'b', agentId: 'radar', scheduledAt: '2026-10-21T09:10:00' },
      { id: 'c', agentId: 'radar', scheduledAt: '2026-10-21T15:00:00' },
      { id: 'd', agentId: '', scheduledAt: '2026-10-21T10:00:00' },
      { id: 'e', agentId: 'radar', scheduledAt: null },
    ]);

    expect(groups.get('radar|2026-10-21|09').map(item => item.id)).toEqual([
      'b',
      'a',
    ]);
    expect(groups.get('radar|2026-10-21|15')).toHaveLength(1);
    expect(groups.get('|2026-10-21|10')).toHaveLength(1);
    expect(groups.size).toBe(3);
  });
});
