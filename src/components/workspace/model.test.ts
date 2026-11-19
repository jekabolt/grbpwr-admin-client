import type { AccessLevel, AdminSectionInfo, TeamInvite, TeamMember } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  avatarName,
  inviteErrorWord,
  inviteExpired,
  isLastOwner,
  isOwnerOnly,
  levelsOf,
  lineCan,
  lineOpens,
  me,
  memberRefusal,
  openInvites,
  ownerCount,
  permissionsOf,
  sentWord,
  specialtiesWord,
  summary,
  validEmail,
} from './model';

const m = (username: string, role: string, you = false): TeamMember => ({
  username,
  email: `${username}@x.co`,
  role,
  lastSeenAt: undefined,
  you,
  permissions: [],
  name: undefined,
  publicUsername: undefined,
  avatarUrl: undefined,
});
const inv = (ref: string, extra: Partial<TeamInvite> = {}): TeamInvite => ({
  inviteRef: ref,
  email: `${ref}@x.co`,
  role: 'member',
  sentAt: undefined,
  expiresAt: undefined,
  status: 'pending',
  name: undefined,
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
    expect(inviteErrorWord(new Error('already_member'))).toBe('already in team');
  });
  it('owner_only is a quiet desync', () => {
    expect(isOwnerOnly(new Error('owner_only'))).toBe(true);
    expect(isOwnerOnly(new Error('last_owner'))).toBe(false);
  });
});

describe('rights of a person line', () => {
  const S: AdminSectionInfo[] = ['tasks', 'files', 'media'].map((key) => ({
    key,
    title: key,
    description: '',
  }));
  const withRights = (
    username: string,
    perms: [string, AccessLevel][],
    role = 'member',
  ): TeamMember => ({
    ...m(username, role),
    permissions: perms.map(([section, access]) => ({ section, access })),
  });

  it('levelsOf lists every section, none by default', () => {
    const p = withRights('lena', [['files', 'ACCESS_LEVEL_READ']]);
    expect(levelsOf(p, S)).toEqual({ tasks: 'none', files: 'read', media: 'none' });
  });

  it('permissionsOf leaves none out', () => {
    expect(permissionsOf({ tasks: 'write', files: 'none', media: 'read' })).toEqual([
      { section: 'tasks', access: 'ACCESS_LEVEL_WRITE' },
      { section: 'media', access: 'ACCESS_LEVEL_READ' },
    ]);
  });

  it('summary counts sections at least readable; full for an owner or write everywhere', () => {
    expect(summary(m('teo', 'owner'), S)).toBe('full');
    expect(
      summary(
        withRights('ada', [
          ['tasks', 'ACCESS_LEVEL_WRITE'],
          ['files', 'ACCESS_LEVEL_WRITE'],
          ['media', 'ACCESS_LEVEL_WRITE'],
        ]),
        S,
      ),
    ).toBe('full');
    expect(
      summary(
        withRights('sam', [
          ['tasks', 'ACCESS_LEVEL_WRITE'],
          ['media', 'ACCESS_LEVEL_READ'],
        ]),
        S,
      ),
    ).toBe('2 of 3');
    expect(summary(withRights('kai', []), [])).toBe('');
  });

  it('the only owner gets no role control and no cross; their own line opens on specialties', () => {
    const solo = m('mira', 'owner', true);
    const can = lineCan(solo, [solo], true);
    expect(can).toEqual({ role: false, exit: false, secs: false, self: true });
    expect(lineOpens(can, S)).toBe(true);
    expect(lineOpens(lineCan(solo, [solo], false, true), S)).toBe(false);
  });

  it('an editor may demote and remove another owner; role and cross do not open a line', () => {
    const you = m('mira', 'owner', true);
    const teo = m('teo', 'owner');
    const lena = m('lena', 'member');
    const team = [you, teo, lena];
    expect(lineCan(teo, team, true)).toEqual({ role: true, exit: true, secs: false, self: false });
    expect(lineCan(you, team, true)).toEqual({ role: true, exit: true, secs: false, self: true });
    expect(lineCan(lena, team, true)).toEqual({ role: true, exit: true, secs: true, self: false });
    expect(lineOpens(lineCan(teo, team, true), S)).toBe(false);
  });

  it('a reader sees only a member’s sections and their own specialties', () => {
    const lena = m('lena', 'member');
    const teo = m('teo', 'owner');
    expect(lineOpens(lineCan(teo, [teo, lena], false), S)).toBe(false);
    expect(lineOpens(lineCan(lena, [teo, lena], false), S)).toBe(true);
    expect(lineOpens(lineCan(lena, [teo, lena], false), [])).toBe(false);
  });

  it('specialties join with a middle dot', () => {
    expect(specialtiesWord(['cutter', '', 'sewing'])).toBe('cutter · sewing');
    expect(specialtiesWord(undefined)).toBe('');
  });

  it('avatarName falls back to the email local part', () => {
    expect(avatarName({ ...m('', 'member'), email: 'rue@atelier.example' })).toBe('rue');
  });
});

describe('sentWord', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  it('writes minutes, hours, then days', () => {
    expect(sentWord('2026-11-19T11:59:30Z', now)).toBe('now');
    expect(sentWord('2026-11-19T11:15:00Z', now)).toBe('45 min');
    expect(sentWord('2026-11-19T07:00:00Z', now)).toBe('5 h');
    expect(sentWord('2026-11-17T10:00:00Z', now)).toBe('2d');
    expect(sentWord(undefined, now)).toBe('');
  });
});
