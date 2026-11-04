// THE SEWN-IN LABEL, as data: which artwork cells a row asks for, which file fills which cell, which
// BOM line and which pin belong to it. Pure, with no form and no React: the row on the screen and the
// tech pack page read the same answers, so a cell the screen calls empty prints `no file`.
import { wireInt } from './wire-int';

/** The composition label's row key: it lives in the composition block, not in the labels list. */
export const COMPOSITION_LABEL_KEY = 'composition';

export const isCompositionLabel = (key?: string): boolean =>
  (key ?? '').trim().toLowerCase() === COMPOSITION_LABEL_KEY;

export const ALL_SIZES_LABEL = 'all sizes';

/** The card's colours and sizes, in the card's order. Ids are the same ones the files carry. */
export type LabelAxes = {
  colorways: { id: number; name: string }[];
  sizes: { id: number; label: string }[];
};

export type ArtworkFile = {
  colorwayId?: number;
  sizeId?: number;
  libraryFileId?: number;
  sourceHash?: string;
  publicUrl?: string;
};

export type ArtworkRow = {
  key?: string;
  artworkPerSize?: boolean;
  artworkPerColorway?: boolean;
  files?: ArtworkFile[];
};

export type ArtworkCell = {
  colorwayId: number;
  sizeId: number;
  sizeLabel: string;
  file?: ArtworkFile;
};

export type ArtworkLine = {
  colorwayId: number;
  colorName: string;
  cells: ArtworkCell[];
};

const axisId = (v: unknown) => wireInt(v as number | undefined);

const sameCell = (f: ArtworkFile, colorwayId: number, sizeId: number) =>
  axisId(f.colorwayId) === colorwayId && axisId(f.sizeId) === sizeId;

/**
 * The composition label is always per colour and size. Any other row splits only along an axis the
 * card actually has: a stored `per colour` on a card left with one colour reads as «one for all».
 */
export function artworkMode(
  row: ArtworkRow,
  axes: LabelAxes,
): { perColour: boolean; perSize: boolean } {
  if (isCompositionLabel(row.key)) return { perColour: true, perSize: true };
  return {
    perColour: !!row.artworkPerColorway && axes.colorways.length >= 2,
    perSize: !!row.artworkPerSize && axes.sizes.length > 0,
  };
}

/** One line per colour, one cell per size. Both axes off = one line with one cell. */
export function artworkLines(row: ArtworkRow, axes: LabelAxes): ArtworkLine[] {
  const { perColour, perSize } = artworkMode(row, axes);
  const colours = perColour ? axes.colorways : [{ id: 0, name: '' }];
  const sizes = perSize ? axes.sizes : [{ id: 0, label: ALL_SIZES_LABEL }];
  const files = row.files ?? [];
  return colours.map((c) => ({
    colorwayId: c.id,
    colorName: c.name,
    cells: sizes.map((s) => ({
      colorwayId: c.id,
      sizeId: s.id,
      sizeLabel: s.label,
      file: files.find((f) => sameCell(f, c.id, s.id)),
    })),
  }));
}

/** A cell is full only with a live link: a revoked one reads as «no file», never as a dead QR. */
export const cellIsFull = (cell: ArtworkCell): boolean => !!cell.file?.publicUrl?.trim();

export function missingFileCount(row: ArtworkRow, axes: LabelAxes): number {
  return artworkLines(row, axes)
    .flatMap((l) => l.cells)
    .filter((c) => !cellIsFull(c)).length;
}

/** Files no cell asks for now: kept after a mode change, shown apart, gone when replaced. */
export function strayFiles(row: ArtworkRow, axes: LabelAxes): ArtworkFile[] {
  const cells = artworkLines(row, axes).flatMap((l) => l.cells);
  return (row.files ?? []).filter((f) => !cells.some((c) => sameCell(f, c.colorwayId, c.sizeId)));
}

/**
 * Drop the strays the current cells fully cover: an old «any colour» file goes only once every
 * colour it stood for has its own file. Nothing else ever removes an old file on its own.
 */
export function dropReplacedFiles(row: ArtworkRow, axes: LabelAxes): ArtworkFile[] {
  const cells = artworkLines(row, axes).flatMap((l) => l.cells);
  const stray = new Set(strayFiles(row, axes));
  return (row.files ?? []).filter((f) => {
    if (!stray.has(f)) return true;
    const colorwayId = axisId(f.colorwayId);
    const sizeId = axisId(f.sizeId);
    const covered = cells.filter(
      (c) =>
        (colorwayId === 0 || c.colorwayId === colorwayId) && (sizeId === 0 || c.sizeId === sizeId),
    );
    return covered.length === 0 || !covered.every(cellIsFull);
  });
}

/** Put one file into one cell, replacing whatever sat there. */
export function withCellFile(
  row: ArtworkRow,
  axes: LabelAxes,
  file: Required<Pick<ArtworkFile, 'colorwayId' | 'sizeId'>> & ArtworkFile,
): ArtworkFile[] {
  const rest = (row.files ?? []).filter((f) => !sameCell(f, file.colorwayId, file.sizeId));
  return dropReplacedFiles({ ...row, files: [...rest, file] }, axes);
}

export type BomLineLike = { id?: number; lineKey?: string | null };

/** The row's BOM line: by line key (it may be born in this very edit), else by id. */
export function labelBomLine<T extends BomLineLike>(
  row: { bomLineKey?: string; bomItemId?: number },
  bomItems: readonly T[],
): T | undefined {
  const key = (row.bomLineKey ?? '').trim();
  if (key) {
    const hit = bomItems.find((b) => (b.lineKey ?? '').trim() === key);
    if (hit) return hit;
  }
  const id = axisId(row.bomItemId);
  return id > 0 ? bomItems.find((b) => axisId(b.id) === id) : undefined;
}

/** A coordinate: a string in the form, a decimal message on the saved card. */
type Coordinate = string | number | { value?: string } | null;

const coordinate = (value?: Coordinate): number =>
  Number(typeof value === 'object' ? value?.value : value);

export type CalloutLike = {
  number?: number;
  mediaId?: number;
  posX?: Coordinate;
  posY?: Coordinate;
};

/** Where the row's pin stands, in percent of the flat; null without a callout to stand on. */
export function labelPin(
  row: { calloutNumber?: number },
  callouts: readonly CalloutLike[],
): { number: number; mediaId: number; x: number; y: number } | null {
  const number = axisId(row.calloutNumber);
  if (!(number > 0)) return null;
  const hit = callouts.find((c) => axisId(c.number) === number);
  if (!hit) return null;
  const x = coordinate(hit.posX);
  const y = coordinate(hit.posY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { number, mediaId: axisId(hit.mediaId), x: x * 100, y: y * 100 };
}

const FLAT_ORDER = ['TECH_CARD_MEDIA_KIND_BACK', 'TECH_CARD_MEDIA_KIND_FRONT'];

/** The one flat labels are pinned on: the back carries most of them, then the front, then any. */
export function labelFlat<T extends { kind?: string | null }>(items: readonly T[]): T | undefined {
  for (const kind of FLAT_ORDER) {
    const hit = items.find((m) => m.kind === kind);
    if (hit) return hit;
  }
  return items[0];
}
