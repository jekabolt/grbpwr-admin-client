import type { common_TechCardGarmentLabel } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { garmentLabelSchema, garmentLabelsOut, garmentLabelsToForm } from './labels-schema';

const wireLabel = {
  key: 'brand',
  attachment: 'on_fabric_piece',
  widthMm: { value: '30' },
  heightMm: { value: '50' },
  pieceBomItemId: 17,
  pieceWidthMm: { value: '40' },
  pieceHeightMm: { value: '70' },
  pieceSeamMm: { value: '8' },
  labelXMm: { value: '5' },
  labelYMm: { value: '12' },
  labelOnPiece: '4_sides',
  prints: [
    {
      id: 9,
      name: 'logo.svg',
      libraryFileId: 101,
      method: 'screen',
      colour: 'black',
      widthMm: { value: '20' },
      heightMm: { value: '6' },
      xMm: { value: '5' },
      yMm: { value: '4' },
    },
    {
      id: 10,
      name: 'size.svg',
      libraryFileId: 102,
      method: 'heat_transfer',
      colour: 'pms 877 silver',
      widthMm: { value: '8' },
      heightMm: { value: '6' },
      xMm: { value: '11' },
      yMm: { value: '20' },
    },
  ],
} as unknown as common_TechCardGarmentLabel;

describe('garment label piece and prints wire mapping', () => {
  it('blocks invalid piece and print geometry', () => {
    const [form] = garmentLabelsToForm([wireLabel]);
    expect(garmentLabelSchema.safeParse(form).success).toBe(true);
    expect(garmentLabelSchema.safeParse({ ...form, labelYMm: '7' }).success).toBe(false);
    expect(
      garmentLabelSchema.safeParse({
        ...form,
        prints: form.prints?.map((print, index) => (index === 0 ? { ...print, xMm: '25' } : print)),
      }).success,
    ).toBe(false);
  });

  it('round-trips decimals and preserves print order', () => {
    const [form] = garmentLabelsToForm([wireLabel]);
    expect(form).toMatchObject({
      pieceBomItemId: 17,
      pieceWidthMm: '40',
      pieceHeightMm: '70',
      pieceSeamMm: '8',
      labelXMm: '5',
      labelYMm: '12',
      labelOnPiece: '4_sides',
    });
    expect(form.prints?.map((print) => print.name)).toEqual(['logo.svg', 'size.svg']);

    const [out] = garmentLabelsOut([form]);
    expect(out.labelOnPiece).toBe('4_sides');
    expect(out.pieceWidthMm?.value).toBe('40');
    expect(out.prints?.map((print) => print.name)).toEqual(['logo.svg', 'size.svg']);
    expect(out.prints?.[1]?.xMm?.value).toBe('11');
  });

  it('always sends the presence bit and full prints list', () => {
    const [form] = garmentLabelsToForm([wireLabel]);
    form.attachment = 'sewn 4 sides';
    const [out] = garmentLabelsOut([form]);
    expect(Object.prototype.hasOwnProperty.call(out, 'labelOnPiece')).toBe(true);
    expect(out.labelOnPiece).toBe('');
    expect(out.pieceWidthMm?.value).toBe('0');
    expect(out.pieceHeightMm?.value).toBe('0');
    expect(out.prints?.map((print) => print.id)).toEqual([9, 10]);
  });

  it('sends an empty replace-all list', () => {
    const [form] = garmentLabelsToForm([wireLabel]);
    form.prints = [];
    const [out] = garmentLabelsOut([form]);
    expect(out.labelOnPiece).toBe('4_sides');
    expect(out.prints).toEqual([]);
  });
});
