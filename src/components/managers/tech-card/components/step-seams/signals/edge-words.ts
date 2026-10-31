// AI edge words are deliberately coarse. They only read measurements already present on PieceGeom;
// an undecidable word returns null, so a word can reorder candidates but never invent geometry.

import { xSideOf, yMidOf } from 'lib/assembly-skeleton/geometry/plies';
import type { Edge, PieceGeom } from 'lib/assembly-skeleton/types';
import type { SeamEdgeWord } from 'lib/seam-hints';

import { roleOfGeom } from './names';
import type { SignalSide } from './types';

export type EdgeWordPredicate = (
  side: SignalSide,
  geoms: ReadonlyMap<string, PieceGeom>,
) => boolean | null;

type Run = { geom: PieceGeom; edge: Edge };

const INNER = /^(.*):i\d+$/;
const pieceOf = (id: string) => {
  const inner = INNER.exec(id);
  return inner?.[1] ?? id.slice(0, id.lastIndexOf('#'));
};

function runsOf(side: SignalSide, geoms: ReadonlyMap<string, PieceGeom>): readonly Run[] | null {
  const out: Run[] = [];
  for (const id of side.ids) {
    if (INNER.test(id)) return null;
    const geom = geoms.get(pieceOf(id));
    const edge = geom?.edges.find((candidate) => candidate.id === id);
    if (!geom || !edge) return null;
    out.push({ geom, edge });
  }
  return out.length ? out : null;
}

const edgeVote = (
  side: SignalSide,
  geoms: ReadonlyMap<string, PieceGeom>,
  decide: (runs: readonly Run[]) => boolean | null,
): boolean | null => {
  const runs = runsOf(side, geoms);
  return runs ? decide(runs) : null;
};

const verticalVote = (runs: readonly Run[], at: 'top' | 'bottom') => {
  const total = runs.reduce((sum, run) => sum + run.edge.lenMm, 0);
  if (!(total > 0)) return null;
  const y = runs.reduce((sum, run) => sum + yMidOf(run.geom, run.edge) * run.edge.lenMm, 0) / total;
  if (at === 'top') return y >= 0.65 ? true : y <= 0.5 ? false : null;
  return y <= 0.35 ? true : y >= 0.5 ? false : null;
};

const curvedVote = (runs: readonly Run[]) => {
  const turns = runs.map(({ edge }) => Math.abs(edge.turnDeg));
  if (turns.some((turn) => turn >= 20)) return true;
  if (turns.every((turn) => turn <= 8)) return false;
  return null;
};

const roleVote = (
  runs: readonly Run[],
  geoms: ReadonlyMap<string, PieceGeom>,
  allowed: ReadonlySet<string>,
) => {
  const roles = runs.map(({ geom }) => roleOfGeom(geom, geoms));
  if (roles.some((role) => role == null)) return null;
  return roles.every((role) => allowed.has(role!));
};

const top: EdgeWordPredicate = (side, geoms) =>
  edgeVote(side, geoms, (runs) => verticalVote(runs, 'top'));
const bottom: EdgeWordPredicate = (side, geoms) =>
  edgeVote(side, geoms, (runs) => verticalVote(runs, 'bottom'));

const innerLine: EdgeWordPredicate = (side, geoms) => {
  if (!side.ids.length) return null;
  const inner = side.ids.map((id) => INNER.exec(id));
  if (inner.every(Boolean)) return inner.every((match) => geoms.has(match![1])) ? true : null;
  return inner.some(Boolean) ? null : false;
};

const predicates: Readonly<Record<SeamEdgeWord, EdgeWordPredicate>> = {
  front_edge: (side, geoms) =>
    edgeVote(side, geoms, (runs) => {
      const roles = runs.map(({ geom }) => roleOfGeom(geom, geoms));
      if (roles.some((role) => role == null)) return null;
      if (!roles.every((role) => role === 'front')) return false;
      for (const { geom, edge } of runs) {
        if (!geom.hand) return null;
        const centre = geom.hand === 'L' ? -1 : 1;
        if (
          xSideOf(geom, edge) !== centre ||
          Math.abs(edge.turnDeg) > 8 ||
          edge.lenMm < 0.1 * geom.perimMm
        )
          return false;
      }
      return true;
    }),
  hem: (side, geoms) => bottom(side, geoms),
  neckline: (side, geoms) =>
    edgeVote(side, geoms, (runs) => {
      const roles = roleVote(
        runs,
        geoms,
        new Set(['front', 'back', 'yoke', 'facing', 'neck_facing', 'collar', 'stand']),
      );
      if (roles !== true) return roles;
      const high = verticalVote(runs, 'top');
      if (high === false) return false;
      if (runs.some(({ edge }) => edge.turnDeg <= -20)) return true;
      return curvedVote(runs) === false ? false : null;
    }),
  shoulder: (side, geoms) =>
    edgeVote(side, geoms, (runs) => {
      const roles = roleVote(runs, geoms, new Set(['front', 'back', 'yoke']));
      if (roles !== true) return roles;
      const high = verticalVote(runs, 'top');
      if (high !== true) return high;
      return runs.every(({ edge }) => Math.abs(edge.turnDeg) <= 20);
    }),
  armhole: (side, geoms) =>
    edgeVote(side, geoms, (runs) => {
      const roles = roleVote(runs, geoms, new Set(['front', 'back', 'yoke', 'sleeve']));
      if (roles !== true) return roles;
      const high = verticalVote(runs, 'top');
      if (high === false) return false;
      return curvedVote(runs);
    }),
  side: (side, geoms) =>
    edgeVote(side, geoms, (runs) => {
      const positions = runs.map(({ geom, edge }) => xSideOf(geom, edge));
      return positions.every((position) => position !== 0);
    }),
  slit: (side, geoms) => {
    const inner = innerLine(side, geoms);
    if (inner !== true) return inner;
    const roles = side.ids.map((id) => {
      const geom = geoms.get(pieceOf(id));
      return geom ? roleOfGeom(geom, geoms) : null;
    });
    if (roles.some((role) => role == null)) return null;
    return roles.every((role) => role === 'sleeve');
  },
  top,
  bottom,
  long: (side, geoms) =>
    edgeVote(side, geoms, (runs) =>
      runs.every(({ geom, edge }) => {
        const longest = Math.max(...geom.edges.map((candidate) => candidate.lenMm));
        return edge.lenMm >= 0.75 * longest || edge.lenMm >= 0.25 * geom.perimMm;
      }),
    ),
  short: (side, geoms) =>
    edgeVote(side, geoms, (runs) =>
      runs.every(({ geom, edge }) => {
        const longest = Math.max(...geom.edges.map((candidate) => candidate.lenMm));
        return edge.lenMm <= 0.4 * longest || edge.lenMm <= 0.15 * geom.perimMm;
      }),
    ),
  curved: (side, geoms) => edgeVote(side, geoms, curvedVote),
  inner_line: innerLine,
};

/** A closed-vocabulary word's predicate, or null for an unrecognised future word. */
export function edgeWordPredicate(word: string): EdgeWordPredicate | null {
  return predicates[word as SeamEdgeWord] ?? null;
}

/** true/false when geometry decides, null when the word or geometry cannot vote. */
export function edgeWordVote(
  word: string,
  side: SignalSide,
  geoms: ReadonlyMap<string, PieceGeom>,
): boolean | null {
  return edgeWordPredicate(word)?.(side, geoms) ?? null;
}
