import dayjs from 'dayjs';

// Applied dates are calendar dates ('YYYY-MM-DD'), so every calculation here
// works on the stored day rather than on a local timestamp.
export const DATE_KEY = 'YYYY-MM-DD';

// Sentinel value for the default "trailing 12 months" range.
export const RANGE_LAST_YEAR = 'lastYear';

// 0 = no applications, then four progressively stronger shades.
export const INTENSITY_LEVELS = 4;

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toUtcDate = key => new Date(`${key}T00:00:00Z`);

/**
 * Normalises a stored applied date to 'YYYY-MM-DD'.
 * @param {unknown} value - Value straight from the API.
 * @returns {string | null} null when missing or not a real calendar date.
 */
export const toDateKey = value => {
  if (typeof value !== 'string') return null;
  // Tolerate a full ISO timestamp; only the calendar day matters.
  const key = value.slice(0, 10);
  if (!PLAIN_DATE.test(key)) return null;
  // Reject impossible dates such as 2026-02-30 or month 13.
  const date = toUtcDate(key);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === key ? key : null;
};

/**
 * Counts applications per applied date.
 * @param {Array<{appliedDate?: unknown}>} [applications]
 * @returns {{counts: Map<string, number>, undated: number}}
 */
export const groupByAppliedDate = applications => {
  const counts = new Map();
  let undated = 0;

  for (const application of applications ?? []) {
    const key = toDateKey(application?.appliedDate);
    if (!key) {
      undated += 1;
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return { counts, undated };
};

/**
 * Distinct calendar years that have at least one dated application,
 * newest first.
 * @param {Array<{appliedDate?: unknown}>} [applications]
 * @returns {number[]}
 */
export const listYears = applications => {
  const years = new Set();

  for (const application of applications ?? []) {
    const key = toDateKey(application?.appliedDate);
    if (key) years.add(Number(key.slice(0, 4)));
  }

  return [...years].sort((a, b) => b - a);
};

/**
 * Maps a day's count onto one of four intensity buckets, scaled to the
 * busiest day in the visible range (0 stays at the neutral level).
 * @param {number} count - Applications on that day.
 * @param {number} maxCount - Busiest day in the range.
 * @returns {0 | 1 | 2 | 3 | 4}
 */
export const intensityLevel = (count, maxCount) => {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (!Number.isFinite(maxCount) || maxCount <= 0) return 1;
  return Math.min(
    INTENSITY_LEVELS,
    Math.max(1, Math.ceil((count / maxCount) * INTENSITY_LEVELS))
  );
};

/**
 * Resolves a range value into inclusive first and last calendar days.
 * @param {string} range - RANGE_LAST_YEAR or a four-digit year.
 * @param {Date} [today] - Reference day for the trailing range.
 * @returns {{startKey: string, endKey: string}}
 */
export const resolveRange = (range, today = new Date()) => {
  const todayDate = dayjs(today).startOf('day');
  const year = Number(range);

  if (
    range !== RANGE_LAST_YEAR &&
    range != null &&
    Number.isInteger(year) &&
    year > 1000
  ) {
    return { startKey: `${year}-01-01`, endKey: `${year}-12-31` };
  }

  return {
    // Twelve months ending today, inclusive of today.
    startKey: todayDate.subtract(1, 'year').add(1, 'day').format(DATE_KEY),
    endKey: todayDate.format(DATE_KEY),
  };
};

// Weeks start on Monday so the Mon/Wed/Fri labels line up with rows 1, 3, 5.
const startOfWeek = date => date.subtract((date.day() + 6) % 7, 'day');

/**
 * Splits a range into week columns of seven days, Monday first.
 * Days outside the range are null placeholders, like GitHub's graph.
 * @param {string} startKey - First day in range.
 * @param {string} endKey - Last day in range.
 * @returns {Array<Array<string | null>>}
 */
export const buildWeeks = (startKey, endKey) => {
  const weeks = [];
  let week = [];
  const last = startOfWeek(dayjs(endKey)).add(6, 'day');
  let cursor = startOfWeek(dayjs(startKey));

  while (!cursor.isAfter(last, 'day')) {
    const key = cursor.format(DATE_KEY);
    week.push(key >= startKey && key <= endKey ? key : null);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor = cursor.add(1, 'day');
  }

  if (week.length > 0) {
    weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  }

  return weeks;
};

// English copy reads day-first ("14 October 2026"), so ask for en-GB.
export const dateLocale = language =>
  (language || '').toLowerCase().startsWith('es') ? 'es-ES' : 'en-GB';

// Building an Intl formatter per cell is expensive (hundreds per render),
// so keep one per locale for each format the grid needs.
const monthFormatters = new Map();
const dayFormatters = new Map();

const cachedFormatter = (cache, locale, options) => {
  if (!cache.has(locale)) {
    cache.set(locale, new Intl.DateTimeFormat(locale, options));
  }
  return cache.get(locale);
};

/**
 * Short month name for a column label.
 * @param {string} dateKey
 * @param {string} language - i18n language code.
 * @returns {string}
 */
export const formatMonthLabel = (dateKey, language = 'en') =>
  cachedFormatter(monthFormatters, dateLocale(language), {
    month: 'short',
    timeZone: 'UTC',
  }).format(toUtcDate(dateKey));

/**
 * Long, human date used in cell tooltips, e.g. '14 October 2026'.
 * @param {string} dateKey
 * @param {string} language - i18n language code.
 * @returns {string}
 */
export const formatDayLabel = (dateKey, language = 'en') =>
  cachedFormatter(dayFormatters, dateLocale(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUtcDate(dateKey));

/**
 * One label per week column, on the first week of each month.
 * @param {Array<Array<string | null>>} weeks
 * @param {string} language - i18n language code.
 * @returns {string[]} Same length as weeks; '' where no label belongs.
 */
export const buildMonthLabels = (weeks, language = 'en') => {
  let previousMonth = null;

  return weeks.map(week => {
    const firstKey = week.find(Boolean);
    if (!firstKey) return '';

    const month = firstKey.slice(0, 7);
    if (month === previousMonth) return '';
    previousMonth = month;
    return formatMonthLabel(firstKey, language);
  });
};

/**
 * Everything the heatmap needs to render a range, derived from the
 * application list the app already fetched.
 * @param {Array<{appliedDate?: unknown}>} [applications]
 * @param {{range?: string, today?: Date, language?: string}} [options]
 * @returns {{
 *   weeks: Array<Array<string | null>>,
 *   monthLabels: string[],
 *   counts: Map<string, number>,
 *   undated: number,
 *   total: number,
 *   maxCount: number,
 *   years: number[],
 *   startKey: string,
 *   endKey: string,
 * }}
 */
export const buildApplicationHeatmap = (
  applications,
  { range = RANGE_LAST_YEAR, today = new Date(), language = 'en' } = {}
) => {
  const { counts, undated } = groupByAppliedDate(applications);
  const { startKey, endKey } = resolveRange(range, today);
  const weeks = buildWeeks(startKey, endKey);

  let total = 0;
  let maxCount = 0;
  for (const [key, count] of counts) {
    if (key < startKey || key > endKey) continue;
    total += count;
    if (count > maxCount) maxCount = count;
  }

  const years = listYears(applications);

  return {
    weeks,
    monthLabels: buildMonthLabels(weeks, language),
    counts,
    undated,
    total,
    maxCount,
    years,
    startKey,
    endKey,
  };
};
