import { fittingStatusOptions, fittingVerdictOptions } from 'constants/filter';

export const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

const statusLabels: Record<string, string> = Object.fromEntries(
  fittingStatusOptions.map((o) => [o.value, o.label]),
);
const verdictLabels: Record<string, string> = Object.fromEntries(
  fittingVerdictOptions.map((o) => [o.value, o.label]),
);

export function statusLabel(status?: string): string {
  if (!status || status === 'FITTING_STATUS_UNKNOWN') return '—';
  return statusLabels[status] ?? '—';
}

export function verdictLabel(verdict?: string): string {
  if (!verdict || verdict === 'FITTING_VERDICT_UNKNOWN') return '—';
  return verdictLabels[verdict] ?? '—';
}

// Renders a stored timestamp as YYYY-MM-DD, or '—' for the zero/unset value.
export function formatFittingDate(timestamp?: string): string {
  if (!timestamp || timestamp === ZERO_TIMESTAMP) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}
