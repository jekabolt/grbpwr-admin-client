import type {
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardGarmentLabel,
} from 'api/proto-http/admin';
import { TechPackLabelSheets } from 'components/managers/tech-card/components/tech-pack-labels';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { artworkScope, labelArtworkTiles, labelFacts } from './label-facts';
import { ArtworkQr, RunLabelsSheet } from './labels';

const file = (colorwayId: number, sizeId: number, name = 'f') => ({
  id: colorwayId * 100 + sizeId,
  colorwayId,
  sizeId,
  fileId: 1,
  publicUrl: `https://cdn.test/${name}-${colorwayId}-${sizeId}.pdf`,
});

const row = (values: Partial<common_TechCardGarmentLabel>) => values as common_TechCardGarmentLabel;

const composition = row({
  key: 'composition',
  calloutNumber: 16,
  artworkPerSize: true,
  artworkPerColorway: true,
  placement: 'left side seam',
  bomLineKey: 'B1',
  qtyPerGarment: 1,
  files: [file(10, 1), file(10, 2), file(11, 1), file(11, 2)] as never,
});
const size = row({
  key: 'size',
  calloutNumber: 17,
  artworkPerSize: true,
  note: 'clearly test',
  files: [file(0, 1), file(0, 2)] as never,
});
const flag = row({ key: 'flag', artworkPerColorway: true, files: [file(10, 0)] as never });
const brand = row({ key: 'brand', files: [file(0, 0)] as never });
const hangtag = row({ key: 'hangtag', files: [] });

const card = {
  techCard: {
    garmentLabels: [size, composition],
    bomItems: [{ lineKey: 'B1', name: 'care tape' }],
    callouts: [
      { number: 16, posX: 1, posY: 1 },
      { number: 17, posX: 1, posY: 1 },
    ],
  },
} as unknown as common_TechCard;

const axes = {
  colorways: [
    { id: 10, name: 'Mustard' },
    { id: 11, name: 'Black' },
  ],
  sizes: [
    { id: 1, label: 'S' },
    { id: 2, label: 'M' },
  ],
};

describe('labelFacts', () => {
  it('puts the composition row first and reads the material from the BOM line', () => {
    const [first, second] = labelFacts(card);
    expect(first).toMatchObject({ key: 'composition', material: 'care tape', quantity: 1 });
    expect(second).toMatchObject({ key: 'size', material: '', note: 'clearly test' });
  });

  it('carries a label pin number only when the pin exists', () => {
    const facts = labelFacts({
      techCard: { garmentLabels: [row({ key: 'brand', calloutNumber: 99 })], callouts: [] },
    } as unknown as common_TechCard);
    expect(facts[0].number).toBeNull();
  });
});

describe('labelArtworkTiles', () => {
  const run = (colours: number[], sizes: number[]) =>
    labelArtworkTiles({
      rows: [composition, size, flag, brand, hangtag],
      axes,
      ...artworkScope(colours, sizes),
    });

  it('keeps one colour and one size and lets the title name them', () => {
    const tiles = run([10], [2]);
    expect(tiles.map((t) => t.caption)).toEqual([
      'composition label',
      'size tag',
      'flag label',
      'brand label',
    ]);
    expect(tiles[0].url).toContain('f-10-2');
    expect(tiles[1].url).toContain('f-0-2');
  });

  it('names the colour and the size when the paper covers several', () => {
    const tiles = run([], []);
    expect(tiles.map((t) => t.caption)).toContain('composition label · Black · M');
    expect(tiles.map((t) => t.caption)).toContain('size tag · S');
    expect(tiles.map((t) => t.caption)).toContain('brand label');
  });

  it('prints the pin number when the paper is numbered', () => {
    const tiles = labelArtworkTiles({
      rows: [composition, brand],
      axes,
      callouts: card.techCard?.callouts ?? [],
      ...artworkScope([10], [2]),
    });
    expect(tiles.map((t) => t.caption)).toEqual(['16 composition label', 'brand label']);
  });

  it('skips a label with no artwork at all', () => {
    expect(run([], []).some((t) => t.caption.startsWith('Hangtag'))).toBe(false);
    expect(run([], []).some((t) => t.key.startsWith('hangtag'))).toBe(false);
  });

  it('keeps a gap in a label that has other files, as a tile with no address', () => {
    const tiles = run([11], [2]);
    const gap = tiles.find((t) => t.key === 'flag-11-0');
    expect(gap?.url).toBe('');
  });
});

describe('ArtworkQr', () => {
  it('prints a QR for a file and the word for a gap', () => {
    const html = renderToStaticMarkup(
      <ArtworkQr
        title='artwork qr'
        tiles={[
          { key: 'a', caption: 'size tag', url: 'https://cdn.test/a.pdf' },
          { key: 'b', caption: 'flag label', url: '' },
        ]}
      />,
    );
    expect(html).toContain('data-artwork-qr-cell="a"');
    expect(html).toContain('data-artwork-no-file="b"');
    expect(html).toContain('no file');
  });

  it('prints nothing with no tiles', () => {
    expect(renderToStaticMarkup(<ArtworkQr title='artwork qr' tiles={[]} />)).toBe('');
  });
});

describe('RunLabelsSheet', () => {
  it('prints the note and the material of every label', () => {
    const html = renderToStaticMarkup(
      <RunLabelsSheet rows={labelFacts(card)} qrTitle='artwork qr · Mustard · M' tiles={[]} />,
    );
    for (const text of ['care tape', 'clearly test', 'left side seam', '>16<'])
      expect(html).toContain(text);
  });

  it('is absent on a card with no labels', () => {
    expect(renderToStaticMarkup(<RunLabelsSheet rows={[]} qrTitle='x' tiles={[]} />)).toBe('');
  });
});

describe('classic labels sheet', () => {
  const render = (labels: common_TechCardGarmentLabel[]) =>
    renderToStaticMarkup(
      <TechPackLabelSheets
        summary={null}
        hasColorway
        labels={labels}
        bomItems={[{ lineKey: 'B1', name: 'care tape' } as common_TechCardBomItem]}
        artwork={[{ key: 'a', caption: 'size tag', url: 'https://cdn.test/a.pdf' }]}
        items={[]}
        urlOf={() => ''}
        colourName={() => ''}
        careArt={(code) => ({ name: code })}
        showLabels
        showItems={false}
      />,
    );

  it('prints the material and the artwork QR under the table', () => {
    const html = render([row({ key: 'size', bomLineKey: 'B1' })]);
    expect(html).toContain('>material<');
    expect(html).toContain('care tape');
    expect(html).toContain('data-artwork-qr-cell="a"');
  });

  it('drops the mockup column when no label has one', () => {
    expect(render([row({ key: 'size' })])).not.toContain('>mockup<');
    expect(render([row({ key: 'size', mediaIds: [7] })])).toContain('>mockup<');
  });

  it('never lists the composition row, its own sheet prints it', () => {
    const html = render([row({ key: 'composition', placement: 'side seam' })]);
    expect(html).not.toContain('side seam');
  });
});
