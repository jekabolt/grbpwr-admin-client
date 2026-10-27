import { describe, expect, it } from 'vitest';
import { WORK_VARIANT_ICON } from './op-icon';
import {
  isWorkVariant,
  WORK_VARIANTS,
  workVariantIconKey,
  workVariantLabel,
  workVariantsOf,
} from './work-variants';

// The same pairs the backend pins in entity.TestWorkVariantsPinned (techcard_seam_kind_test.go).
const BACKEND_PAIRS: Record<string, string[]> = {
  set_zip: ['open_end', 'two_way', 'magnetic', 'faced'],
  snap_press_stud: ['ring', 'spring_s'],
  eyelet_grommet: ['small', 'washer'],
  attach_elastic: ['casing', 'exposed', 'gripper', 'picot', 'buttonhole', 'loop'],
  fuse: ['full', 'partial', 'edge_tape', 'tack'],
  attach_hook: ['eye', 'trouser_bar'],
  attach_hook_loop: ['tape', 'dot'],
  enclose_magnet: ['pocket', 'hem'],
  insert_cord: ['round', 'flat'],
  pleat: ['knife', 'box'],
  pocket_welt: ['single', 'double'],
  attach_patch: ['plain', 'embroidered'],
};

describe('work variants mirror the backend map', () => {
  it('lists exactly the backend pairs, in order', () => {
    expect(WORK_VARIANTS).toEqual(BACKEND_PAIRS);
  });

  it('has an icon for every pair and no icon for an undeclared one', () => {
    expect(Object.keys(WORK_VARIANT_ICON).sort()).toEqual(Object.keys(BACKEND_PAIRS).sort());
    for (const [work, variants] of Object.entries(BACKEND_PAIRS)) {
      expect(Object.keys(WORK_VARIANT_ICON[work as keyof typeof WORK_VARIANT_ICON])).toEqual(
        variants,
      );
      for (const variant of variants) expect(workVariantIconKey(work, variant)).toBeDefined();
    }
    expect(workVariantIconKey('set_zip', 'ring')).toBeUndefined();
  });

  it('a variant is legal only for its own work', () => {
    expect(isWorkVariant('set_zip', 'two_way')).toBe(true);
    expect(isWorkVariant('fuse', 'two_way')).toBe(false);
    expect(isWorkVariant('', 'two_way')).toBe(false);
    expect(isWorkVariant('join_lockstitch', 'full')).toBe(false);
    expect(workVariantsOf(' pleat ')).toEqual(['knife', 'box']);
    expect(workVariantsOf(undefined)).toEqual([]);
  });

  it('labels every declared variant in English and keeps an unknown token readable', () => {
    for (const variants of Object.values(BACKEND_PAIRS)) {
      for (const variant of variants) expect(workVariantLabel(variant)).toMatch(/^[a-zA-Z -]+$/);
    }
    expect(workVariantLabel('new_thing')).toBe('new thing');
  });
});
