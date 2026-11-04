import type {
  common_TechCard,
  common_TechCardPackaging,
  common_TechCardPackagingItem,
} from 'api/proto-http/admin';
import { TechPackLabelSheets } from 'components/managers/tech-card/components/tech-pack-labels';
import { PackagingPage } from 'components/managers/tech-card/techpack/pages/packaging';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PackagingSheet } from './packaging';
import { packagingItemFacts, packagingItemInScope } from './packaging-items';

const item = (over: Partial<common_TechCardPackagingItem>) => over as common_TechCardPackagingItem;
const facts = (over: Partial<common_TechCardPackaging>) => over as common_TechCardPackaging;
const aux = item({ key: 'hang_tag', auxTechCardId: 7, pickedName: 'Octagon S', qtyPerGarment: 1 });
const box = item({
  key: 'box',
  materialId: 4,
  pickedName: 'Shipping Box',
  qtyPerGarment: 1,
  perOrder: true,
  colorwayIds: [2],
});

describe('packagingItemFacts', () => {
  it('names an item from an auxiliary card, which has no BOM line', () => {
    expect(packagingItemFacts(aux)).toMatchObject({
      what: 'Octagon S',
      quantity: 1,
      perOrder: false,
      colorwayIds: [],
    });
  });

  it('falls back to the kind and to one piece', () => {
    expect(packagingItemFacts(item({ key: 'box' }))).toMatchObject({
      item: 'box',
      what: 'box',
      quantity: 1,
    });
  });
});

describe('packagingItemInScope', () => {
  it('keeps an item of another colour out of a run of one colour', () => {
    expect(packagingItemInScope(box, [1])).toBe(false);
    expect(packagingItemInScope(box, [1, 2])).toBe(true);
  });

  it('keeps an item for all colours, and everything when no colour is in scope', () => {
    expect(packagingItemInScope(aux, [1])).toBe(true);
    expect(packagingItemInScope(box, [])).toBe(true);
  });
});

describe('PackagingSheet', () => {
  const line = { ...packagingItemFacts(box), colours: 'white' };
  const packaging = facts({
    foldingMethod: 'flat',
    packedSize: '30 x 20 cm',
    notes: 'tape twice',
  });

  it('prints the items, the packed size and the carton note', () => {
    const html = renderToStaticMarkup(
      <PackagingSheet title='run packaging' packaging={packaging} items={[line]} />,
    );
    for (const text of [
      'Shipping Box',
      'order',
      'white',
      '30 x 20 cm',
      'carton note',
      'tape twice',
    ])
      expect(html).toContain(text);
  });

  it('prints the items when the card has no packaging facts', () => {
    const html = renderToStaticMarkup(<PackagingSheet title='run packaging' items={[line]} />);
    expect(html).toContain('Shipping Box');
    expect(html).not.toContain('not described');
  });

  it('adds nothing to a sheet without them', () => {
    const html = renderToStaticMarkup(
      <PackagingSheet title='packaging' packaging={facts({ foldingMethod: 'flat' })} />,
    );
    for (const text of ['data-run-items', 'packed size', 'carton note'])
      expect(html).not.toContain(text);
  });
});

describe('tech pack 05b carton', () => {
  const render = (notes?: string) =>
    renderToStaticMarkup(
      <PackagingPage
        techCard={{ techCard: { packaging: { boxMarking: 'style', notes } } } as common_TechCard}
        orient='land'
        docline='d'
        n='05'
      />,
    );

  it('prints the carton note only when there is one', () => {
    expect(render('tape twice')).toContain('tape twice');
    expect(render()).not.toContain('>note<');
  });
});

describe('classic packaging items sheet', () => {
  const render = (items: common_TechCardPackagingItem[]) =>
    renderToStaticMarkup(
      <TechPackLabelSheets
        summary={null}
        hasColorway
        labels={[]}
        bomItems={[]}
        artwork={[]}
        items={items}
        urlOf={() => ''}
        colourName={(id) => (id === 2 ? 'white' : '')}
        careArt={(code) => ({ name: code })}
        showLabels={false}
        showItems
      />,
    );

  it('names the picked item, the colour and a per order quantity', () => {
    const html = render([box, aux]);
    for (const text of ['Shipping Box', 'white', '1 / order', 'Octagon S'])
      expect(html).toContain(text);
  });

  it('shows the picture of the picked item instead of no mockup', () => {
    const html = render([
      item({
        key: 'box',
        pickedThumbnail: { media: { thumbnail: { mediaUrl: 'https://a.example/box.png' } } },
      } as Partial<common_TechCardPackagingItem>),
    ]);
    expect(html).toContain('https://a.example/box.png');
    expect(html).not.toContain('no mockup');
  });

  it('keeps one word when the item was never picked', () => {
    const html = render([item({ key: 'box', qtyPerGarment: 2 })]);
    expect((html.match(/>box</g) ?? []).length).toBe(1);
    expect(html).not.toContain('/ order');
  });
});
