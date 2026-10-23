import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import App from './App';
import AppHeader from './components/AppHeader';
import JobApplicationList from './components/JobApplicationList';
import DiscoveryOpenSection from './components/DiscoveryOpenSection';
import RelationshipsView from './components/RelationshipsView';

vi.mock('./components/AppHeader');
vi.mock('./components/JobApplicationList');
vi.mock('./components/DiscoveryOpenSection');
vi.mock('./components/RelationshipsView');

it('Should render discovery open section on default route', async () => {
  AppHeader.mockImplementation(() => <div>AppHeaderMock</div>);
  JobApplicationList.mockImplementation(() => (
    <div>JobApplicationListrMock</div>
  ));
  DiscoveryOpenSection.mockImplementation(() => (
    <div>DiscoveryOpenSectionMock</div>
  ));
  RelationshipsView.mockImplementation(() => <div>RelationshipsViewMock</div>);
  render(
    <MockedProvider mocks={[]}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </MockedProvider>
  );
  expect(screen.getByText('AppHeaderMock')).not.toBeNull();
  expect(screen.getByText('DiscoveryOpenSectionMock')).not.toBeNull();
});

it('Should render job application list when Applications tab is selected', async () => {
  AppHeader.mockImplementation(() => <div>AppHeaderMock</div>);
  JobApplicationList.mockImplementation(() => (
    <div>JobApplicationListrMock</div>
  ));
  DiscoveryOpenSection.mockImplementation(() => (
    <div>DiscoveryOpenSectionMock</div>
  ));
  RelationshipsView.mockImplementation(() => <div>RelationshipsViewMock</div>);
  render(
    <MockedProvider mocks={[]}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </MockedProvider>
  );
  expect(screen.getByText('AppHeaderMock')).not.toBeNull();
  const appTab = screen.getByRole('tab', { name: /Applications/i });
  fireEvent.click(appTab);
  expect(screen.getByText('JobApplicationListrMock')).not.toBeNull();
});
