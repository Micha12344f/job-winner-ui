import { useCallback, useEffect, useRef, useState } from 'react';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import {
  ALLOWED_EXTENSIONS,
  deleteDocument,
  downloadUrl,
  formatFileSize,
  listFiles,
  uploadDocument,
} from '../api/filesClient';
import ConfirmDialog from './common/ConfirmDialog';
import CustomDialog from './common/CustomDialog';
import EmptyState from './common/EmptyState';

// CV / cover-letter library stored on the Job Winner server. Lists what is
// stored, uploads new documents, and deletes with confirmation.
export default function DocumentsDialog({ open, handleClose }) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [label, setLabel] = useState('');
  const [jobApplicationId, setJobApplicationId] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setDocuments(await listFiles());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    setLoadError(false);
    listFiles()
      .then(rows => {
        if (active) setDocuments(rows);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const resetForm = () => {
    setLabel('');
    setJobApplicationId('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = async event => {
    event.preventDefault();
    if (!file || !label.trim() || uploading) return;
    setUploading(true);
    setFeedback(null);
    try {
      await uploadDocument({ file, label: label.trim(), jobApplicationId });
      resetForm();
      setFeedback({
        severity: 'success',
        message: t('documents.uploadSuccess'),
      });
      await load();
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error?.message || t('documents.uploadError'),
      });
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteDocument(pendingDelete.id);
      setPendingDelete(null);
      setFeedback({
        severity: 'success',
        message: t('documents.deleteSuccess'),
      });
      await load();
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error?.message || t('documents.deleteError'),
      });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const selectedName = file ? file.name : '';

  return (
    <>
      <CustomDialog
        open={open}
        onClose={handleClose}
        onCancel={handleClose}
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
        maxWidth="md"
      >
        <Box
          sx={{
            px: { xs: 2, sm: 3 },
            pb: 2.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          <Paper
            component="form"
            onSubmit={submit}
            noValidate
            variant="outlined"
            sx={{ p: 2, borderRadius: 3 }}
          >
            <Typography
              component="h3"
              sx={{ fontSize: '0.9375rem', fontWeight: 700, mb: 1.5 }}
            >
              {t('documents.uploadTitle')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' },
              }}
            >
              <TextField
                label={t('documents.label')}
                placeholder={t('documents.labelPlaceholder')}
                value={label}
                onChange={event => setLabel(event.target.value)}
                size="small"
                required
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
              <TextField
                label={t('documents.jobApplicationId')}
                value={jobApplicationId}
                onChange={event => setJobApplicationId(event.target.value)}
                size="small"
                slotProps={{
                  htmlInput: { maxLength: 64, inputMode: 'numeric' },
                }}
              />
            </Box>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                mt: 1.75,
                alignItems: 'center',
                flexWrap: 'wrap',
                rowGap: 1,
              }}
            >
              <Button
                component="label"
                variant="outlined"
                startIcon={<AttachFileRoundedIcon />}
                sx={{ maxWidth: '100%' }}
              >
                <Box
                  component="span"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedName || t('documents.chooseFile')}
                </Box>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept={ALLOWED_EXTENSIONS.join(',')}
                  aria-label={t('documents.chooseFile')}
                  onChange={event => {
                    setFile(event.target.files?.[0] ?? null);
                    setFeedback(null);
                  }}
                />
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={<CloudUploadRoundedIcon />}
                disabled={!file || !label.trim() || uploading}
              >
                {uploading ? t('documents.uploading') : t('documents.upload')}
              </Button>
            </Stack>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1.25 }}
            >
              {t('documents.allowedTypes')}
            </Typography>
            {feedback && (
              <Alert
                severity={feedback.severity}
                onClose={() => setFeedback(null)}
                sx={{ mt: 1.5 }}
              >
                {feedback.message}
              </Alert>
            )}
          </Paper>

          <Box>
            <Typography
              component="h3"
              sx={{ fontSize: '0.9375rem', fontWeight: 700, mb: 1.25 }}
            >
              {t('documents.listTitle')}
            </Typography>
            {loading && <LinearProgress sx={{ borderRadius: 1 }} />}
            {!loading && loadError && (
              <Alert severity="error">{t('documents.loadError')}</Alert>
            )}
            {!loading && !loadError && documents.length === 0 && (
              <EmptyState
                icon={<DescriptionOutlinedIcon />}
                title={t('documents.emptyTitle')}
                description={t('documents.empty')}
              />
            )}
            {!loading && !loadError && documents.length > 0 && (
              <List dense disablePadding aria-label={t('documents.listTitle')}>
                {documents.map(item => {
                  const name = item.label || item.original_filename;
                  return (
                    <ListItem
                      key={item.id}
                      divider
                      sx={{ px: 0, gap: 1.5, alignItems: 'flex-start' }}
                      secondaryAction={
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title={t('documents.download', { name })}>
                            <IconButton
                              component="a"
                              href={downloadUrl(item.id)}
                              aria-label={t('documents.download', { name })}
                              size="small"
                            >
                              <DownloadRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('documents.delete', { name })}>
                            <IconButton
                              aria-label={t('documents.delete', { name })}
                              onClick={() => setPendingDelete(item)}
                              size="small"
                              color="error"
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      }
                    >
                      <ListItemText
                        sx={{ pr: 10 }}
                        primary={
                          <Box
                            component="a"
                            href={downloadUrl(item.id)}
                            sx={{
                              color: 'text.primary',
                              fontWeight: 600,
                              textDecoration: 'none',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            {name}
                          </Box>
                        }
                        secondary={
                          <Box
                            component="span"
                            sx={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 1,
                              mt: 0.5,
                            }}
                          >
                            <span>{formatFileSize(item.size)}</span>
                            <span aria-hidden>·</span>
                            <span>
                              {t('documents.uploaded', {
                                date: new Date(
                                  item.uploaded_at
                                ).toLocaleDateString(),
                              })}
                            </span>
                            {item.job_application_id && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={t('documents.jobApplication', {
                                  id: item.job_application_id,
                                })}
                              />
                            )}
                            {item.original_filename && (
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: 240,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.original_filename}
                              </Typography>
                            )}
                          </Box>
                        }
                        slotProps={{ secondary: { component: 'div' } }}
                      />
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Box>
        </Box>
      </CustomDialog>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={t('documents.confirmTitle')}
        content={t('documents.confirmContent', {
          name: pendingDelete?.label || pendingDelete?.original_filename || '',
        })}
      />
    </>
  );
}
