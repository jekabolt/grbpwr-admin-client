// A team's brand data as the person types it: the field list, the client-side checks and the
// mapping to `admin.TeamBrand`. One module for every place that edits it — the logo step of
// `sign up` / `new team` and the workspace `brand` block. The server normalises again
// (W-spec §1, `SetTeamBrand`) and answers the same keys this file reads back.

import type { TeamBrand } from 'api/proto-http/admin';

export type BrandKey =
  | 'brandName'
  | 'contactEmail'
  | 'website'
  | 'legalEntity'
  | 'street'
  | 'city'
  | 'country';

export type BrandDraft = Record<BrandKey, string>;

export interface BrandField {
  key: BrandKey;
  label: string;
  /** Characters (runes) the server keeps; longer is refused. */
  max: number;
  type: 'text' | 'email' | 'url';
  autoComplete: string;
}

/** In screen order. `street / city / country` are the three `legal_address` lines, in that order. */
export const BRAND_FIELDS: readonly BrandField[] = [
  { key: 'brandName', label: 'brand name', max: 64, type: 'text', autoComplete: 'organization' },
  { key: 'contactEmail', label: 'email', max: 254, type: 'email', autoComplete: 'email' },
  { key: 'website', label: 'website', max: 128, type: 'url', autoComplete: 'url' },
  { key: 'legalEntity', label: 'legal entity', max: 96, type: 'text', autoComplete: 'off' },
  { key: 'street', label: 'street', max: 64, type: 'text', autoComplete: 'address-line1' },
  { key: 'city', label: 'city', max: 64, type: 'text', autoComplete: 'address-level2' },
  { key: 'country', label: 'country', max: 64, type: 'text', autoComplete: 'country-name' },
];

export const ADDRESS_KEYS = ['street', 'city', 'country'] as const;

export function emptyBrand(brandName = ''): BrandDraft {
  return {
    brandName,
    contactEmail: '',
    website: '',
    legalEntity: '',
    street: '',
    city: '',
    country: '',
  };
}

/** The stored brand → the fields (the address lines fill street, city, country in order). */
export function brandDraftOf(brand: TeamBrand | null | undefined): BrandDraft {
  const lines = brand?.legalAddress ?? [];
  return {
    brandName: brand?.brandName ?? '',
    contactEmail: brand?.contactEmail ?? '',
    website: brand?.website ?? '',
    legalEntity: brand?.legalEntity ?? '',
    street: lines[0] ?? '',
    city: lines[1] ?? '',
    country: lines[2] ?? '',
  };
}

/** Trim and collapse whitespace runs, as the server does before it stores. */
export function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function websiteOk(v: string): boolean {
  const bare = v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/$/, '');
  return bare.includes('.') && !/\s/.test(bare);
}

/** The fields the server would refuse. Empty fields are always fine. */
export function brandProblems(d: BrandDraft): BrandKey[] {
  const bad: BrandKey[] = [];
  for (const f of BRAND_FIELDS) {
    const raw = d[f.key];
    const v = cleanText(raw);
    if (!v) continue;
    if (CONTROL.test(raw.replace(/[\t\n\r]/g, ' ')) || [...v].length > f.max) {
      bad.push(f.key);
      continue;
    }
    if (f.key === 'contactEmail' && !EMAIL.test(v)) bad.push(f.key);
    if (f.key === 'website' && !websiteOk(v)) bad.push(f.key);
  }
  return bad;
}

/**
 * The request's `brand`: undefined when every field is empty (nothing is sent, nothing stored).
 * The address is street, city, country in that order; trailing empty lines are dropped.
 */
export function brandPayload(d: BrandDraft): TeamBrand | undefined {
  const c = Object.fromEntries(BRAND_FIELDS.map((f) => [f.key, cleanText(d[f.key])])) as BrandDraft;
  if (BRAND_FIELDS.every((f) => !c[f.key])) return undefined;
  const lines = ADDRESS_KEYS.map((k) => c[k]);
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return {
    brandName: c.brandName,
    legalEntity: c.legalEntity,
    legalAddress: lines,
    contactEmail: c.contactEmail,
    website: c.website,
    firstTeam: undefined,
    unavailable: undefined,
  };
}

/** A refusal's key (`bad_email`, `bad_website`, `bad_address`, `bad_text`) → the fields to mark. */
export function brandRefusalFields(message: string, d: BrandDraft): BrandKey[] {
  const m = message.toLowerCase();
  const filled = (keys: readonly BrandKey[]) => keys.filter((k) => !!cleanText(d[k]));
  if (m.includes('bad_email')) return filled(['contactEmail']);
  if (m.includes('bad_website')) return filled(['website']);
  if (m.includes('bad_address')) return filled(ADDRESS_KEYS);
  if (m.includes('bad_text')) {
    const local = brandProblems(d);
    return local.length ? local : filled(BRAND_FIELDS.map((f) => f.key));
  }
  return [];
}
