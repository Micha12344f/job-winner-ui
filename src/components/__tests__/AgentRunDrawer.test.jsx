import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentRunDrawer from '../AgentRunDrawer';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

describe('AgentRunDrawer run summary', () => {
  it('summarizes the outcome and observed actions using available run data', () => {
    render(
      <AgentRunDrawer
        open
        onClose={() => {}}
        item={{
          kind: 'run',
          jobName: 'Lead review',
          status: 'success',
          detail: 'Reviewed 8 leads',
          related: [{ label: 'email_sent', value: 'Sent 2 follow-up emails' }],
        }}
      />
    );

    expect(screen.getByTestId('agent-run-summary')).toHaveTextContent(
      'agentCalendar.status.success'
    );
    expect(screen.getByTestId('agent-run-summary')).toHaveTextContent(
      'Reviewed 8 leads'
    );
    expect(screen.getByTestId('agent-run-summary')).toHaveTextContent(
      'Sent 2 follow-up emails'
    );
  });
});
