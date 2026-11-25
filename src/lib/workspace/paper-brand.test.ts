import type { TeamBrand } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import { labelBrand, paperSource } from './paper-brand-context';
import { HOUSE, paperAddress, paperName, resolvePaperBrand } from './paper-brand';

const COMPANY = ['GRBPWR LIMITED', 'LONDON'];
const EMPTY: TeamBrand = {
  brandName: '',
  legalEntity: '',
  legalAddress: [],
  contactEmail: '',
  website: '',
  firstTeam: false,
  unavailable: false,
};
const FULL: TeamBrand = {
  ...EMPTY,
  brandName: 'Ostra',
  legalEntity: 'Ostra Studio Ltd',
  legalAddress: ['1 Mill Lane', 'Leeds', ' '],
  contactEmail: 'shop@ostra.com',
  website: 'ostra.com',
};

describe('resolvePaperBrand', () => {
  it('(a) teams OFF prints today', () => {
    const pb = resolvePaperBrand(null, '', 'PL1');
    expect(pb.mode).toBe('house');
    expect(pb.name).toBe('GRBPWR');
    expect(pb.mark).toBe('house');
    expect(pb.labelHouseMark).toBe(true);
    expect(pb.company).toBeUndefined();
    expect(pb.seller).toEqual({
      name: HOUSE.name,
      site: HOUSE.site,
      email: HOUSE.email,
      vatId: 'PL1',
      vatExpected: true,
    });
    expect(pb.cardBrand).toBe('grbpwr');
    expect(paperAddress(pb, undefined, COMPANY)).toEqual(COMPANY);
    expect(labelBrand(pb)).toBeUndefined();
  });

  it('(b) a team with data prints its own lines, never GRBPWR or the VAT id', () => {
    const pb = resolvePaperBrand(FULL, 'https://cdn/logo.png', 'PL1');
    expect(pb.name).toBe('Ostra');
    expect(pb.mark).toBe('team');
    expect(pb.logoUrl).toBe('https://cdn/logo.png');
    expect(pb.labelHouseMark).toBe(false);
    expect(pb.company).toEqual(['Ostra Studio Ltd', '1 Mill Lane', 'Leeds']);
    expect(pb.seller).toEqual({
      name: 'Ostra',
      site: 'ostra.com',
      email: 'shop@ostra.com',
      vatId: '',
      vatExpected: false,
    });
    expect(pb.cardBrand).toBe('');
    expect(pb.placeholder).toBe('Ostra');
    expect(labelBrand(pb)).toEqual({ company: pb.company, houseMark: false });
    expect(JSON.stringify(pb)).not.toMatch(/grbpwr/i);
  });

  it('(b) the first team keeps the house mark, the VAT id and the card default', () => {
    const pb = resolvePaperBrand({ ...FULL, firstTeam: true }, '', 'PL1');
    expect(pb.mark).toBe('house');
    expect(pb.labelHouseMark).toBe(true);
    expect(pb.seller.vatId).toBe('PL1');
    expect(pb.seller.vatExpected).toBe(true);
    expect(pb.cardBrand).toBe('grbpwr');
    // a team logo still wins on the HTML papers
    expect(resolvePaperBrand({ ...FULL, firstTeam: true }, 'u').mark).toBe('team');
  });

  it('(c) empty data prints nothing', () => {
    const pb = resolvePaperBrand(EMPTY, '', 'PL1');
    expect(pb.name).toBe('');
    expect(pb.mark).toBe('none');
    expect(pb.company).toEqual([]);
    expect(pb.seller).toEqual({ name: '', site: '', email: '', vatId: '', vatExpected: false });
    expect(paperAddress(pb, [], COMPANY)).toEqual([]);
    expect(paperName(pb, '')).toBe('');
  });

  it('(d) the card wins', () => {
    const team = resolvePaperBrand(FULL);
    expect(paperName(team, ' Atelier ')).toBe('Atelier');
    expect(paperName(resolvePaperBrand(null), 'Atelier')).toBe('Atelier');
    expect(paperAddress(team, ['CARD LTD'], COMPANY)).toEqual(['CARD LTD']);
    expect(paperAddress(resolvePaperBrand(EMPTY), ['CARD LTD'], COMPANY)).toEqual(['CARD LTD']);
  });

  it('unavailable prints nothing, even for the first team', () => {
    const pb = resolvePaperBrand({ ...FULL, firstTeam: true, unavailable: true }, 'u', 'PL1');
    expect(pb.unavailable).toBe(true);
    expect(pb.name).toBe('');
    expect(pb.mark).toBe('none');
    expect(pb.labelHouseMark).toBe(false);
    expect(pb.company).toEqual([]);
    expect(pb.seller.vatId).toBe('');
    expect(pb.seller.vatExpected).toBe(false);
  });
});

describe('paperSource', () => {
  it('teams OFF on the legacy host: house, ready', () => {
    expect(paperSource('legacy', null, false)).toEqual({ brand: null, logoUrl: '', status: 'ok' });
    expect(paperSource('legacy', { brand: null }, false).brand).toBeNull();
  });
  it('a team host never falls back to GRBPWR', () => {
    expect(paperSource('team', null, true)).toMatchObject({ status: 'pending' });
    expect(paperSource('team', null, true).brand).not.toBeNull();
    expect(paperSource('team', null, false)).toMatchObject({ status: 'error' });
    expect(paperSource('team', { brand: null }, false)).toMatchObject({ status: 'error' });
  });
  it('unavailable is an error dep; a brand is ready', () => {
    expect(paperSource('team', { brand: { ...EMPTY, unavailable: true } }, false).status).toBe(
      'error',
    );
    expect(paperSource('team', { brand: FULL, logoUrl: 'u' }, false)).toEqual({
      brand: FULL,
      logoUrl: 'u',
      status: 'ok',
    });
  });
});
