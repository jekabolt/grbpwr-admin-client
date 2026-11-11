// WHAT ONE PICKER CHOICE WRITES, decided before anything is written. A choice is one upsert (the new
// rows and any rows that move to make room), then the removal of the rows it no longer uses, then the
// step link. A replacement reuses the replaced rows' keys, so the rows it keeps never leave the server
// before their replacement is stored, and their step links ride along. The step order is checked here,
// before the write: a write the card save would refuse later is not sent at all.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import {
  foldFromLine,
  isPleatKind,
  pointOnSide,
  type FoldSource,
  type StoredFold,
} from 'lib/folds';
import { distToPoly, inside } from 'lib/folds/geom';
import {
  defaultSide,
  rowsOfChoice,
  rowsOfPleat,
  type FoldGroup,
  type PickKind,
  type PleatFan,
} from './fold-model';
import { FOLD_PLACE_REFUSAL, placeFolds } from './fold-seq';
import { foldStepBlocked, stepOfFold } from './fold-step';

type Ops = readonly { foldKeys?: string[] }[];

export type FoldPlanCtx = {
  geom: PieceGeom;
  deg: number;
  size: string;
  /** The piece's stored rows. */
  rows: readonly StoredFold[];
  operations: Ops;
  /** The step the picker is open on. */
  stepIndex?: number;
};

export type FoldPlan =
  | {
      upsert: StoredFold[];
      /** Rows to remove after the upsert landed. */
      remove: StoredFold[];
      /** The step to put the new rows on, after both writes. */
      link: { keys: string[]; step: number } | null;
    }
  | { refused: [string, string] };

export const FOLD_ORDER_REFUSAL: [string, string] = ['FOLD ORDER', 'move the fold first'];
export const FOLD_LINE_REFUSAL: [string, string] = ['no fold', 'line not across the piece'];
export const FOLD_SAME_REFUSAL: [string, string] = ['same fold', 'line already folded'];

/** Two lines within 5 mm at both ends, either way round (the hints' rule). */
const sameLine = (a: readonly [Pt2, Pt2], b: readonly [Pt2, Pt2]) => {
  const near = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 5;
  return (near(a[0], b[0]) && near(a[1], b[1])) || (near(a[0], b[1]) && near(a[1], b[0]));
};

/**
 * Why a drawn line cannot be a fold, or null. A fold runs through the cloth from contour to contour:
 * a chord over the empty corner of a concave piece or along the contour itself would be stored and
 * then never found on the piece; a line already folded would print as a double fold.
 */
export function drawnLineRefusal(
  geom: PieceGeom,
  line: readonly [Pt2, Pt2],
  groups: readonly Pick<FoldGroup, 'flat'>[],
): [string, string] | null {
  const [a, b] = line;
  // Outside the cloth anywhere (past a rounding hair) or on the contour everywhere: no fold. A point
  // near an end of a short or shallow chord sits close to the contour and is fine.
  let onContour = true;
  for (let k = 1; k < 50; k++) {
    const t = k / 50;
    const p: Pt2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const dist = distToPoly(geom.rs, p);
    if (!inside(geom.rs, p) && dist >= 0.5) return FOLD_LINE_REFUSAL;
    if (dist >= 1) onContour = false;
  }
  if (onContour) return FOLD_LINE_REFUSAL;
  if (groups.some((group) => group.flat.some((f) => sameLine([f.a, f.b], line))))
    return FOLD_SAME_REFUSAL;
  return null;
}

const keysOf = (rows: readonly StoredFold[]) => rows.map((row) => row.foldKey);

/** The rows of the piece once the plan landed: moved rows renumbered, replaced rows gone. */
function afterWrite(
  rows: readonly StoredFold[],
  upsert: readonly StoredFold[],
  removed: readonly StoredFold[],
): StoredFold[] {
  const written = new Map(upsert.map((row) => [row.foldKey, row]));
  const gone = new Set(keysOf(removed));
  const kept = rows
    .filter((row) => !gone.has(row.foldKey))
    .map((row) => written.get(row.foldKey) ?? row);
  const known = new Set(keysOf(kept));
  return [...kept, ...upsert.filter((row) => !known.has(row.foldKey))];
}

/** The step the new rows go on, or a refusal when that step reads the piece out of order. */
function linkOf(
  ctx: FoldPlanCtx,
  saved: readonly StoredFold[],
  after: readonly StoredFold[],
  oldStep: number | null,
): { link: { keys: string[]; step: number } | null } | { refused: [string, string] } {
  const step = oldStep ?? ctx.stepIndex ?? null;
  if (step === null) return { link: null };
  // Judged on the steps without the new keys: a reused key still names its old step.
  const keys = keysOf(saved);
  const ops = ctx.operations.map((op) => ({
    foldKeys: (op.foldKeys ?? []).filter((key) => !keys.includes(key)),
  }));
  const blocked = saved.some((row) => foldStepBlocked(ops, after, row.foldKey, step));
  if (!blocked) return { link: { keys, step } };
  // A fold kept on its own step must stay there: refuse. A new fold just stays without a step.
  return oldStep !== null ? { refused: FOLD_ORDER_REFUSAL } : { link: null };
}

/**
 * Whether the upsert itself passes the server's order check. It is judged on the links the server
 * holds now — a reused key still names its old step — and on the rows before the removal.
 */
function upsertOrderHolds(ctx: FoldPlanCtx, upsert: readonly StoredFold[]): boolean {
  const rows = afterWrite(ctx.rows, upsert, []);
  return rows.every((row) => {
    const step = stepOfFold(ctx.operations, row.foldKey);
    return step === null || !foldStepBlocked(ctx.operations, rows, row.foldKey, step);
  });
}

const stepOfAny = (ops: Ops, keys: readonly string[]): number | null =>
  keys.map((key) => stepOfFold(ops, key)).find((step) => step !== null) ?? null;

/** A new fold on a drawn line or an accepted hint. */
export function planNewFold(
  ctx: FoldPlanCtx,
  choice: { line: [Pt2, Pt2]; kind: PickKind; source: FoldSource },
): FoldPlan {
  const count = choice.kind === 'double' ? 2 : 1;
  const place = placeFolds(ctx.rows, {
    count,
    step: ctx.stepIndex ?? null,
    stepOf: (key) => stepOfFold(ctx.operations, key),
  });
  if ('refused' in place) return { refused: FOLD_PLACE_REFUSAL[place.refused] };
  const saved = rowsOfChoice(
    ctx.geom,
    { ...choice, side: defaultSide(ctx.geom, choice.line) },
    { seq: place.seqs[0], grainDeg: ctx.deg, anchoredSize: ctx.size },
  );
  if (!saved?.length) return { refused: FOLD_LINE_REFUSAL };
  const upsert = [...saved, ...place.moved];
  if (!upsertOrderHolds(ctx, upsert)) return { refused: FOLD_ORDER_REFUSAL };
  const linked = linkOf(ctx, saved, afterWrite(ctx.rows, upsert, []), null);
  if ('refused' in linked) return linked;
  return { upsert, remove: [], link: linked.link };
}

/** A saved fold turned into a kind with another number of rows (single ↔ double), in its place. */
export function planKindChange(ctx: FoldPlanCtx, group: FoldGroup, kind: PickKind): FoldPlan {
  const count = kind === 'double' ? 2 : 1;
  const replaced = [...group.rows].sort((a, b) => a.seq - b.seq);
  const place = placeFolds(ctx.rows, { count, replaced: keysOf(replaced) });
  if ('refused' in place) return { refused: FOLD_PLACE_REFUSAL[place.refused] };
  const saved = rowsOfChoice(
    ctx.geom,
    { line: group.line, side: group.side, kind, source: group.source },
    {
      seq: place.seqs[0],
      grainDeg: ctx.deg,
      keys: keysOf(replaced).slice(0, count),
      anchoredSize: ctx.size,
    },
  );
  if (!saved?.length) return { refused: FOLD_LINE_REFUSAL };
  const remove = replaced.slice(count);
  const upsert = [...saved, ...place.moved];
  if (!upsertOrderHolds(ctx, upsert)) return { refused: FOLD_ORDER_REFUSAL };
  const oldStep = stepOfAny(ctx.operations, keysOf(replaced));
  const linked = linkOf(ctx, saved, afterWrite(ctx.rows, upsert, remove), oldStep);
  if ('refused' in linked) return linked;
  return { upsert, remove, link: linked.link };
}

/** A pleat over a fan of lines, taking the place (and keys) of the folds already on those lines. */
export function planPleat(
  ctx: FoldPlanCtx,
  fan: PleatFan,
  replacedGroups: readonly FoldGroup[],
): FoldPlan {
  const replaced = [
    ...new Map(replacedGroups.flatMap((g) => g.rows).map((row) => [row.foldKey, row])).values(),
  ].sort((a, b) => a.seq - b.seq);
  const count = fan.lines.length;
  const place = placeFolds(ctx.rows, {
    count,
    replaced: keysOf(replaced),
    step: ctx.stepIndex ?? null,
    stepOf: (key) => stepOfFold(ctx.operations, key),
  });
  if ('refused' in place) return { refused: FOLD_PLACE_REFUSAL[place.refused] };
  const saved = rowsOfPleat(ctx.geom, fan, {
    seq: place.seqs[0],
    grainDeg: ctx.deg,
    keys: keysOf(replaced).slice(0, count),
    anchoredSize: ctx.size,
  });
  if (!saved?.length) return { refused: FOLD_LINE_REFUSAL };
  const remove = replaced.slice(count);
  const upsert = [...saved, ...place.moved];
  if (!upsertOrderHolds(ctx, upsert)) return { refused: FOLD_ORDER_REFUSAL };
  const oldStep = stepOfAny(ctx.operations, keysOf(replaced));
  const linked = linkOf(ctx, saved, afterWrite(ctx.rows, upsert, remove), oldStep);
  if ('refused' in linked) return linked;
  return { upsert, remove, link: linked.link };
}

/**
 * A lost fold (its line is not found on today's pattern) laid again on a new line: the same key,
 * seq, kind and note, so its place in the order and its step link stay; only the line changes. The
 * owner drew the new line, so its source is `owner` (a `dxf` row without an edge must match a
 * construction line and would be lost again). One keyed upsert; a bad line writes nothing.
 */
export function planRepick(
  ctx: FoldPlanCtx,
  lost: StoredFold,
  line: [Pt2, Pt2],
  groups: readonly Pick<FoldGroup, 'flat'>[] = [],
): FoldPlan {
  const refused = drawnLineRefusal(ctx.geom, line, groups);
  if (refused) return { refused };
  const flipAt = pointOnSide(ctx.geom.rs, line[0], line[1], defaultSide(ctx.geom, line));
  if (!flipAt) return { refused: FOLD_LINE_REFUSAL };
  const row = foldFromLine(ctx.geom, line, flipAt, {
    seq: lost.seq,
    kind: lost.kind,
    source: 'owner',
    foldKey: lost.foldKey,
    grainDeg: ctx.deg,
    anchoredSize: ctx.size,
    note: lost.note,
    ...(isPleatKind(lost.kind) ? { edge: null } : {}),
  });
  if (!upsertOrderHolds(ctx, [row])) return { refused: FOLD_ORDER_REFUSAL };
  return { upsert: [row], remove: [], link: null };
}
