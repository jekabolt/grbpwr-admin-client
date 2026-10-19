// pieces/ (F4b) — operator wall API for the wizard's Pieces step (F13c): draw a bridge, make a
// chain a wall, or stop a chain being one — then fill again ONLY the seeds the change can touch.
//
// The state is a plain value (`PieceSession`): the inputs of the fill, the operator's wall edits
// so far, and the current families. Every call returns a new session; families of seeds the edit
// cannot reach are carried over untouched (same objects).
import type {
  BoxMm,
  Chain,
  ChainId,
  ChainSet,
  FillOpts,
  PieceEdit,
  PieceFamily,
  PtMm,
  Seed,
  SeedId,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';

import { fillPiecesDetailed, type FillDiag, type WallEdits } from './fill';
import { bboxOf, segNearest } from './geom';

export type PieceSession = {
  sheet: Sheet;
  set: ChainSet;
  run: SizeRun;
  seeds: Seed[];
  opts: FillOpts;
  /** Operator wall edits accumulated so far (they apply to every later fill). */
  walls: Required<WallEdits>;
  families: PieceFamily[];
  /** Diagnostics of the last fill (the refilled seeds only). */
  diag?: FillDiag;
};

/**
 * A first session: fill every seed. `walls` starts it with wall edits already made (the wizard
 * re-opening a run after an undo); `progress` may throw to cancel.
 */
export function startSession(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  opts: FillOpts,
  walls: WallEdits = {},
  progress?: (done: number, total: number, note?: string) => void,
): PieceSession {
  const w: Required<WallEdits> = {
    exclude: [...(walls.exclude ?? [])],
    include: [...(walls.include ?? [])],
    bridges: [...(walls.bridges ?? [])],
  };
  const { families, diag } = fillPiecesDetailed(sheet, set, run, seeds, opts, progress, w);
  return { sheet, set, run, seeds, opts, walls: w, families, diag };
}

/** Fill again the given seeds with the session's walls; the other families are kept as they are. */
export function refill(s: PieceSession, seeds: Iterable<SeedId>): PieceSession {
  const only = new Set(seeds);
  if (!only.size) return s;
  const { families, diag } = fillPiecesDetailed(
    s.sheet,
    s.set,
    s.run,
    s.seeds,
    { ...s.opts, only },
    undefined,
    s.walls,
  );
  const fresh = new Map(families.filter((f) => only.has(f.seed)).map((f) => [f.seed, f]));
  return {
    ...s,
    families: s.families.map((f) => fresh.get(f.seed) ?? f),
    diag,
  };
}

/**
 * addBridge(seed, rank, from, to): a straight wall from `from` to `to` (sheet mm) for rank `rank`
 * — the operator closes a gap the source leaves open. Only `seed` is filled again; its candidate
 * marks the bridge as derived ('operator-bridge') when its outline runs along it.
 */
export function addBridge(
  s: PieceSession,
  seed: SeedId,
  rank: number,
  from: PtMm,
  to: PtMm,
): PieceSession {
  const walls = { ...s.walls, bridges: [...s.walls.bridges, { rank, from, to }] };
  return refill({ ...s, walls }, [seed]);
}

/**
 * setWall(chainId, rank = null): the chain becomes a wall (of `rank`, or of every rank when null) —
 * e.g. a facing line inside a hood that bounds the facing piece. The seeds it can reach are filled
 * again (affectedSeeds).
 */
export function setWall(s: PieceSession, chain: ChainId, rank: number | null = null): PieceSession {
  const walls = {
    ...s.walls,
    exclude: s.walls.exclude.filter((id) => id !== chain),
    include: [...s.walls.include, { rank, ids: [chain] }],
  };
  return refill({ ...s, walls }, affectedSeeds(s, chain));
}

/**
 * ignoreChain(chainId): the chain is never a wall (a frame, a guide F3 took for a line). The seeds
 * it can reach are filled again (affectedSeeds).
 */
export function ignoreChain(s: PieceSession, chain: ChainId): PieceSession {
  const walls = {
    ...s.walls,
    exclude: [...s.walls.exclude.filter((id) => id !== chain), chain],
    include: s.walls.include
      .map((x) => ({ ...x, ids: x.ids.filter((id) => id !== chain) }))
      .filter((x) => x.ids.length),
  };
  return refill({ ...s, walls }, affectedSeeds(s, chain));
}

/**
 * Seeds a wall change on `chain` can reach: a family with a candidate whose outline box meets the
 * chain's box (± 5 mm) or that names the chain among its walls, and every family not closed in all
 * ranks whose seed lies within 300 mm of the chain (a leak or a merge can run anywhere near).
 */
export function affectedSeeds(s: PieceSession, chain: ChainId): SeedId[] {
  const c = s.set.chains[chain];
  if (!c || c.pts.length < 1) return [];
  return affectedSeedsNear(s, bboxOf(c.pts), chain);
}

/** affectedSeeds for any place on the sheet (a bridge's box); `chain` also matches by wall id. */
export function affectedSeedsNear(s: PieceSession, box: BoxMm, chain?: ChainId): SeedId[] {
  const cb = grow(box, 5);
  const near = grow(cb, 295);
  const at = new Map(s.seeds.map((x) => [x.id, x.at]));
  return s.families
    .filter((f) => {
      if (
        f.candidates.some(
          (x) =>
            (chain != null && x.walls.includes(chain)) || (x.outer.length > 2 && meets(x.bbox, cb)),
        )
      )
        return true;
      const open = f.candidates.some((x) => x.outcome !== 'closed');
      const p = at.get(f.seed);
      return (
        open && !!p && p.x >= near.minX && p.x <= near.maxX && p.y >= near.minY && p.y <= near.maxY
      );
    })
    .map((f) => f.seed);
}

function grow(b: BoxMm, d: number): BoxMm {
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

function meets(a: BoxMm, b: BoxMm): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

// ── the wizard's wall edits, many at once ────────────────────────────────────────────────────

/** The PieceEdit kinds that change WHICH LINES ARE WALLS (applied through the session's walls). */
export type WallPieceEdit = Extract<PieceEdit, { kind: 'bridge' | 'ignore-line' | 'set-wall' }>;

export const isWallEdit = (e: PieceEdit): e is WallPieceEdit =>
  e.kind === 'bridge' || e.kind === 'ignore-line' || e.kind === 'set-wall';

/** A click this close to a line END lands on it (a gap opens between two line ends), mm — under
 * the ~5 mm between the ends of two nested sizes, so a click picks ITS size's end. */
export const BRIDGE_END_SNAP_MM = 4;
/** Otherwise a click this close to a line lands on its nearest point, mm (size lines sit 3+ mm apart). */
export const BRIDGE_LINE_SNAP_MM = 2;
/** A bridge is extended past each landing so its raster overlaps the wall it lands on, mm. */
const OVERSHOOT_MM = 0.6;

function nearestOn(
  chains: readonly Chain[],
  skip: ReadonlySet<ChainId>,
  p: PtMm,
  reach: number,
): PtMm | null {
  let best: PtMm | null = null;
  let bd = reach;
  for (const c of chains) {
    if (skip.has(c.id) || c.pts.length < 2) continue;
    const n = c.pts.length;
    const segs = c.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = c.pts[i];
      const b = c.pts[(i + 1) % n];
      if (
        Math.min(a.x, b.x) - reach > p.x ||
        Math.max(a.x, b.x) + reach < p.x ||
        Math.min(a.y, b.y) - reach > p.y ||
        Math.max(a.y, b.y) + reach < p.y
      )
        continue;
      const h = segNearest(p, a, b);
      if (h.d <= bd) {
        bd = h.d;
        best = h.q;
      }
    }
  }
  return best;
}

function nearestEnd(
  chains: readonly Chain[],
  skip: ReadonlySet<ChainId>,
  p: PtMm,
  reach: number,
): PtMm | null {
  let best: PtMm | null = null;
  let bd = reach;
  for (const c of chains) {
    if (skip.has(c.id) || c.closed || c.pts.length < 2) continue;
    for (const q of [c.pts[0], c.pts[c.pts.length - 1]]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}

/**
 * The two clicks of a bridge, landed on the drawing: a line END within 4 mm first, else the nearest
 * point of a line within 2 mm, else the click as given. Ignored chains are not landed on.
 */
export function snapBridge(
  set: ChainSet,
  from: PtMm,
  to: PtMm,
  ignored: ReadonlySet<ChainId> = new Set(),
): { from: PtMm; to: PtMm; landed: [boolean, boolean] } {
  const land = (p: PtMm) =>
    nearestEnd(set.chains, ignored, p, BRIDGE_END_SNAP_MM) ??
    nearestOn(set.chains, ignored, p, BRIDGE_LINE_SNAP_MM);
  const a = land(from);
  const b = land(to);
  return { from: a ?? from, to: b ?? to, landed: [!!a, !!b] };
}

/** Every rank a "for all sizes" edit applies to: the run's ranks (rank 0 for a single size). */
function ranksOf(run: SizeRun): number[] {
  const r = [...new Set(run.sizes.map((z) => z.rank))].sort((a, b) => a - b);
  return r.length ? r : [0];
}

/**
 * The wizard's wall edits folded into the session's walls — each exactly as `addBridge`,
 * `setWall` and `ignoreChain` change them — plus the seeds they can reach. Nothing is filled.
 *   bridge    — snapped to the drawing (snapBridge) and extended 0.6 mm past each landing; rank
 *               null = a bridge in every rank; reaches the seed it was drawn for plus every family
 *               the bridge's box reaches (affectedSeedsNear);
 *   set-wall  — `setWall(chain, rank)`, reaches affectedSeeds(chain);
 *   ignore    — `ignoreChain(chain)`, reaches affectedSeeds(chain).
 */
export function wallEditsInto(
  s: PieceSession,
  edits: readonly WallPieceEdit[],
): { walls: Required<WallEdits>; seeds: Set<SeedId> } {
  let walls = s.walls;
  const seeds = new Set<SeedId>();
  for (const e of edits) {
    if (e.kind === 'ignore-line') {
      affectedSeeds(s, e.chain).forEach((id) => seeds.add(id));
      walls = {
        ...walls,
        exclude: [...walls.exclude.filter((id) => id !== e.chain), e.chain],
        include: walls.include
          .map((x) => ({ ...x, ids: x.ids.filter((id) => id !== e.chain) }))
          .filter((x) => x.ids.length),
      };
    } else if (e.kind === 'set-wall') {
      affectedSeeds(s, e.chain).forEach((id) => seeds.add(id));
      walls = {
        ...walls,
        exclude: walls.exclude.filter((id) => id !== e.chain),
        include: [...walls.include, { rank: e.rank, ids: [e.chain] }],
      };
    } else {
      const sn = snapBridge(s.set, e.from, e.to, new Set(walls.exclude));
      const dx = sn.to.x - sn.from.x;
      const dy = sn.to.y - sn.from.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const ux = dx / len;
      const uy = dy / len;
      const from = { x: sn.from.x - ux * OVERSHOOT_MM, y: sn.from.y - uy * OVERSHOOT_MM };
      const to = { x: sn.to.x + ux * OVERSHOOT_MM, y: sn.to.y + uy * OVERSHOOT_MM };
      const ranks = e.rank == null ? ranksOf(s.run) : [e.rank];
      walls = {
        ...walls,
        bridges: [...walls.bridges, ...ranks.map((rank) => ({ rank, from, to }))],
      };
      if (e.seed != null) seeds.add(e.seed);
      affectedSeedsNear(s, bboxOf([from, to])).forEach((id) => seeds.add(id));
    }
  }
  return { walls, seeds };
}

/** The wizard's wall edits in one go: `wallEditsInto`, then ONE `refill` of the seeds they reach. */
export function applyWallEdits(s: PieceSession, edits: readonly WallPieceEdit[]): PieceSession {
  if (!edits.length) return s;
  const { walls, seeds } = wallEditsInto(s, edits);
  return refill({ ...s, walls }, seeds);
}
