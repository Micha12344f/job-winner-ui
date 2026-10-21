import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import i18n from '../../i18n';
import { appTheme } from '../../config/theme';
import ApplicationHeatmap from '../ApplicationHeatmap';
import { ThemeContextProvider } from '../ThemeContext';

// Fixed "today" so the trailing range never depends on when the suite runs.
const TODAY = new Date(2026, 9, 21); // Oct 21, 2026, local time

const application = (id, appliedDate) => ({ id, appliedDate });

const renderHeatmap = applications =>
  render(
    <ThemeContextProvider>
      <ApplicationHeatmap applications={applications} today={TODAY} />
    </ThemeContextProvider>
  );

const cell = (container, date) =>
  container.querySelector(`[data-date="${date}"]`);

const inRangeApplications = () => [
  application('1', '2026-10-14'),
  application('2', '2026-10-14'),
  application('3', '2026-10-15'),
];

afterEach(() => i18n.changeLanguage('en'));

describe('ApplicationHeatmap', () => {
  describe('heading and totals', () => {
    test('summarises the applications in the trailing year', () => {
      renderHeatmap(inRangeApplications());

      expect(screen.getByText('Application activity')).not.toBeNull();
      expect(
        screen.getByText('3 applications in the last year')
      ).not.toBeNull();
    });

    test('uses the singular for a single application', () => {
      renderHeatmap([application('1', '2026-10-14')]);

      expect(screen.getByText('1 application in the last year')).not.toBeNull();
    });

    test('excludes applications from before the range', () => {
      renderHeatmap([...inRangeApplications(), application('4', '2024-01-05')]);

      expect(
        screen.getByText('3 applications in the last year')
      ).not.toBeNull();
    });

    test('renders a full empty grid without applications', () => {
      const { container } = renderHeatmap([]);

      expect(
        screen.getByText('0 applications in the last year')
      ).not.toBeNull();
      // 22 Oct 2025 - 21 Oct 2026 inclusive.
      expect(container.querySelectorAll('[data-date]')).toHaveLength(365);
      expect(screen.queryByText(/with no recorded date/)).toBeNull();
      expect(
        screen.getByRole('img', {
          name: 'Applications per day, from less to more',
        })
      ).not.toBeNull();
    });
  });

  describe('grouping by applied date', () => {
    test('renders one cell per day and counts same-day applications', () => {
      const { container } = renderHeatmap(inRangeApplications());

      expect(container.querySelectorAll('[data-date]')).toHaveLength(365);
      expect(
        container.querySelectorAll('[data-date="2026-10-14"]')
      ).toHaveLength(1);
      expect(
        screen.getByRole('button', {
          name: '2 applications on 14 October 2026',
        })
      ).not.toBeNull();
      expect(
        screen.getByRole('button', {
          name: '1 application on 15 October 2026',
        })
      ).not.toBeNull();
    });

    test('labels days without applications', () => {
      const { container } = renderHeatmap(inRangeApplications());

      expect(
        screen.getByRole('button', {
          name: 'No applications on 13 October 2026',
        })
      ).not.toBeNull();
      expect(cell(container, '2026-10-13').getAttribute('data-level')).toBe(
        '0'
      );
    });

    test('reports applications with no recorded date and leaves them out', () => {
      const { container } = renderHeatmap([
        ...inRangeApplications(),
        application('4', null),
        application('5', undefined),
      ]);

      expect(
        screen.getByText('2 applications with no recorded date')
      ).not.toBeNull();
      // Only the dated applications count towards the heading and the grid.
      expect(
        screen.getByText('3 applications in the last year')
      ).not.toBeNull();
      expect(container.querySelectorAll('[data-date]')).toHaveLength(365);
    });

    test('uses the singular when one application has no date', () => {
      renderHeatmap([application('1', null)]);

      expect(
        screen.getByText('1 application with no recorded date')
      ).not.toBeNull();
      expect(
        screen.getByText('0 applications in the last year')
      ).not.toBeNull();
    });
  });

  describe('intensity buckets', () => {
    test('scales four shades to the busiest day', () => {
      const { container } = renderHeatmap([
        application('1', '2026-10-12'),
        application('2', '2026-10-13'),
        application('3', '2026-10-13'),
        application('4', '2026-10-14'),
        application('5', '2026-10-14'),
        application('6', '2026-10-14'),
        application('7', '2026-10-15'),
        application('8', '2026-10-15'),
        application('9', '2026-10-15'),
        application('10', '2026-10-15'),
      ]);

      const levels = [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
      ].map(date => cell(container, date).getAttribute('data-level'));
      expect(levels).toEqual(['1', '2', '3', '4']);
    });

    test('shows five legend swatches from less to more', () => {
      const { container } = renderHeatmap(inRangeApplications());

      const legend = screen.getByRole('img', {
        name: 'Applications per day, from less to more',
      });
      expect(legend.querySelectorAll('[data-level]')).toHaveLength(5);
      expect(container.ownerDocument.body.textContent).toContain('Less');
      expect(screen.getByText('Less')).not.toBeNull();
      expect(screen.getByText('More')).not.toBeNull();
    });
  });

  describe('range selector', () => {
    const applications = [
      ...inRangeApplications(),
      application('4', '2024-01-05'),
    ];

    test('defaults to the trailing twelve months', () => {
      renderHeatmap(applications);

      expect(screen.getByRole('group', { name: 'Date range' })).not.toBeNull();
      expect(
        screen
          .getByRole('button', { name: 'Last 12 months' })
          .getAttribute('aria-pressed')
      ).toBe('true');
    });

    test('offers the current year and years that have applications', () => {
      renderHeatmap(applications);

      expect(screen.getByRole('button', { name: '2026' })).not.toBeNull();
      expect(screen.getByRole('button', { name: '2024' })).not.toBeNull();
      expect(screen.queryByRole('button', { name: '2025' })).toBeNull();
    });

    test('switches to a calendar year and reframes the grid', async () => {
      const { container } = renderHeatmap(applications);

      await userEvent.click(screen.getByRole('button', { name: '2024' }));

      expect(screen.getByText('1 application in 2024')).not.toBeNull();
      expect(
        screen
          .getByRole('button', { name: '2024' })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(cell(container, '2024-01-05')).not.toBeNull();
      expect(cell(container, '2026-10-14')).toBeNull();
      // 2024 is a leap year.
      expect(container.querySelectorAll('[data-date]')).toHaveLength(366);

      await userEvent.click(
        screen.getByRole('button', { name: 'Last 12 months' })
      );
      expect(
        screen.getByText('3 applications in the last year')
      ).not.toBeNull();
    });
  });

  describe('accessibility', () => {
    test('names the grid and each cell, and labels the weekdays', () => {
      renderHeatmap(inRangeApplications());

      expect(
        screen.getByRole('group', {
          name: 'Applications submitted per day',
        })
      ).not.toBeNull();
      expect(screen.getByText('Mon')).not.toBeNull();
      expect(screen.getByText('Wed')).not.toBeNull();
      expect(screen.getByText('Fri')).not.toBeNull();
      expect(
        screen.getByRole('button', {
          name: 'No applications on 1 November 2025',
        })
      ).not.toBeNull();
    });

    test('shows the day tooltip for keyboard focus', async () => {
      const { container } = renderHeatmap(inRangeApplications());
      const target = cell(container, '2026-10-14');

      expect(target.tagName).toBe('BUTTON');
      target.focus();
      expect(target).toHaveFocus();
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        '2 applications on 14 October 2026'
      );
    });

    test('collapses the panel from its summary', async () => {
      renderHeatmap(inRangeApplications());

      const summary = screen.getByRole('button', {
        name: /Application activity/,
      });
      expect(summary.getAttribute('aria-expanded')).toBe('true');

      await userEvent.click(summary);
      expect(summary.getAttribute('aria-expanded')).toBe('false');
      expect(
        screen.queryByRole('group', { name: 'Applications submitted per day' })
      ).toBeNull();
    });
  });

  describe('theme tokens', () => {
    test('defines five heatmap shades for both colour schemes', () => {
      for (const scheme of ['light', 'dark']) {
        const heatmap = appTheme.colorSchemes[scheme].palette.heatmap;
        expect(Object.keys(heatmap).sort()).toEqual([
          'empty',
          'level1',
          'level2',
          'level3',
          'level4',
        ]);
        expect(new Set(Object.values(heatmap)).size).toBe(5);
      }

      // Wired as CSS variables so each scheme swaps in its own values.
      expect(appTheme.vars.palette.heatmap.level4).toContain(
        'var(--mui-palette-heatmap-level4'
      );
    });
  });

  describe('translations', () => {
    test('renders Spanish copy, tooltips and captions', async () => {
      await i18n.changeLanguage('es');
      renderHeatmap([...inRangeApplications(), application('4', null)]);

      expect(screen.getByText('Actividad de solicitudes')).not.toBeNull();
      expect(screen.getByText('3 solicitudes en el último año')).not.toBeNull();
      expect(
        screen.getByText('1 solicitud sin fecha registrada')
      ).not.toBeNull();
      expect(
        screen.getByRole('button', {
          name: '2 solicitudes el 14 de octubre de 2026',
        })
      ).not.toBeNull();
      expect(
        screen.getByRole('group', { name: 'Solicitudes enviadas por día' })
      ).not.toBeNull();
      expect(screen.getByText('Lun')).not.toBeNull();
    });
  });
});
