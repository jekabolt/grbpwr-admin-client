import {
  authoredAllowanceCornerMarker,
  decodeAuthoredAllowanceCorner,
  editAuthoredAllowanceCorner,
  parseAuthoredAllowanceCorner,
} from 'lib/pattern-import/manifest/authored-allowance-corner';
import { areaOf, bboxOf, pointInPolygon } from 'lib/pattern-import/semantics/geom';
import type {
  AuthoredAllowanceCorner,
  ManifestAuthoredAllowanceCorner,
  PieceSpec,
  PtMm,
  WriteJob,
} from 'lib/pattern-import/types';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function eligibleRanks(piece: PieceSpec, ranks: WriteJob['sizes']) {
  const first = piece.sizes[0];
  if (
    piece.ungraded ||
    piece.pairOf ||
    piece.pairHand ||
    piece.unfoldedFold ||
    piece.halfFold ||
    piece.allowance.origin === 'default' ||
    piece.allowance.allowanceMm <= 0 ||
    !first?.seam ||
    ranks.length !== 5 ||
    piece.sizes.length !== ranks.length ||
    !ranks.every(
      (rank) =>
        piece.sizes.filter(
          (size) =>
            size.sizeToken === rank.token && size.sizeId === rank.sizeId && size.rank === rank.rank,
        ).length === 1,
    ) ||
    !piece.sizes.every(
      (size) =>
        !size.fold &&
        !size.offset &&
        !size.continuity &&
        !size.repair &&
        !size.kinks?.length &&
        !size.cutLoops?.length &&
        !size.notches.length &&
        !size.drills.length &&
        !size.internal.length &&
        !size.textMarks?.length &&
        !size.pointMarks?.length &&
        !size.authoredOutlineCorner &&
        equal(size.cut, first.cut) &&
        equal(size.seam, first.seam) &&
        equal(size.authoredAllowanceCorner, first.authoredAllowanceCorner),
    )
  )
    return null;
  return { first, sewing: first.seam, widthMm: piece.allowance.allowanceMm };
}

export function draftSavedAllowanceCornerOptionsV1(
  piece: PieceSpec,
  ranks: WriteJob['sizes'],
): {
  at: PtMm;
  current: AuthoredAllowanceCorner | undefined;
  choices: ManifestAuthoredAllowanceCorner[];
}[] {
  const eligible = eligibleRanks(piece, ranks);
  if (!eligible) return [];
  const { first, sewing, widthMm } = eligible;
  const current = first.authoredAllowanceCorner;
  if (current && current.widthMm !== widthMm) return [];
  const selected = current
    ? [current.sewing]
    : sewing.map((at, i): AuthoredAllowanceCorner['sewing'] => [
        sewing[(i + sewing.length - 1) % sewing.length]!,
        at,
        sewing[(i + 1) % sewing.length]!,
      ]);
  return selected.flatMap((triple) => {
    const previous = current ?? ({ variant: 'auto', sewing: triple, widthMm } as const);
    const variants = current
      ? (['square', 'mitre', 'clip', 'auto'] as const)
      : (['square', 'clip'] as const);
    const choices = variants.flatMap((variant) => {
      const marker = authoredAllowanceCornerMarker({ ...previous, variant });
      return marker && editAuthoredAllowanceCorner(first.cut, sewing, previous, variant)
        ? [marker]
        : [];
    });
    return choices.length ? [{ at: triple[1], current, choices }] : [];
  });
}

/** Edits a single user-selected corner explicitly across all five identical native grades. */
export function applyDraftSavedAllowanceCornerV1(
  piece: PieceSpec,
  ranks: WriteJob['sizes'],
  selection: ManifestAuthoredAllowanceCorner,
): PieceSpec['sizes'] | null {
  const marker = parseAuthoredAllowanceCorner(selection);
  const eligible = eligibleRanks(piece, ranks);
  if (!marker || !eligible) return null;
  const option = draftSavedAllowanceCornerOptionsV1(piece, ranks).find(({ choices }) =>
    choices.some((choice) => equal(choice, marker)),
  );
  if (!option) return null;
  const { first, sewing } = eligible;
  const desired = decodeAuthoredAllowanceCorner(marker);
  const previous = option.current ?? ({ ...desired, variant: 'auto' } as const);
  const cut = editAuthoredAllowanceCorner(first.cut, sewing, previous, marker.variant);
  if (
    !cut ||
    piece.sizes.some(
      ({ grain }) =>
        grain &&
        [grain.a, grain.b].some((p) => pointInPolygon(p, first.cut) && !pointInPolygon(p, cut)),
    )
  )
    return null;
  return piece.sizes.map((size) => ({
    ...size,
    cut: cut.map((p) => ({ ...p })),
    bbox: bboxOf(cut),
    areaMm2: areaOf(cut),
    authoredAllowanceCorner: structuredClone(desired),
  }));
}
