// Geometry and status vocabulary for the agent calendar. Pure functions only,
// so the grid, the tooltips and the chips can be tested without a DOM.
//
// A "run" is real work that already happened (cron execution), an
// "occurrence" is a projected future slot expanded from a schedule. The
// calendar draws the first solid and the second hollow.

import dayjs from 'dayjs';
import { DATE_KEY, dateLocale, formatDayLabel } from './heatmapUtil';

export { DATE_KEY, dateLocale, formatDayLabel };

export const CALENDAR_VIEWS = ['day', 'week', 'month'];

// Hours drawn by the day view. Every hour gets a column so a run at 14:30
// sits between 14:00 and 15:00 instead of being flattened into "today".
export const DAY_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// Every run status the UI colours. Anything the sidecar invents beyond these
// falls back to 'unknown' and renders in the neutral tone rather than
// crashing or inventing a colour.
export const RUN_STATUS_TONE = {
  ok: 'active',
  failed: 'rejected',
  incident: 'ghosted',
  running: 'open',
  unknown: 'all',
};

export const RUN_STATUSES = Object.keys(RUN_STATUS_TONE);

// Raw tokens the cron tables / sidecar may report, per UI status.
const STATUS_ALIASES = {
  ok: [
    'ok',
    'success',
    'succeeded',
    'successful',
    'complete',
    'completed',
    'done',
    'passed',
    'finished',
    // A closed incident is no longer trouble, but keep it visible for history.
    'resolved',
    'closed',
  ],
  failed: [
    'failed',
    'fail',
    'failure',
    'error',
    'errored',
    'timeout',
    'timed_out',
    'crashed',
    'dead',
  ],
  incident: [
    'incident',
    'incidents',
    'warning',
    'warn',
    'warned',
    'degraded',
    'partial',
    'skipped',
    'retried',
    // cron_incidents state tokens: an open or acknowledged incident row still
    // represents ongoing trouble; a resolved one is history, but the calendar
    // keeps the amber bucket so the incident count visible in the UI matches.
    'alerted',
    'open',
    'acked',
    'active',
  ],
  running: [
    'running',
    'started',
    'in_progress',
    'inprogress',
    'pending',
    'queued',
    'active',
  ],
};

/**
 * Maps a raw status token onto ok | failed | incident | running | unknown.
 * @param {unknown} value
 * @returns {'ok' | 'failed' | 'incident' | 'running' | 'unknown'}
 */
export function normaliseRunStatus(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return 'unknown';
  for (const [status, aliases] of Object.entries(STATUS_ALIASES)) {
    if (aliases.includes(raw)) return status;
  }
  return 'unknown';
}

/**
 * Tone for an agent's own status dot in its swimlane header. Reuses the job
 * status tones so the calendar never introduces a fourth palette.
 * @param {unknown} status
 * @returns {string}
 */
export const agentStatusTone = status => {
  const raw = String(status ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return 'all';
  if (['active', 'ok', 'up', 'healthy', 'ready', 'idle'].includes(raw)) {
    return raw === 'idle' ? 'ghosted' : 'active';
  }
  if (['paused', 'disabled', 'stopped', 'halted', 'inactive'].includes(raw)) {
    return 'ghosted';
  }
  if (['error', 'failed', 'failure', 'down', 'broken'].includes(raw)) {
    return 'rejected';
  }
  if (['running', 'busy', 'working', 'open'].includes(raw)) return 'open';
  return 'all';
};

/**
 * Solid for past runs, hollow outline for projected occurrences.
 * @param {'run' | 'occurrence'} kind
 * @returns {'solid' | 'outline'}
 */
export const chipVariant = kind =>
  kind === 'occurrence' ? 'outline' : 'solid';

/**
 * Calendar day (local) a timestamp belongs to.
 * @param {unknown} value - ISO instant or 'YYYY-MM-DD'.
 * @returns {string | null}
 */
export const dayKeyOf = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(DATE_KEY) : null;
};

// Weeks start on Monday, matching ApplicationHeatmap's Mon-first rows.
export const startOfWeek = (date = new Date()) => {
  const base = dayjs(date).startOf('day');
  return base.subtract((base.day() + 6) % 7, 'day');
};

/**
 * The inclusive day window a view covers, anchored on a date.
 * @param {{view?: 'week' | 'month', anchor?: unknown}} [options]
 * @returns {{view: 'week' | 'month', start: dayjs.Dayjs, end: dayjs.Dayjs, days: dayjs.Dayjs[]}}
 */
export function buildCalendarWindow({
  view = 'week',
  anchor = new Date(),
} = {}) {
  const base = dayjs(anchor).isValid() ? dayjs(anchor) : dayjs();

  if (view === 'day') {
    const start = base.startOf('day');
    return { view: 'day', start, end: base.endOf('day'), days: [start] };
  }

  if (view === 'month') {
    const start = base.startOf('month');
    const end = base.endOf('month');
    const days = Array.from({ length: end.date() }, (_, index) =>
      start.add(index, 'day')
    );
    return { view: 'month', start, end, days };
  }

  const start = startOfWeek(base);
  const end = start.add(6, 'day');
  const days = Array.from({ length: 7 }, (_, index) => start.add(index, 'day'));
  return { view: 'week', start, end, days };
}

/**
 * Query parameters for the schedule/runs feeds. Instants are sent as UTC ISO
 * strings covering the whole first and last day so no local-time run is lost.
 * @param {{start: dayjs.Dayjs, end: dayjs.Dayjs}} window
 * @returns {{start: string, end: string}}
 */
export const windowQuery = ({ start, end }) => ({
  start: start.startOf('day').toISOString(),
  end: end.endOf('day').toISOString(),
});

/**
 * Step the anchor by one period.
 * @param {unknown} anchor
 * @param {'week' | 'month'} view
 * @param {number} amount - Negative for backwards.
 * @returns {dayjs.Dayjs}
 */
export const shiftAnchor = (anchor, view, amount) =>
  dayjs(anchor).add(
    amount,
    view === 'month' ? 'month' : view === 'day' ? 'day' : 'week'
  );

const monthDayFormatters = new Map();
const monthYearFormatters = new Map();
const weekdayFormatters = new Map();
const dayNumberFormatters = new Map();
const timeFormatters = new Map();
const instantFormatters = new Map();

const formatter = (cache, locale, options) => {
  // The same cache serves several shapes (day only, day + month, ...), so the
  // options are part of the key.
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale, options));
  return cache.get(key);
};

/**
 * Heading over the grid, e.g. '13 – 19 Oct 2026' or 'October 2026'.
 * @param {{view: 'week' | 'month', start: dayjs.Dayjs, end: dayjs.Dayjs}} window
 * @param {string} language - i18n language code.
 * @returns {string}
 */
export function periodLabel(window, language = 'en') {
  const locale = dateLocale(language);
  const { start, end, view } = window;

  if (view === 'day') {
    return formatDayLabel(start.format(DATE_KEY), language);
  }

  if (view === 'month') {
    return formatter(monthYearFormatters, locale, {
      month: 'long',
      year: 'numeric',
    }).format(start.toDate());
  }

  const sameMonth = start.month() === end.month();
  const startText = formatter(
    monthDayFormatters,
    locale,
    sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' }
  ).format(start.toDate());
  const endText = formatter(monthDayFormatters, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(end.toDate());
  return `${startText} – ${endText}`;
}

/**
 * Column heading for one day: short weekday plus day of month.
 * @param {dayjs.Dayjs} day
 * @param {string} language
 * @returns {{weekday: string, day: string, long: string}}
 */
export function dayHeading(day, language = 'en') {
  const locale = dateLocale(language);
  return {
    weekday: formatter(weekdayFormatters, locale, { weekday: 'short' }).format(
      day.toDate()
    ),
    day: formatter(dayNumberFormatters, locale, { day: 'numeric' }).format(
      day.toDate()
    ),
    long: formatDayLabel(day.format(DATE_KEY), language),
  };
}

/**
 * Clock time for a chip, in the viewer's own timezone.
 * @param {unknown} value
 * @param {string} language
 * @returns {string} '' when the value is not a parsable instant.
 */
export function formatTime(value, language = 'en') {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return '';
  return formatter(timeFormatters, dateLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed.toDate());
}

/**
 * Full date and time for the detail drawer.
 * @param {unknown} value
 * @param {string} language
 * @returns {string}
 */
export function formatInstant(value, language = 'en') {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return '';
  return formatter(instantFormatters, dateLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed.toDate());
}

/**
 * Hour bucket key for one instant: 'YYYY-MM-DD|HH'. Null when unparsable, so
 * a broken timestamp never lands in an arbitrary column.
 * @param {unknown} value
 * @returns {string | null}
 */
export function hourKeyOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return null;
  return `${parsed.format(DATE_KEY)}|${parsed.format('HH')}`;
}

/**
 * How far through its hour a timestamp sits, 0–1, so a run at 14:30 is drawn
 * at 14:30 inside the 14:00 column rather than snapped to the boundary.
 * @param {unknown} value
 * @returns {number}
 */
export function fractionOfHour(value) {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return 0;
  return (parsed.minute() * 60 + parsed.second()) / 3600;
}

/**
 * How far through the day "now" sits, 0–1, for the current-time rule.
 * @param {unknown} [now]
 * @returns {number}
 */
export function fractionOfDay(now = new Date()) {
  const parsed = dayjs(now);
  if (!parsed.isValid()) return 0;
  return (
    (parsed.hour() * 3600 + parsed.minute() * 60 + parsed.second()) / 86400
  );
}

/**
 * Two-digit hour label for a day-view column, e.g. '09'.
 * @param {number} hour
 * @returns {string}
 */
export const hourLabel = hour => String(hour).padStart(2, '0');

/**
 * Human duration from milliseconds.
 * @param {number | null | undefined} ms
 * @returns {string} '' when unknown.
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || ms === '') return '';
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  const totalSeconds = Math.round(value / 1000);
  if (value < 3_600_000) {
    return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, '0')}s`;
  }
  const totalMinutes = Math.round(value / 60_000);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
}

/**
 * Groups chips per agent and calendar day, earliest first inside a day.
 * Items with no agent land under `unassignedId` so nothing silently vanishes.
 * @param {Array<{agentId?: string, scheduledAt?: string}>} [items]
 * @param {string} [unassignedId]
 * @returns {Map<string, Array<object>>}
 */
export function groupByAgentAndDay(items = [], unassignedId = '') {
  const groups = new Map();

  for (const item of items) {
    if (!item) continue;
    const key = dayKeyOf(item.scheduledAt);
    if (!key) continue;
    const agentId = item.agentId || unassignedId;
    const cellKey = `${agentId}|${key}`;
    if (!groups.has(cellKey)) groups.set(cellKey, []);
    groups.get(cellKey).push(item);
  }

  for (const rows of groups.values()) {
    rows.sort((a, b) =>
      String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? ''))
    );
  }

  return groups;
}

/**
 * Groups chips per agent and hour, earliest first inside an hour. The day
 * view needs the hour bucket, not the day bucket: two runs at 09:10 and 15:40
 * belong in different columns.
 * @param {Array<{agentId?: string, scheduledAt?: string}>} [items]
 * @param {string} [unassignedId]
 * @returns {Map<string, Array<object>>}
 */
export function groupByAgentAndHour(items = [], unassignedId = '') {
  const groups = new Map();

  for (const item of items) {
    if (!item) continue;
    const key = hourKeyOf(item.scheduledAt);
    if (!key) continue;
    const cellKey = `${item.agentId || unassignedId}|${key}`;
    if (!groups.has(cellKey)) groups.set(cellKey, []);
    groups.get(cellKey).push(item);
  }

  for (const rows of groups.values()) {
    rows.sort((a, b) =>
      String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? ''))
    );
  }

  return groups;
}

/**
 * Runs plus projected occurrences, with a projected slot dropped when a run
 * already covers the same agent/job/instant (so "now" is not drawn twice).
 * @param {{runs?: object[], occurrences?: object[]}} [feeds]
 * @returns {Array<object>} Runs first, then occurrences.
 */
export function mergeFeedItems({ runs = [], occurrences = [] } = {}) {
  const covered = new Set(
    runs.map(
      run =>
        `${run.agentId}|${run.jobName}|${dayKeyOf(run.scheduledAt)}|${
          dayjs(run.scheduledAt).isValid()
            ? dayjs(run.scheduledAt).format('HH:mm')
            : ''
        }`
    )
  );

  const projected = occurrences.filter(occurrence => {
    const instant = dayjs(occurrence.scheduledAt);
    if (!instant.isValid()) return true;
    const key = `${occurrence.agentId}|${occurrence.jobName}|${instant.format(
      DATE_KEY
    )}|${instant.format('HH:mm')}`;
    return !covered.has(key);
  });

  return [...runs, ...projected];
}

/**
 * Counts what the visible window holds, for the empty note and the heading.
 * @param {{runs?: object[], occurrences?: object[]}} [feeds]
 * @returns {{runs: number, scheduled: number, total: number}}
 */
export function summariseWindow({ runs = [], occurrences = [] } = {}) {
  return {
    runs: runs.length,
    scheduled: occurrences.length,
    total: runs.length + occurrences.length,
  };
}
