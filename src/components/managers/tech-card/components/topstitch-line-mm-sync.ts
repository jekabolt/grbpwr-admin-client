import type { TopstitchLengthsMm } from './cut-strips/seam-lengths';
import type { TopstitchOperation } from './topstitch-lines';

export type TopstitchLineMmSync = {
  operations: TopstitchOperation[];
  changed: number[];
};

/**
 * Replace measured rows when their per-size values changed, or when the server marks the line stale
 * (a re-upload changed its sheet): `measured` is the only thing that re-stamps it. A pattern that
 * cannot be read changes nothing: the stored lengths and the stale mark stand.
 */
export function syncTopstitchLineMm(
  operations: readonly TopstitchOperation[],
  sizeIds: readonly number[],
  lengthsMm: TopstitchLengthsMm,
): TopstitchLineMmSync {
  // Ascending, as the server stores and returns the rows: the card's own order is not the wire's.
  const wanted = [...new Set(sizeIds.map(Number).filter((sizeId) => sizeId > 0))].sort(
    (a, b) => a - b,
  );
  const changed: number[] = [];
  const next = operations.map((operation, operationIndex) => {
    const lines = operation.topstitchLines ?? [];
    let lineChanged = false;
    const topstitchLines = lines.map((line) => {
      const lengths = lengthsMm(line);
      if (!lengths) return line;
      const sizes = wanted.flatMap((sizeId) => {
        const mm = lengths.get(sizeId);
        return mm == null ? [] : [{ sizeId, lineMm: String(mm) }];
      });
      const current = new Map(
        (line.sizes ?? []).map((size) => [Number(size.sizeId), size.lineMm ?? '']),
      );
      const same =
        sizes.length === current.size &&
        sizes.every((size) => current.get(size.sizeId) === size.lineMm);
      if (same && !line.stale) return line;
      lineChanged = true;
      return { ...line, sizes, measured: true, stale: false };
    });
    if (!lineChanged) return operation;
    changed.push(operationIndex);
    return { ...operation, topstitchLines };
  });
  return { operations: changed.length ? next : [...operations], changed };
}
