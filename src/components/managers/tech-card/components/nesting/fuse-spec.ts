// HOW A PIECE IS FUSED — the Fold panel's helpers around the one fuse spec (FUSING wave). The
// spec itself, its read/write adapters and the wire mapping live in lib/fusing-dxf (shared with
// the fusible-DXF generator).
import {
  DEFAULT_INSET_MM,
  type FuseDarts,
  type FuseGrain,
  type PieceFuseSpec,
} from 'lib/fusing-dxf/types';

export {
  DEFAULT_INSET_MM,
  blankFuse,
  deriveFusePanelMode,
  fuseSpecForPanelMode,
  readFuseSpec,
  writeFuseFields,
  type FuseDarts,
  type FuseEdge,
  type FuseGrain,
  type FuseMode,
  type FusePanelMode,
  type FuseZone,
  type PieceFuseFields,
  type PieceFuseSpec,
} from 'lib/fusing-dxf/types';

/** Explicit width used when the operator switches to STRIP. */
export const PREVIEW_STRIP_MM = 10;

export const WIDTH_PRESETS = [10, 15, 20, 25];
export const INSET_PRESETS = [0, 2, 3, 5];
export const FUSE_GRAIN_ITEMS: { value: FuseGrain; label: string }[] = [
  { value: 'as_piece', label: 'as piece' },
  { value: 'lengthwise', label: 'lengthwise' },
  { value: 'crosswise', label: 'crosswise' },
  { value: 'bias', label: 'bias' },
  { value: 'any', label: 'any' },
];
export const DART_ITEMS: { value: FuseDarts; label: string }[] = [
  { value: 'cut', label: 'cut out' },
  { value: 'fuse', label: 'fuse over' },
];

/** The fused pieces whose spec is not finished. An edge-less strip follows the whole outline. */
export const fuseIncomplete = (s: PieceFuseSpec) => s.mode === 'zone' && !s.zone;

/** Any «more» field off its default — the fold opens by itself. */
export const fuseOffDefault = (s: PieceFuseSpec) =>
  s.insetNet ||
  (s.insetMm != null && s.insetMm !== DEFAULT_INSET_MM) ||
  s.grain !== 'as_piece' ||
  s.darts !== 'cut';

/** Numbers the canvas draws with; a net inset stays unknown until its source is available. */
export function resolveFuse(
  s: PieceFuseSpec,
  seamAllowanceMm?: number | null,
  allowanceUsesNetOutline = false,
) {
  const allowance = s.mode === 'strip' && s.widthMm == null && s.edges.length === 0;
  return {
    widthMm:
      allowance && allowanceUsesNetOutline
        ? null
        : s.widthMm != null
          ? s.widthMm
          : s.mode === 'strip' && Number.isFinite(seamAllowanceMm) && (seamAllowanceMm ?? 0) > 0
            ? seamAllowanceMm!
            : null,
    insetMm: allowance
      ? 0
      : s.insetNet
        ? Number.isFinite(seamAllowanceMm)
          ? Math.max(0, seamAllowanceMm ?? 0)
          : null
        : Math.max(0, s.insetMm ?? DEFAULT_INSET_MM),
    darts: s.darts,
  };
}

/** The interlining line in force: the chosen one, else the only one. */
export const fuseLineOf = (s: PieceFuseSpec, lineKeys: readonly string[]) =>
  s.bomLineKey || (lineKeys.length === 1 ? lineKeys[0] : '');

/** «12», «12.5», «12,5» — a number the width/inset pickers accept as typed. */
export const isMmText = (t: string) => /^\d+([.,]\d+)?$/.test(t.trim());

/** A picked mm value («12.5», «12,5») as a number; null when it is not one. */
export const mmOfText = (t: string): number | null => {
  if (!isMmText(t)) return null;
  const v = Number(t.trim().replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
