import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import { classForSection, materialClassForEdit } from './material-modal';

describe('material section class', () => {
  it('derives fabric class for a new interlining', () => {
    expect(classForSection('TECH_CARD_BOM_SECTION_INTERLINING')).toBe('MATERIAL_CLASS_FABRIC');
  });

  it('keeps an existing class until its section changes', () => {
    const material = {
      section: 'TECH_CARD_BOM_SECTION_TRIM',
      materialClass: 'MATERIAL_CLASS_HARDWARE',
    } as common_Material;
    expect(materialClassForEdit(material, 'TECH_CARD_BOM_SECTION_TRIM', false)).toBe(
      'MATERIAL_CLASS_HARDWARE',
    );
    expect(materialClassForEdit(material, 'TECH_CARD_BOM_SECTION_INTERLINING', true)).toBe(
      'MATERIAL_CLASS_FABRIC',
    );
  });
});
