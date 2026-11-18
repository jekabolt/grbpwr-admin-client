import { describe, expect, it } from 'vitest';
import { knownBase, resolveHost } from './host';

const BASE = 'beta.lekalo.studio';

describe('resolveHost', () => {
  const table: [string, string, string, ReturnType<typeof resolveHost>][] = [
    ['beta.lekalo.studio', BASE, 'grbpwr', { kind: 'root', slug: '', base: BASE }],
    ['BETA.lekalo.studio.', BASE, 'grbpwr', { kind: 'root', slug: '', base: BASE }],
    ['beta.lekalo.studio:4040', BASE, 'grbpwr', { kind: 'root', slug: '', base: BASE }],
    ['console.beta.lekalo.studio', BASE, 'grbpwr', { kind: 'console', slug: '', base: BASE }],
    ['ostra.beta.lekalo.studio', BASE, 'grbpwr', { kind: 'team', slug: 'ostra', base: BASE }],
    [
      'vela-works.beta.lekalo.studio',
      BASE,
      'grbpwr',
      { kind: 'team', slug: 'vela-works', base: BASE },
    ],
    // two labels below the base are not a team
    ['a.b.beta.lekalo.studio', BASE, 'grbpwr', { kind: 'legacy', slug: 'grbpwr', base: BASE }],
    ['-x.beta.lekalo.studio', BASE, 'grbpwr', { kind: 'legacy', slug: 'grbpwr', base: BASE }],
    // prod root is not the beta base
    ['lekalo.studio', BASE, 'grbpwr', { kind: 'legacy', slug: 'grbpwr', base: BASE }],
    ['xbeta.lekalo.studio', BASE, 'grbpwr', { kind: 'legacy', slug: 'grbpwr', base: BASE }],
    ['admin.beta.grbpwr.com', BASE, 'grbpwr', { kind: 'legacy', slug: 'grbpwr', base: BASE }],
    ['admin.grbpwr.com', BASE, 'grbpwr', { kind: 'legacy', slug: 'grbpwr', base: BASE }],
    ['localhost', BASE, 'grbpwr', { kind: 'legacy', slug: 'grbpwr', base: BASE }],
    // no base domain: every host is legacy, today's app
    ['ostra.beta.lekalo.studio', '', '', { kind: 'legacy', slug: '', base: '' }],
    ['admin.beta.grbpwr.com', '', '', { kind: 'legacy', slug: '', base: '' }],
    // prod
    ['lekalo.studio', 'lekalo.studio', 'grbpwr', { kind: 'root', slug: '', base: 'lekalo.studio' }],
    [
      'ostra.lekalo.studio',
      'lekalo.studio',
      'grbpwr',
      { kind: 'team', slug: 'ostra', base: 'lekalo.studio' },
    ],
    [
      'beta.lekalo.studio',
      'lekalo.studio',
      'grbpwr',
      { kind: 'team', slug: 'beta', base: 'lekalo.studio' },
    ],
  ];

  it.each(table)('%s on base %s', (host, base, def, want) => {
    expect(resolveHost(host, base, def)).toEqual(want);
  });
});

describe('knownBase', () => {
  const table: [string, string][] = [
    ['beta.lekalo.studio', 'beta.lekalo.studio'],
    ['ostra.beta.lekalo.studio', 'beta.lekalo.studio'],
    ['console.beta.lekalo.studio', 'beta.lekalo.studio'],
    ['Ostra.Beta.Lekalo.Studio:443', 'beta.lekalo.studio'],
    ['lekalo.studio', 'lekalo.studio'],
    ['ostra.lekalo.studio', 'lekalo.studio'],
    ['xbeta.lekalo.studio', 'lekalo.studio'],
    ['admin.beta.grbpwr.com', ''],
    ['notlekalo.studio', ''],
    ['lekalo-web-beta-oim9q.ondigitalocean.app', ''],
    ['localhost', ''],
  ];

  it.each(table)('%s', (host, want) => {
    expect(knownBase(host)).toBe(want);
  });
});
