import { useCallback, useEffect, useMemo, useState } from 'react';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
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

function LeadRow({ lead }) {
  const { t } = useTranslation();
  const contactedOn = lead.last_contact_at?.slice(0, 10);
  const email = lead.email;

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={1}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}
          >
            {lead.name}
          </Typography>
          {lead.role && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
            >
              {lead.role}
            </Typography>
          )}
        </Box>
        <StatusBadge
          tone={LEAD_STATUS_TONES[lead.status] || 'other'}
          label={lead.status || t('relationships.unknownStatus')}
        />
      </Stack>

      {(email || contactedOn) && (
        <Stack
          direction="row"
          flexWrap="wrap"
          columnGap={2}
          rowGap={0.25}
          sx={{ mt: 0.5 }}
        >
          {email && (
            <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
              <a href={`mailto:${email}`}>{email}</a>
            </Typography>
          )}
          {contactedOn && (
            <Typography variant="caption" color="text.secondary">
              {t('relationships.lastContact', { date: contactedOn })}
            </Typography>
          )}
        </Stack>
      )}

      {lead.next_action && (
        <Typography variant="caption" color="text.secondary" display="block">
          {t('relationships.nextAction')}: {lead.next_action}
          {lead.next_action_due ? ` (${lead.next_action_due})` : ''}
        </Typography>
      )}

      {lead.linkedin_url && (
        <Typography variant="caption" display="block">
          <a href={lead.linkedin_url} target="_blank" rel="noreferrer">
            {t('relationships.openProfile')}
          </a>
        </Typography>
      )}
    </Box>
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
    <Container
      component="main"
      maxWidth="md"
      sx={{ pt: { xs: 2, sm: 3 }, pb: 4, px: { xs: 2, sm: 3 } }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        gap={1}
        sx={{ mb: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" variant="h6">
            {t('relationships.tab')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('relationships.appliedOnlySubtitle')}
          </Typography>
          {!loading && !error && (
            <Typography variant="caption" color="text.secondary">
              {t('relationships.summary', {
                jobs: groups.length,
                contacts: contactCount,
              })}
            </Typography>
          )}
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={refresh}
          disabled={leadsLoading}
          size="small"
          sx={{ flexShrink: 0 }}
        >
          {t('relationships.refresh')}
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('relationships.loadError')}
        </Alert>
      )}

      {loading ? (
        <Loading />
      ) : groups.length > 0 ? (
        <Stack spacing={1}>
          {groups.map(({ application, leads: applicationLeads }) => (
            <Accordion
              key={application.id}
              disableGutters
              elevation={0}
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon fontSize="small" />}
                sx={{
                  px: { xs: 1.5, sm: 2 },
                  py: 0.5,
                  '& .MuiAccordionSummary-content': { minWidth: 0, my: 1 },
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1, pr: 1 }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    flexWrap="wrap"
                    columnGap={1}
                    rowGap={0.5}
                  >
                    <BusinessOutlinedIcon fontSize="small" color="action" />
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}
                    >
                      {application.companyName ||
                        t('relationships.unknownCompany')}
                    </Typography>
                    <Chip size="small" label={application.status} />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t('relationships.contactCount', {
                        count: applicationLeads.length,
                      })}
                    />
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {application.jobTitle}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {application.appliedDate
                      ? t('relationships.appliedOn', {
                          date: application.appliedDate,
                        })
                      : t('relationships.appliedDateUnknown')}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ px: { xs: 1.5, sm: 2 }, pt: 0, pb: 1.5 }}>
                <Stack divider={<Divider flexItem />} spacing={1.25}>
                  {applicationLeads.map(lead => (
                    <LeadRow key={lead.id} lead={lead} />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
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
