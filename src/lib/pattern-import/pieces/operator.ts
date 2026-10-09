// pieces/ (F4b) — operator wall API for the wizard's Pieces step (F13c): draw a bridge, make a
// chain a wall, or stop a chain being one — then fill again ONLY the seeds the change can touch.
//
// The state is a plain value (`PieceSession`): the inputs of the fill, the operator's wall edits
// so far, and the current families. Every call returns a new session; families of seeds the edit
// cannot reach are carried over untouched (same objects).
import type {
  BoxMm,
  ChainId,
  ChainSet,
  FillOpts,
  PieceFamily,
  PtMm,
  Seed,
  SeedId,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';

import { fillPiecesDetailed, type FillDiag, type WallEdits } from './fill';
import { bboxOf } from './geom';

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

/** A first session: fill every seed. */
export function startSession(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  opts: FillOpts,
): PieceSession {
  const walls: Required<WallEdits> = { exclude: [], include: [], bridges: [] };
  const { families, diag } = fillPiecesDetailed(sheet, set, run, seeds, opts, undefined, walls);
  return { sheet, set, run, seeds, opts, walls, families, diag };
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
  const cb = grow(bboxOf(c.pts), 5);
  const near = grow(cb, 295);
  const at = new Map(s.seeds.map((x) => [x.id, x.at]));
  return s.families
    .filter((f) => {
      if (
        f.candidates.some(
          (x) => x.walls.includes(chain) || (x.outer.length > 2 && meets(x.bbox, cb)),
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
