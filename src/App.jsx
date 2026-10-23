import './i18n';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useTranslation } from 'react-i18next';
import AppHeader from './components/AppHeader';
import { AppDialogsProvider } from './components/AppDialogsContext';
import DiscoveryOpenSection from './components/DiscoveryOpenSection';
import JobApplicationList from './components/JobApplicationList';
import RelationshipsView from './components/RelationshipsView';
import { prefetchDialogs } from './components/lazyDialogs';
import { SnackbarProvider } from './components/common/SnackbarContext';
import { ThemeContextProvider } from './components/ThemeContext';

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [section, setSection] = useState(0);
  const { t } = useTranslation();
  useEffect(prefetchDialogs, []);
  return (
    <ThemeContextProvider>
      <SnackbarProvider>
        <AppDialogsProvider>
          <AppHeader searchTerm={searchTerm} onSearch={setSearchTerm} />
          <Box
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              px: { xs: 2, md: 4 },
            }}
          >
            <Tabs
              value={section}
              onChange={(_, value) => setSection(value)}
              aria-label={t('discovery.sections')}
            >
              <Tab label={t('discovery.openTab')} />
              <Tab label={t('discovery.applicationsTab')} />
              <Tab label={t('relationships.tab')} />
            </Tabs>
          </Box>
          {section === 0 ? (
            <DiscoveryOpenSection />
          ) : section === 1 ? (
            <JobApplicationList
              searchTerm={searchTerm}
              onClearSearch={() => setSearchTerm('')}
            />
          ) : (
            <RelationshipsView />
          )}
        </AppDialogsProvider>
      </SnackbarProvider>
    </ThemeContextProvider>
  );
}
export default App;
