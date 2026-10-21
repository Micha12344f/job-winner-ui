import { describe, expect, test } from 'vitest';
import {
  buildApplicationHeatmap,
  buildMonthLabels,
  buildWeeks,
  formatDayLabel,
  groupByAppliedDate,
  intensityLevel,
  listYears,
  resolveRange,
  toDateKey,
} from '../heatmapUtil';

// Fixed "today" so results never depend on when the suite runs.
const TODAY = new Date(2026, 9, 21); // Oct 21, 2026, local time

describe('toDateKey', () => {
  test('keeps a plain calendar date', () => {
    expect(toDateKey('2026-10-14')).toBe('2026-10-14');
  });

  test('takes the calendar day from an ISO timestamp', () => {
    expect(toDateKey('2026-10-14T22:15:00Z')).toBe('2026-10-14');
  });

  test.each([
    undefined,
    null,
    '',
    'not a date',
    '14/10/2026',
    '2026-02-30',
    '2026-13-01',
    42,
  ])('rejects %p', value => {
    expect(toDateKey(value)).toBeNull();
  });
});

describe('groupByAppliedDate', () => {
  test('counts applications per applied date', () => {
    const { counts } = groupByAppliedDate([
      { id: '1', appliedDate: '2026-10-14' },
      { id: '2', appliedDate: '2026-10-14' },
      { id: '3', appliedDate: '2026-10-01' },
    ]);

    expect(counts.get('2026-10-14')).toBe(2);
    expect(counts.get('2026-10-01')).toBe(1);
    expect(counts.size).toBe(2);
  });

  test('reports applications without a usable date separately', () => {
    const { counts, undated } = groupByAppliedDate([
      { id: '1', appliedDate: '2026-10-14' },
      { id: '2', appliedDate: null },
      { id: '3' },
      { id: '4', appliedDate: '2026-02-30' },
    ]);

    expect(counts.size).toBe(1);
    expect(undated).toBe(3);
  });

  test('handles a missing or empty list', () => {
    expect(groupByAppliedDate().counts.size).toBe(0);
    expect(groupByAppliedDate().undated).toBe(0);
    expect(groupByAppliedDate([]).undated).toBe(0);
  });
});

describe('intensityLevel', () => {
  test('is 0 for days without applications', () => {
    expect(intensityLevel(0, 4)).toBe(0);
    expect(intensityLevel(-2, 4)).toBe(0);
    expect(intensityLevel(Number.NaN, 4)).toBe(0);
  });

  test('spreads a 1..4 range across all four buckets', () => {
    expect([1, 2, 3, 4].map(count => intensityLevel(count, 4))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  test('scales to the busiest day in the data', () => {
    expect([1, 2, 3, 5, 7, 8].map(count => intensityLevel(count, 8))).toEqual([
      1, 1, 2, 3, 4, 4,
    ]);
  });

  test('never drops a real day to the empty bucket or exceeds four', () => {
    expect(intensityLevel(1, 1000)).toBe(1);
    expect(intensityLevel(1000, 1)).toBe(4);
  });

  test('treats an unknown maximum as the lowest active bucket', () => {
    expect(intensityLevel(3, 0)).toBe(1);
    expect(intensityLevel(3, undefined)).toBe(1);
  });
});

describe('resolveRange', () => {
  test('defaults to the trailing twelve months ending today', () => {
    expect(resolveRange('lastYear', TODAY)).toEqual({
      startKey: '2025-10-22',
      endKey: '2026-10-21',
    });
  });

  test('uses whole calendar years', () => {
    expect(resolveRange('2024', TODAY)).toEqual({
      startKey: '2024-01-01',
      endKey: '2024-12-31',
    });
  });

  test('falls back to the trailing range for an unknown value', () => {
    expect(resolveRange('nope', TODAY)).toEqual(
      resolveRange('lastYear', TODAY)
    );
    expect(resolveRange(undefined, TODAY).endKey).toBe('2026-10-21');
  });
});

describe('buildWeeks', () => {
  test('pads partial weeks with placeholders, Monday first', () => {
    const weeks = buildWeeks('2026-10-01', '2026-10-21'); // Thu..Wed

    expect(weeks.every(week => week.length === 7)).toBe(true);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks.at(-1)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      null,
      null,
      null,
      null,
    ]);
  });

  test('renders exactly one cell per day in range', () => {
    const weeks = buildWeeks('2025-10-22', '2026-10-21');
    const days = weeks.flat().filter(Boolean);

    expect(days).toHaveLength(365);
    expect(days[0]).toBe('2025-10-22');
    expect(days.at(-1)).toBe('2026-10-21');
  });
});

describe('buildMonthLabels', () => {
  test('labels the first week of each month only', () => {
    const weeks = buildWeeks('2026-10-01', '2026-12-31');
    const labels = buildMonthLabels(weeks, 'en');

    expect(labels).toHaveLength(weeks.length);
    expect(labels.filter(Boolean)).toEqual(['Oct', 'Nov', 'Dec']);
    expect(labels[0]).toBe('Oct');
  });

  test('localizes month names', () => {
    const weeks = buildWeeks('2026-10-01', '2026-10-31');
    expect(buildMonthLabels(weeks, 'es')[0]).toBe('oct');
  });
});

describe('formatDayLabel', () => {
  test('spells the date out for tooltips', () => {
    expect(formatDayLabel('2026-10-14', 'en')).toBe('14 October 2026');
    expect(formatDayLabel('2026-10-14', 'es')).toBe('14 de octubre de 2026');
  });
});

describe('listYears', () => {
  test('lists years with dated applications, newest first', () => {
    expect(
      listYears([
        { appliedDate: '2024-05-01' },
        { appliedDate: '2026-01-01' },
        { appliedDate: '2024-11-30' },
        { appliedDate: null },
        { appliedDate: 'someday' },
      ])
    ).toEqual([2026, 2024]);
  });

  test('is empty without dated applications', () => {
    expect(listYears([])).toEqual([]);
    expect(listYears(undefined)).toEqual([]);
    expect(listYears([{ appliedDate: null }])).toEqual([]);
  });
});

describe('buildApplicationHeatmap', () => {
  const applications = [
    { id: '1', appliedDate: '2026-10-14' },
    { id: '2', appliedDate: '2026-10-14' },
    { id: '3', appliedDate: '2026-10-15' },
    { id: '4', appliedDate: '2024-01-05' },
    { id: '5', appliedDate: null },
    { id: '6', appliedDate: null },
  ];

  test('totals and scales to the visible range only', () => {
    const heatmap = buildApplicationHeatmap(applications, {
      range: 'lastYear',
      today: TODAY,
      language: 'en',
    });

    expect(heatmap.total).toBe(3);
    expect(heatmap.maxCount).toBe(2);
    expect(heatmap.undated).toBe(2);
    expect(heatmap.startKey).toBe('2025-10-22');
    expect(heatmap.endKey).toBe('2026-10-21');
    // The 2024 application is still offered as a range option.
    expect(heatmap.years).toEqual([2026, 2024]);
  });

  test('recomputes totals and intensity for a calendar year', () => {
    const heatmap = buildApplicationHeatmap(applications, {
      range: '2026',
      today: TODAY,
      language: 'en',
    });

    expect(heatmap.total).toBe(3);
    expect(heatmap.maxCount).toBe(2);
    expect(heatmap.weeks.flat().filter(Boolean)).toHaveLength(365);
  });

  test('excludes out-of-range days from the total but counts undated ones', () => {
    const heatmap = buildApplicationHeatmap(applications, {
      range: '2024',
      today: TODAY,
      language: 'en',
    });

    expect(heatmap.total).toBe(1);
    expect(heatmap.maxCount).toBe(1);
    expect(heatmap.undated).toBe(2);
    expect(heatmap.weeks.flat().filter(Boolean)).toHaveLength(366); // leap year
  });

  test('renders an empty grid without applications', () => {
    const heatmap = buildApplicationHeatmap([], { today: TODAY });

    expect(heatmap.total).toBe(0);
    expect(heatmap.maxCount).toBe(0);
    expect(heatmap.undated).toBe(0);
    expect(heatmap.weeks.flat().filter(Boolean)).toHaveLength(365);
    expect(heatmap.counts.size).toBe(0);
  });
});
