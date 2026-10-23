import { useCallback, useEffect, useState } from 'react';

const BASE = '/api/ext/relationships';

async function request(path, options) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
  });
  if (!response.ok)
    throw new Error(`Relationships request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

export default function useRelationships() {
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [compData, contactData] = await Promise.all([
        request('/companies'),
        request('/contacts'),
      ]);
      setCompanies(compData.items ?? []);
      setContacts(contactData.items ?? []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const addCompany = useCallback(
    async data => {
      await request('/companies', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh]
  );

  const addContact = useCallback(
    async data => {
      await request('/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh]
  );

  const updateContact = useCallback(
    async (id, patch) => {
      await request(`/contacts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await refresh();
    },
    [refresh]
  );

  const deleteContact = useCallback(
    async id => {
      await request(`/contacts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await refresh();
    },
    [refresh]
  );

  const logInteraction = useCallback(
    async data => {
      await request('/interactions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh]
  );

  const getTimeline = useCallback(async id => {
    const data = await request(`/contacts/${encodeURIComponent(id)}/timeline`);
    return data.interactions ?? [];
  }, []);

  return {
    companies,
    contacts,
    loading,
    error,
    refresh,
    addCompany,
    addContact,
    updateContact,
    deleteContact,
    logInteraction,
    getTimeline,
  };
}
