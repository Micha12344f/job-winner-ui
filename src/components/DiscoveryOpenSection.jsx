import RefreshIcon from '@mui/icons-material/Refresh';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import { useTranslation } from 'react-i18next';
import useDiscoveredJobs from '../hooks/useDiscoveredJobs';
import DiscoveryJobCard from './DiscoveryJobCard';
import EmptyState from './common/EmptyState';
import Loading from './common/Loading';

export default function DiscoveryOpenSection() {
  const { t, i18n } = useTranslation();
  const {
    jobs,
    sourcesHealth,
    loading,
    error,
    refresh,
    dismiss,
    markApplied,
    crawl,
  } = useDiscoveredJobs();
  const sorted = [...jobs].sort((a, b) => {
    if (!a.posted_at) return b.posted_at ? 1 : 0;
    if (!b.posted_at) return -1;
    return new Date(b.posted_at) - new Date(a.posted_at);
  });
  const lastCrawl = sourcesHealth
    .map(source => source.last_success_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const errors = sourcesHealth.flatMap(source =>
    source.last_error
      ? [`${source.title || source.source_type}: ${source.last_error}`]
      : []
  );
  return (
    <Container component="main" maxWidth="lg" sx={{ pt: 3, pb: 4 }}>
      <Alert
        severity={errors.length ? 'warning' : 'info'}
        sx={{ mb: 2 }}
        action={
          <Button
            color="inherit"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={crawl}
          >
            {t('discovery.crawlNow')}
          </Button>
        }
      >
        <AlertTitle>{t('discovery.sourcesHealth')}</AlertTitle>
        {t('discovery.lastCrawl', {
          date: lastCrawl
            ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(lastCrawl))
            : t('discovery.never'),
        })}
        {errors.length > 0 && (
          <ul>
            {errors.map(message => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </Alert>
      <Button sx={{ mb: 2 }} startIcon={<RefreshIcon />} onClick={refresh}>
        {t('discovery.refresh')}
      </Button>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('discovery.loadError')}
        </Alert>
      )}
      {loading && jobs.length === 0 ? (
        <Loading />
      ) : sorted.length ? (
        <Grid container spacing={2.5}>
          {sorted.map(job => (
            <Grid key={job.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <DiscoveryJobCard
                job={job}
                onDismiss={dismiss}
                onMarkApplied={markApplied}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        !error && (
          <EmptyState
            icon={<SearchOffIcon />}
            title={t('discovery.emptyTitle')}
            description={t('discovery.emptyDescription')}
          />
        )
      )}
    </Container>
  );
}
