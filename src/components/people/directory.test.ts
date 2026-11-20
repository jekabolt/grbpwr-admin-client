import { describe, expect, it } from 'vitest';
import { directoryOf, swapMentions, toPerson } from './directory';

const dir = directoryOf([
  {
    id: 1,
    username: 'mira',
    name: 'mira lund',
    publicUsername: 'mira.k',
    avatarUrl: 'https://a/x',
    specialties: [],
    isSuper: false,
  },
  {
    id: 2,
    username: 'teo',
    name: '',
    publicUsername: 'teo',
    avatarUrl: '',
    specialties: [],
    isSuper: false,
  },
  {
    id: 3,
    username: 'old',
    name: '',
    publicUsername: '',
    avatarUrl: '',
    specialties: [],
    isSuper: false,
  },
]);

describe('toPerson', () => {
  it('reads name, @username and photo', () => {
    expect(toPerson('mira', dir.get('mira'))).toEqual({
      handle: 'mira',
      name: 'mira lund',
      username: 'mira.k',
      avatarUrl: 'https://a/x',
      label: 'mira lund',
    });
  });
  it('falls back to @username, then the handle', () => {
    expect(toPerson('teo', dir.get('teo')).label).toBe('@teo');
    expect(toPerson('old', dir.get('old')).label).toBe('old');
    expect(toPerson('gone', undefined).label).toBe('gone');
  });
});

describe('swapMentions', () => {
  it('swaps a known handle for the current @username', () => {
    expect(swapMentions('ask @mira, cc @teo', dir)).toBe('ask @mira.k, cc @teo');
  });
  it('leaves unknown handles, emails and plain text alone', () => {
    expect(swapMentions('@gone and mira@ostra.studio', dir)).toBe('@gone and mira@ostra.studio');
    expect(swapMentions('no mentions', dir)).toBe('no mentions');
  });
  it('outside teams mode nothing changes', () => {
    expect(swapMentions('@old', dir)).toBe('@old');
  });
});
