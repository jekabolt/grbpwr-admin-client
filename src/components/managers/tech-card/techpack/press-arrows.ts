// Press arrows: how a press step is drawn on its seam. Press open = two arrows outward from the seam,
// press to one side = one arrow toward the named side, press flat = the seam line alone. Pure helpers
// so the side reading is testable without a picture.
import type { common_TechCardOperation } from 'api/proto-http/admin';
import { pressTowardLabel } from 'components/managers/tech-card/components/operation-options';
import { liningByName } from 'lib/assembly-skeleton/names';
import { readName } from 'lib/assembly-skeleton/skeleton/model';

export type PressMode = 'open' | 'side' | 'flat';
/** A side the shop reads on the page, not in one piece: resolved against the drawn picture. */
export type PressScreenAim = 'up' | 'down' | 'centre' | 'away';
export type PressPiece = { key: string; name: string; code?: string };

type Raw = Partial<Pick<common_TechCardOperation, 'operationType' | 'work' | 'press'>>;

/** Press open / to one side / flat from the stored step itself (never from the drawing technique). */
export function pressMode(raw: Raw | undefined): PressMode | null {
  if (!raw) return null;
  const work = raw.work ?? '';
  const action = raw.press?.action;
  if (work === 'press_final' || action === 'TECH_CARD_PRESS_ACTION_FINAL') return null;
  if (work === 'press_open' || raw.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN')
    return 'open';
  if (work === 'press_to_one_side' || action === 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE')
    return 'side';
  if (work === 'press_flat' || action === 'TECH_CARD_PRESS_ACTION_PRESS_FLAT') return 'flat';
  if (
    raw.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS' &&
    !work &&
    (!action || action === 'TECH_CARD_PRESS_ACTION_UNKNOWN')
  )
    return 'flat';
  return null;
}

/** The small word beside the arrows: «open», «to back», «upward». Flat prints nothing. */
export function pressWord(mode: PressMode | null, toward?: string): string {
  if (mode === 'open') return 'open';
  if (mode !== 'side') return '';
  const label = pressTowardLabel(toward).split(',')[0].trim();
  if (!label) return '';
  const side = label.replace(/^toward (the )?/, '');
  return side === label ? label : `to ${side}`;
}

/** UP / DOWN / centre sides are read on the picture, not in a piece. */
export function pressScreenAim(toward?: string): PressScreenAim | undefined {
  switch (toward) {
    case 'TECH_CARD_PRESS_TOWARD_UP':
      return 'up';
    case 'TECH_CARD_PRESS_TOWARD_DOWN':
      return 'down';
    case 'TECH_CARD_PRESS_TOWARD_TOWARD_CENTER':
      return 'centre';
    case 'TECH_CARD_PRESS_TOWARD_AWAY_FROM_CENTER':
      return 'away';
    default:
      return undefined;
  }
}

const roleOf = (piece: PressPiece) =>
  readName(piece.name).role ?? (piece.code ? readName(piece.code).role : null);
const lining = (piece: PressPiece) =>
  liningByName(piece.name) || (!!piece.code && liningByName(piece.code));
const BODY_ROLES = new Set(['front', 'back', 'side', 'yoke']);

/**
 * The piece of the seam the named side points into, by its name or code (FRONT → a front piece).
 * BODY / SHELL also accept the seam's other piece (not the sleeve / not the facing or lining).
 * Undefined when the seam's pieces do not say it — the word still names the side.
 */
export function pressTowardPiece(
  toward: string | undefined,
  pieces: readonly PressPiece[],
): string | undefined {
  const first = (test: (piece: PressPiece) => boolean) => pieces.find(test)?.key;
  const role = (id: string) => first((piece) => roleOf(piece) === id);
  switch (toward) {
    case 'TECH_CARD_PRESS_TOWARD_FRONT':
      return role('front');
    case 'TECH_CARD_PRESS_TOWARD_BACK':
      return role('back');
    case 'TECH_CARD_PRESS_TOWARD_SLEEVE':
      return role('sleeve');
    case 'TECH_CARD_PRESS_TOWARD_FACING':
      return role('facing');
    case 'TECH_CARD_PRESS_TOWARD_LINING':
      return first(lining);
    case 'TECH_CARD_PRESS_TOWARD_BODY': {
      const named = first((piece) => /\bbody\b/i.test(`${piece.name} ${piece.code ?? ''}`));
      if (named) return named;
      const body = first((piece) => BODY_ROLES.has(roleOf(piece) ?? ''));
      if (body) return body;
      return pieces.some((piece) => roleOf(piece) === 'sleeve')
        ? first((piece) => roleOf(piece) !== 'sleeve')
        : undefined;
    }
    case 'TECH_CARD_PRESS_TOWARD_SHELL': {
      const named = first((piece) => /\bshell\b/i.test(`${piece.name} ${piece.code ?? ''}`));
      if (named) return named;
      const other = (piece: PressPiece) => roleOf(piece) !== 'facing' && !lining(piece);
      return pieces.some((piece) => !other(piece)) ? first(other) : undefined;
    }
    default:
      return undefined;
  }
}

type P = readonly [number, number];

/** The run's midpoint by length and the unit normal there (left of the run's direction). */
export function seamMidNormal(
  points: readonly P[],
): { at: [number, number]; normal: [number, number] } | null {
  if (!points.length) return null;
  if (points.length === 1) return { at: [points[0][0], points[0][1]], normal: [0, 1] };
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return { at: [points[0][0], points[0][1]], normal: [0, 1] };
  let left = total / 2;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (left > length && index < lengths.length - 1) {
      left -= length;
      continue;
    }
    const a = points[index];
    const b = points[index + 1];
    const share = length ? left / length : 0;
    const dx = (b[0] - a[0]) / (length || 1);
    const dy = (b[1] - a[1]) / (length || 1);
    return { at: [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share], normal: [-dy, dx] };
  }
  return null;
}

const insideRing = (point: P, ring: readonly P[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
};

/** The seam normal turned into the piece's own cloth (a step off the edge lands inside it). */
export function normalIntoPiece(at: P, normal: P, ring: readonly P[]): [number, number] {
  const probe = (sign: number, step: number): P => [
    at[0] + normal[0] * sign * step,
    at[1] + normal[1] * sign * step,
  ];
  for (const step of [2, 5, 10]) {
    const plus = insideRing(probe(1, step), ring);
    const minus = insideRing(probe(-1, step), ring);
    if (plus !== minus) return plus ? [normal[0], normal[1]] : [-normal[0], -normal[1]];
  }
  if (!ring.length) return [normal[0], normal[1]];
  const cx = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
  const cy = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  return (cx - at[0]) * normal[0] + (cy - at[1]) * normal[1] >= 0
    ? [normal[0], normal[1]]
    : [-normal[0], -normal[1]];
}
