import { common_Fitting } from 'api/proto-http/admin';
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

// Which fitting of its garment this one is: 1-based, by fitting date then id. 0 = not among them.
export function fittingOrdinal(siblings: common_Fitting[] | undefined, fittingId: number) {
  const sorted = [...(siblings ?? [])].sort(
    (x, y) =>
      String(x.fitting?.fittingDate ?? '').localeCompare(String(y.fitting?.fittingDate ?? '')) ||
      (x.id ?? 0) - (y.id ?? 0),
  );
  const i = sorted.findIndex((f) => f.id === fittingId);
  return i >= 0 ? i + 1 : 0;
}

// The fitting's title, the same on its card and its screen: type · garment · size · fitting N.
export function fittingTitleParts(p: {
  type?: string;
  garment?: string;
  size?: string;
  ordinal?: number;
}) {
  return {
    head: p.type || '',
    garment: p.garment || '',
    tail: [p.size || '', p.ordinal ? `fitting\u00a0${p.ordinal}` : ''].filter(Boolean),
  };
}

export function fittingTitleText(parts: ReturnType<typeof fittingTitleParts>) {
  return [parts.head, parts.garment, ...parts.tail].filter(Boolean).join(' · ');
}
