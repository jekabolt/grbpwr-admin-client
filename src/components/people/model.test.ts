import type { TeamInvite, TeamMember } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  inviteErrorWord,
  inviteExpired,
  isLastOwner,
  me,
  memberRefusal,
  openInvites,
  ownerCount,
  validEmail,
} from './model';

const m = (username: string, role: string, you = false): TeamMember => ({
  username,
  email: `${username}@x.co`,
  role,
  lastSeenAt: undefined,
  you,
});
const inv = (ref: string, extra: Partial<TeamInvite> = {}): TeamInvite => ({
  inviteRef: ref,
  email: `${ref}@x.co`,
  role: 'member',
  sentAt: undefined,
  expiresAt: undefined,
  status: 'pending',
  ...extra,
});

describe('last owner', () => {
  it('is the only owner', () => {
    const one = [m('mira', 'owner', true), m('ana', 'member')];
    expect(ownerCount(one)).toBe(1);
    expect(isLastOwner(one[0], one)).toBe(true);
    expect(isLastOwner(one[1], one)).toBe(false);
    expect(me(one)?.username).toBe('mira');
  });
  it('two owners: neither is last', () => {
    const two = [m('mira', 'owner', true), m('tomas', 'owner')];
    expect(isLastOwner(two[0], two)).toBe(false);
  });
});

describe('invites', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  it('expired by status or by date', () => {
    expect(inviteExpired(inv('a', { status: 'expired' }), now)).toBe(true);
    expect(inviteExpired(inv('b', { expiresAt: '2026-11-18T00:00:00Z' }), now)).toBe(true);
    expect(inviteExpired(inv('c', { expiresAt: '2026-11-25T00:00:00Z' }), now)).toBe(false);
  });
  it('lists only open invites', () => {
    const list = openInvites([
      inv('a'),
      inv('b', { status: 'accepted' }),
      inv('c', { status: 'revoked' }),
      inv('d', { status: 'expired' }),
    ]);
    expect(list.map((i) => i.inviteRef)).toEqual(['a', 'd']);
  });
  it('validates email', () => {
    expect(validEmail(' Noor@Ostra.Studio ')).toBe(true);
    expect(validEmail('noor@')).toBe(false);
  });
  it('error words', () => {
    expect(inviteErrorWord(Object.assign(new Error('x'), { status: 409 }))).toBe('already in team');
    expect(inviteErrorWord(new Error('Error: 409 - already exists'))).toBe('already in team');
    expect(inviteErrorWord(new Error('invalid email'))).toBe('invalid email');
    expect(memberRefusal(new Error('400 last_owner'))).toBe('last owner');
    expect(memberRefusal(new Error('boom'), 'not removed')).toBe('not removed');
  });
});
