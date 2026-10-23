import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import useRelationships from '../hooks/useRelationships';
import RelationshipsContactCard from './RelationshipsContactCard';
import EmptyState from './common/EmptyState';
import Loading from './common/Loading';

export default function RelationshipsView() {
  const { t } = useTranslation();
  const {
    companies,
    contacts,
    loading,
    error,
    refresh,
    updateContact,
    deleteContact,
    getTimeline,
  } = useRelationships();

  const contactsByCompany = contacts.reduce((acc, contact) => {
    const key = contact.company_id ?? 'standalone';
    if (!acc[key]) acc[key] = [];
    acc[key].push(contact);
    return acc;
  }, {});

  const standaloneContacts = contactsByCompany.standalone ?? [];

  const renderContactCard = contact => (
    <Grid key={contact.id} size={{ xs: 12, sm: 6, md: 4 }}>
      <RelationshipsContactCard
        contact={contact}
        onUpdate={updateContact}
        onDelete={deleteContact}
        loadTimeline={getTimeline}
      />
    </Grid>
  );

  return (
    <Container component="main" maxWidth="lg" sx={{ pt: 3, pb: 4 }}>
      <Alert
        severity="info"
        sx={{ mb: 2 }}
        action={
          <Button
            color="inherit"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={refresh}
          >
            {t('relationships.refresh')}
          </Button>
        }
      >
        <Typography variant="body2">
          {t('relationships.summary', {
            companies: companies.length,
            contacts: contacts.length,
          })}
        </Typography>
      </Alert>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('relationships.loadError')}
        </Alert>
      )}
      {loading && companies.length === 0 && contacts.length === 0 ? (
        <Loading />
      ) : companies.length > 0 || standaloneContacts.length > 0 ? (
        <>
          {companies.map(company => (
            <Box key={company.id} sx={{ mb: 3 }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
                <BusinessOutlinedIcon fontSize="small" color="action" />
                <Typography variant="h6">{company.name}</Typography>
                {company.industry && (
                  <Typography variant="caption" color="text.secondary">
                    {company.industry}
                  </Typography>
                )}
                <Chip size="small" label={company.contact_count ?? 0} />
              </Stack>
              {company.rationale && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  {company.rationale}
                </Typography>
              )}
              <Grid container spacing={2}>
                {(contactsByCompany[company.id] ?? []).map(renderContactCard)}
              </Grid>
            </Box>
          ))}
          {standaloneContacts.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {t('relationships.standalone')}
              </Typography>
              <Grid container spacing={2}>
                {standaloneContacts.map(renderContactCard)}
              </Grid>
            </Box>
          )}
        </>
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
