import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { ThemeContextProvider } from '../ThemeContext';
import DocumentsDialog from '../DocumentsDialog';
import {
  deleteDocument,
  listFiles,
  uploadDocument,
} from '../../api/filesClient';

vi.mock('../../api/filesClient', () => ({
  listFiles: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  downloadUrl: id => `/files/download/${id}`,
  formatFileSize: () => '1.2 KB',
  ALLOWED_EXTENSIONS: ['.pdf', '.docx', '.doc', '.txt', '.md'],
}));

const record = {
  id: 'a'.repeat(32),
  label: 'Senior CV',
  original_filename: 'senior-cv.pdf',
  size: 1234,
  content_type: 'application/pdf',
  job_application_id: '42',
  uploaded_at: '2026-10-21T10:00:00Z',
};

const renderDialog = () =>
  render(
    <ThemeContextProvider>
      <DocumentsDialog open handleClose={vi.fn()} />
    </ThemeContextProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  listFiles.mockResolvedValue([]);
  uploadDocument.mockResolvedValue(record);
  deleteDocument.mockResolvedValue({ deleted: record.id });
});

describe('DocumentsDialog', () => {
  it('shows the empty state when nothing is stored', async () => {
    renderDialog();
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('lists stored documents with a download link', async () => {
    listFiles.mockResolvedValue([record]);
    renderDialog();
    const link = await screen.findByRole('link', { name: 'Senior CV' });
    expect(link).toHaveAttribute('href', `/files/download/${record.id}`);
    expect(
      screen.getByRole('link', { name: 'Download Senior CV' })
    ).toBeInTheDocument();
    expect(screen.getByText('Application #42')).toBeInTheDocument();
    expect(screen.getByText('1.2 KB')).toBeInTheDocument();
    expect(screen.getByText(/Uploaded/)).toBeInTheDocument();
  });

  it('uploads the chosen file with its label and application id', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText('No documents yet');

    await user.type(screen.getByLabelText(/^Label/), '  Senior   CV  ');
    await user.type(screen.getByLabelText('Application ID (optional)'), '42');
    await user.upload(
      screen.getByLabelText('Choose file'),
      new File(['%PDF-1.4'], 'senior-cv.pdf', { type: 'application/pdf' })
    );
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    const payload = uploadDocument.mock.calls[0][0];
    expect(payload.label).toBe('Senior   CV'.trim());
    expect(payload.jobApplicationId).toBe('42');
    expect(payload.file.name).toBe('senior-cv.pdf');
    expect(await screen.findByText('Document uploaded.')).toBeInTheDocument();
    expect(listFiles).toHaveBeenCalledTimes(2);
  });

  it('requires confirmation before deleting', async () => {
    const user = userEvent.setup();
    listFiles.mockResolvedValue([record]);
    renderDialog();

    await user.click(
      await screen.findByRole('button', { name: 'Delete Senior CV' })
    );
    expect(deleteDocument).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Delete document' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith(record.id));
    expect(await screen.findByText('Document deleted.')).toBeInTheDocument();
  });

  it('surfaces a load failure instead of an empty list', async () => {
    listFiles.mockRejectedValue(new Error('offline'));
    renderDialog();
    expect(
      await screen.findByText('Could not load your documents.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No documents yet')).not.toBeInTheDocument();
  });
});
