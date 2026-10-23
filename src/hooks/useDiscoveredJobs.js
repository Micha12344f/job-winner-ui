import { useCallback, useEffect, useState } from 'react';

const BASE = '/api/ext/discovery';

async function request(path, options) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
  });
  if (!response.ok)
    throw new Error(`Discovery request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

export default function useDiscoveredJobs() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await request('/jobs'));
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

  const mutate = useCallback(
    async (id, action, body) => {
      await request(`/jobs/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await refresh();
    },
    [refresh]
  );
  const crawl = useCallback(async () => {
    await request('/crawl', { method: 'POST' });
    await refresh();
  }, [refresh]);

  return {
    jobs: data?.items ?? [],
    sourcesHealth: data?.sources_health ?? [],
    count: data?.count ?? 0,
    loading,
    error,
    refresh,
    dismiss: (id, reason = 'user') => mutate(id, 'dismiss', { reason }),
    restore: id => mutate(id, 'restore'),
    markApplied: (id, applicationId, channel = 'manual') =>
      mutate(id, 'applied', { application_id: applicationId, channel }),
    crawl,
  };
}
