import type { common_TechCard } from 'api/proto-http/admin';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import {
  artworkLines,
  cellIsFull,
  isCompositionLabel,
  labelBomLine,
  labelPin,
  type ArtworkRow,
  type LabelAxes,
} from 'components/managers/tech-card/components/sewn-label-model';
import {
  garmentLabelKindNames,
  kindLabel,
} from 'components/managers/tech-card/components/tech-card-options';
import { wireInt } from 'components/managers/tech-card/components/wire-int';

// THE SEWN-IN LABELS, one reading for the paper that has no tech pack behind it. It stays free of the
// tech pack's language bundle: the run pack's print route loads it.

const clean = (value?: string | null): string => (value ?? '').trim();

export type LabelFact = ReturnType<typeof labelFacts>[number];

/** The composition row first, as on the card's own label page. The material comes from the BOM line. */
export function labelFacts(techCard: common_TechCard | undefined) {
  const card = techCard?.techCard;
  const stored = card?.garmentLabels ?? [];
  const rows = [
    ...stored.filter((row) => isCompositionLabel(row.key)),
    ...stored.filter((row) => !isCompositionLabel(row.key)),
  ];
  return rows.map((row, index) => ({
    key: clean(row.key) || `label-${index}`,
    number: labelPin(row, card?.callouts ?? [])?.number ?? null,
    item: kindLabel(garmentLabelKindNames, row.key),
    placement: clean(row.placement),
    attachment: clean(row.attachment),
    folding: clean(row.folding),
    size: clean(row.size),
    material: clean(labelBomLine(row, card?.bomItems ?? [])?.name),
    quantity: wireInt(row.qtyPerGarment),
    note: clean(row.note),
  }));
}

export type ArtworkTile = {
  key: string;
  caption: string;
  /** Empty: the label has artwork, but none for this cell. It prints `no file`, never a dead QR. */
  url: string;
};

type LabelArtworkRow = ArtworkRow & { calloutNumber?: number };

/**
 * One tile per artwork cell the paper is about. `inScope` gets 0 for an axis the label does not split
 * along. A label with no artwork at all has no tile: it has nothing to scan. The caption names only
 * the axes the paper's own title cannot name for it.
 */
export function labelArtworkTiles({
  rows,
  axes,
  callouts,
  inScope,
  nameColour,
  nameSize,
}: {
  rows: readonly LabelArtworkRow[];
  axes: LabelAxes;
  /** With callouts the caption carries the label's pin number, as the numbered table does. */
  callouts?: Parameters<typeof labelPin>[1];
  inScope: (colorwayId: number, sizeId: number) => boolean;
  nameColour: boolean;
  nameSize: boolean;
}): ArtworkTile[] {
  return rows.flatMap((row, index) => {
    if (!(row.files ?? []).length) return [];
    const number = callouts ? labelPin(row, callouts)?.number : undefined;
    const item = kindLabel(garmentLabelKindNames, row.key);
    return artworkLines(row, axes).flatMap((line) =>
      line.cells
        .filter((cell) => inScope(cell.colorwayId, cell.sizeId))
        .map((cell) => ({
          key: `${clean(row.key) || index}-${cell.colorwayId}-${cell.sizeId}`,
          caption: [
            [number, item].filter((word) => word != null).join(' '),
            nameColour && cell.colorwayId > 0 ? line.colorName : '',
            nameSize && cell.sizeId > 0 ? cell.sizeLabel : '',
          ]
            .filter(Boolean)
            .join(' · '),
          url: cellIsFull(cell)
            ? publicFilePageUrl(clean(cell.file?.publicUrl)) || clean(cell.file?.publicUrl)
            : '',
        })),
    );
  });
}

/** The colours and sizes a paper covers. An axis with nothing named means the whole axis. */
export function artworkScope(colorwayIds: readonly number[], sizeIds: readonly number[]) {
  return {
    inScope: (colorwayId: number, sizeId: number) =>
      (!colorwayId || !colorwayIds.length || colorwayIds.includes(colorwayId)) &&
      (!sizeId || !sizeIds.length || sizeIds.includes(sizeId)),
    nameColour: colorwayIds.length !== 1,
    nameSize: sizeIds.length !== 1,
  };
}
