import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
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
  documentId,
  groupDocumentsByCategory,
  listDocuments,
  markDocumentPrimary,
  mergeCategorySuggestions,
  patchDocument,
} from '../api/extClient';
import {
  ALLOWED_EXTENSIONS,
  deleteDocument,
  downloadUrl,
  formatFileSize,
  uploadDocument,
  validateUploadFile,
} from '../api/filesClient';
import useAsyncAction from '../hooks/useAsyncAction';
import useConfirmedAction from '../hooks/useConfirmedAction';
import DocumentCategoryField from './DocumentCategoryField';
import DocumentEditDialog from './DocumentEditDialog';
import ConfirmDialog from './common/ConfirmDialog';
import EmptyState from './common/EmptyState';
import Loading from './common/Loading';

const sectionHeadingSx = {
  mb: 1.5,
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'text.secondary',
};

const cardHeadingSx = { fontSize: '0.9375rem', fontWeight: 700, mb: 1.5 };

// Filename without its extension, used as the headline when the user leaves
// the headline blank.
export function fileHeadline(filename) {
  const base = String(filename ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'Document';
}

// One headline per selected file so a batch upload does not produce duplicate
// titles: the typed headline is used as a prefix.
export function headlineForFile(file, typedHeadline, total) {
  const typed = String(typedHeadline ?? '').trim();
  const base = fileHeadline(file?.name);
  if (total <= 1) return typed || base;
  return typed ? `${typed} — ${base}` : base;
}

// CV / document library shown inside the Profile dialog. Lists documents
// grouped by category, uploads one or many files without closing the dialog,
// edits metadata, marks one primary document per category and deletes with
// confirmation.
export default function CvLibrarySection({ open }) {
  const { t } = useTranslation();
  const headingId = useId();

  const [documents, setDocuments] = useState([]);
  const [categoryRows, setCategoryRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [files, setFiles] = useState([]);
  const [category, setCategory] = useState('');
  const [headline, setHeadline] = useState('');
  const [progress, setProgress] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await listDocuments();
      setDocuments(data.items);
      setCategoryRows(data.categories);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-read after an upload so new rows and category counts appear. A failure
  // keeps the rows already on screen.
  const refresh = useCallback(async () => {
    try {
      const data = await listDocuments();
      setDocuments(data.items);
      setCategoryRows(data.categories);
      setLoadError(false);
    } catch {
      // keep what we have
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const { run, pending } = useAsyncAction();
  const remove = useConfirmedAction({
    action: document => deleteDocument(documentId(document)),
    successMessage: t('documents.library.deleteSuccess'),
    errorMessage: t('documents.library.deleteError'),
    onSuccess: document =>
      setDocuments(previous =>
        previous.filter(item => documentId(item) !== documentId(document))
      ),
  });

  const groups = useMemo(
    () => groupDocumentsByCategory(documents),
    [documents]
  );
  const suggestions = useMemo(
    () => mergeCategorySuggestions(categoryRows),
    [categoryRows]
  );

  const describeProblem = ({ file, problem }) => {
    if (problem.code === 'type') {
      return t('documents.library.errors.type', {
        name: file.name,
        allowed: ALLOWED_EXTENSIONS.join(', '),
      });
    }
    if (problem.code === 'tooLarge') {
      return t('documents.library.errors.tooLarge', {
        name: file.name,
        size: formatFileSize(file.size),
        limit: formatFileSize(problem.limitBytes),
      });
    }
    return t('documents.library.errors.empty', { name: file.name });
  };

  const handleUpload = async event => {
    event.preventDefault();
    if (progress) return;
    if (files.length === 0) {
      setFeedback({
        severity: 'error',
        message: t('documents.library.errors.missingFile'),
      });
      return;
    }

    const invalid = files
      .map(file => ({ file, problem: validateUploadFile(file) }))
      .find(entry => entry.problem);
    if (invalid) {
      setFeedback({ severity: 'error', message: describeProblem(invalid) });
      return;
    }

    const categoryValue = category.trim() || 'General';
    const typedHeadline = headline.trim();
    setFeedback(null);
    setProgress({ done: 0, total: files.length });

    const failures = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const label = headlineForFile(file, typedHeadline, files.length);
      try {
        await uploadDocument({
          file,
          label,
          category: categoryValue,
          headline: label,
        });
      } catch (error) {
        failures.push({ file, error });
      }
      setProgress({ done: index + 1, total: files.length });
    }

    setProgress(null);
    setFiles([]);
    if (fileInput.current) fileInput.current.value = '';

    if (failures.length === 0) {
      setHeadline('');
      setFeedback({
        severity: 'success',
        message: t('documents.uploadSuccess'),
      });
    } else if (failures.length === 1) {
      setFeedback({
        severity: 'error',
        message: failures[0].error?.message || t('documents.uploadError'),
      });
    } else {
      setFeedback({
        severity: 'error',
        message: t('documents.library.errors.uploadSomeFailed', {
          count: failures.length,
        }),
      });
    }

    await refresh();
  };

  const makePrimary = async document => {
    const id = documentId(document);
    if (!id) return;
    await run(() => patchDocument(id, { is_primary: true }), {
      successMessage: t('documents.library.primarySuccess'),
      errorMessage: t('documents.library.primaryError'),
      onSuccess: updated =>
        setDocuments(previous =>
          markDocumentPrimary(
            previous,
            updated ?? { ...document, is_primary: 1 }
          )
        ),
    });
  };

  const saveEdit = async values => {
    if (!editing) return;
    const id = documentId(editing);
    setSavingEdit(true);
    const outcome = await run(() => patchDocument(id, values), {
      successMessage: t('documents.library.editSuccess'),
      errorMessage: t('documents.library.editError'),
    });
    if (outcome.ok) {
      const updated = outcome.result;
      setDocuments(previous =>
        previous.map(item =>
          documentId(item) === id
            ? {
                ...item,
                ...values,
                ...(updated && typeof updated === 'object' ? updated : {}),
              }
            : item
        )
      );
      setEditing(null);
    }
    setSavingEdit(false);
  };

  const busy = pending || savingEdit;
  const pendingName =
    remove.item?.headline ||
    remove.item?.original_filename ||
    remove.item?.file_id ||
    '';

  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}
    >
      <Typography id={headingId} component="h3" sx={sectionHeadingSx}>
        {t('documents.library.title')}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 2, mt: -0.5 }}
      >
        {t('documents.library.subtitle')}
      </Typography>

      <Paper
        component="form"
        onSubmit={handleUpload}
        noValidate
        variant="outlined"
        sx={{ p: 2, borderRadius: 3 }}
      >
        <Typography component="h4" sx={cardHeadingSx}>
          {t('documents.library.uploadTitle')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          }}
        >
          <DocumentCategoryField
            value={category}
            onChange={setCategory}
            suggestions={suggestions}
            label={t('documents.library.category')}
            helperText={t('documents.library.categoryHelper')}
          />
          <TextField
            label={t('documents.library.headline')}
            placeholder={t('documents.library.headlinePlaceholder')}
            value={headline}
            onChange={event => setHeadline(event.target.value)}
            size="small"
            slotProps={{ htmlInput: { maxLength: 200 } }}
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
              {files.length > 0
                ? t('documents.library.filesSelected', { count: files.length })
                : t('documents.library.chooseFiles')}
            </Box>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept={ALLOWED_EXTENSIONS.join(',')}
              aria-label={t('documents.library.chooseFiles')}
              onChange={event => {
                setFiles(Array.from(event.target.files ?? []));
                setFeedback(null);
              }}
            />
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<CloudUploadRoundedIcon />}
            disabled={files.length === 0 || Boolean(progress)}
          >
            {progress ? t('documents.uploading') : t('documents.upload')}
          </Button>
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1.25 }}
        >
          {t('documents.allowedTypes')}
        </Typography>

        {progress && (
          <Box role="status" aria-live="polite" sx={{ mt: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={Math.round((progress.done / progress.total) * 100)}
              sx={{ borderRadius: 1 }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.5 }}
            >
              {t('documents.library.uploadProgress', progress)}
            </Typography>
          </Box>
        )}

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

      <Box sx={{ mt: 2.5 }}>
        <Typography component="h4" sx={cardHeadingSx}>
          {t('documents.library.listTitle')}
        </Typography>

        {loading && documents.length === 0 && <Loading />}
        {loading && documents.length > 0 && (
          <LinearProgress sx={{ borderRadius: 1 }} />
        )}

        {!loading && loadError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={load}>
                {t('documents.library.retry')}
              </Button>
            }
          >
            {t('documents.loadError')}
          </Alert>
        )}

        {!loading && !loadError && groups.length === 0 && (
          <EmptyState
            icon={<DescriptionOutlinedIcon />}
            title={t('documents.library.emptyTitle')}
            description={t('documents.library.empty')}
          />
        )}

        {!loading &&
          !loadError &&
          groups.map((group, groupIndex) => {
            const groupHeadingId = `document-category-${groupIndex}`;
            return (
              <Box
                key={group.category}
                component="section"
                aria-labelledby={groupHeadingId}
                sx={{ '& + &': { mt: 2.5 } }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  <Typography
                    id={groupHeadingId}
                    component="h5"
                    sx={{
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      lineHeight: 1.4,
                    }}
                  >
                    {group.category}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={t('documents.library.docCount', {
                      count: group.count,
                    })}
                  />
                </Box>
                <List dense disablePadding aria-labelledby={groupHeadingId}>
                  {group.items.map(document => {
                    const id = documentId(document);
                    const name =
                      document.headline ||
                      document.original_filename ||
                      document.file_id ||
                      t('documents.library.untitled');
                    const isPrimary = Boolean(document.is_primary);
                    return (
                      <ListItem
                        key={id}
                        divider
                        sx={{
                          px: 0,
                          py: 1.25,
                          gap: 1.5,
                          alignItems: 'flex-start',
                          flexWrap: { xs: 'wrap', sm: 'nowrap' },
                        }}
                      >
                        <ListItemText
                          sx={{ minWidth: 0, my: 0, pr: { sm: 1 } }}
                          slotProps={{
                            primary: { component: 'div' },
                            secondary: { component: 'div' },
                          }}
                          primary={
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                flexWrap: 'wrap',
                                minWidth: 0,
                              }}
                            >
                              <Box
                                component="a"
                                href={downloadUrl(id)}
                                sx={{
                                  color: 'text.primary',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  '&:hover': { textDecoration: 'underline' },
                                }}
                              >
                                {name}
                              </Box>
                              {isPrimary && (
                                <Chip
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  icon={<StarRoundedIcon />}
                                  label={t('documents.library.primaryBadge')}
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            <Box
                              component="span"
                              sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                columnGap: 0.75,
                                rowGap: 0.25,
                                mt: 0.5,
                                color: 'text.secondary',
                                typography: 'caption',
                              }}
                            >
                              {document.original_filename && (
                                <Box
                                  component="span"
                                  sx={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: { xs: '100%', sm: 220 },
                                  }}
                                >
                                  {document.original_filename}
                                </Box>
                              )}
                              <span aria-hidden>·</span>
                              <span>
                                {formatFileSize(
                                  document.size_bytes ?? document.size
                                )}
                              </span>
                              <span aria-hidden>·</span>
                              <span>
                                {t('documents.uploaded', {
                                  date: new Date(
                                    document.uploaded_at
                                  ).toLocaleDateString(),
                                })}
                              </span>
                              {document.notes && (
                                <Box
                                  component="span"
                                  sx={{
                                    display: 'block',
                                    width: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {document.notes}
                                </Box>
                              )}
                            </Box>
                          }
                        />
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{
                            flexShrink: 0,
                            ml: { sm: 'auto' },
                            alignSelf: { xs: 'flex-end', sm: 'flex-start' },
                          }}
                        >
                          <Tooltip title={t('documents.download', { name })}>
                            <IconButton
                              component="a"
                              href={downloadUrl(id)}
                              aria-label={t('documents.download', { name })}
                              size="small"
                            >
                              <DownloadRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip
                            title={t('documents.library.edit', { name })}
                          >
                            <IconButton
                              aria-label={t('documents.library.edit', {
                                name,
                              })}
                              onClick={() => setEditing(document)}
                              size="small"
                              disabled={busy || remove.pending}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!isPrimary && (
                            <Tooltip
                              title={t('documents.library.makePrimary', {
                                name,
                              })}
                            >
                              <IconButton
                                aria-label={t('documents.library.makePrimary', {
                                  name,
                                })}
                                onClick={() => makePrimary(document)}
                                size="small"
                                disabled={busy || remove.pending}
                              >
                                <StarOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title={t('documents.delete', { name })}>
                            <IconButton
                              aria-label={t('documents.delete', { name })}
                              onClick={() => remove.request(document)}
                              size="small"
                              color="error"
                              disabled={busy || remove.pending}
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            );
          })}
      </Box>

      <DocumentEditDialog
        open={Boolean(editing)}
        document={editing}
        suggestions={suggestions}
        saving={savingEdit || pending}
        onCancel={() => setEditing(null)}
        onSave={saveEdit}
      />

      <ConfirmDialog
        {...remove.dialogProps}
        title={t('documents.confirmTitle')}
        content={t('documents.confirmContent', { name: pendingName })}
      />
    </Box>
  );
}
