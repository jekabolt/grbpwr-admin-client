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

// received/closed are terminal facts (stock + cost_price posted): delete is rejected by the
// backend, so the UI hides/disables it for these.
export const isRunLocked = (s?: common_ProductionRunStatus | string): boolean =>
  s === 'PRODUCTION_RUN_STATUS_RECEIVED' || s === 'PRODUCTION_RUN_STATUS_CLOSED';

export const isRunReceivable = (s?: common_ProductionRunStatus | string): boolean =>
  s === 'PRODUCTION_RUN_STATUS_PLANNED' || s === 'PRODUCTION_RUN_STATUS_IN_PROGRESS';

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
