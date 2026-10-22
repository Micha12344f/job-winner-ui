import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import AgentCalendar from './AgentCalendar';
import CustomDialog from './common/CustomDialog';

/**
 * App-level frame for the agent calendar, opened from the header actions.
 * The calendar only fetches once the dialog mounts, so opening the app never
 * calls the agent feeds.
 */
export default function AgentCalendarDialog({ open, handleClose }) {
  const { t } = useTranslation();

  return (
    <CustomDialog
      open={open}
      onClose={handleClose}
      title={t('agentCalendar.title')}
      subtitle={t('agentCalendar.subtitle')}
      maxWidth="lg"
    >
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          pt: 1.5,
          pb: 2.5,
          overflowY: 'auto',
        }}
      >
        <AgentCalendar />
      </Box>
    </CustomDialog>
  );
}
