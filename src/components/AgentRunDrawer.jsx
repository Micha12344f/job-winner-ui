import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { statusColor } from '../config/status';
import {
  RUN_STATUS_TONE,
  chipVariant,
  formatDuration,
  formatInstant,
  formatTime,
} from '../utils/agentCalendarUtil';

// One label/value row. Values stay selectable so an error trace can be copied.
function DetailRow({ label, children }) {
  if (!children) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline' }}>
      <Typography
        component="dt"
        variant="caption"
        color="text.secondary"
        sx={{ flexShrink: 0, width: 104 }}
      >
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {children}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Right-hand drawer with everything the feed knows about one run or scheduled
 * occurrence: job, instant, status, duration, error text and related rows.
 * @param {{item: object | null, agentName?: string, open: boolean, onClose: Function, language?: string}} props
 */
export default function AgentRunDrawer({
  item,
  agentName = '',
  open,
  onClose,
  language = 'en',
  onDelete,
  deleting = false,
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(null);
  const title = item?.jobName || t('agentCalendar.detail.title');
  const tone = RUN_STATUS_TONE[item?.status] ?? 'all';
  const outline = chipVariant(item?.kind) === 'outline';
  const duration = formatDuration(item?.durationMs);
  const statusLabel = t(`agentCalendar.status.${item?.status ?? 'unknown'}`);
  const scheduled = formatInstant(item?.scheduledAt, language);
  const started = formatInstant(item?.startedAt, language);
  const finished = formatInstant(item?.finishedAt, language);

  return (
    // Drawers default to zIndex.drawer (1200), which puts the drawer *under*
    // the calendar dialog (zIndex.modal, 1300) that opened it.
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: theme => theme.zIndex.modal + 1 }}
      slotProps={{
        paper: {
          sx: { width: { xs: '100%', sm: 400 }, p: 0 },
        },
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-run-drawer-title"
        data-testid="agent-run-drawer"
        sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            px: 2.5,
            py: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              id="agent-run-drawer-title"
              component="h2"
              sx={{
                fontSize: '1rem',
                fontWeight: 700,
                wordBreak: 'break-word',
              }}
            >
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('agentCalendar.detail.title')}
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            aria-label={t('common.close')}
            sx={{ color: 'text.secondary', borderRadius: 2.5, flexShrink: 0 }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        <Box sx={{ px: 2.5, py: 2, overflowY: 'auto' }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              data-status={item?.status ?? 'unknown'}
              data-variant={outline ? 'outline' : 'solid'}
              label={statusLabel}
              sx={{
                border: 1,
                borderColor: statusColor(tone, outline ? 'main' : 'solid'),
                bgcolor: outline ? 'transparent' : statusColor(tone, 'solid'),
                color: outline
                  ? statusColor(tone, 'text')
                  : statusColor(tone, 'solidText'),
              }}
            />
            {formatTime(item?.scheduledAt, language) && (
              <Chip
                size="small"
                variant="outlined"
                label={formatTime(item?.scheduledAt, language)}
              />
            )}
          </Stack>

          <Box component="dl" sx={{ display: 'grid', gap: 1.25, m: 0 }}>
            {agentName && (
              <DetailRow label={t('agentCalendar.detail.agent')}>
                {agentName}
              </DetailRow>
            )}
            <DetailRow label={t('agentCalendar.detail.job')}>
              {item?.jobName}
            </DetailRow>
            <DetailRow label={t('agentCalendar.detail.scheduled')}>
              {scheduled || t('agentCalendar.detail.none')}
            </DetailRow>
            <DetailRow label={t('agentCalendar.detail.status')}>
              {statusLabel}
            </DetailRow>
            <DetailRow label={t('agentCalendar.detail.duration')}>
              {duration || t('agentCalendar.detail.none')}
            </DetailRow>
            {started && (
              <DetailRow label={t('agentCalendar.detail.started')}>
                {started}
              </DetailRow>
            )}
            {finished && (
              <DetailRow label={t('agentCalendar.detail.finished')}>
                {finished}
              </DetailRow>
            )}
            <DetailRow label={t('agentCalendar.detail.detail')}>
              {item?.detail}
            </DetailRow>
          </Box>

          {item?.error && (
            <Box sx={{ mt: 2.5 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.75, fontWeight: 700 }}
              >
                {t('agentCalendar.detail.error')}
              </Typography>
              <Box
                data-testid="agent-run-error"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: 1,
                  borderColor: statusColor('rejected', 'soft'),
                  bgcolor: statusColor('rejected', 'soft'),
                  color: statusColor('rejected', 'text'),
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {item.error}
              </Box>
            </Box>
          )}

          {item?.related?.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.75, fontWeight: 700 }}
              >
                {t('agentCalendar.detail.related')}
              </Typography>
              <Stack divider={<Divider flexItem />} sx={{ gap: 0.75 }}>
                {item.related.map((entry, index) => (
                  <Box key={index} sx={{ py: 0.25 }}>
                    {entry.label && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {entry.label}
                      </Typography>
                    )}
                    <Typography
                      variant="body2"
                      sx={{ wordBreak: 'break-word' }}
                    >
                      {entry.value}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Box>

        {item?.kind === 'occurrence' && onDelete && (
          <Box
            sx={{
              px: 2.5,
              py: 2,
              borderTop: 1,
              borderColor: 'divider',
              mt: 'auto',
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap', gap: 1 }}
            >
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineRoundedIcon />}
                disabled={deleting || !item.skippable}
                onClick={() => setConfirm('one')}
              >
                {t('agentCalendar.delete.one')}
              </Button>
              <Button
                size="small"
                color="error"
                disabled={deleting}
                onClick={() => setConfirm('future')}
              >
                {t('agentCalendar.delete.future')}
              </Button>
            </Stack>
            {!item.skippable && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 1 }}
              >
                {t('agentCalendar.delete.agentDriven')}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* The drawer sits above theme.zIndex.modal, so the confirm dialog has
          to sit above the drawer or its own backdrop swallows the clicks. */}
      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        sx={{ zIndex: theme => theme.zIndex.modal + 2 }}
      >
        <DialogTitle>
          {confirm === 'future'
            ? t('agentCalendar.delete.futureTitle')
            : t('agentCalendar.delete.oneTitle')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirm === 'future'
              ? t('agentCalendar.delete.futureBody', {
                  job: item?.jobName || '',
                  when: formatInstant(item?.scheduledAt, language),
                })
              : t('agentCalendar.delete.oneBody', {
                  job: item?.jobName || '',
                  when: formatInstant(item?.scheduledAt, language),
                })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setConfirm(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            disabled={deleting}
            onClick={() => {
              const scope = confirm;
              setConfirm(null);
              onDelete?.(item, scope);
            }}
          >
            {t('agentCalendar.delete.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
