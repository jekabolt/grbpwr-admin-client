import { describe, expect, it, vi } from 'vitest';
import { normalUsername } from 'components/welcome/model';
import {
  agoWord,
  confirmMatches,
  deviceWord,
  googleReturnWord,
  passwordReady,
  passwordRefusal,
  passwordWord,
  runSave,
  serverWord,
  sessionWord,
  teamHostWord,
  untilWord,
} from './model';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const at = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

describe('time words', () => {
  it('reads like the mockup', () => {
    expect(agoWord(at(30_000), NOW)).toBe('now');
    expect(agoWord(at(5 * 60_000), NOW)).toBe('5m ago');
    expect(agoWord(at(2 * H), NOW)).toBe('2h ago');
    expect(agoWord(at(30 * H), NOW)).toBe('yesterday');
    expect(agoWord(at(3 * 24 * H), NOW)).toBe('3d ago');
    expect(agoWord(at(95 * 24 * H), NOW)).toBe('3 mo ago');
    expect(agoWord(undefined, NOW)).toBe('');
  });

  it('password header', () => {
    expect(passwordWord(true, at(95 * 24 * H), NOW)).toBe('changed 3 mo ago');
    expect(passwordWord(true, at(10_000), NOW)).toBe('changed just now');
    expect(passwordWord(false, undefined, NOW)).toBe('not set');
    expect(passwordWord(true, undefined, NOW)).toBe('');
  });

  it('restore until', () => {
    expect(untilWord(new Date(2026, 11, 19))).toBe('dec 19');
  });
});

describe('sessions', () => {
  it('device and quiet half', () => {
    expect(deviceWord({ browser: 'chrome', os: 'macos' })).toBe('chrome on macos');
    expect(deviceWord({ browser: 'safari', os: '' })).toBe('safari');
    expect(
      sessionWord(
        {
          key: 'k',
          browser: 'chrome',
          os: 'macos',
          ip: '81.2.69.142',
          lastSeenAt: at(0),
          thisDevice: true,
        },
        NOW,
      ),
    ).toBe('81.2.69.142 · now · this device');
  });
});

describe('delete', () => {
  it('takes the @username with or without @', () => {
    expect(confirmMatches('@mira.k', 'mira.k')).toBe(true);
    expect(confirmMatches(' MIRA.K ', 'mira.k')).toBe(true);
    expect(confirmMatches('mira', 'mira.k')).toBe(false);
    expect(confirmMatches('', '')).toBe(false);
  });

  it('team host', () => {
    expect(teamHostWord({ slug: 'ostra' } as never, 'lekalo.studio')).toBe('ostra.lekalo.studio');
  });
});

describe('refusals', () => {
  it('password', () => {
    expect(passwordRefusal('wrong_password')).toEqual({ field: 'current', word: 'wrong password' });
    expect(passwordRefusal('weak_password')).toEqual({ field: 'new', word: '8+ characters' });
    expect(passwordRefusal('too_many_attempts').word).toBe('try again');
  });

  it('an unknown refusal is shown as the server put it, a long one is not', () => {
    expect(serverWord('method ChangeMyPassword not implemented')).toBe(
      'method changemypassword not implemented',
    );
    expect(serverWord('x'.repeat(60))).toBe('try again');
    expect(serverWord('')).toBe('try again');
  });

  it('google return', () => {
    expect(googleReturnWord(null)).toBe('');
    expect(googleReturnWord('linked')).toBe('');
    expect(googleReturnWord('taken')).toBe('try again');
  });

  it('password form is ready only with the current one and 8+', () => {
    expect(passwordReady(true, '', 'kiln-yard-14', '')).toBe(false);
    expect(passwordReady(true, 'old', 'short', '')).toBe(false);
    expect(passwordReady(true, 'old', 'kiln-yard-14', 'old')).toBe(false);
    expect(passwordReady(true, 'old', 'kiln-yard-14', '')).toBe(true);
    expect(passwordReady(false, '', 'kiln-yard-14', '')).toBe(true);
  });
});

describe('save', () => {
  const calls = () => ({
    updateProfile: vi.fn(async (r: unknown) => r),
    setAvatar: vi.fn(async (r: unknown) => r),
  });

  it('names, then the avatar only when it changed', async () => {
    const api = calls();
    await runSave(
      {
        firstName: ' mira ',
        lastName: 'k ',
        username: '@Mira.K',
        avatar: { kind: 'keep' },
        hadAvatar: true,
      },
      api,
      normalUsername,
    );
    expect(api.updateProfile).toHaveBeenCalledWith({
      firstName: 'mira',
      lastName: 'k',
      publicUsername: 'mira.k',
    });
    expect(api.setAvatar).not.toHaveBeenCalled();
  });

  it('removes an avatar that was there', async () => {
    const api = calls();
    await runSave(
      { firstName: '', lastName: '', username: 'mira', avatar: { kind: 'none' }, hadAvatar: true },
      api,
      normalUsername,
    );
    expect(api.setAvatar).toHaveBeenCalledWith({ avatar: '' });
  });

  it('a refused profile stops before the avatar', async () => {
    const api = calls();
    api.updateProfile.mockRejectedValueOnce(new Error('username_taken'));
    await expect(
      runSave(
        {
          firstName: '',
          lastName: '',
          username: 'taken',
          avatar: { kind: 'new', base64: 'AA' },
          hadAvatar: false,
        },
        api,
        normalUsername,
      ),
    ).rejects.toThrow('username_taken');
    expect(api.setAvatar).not.toHaveBeenCalled();
  });
});
