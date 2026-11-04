import { describe, expect, it } from 'vitest';
import type { CareLabelData } from '../../care-labels/adapter';
import { compositionLabelSummary, sizesInOrder } from './label-summary';

// The grade: XS, S, M, L, XL. A card keeps sizes in the order they were clicked.
const GRADE = [2, 3, 4, 5, 6];
const orderSizes = (ids: number[]) => [...ids].sort((a, b) => GRADE.indexOf(a) - GRADE.indexOf(b));

const size = (id: number, label: string) => ({ id, label, name: label.toLowerCase() });

const data = {
  styleNumber: 'SS25-00034',
  sizes: [size(4, 'M'), size(5, 'L'), size(3, 'S'), size(2, 'XS'), size(6, 'XL')],
  colorways: [{ id: 35, baseSku: 'SS25-00034-MUS', colourName: 'Mustard', usages: [] }],
  bom: [],
  materials: new Map(),
  fibers: new Map(),
  care: { codes: [], prose: [], proseOverridden: false },
  label: {
    caption: [],
    address: [],
    logoMediaId: 0,
    qr: { qrPreset: 'storefront', qrUrlTemplate: '' },
  },
} as unknown as CareLabelData;

const productLine = (input: CareLabelData) =>
  compositionLabelSummary(input, 35)?.lines.find((l) => l.line === 'product')?.value[0];

describe('sizesInOrder', () => {
  it('prints the product line in grade order, whatever order the sizes were clicked', () => {
    expect(productLine(sizesInOrder(data, orderSizes))).toBe(
      'SS25-00034-MUS / MUSTARD / [XS · S · M · L · XL]',
    );
  });

  it('leaves the card data as it was, the tab block still reads it', () => {
    sizesInOrder(data, orderSizes);
    expect(data.sizes.map((s) => s.label)).toEqual(['M', 'L', 'S', 'XS', 'XL']);
  });

  it('loses no size', () => {
    expect(sizesInOrder(data, orderSizes).sizes).toHaveLength(5);
  });
});
