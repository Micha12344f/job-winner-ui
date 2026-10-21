import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import CvLibrarySection from '../CvLibrarySection';
import { ThemeContextProvider } from '../ThemeContext';
import { SnackbarProvider } from '../common/SnackbarContext';
import { listDocuments, patchDocument } from '../../api/extClient';
import { deleteDocument, uploadDocument } from '../../api/filesClient';

// Keep the pure helpers (grouping, URLs, formatting) real and stub the calls
// that leave the browser.
vi.mock('../../api/extClient', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, listDocuments: vi.fn(), patchDocument: vi.fn() };
});

vi.mock('../../api/filesClient', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, uploadDocument: vi.fn(), deleteDocument: vi.fn() };
});

const financePrimary = {
  file_id: 'f1',
  category: 'Finance',
  headline: 'Finance CV',
  original_filename: 'finance-cv.pdf',
  size_bytes: 2048,
  uploaded_at: '2026-10-01T10:00:00Z',
  is_primary: 1,
  notes: 'Main CV',
};

const financeCover = {
  file_id: 'f2',
  category: 'Finance',
  headline: 'Finance cover letter',
  original_filename: 'finance-cover.docx',
  size_bytes: 1024,
  uploaded_at: '2026-10-02T10:00:00Z',
  is_primary: 0,
};

const engineeringCv = {
  file_id: 'e1',
  category: 'Engineering',
  headline: 'Engineering CV',
  original_filename: 'eng-cv.pdf',
  size_bytes: 4096,
  uploaded_at: '2026-09-20T10:00:00Z',
  is_primary: 0,
};

const payload = items => ({
  count: items.length,
  items,
  categories: [...new Set(items.map(item => item.category))].map(category => ({
    category,
    count: items.filter(item => item.category === category).length,
  })),
});

const renderSection = () =>
  render(
    <ThemeContextProvider>
      <SnackbarProvider>
        <CvLibrarySection open />
      </SnackbarProvider>
    </ThemeContextProvider>
  );

const uploadFile = (name, type = 'application/pdf', bytes = 16) =>
  new File([new Uint8Array(bytes)], name, { type });

beforeEach(() => {
  vi.clearAllMocks();
  listDocuments.mockResolvedValue(
    payload([financePrimary, financeCover, engineeringCv])
  );
  uploadDocument.mockResolvedValue({ id: 'new' });
  deleteDocument.mockResolvedValue({ deleted: 'f2' });
  patchDocument.mockImplementation((id, changes) =>
    Promise.resolve({
      ...([financePrimary, financeCover, engineeringCv].find(
        item => item.file_id === id
      ) ?? { file_id: id }),
      ...changes,
    })
  );
});

describe('CvLibrarySection', () => {
  it('groups documents by category with a count per group', async () => {
    renderSection();

    expect(await screen.findByText('Finance CV')).toBeInTheDocument();

    const finance = screen.getByRole('region', { name: 'Finance' });
    expect(within(finance).getByText('Finance cover letter')).toBeVisible();
    expect(within(finance).getByText('2 documents')).toBeInTheDocument();
    expect(within(finance).getByText(/finance-cv\.pdf/)).toBeInTheDocument();
    expect(within(finance).getByText('2.0 KB')).toBeInTheDocument();
    expect(within(finance).getAllByText(/Uploaded/)).toHaveLength(2);

    const engineering = screen.getByRole('region', { name: 'Engineering' });
    expect(within(engineering).getByText('1 document')).toBeInTheDocument();
  });

  it('shows a single primary badge even when the server returns two', async () => {
    listDocuments.mockResolvedValue(
      payload([
        financePrimary,
        { ...financeCover, is_primary: 1, uploaded_at: '2026-09-01T00:00:00Z' },
      ])
    );
    renderSection();

    await screen.findByText('Finance CV');
    const finance = screen.getByRole('region', { name: 'Finance' });
    expect(within(finance).getAllByText('Primary')).toHaveLength(1);
  });

  it('shows the empty state when there are no documents', async () => {
    listDocuments.mockResolvedValue(payload([]));
    renderSection();

    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Upload a CV or supporting document/)
    ).toBeInTheDocument();
  });

  it('surfaces a load failure with a retry instead of an empty list', async () => {
    const user = userEvent.setup();
    listDocuments
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(payload([financePrimary]));
    renderSection();

    expect(
      await screen.findByText('Could not load your documents.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No documents yet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Finance CV')).toBeInTheDocument();
  });

  it('offers the API categories plus the common ones in the picker', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Finance CV');

    await user.click(screen.getByLabelText('Category'));
    const options = await screen.findAllByRole('option');
    const names = options.map(option => option.textContent);

    expect(names).toContain('Finance');
    expect(names).toContain('Engineering');
    expect(names).toEqual(
      expect.arrayContaining(['Data', 'Consulting', 'General'])
    );
  });

  it('uploads a document with its category and headline', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Finance CV');

    await user.type(screen.getByLabelText('Category'), 'Legal{Enter}');
    await user.type(screen.getByLabelText('Headline'), '  Senior legal CV  ');
    await user.upload(screen.getByLabelText('Choose files'), [
      uploadFile('legal-cv.pdf'),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    const sent = uploadDocument.mock.calls[0][0];
    expect(sent.file.name).toBe('legal-cv.pdf');
    expect(sent.label).toBe('Senior legal CV');
    expect(sent.headline).toBe('Senior legal CV');
    expect(sent.category).toBe('Legal');
    expect(await screen.findByText('Document uploaded.')).toBeInTheDocument();
    // The dialog stays open with a fresh form and the list is re-read.
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(listDocuments).toHaveBeenCalledTimes(2);
  });

  it('rejects a file whose type is not allowed', async () => {
    // Bypass the input's accept filter so the component's own validation runs.
    const user = userEvent.setup({ applyAccept: false });
    renderSection();
    await screen.findByText('Finance CV');

    await user.upload(screen.getByLabelText('Choose files'), [
      uploadFile('malware.exe', 'application/x-msdownload'),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(
      await screen.findByText(/malware\.exe is not a supported file type/)
    ).toBeInTheDocument();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('rejects a file over the upload size limit', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Finance CV');

    await user.upload(screen.getByLabelText('Choose files'), [
      uploadFile('huge.pdf', 'application/pdf', 11 * 1024 * 1024),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(
      await screen.findByText(/huge\.pdf is 11\.0 MB, over the 10\.0 MB limit/)
    ).toBeInTheDocument();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('uploads several files in one go and reports progress', async () => {
    const user = userEvent.setup();
    const resolvers = [];
    uploadDocument.mockImplementation(
      () => new Promise(resolve => resolvers.push(resolve))
    );
    renderSection();
    await screen.findByText('Finance CV');

    await user.upload(screen.getByLabelText('Choose files'), [
      uploadFile('cv-one.pdf'),
      uploadFile('cv-two.pdf'),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByText('Uploading 0 of 2…')).toBeInTheDocument();
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolvers[0]({ id: 'one' });
    });
    expect(await screen.findByText('Uploading 1 of 2…')).toBeInTheDocument();
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolvers[1]({ id: 'two' });
    });

    await waitFor(() =>
      expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument()
    );
    const sent = uploadDocument.mock.calls.map(call => call[0]);
    expect(sent[0].label).toBe('cv one');
    expect(sent[1].label).toBe('cv two');
    expect(sent[0].category).toBe('General');
    expect(await screen.findByText('Document uploaded.')).toBeInTheDocument();
  });

  it('surfaces a server upload error', async () => {
    const user = userEvent.setup();
    uploadDocument.mockRejectedValue(new Error('File exceeds the 10 MB limit'));
    renderSection();
    await screen.findByText('Finance CV');

    await user.upload(screen.getByLabelText('Choose files'), [
      uploadFile('cv.pdf'),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(
      await screen.findByText('File exceeds the 10 MB limit')
    ).toBeInTheDocument();
  });

  it('marks one document per category as primary', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Finance CV');

    expect(
      screen.queryByRole('button', { name: 'Mark Finance CV as primary' })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Mark Finance cover letter as primary',
      })
    );

    await waitFor(() =>
      expect(patchDocument).toHaveBeenCalledWith('f2', { is_primary: true })
    );
    expect(
      await screen.findByText('Primary document updated.')
    ).toBeInTheDocument();

    const finance = screen.getByRole('region', { name: 'Finance' });
    expect(within(finance).getAllByText('Primary')).toHaveLength(1);
    expect(
      within(finance).getByRole('button', {
        name: 'Mark Finance CV as primary',
      })
    ).toBeInTheDocument();
    expect(
      within(finance).queryByRole('button', {
        name: 'Mark Finance cover letter as primary',
      })
    ).not.toBeInTheDocument();
  });

  it('edits a document category, headline and notes', async () => {
    const user = userEvent.setup();
    patchDocument.mockImplementation((id, changes) =>
      Promise.resolve({
        ...financePrimary,
        file_id: id,
        ...changes,
      })
    );
    renderSection();
    await screen.findByText('Finance CV');

    await user.click(screen.getByRole('button', { name: 'Edit Finance CV' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit document',
    });

    expect(within(dialog).getByLabelText(/^Category/)).toHaveValue('Finance');
    expect(within(dialog).getByLabelText('Headline')).toHaveValue('Finance CV');
    expect(within(dialog).getByLabelText('Notes')).toHaveValue('Main CV');

    await user.clear(within(dialog).getByLabelText(/^Category/));
    await user.type(within(dialog).getByLabelText(/^Category/), 'Legal{Enter}');
    await user.clear(within(dialog).getByLabelText('Headline'));
    await user.type(
      within(dialog).getByLabelText('Headline'),
      'Legal counsel CV'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save document' })
    );

    await waitFor(() =>
      expect(patchDocument).toHaveBeenCalledWith('f1', {
        category: 'Legal',
        headline: 'Legal counsel CV',
        notes: 'Main CV',
      })
    );
    expect(await screen.findByText('Document updated.')).toBeInTheDocument();
    expect(await screen.findByText('Legal counsel CV')).toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'Legal' })
    ).toBeInTheDocument();
  });

  it('deletes a document only after confirmation', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Finance cover letter');

    await user.click(
      screen.getByRole('button', { name: 'Delete Finance cover letter' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete document',
    });
    expect(deleteDocument).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deleteDocument).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete document' })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText('Finance cover letter')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Delete Finance cover letter' })
    );
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Delete document' })
      ).getByRole('button', { name: 'Delete' })
    );

    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('f2'));
    expect(await screen.findByText('Document deleted.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Finance cover letter')).not.toBeInTheDocument()
    );
  });

  it('keeps the edit dialog open and reports a failed save', async () => {
    const user = userEvent.setup();
    patchDocument.mockRejectedValue(new Error('category is required'));
    renderSection();
    await screen.findByText('Finance CV');

    await user.click(screen.getByRole('button', { name: 'Edit Finance CV' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit document',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Save document' })
    );

    expect(
      await screen.findByText('Could not update the document.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Edit document' })
    ).toBeInTheDocument();
  });
});
