import { describe, expect, it } from 'vitest';
import { brandValues, EMPTY_BRAND, refusedField } from './use-brand';

describe('brand form', () => {
  it('splits the address into street, city, country', () => {
    expect(
      brandValues({
        brandName: 'ostra',
        legalEntity: 'OSTRA STUDIO LTD',
        legalAddress: ['14 KILN YARD', 'LONDON'],
        contactEmail: '',
        website: '',
        firstTeam: false,
        unavailable: false,
      }),
    ).toMatchObject({ street: '14 KILN YARD', city: 'LONDON', country: '' });
    expect(brandValues(null)).toEqual(EMPTY_BRAND);
  });

  it('points a refusal at its field', () => {
    expect(refusedField(new Error('bad_email'))).toBe('contactEmail');
    expect(refusedField(new Error('bad_logo'))).toBe('logo');
    expect(refusedField(new Error('bad_address'))).toBe('street');
    expect(refusedField(new Error('network'))).toBeNull();
  });
});
