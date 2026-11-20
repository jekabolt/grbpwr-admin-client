// My profile `b` (P0 §3): the pure part — time words, device words, the words for a refusal and
// the order of the calls `save` makes. No React here.

import type { MySession, TeamRef } from 'api/proto-http/auth';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** `now` · `5m ago` · `2h ago` · `yesterday` · `3d ago` · `3 mo ago` · `2y ago`. */
export function agoWord(at: string | undefined, now: number = Date.now()): string {
  const t = at ? Date.parse(at) : NaN;
  if (Number.isNaN(t)) return '';
  const d = Math.max(0, now - t);
  if (d < 2 * MIN) return 'now';
  if (d < HOUR) return `${Math.floor(d / MIN)}m ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
  if (d < 2 * DAY) return 'yesterday';
  if (d < 30 * DAY) return `${Math.floor(d / DAY)}d ago`;
  if (d < 365 * DAY) return `${Math.floor(d / (30 * DAY))} mo ago`;
  return `${Math.floor(d / (365 * DAY))}y ago`;
}

/** The password header: `changed 3 mo ago` · `changed just now` · `not set`; '' when unknown. */
export function passwordWord(
  set: boolean,
  changedAt: string | undefined,
  now: number = Date.now(),
): string {
  if (!set) return 'not set';
  const ago = agoWord(changedAt, now);
  if (!ago) return '';
  return `changed ${ago === 'now' ? 'just now' : ago}`;
}

/** `chrome on macos`; a device with no os is its browser alone. */
export function deviceWord(s: Pick<MySession, 'browser' | 'os'>): string {
  const b = s.browser?.trim() || 'browser';
  const os = s.os?.trim();
  return os ? `${b} on ${os}` : b;
}

/** `81.2.69.142 · 2h ago · this device` — the quiet half of a session row. */
export function sessionWord(s: MySession, now: number = Date.now()): string {
  return [s.ip, agoWord(s.lastSeenAt, now), s.thisDevice ? 'this device' : '']
    .filter(Boolean)
    .join(' · ');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** `dec 19`: the day the account can still be restored until (30 days from now, P0 §3.5). */
export function untilWord(at: Date): string {
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
}

export const DELETE_RETENTION_DAYS = 30;

export function restoreUntil(now: number = Date.now()): Date {
  return new Date(now + DELETE_RETENTION_DAYS * DAY);
}

/** `ostra.lekalo.studio` — the quiet half of a team row in the delete dialog. */
export function teamHostWord(t: TeamRef, base: string): string {
  return t.slug ? (base ? `${t.slug}.${base}` : t.slug) : '';
}

/** The delete box takes `@mira.k` or `mira.k`, any case, spaces around ignored. */
export function confirmMatches(typed: string, username: string): boolean {
  const v = typed.trim().toLowerCase();
  const u = username.trim().toLowerCase();
  return !!u && (v === `@${u}` || v === u);
}

export const MIN_PASSWORD = 8;

/** A password refusal: the word under the field it points at. */
export function passwordRefusal(message: string): { field: 'current' | 'new' | ''; word: string } {
  const m = message.toLowerCase();
  if (m.includes('wrong_password')) return { field: 'current', word: 'wrong password' };
  if (m.includes('weak_password')) return { field: 'new', word: '8+ characters' };
  return { field: '', word: serverWord(m) };
}

/**
 * Any other refusal, as short as the server put it: the known keys get their word, an unknown
 * one is shown as the server wrote it (until S23 / S4b land it says the call is not there yet).
 */
export function serverWord(message: string): string {
  const m = message.toLowerCase().trim();
  if (!m) return 'try again';
  if (m.includes('too_many_attempts') || m.includes('try_again')) return 'try again';
  if (m.includes('sole_owner')) return 'sole owner';
  return m.length > 48 ? 'try again' : m;
}

/** `?google=linked|taken|unverified` after the Google round trip (P0 §3.7). */
export function googleReturnWord(v: string | null): string {
  if (!v || v === 'linked') return '';
  return 'try again';
}

export type Avatar = { kind: 'keep' } | { kind: 'none' } | { kind: 'new'; base64: string };

export interface ProfileDraft {
  firstName: string;
  lastName: string;
  username: string;
  avatar: Avatar;
  /** Was there an avatar when the screen opened (so `none` means remove). */
  hadAvatar: boolean;
}

export interface SaveCalls {
  updateProfile: (r: {
    firstName: string;
    lastName: string;
    publicUsername: string;
  }) => Promise<unknown>;
  setAvatar: (r: { avatar: string }) => Promise<unknown>;
}

/** `save`: the names and @username, then the avatar only when it changed. */
export async function runSave(
  d: ProfileDraft,
  api: SaveCalls,
  normal: (u: string) => string,
): Promise<void> {
  await api.updateProfile({
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    publicUsername: normal(d.username),
  });
  if (d.avatar.kind === 'new') await api.setAvatar({ avatar: d.avatar.base64 });
  else if (d.avatar.kind === 'none' && d.hadAvatar) await api.setAvatar({ avatar: '' });
}

/** The password form can be sent: the current one when a password exists, a new one of 8+. */
export function passwordReady(set: boolean, current: string, next: string, badCurrent: string) {
  return (!set || (!!current && current !== badCurrent)) && next.length >= MIN_PASSWORD;
}
