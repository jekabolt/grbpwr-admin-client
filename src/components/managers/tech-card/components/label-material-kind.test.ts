import { describe, expect, it } from 'vitest';

import { labelKindOfMaterial } from './label-material-kind';

describe('labelKindOfMaterial', () => {
  it.each([
    ['MATERIAL_LABEL_TYPE_BRAND', 'brand'],
    ['MATERIAL_LABEL_TYPE_TAPE', 'neck_tape'],
    ['MATERIAL_LABEL_TYPE_LOOP', 'hanger_loop'],
    ['MATERIAL_LABEL_TYPE_HANGTAG', 'hangtag'],
    ['MATERIAL_LABEL_TYPE_COMPOSITION', 'composition'],
  ] as const)('reads %s as %s', (labelType, kind) => {
    expect(labelKindOfMaterial({ labelType })).toBe(kind);
  });

  it('has no kind without a stored type, whatever the name says', () => {
    expect(
      labelKindOfMaterial({
        labelType: 'MATERIAL_LABEL_TYPE_UNKNOWN',
        name: 'Brand label',
      } as never),
    ).toBe('');
    expect(labelKindOfMaterial({ labelType: undefined, name: 'Brand label' } as never)).toBe('');
  });
});
