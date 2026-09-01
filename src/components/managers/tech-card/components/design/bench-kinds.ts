import type { DesignBenchSlotRef, common_DesignBenchSlot, common_DesignPicture } from 'api/proto-http/admin';

/**
 * THE BENCH-KIND VOCABULARY — the second axis of the bench, said once.
 *
 * This module exists because of a defect, not a preference — the same birth as `./views`. The bench
 * grew a second axis (view × kind, migration 0349): a render FRONT and a flat FRONT are two
 * different slots BOTH addressed by `view_key: front`. Three organs then spelled the rule «empty
 * kind reads as flat» each for itself (`benchKindOf` in `render/model.ts`, `benchRow` in
 * `history-recall.tsx`, and the refs of `bench.tsx`), while the two oldest readers —
 * `readBench`/`findSlot` in `bench-slot.tsx` — did not read the axis AT ALL, which is L-1 and L-5
 * in one family: organs written when one view meant one row kept believing it. One picker filed
 * every generation-history picture into the FLAT bench, fabric renders included (L-1), and the
 * studio bench echoed the RENDER row's CAS token against a flat write —
 * «slot is at rev 11, 4 was echoed» (L-5). A vocabulary spelled per organ drifts silently and by
 * construction; this is the one spelling.
 *
 * WHY THE KINDS ARE A CLIENT CONSTANT: the wire carries `kind` as an open string and the server's
 * refusal (`FailedPrecondition: wrong_kind`) is the nearest thing to an enumeration — the client
 * cannot read the list from anywhere, it can only agree with itself.
 */
export const BENCH_KINDS = ['flat', 'render'] as const;
export type BenchKind = (typeof BENCH_KINDS)[number];

/**
 * WHICH BENCH a stored slot row or a slot ref belongs to. Empty reads as `flat` — exactly as the
 * column's own DEFAULT does, so every row and every ref written before the second axis existed
 * keeps meaning the bench it meant.
 *
 * The parameter is deliberately the union of the two wire shapes whose `kind` IS a bench kind.
 * A `common_DesignPicture` also carries a `kind`, but that one names what the PICTURE is
 * (flat | render | threed | pattern), not a bench — for the picture→bench mapping see
 * `pictureBenchKind` below, which is partial on purpose.
 *
 * Returns an open string rather than `BenchKind`: an unknown kind from a newer server must compare
 * as itself, not be folded into a bench this bundle happens to know.
 */
export function benchKindOf(owner?: common_DesignBenchSlot | DesignBenchSlotRef | null): string {
  return (owner?.kind ?? '').trim().toLowerCase() || 'flat';
}

/**
 * THE BENCH THAT TAKES A PICTURE OF THIS KIND — or `null`, because not every kind has one, and
 * that is a fact of the contract rather than a gap of this map:
 *
 *   ''        → flat.  Pictures minted before the field existed, and hand uploads registered
 *               without a kind — the server reads both as flat.
 *   flat      → flat.
 *   render    → render.  (A recolor run's outputs arrive with `kind: render` — same word on the
 *               wire, same bench.)
 *   threed    → none. «A 3D frame has no slot to be put into (the bench refuses kind=threed)» —
 *               its mark is `selected`, not a slot.
 *   pattern   → none. The kind has a name of its own PRECISELY so that a repeating tile does not
 *               become selectable into a bench slot — «the front of the garment would be a square
 *               of cloth».
 *   anything newer → none. Guessing flat for a kind this bundle has not heard of is exactly the
 *               defect L-1 removes; the caller says why in place instead (`wrong_kind` is what the
 *               server would answer anyway).
 */
export function pictureBenchKind(
  picture?: Pick<common_DesignPicture, 'kind'> | null,
): BenchKind | null {
  const kind = (picture?.kind ?? '').trim().toLowerCase();
  if (!kind || kind === 'flat') return 'flat';
  if (kind === 'render') return 'render';
  return null;
}
