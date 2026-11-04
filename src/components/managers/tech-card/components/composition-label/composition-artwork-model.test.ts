import { describe, expect, it } from 'vitest';
import { artworkLines, artworkMode } from '../sewn-label-model';
import {
  artworkChoice,
  filesAfterChoice,
  filesWithOwn,
  filesWithoutOwn,
  firstCell,
  oneFileOf,
  ownCellOf,
  ownFileFor,
} from './composition-artwork-model';

const built = (colorwayId: number, sizeId: number, libraryFileId = colorwayId * 100 + sizeId) => ({
  colorwayId,
  sizeId,
  libraryFileId,
  sourceHash: `h${libraryFileId}`,
  publicUrl: `https://x/${libraryFileId}`,
});
const own = (colorwayId: number, sizeId: number, libraryFileId = 9000 + sizeId) => ({
  colorwayId,
  sizeId,
  libraryFileId,
  sourceHash: '',
  publicUrl: `https://x/${libraryFileId}`,
});
const axes = {
  colorways: [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
  ],
  sizes: [
    { id: 10, label: 'S' },
    { id: 11, label: 'M' },
  ],
};

describe('composition artwork mode', () => {
  it('reads off the files', () => {
    expect(artworkChoice([built(1, 10)], null)).toBe('built');
    expect(artworkChoice([built(1, 10), own(1, 11)], null)).toBe('cell');
    expect(artworkChoice([built(1, 10), own(0, 0)], null)).toBe('one');
  });

  it('a chip with no file behind it holds until the file says otherwise', () => {
    expect(artworkChoice([built(1, 10)], 'one')).toBe('one');
    expect(artworkChoice([built(1, 10)], 'cell')).toBe('cell');
    expect(artworkChoice([own(0, 0)], 'cell')).toBe('one');
  });

  it('a generated file at colour 0 size 0 is not the file for everything', () => {
    expect(oneFileOf([built(0, 0)])).toBeUndefined();
    expect(artworkChoice([built(0, 0)], null)).toBe('built');
  });

  it('a row with no library file is not an own file', () => {
    expect(ownCellOf([{ colorwayId: 1, sizeId: 10, sourceHash: '' }], 1, 10)).toBeUndefined();
  });
});

describe('chips', () => {
  const files = [built(1, 10), own(1, 11), own(0, 0)];

  it('built drops every own file and keeps the generated ones', () => {
    expect(filesAfterChoice(files, 'built')).toEqual([built(1, 10)]);
  });

  it('per cell drops only the file for everything', () => {
    expect(filesAfterChoice(files, 'cell')).toEqual([built(1, 10), own(1, 11)]);
  });

  it('one file drops nothing', () => {
    expect(filesAfterChoice(files, 'one')).toEqual(files);
  });
});

describe('own file in a cell', () => {
  it('replaces what stood in the cell and writes no hash', () => {
    const next = filesWithOwn([built(1, 10), built(1, 11)], {
      colorwayId: 1,
      sizeId: 10,
      libraryFileId: 7,
      publicUrl: 'https://x/7',
    });
    expect(next).toEqual([
      built(1, 11),
      { colorwayId: 1, sizeId: 10, libraryFileId: 7, publicUrl: 'https://x/7', sourceHash: '' },
    ]);
  });

  it('use built takes the own file out and nothing else', () => {
    const next = filesWithoutOwn([built(1, 10), own(1, 11)], 1, 11);
    expect(next).toEqual([built(1, 10)]);
    expect(filesWithoutOwn([built(1, 10)], 1, 10)).toEqual([built(1, 10)]);
  });

  it('the file for everything wins over a cell', () => {
    const files = [own(1, 10, 1), own(0, 0, 2)];
    expect(ownFileFor(files, 1, 10)?.libraryFileId).toBe(2);
    expect(ownFileFor(files, 2, 11)?.libraryFileId).toBe(2);
    expect(ownFileFor([own(1, 10, 1)], 2, 11)).toBeUndefined();
  });

  it('the panel opens on the first own cell, else the first of all', () => {
    expect(firstCell([own(2, 11)], [1, 2], [10, 11])).toEqual({ colorwayId: 2, sizeId: 11 });
    expect(firstCell([built(2, 11)], [1, 2], [10, 11])).toEqual({ colorwayId: 1, sizeId: 10 });
    expect(firstCell([], [], [10])).toBeNull();
  });
});

describe('sheet 05 reads the same files', () => {
  it('asks one cell for one file, and every cell otherwise', () => {
    const row = { key: 'composition', files: [own(0, 0, 5)] };
    expect(artworkMode(row, axes)).toEqual({ perColour: false, perSize: false });
    const lines = artworkLines(row, axes);
    expect(lines).toHaveLength(1);
    expect(lines[0].cells).toHaveLength(1);
    expect(lines[0].cells[0].file?.libraryFileId).toBe(5);

    const cells = artworkLines({ key: 'composition', files: [own(1, 10, 6)] }, axes);
    expect(cells.flatMap((l) => l.cells)).toHaveLength(4);
    expect(cells[0].cells[0].file?.libraryFileId).toBe(6);
  });
});
