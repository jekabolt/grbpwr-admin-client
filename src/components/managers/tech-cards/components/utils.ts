import { techCardApprovalStateOptions, techCardStageOptions } from 'constants/filter';

export const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

const stageLabels: Record<string, string> = Object.fromEntries(
  techCardStageOptions.map((o) => [o.value, o.label]),
);
const approvalStateLabels: Record<string, string> = Object.fromEntries(
  techCardApprovalStateOptions.map((o) => [o.value, o.label]),
);

export function stageLabel(stage?: string): string {
  if (!stage || stage === 'TECH_CARD_STAGE_UNKNOWN') return '—';
  return stageLabels[stage] ?? '—';
}

export function approvalStateLabel(state?: string): string {
  if (!state || state === 'TECH_CARD_APPROVAL_STATE_UNKNOWN') return '—';
  return approvalStateLabels[state] ?? '—';
}

// Maps a failed TechCard request to a role-readable message. The API layer attaches
// the HTTP status (grpc-gateway: Aborted→409, FailedPrecondition→412, InvalidArgument
// →400) and the backend message. See tmp/features.md §3.
export function techCardErrorMessage(error: unknown, fallback: string): string {
  const status = (error as { status?: number })?.status;
  const raw = error instanceof Error ? error.message : '';
  switch (status) {
    case 409:
      return 'This tech card was saved by someone else. Reload to get the latest version, then re-apply your changes.';
    case 412:
      return 'This tech card is released and frozen. Re-open it to Draft before editing.';
    case 400:
      return raw || 'Validation failed — check the highlighted fields.';
    default:
      return raw || fallback;
  }
}

// Renders a stored timestamp as YYYY-MM-DD, or '—' for the zero/unset value.
export function formatTechCardDate(timestamp?: string): string {
  if (!timestamp || timestamp === ZERO_TIMESTAMP) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}
