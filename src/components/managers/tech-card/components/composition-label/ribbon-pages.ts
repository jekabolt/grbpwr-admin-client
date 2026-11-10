// THE BUILT COMPOSITION LABEL AS PAGES. Built ribbons are never stored as files: they exist only as
// the plan. The LABELS section draws them page by page — A, then B, B2, B3 … — each page its face,
// the back when a ribbon has no face. One colour and one size stand for the row: the first colour
// the plan has a set for, the first size of the card.
import type { PaperDoc } from '../../assembly-print/paper';
import { previewASides, type PlannedSide, type PrintSet } from '../../care-labels/pages';

const faceFirst = (sides: readonly PlannedSide[]): PaperDoc | undefined =>
  (sides.find((p) => p.role === 'face') ?? sides.find((p) => p.role === 'back'))?.side.doc;

/** The ribbon docs of one set and size, in page order. */
export function ribbonPagesOf(set: PrintSet | undefined, sizeId: number | undefined): PaperDoc[] {
  if (!set || sizeId == null) return [];
  const out: PaperDoc[] = [];
  const { face, back } = previewASides(set, sizeId);
  const a = (face ?? back)?.side.doc;
  if (a) out.push(a);
  const byLabel = new Map<string, PlannedSide[]>();
  for (const p of set.sides.values()) {
    if (p.label === 'A') continue;
    byLabel.set(p.label, [...(byLabel.get(p.label) ?? []), p]);
  }
  const labels = [...byLabel.keys()].sort(
    (x, y) => Number(x.slice(1) || 1) - Number(y.slice(1) || 1),
  );
  for (const label of labels) {
    const doc = faceFirst(byLabel.get(label)!);
    if (doc) out.push(doc);
  }
  return out;
}

/** The pages of the row: the first colour with a set, the first size. */
export function builtRibbonPages(
  sets: ReadonlyMap<number, PrintSet> | undefined,
  colorwayIds: readonly number[],
  sizeIds: readonly number[],
): PaperDoc[] {
  if (!sets) return [];
  const colorwayId = colorwayIds.find((id) => sets.has(id));
  if (colorwayId == null) return [];
  return ribbonPagesOf(sets.get(colorwayId), sizeIds[0]);
}
