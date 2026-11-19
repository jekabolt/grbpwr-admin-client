import { describe, expect, it } from 'vitest';

import {
  brandDraftOf,
  brandPayload,
  brandProblems,
  brandRefusalFields,
  emptyBrand,
} from './brand-fields';

describe('brandPayload', () => {
  it('sends nothing when every field is empty', () => {
    expect(brandPayload(emptyBrand())).toBeUndefined();
    expect(brandPayload({ ...emptyBrand('  '), city: ' \t ' })).toBeUndefined();
  });

  it('maps street, city, country to the three address lines in order', () => {
    const p = brandPayload({
      ...emptyBrand('mono'),
      street: ' telliskivi  60a ',
      city: 'tallinn',
      country: 'estonia',
    });
    expect(p?.legalAddress).toEqual(['telliskivi 60a', 'tallinn', 'estonia']);
    expect(p?.brandName).toBe('mono');
  });

  it('drops trailing empty address lines, keeps a gap in the middle', () => {
    expect(brandPayload({ ...emptyBrand(), street: 'a' })?.legalAddress).toEqual(['a']);
    expect(brandPayload({ ...emptyBrand(), street: 'a', country: 'c' })?.legalAddress).toEqual([
      'a',
      '',
      'c',
    ]);
    expect(brandPayload({ ...emptyBrand(), website: 'x.io' })?.legalAddress).toEqual([]);
  });

  it('round-trips through the stored brand', () => {
    const d = {
      ...emptyBrand('mono'),
      street: 's',
      city: 'c',
      country: 'k',
      website: 'mono.studio',
    };
    expect(brandDraftOf(brandPayload(d))).toEqual(d);
  });
});

describe('brandProblems', () => {
  it('lets empty fields pass', () => {
    expect(brandProblems(emptyBrand())).toEqual([]);
  });

  it('checks email, website and lengths', () => {
    expect(
      brandProblems({
        ...emptyBrand('x'.repeat(65)),
        contactEmail: 'hello@',
        website: 'mono studio',
        legalEntity: 'y'.repeat(96),
      }),
    ).toEqual(['brandName', 'contactEmail', 'website']);
    expect(
      brandProblems({ ...emptyBrand(), contactEmail: 'a@b.co', website: 'https://mono.studio/' }),
    ).toEqual([]);
  });
});

describe('brandRefusalFields', () => {
  const d = { ...emptyBrand('mono'), contactEmail: 'a@b.co', website: 'w.io', city: 'tallinn' };
  it('puts a server key on its field', () => {
    expect(brandRefusalFields('400 - bad_website', d)).toEqual(['website']);
    expect(brandRefusalFields('bad_email', d)).toEqual(['contactEmail']);
    expect(brandRefusalFields('bad_address', d)).toEqual(['city']);
    expect(brandRefusalFields('slug taken', d)).toEqual([]);
  });
  it('never blames an empty brand email for an account email refusal', () => {
    expect(brandRefusalFields('bad_email', emptyBrand('mono'))).toEqual([]);
  });
});
