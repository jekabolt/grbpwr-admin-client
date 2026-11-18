import type { TeamInvite, TeamMember } from 'api/proto-http/admin';

// Pure people-screen logic: last owner, invite words, validation. No React, no api.

export const ROLES = ['owner', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const ownerCount = (members: TeamMember[]) =>
  members.filter((m) => m.role === 'owner').length;

/** The one owner left: cannot be removed, demoted or leave. */
export const isLastOwner = (m: TeamMember, members: TeamMember[]) =>
  m.role === 'owner' && ownerCount(members) === 1;

export const me = (members: TeamMember[]) => members.find((m) => m.you);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalEmail = (s: string) => s.trim().toLowerCase();
export const validEmail = (s: string) => EMAIL.test(normalEmail(s));

/** An invite that can no longer be accepted reads `expired`; every other open one `invited`. */
export function inviteExpired(i: TeamInvite, now = Date.now()): boolean {
  if (i.status === 'expired') return true;
  const t = i.expiresAt ? Date.parse(i.expiresAt) : 0;
  return !!t && t < now;
}

/** Only open invites are listed (an accepted one is a member, a revoked one is gone). */
export const openInvites = (invites: TeamInvite[] | undefined) =>
  (invites ?? []).filter((i) => i.status !== 'accepted' && i.status !== 'revoked');

/** The inline word under the invite form. */
export function inviteErrorWord(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  const status = (e as { status?: number } | null)?.status;
  if (status === 409 || msg.includes('already')) return 'already in team';
  if (msg.includes('email') || msg.includes('invalid')) return 'invalid email';
  if (msg.includes('read_only') || msg.includes('read only')) return 'read only';
  return 'not sent';
}

/** The toast for a refused member write. */
export function memberRefusal(e: unknown, fallback = 'not saved'): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (msg.includes('last_owner')) return 'last owner';
  if (msg.includes('read_only') || msg.includes('read only')) return 'read only';
  if (msg.includes('teams_off')) return 'teams off';
  return fallback;
}

export const memberName = (m: TeamMember) => m.username || m.email || '';
