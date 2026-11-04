import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { derivePackaging } from './derive-packaging';
import { GapSink } from './gaps';

const media = (id: number, url: string) => ({
  id,
  media: { thumbnail: { mediaUrl: url, width: 120, height: 120 } },
});

describe('derivePackaging', () => {
  it('derives picks, colour scope, packed facts and resolved photos', () => {
    const card = {
      techCard: {
        packaging: {
          foldingMethod: 'folded in three',
          packedSize: '30 × 20 × 5 cm',
          packedMediaId: 9,
          weightNetGrams: 300,
          weightGrossGrams: 360,
          unitsPerBox: 12,
          boxDimensions: '60 × 40 × 30 cm',
          boxMarking: 'style + qty',
        },
        packagingItems: [
          {
            key: 'tissue',
            materialId: 4,
            pickedName: 'Black tissue',
            pickedThumbnail: media(8, 'https://assets.example/tissue.png'),
            qtyPerGarment: 2,
            colorwayIds: [2],
            size: '50 × 70 cm',
            packing: 'face up',
            note: 'logo visible',
          },
          { key: 'box', auxTechCardId: 7, pickedName: 'Box M', qtyPerGarment: 1, perOrder: true },
        ],
      },
      colorways: [
        { colorwayId: 1, devName: 'Ecru' },
        { colorwayId: 2, devName: 'Black' },
      ],
      resolvedLabelMedia: [{ media: media(9, 'https://assets.example/packed.png') }],
    } as unknown as common_TechCard;

    const model = derivePackaging(card);

    expect(model.showColour).toBe(true);
    expect(model.items[0]).toMatchObject({
      item: 'tissue paper',
      what: 'Black tissue',
      quantity: 2,
      perOrder: false,
      colours: ['Black'],
      size: '50 × 70 cm',
      how: 'face up',
      note: 'logo visible',
    });
    expect(model.items[0].picture?.url).toBe('https://assets.example/tissue.png');
    expect(model.items[1]).toMatchObject({
      item: 'box',
      what: 'Box M',
      perOrder: true,
      allColours: true,
    });
    expect(model.packed).toMatchObject({
      ships: 'folded in three',
      size: '30 × 20 × 5 cm',
      netGrams: 300,
      grossGrams: 360,
    });
    expect(model.packed.photo?.url).toBe('https://assets.example/packed.png');
    expect(model.carton).toEqual({ units: 12, box: '60 × 40 × 30 cm', marking: 'style + qty' });
    expect(model.missing).toBeUndefined();
  });

  it('registers the 05b gap when no packaging is chosen', () => {
    const sink = new GapSink();
    const model = derivePackaging(
      { techCard: { packagingItems: [] } } as unknown as common_TechCard,
      sink,
    );

    expect(model.missing).toMatchObject({
      code: 'pdf_packaging_missing',
      section: '05b',
      target: { tab: 'labels', field: 'packagingItems' },
    });
    expect(sink.list()).toEqual([model.missing]);
  });
});
