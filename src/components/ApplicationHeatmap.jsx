import { memo, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import {
  DATE_KEY,
  RANGE_LAST_YEAR,
  buildApplicationHeatmap,
  formatDayLabel,
  intensityLevel,
  listYears,
} from '../utils/heatmapUtil';

// GitHub-sized cells: an 11px square on a 3px gap.
const CELL_SIZE = 11;
const CELL_GAP = 3;
const MONTH_ROW_HEIGHT = 14;
const MONTH_ROW_GAP = 4;

// Monday-first rows; only Mon/Wed/Fri carry a label, like GitHub.
const WEEKDAY_KEYS = ['mon', null, 'wed', null, 'fri', null, null];

const FALLBACK_HEATMAP = {
  empty: '#E9EDF3',
  level1: '#DCD8FB',
  level2: '#B4ACF6',
  level3: '#8B7DF0',
  level4: '#4F46E5',
};

const heatPalette = theme =>
  theme.vars?.palette?.heatmap ?? theme.palette?.heatmap ?? FALLBACK_HEATMAP;

const heatColor = (theme, level) =>
  heatPalette(theme)[level === 0 ? 'empty' : `level${level}`];

const cellSx = {
  width: CELL_SIZE,
  height: CELL_SIZE,
  borderRadius: '2px',
  display: 'block',
};

// Memoised so refetches and filter changes only touch cells whose day moved.
const HeatCell = memo(function HeatCell({ dateKey, level, label }) {
  return (
    <Tooltip title={label} placement="top" describeChild>
      <Box
        component="button"
        type="button"
        aria-label={label}
        data-date={dateKey}
        data-level={level}
        sx={{
          ...cellSx,
          p: 0,
          border: 0,
          bgcolor: theme => heatColor(theme, level),
          transition: 'opacity 120ms ease',
          '&:hover': { opacity: 0.75 },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '1px',
          },
        }}
      />
    </Tooltip>
  );
});

/**
 * GitHub-style contribution calendar of job applications, grouped by
 * appliedDate from the list the page already fetched.
 */
export default function ApplicationHeatmap({
  applications,
  today = new Date(),
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const [range, setRange] = useState(RANGE_LAST_YEAR);
  const scrollerRef = useRef(null);

  // Trim to the calendar day so the memo is stable across re-renders.
  const todayKey = dayjs(today).format(DATE_KEY);

  const years = useMemo(() => listYears(applications), [applications]);

  const rangeOptions = useMemo(() => {
    const currentYear = Number(todayKey.slice(0, 4));
    const options = [...new Set([currentYear, ...years])].sort((a, b) => b - a);

    return [
      { value: RANGE_LAST_YEAR, label: t('heatmap.range.lastYear') },
      ...options.map(year => ({ value: String(year), label: String(year) })),
    ];
  }, [years, todayKey, t]);

  // A year that no longer has applications falls back to the default range.
  const selectedRange = rangeOptions.some(option => option.value === range)
    ? range
    : RANGE_LAST_YEAR;

  const heatmap = useMemo(
    () =>
      buildApplicationHeatmap(applications, {
        range: selectedRange,
        today: todayKey,
        language,
      }),
    [applications, selectedRange, todayKey, language]
  );

  // Show the most recent weeks first on narrow screens, like GitHub.
  useEffect(() => {
    const element = scrollerRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [selectedRange]);

  const heading =
    selectedRange === RANGE_LAST_YEAR
      ? t('heatmap.heading.lastYear', { count: heatmap.total })
      : t('heatmap.heading.year', {
          count: heatmap.total,
          year: selectedRange,
        });

  return (
    <Accordion
      defaultExpanded
      disableGutters
      square={false}
      elevation={0}
      sx={{
        mb: 2.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: '14px',
        bgcolor: 'background.paper',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          px: { xs: 2, sm: 2.5 },
          minHeight: 56,
          '&.Mui-expanded': { minHeight: 56 },
          '& .MuiAccordionSummary-content': {
            my: 1.5,
            alignItems: 'baseline',
            columnGap: 1.5,
            rowGap: 0.25,
            flexWrap: 'wrap',
          },
        }}
      >
        <Typography
          component="h2"
          sx={{ fontSize: '0.9375rem', fontWeight: 700 }}
        >
          {t('heatmap.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {heading}
        </Typography>
      </AccordionSummary>

      <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pt: 0, pb: 2.25 }}>
        <Box
          role="group"
          aria-label={t('heatmap.rangeLabel')}
          sx={{
            display: 'flex',
            gap: 1,
            mb: 1.75,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {rangeOptions.map(option => {
            const selected = option.value === selectedRange;
            return (
              <Chip
                key={option.value}
                clickable
                size="small"
                aria-pressed={selected}
                label={option.label}
                onClick={() => setRange(option.value)}
                sx={{
                  flexShrink: 0,
                  border: 1,
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'primary.main' : 'transparent',
                  color: selected ? 'primary.contrastText' : 'text.secondary',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: selected ? 'primary.main' : 'action.hover',
                  },
                }}
              />
            );
          })}
        </Box>

        <Box
          ref={scrollerRef}
          role="group"
          aria-label={t('heatmap.gridLabel')}
          sx={{ overflowX: 'auto', pb: 0.5 }}
        >
          <Box sx={{ display: 'inline-flex', alignItems: 'flex-start' }}>
            <Box
              aria-hidden
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: `${CELL_GAP}px`,
                mt: `${MONTH_ROW_HEIGHT + MONTH_ROW_GAP}px`,
                mr: 0.75,
              }}
            >
              {WEEKDAY_KEYS.map((key, index) => (
                <Box
                  key={index}
                  sx={{
                    ...cellSx,
                    width: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    fontSize: '0.625rem',
                    lineHeight: 1,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {key ? t(`heatmap.weekdays.${key}`) : ''}
                </Box>
              ))}
            </Box>

            <Box>
              <Box
                aria-hidden
                sx={{
                  display: 'grid',
                  gridAutoFlow: 'column',
                  gridAutoColumns: `${CELL_SIZE}px`,
                  columnGap: `${CELL_GAP}px`,
                  height: MONTH_ROW_HEIGHT,
                  mb: `${MONTH_ROW_GAP}px`,
                }}
              >
                {heatmap.monthLabels.map((label, index) => (
                  <Box
                    key={index}
                    sx={{
                      fontSize: '0.625rem',
                      lineHeight: 1,
                      color: 'text.secondary',
                      whiteSpace: 'nowrap',
                      overflow: 'visible',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {label}
                  </Box>
                ))}
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridAutoFlow: 'column',
                  gridAutoColumns: `${CELL_SIZE}px`,
                  gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
                  gap: `${CELL_GAP}px`,
                }}
              >
                {heatmap.weeks.map((week, weekIndex) =>
                  week.map((key, dayIndex) => {
                    if (!key) {
                      return (
                        <Box
                          key={`${weekIndex}-${dayIndex}`}
                          aria-hidden
                          sx={cellSx}
                        />
                      );
                    }

                    const count = heatmap.counts.get(key) ?? 0;
                    const date = formatDayLabel(key, language);
                    const label =
                      count > 0
                        ? t('heatmap.tooltip', { count, date })
                        : t('heatmap.tooltipEmpty', { date });

                    return (
                      <HeatCell
                        key={key}
                        dateKey={key}
                        level={intensityLevel(count, heatmap.maxCount)}
                        label={label}
                      />
                    );
                  })
                )}
              </Box>
            </Box>
          </Box>
        </Box>

        <Box
          role="img"
          aria-label={t('heatmap.legendLabel')}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 0.75,
            mt: 1.25,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {t('heatmap.less')}
          </Typography>
          {[0, 1, 2, 3, 4].map(level => (
            <Box
              key={level}
              aria-hidden
              data-level={level}
              sx={{ ...cellSx, bgcolor: theme => heatColor(theme, level) }}
            />
          ))}
          <Typography variant="caption" color="text.secondary">
            {t('heatmap.more')}
          </Typography>
        </Box>

        {heatmap.undated > 0 && (
          <Typography
            component="p"
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.75, mb: 0 }}
          >
            {t('heatmap.missingDate', { count: heatmap.undated })}
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
