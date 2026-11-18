import { describe, expect, it } from 'vitest';
import { checkSlug, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Atelier Nord', 'atelier-nord'],
    ['  ostra ', 'ostra'],
    ['a_b.c  d', 'a-b-c-d'],
    ['ателье', 'ателье'],
  ])('%s → %s', (name, want) => expect(slugify(name)).toBe(want));
});

describe('checkSlug', () => {
  it.each([
    ['', 'empty', ''],
    ['ателье', 'bad', 'latin only'],
    ['-ostra', 'bad', 'edge dash'],
    ['os', 'bad', '3+ letters'],
    ['a'.repeat(31), 'bad', 'too long'],
    ['ostra', 'free', 'free'],
  ])('%s', (slug, status, word) => {
    expect(checkSlug(slug)).toEqual({ slug, status, word });
  });
});
