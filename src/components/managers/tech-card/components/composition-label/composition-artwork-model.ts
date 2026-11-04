// THE COMPOSITION LABEL'S ARTWORK, as data. The mode is not stored anywhere: it reads off the files,
// so no migration and no flag can disagree with what is really in the row.
//
// An own file is one with no source hash: the generator always writes its hash, a person never does.
// Colour 0 and size 0 mean «for everything». Generated files stay in the row in every mode, so going
// back to `built` uploads nothing that is still current.
import { isOwnArtworkFile, type ArtworkFile } from '../sewn-label-model';
import { wireInt } from '../wire-int';

export type ArtworkChoice = 'built' | 'one' | 'cell';

const inCell = (f: ArtworkFile, colorwayId: number, sizeId: number) =>
  wireInt(f.colorwayId) === colorwayId && wireInt(f.sizeId) === sizeId;

/** The file for everything, when there is one. */
export const oneFileOf = (files: readonly ArtworkFile[]): ArtworkFile | undefined =>
  files.find((f) => isOwnArtworkFile(f) && inCell(f, 0, 0));

/** The own file standing in one colour × size. */
export const ownCellOf = (
  files: readonly ArtworkFile[],
  colorwayId: number,
  sizeId: number,
): ArtworkFile | undefined =>
  files.find((f) => isOwnArtworkFile(f) && inCell(f, colorwayId, sizeId));

/**
 * The file that replaces the generated label for one colour × size. The file for everything wins
 * over a cell: it is what the screen shows in that mode.
 */
export const ownFileFor = (
  files: readonly ArtworkFile[],
  colorwayId: number,
  sizeId: number,
): ArtworkFile | undefined => oneFileOf(files) ?? ownCellOf(files, colorwayId, sizeId);

/**
 * What the row is in. `pending` is a chip pressed this session with no file behind it yet: it is not
 * saved, and nothing differs on paper until a file comes.
 */
export function artworkChoice(
  files: readonly ArtworkFile[],
  pending: ArtworkChoice | null,
): ArtworkChoice {
  if (oneFileOf(files)) return 'one';
  if (pending) return pending;
  return files.some(isOwnArtworkFile) ? 'cell' : 'built';
}

/** The row's files after a chip. The library keeps whatever leaves the row. */
export function filesAfterChoice(
  files: readonly ArtworkFile[],
  choice: ArtworkChoice,
): ArtworkFile[] {
  if (choice === 'built') return files.filter((f) => !isOwnArtworkFile(f));
  if (choice === 'cell') return files.filter((f) => f !== oneFileOf(files));
  return [...files];
}

/** Put an own file into a cell, or at colour 0 size 0 for everything. */
export function filesWithOwn(
  files: readonly ArtworkFile[],
  file: { colorwayId: number; sizeId: number; libraryFileId: number; publicUrl: string },
): ArtworkFile[] {
  return [
    ...files.filter((f) => !inCell(f, file.colorwayId, file.sizeId)),
    { ...file, sourceHash: '' },
  ];
}

/** Take an own file out of a cell. The generated file of that cell comes back with `rebuild`. */
export const filesWithoutOwn = (
  files: readonly ArtworkFile[],
  colorwayId: number,
  sizeId: number,
): ArtworkFile[] => files.filter((f) => !(isOwnArtworkFile(f) && inCell(f, colorwayId, sizeId)));

/** The cell the panel opens on: the first own cell, else the first of all. */
export function firstCell(
  files: readonly ArtworkFile[],
  colorwayIds: readonly number[],
  sizeIds: readonly number[],
): { colorwayId: number; sizeId: number } | null {
  for (const colorwayId of colorwayIds) {
    for (const sizeId of sizeIds) {
      if (ownCellOf(files, colorwayId, sizeId)) return { colorwayId, sizeId };
    }
  }
  const [colorwayId] = colorwayIds;
  const [sizeId] = sizeIds;
  return colorwayId !== undefined && sizeId !== undefined ? { colorwayId, sizeId } : null;
}
