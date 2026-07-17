// Sample enumerations are plain lowercase strings on the contract (not proto enums).

import { common_Sample } from 'api/proto-http/admin';

export const samplePurposeOptions = [
  { value: 'proto', label: 'proto' },
  { value: 'fit', label: 'fit' },
  { value: 'sms', label: 'salesman (SMS)' },
  { value: 'pp', label: 'pre-production (PP)' },
];

export const sampleStatusOptions = [
  { value: 'planned', label: 'planned' },
  { value: 'in_sewing', label: 'in sewing' },
  { value: 'done', label: 'done' },
  { value: 'scrapped', label: 'scrapped' },
];

// fabric_source (owner decision, UX pass): the wire values (sample|production) are NOT renamed —
// only how the field reads in the UI. "Sample fabric" read as unexplained jargon; spell out what
// each side actually means so purpose (proto/fit/sms/PP) and fabric choice visibly line up.
export const sampleFabricSourceFieldLabel = 'ткань: подменная (sample) / боевая (production)';
export const sampleFabricSourceHint =
  'подменная — черновая ткань, только проверить посадку/крой; боевая — финальная ткань стиля. Обычно PP-семпл шьют из боевой, proto/fit/sms — из подменной.';

export const sampleFabricSourceOptions = [
  { value: 'sample', label: 'подменная (sample)' },
  { value: 'production', label: 'боевая (production)' },
];

const label = (opts: { value: string; label: string }[], v?: string) =>
  opts.find((o) => o.value === v)?.label ?? v ?? '—';

export const samplePurposeLabel = (v?: string) => label(samplePurposeOptions, v);
export const sampleStatusLabel = (v?: string) => label(sampleStatusOptions, v);
export const sampleFabricSourceLabel = (v?: string) => label(sampleFabricSourceOptions, v);

// Round badge text for a sample card (owner decision 1, quoted verbatim: «раунд N») — round_number
// 0 means "not assigned yet" (server auto-assigns on save), so it reads as "—", not a misleading
// "раунд 0".
export function sampleRoundLabel(n?: number): string {
  return n && n > 0 ? `раунд ${n}` : 'раунд —';
}

// --- Card-board chip styling (owner decision: cards/chips read faster than a dense table or a
// plain dropdown; colour on the status chip reads state at a glance, scannable across a grid). ---
const chipBase = 'inline-block border px-1.5 py-0.5 text-textBaseSize uppercase';
const neutralTone = 'border-textInactiveColor text-textColor';

const statusTone: Record<string, string> = {
  planned: neutralTone,
  in_sewing: 'border-warning text-warning bg-warning/10',
  done: 'border-success text-success bg-success/10',
  scrapped: 'border-error text-error bg-error/10',
};

export function sampleStatusChipClass(v?: string): string {
  return `${chipBase} ${statusTone[v ?? ''] ?? neutralTone}`;
}

// Purpose/fabric chips are categories, not states — one neutral tone keeps the status chip the
// only colour signal on the card (colour stays meaningful instead of decorative).
export function sampleNeutralChipClass(): string {
  return `${chipBase} ${neutralTone}`;
}

// First photo for a card thumbnail, resolved in mediaIds order (falls back to the first resolved
// item if the two ever fall out of step). undefined = no photo — the caller shows a placeholder.
export function sampleThumbUrl(s?: common_Sample): string | undefined {
  const ids = s?.sample?.mediaIds ?? [];
  const media = s?.media ?? [];
  const byId = new Map(media.map((m) => [m.id, m]));
  const first = (ids.length ? byId.get(ids[0]) : undefined) ?? media[0];
  return first?.media?.thumbnail?.mediaUrl || first?.media?.fullSize?.mediaUrl || undefined;
}
