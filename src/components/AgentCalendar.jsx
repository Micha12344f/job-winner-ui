import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dayjs from 'dayjs';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import {
  getAgentHealth,
  getAgentRegistry,
  getAgentRuns,
  getAgentSchedule,
} from '../api/agentsClient';
import { statusColor } from '../config/status';
import {
  CALENDAR_VIEWS,
  DATE_KEY,
  DAY_HOURS,
  RUN_STATUS_TONE,
  agentStatusTone,
  buildCalendarWindow,
  chipVariant,
  dayHeading,
  dayKeyOf,
  formatTime,
  groupByAgentAndDay,
  groupByAgentAndHour,
  hourLabel,
  mergeFeedItems,
  periodLabel,
  shiftAnchor,
  summariseWindow,
  windowQuery,
} from '../utils/agentCalendarUtil';
import AgentHealthStrip from './AgentHealthStrip';
import { createScheduleException } from '../api/agentsClient';
import AgentRunDrawer from './AgentRunDrawer';
import EmptyState from './common/EmptyState';

// Chips per day cell before the "+N" overflow. Week days are wide enough for
// three labelled chips; month days only fit the compact time chips.
const MAX_CHIPS = { day: 3, week: 3, month: 2 };

// Memoised so refetches only repaint chips whose data moved.
const AgentChip = memo(function AgentChip({ item, label, compact, onSelect }) {
  const tone = RUN_STATUS_TONE[item.status] ?? 'all';
  const outline = chipVariant(item.kind) === 'outline';
  const text = compact
    ? formatTime(item.scheduledAt) || item.jobName
    : item.jobName || formatTime(item.scheduledAt);

  return (
    <Tooltip title={label} placement="top" describeChild>
      <Box
        component="button"
        type="button"
        data-testid="agent-chip"
        data-agent={item.agentId || ''}
        data-status={item.status}
        data-kind={item.kind}
        data-variant={outline ? 'outline' : 'solid'}
        aria-label={label}
        onClick={() => onSelect(item)}
        sx={{
          width: '100%',
          minWidth: 0,
          p: 0,
          px: 0.5,
          height: 18,
          borderRadius: '5px',
          border: 1,
          borderColor: statusColor(tone, outline ? 'main' : 'solid'),
          bgcolor: outline ? 'transparent' : statusColor(tone, 'solid'),
          color: outline
            ? statusColor(tone, 'text')
            : statusColor(tone, 'solidText'),
          font: 'inherit',
          fontSize: '0.625rem',
          fontWeight: 600,
          lineHeight: 1,
          textAlign: 'left',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          cursor: 'pointer',
          transition: 'opacity 120ms ease',
          '&:hover': { opacity: 0.85 },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '1px',
          },
        }}
      >
        {text}
      </Box>
    </Tooltip>
  );
});

// Legend swatch: same visual rules as a chip, without the text.
function LegendSwatch({ status, kind }) {
  const tone = RUN_STATUS_TONE[status] ?? 'all';
  const outline = kind === 'occurrence';
  return (
    <Box
      aria-hidden
      data-status={status}
      data-variant={outline ? 'outline' : 'solid'}
      sx={{
        width: 12,
        height: 12,
        borderRadius: '3px',
        border: 1,
        borderColor: statusColor(tone, outline ? 'main' : 'solid'),
        bgcolor: outline ? 'transparent' : statusColor(tone, 'solid'),
      }}
    />
  );
}

/**
 * Week/month calendar of agent work: one swimlane per registered agent, solid
 * chips for recorded runs, hollow outlines for projected schedule occurrences,
 * and a drawer with the full detail of whatever is clicked.
 */
export default function AgentCalendar({
  today = new Date(),
  now: nowProp,
  defaultView = 'day',
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const [view, setView] = useState(
    CALENDAR_VIEWS.includes(defaultView) ? defaultView : 'day'
  );
  const [anchor, setAnchor] = useState(() => dayjs(today));
  // Live clock for the current-time rule. A caller can pin it (tests, or a
  // screenshot) by passing `now`; otherwise it ticks once a minute.
  const [clock, setClock] = useState(() => dayjs(nowProp ?? today));

  useEffect(() => {
    if (nowProp) return undefined;
    const id = setInterval(() => setClock(dayjs()), 60000);
    return () => clearInterval(id);
  }, [nowProp]);
  const [feeds, setFeeds] = useState({
    registry: [],
    runs: [],
    occurrences: [],
    health: null,
  });
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const period = useMemo(
    () => buildCalendarWindow({ view, anchor }),
    [view, anchor]
  );

  // One refetch per visible window, retry, or view change. Each feed settles
  // independently, so a dead endpoint degrades one lane instead of the page.
  useEffect(() => {
    let active = true;
    const query = windowQuery(period);
    setLoading(true);
    Promise.allSettled([
      getAgentRegistry(),
      getAgentSchedule(query),
      getAgentRuns(query),
      getAgentHealth(),
    ]).then(([registry, schedule, runs, health]) => {
      if (!active) return;
      const failed = [];
      if (registry.status !== 'fulfilled') failed.push('registry');
      if (schedule.status !== 'fulfilled') failed.push('schedule');
      if (runs.status !== 'fulfilled') failed.push('runs');
      if (health.status !== 'fulfilled') failed.push('health');
      setFeeds(previous => ({
        registry:
          registry.status === 'fulfilled'
            ? registry.value.items
            : previous.registry,
        runs: runs.status === 'fulfilled' ? runs.value.items : [],
        occurrences:
          schedule.status === 'fulfilled' ? schedule.value.items : [],
        health: health.status === 'fulfilled' ? health.value : previous.health,
      }));
      setFailures(failed);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [period, reloadToken]);

  // Registry order first, then any agent the feeds mention without being
  // registered (shown rather than hidden), plus a lane for unknown actors.
  const lanes = useMemo(() => {
    const lanes = feeds.registry.map(agent => ({ ...agent, registered: true }));
    const known = new Set(lanes.map(agent => agent.id));
    const extras = new Map();
    for (const item of [...feeds.runs, ...feeds.occurrences]) {
      const id = item.agentId || '';
      if (id && known.has(id)) continue;
      if (!id && known.has('')) continue;
      if (!extras.has(id)) {
        extras.set(id, {
          id,
          name: id,
          description: '',
          status: '',
          endpoints: [],
          nextRunAt: '',
          registered: false,
        });
      }
    }
    return [
      ...lanes,
      ...[...extras.values()].sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
      ),
    ];
  }, [feeds]);

  const items = useMemo(
    () => mergeFeedItems({ runs: feeds.runs, occurrences: feeds.occurrences }),
    [feeds]
  );
  const isDayView = view === 'day';
  const groups = useMemo(
    () =>
      isDayView
        ? groupByAgentAndHour(items, '')
        : groupByAgentAndDay(items, ''),
    [items, isDayView]
  );
  const columns = isDayView ? DAY_HOURS : period.days;
  const laneMin = 120;
  const columnMin = isDayView ? 46 : view === 'week' ? 68 : 34;
  const gridTemplate = `minmax(${laneMin}px, 168px) repeat(${columns.length}, minmax(${columnMin}px, 1fr))`;
  const summary = summariseWindow({
    runs: feeds.runs,
    occurrences: items.filter(item => item.kind === 'occurrence'),
  });

  const todayKey = dayKeyOf(today);
  // Current-time rule: only meaningful on the actual current day.
  const nowKey = dayKeyOf(clock);
  const showNowLine =
    isDayView &&
    nowKey === todayKey &&
    period.start.format(DATE_KEY) === nowKey;
  const nowHour = clock.hour();
  const nowOffset = (clock.minute() * 60 + clock.second()) / 3600;
  const showSkeleton = loading && lanes.length === 0 && items.length === 0;
  const registryFailed = failures.includes('registry');
  const partialFailures = failures.filter(name => name !== 'registry');

  const selectItem = useCallback(item => setSelected(item), []);
  const closeDrawer = useCallback(() => setSelected(null), []);
  const reload = () => setReloadToken(token => token + 1);

  const deleteOccurrence = useCallback(
    async (item, scope) => {
      if (!item?.jobId || !item?.scheduledAt) {
        setActionError(t('agentCalendar.delete.missingJob'));
        return;
      }
      setDeleting(true);
      setActionError('');
      try {
        await createScheduleException({
          jobId: item.jobId,
          occurrenceAt: item.scheduledAt,
          scope,
          note: `deleted from the agent calendar by ${scope}`,
        });
        setSelected(null);
        reload();
      } catch (error) {
        setActionError(error?.message || String(error));
      } finally {
        setDeleting(false);
      }
    },
    [t]
  );

  const labelFor = item => {
    const status = t(`agentCalendar.status.${item.status ?? 'unknown'}`);
    const job =
      item.jobName || t(`agentCalendar.status.${item.status ?? 'unknown'}`);
    const time = formatTime(item.scheduledAt, language);
    if (isDayView) {
      return time
        ? t('agentCalendar.dayChipLabel', { job, time })
        : t('agentCalendar.chipLabelNoTime', { job, status });
    }
    return time
      ? t('agentCalendar.chipLabel', { job, time, status })
      : t('agentCalendar.chipLabelNoTime', { job, status });
  };

  const selectedAgent = lanes.find(lane => lane.id === selected?.agentId);

  return (
    <Box data-testid="agent-calendar">
      <AgentHealthStrip
        health={feeds.health}
        loading={showSkeleton}
        error={failures.includes('health')}
      />

      {actionError && (
        <Alert
          severity="error"
          onClose={() => setActionError('')}
          sx={{ mb: 2 }}
        >
          {t('agentCalendar.delete.failed', { error: actionError })}
        </Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          mb: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography
            component="h2"
            sx={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.4 }}
          >
            {periodLabel(period, language)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('agentCalendar.summary', {
              runs: summary.runs,
              scheduled: summary.scheduled,
            })}
          </Typography>
        </Box>

        <Box
          role="group"
          aria-label={t('agentCalendar.viewLabel')}
          sx={{ display: 'flex', gap: 1 }}
        >
          {CALENDAR_VIEWS.map(option => {
            const active = option === view;
            return (
              <Chip
                key={option}
                clickable
                size="small"
                aria-pressed={active}
                label={t(`agentCalendar.view.${option}`)}
                onClick={() => setView(option)}
                sx={{
                  border: 1,
                  borderColor: active ? 'primary.main' : 'divider',
                  bgcolor: active ? 'primary.main' : 'transparent',
                  color: active ? 'primary.contrastText' : 'text.secondary',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: active ? 'primary.main' : 'action.hover',
                  },
                }}
              />
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            aria-label={t('agentCalendar.previous')}
            onClick={() => setAnchor(current => shiftAnchor(current, view, -1))}
          >
            <ChevronLeftRoundedIcon fontSize="small" />
          </IconButton>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setAnchor(dayjs(today))}
          >
            {t('agentCalendar.today')}
          </Button>
          <IconButton
            size="small"
            aria-label={t('agentCalendar.next')}
            onClick={() => setAnchor(current => shiftAnchor(current, view, 1))}
          >
            <ChevronRightRoundedIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={t('agentCalendar.refresh')}
            onClick={reload}
          >
            <RefreshRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {registryFailed && (
        <Alert
          severity="error"
          sx={{ alignItems: 'center', mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={reload}>
              {t('common.retry')}
            </Button>
          }
        >
          {t('agentCalendar.loadError')}
        </Alert>
      )}

      {!registryFailed && partialFailures.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('agentCalendar.partialError', {
            feeds: partialFailures
              .map(name => t(`agentCalendar.feeds.${name}`))
              .join(', '),
          })}
        </Alert>
      )}

      {showSkeleton && (
        <Box
          role="status"
          aria-busy="true"
          aria-label={t('agentCalendar.loading')}
          data-testid="agent-calendar-loading"
          sx={{ display: 'grid', gap: 1 }}
        >
          {[0, 1, 2].map(row => (
            <Skeleton key={row} variant="rounded" height={44} />
          ))}
        </Box>
      )}

      {!showSkeleton && !registryFailed && lanes.length === 0 && (
        <EmptyState
          icon={<SmartToyOutlinedIcon />}
          title={t('agentCalendar.emptyAgents.title')}
          description={t('agentCalendar.emptyAgents.description')}
        />
      )}

      {!showSkeleton && lanes.length > 0 && (
        <Box
          role="group"
          aria-label={t('agentCalendar.gridLabel')}
          sx={{ overflowX: 'auto', pb: 0.5 }}
        >
          <Box
            sx={{
              position: 'relative',
              minWidth: isDayView ? 1272 : view === 'week' ? 660 : 900,
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: gridTemplate,
              }}
            >
              <Box
                aria-hidden
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: 'background.paper',
                  py: 1,
                  pr: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {t('agentCalendar.agentColumn')}
                </Typography>
              </Box>

              {columns.map(day => {
                const isHour = typeof day === 'number';
                const heading = isHour ? null : dayHeading(day, language);
                const key = isHour ? `h${day}` : day.format(DATE_KEY);
                const isToday = isHour
                  ? period.start.format(DATE_KEY) === todayKey
                  : day.format(DATE_KEY) === todayKey;
                return (
                  <Box
                    key={key}
                    data-day-heading={
                      isHour
                        ? `${period.start.format(DATE_KEY)}T${hourLabel(day)}`
                        : key
                    }
                    sx={{
                      py: 0.75,
                      px: 0.5,
                      textAlign: 'center',
                      borderBottom: 1,
                      borderLeft: 1,
                      borderColor: 'divider',
                      bgcolor: isToday
                        ? theme =>
                            `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
                        : 'transparent',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontWeight: 700,
                        lineHeight: 1.3,
                      }}
                    >
                      {isHour ? hourLabel(day) : heading.weekday}
                    </Typography>
                    {!isHour && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', lineHeight: 1.3 }}
                      >
                        {heading.day}
                      </Typography>
                    )}
                  </Box>
                );
              })}

              {lanes.map(agent => (
                <Fragment key={agent.id || 'unassigned'}>
                  <Box
                    data-lane={agent.id || 'unassigned'}
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      bgcolor: 'background.paper',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      py: 1,
                      pr: 1,
                      borderTop: 1,
                      borderColor: 'divider',
                      minWidth: 0,
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        width: 6,
                        height: 6,
                        flexShrink: 0,
                        borderRadius: '50%',
                        bgcolor: statusColor(
                          agentStatusTone(agent.status),
                          'main'
                        ),
                      }}
                    />
                    <Typography
                      variant="body2"
                      title={agent.name}
                      sx={{
                        fontWeight: 600,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: agent.registered
                          ? 'text.primary'
                          : 'text.secondary',
                      }}
                    >
                      {agent.name || t('agentCalendar.unassigned')}
                    </Typography>
                  </Box>

                  {columns.map(day => {
                    const isHour = typeof day === 'number';
                    const key = isHour
                      ? `${period.start.format(DATE_KEY)}|${hourLabel(day)}`
                      : day.format(DATE_KEY);
                    const cellItems = groups.get(`${agent.id}|${key}`) ?? [];
                    const visible = cellItems.slice(0, MAX_CHIPS[view]);
                    const overflow = cellItems.length - visible.length;
                    return (
                      <Box
                        key={`${agent.id || 'unassigned'}-${key}`}
                        data-agent-cell={`${agent.id}|${key}`}
                        sx={{
                          borderTop: 1,
                          borderLeft: 1,
                          borderColor: 'divider',
                          p: 0.5,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.25,
                          minHeight: isDayView ? 44 : view === 'week' ? 48 : 40,
                        }}
                      >
                        {visible.map(item => (
                          <AgentChip
                            key={item.id}
                            item={item}
                            compact={isDayView || view === 'month'}
                            label={labelFor(item)}
                            onSelect={selectItem}
                          />
                        ))}
                        {overflow > 0 && (
                          <Typography
                            component="span"
                            data-testid="agent-chip-overflow"
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontSize: '0.625rem',
                              lineHeight: 1.2,
                              pl: 0.25,
                            }}
                          >
                            {t('agentCalendar.moreChips', { count: overflow })}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Fragment>
              ))}
            </Box>

            {showNowLine && (
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
              >
                <Box
                  sx={{ gridColumn: `${2 + nowHour}`, position: 'relative' }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: `${nowOffset * 100}%`,
                      transform: 'translateX(-50%)',
                      px: 0.5,
                      borderRadius: 0.75,
                      bgcolor: 'error.main',
                      color: 'error.contrastText',
                      fontSize: '0.625rem',
                      lineHeight: 1.5,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatTime(clock.toDate(), language) ||
                      clock.format('HH:mm')}
                  </Box>
                  <Box
                    data-testid="agent-calendar-now-line"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${nowOffset * 100}%`,
                      width: 2,
                      bgcolor: 'error.main',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: -3,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'error.main',
                      },
                    }}
                  />
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {!showSkeleton &&
        lanes.length > 0 &&
        summary.total === 0 &&
        !registryFailed && (
          <Typography
            role="status"
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1.25 }}
          >
            {t('agentCalendar.emptyWindow')}
          </Typography>
        )}

      <Box
        role="group"
        aria-label={t('agentCalendar.legendLabel')}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          mt: 1.75,
        }}
      >
        {['ok', 'failed', 'incident'].map(status => (
          <Box
            key={status}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
          >
            <LegendSwatch status={status} kind="run" />
            <Typography variant="caption" color="text.secondary">
              {t(`agentCalendar.legend.${status}`)}
            </Typography>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <LegendSwatch status="scheduled" kind="occurrence" />
          <Typography variant="caption" color="text.secondary">
            {t('agentCalendar.legend.scheduled')}
          </Typography>
        </Box>
      </Box>

      <AgentRunDrawer
        item={selected}
        open={Boolean(selected)}
        agentName={
          selectedAgent?.name ||
          selectedAgent?.id ||
          t('agentCalendar.unassigned')
        }
        onClose={closeDrawer}
        language={language}
        onDelete={deleteOccurrence}
        deleting={deleting}
      />
    </Box>
  );
}
