import { describe, expect, it } from 'vitest';
import { manifestCsv, MANIFEST_HEADER } from './manifest';
import { describePageSize, ownExtension, planOwnFiles } from './own-files';
import { sizeStem, type PrintSet } from './pages';
import { colorwayFolder } from './print-job';
import { archiveCounts, readmeText } from './readme';

const data = {
  colorways: [
    { id: 1, baseSku: 'SKU1', colourName: 'BLACK' },
    { id: 2, baseSku: 'SKU2', colourName: 'BONE' },
  ],
  sizes: [
    { id: 10, label: 'S', name: 's', skuOrd: 1 },
    { id: 11, label: 'M', name: 'm', skuOrd: 2 },
  ],
} as never;
const own = (colorwayId: number, sizeId: number, libraryFileId: number) => ({
  colorwayId,
  sizeId,
  libraryFileId,
  sourceHash: '',
  publicUrl: 'https://x',
});
const cells = { 1: { 10: 4, 11: 0 }, 2: { 10: 2, 11: 3 } };

describe('planOwnFiles', () => {
  it('a cell file lies in its colour folder, and a cell with 0 copies gives no file', () => {
    const planned = planOwnFiles({
      files: [own(1, 10, 7), own(1, 11, 8)],
      data,
      cells,
    });
    expect(planned).toHaveLength(1);
    expect(planned[0].libraryFileId).toBe(7);
    expect(planned[0].copies).toBe(4);
    expect(planned[0].stem).toBe(
      `${colorwayFolder('SKU1', 'BLACK', 1)}/own-${sizeStem({ sizeId: 10, label: 'S', skuOrd: 1 })}`,
    );
    expect(planned[0].rows).toEqual([
      expect.objectContaining({ colorwaySku: 'SKU1', colour: 'BLACK', size: 'S', copies: 4 }),
    ]);
  });

  it('the file for everything lies once with the sum and a row per real cell', () => {
    const planned = planOwnFiles({ files: [own(0, 0, 5), own(1, 10, 7)], data, cells });
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ libraryFileId: 5, stem: 'own-all', copies: 9 });
    expect(planned[0].rows.map((r) => `${r.colour}:${r.size}:${r.copies}`)).toEqual([
      'BLACK:S:4',
      'BONE:S:2',
      'BONE:M:3',
    ]);
  });

  it('no copies, no file', () => {
    expect(planOwnFiles({ files: [own(0, 0, 5)], data, cells: {} })).toEqual([]);
  });

  it('generated files are not own files', () => {
    const files = [{ colorwayId: 1, sizeId: 10, libraryFileId: 7, sourceHash: 'h' }];
    expect(planOwnFiles({ files, data, cells })).toEqual([]);
  });
});

describe('ownExtension', () => {
  it('takes it from the name, in a form safe for a path', () => {
    expect(ownExtension('Label.PDF', '')).toBe('pdf');
    expect(ownExtension('a.b.png', 'application/pdf')).toBe('png');
  });
  it('falls back to the type', () => {
    expect(ownExtension('label', 'application/pdf')).toBe('pdf');
    expect(ownExtension('label', 'image/jpeg')).toBe('jpg');
    expect(ownExtension('la.b/../x', 'image/png')).toBe('png');
    expect(ownExtension('label', 'text/plain')).toBe('bin');
  });
});

describe('describePageSize', () => {
  it('takes the label either way round, within a millimetre', () => {
    expect(describePageSize(100, 30)).toEqual({ text: '100 x 30 mm', ok: true });
    expect(describePageSize(30.4, 99.6).ok).toBe(true);
  });
  it('says anything else', () => {
    expect(describePageSize(210, 297)).toEqual({ text: '210 x 297 mm', ok: false });
  });
});

const emptySet = (mode: 'duplex' | 'simplex'): PrintSet =>
  ({ mode, sides: new Map(), files: [], holes: [] }) as never;
const ownFile = {
  path: 'own-all.pdf',
  copies: 9,
  size: '210 x 297 mm',
  warning: 'own-all.pdf is 210 x 297 mm, not 100 x 30 mm',
  rows: [{ colorwaySku: 'SKU1', variantSku: 'SKU1-1', colour: 'BLACK', size: 'S', copies: 4 }],
};

describe('manifest and README', () => {
  it('a manifest row per colour and size of an own file', () => {
    const csv = manifestCsv(emptySet('duplex'), new Map(), [ownFile]);
    const [header, row] = csv.trim().split(/\r?\n/);
    expect(header).toBe(MANIFEST_HEADER.join(','));
    expect(row).toBe('SKU1,SKU1-1,BLACK,S,own,as supplied,4,own-all.pdf');
  });

  it('no own files leaves the manifest as it was', () => {
    const csv = manifestCsv(emptySet('duplex'), new Map());
    expect(csv.trim()).toBe(MANIFEST_HEADER.join(','));
  });

  it('no generated file means no alignment test is counted', () => {
    expect(archiveCounts(emptySet('duplex')).pdfFiles).toBe(0);
  });

  const readme = (o?: (typeof ownFile)[]) =>
    readmeText({
      style: 'S',
      styleName: 'N',
      mode: 'duplex',
      counts: archiveCounts(emptySet('duplex')),
      qrTemplate: 'q',
      generatedAt: new Date(0),
      adminUrl: 'u',
      warnings: [],
      own: o,
    });

  it('the README names the own file, its copies, and a wrong size as a warning', () => {
    const text = readme([ownFile]);
    expect(text).toContain('OWN FILES');
    expect(text).toContain('own-all.pdf - 9 copies - 210 x 297 mm');
    expect(text).toContain('- own-all.pdf is 210 x 297 mm, not 100 x 30 mm');
  });

  it('no own files, no section', () => {
    expect(readme()).not.toContain('OWN FILES');
    expect(readme([])).toBe(readme());
    expect(readme()).toContain('- none');
  });
});
