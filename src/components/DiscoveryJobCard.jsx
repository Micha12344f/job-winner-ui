import { useState } from 'react';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from './common/ConfirmDialog';
import StatusBadge from './common/StatusBadge';

export default function DiscoveryJobCard({ job, onDismiss, onMarkApplied }) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const postedDate = job.posted_at
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        dateStyle: 'medium',
      }).format(new Date(job.posted_at))
    : t('discovery.unknownDate');
  const apply = async () => {
    const applicationId = window.prompt(t('discovery.applicationIdPrompt'));
    if (!applicationId) return;
    setBusy(true);
    try {
      await onMarkApplied(job.id, applicationId);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card
        component="article"
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          p: 2.25,
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          gap={1}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h2"
              variant="h6"
              sx={{ overflowWrap: 'anywhere' }}
            >
              {job.company || t('discovery.unknownCompany')}
            </Typography>
            <Typography color="text.secondary">{job.title}</Typography>
          </Box>
          <StatusBadge
            tone="open"
            label={job.source_board || job.source_type || t('discovery.source')}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {job.location || t('discovery.locationUnknown')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('discovery.posted', {
            date: postedDate,
            precision:
              job.posted_at_precision || t('discovery.precisionUnknown'),
          })}
        </Typography>
        {job.closing_at && (
          <Typography variant="body2" color="text.secondary">
            {t('discovery.closes', {
              date: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                dateStyle: 'medium',
              }).format(new Date(job.closing_at)),
            })}
          </Typography>
        )}
        {job.score != null && (
          <Chip
            size="small"
            label={t('discovery.score', { score: job.score })}
            sx={{ alignSelf: 'flex-start' }}
          />
        )}
        {job.jd_summary && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
            }}
          >
            {job.jd_summary}
          </Typography>
        )}
        <Stack
          direction="row"
          flexWrap="wrap"
          gap={1}
          sx={{ mt: 'auto', pt: 1 }}
        >
          <Button
            component={Link}
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon />}
          >
            {t('discovery.openLink')}
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => setConfirming(true)}
          >
            {t('discovery.dismiss')}
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<WorkOutlineIcon />}
            disabled={busy}
            onClick={apply}
          >
            {t('discovery.markApplied')}
          </Button>
        </Stack>
      </Card>
      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await onDismiss(job.id);
            setConfirming(false);
          } finally {
            setBusy(false);
          }
        }}
        title={t('discovery.dismissTitle')}
        content={t('discovery.dismissConfirm', { title: job.title })}
      />
    </>
  );
}
