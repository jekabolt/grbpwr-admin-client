import { common_ProductionRunCostKind, common_ProductionRunStatus } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';

// Path to a run's detail page. Lives here (not on the detail module) so the create/edit modal can
// navigate to it without importing its parent page — that would be a cycle.
export const runDetailPath = (id: number) => ROUTES.productionRun.replace(':id', String(id));

// Lifecycle statuses. RECEIVED is reached only through ReceiveProductionRun (which posts
// stock) — never offered as a manual edit; UNKNOWN is never surfaced.
export const runStatusOptions: { value: common_ProductionRunStatus; label: string }[] = [
  { value: 'PRODUCTION_RUN_STATUS_PLANNED', label: 'planned' },
  { value: 'PRODUCTION_RUN_STATUS_IN_PROGRESS', label: 'in progress' },
  { value: 'PRODUCTION_RUN_STATUS_CLOSED', label: 'closed' },
  { value: 'PRODUCTION_RUN_STATUS_CANCELLED', label: 'cancelled' },
];

export const runStatusLabel = (s?: common_ProductionRunStatus | string): string => {
  switch (s) {
    case 'PRODUCTION_RUN_STATUS_PLANNED':
      return 'planned';
    case 'PRODUCTION_RUN_STATUS_IN_PROGRESS':
      return 'in progress';
    case 'PRODUCTION_RUN_STATUS_RECEIVED':
      return 'received';
    case 'PRODUCTION_RUN_STATUS_CLOSED':
      return 'closed';
    case 'PRODUCTION_RUN_STATUS_CANCELLED':
      return 'cancelled';
    default:
      return '—';
  }
};

// Status → badge tone (Tailwind classes on the app's semantic tokens), shared by the run list
// card and the detail header so a status reads the same colour everywhere: nothing-yet stays
// plain, in-flight is the app's "in progress, keep an eye on it" blue, received/closed are the
// two "done, stock is posted" milestones (green while still open to cost true-up, solid once
// closed for good), cancelled is the app's red "dead" tone.
export const runStatusTone = (s?: common_ProductionRunStatus | string): string => {
  switch (s) {
    case 'PRODUCTION_RUN_STATUS_IN_PROGRESS':
      return 'border-warning text-warning bg-warning/10';
    case 'PRODUCTION_RUN_STATUS_RECEIVED':
      return 'border-success text-success bg-success/10';
    case 'PRODUCTION_RUN_STATUS_CLOSED':
      return 'border-textColor bg-textColor text-bgColor';
    case 'PRODUCTION_RUN_STATUS_CANCELLED':
      return 'border-error text-error bg-error/10';
    case 'PRODUCTION_RUN_STATUS_PLANNED':
    default:
      return 'border-textInactiveColor text-textInactiveColor';
  }
};

// received/closed are terminal facts (stock + cost_price posted): delete is rejected by the
// backend, so the UI hides/disables it for these.
export const isRunLocked = (s?: common_ProductionRunStatus | string): boolean =>
  s === 'PRODUCTION_RUN_STATUS_RECEIVED' || s === 'PRODUCTION_RUN_STATUS_CLOSED';

export const isRunReceivable = (s?: common_ProductionRunStatus | string): boolean =>
  s === 'PRODUCTION_RUN_STATUS_PLANNED' || s === 'PRODUCTION_RUN_STATUS_IN_PROGRESS';

// A run is OPEN while it is still expected to produce something. Same two statuses as receivable —
// named separately because "can I still receive it" and "is it still outstanding" are different
// questions that happen to share an answer, and the overdue rule below is about the second one.
export const isRunOpen = isRunReceivable;

// The proto zero instant. grpc-gateway serialises an unset google.protobuf.Timestamp as this rather
// than omitting it, so every date read here has to treat it as "no date" or the UI dates every
// unplanned run to the year 1.
const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

// A wire timestamp as a bare YYYY-MM-DD, or '' when unset. The backend stores these dates at UTC
// midnight, so slicing is exact — no local-timezone reinterpretation that could shift the day.
export const runDate = (ts?: string): string =>
  !ts || ts === ZERO_TIMESTAMP ? '' : ts.slice(0, 10);

// Whole days between a wire date and today, positive when the date is in the PAST. Both sides are
// reduced to a UTC calendar day first: comparing instants would make a run promised for today read
// as one day late from 00:01 local time onwards.
export function daysPast(ts?: string): number | undefined {
  const d = runDate(ts);
  if (!d) return undefined;
  const then = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(then)) return undefined;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - then) / 86_400_000);
}

// How many days late a run is: >0 only for an OPEN run whose promised date has passed. This is the
// client half of ListProductionRunsRequest.overdue_only — same predicate, so the badge and the
// server-side filter can never disagree about which runs are late. A run with no promised date was
// never promised anything and is therefore never late.
export function overdueDays(
  promisedAt?: string,
  status?: common_ProductionRunStatus | string,
): number {
  if (!isRunOpen(status)) return 0;
  const past = daysPast(promisedAt);
  return past != null && past > 0 ? past : 0;
}

export const runCostKindOptions: { value: common_ProductionRunCostKind; label: string }[] = [
  { value: 'PRODUCTION_RUN_COST_KIND_MATERIALS', label: 'materials' },
  { value: 'PRODUCTION_RUN_COST_KIND_CMT', label: 'CMT (cut-make-trim)' },
  { value: 'PRODUCTION_RUN_COST_KIND_HARDWARE', label: 'hardware' },
  { value: 'PRODUCTION_RUN_COST_KIND_PACKAGING', label: 'packaging' },
  { value: 'PRODUCTION_RUN_COST_KIND_LOGISTICS', label: 'logistics' },
  { value: 'PRODUCTION_RUN_COST_KIND_DUTY', label: 'duty' },
  { value: 'PRODUCTION_RUN_COST_KIND_OTHER', label: 'other' },
];

export const runCostKindLabel = (k?: common_ProductionRunCostKind | string): string =>
  runCostKindOptions.find((o) => o.value === k)?.label ?? 'other';

// The ListProductionRuns `status` filter is a plain string, and the backend stores the status
// as its lowercase short name (see production.proto: "Stored as its lowercase name in the DB").
// So the filter must be sent as e.g. `planned` / `in_progress`, NOT the enum constant — otherwise
// it matches nothing. The UI keeps the enum constant for display; convert only at the boundary.
export const runStatusToDbFilter = (status?: string): string | undefined =>
  status ? status.replace('PRODUCTION_RUN_STATUS_', '').toLowerCase() : undefined;
