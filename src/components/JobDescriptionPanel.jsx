import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { getJobDescription } from '../api/leadsClient';

// Collapsible view of the full posting text the backend stored for this
// application (/ext/jd). The short evidence note stays in the core
// Description field above; this panel never writes back to it.
//
// Loads on first expand, and treats a 404 as "nothing stored yet" rather than
// an error, because most applications have no fetched description.
export default function JobDescriptionPanel({ applicationId }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // Bumped by Retry, which is the only way to ask for a second attempt.
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState({ status: 'idle', data: null });
  const contentId = useId();
  const summaryId = useId();

  useEffect(() => {
    if (!expanded || !applicationId) return undefined;
    let active = true;
    setRequest({ status: 'loading', data: null });
    getJobDescription(applicationId)
      .then(data => {
        if (!active) return;
        setRequest({ status: data ? 'loaded' : 'empty', data });
      })
      .catch(() => {
        if (active) setRequest({ status: 'error', data: null });
      });
    return () => {
      active = false;
    };
  }, [expanded, applicationId, attempt]);

  if (!applicationId) return null;

  const { status, data } = request;

  const renderBody = () => {
    if (status === 'loading' || status === 'idle') {
      return (
        <Typography variant="body2" color="text.secondary">
          {t('common.loading')}
        </Typography>
      );
    }
    if (status === 'error') {
      return (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setAttempt(count => count + 1)}
            >
              {t('common.retry')}
            </Button>
          }
        >
          {t('jobDescription.loadError')}
        </Alert>
      );
    }
    if (status === 'empty') {
      return (
        <Box
          role="status"
          sx={{
            px: 2,
            py: 2.5,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 3,
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
          }}
        >
          <DescriptionOutlinedIcon
            aria-hidden
            sx={{ color: 'text.disabled', mt: 0.25 }}
          />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('jobDescription.emptyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('jobDescription.emptyDescription')}
            </Typography>
          </Box>
        </Box>
      );
    }

    const characterCount =
      data.char_count ??
      (typeof data.full_text === 'string' ? data.full_text.length : 0);

    return (
      <Box>
        {data.summary && (
          <Box
            sx={{
              mb: 2,
              p: 1.75,
              borderRadius: 3,
              bgcolor: theme =>
                `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mb: 0.5,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'primary.main',
              }}
            >
              {t('jobDescription.summary')}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {data.summary}
            </Typography>
          </Box>
        )}

        {data.source_url && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: 0.75,
              mb: 1.5,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {t('jobDescription.source')}
            </Typography>
            <Link
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={{
                wordBreak: 'break-all',
                maxWidth: '100%',
                display: 'inline-block',
              }}
            >
              {data.source_url}
            </Link>
          </Box>
        )}

        <Box
          tabIndex={0}
          aria-label={t('jobDescription.textLabel')}
          sx={{
            maxHeight: 340,
            overflowY: 'auto',
            pr: 1.5,
            fontSize: '0.875rem',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'text.primary',
          }}
        >
          {data.full_text}
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1.5 }}
        >
          {data.fetched_at && (
            <>
              <Box component="span">
                {t('jobDescription.fetched', {
                  date: new Date(data.fetched_at).toLocaleDateString(
                    i18n.resolvedLanguage
                  ),
                })}
              </Box>
              <Box component="span" aria-hidden sx={{ mx: 0.75 }}>
                ·
              </Box>
            </>
          )}
          <Box component="span">
            {t('jobDescription.characters', {
              chars: new Intl.NumberFormat(i18n.resolvedLanguage).format(
                characterCount
              ),
            })}
          </Box>
        </Typography>
      </Box>
    );
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={(event, next) => setExpanded(next)}
      disableGutters
      elevation={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'transparent',
        backgroundImage: 'none',
        '&:before': { display: 'none' },
        '&.Mui-expanded': { my: 0 },
      }}
    >
      <AccordionSummary
        id={summaryId}
        aria-controls={contentId}
        expandIcon={<ExpandMoreRoundedIcon />}
        sx={{ px: 2, minHeight: 56 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
            {t('jobDescription.title')}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            {t('jobDescription.subtitle')}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails id={contentId} sx={{ px: 2, pt: 0, pb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            alignItems: 'flex-start',
            mb: 1.75,
          }}
        >
          <InfoOutlinedIcon
            aria-hidden
            sx={{ fontSize: 16, color: 'text.disabled', mt: 0.25 }}
          />
          <Typography variant="caption" color="text.secondary">
            {t('jobDescription.evidenceNote')}
          </Typography>
        </Box>
        {renderBody()}
      </AccordionDetails>
    </Accordion>
  );
}
