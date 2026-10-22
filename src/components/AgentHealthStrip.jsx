import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { statusColor } from '../config/status';

// One compact chip: a status dot plus "label: value". Tone names come from the
// job-status palette so the strip never invents colours.
function HealthChip({ tone = 'all', label, value, state }) {
  return (
    <Chip
      size="small"
      data-health-chip={state}
      aria-label={`${label}: ${value}`}
      icon={
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: statusColor(tone, 'main'),
          }}
        />
      }
      label={
        <>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {label}
          </Box>
          <Box component="span" sx={{ opacity: 0.85 }}>
            {` · ${value}`}
          </Box>
        </>
      }
      sx={{
        height: 24,
        border: 1,
        borderColor: statusColor(tone, 'soft'),
        bgcolor: statusColor(tone, 'soft'),
        color: statusColor(tone, 'text'),
        '& .MuiChip-icon': { ml: 1, mr: -0.25 },
      }}
    />
  );
}

const upState = up => (up === true ? 'up' : up === false ? 'down' : 'unknown');

const upTone = up =>
  up === true ? 'active' : up === false ? 'rejected' : 'all';

/**
 * Compact health strip for the sidecar and cron state, with session, budget
 * and halt state when the feed reports them. Every field is optional: the
 * strip shows what it has and never blocks the calendar.
 */
export default function AgentHealthStrip({
  health,
  loading = false,
  error = false,
}) {
  const { t } = useTranslation();
  const label = t('agentCalendar.health.label');

  if (loading && !health) {
    return (
      <Box
        role="status"
        aria-busy="true"
        aria-label={label}
        data-testid="agent-health-loading"
        sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}
      >
        {[88, 74, 96].map(width => (
          <Skeleton
            key={width}
            variant="rounded"
            width={width}
            height={24}
            sx={{ borderRadius: 999 }}
          />
        ))}
      </Box>
    );
  }

  if (!health) {
    return (
      <Box
        role="status"
        data-testid="agent-health-error"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
      >
        <Typography variant="caption" color="text.secondary">
          {error
            ? t('agentCalendar.health.unavailable')
            : t('agentCalendar.health.unknown')}
        </Typography>
      </Box>
    );
  }

  const { sidecar, cron, session, budget, halted } = health;
  const cronValue = [
    t(`agentCalendar.health.${cron.state}`),
    cron.jobs === null
      ? null
      : t('agentCalendar.health.jobs', { count: cron.jobs }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      role="group"
      aria-label={label}
      data-testid="agent-health-strip"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        flexWrap: 'wrap',
        mb: 2,
      }}
    >
      <HealthChip
        state={`sidecar-${upState(sidecar.up)}`}
        tone={upTone(sidecar.up)}
        label={t('agentCalendar.health.sidecar')}
        value={t(`agentCalendar.health.${upState(sidecar.up)}`)}
      />
      <HealthChip
        state={`cron-${cron.state}`}
        tone={
          cron.state === 'enabled'
            ? 'active'
            : cron.state === 'paused'
              ? 'ghosted'
              : 'all'
        }
        label={t('agentCalendar.health.cron')}
        value={cronValue}
      />
      {(session.up !== null || session.status) && (
        <HealthChip
          state={`session-${upState(session.up)}`}
          tone={upTone(session.up)}
          label={t('agentCalendar.health.session')}
          value={t(`agentCalendar.health.${upState(session.up)}`)}
        />
      )}
      {(budget.remainingPct !== null || budget.remaining) && (
        <HealthChip
          state="budget"
          tone={
            budget.remainingPct !== null && budget.remainingPct < 20
              ? 'ghosted'
              : 'all'
          }
          label={t('agentCalendar.health.budget')}
          value={
            budget.remainingPct !== null
              ? t('agentCalendar.health.remaining', {
                  value: Math.round(budget.remainingPct),
                })
              : budget.remaining
          }
        />
      )}
      {halted === true && (
        <HealthChip
          state="halted"
          tone="rejected"
          label={t('agentCalendar.health.halt')}
          value={t('agentCalendar.health.halted')}
        />
      )}
    </Box>
  );
}
