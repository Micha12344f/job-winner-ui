import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import '../../i18n';
import JobStatusBar from '../JobStatusBar';
import { ThemeContextProvider } from '../ThemeContext';

const data = {
  allJobApplication: [
    { id: '1', status: 'active' },
    { id: '2', status: 'active' },
    { id: '3', status: 'open' },
  ],
};

const renderBar = (selectedStatus, handleStatusClick = vi.fn()) =>
  render(
    <ThemeContextProvider>
      <JobStatusBar
        data={data}
        selectedStatus={selectedStatus}
        handleStatusClick={handleStatusClick}
      />
    </ThemeContextProvider>
  );

describe('JobStatusBar', () => {
  test('shows counts and marks the selected status', () => {
    renderBar('active');
    const active = screen.getByRole('button', { name: 'Active 2' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'All 2' }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  test('has no Open bucket: radar candidates are not applications', () => {
    renderBar('all');
    expect(screen.queryByRole('button', { name: /^Open / })).toBeNull();
    expect(screen.getByRole('button', { name: 'All 2' })).not.toBeNull();
  });

  test('has no Clear button when showing all statuses', () => {
    renderBar('all');
    expect(
      screen.queryByRole('button', { name: 'Clear status filter' })
    ).toBeNull();
  });

  test('Clear resets the filter to all statuses', async () => {
    const handleStatusClick = vi.fn();
    renderBar('active', handleStatusClick);

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear status filter' })
    );
    expect(handleStatusClick).toHaveBeenCalledWith('all');
  });

  test('counts legacy `applied` rows as active, so every card has a chip', () => {
    render(
      <ThemeContextProvider>
        <JobStatusBar
          data={{
            allJobApplication: [
              { id: '1', status: 'active' },
              { id: '2', status: 'applied' },
              { id: '3', status: 'rejected' },
            ],
          }}
          selectedStatus="all"
          handleStatusClick={vi.fn()}
        />
      </ThemeContextProvider>
    );
    expect(screen.getByRole('button', { name: 'Active 2' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'All 3' })).not.toBeNull();
    // No bogus `applied` chip was created.
    expect(screen.queryByRole('button', { name: /applied/i })).toBeNull();
  });
});
