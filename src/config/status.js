// Job application statuses, in the order the filter bar shows them.
// Colors live in the theme palette under `status.<name>`.
export const JOB_STATUSES = ['open', 'active', 'ghosted', 'rejected'];

// The core API still carries one legacy status written by the sidecar before
// this model settled: `applied` means "submitted, no decision yet", which is
// exactly `active`. Normalise it at every boundary so no row can fall outside
// the chips (it used to render a raw lowercase badge, be missing from every
// count, and default its edit form to an option that is not in the menu).
export const STATUS_ALIASES = { applied: 'active' };

export const normaliseStatus = status => STATUS_ALIASES[status] || status;

// Order of cards in the list: most actionable first.
export const STATUS_SORT_ORDER = {
  active: 1,
  open: 2,
  ghosted: 3,
  rejected: 4,
};

const isKnownStatus = status =>
  status === 'all' || JOB_STATUSES.includes(status);

// Returns an sx palette path such as 'status.open.main', or `fallback` for an
// unknown status so callers never emit an invalid color.
export const statusColor = (status, tone = 'main', fallback = 'divider') =>
  isKnownStatus(status) ? `status.${status}.${tone}` : fallback;

// Interview statuses (separate from job statuses), in menu order, and the
// job-status tone each one borrows for its badge.
export const INTERVIEW_STATUSES = [
  'open',
  'canceled',
  'pending',
  'rejected',
  'expired',
];
export const INTERVIEW_STATUS_TONE = {
  open: 'open',
  pending: 'ghosted',
  canceled: 'all',
  rejected: 'rejected',
  expired: 'all',
};
