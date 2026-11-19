import type { FeatureInfo, PlatformTeam } from 'api/proto-http/admin';

// Pure console logic: which teams show, in what order, and how numbers read. No React, no api.

export const STATUS = {
  active: 'active',
  readOnly: 'read_only',
  provisioning: 'provisioning',
  /** unconfirmed sign-up: never listed */
  pending: 'pending',
  /** confirmed sign-up waiting for the operator */
  review: 'review',
  /** hidden at once, wiped at `purgeAt`; listed last until then */
  deleted: 'deleted',
} as const;

export type Tab = 'all' | 'active' | 'read_only' | 'requests' | 'deleted';
export type Sort = 'newest' | 'name' | 'people';

export interface Board {
  teams: PlatformTeam[];
  requests: PlatformTeam[];
  /** deleted teams whose data is not wiped yet, in the server's order */
  deleted: PlatformTeam[];
}

/** Server rows → listed teams, waiting sign-ups and deleted teams. */
export function splitBoard(rows: PlatformTeam[] | undefined): Board {
  const teams: PlatformTeam[] = [];
  const requests: PlatformTeam[] = [];
  const deleted: PlatformTeam[] = [];
  for (const t of rows ?? []) {
    if (t.status === STATUS.review) requests.push(t);
    else if (t.status === STATUS.deleted) deleted.push(t);
    else if (t.status !== STATUS.pending) teams.push(t);
  }
  return { teams, requests, deleted };
}

/** Only a live team can be deleted, and never team #1. */
export const canDelete = (t: PlatformTeam, teamOne: boolean) =>
  !teamOne && (t.status === STATUS.active || t.status === STATUS.readOnly);

export const isReadOnly = (t: PlatformTeam) => t.status === STATUS.readOnly;

/** Tab counts: `all` is the live teams only; waiting sign-ups and deleted teams count apart. */
export function tabCounts(board: Board): Record<Tab, number> {
  const ro = board.teams.filter(isReadOnly).length;
  return {
    all: board.teams.length,
    active: board.teams.length - ro,
    read_only: ro,
    requests: board.requests.length,
    deleted: board.deleted.length,
  };
}

/** The tab shown: `requests` falls back to `all` once the last request is answered. */
export const shownTab = (tab: Tab, counts: Record<Tab, number>): Tab =>
  tab === 'requests' && !counts.requests ? 'all' : tab;

/** Waiting sign-ups show on every tab but `deleted`, whatever the search says. */
export const visibleRequests = (requests: PlatformTeam[], tab: Tab): PlatformTeam[] =>
  tab === 'deleted' ? [] : requests;

const time = (ts: string | undefined) => (ts ? Date.parse(ts) || 0 : 0);

const matches = (t: PlatformTeam, needle: string) =>
  !needle ||
  (t.slug ?? '').toLowerCase().includes(needle) ||
  (t.name ?? '').toLowerCase().includes(needle);

/** The `deleted` tab's list: the deleted teams the search matches, in the server's order. */
export function visibleDeleted(deleted: PlatformTeam[], q: string): PlatformTeam[] {
  const needle = q.trim().toLowerCase();
  return deleted.filter((t) => matches(t, needle));
}

export function visibleTeams(
  teams: PlatformTeam[],
  { q, tab, sort }: { q: string; tab: Tab; sort: Sort },
): PlatformTeam[] {
  const needle = q.trim().toLowerCase();
  if (tab === 'requests' || tab === 'deleted') return [];
  const list = teams.filter((t) => {
    if (tab === 'active' && isReadOnly(t)) return false;
    if (tab === 'read_only' && !isReadOnly(t)) return false;
    return matches(t, needle);
  });
  if (sort === 'name') list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  else if (sort === 'people') list.sort((a, b) => (b.people ?? 0) - (a.people ?? 0));
  else list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  return list;
}

/** `$184.20`; zero, empty or junk reads `$0`. */
export function usd(amount: string | undefined): string {
  const n = Number(amount);
  return !amount || !Number.isFinite(n) || n === 0 ? '$0' : `$${n.toFixed(2)}`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** `nov 18`; `—` when unknown. */
export function shortDate(ts: string | undefined): string {
  const t = time(ts);
  if (!t) return '—';
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Days a deleted team is kept before its data is wiped (the server's retention). */
export const RETENTION_DAYS = 30;

/** A deleted team's wipe date as words that cannot read as the past: `kept till dec 19`. */
export function keptWord(purgeAt: string | undefined): string {
  return time(purgeAt) ? `kept till ${shortDate(purgeAt)}` : '';
}

/** The delete sheet's restore fact: the day a team deleted now is kept till (`dec 19`). */
export function keptTillIfDeleted(now = Date.now()): string {
  return shortDate(new Date(now + RETENTION_DAYS * 86_400_000).toISOString());
}

/** Last seen: `now`, `12 min`, `5 h`, `yesterday`, then the date. */
export function seenWord(ts: string | undefined, now = Date.now()): string {
  const t = time(ts);
  if (!t) return '—';
  const min = Math.floor((now - t) / 60_000);
  if (min < 2) return 'now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  if (h < 48) return 'yesterday';
  return shortDate(ts);
}

export interface FeatureGroup {
  group: string;
  items: FeatureInfo[];
}

/** The catalog in its own order, cut into runs of one group. */
export function featureGroups(catalog: FeatureInfo[]): FeatureGroup[] {
  const out: FeatureGroup[] = [];
  for (const f of catalog) {
    const g = f.group ?? '';
    const last = out[out.length - 1];
    if (last && last.group === g) last.items.push(f);
    else out.push({ group: g, items: [f] });
  }
  return out;
}

/** Switched-on features that the catalog knows. */
export function onCount(team: PlatformTeam, catalog: FeatureInfo[]): number {
  const keys = new Set(catalog.map((f) => f.key));
  return (team.features ?? []).filter((k) => keys.has(k)).length;
}

/**
 * Team #1 is the only team that can have a team-one-only feature on; the server also refuses its
 * read-only switch (`team_one`), so this only greys the switch in advance.
 */
export function teamOneSlug(teams: PlatformTeam[], catalog: FeatureInfo[]): string {
  const only = new Set(catalog.filter((f) => f.teamOneOnly).map((f) => f.key));
  return teams.find((t) => (t.features ?? []).some((k) => only.has(k)))?.slug ?? '';
}

export function withFeature(team: PlatformTeam, key: string, on: boolean): PlatformTeam {
  const rest = (team.features ?? []).filter((k) => k !== key);
  return { ...team, features: on ? [...rest, key] : rest };
}

export function withReadOnly(team: PlatformTeam, readOnly: boolean): PlatformTeam {
  return { ...team, status: readOnly ? STATUS.readOnly : STATUS.active };
}

/** Replace one team (by slug) in a list. */
export function patchTeam(
  rows: PlatformTeam[] | undefined,
  slug: string,
  fn: (t: PlatformTeam) => PlatformTeam,
): PlatformTeam[] {
  return (rows ?? []).map((t) => (t.slug === slug ? fn(t) : t));
}

/** The word a refusal shows; server reasons first, then the generic one. */
export function refusalWord(e: unknown, fallback = 'not saved'): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (msg.includes('team_one_only')) return 'team one only';
  if (msg.includes('team_one')) return 'team one';
  if (msg.includes('last_owner')) return 'last owner';
  if (msg.includes('read_only') || msg.includes('read only')) return 'read only';
  return fallback;
}

/** The red word under the delete sheet's password field. */
export function deleteRefusal(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const status = (e as { status?: number } | null)?.status;
  if (msg.includes('wrong_password')) return 'wrong password';
  if (status === 429 || /resource.?exhausted|too many/i.test(msg)) return 'try later';
  return refusalWord(e, 'not deleted');
}
