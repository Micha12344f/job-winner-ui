import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { useTranslation } from 'react-i18next';
import CustomDialog from './common/CustomDialog';
import DocumentCategoryField from './DocumentCategoryField';

// Edits the metadata of a stored document: its category, headline and notes.
// The category is required (the API stores it NOT NULL); headline and notes
// may be cleared.
export default function DocumentEditDialog({
  open,
  document,
  suggestions = [],
  saving = false,
  onCancel,
  onSave,
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState('');
  const [headline, setHeadline] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategory(document?.category ?? '');
    setHeadline(document?.headline ?? '');
    setNotes(document?.notes ?? '');
  }, [open, document]);

  const name = document?.headline || document?.original_filename || '';
  const canSave = category.trim().length > 0;

  const handleSave = () => {
    if (!canSave || saving) return;
    onSave({
      category: category.trim(),
      headline: headline.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    });
  };

  return (
    <CustomDialog
      open={open}
      onClose={onCancel}
      onCancel={onCancel}
      onSave={handleSave}
      saveDisabled={!canSave}
      saving={saving}
      saveLabel={t('documents.library.editSave')}
      title={t('documents.library.editTitle')}
      subtitle={name}
      maxWidth="xs"
    >
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          pb: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <DocumentCategoryField
          value={category}
          onChange={setCategory}
          suggestions={suggestions}
          label={t('documents.library.category')}
          required
        />
        <TextField
          label={t('documents.library.headline')}
          value={headline}
          onChange={event => setHeadline(event.target.value)}
          size="small"
          fullWidth
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        <TextField
          label={t('documents.library.notes')}
          placeholder={t('documents.library.notesPlaceholder')}
          value={notes}
          onChange={event => setNotes(event.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={3}
        />
      </Box>
    </CustomDialog>
  );
}
