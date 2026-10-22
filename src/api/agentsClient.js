// Typed client for the four agent feeds the calendar reads:
//   GET /ext/agents/registry
//   GET /ext/agents/schedule?start=&end=
//   GET /ext/agents/runs?start=&end=
//   GET /ext/agents/health
//
// The base URL, error type and JSON handling come from extClient.js, so these
// routes resolve exactly like every other /ext caller (same-origin /api/ext in
// production via the Vercel proxy, the local sidecar in development).
//
// The feed is still being built, so every normaliser below accepts a spread of
// plausible field names and always returns the same shape with sane defaults.
// A missing or renamed field degrades one cell, never the whole calendar.

import { ExtApiError, extBaseUrl } from './extClient';
import { normaliseRunStatus } from '../utils/agentCalendarUtil';

export { ExtApiError, extBaseUrl };

/**
 * @typedef {object} Agent
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} status - Raw status token from the feed.
 * @property {string[]} endpoints - Endpoints this agent owns.
 * @property {string} nextRunAt - Next run instant, when reported.
 */

/**
 * @typedef {object} AgentRun
 * @property {string} id
 * @property {'run' | 'occurrence'} kind
 * @property {string} agentId
 * @property {string} jobName
 * @property {'ok' | 'failed' | 'incident' | 'running' | 'unknown'} status
 * @property {string} scheduledAt
 * @property {string} startedAt
 * @property {string} finishedAt
 * @property {number | null} durationMs
 * @property {string} error
 * @property {string} detail
 * @property {Array<{label: string, value: string}>} related
 * @property {object} raw - Untouched payload row, for anything we did not map.
 */

/**
 * @typedef {object} AgentHealth
 * @property {{up: boolean | null, status: string, detail: string}} sidecar
 * @property {{state: 'enabled' | 'paused' | 'unknown', jobs: number | null, lastStatus: string, failureStreak: number | null, nextRunAt: string}} cron
 * @property {{up: boolean | null, status: string}} session
 * @property {{remainingPct: number | null, remaining: string}} budget
 * @property {boolean | null} halted
 * @property {object} raw
 */

const FEED_TIMEOUT_MS = 20_000;

// The sidecar reports validation failures as {loc, msg} rows in `detail`.
async function readError(response) {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (Array.isArray(detail) && detail.length) {
      return detail.map(entry => entry?.msg || String(entry)).join('; ');
    }
    if (typeof detail === 'string' && detail) return detail;
    if (payload?.error) return String(payload.error);
  } catch {
    // fall through to the status text
  }
  return `Request failed with status ${response.status}`;
}

const emptyValue = value =>
  value === null || value === undefined || String(value).trim() === '';

// First value that is actually there, so a renamed field falls through.
const firstOf = (...values) => values.find(value => !emptyValue(value));

const asString = (...values) => String(firstOf(...values) ?? '');

const asArray = (...values) => {
  const value = values.find(candidate => Array.isArray(candidate));
  return value ? value : [];
};

const asCount = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const asBoolean = (...values) => {
  const value = values.find(candidate => typeof candidate === 'boolean');
  return value === undefined ? null : value;
};

const isoOrEmpty = value => {
  if (emptyValue(value)) return '';
  const text = String(value);
  return Number.isNaN(new Date(text).getTime()) ? '' : text;
};

async function requestJson(path, { signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (signal) signal.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(`${extBaseUrl()}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ExtApiError(await readError(response), response.status);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', abort);
  }
}

const feedQuery = ({ start, end } = {}) => {
  const params = new URLSearchParams();
  if (!emptyValue(start)) params.set('start', String(start));
  if (!emptyValue(end)) params.set('end', String(end));
  const query = params.toString();
  return query ? `?${query}` : '';
};

// Payloads may be a bare array or {count, items}; both are tolerated.
function feedItems(payload) {
  if (Array.isArray(payload)) return payload;
  return asArray(payload?.items, payload?.agents, payload?.rows, payload?.data);
}

function feedCount(payload, items) {
  return asCount(firstOf(payload?.count, payload?.total)) ?? items.length;
}

/**
 * Normalises one registry row.
 * @param {object} row
 * @param {number} [index]
 * @returns {Agent}
 */
export function normaliseAgent(row = {}, index = 0) {
  const id = asString(
    row?.agent_id,
    row?.id,
    row?.key,
    row?.slug,
    row?.name,
    `agent-${index}`
  );
  return {
    id,
    name: asString(row?.name, row?.label, row?.display_name, row?.title, id),
    description: asString(row?.description, row?.summary, row?.purpose),
    status: asString(row?.status, row?.state, row?.health).toLowerCase(),
    endpoints: asArray(row?.owned_endpoints, row?.endpoints, row?.routes).map(
      String
    ),
    nextRunAt: isoOrEmpty(
      firstOf(row?.next_run_at, row?.next_run, row?.nextRunAt)
    ),
    raw: row ?? {},
  };
}

const durationMsOf = row => {
  const explicit = firstOf(row?.duration_ms, row?.durationMs);
  if (!emptyValue(explicit) && Number.isFinite(Number(explicit))) {
    return Math.max(0, Number(explicit));
  }
  const seconds = firstOf(
    row?.duration_s,
    row?.duration_seconds,
    row?.elapsed_s
  );
  if (!emptyValue(seconds) && Number.isFinite(Number(seconds))) {
    return Math.max(0, Number(seconds) * 1000);
  }
  const started = new Date(row?.started_at ?? row?.started ?? '');
  const finished = new Date(
    row?.finished_at ?? row?.finished ?? row?.ended_at ?? ''
  );
  if (!Number.isNaN(started.getTime()) && !Number.isNaN(finished.getTime())) {
    return Math.max(0, finished.getTime() - started.getTime());
  }
  return null;
};

// `related` is documented as linked agent_event rows but may arrive as objects
// or strings; both are reduced to label/value pairs for the drawer.
const relatedOf = row => {
  const rows = asArray(
    row?.related,
    row?.related_detail,
    row?.agent_events,
    row?.events
  );
  return rows
    .map(entry => {
      if (entry === null || entry === undefined) return null;
      if (typeof entry === 'string' || typeof entry === 'number') {
        return { label: '', value: String(entry) };
      }
      return {
        label: asString(entry.actor, entry.kind, entry.event, entry.action),
        value: asString(
          entry.summary,
          entry.detail,
          entry.message,
          entry.value
        ),
      };
    })
    .filter(entry => entry && (entry.label || entry.value));
};

/**
 * Normalises one `/ext/agents/runs` row.
 * @param {object} row
 * @param {number} [index]
 * @returns {AgentRun}
 */
export function normaliseRun(row = {}, index = 0) {
  return {
    id: asString(
      row?.id,
      row?.run_id,
      row?.execution_id,
      row?.exec_id,
      `run-${index}`
    ),
    kind: 'run',
    agentId: asString(
      row?.agent_id,
      row?.agent,
      row?.agent_key,
      row?.actor,
      row?.owner
    ),
    jobName: asString(
      row?.job_name,
      row?.name,
      row?.job_id,
      row?.job,
      row?.schedule_name,
      row?.cron_name
    ),
    status: normaliseRunStatus(
      firstOf(row?.status, row?.state, row?.result, row?.last_status)
    ),
    scheduledAt: isoOrEmpty(
      firstOf(
        row?.scheduled_instant,
        row?.scheduled_for,
        row?.scheduled_at,
        row?.scheduled,
        row?.started_at
      )
    ),
    startedAt: isoOrEmpty(firstOf(row?.started_at, row?.started)),
    finishedAt: isoOrEmpty(
      firstOf(row?.finished_at, row?.finished, row?.ended_at)
    ),
    durationMs: durationMsOf(row),
    error: asString(
      row?.error,
      row?.error_text,
      row?.error_message,
      row?.exception
    ),
    detail: asString(
      row?.detail,
      row?.output,
      row?.message,
      row?.summary,
      row?.result_detail
    ),
    related: relatedOf(row),
    raw: row ?? {},
  };
}

/**
 * Normalises one `/ext/agents/schedule` row. Rows may carry a single
 * occurrence or a nested `occurrences` array; both are flattened.
 * @param {object} row
 * @param {number} [index]
 * @returns {Array<AgentRun>}
 */
export function normaliseOccurrences(row = {}, index = 0) {
  const agentId = asString(
    row?.agent_id,
    row?.agent,
    row?.agent_key,
    row?.actor,
    row?.owner
  );
  const jobName = asString(
    row?.job_name,
    row?.name,
    row?.job_id,
    row?.job,
    row?.schedule_name,
    row?.cron_name
  );
  const shape = {
    kind: 'occurrence',
    agentId,
    jobName,
    detail: asString(row?.schedule, row?.expression, row?.cron, row?.kind),
    raw: row ?? {},
  };

  const nested = asArray(row?.occurrences, row?.slots, row?.instants);
  if (nested.length === 0) {
    return [
      {
        ...shape,
        id: asString(row?.id, row?.occurrence_id, `occurrence-${index}`),
        status: 'scheduled',
        scheduledAt: isoOrEmpty(
          firstOf(
            row?.scheduled_instant,
            row?.scheduled_at,
            row?.scheduled_for,
            row?.start,
            row?.starts_at,
            row?.at,
            row?.next_run_at
          )
        ),
        startedAt: '',
        finishedAt: '',
        durationMs: null,
        error: '',
        related: relatedOf(row),
      },
    ];
  }

  return nested.map((slot, slotIndex) => {
    const value =
      slot && typeof slot === 'object' ? slot : { scheduled_instant: slot };
    return {
      ...shape,
      id: asString(
        value?.id,
        value?.occurrence_id,
        `${shape.agentId || 'agent'}-${index}-${slotIndex}`
      ),
      status: 'scheduled',
      scheduledAt: isoOrEmpty(
        firstOf(
          value?.scheduled_instant,
          value?.scheduled_at,
          value?.instant,
          value?.start,
          value?.at
        )
      ),
      startedAt: '',
      finishedAt: '',
      durationMs: null,
      error: asString(value?.error),
      related: relatedOf(value),
      raw: value ?? {},
    };
  });
}

/**
 * Fetches the agent registry.
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{count: number, items: Agent[]}>}
 */
export async function getAgentRegistry({ signal } = {}) {
  const payload = await requestJson('/agents/registry', { signal });
  const items = feedItems(payload).map(normaliseAgent);
  return { count: feedCount(payload, items), items };
}

/**
 * Fetches the schedules expanded into concrete occurrences in a window.
 * @param {{start?: string, end?: string, signal?: AbortSignal}} [options]
 * @returns {Promise<{count: number, items: AgentRun[]}>}
 */
export async function getAgentSchedule({ start, end, signal } = {}) {
  const payload = await requestJson(
    `/agents/schedule${feedQuery({ start, end })}`,
    { signal }
  );
  const items = feedItems(payload).flatMap(normaliseOccurrences);
  return { count: feedCount(payload, items), items };
}

/**
 * Fetches real executions in a window.
 * @param {{start?: string, end?: string, signal?: AbortSignal}} [options]
 * @returns {Promise<{count: number, items: AgentRun[]}>}
 */
export async function getAgentRuns({ start, end, signal } = {}) {
  const payload = await requestJson(
    `/agents/runs${feedQuery({ start, end })}`,
    {
      signal,
    }
  );
  const items = feedItems(payload).map(normaliseRun);
  return { count: feedCount(payload, items), items };
}

const sidecarOf = payload => {
  const candidates = [
    payload?.sidecar,
    payload?.service,
    payload?.api,
    payload?.ext,
    payload,
  ];
  const source = candidates.find(value => value && typeof value === 'object');
  const status = asString(
    source?.status,
    source?.state,
    source?.health,
    typeof payload?.status === 'string' ? payload.status : undefined
  ).toLowerCase();
  const upFromFlag = asBoolean(
    source?.up,
    source?.ok,
    source?.healthy,
    source?.alive,
    payload?.service_up,
    payload?.sidecar_up
  );
  const downTokens = ['down', 'offline', 'unreachable', 'error', 'failed'];
  const upTokens = ['up', 'ok', 'online', 'healthy', 'running', 'degraded'];
  return {
    up:
      upFromFlag ??
      (upTokens.includes(status)
        ? true
        : downTokens.includes(status)
          ? false
          : null),
    status,
    detail: asString(
      source?.version,
      source?.detail,
      source?.url,
      source?.latency_ms
    ),
  };
};

const cronOf = payload => {
  const source = [payload?.cron, payload?.cron_state, payload?.cronState].find(
    value => value && typeof value === 'object'
  );
  const pausedFlag = asBoolean(source?.paused, payload?.cron_paused);
  const enabledFlag = asBoolean(
    source?.enabled,
    source?.running,
    payload?.cron_enabled
  );
  const state =
    pausedFlag === true || enabledFlag === false
      ? 'paused'
      : pausedFlag === false || enabledFlag === true
        ? 'enabled'
        : 'unknown';

  return {
    state,
    jobs: asCount(
      firstOf(
        source?.jobs,
        source?.job_count,
        source?.total,
        Array.isArray(source?.items) ? source.items.length : undefined
      )
    ),
    lastStatus: asString(
      source?.last_status,
      source?.last_run_status,
      source?.status
    ).toLowerCase(),
    failureStreak: asCount(
      firstOf(
        source?.failure_streak,
        source?.failures,
        source?.consecutive_failures
      )
    ),
    nextRunAt: isoOrEmpty(
      firstOf(source?.next_run_at, source?.next_run, source?.next)
    ),
  };
};

const sessionOf = payload => {
  const source = [
    payload?.session,
    payload?.linkedin,
    payload?.linkedin_session,
  ].find(value => value && typeof value === 'object');
  const status = asString(
    source?.status,
    source?.state,
    source?.health
  ).toLowerCase();
  const upFlag = asBoolean(
    source?.up,
    source?.ok,
    source?.valid,
    source?.healthy
  );
  const downTokens = ['expired', 'invalid', 'down', 'logged_out', 'failed'];
  const upTokens = ['up', 'ok', 'valid', 'healthy', 'active', 'authenticated'];
  return {
    up:
      upFlag ??
      (upTokens.includes(status)
        ? true
        : downTokens.includes(status)
          ? false
          : null),
    status,
  };
};

const budgetOf = payload => {
  const source = [payload?.budget, payload?.quota, payload?.usage].find(
    value => value && typeof value === 'object'
  );
  const pct = firstOf(
    source?.remaining_pct,
    source?.remaining_percent,
    source?.percent_remaining
  );
  return {
    remainingPct:
      !emptyValue(pct) && Number.isFinite(Number(pct))
        ? Math.max(0, Math.min(100, Number(pct)))
        : null,
    remaining: asString(
      source?.remaining,
      source?.remaining_label,
      source?.left,
      typeof source?.remaining === 'number' ? source.remaining : undefined
    ),
  };
};

/**
 * Normalises the compact health payload used by the header strip.
 * @param {object} payload
 * @returns {AgentHealth}
 */
export function normaliseHealth(payload = {}) {
  const haltedFlag = asBoolean(
    payload?.halted,
    payload?.halt,
    payload?.is_halted,
    payload?.cron?.halted
  );
  return {
    sidecar: sidecarOf(payload),
    cron: cronOf(payload),
    session: sessionOf(payload),
    budget: budgetOf(payload),
    halted: haltedFlag,
    raw: payload ?? {},
  };
}

/**
 * Fetches the sidecar / cron / session health summary.
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<AgentHealth>}
 */
export async function getAgentHealth({ signal } = {}) {
  return normaliseHealth(await requestJson('/agents/health', { signal }));
}
