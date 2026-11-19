import type {
  AccessLevel,
  AdminPermission,
  AdminSectionInfo,
  TeamInvite,
  TeamMember,
} from 'api/proto-http/admin';

// Pure people logic of the workspace screen: last owner, access summary, what a line may do,
// invite words, validation. No React, no api.

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

/** The caller lost (or never had) the owner role: a quiet desync, the list is reloaded. */
export const isOwnerOnly = (e: unknown) =>
  (e instanceof Error ? e.message : String(e ?? '')).includes('owner_only');

/** The toast for a refused member write. */
export function memberRefusal(e: unknown, fallback = 'not saved'): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (msg.includes('last_owner')) return 'last owner';
  if (msg.includes('read_only') || msg.includes('read only')) return 'read only';
  if (msg.includes('teams_off')) return 'teams off';
  return fallback;
}

export const memberName = (m: TeamMember) => m.username || m.email || '';

/** The local part of the email stands in for a name (the contract has no display name). */
export const avatarName = (m: TeamMember) => m.username || (m.email ?? '').split('@')[0] || '';

// ---- access ----

export const LEVELS = ['none', 'read', 'write'] as const;
export type Level = (typeof LEVELS)[number];

export function levelOf(a: AccessLevel | undefined): Level {
  if (a === 'ACCESS_LEVEL_WRITE') return 'write';
  if (a === 'ACCESS_LEVEL_READ') return 'read';
  return 'none';
}

const ACCESS_OF: Record<Level, AccessLevel | undefined> = {
  none: undefined,
  read: 'ACCESS_LEVEL_READ',
  write: 'ACCESS_LEVEL_WRITE',
};

/** A member's level per section key, every listed section present. */
export function levelsOf(m: TeamMember, sections: AdminSectionInfo[]): Record<string, Level> {
  const given = new Map((m.permissions ?? []).map((p) => [p.section ?? '', levelOf(p.access)]));
  return Object.fromEntries(
    sections.map((s) => [s.key ?? '', given.get(s.key ?? '') ?? 'none'] as const),
  );
}

/** The full grant set for SetTeamMemberAccess: a section left out gets none. */
export function permissionsOf(levels: Record<string, Level>): AdminPermission[] {
  return Object.entries(levels)
    .filter(([section, l]) => section && l !== 'none')
    .map(([section, l]) => ({ section, access: ACCESS_OF[l] }));
}

/** The line's summary: `full` for an owner or a member with write everywhere, else `N of M`. */
export function summary(m: TeamMember, sections: AdminSectionInfo[]): string {
  if (m.role === 'owner') return 'full';
  if (!sections.length) return '';
  const levels = Object.values(levelsOf(m, sections));
  if (levels.every((l) => l === 'write')) return 'full';
  return `${levels.filter((l) => l !== 'none').length} of ${levels.length}`;
}

/**
 * What one person line lets the viewer do (fix mockup v4 `inline`): role and the cross live in the
 * line, so they no longer make it open; it opens on a member's sections or on your own specialties.
 * The only owner gets neither a role control nor a cross.
 */
export function lineCan(m: TeamMember, members: TeamMember[], editor: boolean, paused = false) {
  const secs = m.role !== 'owner';
  const self = !!m.you && !paused;
  if (!editor) return { role: false, exit: false, secs, self };
  const last = isLastOwner(m, members);
  return { role: !last, exit: !(m.you && last), secs, self };
}

export const lineOpens = (c: ReturnType<typeof lineCan>, sections: AdminSectionInfo[]) =>
  c.self || (c.secs && sections.length > 0);

/** The specialties of a line, joined the way the mockup writes them. */
export const specialtiesWord = (list: string[] | undefined) =>
  (list ?? []).filter(Boolean).join(' · ');

/** An invite's age as the mockup writes it: `now`, `N min`, `N h`, `Nd`. */
export function sentWord(ts: string | undefined, now = Date.now()): string {
  const t = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 2) return 'now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)}d`;
}
