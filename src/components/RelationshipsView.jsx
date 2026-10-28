import { useCallback, useEffect, useMemo, useState } from 'react';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@apollo/client/react';
import { useTranslation } from 'react-i18next';
import { listAllLeads } from '../api/leadsClient';
import { GET_ALL_INTERVIEWS, GET_JOB_APPLICATIONS } from '../graphql/query';
import EmptyState from './common/EmptyState';
import Loading from './common/Loading';
import StatusBadge from './common/StatusBadge';

// A job counts as applied only when there is submission evidence: a recorded
// applied date, a post-submission status, or an interview. `active` on its own
// is not evidence, because a row can be marked active before anything has been
// submitted, and `open` rows are unsubmitted by definition.
const SUBMITTED_STATUSES = new Set(['applied', 'ghosted', 'rejected']);

const LEAD_STATUS_TONES = {
  identified: 'all',
  contacted: 'open',
  replied: 'ghosted',
  meeting: 'active',
  referred: 'active',
  closed: 'rejected',
};

export function hasSubmissionEvidence(application, interviewedIds = new Set()) {
  if (!application) return false;
  if (application.appliedDate) return true;
  if (interviewedIds.has(String(application.id))) return true;
  return SUBMITTED_STATUSES.has(String(application.status || '').toLowerCase());
}

function LeadCard({ lead }) {
  const { t } = useTranslation();
  const contactedOn = lead.last_contact_at?.slice(0, 10);

  return (
    <Card
      component="article"
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        height: '100%',
      }}
    >
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h4"
            variant="subtitle1"
            sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}
          >
            {lead.name}
          </Typography>
          {lead.role && (
            <Typography variant="body2" color="text.secondary">
              {lead.role}
            </Typography>
          )}
        </Box>
        <StatusBadge
          tone={LEAD_STATUS_TONES[lead.status] || 'other'}
          label={lead.status || t('relationships.unknownStatus')}
        />
      </Stack>
      {lead.email && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ overflowWrap: 'anywhere' }}
        >
          <a href={`mailto:${lead.email}`}>{lead.email}</a>
        </Typography>
      )}
      {contactedOn && (
        <Typography variant="caption" color="text.secondary">
          {t('relationships.lastContact', { date: contactedOn })}
        </Typography>
      )}
      {lead.next_action && (
        <Typography variant="body2" color="text.secondary">
          {t('relationships.nextAction')}: {lead.next_action}
          {lead.next_action_due && ` (${lead.next_action_due})`}
        </Typography>
      )}
      {lead.notes && (
        <Typography variant="caption" color="text.secondary">
          {lead.notes.length > 220
            ? `${lead.notes.slice(0, 220)}…`
            : lead.notes}
        </Typography>
      )}
      {lead.linkedin_url && (
        <Button
          size="small"
          variant="text"
          href={lead.linkedin_url}
          target="_blank"
          rel="noreferrer"
          sx={{ alignSelf: 'flex-start', mt: 'auto' }}
        >
          {t('relationships.openProfile')}
        </Button>
      )}
    </Card>
  );
}

export default function RelationshipsView() {
  const { t } = useTranslation();
  const {
    data: applicationData,
    loading: applicationsLoading,
    error: applicationsError,
    refetch: refetchApplications,
  } = useQuery(GET_JOB_APPLICATIONS);
  const { data: interviewData } = useQuery(GET_ALL_INTERVIEWS);

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState(null);

  const loadLeads = useCallback(async () => {
    try {
      setLeads(await listAllLeads());
      setLeadsError(null);
    } catch (error) {
      setLeadsError(error);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
    const timer = window.setInterval(loadLeads, 60000);
    return () => window.clearInterval(timer);
  }, [loadLeads]);

  const interviewedIds = useMemo(
    () =>
      new Set(
        (interviewData?.allInterview ?? []).map(interview =>
          String(interview.jobApplicationId)
        )
      ),
    [interviewData]
  );

  const groups = useMemo(() => {
    const applications = applicationData?.allJobApplication ?? [];
    return applications
      .filter(application => hasSubmissionEvidence(application, interviewedIds))
      .map(application => ({
        application,
        leads: leads.filter(
          lead =>
            lead.application_id != null &&
            String(lead.application_id) === String(application.id)
        ),
      }))
      .filter(group => group.leads.length > 0)
      .sort((a, b) =>
        String(b.application.appliedDate ?? '').localeCompare(
          String(a.application.appliedDate ?? '')
        )
      );
  }, [applicationData, leads, interviewedIds]);

  const contactCount = groups.reduce(
    (count, group) => count + group.leads.length,
    0
  );
  const loading = (applicationsLoading || leadsLoading) && groups.length === 0;
  const error = applicationsError || leadsError;

  const refresh = async () => {
    setLeadsLoading(true);
    await Promise.all([refetchApplications(), loadLeads()]);
  };

  return (
    <Container component="main" maxWidth="lg" sx={{ pt: 3, pb: 4 }}>
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography component="h2" variant="h5">
            {t('relationships.tab')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('relationships.appliedOnlySubtitle')}
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={refresh}
          disabled={leadsLoading}
          size="small"
        >
          {t('relationships.refresh')}
        </Button>
      </Stack>

      {!loading && !error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('relationships.summary', {
            jobs: groups.length,
            contacts: contactCount,
          })}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('relationships.loadError')}
        </Alert>
      )}

      {loading ? (
        <Loading />
      ) : groups.length > 0 ? (
        groups.map(({ application, leads: applicationLeads }) => (
          <Box key={application.id} sx={{ mb: 3 }}>
            <Stack
              direction="row"
              alignItems="center"
              flexWrap="wrap"
              gap={1}
              sx={{ mb: 1 }}
            >
              <BusinessOutlinedIcon fontSize="small" color="action" />
              <Typography variant="h6">
                {application.companyName || t('relationships.unknownCompany')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {application.jobTitle}
              </Typography>
              <Chip size="small" label={application.status} />
              <Typography variant="caption" color="text.secondary">
                {application.appliedDate
                  ? t('relationships.appliedOn', {
                      date: application.appliedDate,
                    })
                  : t('relationships.appliedDateUnknown')}
              </Typography>
            </Stack>
            <Grid container spacing={2}>
              {applicationLeads.map(lead => (
                <Grid key={lead.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <LeadCard lead={lead} />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))
      ) : (
        !error && (
          <EmptyState
            icon={<BusinessOutlinedIcon />}
            title={t('relationships.emptyTitle')}
            description={t('relationships.emptyDescription')}
          />
        )
      )}
    </Container>
  );
}
