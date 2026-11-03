import { describe, expect, it } from 'vitest';
import { staleRecoveryOf } from './stale-reload';

const base = {
  online: true,
  reloadedFromBuild: null,
  build: 'https://admin/assets/index-new.js',
  holdsWork: false,
  windowOpen: true,
};

describe('staleRecoveryOf', () => {
  it('reloads a clean tab', () => {
    expect(staleRecoveryOf(base)).toBe('reload');
  });

  it('never reloads over unsaved work: it asks', () => {
    expect(staleRecoveryOf({ ...base, holdsWork: true })).toBe('ask');
  });

  it('a second failure within seconds of a reload asks instead of looping', () => {
    expect(staleRecoveryOf({ ...base, windowOpen: false })).toBe('ask');
  });

  it('a reload that came back with this same build would bring nothing', () => {
    expect(staleRecoveryOf({ ...base, reloadedFromBuild: base.build })).toBe('none');
    expect(
      staleRecoveryOf({ ...base, reloadedFromBuild: 'https://admin/assets/index-old.js' }),
    ).toBe('reload');
  });

  it('offline: a reload would drop the page itself', () => {
    expect(staleRecoveryOf({ ...base, online: false })).toBe('none');
    expect(staleRecoveryOf({ ...base, online: false, holdsWork: true })).toBe('none');
  });
});
