import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ConfirmDialog from '../common/ConfirmDialog';
import CustomDialog from '../common/CustomDialog';
import DialogFooter from '../common/DialogFooter';
import EmptyState from '../common/EmptyState';
import StatusBadge from '../common/StatusBadge';
import useAsyncAction from '../../hooks/useAsyncAction';
import useConfirmedAction from '../../hooks/useConfirmedAction';
import { formatCalendarDate } from '../../utils/dateUtil';
import {
  LEAD_FIELDS,
  LEAD_STATUSES,
  LEAD_STATUS_TONE,
  createLead,
  deleteLead,
  isMaskedValue,
  leadPayload,
  updateLead,
} from '../../api/leadsClient';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyLead = () => ({
  name: '',
  role: '',
  company: '',
  email: '',
  phone: '',
  linkedin_url: '',
  relationship: '',
  status: 'identified',
  source: '',
  last_contact_at: '',
  next_action: '',
  next_action_due: '',
  notes: '',
});

// Copies a stored lead into the editable form shape (no id, no timestamps).
const toFormValues = lead => {
  const values = emptyLead();
  LEAD_FIELDS.forEach(field => {
    values[field] = lead[field] ?? '';
  });
  return values;
};

const Meta = ({ label, value }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: 'block', letterSpacing: '0.01em' }}
    >
      {label}
    </Typography>
    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
      {value}
    </Typography>
  </Box>
);

// People in contact about this application: who they are, where the
// relationship stands and what happens next. A lead is written in a small
// sub-dialog and deleted only after a confirmation.
export default function LeadsForm({
  jobApplicationId,
  leads = [],
  onLeadsChange,
  leadsLoading = false,
  leadsError = false,
  handleClose,
}) {
  const { t, i18n } = useTranslation();
  const { run, pending: saving } = useAsyncAction();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});

  const remove = useConfirmedAction({
    action: lead => deleteLead(lead.id),
    successMessage: t('leads.messages.deleteSuccess'),
    errorMessage: t('leads.messages.deleteError'),
    onSuccess: lead =>
      onLeadsChange?.(prev => prev.filter(item => item.id !== lead.id)),
  });

  const openAdd = () => {
    setErrors({});
    setForm({ ...emptyLead() });
  };

  const openEdit = lead => {
    setErrors({});
    setForm({ ...toFormValues(lead), id: lead.id });
  };

  const closeForm = () => {
    setForm(null);
    setErrors({});
  };

  const handleChange = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = values => {
    const nextErrors = {};
    if (!values.name.trim()) nextErrors.name = t('leads.errors.nameRequired');
    const email = values.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      nextErrors.email = t('leads.errors.emailInvalid');
    }
    return nextErrors;
  };

  const submit = () => {
    if (!form) return;
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const isEdit = Boolean(form.id);
    const payload = leadPayload(form);
    // The API rejects a lead without a status; the selector always has one,
    // but a status cleared elsewhere should still fall back safely.
    if (!payload.status) payload.status = 'identified';

    run(
      () =>
        isEdit
          ? updateLead(form.id, payload)
          : createLead(jobApplicationId, payload),
      {
        successMessage: isEdit
          ? t('leads.messages.updateSuccess')
          : t('leads.messages.addSuccess'),
        errorMessage: isEdit
          ? t('leads.messages.updateError')
          : t('leads.messages.addError'),
        onSuccess: saved => {
          if (!saved) return;
          onLeadsChange?.(prev =>
            isEdit
              ? prev.map(item => (item.id === saved.id ? saved : item))
              : [...prev, saved]
          );
          closeForm();
        },
      }
    );
  };

  const formatDate = value =>
    formatCalendarDate(value, i18n.resolvedLanguage)?.absolute ?? value;

  if (leadsLoading)
    return (
      <DialogContent>
        <Typography color="text.secondary">{t('common.loading')}</Typography>
      </DialogContent>
    );
  if (leadsError)
    return (
      <DialogContent>
        <Alert severity="error">{t('leads.loadError')}</Alert>
      </DialogContent>
    );

  const isEditing = Boolean(form?.id);

  return (
    <>
      <DialogContent sx={{ pt: 2.5 }}>
        {leads.length === 0 ? (
          <EmptyState
            icon={<PeopleOutlineRoundedIcon />}
            title={t('leads.emptyTitle')}
            description={t('leads.emptyDescription')}
            actions={
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={openAdd}
              >
                {t('leads.add')}
              </Button>
            }
          />
        ) : (
          <>
            <Box
              component="ul"
              aria-label={t('leads.listLabel')}
              sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
              {leads.map(lead => (
                <Box
                  component="li"
                  key={lead.id}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 3,
                    p: 2,
                    mb: 1.5,
                    bgcolor: 'background.default',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 1.25,
                      mb: 1.5,
                    }}
                  >
                    <Typography sx={{ fontWeight: 650 }}>
                      {lead.name}
                    </Typography>
                    {(lead.role || lead.company) && (
                      <Typography variant="body2" color="text.secondary">
                        {[lead.role, lead.company].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                    <StatusBadge
                      tone={LEAD_STATUS_TONE[lead.status] ?? 'all'}
                      label={t(`leads.statuses.${lead.status}`, {
                        defaultValue: lead.status,
                      })}
                    />
                    <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
                      <Tooltip title={t('common.edit')}>
                        <IconButton
                          aria-label={t('common.editItem', {
                            name: lead.name,
                          })}
                          onClick={() => openEdit(lead)}
                          size="small"
                          sx={{ borderRadius: 2, color: 'text.secondary' }}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.delete')}>
                        <IconButton
                          aria-label={t('common.deleteItem', {
                            name: lead.name,
                          })}
                          onClick={() => remove.request(lead)}
                          size="small"
                          sx={{
                            borderRadius: 2,
                            color: 'text.secondary',
                            '&:hover': {
                              color: 'error.main',
                              bgcolor: theme =>
                                `rgba(${theme.vars.palette.error.mainChannel} / 0.1)`,
                            },
                          }}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      columnGap: 4,
                      rowGap: 1.25,
                      mb: lead.notes ? 1.25 : 0,
                    }}
                  >
                    <Meta
                      label={t('leads.nextAction')}
                      value={
                        lead.next_action ||
                        lead.next_action_due ||
                        t('common.na')
                      }
                    />
                    {lead.next_action_due && (
                      <Meta
                        label={t('leads.nextActionDue')}
                        value={formatDate(lead.next_action_due)}
                      />
                    )}
                    <Meta
                      label={t('leads.lastContact')}
                      value={
                        lead.last_contact_at
                          ? formatDate(lead.last_contact_at)
                          : t('common.na')
                      }
                    />
                    {lead.relationship && (
                      <Meta
                        label={t('leads.relationship')}
                        value={lead.relationship}
                      />
                    )}
                  </Box>

                  {lead.notes && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1, whiteSpace: 'pre-wrap' }}
                    >
                      {lead.notes}
                    </Typography>
                  )}

                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    {lead.email && (
                      <Tooltip title={lead.email}>
                        <IconButton
                          component="a"
                          href={`mailto:${lead.email}`}
                          aria-label={t('leads.contact.email', {
                            name: lead.name,
                          })}
                          size="small"
                          sx={{ color: 'text.secondary', borderRadius: 2 }}
                        >
                          <EmailOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {lead.phone && !isMaskedValue(lead.phone) && (
                      <Tooltip title={lead.phone}>
                        <IconButton
                          component="a"
                          href={`tel:${lead.phone}`}
                          aria-label={t('leads.contact.phone', {
                            name: lead.name,
                          })}
                          size="small"
                          sx={{ color: 'text.secondary', borderRadius: 2 }}
                        >
                          <PhoneOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {lead.linkedin_url && (
                      <Tooltip title={lead.linkedin_url}>
                        <IconButton
                          component="a"
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t('leads.contact.linkedin', {
                            name: lead.name,
                          })}
                          size="small"
                          sx={{ color: 'text.secondary', borderRadius: 2 }}
                        >
                          <LinkedInIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddRoundedIcon />}
              onClick={openAdd}
              sx={{ height: 44, borderStyle: 'dashed', borderWidth: 1.5 }}
            >
              {t('leads.add')}
            </Button>
          </>
        )}
      </DialogContent>

      <DialogFooter
        note={
          <>
            <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16 }} />
            {t('leads.footerNote')}
          </>
        }
      >
        <Button color="inherit" onClick={handleClose}>
          {t('common.done')}
        </Button>
      </DialogFooter>

      <CustomDialog
        open={Boolean(form)}
        onClose={closeForm}
        onCancel={closeForm}
        onSave={submit}
        saving={saving}
        saveLabel={t('leads.save')}
        maxWidth="sm"
        title={isEditing ? t('leads.editTitle') : t('leads.addTitle')}
        subtitle={isEditing ? t('leads.editSubtitle') : t('leads.addSubtitle')}
      >
        <DialogContent sx={{ pt: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                required
                id="lead-name"
                name="name"
                label={t('leads.fields.name')}
                value={form?.name ?? ''}
                onChange={handleChange}
                error={Boolean(errors.name)}
                helperText={errors.name}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel id="lead-status-label">
                  {t('leads.fields.status')}
                </InputLabel>
                <Select
                  labelId="lead-status-label"
                  id="lead-status"
                  name="status"
                  label={t('leads.fields.status')}
                  value={form?.status ?? 'identified'}
                  onChange={handleChange}
                >
                  {LEAD_STATUSES.map(status => (
                    <MenuItem key={status} value={status}>
                      {t(`leads.statuses.${status}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                id="lead-role"
                name="role"
                label={t('leads.fields.role')}
                value={form?.role ?? ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                id="lead-company"
                name="company"
                label={t('leads.fields.company')}
                value={form?.company ?? ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                id="lead-email"
                name="email"
                type="email"
                label={t('leads.fields.email')}
                value={form?.email ?? ''}
                onChange={handleChange}
                error={Boolean(errors.email)}
                helperText={errors.email}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                id="lead-phone"
                name="phone"
                label={t('leads.fields.phone')}
                value={form?.phone ?? ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            <Grid size={12}>
              <TextField
                id="lead-linkedin"
                name="linkedin_url"
                label={t('leads.fields.linkedin')}
                value={form?.linkedin_url ?? ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                id="lead-relationship"
                name="relationship"
                label={t('leads.fields.relationship')}
                value={form?.relationship ?? ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                id="lead-source"
                name="source"
                label={t('leads.fields.source')}
                value={form?.source ?? ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DesktopDatePicker
                  label={t('leads.fields.lastContact')}
                  format="MM/DD/YYYY"
                  value={
                    form?.last_contact_at ? dayjs(form.last_contact_at) : null
                  }
                  onChange={date =>
                    setForm(prev => ({
                      ...prev,
                      last_contact_at: date
                        ? dayjs(date).format('YYYY-MM-DD')
                        : '',
                    }))
                  }
                  slotProps={{
                    textField: { id: 'lead-last-contact', fullWidth: true },
                  }}
                />
              </LocalizationProvider>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DesktopDatePicker
                  label={t('leads.fields.nextActionDue')}
                  format="MM/DD/YYYY"
                  value={
                    form?.next_action_due ? dayjs(form.next_action_due) : null
                  }
                  onChange={date =>
                    setForm(prev => ({
                      ...prev,
                      next_action_due: date
                        ? dayjs(date).format('YYYY-MM-DD')
                        : '',
                    }))
                  }
                  slotProps={{
                    textField: { id: 'lead-next-action-due', fullWidth: true },
                  }}
                />
              </LocalizationProvider>
            </Grid>
            <Grid size={12}>
              <TextField
                id="lead-next-action"
                name="next_action"
                label={t('leads.fields.nextAction')}
                value={form?.next_action ?? ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            <Grid size={12}>
              <TextField
                id="lead-notes"
                name="notes"
                label={t('leads.fields.notes')}
                value={form?.notes ?? ''}
                onChange={handleChange}
                multiline
                rows={3}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
      </CustomDialog>

      <ConfirmDialog
        {...remove.dialogProps}
        title={t('dialogs.confirmLeadDeletion.title')}
        content={t('dialogs.confirmLeadDeletion.content', {
          name: remove.item?.name ?? '',
        })}
      />
    </>
  );
}
