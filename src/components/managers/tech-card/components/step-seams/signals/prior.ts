// Learned priors (unit-seams E): the owner's saved seams on other products say which kinds of
// pieces and edges get sewn together. A pair whose key was kept on at least two products gets a
// small bonus; refused rows count against it. A prior never builds a pair and never makes a guess
// confident on its own — it only reorders pairs geometry already found.
//
// Key = the two sides' roles (sorted) + edge class (share of the perimeter, bend, notches) + seam
// kind. Never a piece key or an edge number: a key must mean the same on a card it has not seen.
// The fixture is built by scripts/seam-priors-build.mjs (read-only prod + beta-only products).

import type { PieceGeom } from 'lib/assembly-skeleton/types';

import { roleOfName } from './names';
import priorFixture from './prior-labels.json';
import type { SignalFn, SignalSide } from './types';
import { zoneAllows } from './zone';

/** One run of a saved side: what the stored edge anchor keeps. */
export type PriorRun = {
  name: string;
  lenMm: number;
  share: number;
  turnDeg: number;
  notches: number;
};
export type PriorLabel = {
  /** The product (card name); copies of one product are one voice. */
  family: string;
  kind: string;
  status: 'confirmed' | 'rejected' | string;
  a: PriorRun[];
  b: PriorRun[];
};
type Support = { kept: Set<string>; refused: Set<string> };
export type PriorTable = { fine: Map<string, Support>; coarse: Map<string, Support> };

/** Fewer products than this agreeing is one card's habit, not a rule. */
export const MIN_PRODUCTS = 2;
/** The strongest prior: never more than one length-mismatch step. */
export const MAX_PRIOR = 0.06;
/** Products of net support at which the bonus is full. */
const FULL_AT = 4;
/** A role-pair-only match (the edge class differs) counts half. */
const COARSE_WEIGHT = 0.5;

const TURN_FLAT = 8;

type SideClass = { roles: string; cls: string };

/** The class of a side: its roles, and the shape of the piece that carries most of it. */
function classOf(runs: readonly PriorRun[]): SideClass | null {
  const roles = new Set<string>();
  const byPiece = new Map<string, { share: number; turn: number; notches: number }>();
  for (const r of runs) {
    const role = roleOfName(r.name);
    if (!role) return null;
    roles.add(role);
    const p = byPiece.get(r.name) ?? { share: 0, turn: 0, notches: 0 };
    p.share += r.share;
    p.turn += r.turnDeg;
    p.notches += r.notches;
    byPiece.set(r.name, p);
  }
  const main = [...byPiece.values()].sort((x, y) => y.share - x.share)[0];
  if (!main) return null;
  const size = main.share < 0.15 ? 'S' : main.share < 0.35 ? 'M' : 'L';
  const bend = Math.abs(main.turn) < TURN_FLAT ? '0' : main.turn > 0 ? '+' : '-';
  return { roles: [...roles].sort().join('/'), cls: `${size}${bend}${main.notches ? 'n' : ''}` };
}

/** Partial and closure rows are edge seams for keying; composite stays its own kind. */
const kindOf = (kind: string) => (kind === 'composite' || kind === 'surface' ? kind : 'edge');

export function priorKeys(
  a: readonly PriorRun[],
  b: readonly PriorRun[],
  kind: string,
): { fine: string; coarse: string } | null {
  const ca = classOf(a);
  const cb = classOf(b);
  if (!ca || !cb) return null;
  const [x, y] = [ca, cb].sort((p, q) => (`${p.roles}:${p.cls}` < `${q.roles}:${q.cls}` ? -1 : 1));
  const k = kindOf(kind);
  const [rx, ry] = [ca.roles, cb.roles].sort();
  return { fine: `${x.roles}:${x.cls}|${y.roles}:${y.cls}|${k}`, coarse: `${rx}|${ry}|${k}` };
}

export function buildPriorTable(labels: readonly PriorLabel[]): PriorTable {
  const table: PriorTable = { fine: new Map(), coarse: new Map() };
  const add = (m: Map<string, Support>, key: string, l: PriorLabel) => {
    const s = m.get(key) ?? { kept: new Set(), refused: new Set() };
    (l.status === 'rejected' ? s.refused : s.kept).add(l.family);
    m.set(key, s);
  };
  for (const l of labels) {
    if (l.status !== 'confirmed' && l.status !== 'rejected') continue;
    const keys = priorKeys(l.a, l.b, l.kind);
    if (!keys) continue;
    add(table.fine, keys.fine, l);
    add(table.coarse, keys.coarse, l);
  }
  return table;
}

const net = (s: Support | undefined) => {
  if (!s || s.kept.size < MIN_PRODUCTS) return 0;
  return s.kept.size - s.refused.size;
};
const bonus = (n: number) => (n < MIN_PRODUCTS ? 0 : -MAX_PRIOR * Math.min(1, n / FULL_AT));

/** The prior's say on a pair of saved-anchor sides: ≤ 0, or null when the key is unknown or thin. */
export function priorDelta(
  table: PriorTable,
  a: readonly PriorRun[],
  b: readonly PriorRun[],
  kind: string,
): { delta: number; reason: string } | null {
  const keys = priorKeys(a, b, kind);
  if (!keys) return null;
  const fine = net(table.fine.get(keys.fine));
  if (fine >= MIN_PRODUCTS)
    return { delta: bonus(fine), reason: `kept on ${fine} products: ${keys.fine}` };
  const coarse = net(table.coarse.get(keys.coarse));
  if (coarse >= MIN_PRODUCTS)
    return {
      delta: COARSE_WEIGHT * bonus(coarse),
      reason: `pieces kept together on ${coarse} products: ${keys.coarse}`,
    };
  return null;
}

/** A live candidate side as the runs a saved anchor would keep. */
export function runsOfSide(side: SignalSide, geoms: ReadonlyMap<string, PieceGeom>): PriorRun[] {
  const runs: PriorRun[] = [];
  for (const id of side.ids) {
    const pieceKey = id.slice(0, id.lastIndexOf('#'));
    const g = geoms.get(pieceKey);
    const e = g?.edges.find((x) => x.id === id);
    if (!g || !e) continue;
    runs.push({
      name: g.name,
      lenMm: e.lenMm,
      share: e.lenMm / (g.perimMm || e.lenMm || 1),
      turnDeg: e.turnDeg,
      notches: e.notchesMm.length,
    });
  }
  return runs;
}

/** A model pair is a composite seam when either side spans more than one edge. */
export const kindOfPair = (a: SignalSide, b: SignalSide) =>
  a.ids.length > 1 || b.ids.length > 1 ? 'composite' : 'edge';

export function priorSignalFrom(table: PriorTable): SignalFn {
  return (a, b, { op, geoms }) => {
    // The step's own zone outranks a habit from other products: a pair the zone rules out
    // (the yoke's two layers in an armhole step) gets no bonus however often it was kept.
    // Only a step's own guess listens to habits; the pairs the model implies for earlier steps
    // (no op) stay pure geometry.
    if (!op || zoneAllows(a, b, op, geoms) === false) return null;
    const said = priorDelta(table, runsOfSide(a, geoms), runsOfSide(b, geoms), kindOfPair(a, b));
    return said && said.delta ? { term: 'prior', ...said } : null;
  };
}

/** Share of a product's saved piece names a card must carry to be that product (or its copy). */
const SAME_PRODUCT = 0.8;

/** The products whose saved pieces this card carries: their seams are this card's own, not a habit. */
export function ownFamilies(
  labels: readonly PriorLabel[],
  geoms: ReadonlyMap<string, PieceGeom>,
): Set<string> {
  const here = new Set([...geoms.values()].map((g) => g.name.trim().toLowerCase()));
  const names = new Map<string, Set<string>>();
  for (const l of labels)
    for (const r of [...l.a, ...l.b]) {
      const s = names.get(l.family) ?? new Set<string>();
      if (r.name) s.add(r.name.trim().toLowerCase());
      names.set(l.family, s);
    }
  const own = new Set<string>();
  for (const [family, s] of names) {
    const hit = [...s].filter((n) => here.has(n)).length;
    if (s.size >= 3 && hit / s.size >= SAME_PRODUCT) own.add(family);
  }
  return own;
}

/**
 * The shipped prior: a product never votes for itself. A card that carries a product's pieces
 * (that product, or a copy of it) learns only from the other products; its own saved seams are
 * already its stored seams.
 */
export function priorSignalFromLabels(labels: readonly PriorLabel[]): SignalFn {
  const tables = new WeakMap<ReadonlyMap<string, PieceGeom>, SignalFn>();
  return (a, b, ctx) => {
    let fn = tables.get(ctx.geoms);
    if (!fn) {
      const own = ownFamilies(labels, ctx.geoms);
      fn = priorSignalFrom(buildPriorTable(labels.filter((l) => !own.has(l.family))));
      tables.set(ctx.geoms, fn);
    }
    return fn(a, b, ctx);
  };
}

const LABELS = (priorFixture as { labels: PriorLabel[] }).labels;
export const priorSignal: SignalFn = priorSignalFromLabels(LABELS);
