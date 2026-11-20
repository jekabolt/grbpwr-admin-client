// «my work» — the team home (mockup HOME, variant a). Pure: no React, no api, so the gating and the
// date words are tested without a render.
import { SECTION } from 'constants/routes';
import { FEATURE } from 'lib/workspace/features';

export type HomeBlockKey = 'tasks' | 'recent' | 'fittings' | 'production' | 'files';

/** The blocks in phone order; each lives behind its team feature and its section's read right. */
export const HOME_BLOCKS: { key: HomeBlockKey; feature: string; section: string }[] = [
  { key: 'tasks', feature: FEATURE.tasks, section: SECTION.tasks },
  // recent techcards: the server answers ListMyRecentTechCards under the tech-cards feature + read
  { key: 'recent', feature: FEATURE.techCards, section: SECTION.techCards },
  { key: 'fittings', feature: FEATURE.fittings, section: SECTION.fittings },
  { key: 'production', feature: FEATURE.production, section: SECTION.production },
  { key: 'files', feature: FEATURE.files, section: SECTION.files },
];

/** Which blocks this person sees: the team has the feature on AND they may read the section. */
export function visibleBlocks(
  featureOn: (feature: string) => boolean,
  canRead: (section: string) => boolean,
): Set<HomeBlockKey> {
  return new Set(
    HOME_BLOCKS.filter((b) => featureOn(b.feature) && canRead(b.section)).map((b) => b.key),
  );
}

const ZERO = '0001-01-01T00:00:00Z';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = 86_400_000;

/** A wire timestamp as a Date, or null when unset (grpc-gateway sends the zero instant). */
export function toDate(ts?: string): Date | null {
  if (!ts || ts === ZERO) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar days from today to `d` (local): 0 today, -1 yesterday, 1 tomorrow. */
export function daysFrom(d: Date, now: Date): number {
  return Math.round((midnight(d) - midnight(now)) / DAY);
}

/** `nov 20` */
export function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export type Tone = 'ink' | 'mut' | 'warn';

/** A task's due word: today in ink, past in red, later grey, none a dash. */
export function dueWord(ts: string | undefined, now: Date): { text: string; tone: Tone } {
  const d = toDate(ts);
  if (!d) return { text: '—', tone: 'mut' };
  const n = daysFrom(d, now);
  if (n === 0) return { text: 'today', tone: 'ink' };
  return { text: shortDate(d), tone: n < 0 ? 'warn' : 'mut' };
}

/** A date that has passed (before today) — the overdue red. */
export function isPast(ts: string | undefined, now: Date): boolean {
  const d = toDate(ts);
  return !!d && daysFrom(d, now) < 0;
}

/** Today and the six days after it: «this week» as the person lives it, not a calendar week. */
export function inNextWeek(ts: string | undefined, now: Date): boolean {
  const d = toDate(ts);
  if (!d) return false;
  const n = daysFrom(d, now);
  return n >= 0 && n < 7;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `thu 11:00`; a fitting with no time of day reads `tue 25`. */
export function fittingWhen(ts: string | undefined): string {
  const d = toDate(ts);
  if (!d) return '—';
  const day = DAYS[d.getDay()];
  if (d.getHours() === 0 && d.getMinutes() === 0) return `${day} ${d.getDate()}`;
  return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** How long ago: `5m`, `2h`, `yesterday`, `mon`, `nov 12`. */
export function agoWord(ts: string | undefined, now: Date): string {
  const d = toDate(ts);
  if (!d) return '—';
  const n = daysFrom(d, now);
  if (n >= 0) {
    const min = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));
    if (min < 60) return `${Math.max(1, min)}m`;
    return `${Math.floor(min / 60)}h`;
  }
  if (n === -1) return 'yesterday';
  if (n > -7) return DAYS[d.getDay()];
  return shortDate(d);
}

/** Open tasks first by due date (overdue on top), undated last; done ones are not «my work». */
export function sortOpenTasks<T extends { status: string; task: { dueDate?: string } }>(
  tasks: T[],
): T[] {
  const due = (t: T) => toDate(t.task.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  return tasks.filter((t) => t.status !== 'TASK_STATUS_DONE').sort((a, b) => due(a) - due(b));
}
