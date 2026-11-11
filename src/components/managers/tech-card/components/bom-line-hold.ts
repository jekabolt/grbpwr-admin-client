/**
 * A BOM line that cut strips are cut from, or that a topstitch step sews with, is HELD: its unit,
 * purpose and article stay as they are until those strips and lines are gone (owner, Р2 = block).
 * Changing them under live strips left a card that could not be saved at all ("cut strip not
 * metres"). Keys compare trimmed; a blank key never holds anything.
 */
export type BomLineHold = { held: boolean; strips: number };

type StripRef = { bomLineKey?: string | null };
type OperationRef = { topstitchLines?: ReadonlyArray<StripRef> | null };

export function bomLineHold(
  lineKey: string | null | undefined,
  cutStrips: ReadonlyArray<StripRef> | null | undefined,
  operations: ReadonlyArray<OperationRef> | null | undefined,
): BomLineHold {
  const key = (lineKey ?? '').trim();
  if (!key) return { held: false, strips: 0 };
  const strips = (cutStrips ?? []).filter((s) => (s.bomLineKey ?? '').trim() === key).length;
  const sewn = (operations ?? []).some((op) =>
    (op.topstitchLines ?? []).some((l) => (l.bomLineKey ?? '').trim() === key),
  );
  return { held: strips > 0 || sewn, strips };
}

/** `2 strips` / `1 strip` — the counter that stands in for the article door. */
export const stripCount = (n: number): string => `${n} ${n === 1 ? 'strip' : 'strips'}`;
