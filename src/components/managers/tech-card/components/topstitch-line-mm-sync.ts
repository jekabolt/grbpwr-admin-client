import type { TopstitchLengthsMm } from './cut-strips/seam-lengths';
import type { TopstitchOperation } from './topstitch-lines';

export type TopstitchLineMmSync = {
  operations: TopstitchOperation[];
  changed: number[];
};

/** Replace measured rows only when their actual per-size values changed. */
export function syncTopstitchLineMm(
  operations: readonly TopstitchOperation[],
  sizeIds: readonly number[],
  lengthsMm: TopstitchLengthsMm,
): TopstitchLineMmSync {
  const wanted = [...new Set(sizeIds.map(Number).filter((sizeId) => sizeId > 0))];
  const changed: number[] = [];
  const next = operations.map((operation, operationIndex) => {
    const lines = operation.topstitchLines ?? [];
    let lineChanged = false;
    const topstitchLines = lines.map((line) => {
      const lengths = lengthsMm(line);
      const sizes = lengths
        ? wanted.flatMap((sizeId) => {
            const mm = lengths.get(sizeId);
            return mm == null ? [] : [{ sizeId, lineMm: String(mm) }];
          })
        : [];
      const current = line.sizes ?? [];
      const same =
        sizes.length === current.length &&
        sizes.every(
          (size, index) =>
            Number(current[index]?.sizeId) === size.sizeId &&
            (current[index]?.lineMm ?? '') === size.lineMm,
        );
      if (same) return line;
      lineChanged = true;
      return { ...line, sizes, measured: true };
    });
    if (!lineChanged) return operation;
    changed.push(operationIndex);
    return { ...operation, topstitchLines };
  });
  return { operations: changed.length ? next : [...operations], changed };
}
