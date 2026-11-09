import type { SeamLengthsMm } from './seam-side-length';
import type { CutStrip } from '../cut-strip-editor/use-cut-strip';

export type CutStripSeamSync = {
  strips: CutStrip[];
  changed: boolean;
  seamChanged: boolean;
};

/** One card-wide pass: align size rows, then copy measured cloth-side lengths onto from-seam strips. */
export function syncCutStripSeamMm(
  strips: readonly CutStrip[],
  sizeIds: readonly number[],
  seamLengthsMm: SeamLengthsMm,
): CutStripSeamSync {
  let changed = false;
  let seamChanged = false;
  const wantedSizeIds = [...new Set(sizeIds.map(Number).filter((sizeId) => sizeId > 0))];
  const next = strips.map((strip) => {
    const current = strip.sizes ?? [];
    const lengths =
      strip.lengthMode === 'from_seam' && strip.seamKey?.trim()
        ? seamLengthsMm(strip.seamKey.trim())
        : undefined;
    const rows = wantedSizeIds.map((sizeId) => {
      const stored = current.find((row) => Number(row.sizeId) === sizeId) ?? {
        sizeId,
        seamMm: '',
        manualCutMm: '',
      };
      if (!lengths) return stored;
      const measured = lengths.get(sizeId);
      const seamMm = measured == null ? '' : String(measured);
      if ((stored.seamMm ?? '') === seamMm) return stored;
      seamChanged = true;
      return { ...stored, seamMm };
    });
    const rowChanged =
      rows.length !== current.length ||
      rows.some(
        (row, index) =>
          row !== current[index] || Number(row.sizeId) !== Number(current[index]?.sizeId),
      );
    if (!rowChanged) return strip;
    changed = true;
    return { ...strip, sizes: rows };
  });
  return { strips: changed ? next : [...strips], changed, seamChanged };
}
