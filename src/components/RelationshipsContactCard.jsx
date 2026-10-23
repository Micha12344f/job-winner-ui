import { useState } from 'react';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import StatusBadge from './common/StatusBadge';

const RELATIONSHIP_TONES = {
  recruiter: 'active',
  hiring_manager: 'open',
  employee: 'ghosted',
  referral: 'open',
  other: 'rejected',
};

export default function RelationshipsContactCard({
  contact,
  onDelete,
  loadTimeline: fetchTimeline,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadTimeline = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setBusy(true);
    try {
      const interactions = await fetchTimeline(contact.id);
      setTimeline(interactions);
      setExpanded(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      component="article"
      sx={{
        p: 2,
        gap: 1,
        display: 'flex',
        flexDirection: 'column',
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
            component="h3"
            variant="subtitle1"
            sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}
          >
            {contact.name}
          </Typography>
          {contact.role && (
            <Typography variant="body2" color="text.secondary">
              {contact.role}
            </Typography>
          )}
        </Box>
        <StatusBadge
          tone={RELATIONSHIP_TONES[contact.relationship] || 'other'}
          label={contact.relationship || t('relationships.unknownRelationship')}
        />
      </Stack>
      {contact.email && (
        <Typography variant="body2" color="text.secondary">
          {contact.email}
        </Typography>
      )}
      {contact.next_action && (
        <Typography variant="body2" color="text.secondary">
          {t('relationships.nextAction')}: {contact.next_action}
          {contact.next_action_due && ` (${contact.next_action_due})`}
        </Typography>
      )}
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 'auto', pt: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<PersonOutlinedIcon />}
          onClick={loadTimeline}
          disabled={busy}
        >
          {expanded
            ? t('relationships.hideTimeline')
            : t('relationships.showTimeline')}
        </Button>
        <Button size="small" color="error" onClick={() => onDelete(contact.id)}>
          {t('relationships.delete')}
        </Button>
      </Stack>
      {expanded && timeline && (
        <Box sx={{ mt: 1, maxHeight: 200, overflowY: 'auto' }}>
          {timeline.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('relationships.noInteractions')}
            </Typography>
          ) : (
            timeline.map((item, i) => (
              <Box
                key={item.id || i}
                sx={{
                  py: 0.5,
                  borderBottom: i < timeline.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" gap={1} alignItems="center">
                  <Chip
                    size="small"
                    label={item.channel}
                    color={item.direction === 'inbound' ? 'success' : 'default'}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {item.acted_at?.slice(0, 10)} | {item.status}
                  </Typography>
                </Stack>
                {item.subject && (
                  <Typography variant="body2">{item.subject}</Typography>
                )}
              </Box>
            ))
          )}
        </Box>
      )}
    </Card>
  );
}
