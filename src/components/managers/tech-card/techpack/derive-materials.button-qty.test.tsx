import type { common_TechCard } from 'api/proto-http/admin';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { deriveMaterials } from './derive-materials';
import { MaterialsPage } from './pages/materials';

const decimal = (value: string) => ({ value });

const cardWithButtons = ({ bag = false, spare = '' }: { bag?: boolean; spare?: string } = {}) =>
  ({
    id: 1,
    techCard: {
      bomItems: [
        {
          lineKey: 'BTN',
          section: 'TECH_CARD_BOM_SECTION_HARDWARE',
          kind: 'TECH_CARD_BOM_KIND_BUTTON',
          name: 'Button',
          qtyPerGarment: decimal('99'),
          spareQty: spare ? decimal(spare) : undefined,
        },
        ...(bag
          ? [
              {
                lineKey: 'SPARE_BAG',
                section: 'TECH_CARD_BOM_SECTION_PACKAGING',
                kind: 'TECH_CARD_BOM_KIND_SPARE_KIT_BAG',
                name: 'Spare kit bag',
              },
            ]
          : []),
      ],
      operations: [
        {
          operationNumber: 10,
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
          zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
          placementLayout: { count: 8 },
          bomLineKeys: ['BTN'],
        },
        {
          operationNumber: 20,
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
          zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
          placementLayout: { count: 4 },
          fastening: {
            buttonHoles: 4,
            attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_SQUARE',
          },
          bomLineKeys: ['BTN'],
        },
      ],
      callouts: [],
    },
    colorways: [],
    markers: [],
    resolvedTechnicalMedia: [],
  }) as unknown as common_TechCard;

describe('counted trims on the materials page', () => {
  it('does not count a linked buttonhole step and gives steps precedence over the slot', () => {
    const button = deriveMaterials(cardWithButtons()).hardware[0];

    expect(button.spots).toHaveLength(1);
    expect(button.spots[0].operationNumbers).toEqual([20]);
    expect(button.spots[0].qty).toBe(4);
    expect(button.qty).toBe(4);
  });

  it('adds spare and to-buy rows and names the spare kit bag', () => {
    const card = cardWithButtons({ bag: true, spare: '1' });
    const button = deriveMaterials(card).hardware[0];
    const markup = renderToStaticMarkup(
      <MaterialsPage techCard={card} orient='land' docline='' n='01' />,
    );

    expect(button).toMatchObject({ qty: 4, spareQty: 1, toBuy: 5, spareSource: 'spare kit bag' });
    expect(markup).toContain('<td data-align="left">spare</td>');
    expect(markup).toContain('spare kit bag');
    expect(markup).toContain('<td data-align="left">to buy</td>');
    expect(markup).toContain('<td>5</td>');
  });

  it('registers the missing bag gap', () => {
    const button = deriveMaterials(cardWithButtons({ spare: '1' })).hardware[0];
    expect(button.spareBagGap?.code).toBe('pdf_spare_bag_missing');
  });

  it('prints agreed button holes and pattern in the line header', () => {
    const card = cardWithButtons();
    expect(deriveMaterials(card).hardware[0].detail).toBe('4 holes · square');

    card.techCard!.operations!.push({
      ...card.techCard!.operations![1],
      operationNumber: 30,
      fastening: {
        ...card.techCard!.operations![1].fastening!,
        buttonHoles: 4,
        attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL',
      },
    });
    expect(deriveMaterials(card).hardware[0].detail).toBe('');
  });
});
