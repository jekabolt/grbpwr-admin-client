import { describe, expect, it } from 'vitest';
import {
  type EntryCalls,
  type EntryDraft,
  goodUsername,
  normalUsername,
  offeredSpecialties,
  refusalOf,
  runContinue,
  STARTER_SPECIALTIES,
} from './model';

describe('username', () => {
  it('drops the @, spaces and case', () => {
    expect(normalUsername('  @Mira.K ')).toBe('mira.k');
  });
  it('follows the server rule', () => {
    expect(goodUsername('mira.k')).toBe(true);
    expect(goodUsername('m')).toBe(false);
    expect(goodUsername('.mira')).toBe(false);
    expect(goodUsername('mira lund')).toBe(false);
    expect(goodUsername('a'.repeat(31))).toBe(false);
  });
});

describe('refusalOf', () => {
  it('names the field', () => {
    expect(refusalOf('username_taken')).toEqual({ note: 'username taken', field: 'username' });
    expect(refusalOf('rpc error: bad_avatar')).toEqual({ note: 'bad photo', field: 'photo' });
    expect(refusalOf('Error: 503')).toEqual({ note: 'try again', field: '' });
  });
});

describe('offeredSpecialties', () => {
  it('a new team gets the starter words', () => {
    expect(offeredSpecialties([], [])).toEqual(STARTER_SPECIALTIES);
  });
  it('own words come last, once', () => {
    expect(offeredSpecialties(['fit'], ['Fit', 'cutter'])).toEqual(['fit', 'cutter']);
  });
});

function calls() {
  const log: string[] = [];
  const api: EntryCalls = {
    updateProfile: async (r) => void log.push(`profile ${r.publicUsername}`),
    setAvatar: async (r) => void log.push(`avatar ${r.avatar ? 'set' : 'remove'}`),
    setSpecialties: async (r) => void log.push(`specialties ${r.specialties.join(',')}`),
    finish: async () => void log.push('finish'),
  };
  return { log, api };
}

const draft: EntryDraft = {
  firstName: ' mira ',
  lastName: 'lund',
  username: '@Mira',
  photo: { kind: 'keep' },
  hadPhoto: false,
  specialties: ['fit'],
};

describe('runContinue', () => {
  it('calls in the design order', async () => {
    const { log, api } = calls();
    await runContinue({ ...draft, photo: { kind: 'new', base64: 'x' } }, false, api);
    expect(log).toEqual(['profile mira', 'avatar set', 'specialties fit', 'finish']);
  });
  it('no photo change → no avatar call; a paused team skips specialties', async () => {
    const { log, api } = calls();
    await runContinue(draft, true, api);
    expect(log).toEqual(['profile mira', 'finish']);
  });
  it('removing the photo that was there', async () => {
    const { log, api } = calls();
    await runContinue({ ...draft, photo: { kind: 'none' }, hadPhoto: true }, false, api);
    expect(log).toContain('avatar remove');
  });
  it('a refusal stops the run before finish', async () => {
    const { log, api } = calls();
    api.updateProfile = async () => {
      throw new Error('username_taken');
    };
    await expect(runContinue(draft, false, api)).rejects.toThrow('username_taken');
    expect(log).toEqual([]);
  });
});
