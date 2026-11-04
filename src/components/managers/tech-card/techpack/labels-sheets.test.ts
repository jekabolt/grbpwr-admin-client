import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import { deriveLabels } from './derive-labels';
import { LABEL_TABLE_COLS, planLabelSheets, qrColumns } from './labels-sheets';
import { LabelsPage } from './pages/labels';

const url = (token: string) => `https://backend-beta.grbpwr.com/api/f/${token}`;
const file = (colorwayId: number, sizeId: number) => ({
  colorwayId,
  sizeId,
  libraryFileId: colorwayId * 100 + sizeId,
  sourceHash: '',
  publicUrl: url(`t${colorwayId}x${sizeId}`),
});

const card = (over: Record<string, unknown> = {}) =>
  ({
    id: 7,
    colorways: [
      { colorwayId: 11, devName: 'black' },
      { colorwayId: 22, devName: 'white' },
    ],
    resolvedTechnicalMedia: [
      {
        kind: 'TECH_CARD_MEDIA_KIND_BACK',
        media: { id: 5, media: { fullSize: { mediaUrl: 'x.png', width: 300, height: 340 } } },
      },
    ],
    techCard: {
      name: 'test',
      sizeIds: [1, 2],
      bomItems: [{ id: 9, lineKey: 'LBL', name: 'satin ribbon', section: 'LABEL' }],
      callouts: [{ number: 3, mediaId: 5, posX: { value: '0.5' }, posY: { value: '0.25' } }],
      garmentLabels: [
        { key: 'brand', placement: 'neck', qtyPerGarment: 1, files: [file(0, 0)] },
        {
          key: 'composition',
          placement: 'left side seam',
          calloutNumber: 3,
          bomLineKey: 'LBL',
          files: [file(11, 1), file(11, 2), file(22, 1)],
        },
        { key: 'size', artworkPerSize: true, artworkPerColorway: true, files: [file(0, 0)] },
      ],
      ...over,
    },
  }) as unknown as common_TechCard;

const names = { 1: 'S', 2: 'M' };
const model = (c = card()) => deriveLabels(c, { sizeNames: names });

describe('page 05 sewn-in labels', () => {
  it('puts composition first and takes the material from the BOM line', () => {
    const [first, second] = model().sewn.table;
    expect([first.item, first.number, first.material]).toEqual([
      'composition label',
      3,
      'satin ribbon',
    ]);
    expect([second.item, second.number]).toEqual(['brand label', null]);
  });

  it('draws a dot only for a row with a pin on this flat', () => {
    expect(model().sewn.pins).toEqual([{ label: 3, x: 50, y: 25 }]);
    const elsewhere = card({
      callouts: [{ number: 3, mediaId: 6, posX: { value: '0.5' }, posY: { value: '0.25' } }],
    });
    expect(model(elsewhere).sewn.pins).toEqual([]);
    expect(model(elsewhere).sewn.table[0].number).toBe(3);
  });

  it('asks one cell per colour and size, and leaves the empty ones without a url', () => {
    const composition = model().sewn.qr.filter((l) => l.title.includes('composition'));
    expect(composition.map((l) => l.title)).toEqual([
      '3 composition label · black',
      '3 composition label · white',
    ]);
    expect(composition[1].cells.map((c) => [c.sizeLabel, !!c.url])).toEqual([
      ['S', true],
      ['M', false],
    ]);
  });

  it('never prints a QR for an old colourless file under per colour and size', () => {
    const size = model().sewn.qr.filter((l) => l.title.includes('size tag'));
    expect(size).toHaveLength(2);
    expect(size.flatMap((l) => l.cells).every((c) => !c.url)).toBe(true);
  });

  it('closes the grid with the one-file lines, marked all sizes', () => {
    const last = model().sewn.qr.at(-1);
    expect(last?.title).toBe('brand label · all sizes');
    expect(last?.cells).toHaveLength(1);
  });

  it('prints a revoked link as an empty cell', () => {
    const revoked = card({
      garmentLabels: [{ key: 'brand', files: [{ ...file(0, 0), publicUrl: '' }] }],
    });
    expect(model(revoked).sewn.qr[0].cells[0].url).toBe('');
  });

  it('does not take the composition row for the garment label placement', () => {
    expect(model().placement.name).toBe('neck');
  });

  it('flows many lines to the next sheet and keeps every line once', () => {
    const many = card({
      sizeIds: Array.from({ length: 14 }, (_, i) => i + 1),
      garmentLabels: Array.from({ length: 12 }, (_, i) => ({
        key: `other ${i + 1}`,
        placement: 'under the back yoke, on the left side, a long way from the collar seam',
        artworkPerSize: true,
      })),
    });
    for (const orient of ['land', 'port'] as const) {
      const { sewn } = deriveLabels(many, { sizeNames: names });
      const sheets = planLabelSheets(sewn, orient);
      expect(sheets.length).toBeGreaterThan(1);
      expect(sheets.flatMap((s) => s.rows)).toHaveLength(12);
      const lines = sheets.flatMap((s) => s.qr).filter((r) => r.kind === 'qr');
      expect(lines).toHaveLength(12 * Math.ceil(14 / qrColumns(orient)));
      for (const line of lines) {
        if (line.kind === 'qr') expect(line.cells.length).toBeLessThanOrEqual(qrColumns(orient));
      }
      expect(sheets[0].flat).toBe(true);
      expect(sheets.slice(1).some((s) => s.flat)).toBe(false);
    }
  });

  it('lays sizes out in grade order, whatever order the card stored them in', () => {
    const clicked = card({ sizeIds: [2, 1] });
    const sizesOf = (options: Parameters<typeof deriveLabels>[1]) =>
      deriveLabels(clicked, options)
        .sewn.qr.find((l) => l.title.includes('composition'))
        ?.cells.map((c) => c.sizeLabel);

    expect(sizesOf({ sizeNames: names })).toEqual(['S', 'M']);
    expect(sizesOf({ sizeNames: names, orderSizes: (ids) => [...ids].reverse() })).toEqual([
      'S',
      'M',
    ]);
    expect(sizesOf({ sizeNames: names, orderSizes: (ids) => [...ids] })).toEqual(['M', 'S']);
    expect(clicked.techCard?.sizeIds).toEqual([2, 1]);
  });

  it('keeps a three digit pin number on one line in the # column', () => {
    const cellPaddingPx = 12;
    const monoCharPx = 7.3;
    for (const cols of Object.values(LABEL_TABLE_COLS)) {
      expect(cols[0] - cellPaddingPx).toBeGreaterThanOrEqual(3 * monoCharPx);
    }
  });

  it('renders QR, no file, and the old layout when the card has no rows', () => {
    const page = (c: common_TechCard) =>
      renderToStaticMarkup(
        createElement(LabelsPage, {
          techCard: c,
          orient: 'land',
          docline: 'd',
          n: '05',
          sizeNames: names,
        }),
      );
    const html = page(card());
    expect((html.match(/data-label-qr-cell/g) ?? []).length).toBe(4);
    expect((html.match(/data-label-no-file/g) ?? []).length).toBe(5);
    expect(html).toContain('no file');
    expect(html).toContain('artwork qr');

    const bare = page(card({ garmentLabels: [] }));
    expect(bare).not.toContain('data-label-qr');
    expect(bare).toContain('a · identity');
  });
});
