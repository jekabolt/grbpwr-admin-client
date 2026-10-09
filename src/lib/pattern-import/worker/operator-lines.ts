// The operator's answers that change WHICH LINES ARE WALLS, applied to a ChainSet before the fill
// (F13c). Pure ChainSet → ChainSet, built on the contract types only — no reach into pieces/ or
// chains/ internals:
//
//   bridge       "close gap": two clicks → a straight wall between the nearest drawn lines,
//                added to the size class of that rank (or the common class for every size), so
//                every pass of the fill — and every refill inside applyPieceEdits — sees it;
//   ignore-line  "ignore this line": the chain leaves every class / bundle / orphan list and its
//                geometry collapses to one point, so no pass (class, plug, rerank, rescue) can
//                pick it up again;
//   legend merge two size rows given the same label are ONE size (a size drawn in two looks,
//                F3 `class-split`): their chains join the lower-ranked class.
//
// THIN ADAPTER: lane F4b adds `addBridge(seed, rank, from, to)` and `ignoreChain` to pieces/. When
// they land, `withOperatorLines` becomes a call to them (the PieceEdit kinds stay the same).
import type { Chain, ChainId, ChainSet, LineClass, PieceEdit, PtMm, SizeRun } from '../types';

type Bridge = Extract<PieceEdit, { kind: 'bridge' }>;
type Ignore = Extract<PieceEdit, { kind: 'ignore-line' }>;

/** A click this close to a line END lands on it (gaps open between two line ends), mm. */
export const BRIDGE_END_SNAP_MM = 8;
/** Otherwise a click this close to a line lands on its nearest point, mm (size lines sit 3+ mm apart). */
export const BRIDGE_LINE_SNAP_MM = 2;
/** A bridge is extended past each landing so its raster overlaps the wall it lands on, mm. */
const OVERSHOOT_MM = 0.6;

export const isWallEdit = (e: PieceEdit): e is Bridge | Ignore =>
  e.kind === 'bridge' || e.kind === 'ignore-line';

function nearestOnChains(
  chains: readonly Chain[],
  skip: ReadonlySet<ChainId>,
  p: PtMm,
  reach: number,
): { at: PtMm; chain: ChainId } | null {
  let best: { at: PtMm; chain: ChainId; d: number } | null = null;
  for (const c of chains) {
    if (skip.has(c.id) || c.pts.length < 2) continue;
    const n = c.pts.length;
    const segs = c.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = c.pts[i];
      const b = c.pts[(i + 1) % n];
      // cheap box reject
      if (
        Math.min(a.x, b.x) - reach > p.x ||
        Math.max(a.x, b.x) + reach < p.x ||
        Math.min(a.y, b.y) - reach > p.y ||
        Math.max(a.y, b.y) + reach < p.y
      )
        continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      const q = { x: a.x + t * dx, y: a.y + t * dy };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= reach && (!best || d < best.d)) best = { at: q, chain: c.id, d };
    }
  }
  return best && { at: best.at, chain: best.chain };
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
 * The two clicks of a bridge, landed on the drawing: a line END within 8 mm first (a gap opens
 * between two ends), else the nearest point of a line within 2 mm, else the click as given.
 */
export function snapBridge(
  set: ChainSet,
  from: PtMm,
  to: PtMm,
  ignored: ReadonlySet<ChainId> = new Set(),
): { from: PtMm; to: PtMm; landed: [boolean, boolean] } {
  const land = (p: PtMm) =>
    nearestEnd(set.chains, ignored, p, BRIDGE_END_SNAP_MM) ??
    nearestOnChains(set.chains, ignored, p, BRIDGE_LINE_SNAP_MM)?.at ??
    null;
  const a = land(from);
  const b = land(to);
  return { from: a ?? from, to: b ?? to, landed: [!!a, !!b] };
}

/** Same size label on two size rows = one size: the chains join the lower-ranked row. */
export function mergeSameSize(set: ChainSet): ChainSet {
  const rankOf = (c: LineClass) => {
    for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
    return Infinity;
  };
  const groups = new Map<string, LineClass[]>();
  for (const c of set.classes) {
    if (c.role !== 'size' || !c.sizeLabel?.trim()) continue;
    const k = c.sizeLabel.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const gone = new Set<number>();
  const into = new Map<number, LineClass>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const [head, ...rest] = [...g].sort((a, b) => rankOf(a) - rankOf(b));
    const chains = [...head.chains, ...rest.flatMap((c) => c.chains)];
    into.set(head.id, {
      ...head,
      chains,
      totalLengthMm: head.totalLengthMm + rest.reduce((n, c) => n + c.totalLengthMm, 0),
      evidence: [
        ...head.evidence,
        ...rest.flatMap((c) => c.evidence.filter((e) => e.kind !== 'nesting-order')),
      ],
      confidence: 1,
    });
    rest.forEach((c) => gone.add(c.id));
  }
  if (!gone.size) return set;
  return {
    ...set,
    classes: set.classes.filter((c) => !gone.has(c.id)).map((c) => into.get(c.id) ?? c),
    // bundles were cut to the old size count; the fill re-derives local ranks without them
    bundles: [],
    ambiguities: set.ambiguities?.filter((a) => !a.classes.some((id) => gone.has(id))),
    warnings: [
      ...set.warnings,
      `${gone.size} size ${gone.size === 1 ? 'row' : 'rows'} merged by label (one size drawn in two looks)`,
    ],
  };
}

/**
 * The wall set the fill runs on: `set` + the operator's bridges − the lines they ignored. Bridges
 * get ids after the last chain, so every id of `set` keeps its meaning.
 */
export function withOperatorLines(
  set: ChainSet,
  run: SizeRun,
  edits: readonly PieceEdit[],
): { set: ChainSet; bridges: { id: ChainId; from: PtMm; to: PtMm; landed: [boolean, boolean] }[] } {
  const ignored = new Set(
    edits.filter((e): e is Ignore => e.kind === 'ignore-line').map((e) => e.chain),
  );
  const bridges = edits.filter((e): e is Bridge => e.kind === 'bridge');
  if (!ignored.size && !bridges.length) return { set, bridges: [] };

  const chains = set.chains.map((c) =>
    ignored.has(c.id) ? { ...c, pts: c.pts.slice(0, 1), closed: false, lengthMm: 0 } : c,
  );
  let classes = set.classes.map((c) =>
    c.chains.some((id) => ignored.has(id))
      ? { ...c, chains: c.chains.filter((id) => !ignored.has(id)) }
      : c,
  );
  const out: { id: ChainId; from: PtMm; to: PtMm; landed: [boolean, boolean] }[] = [];
  const addTo = (id: ChainId, rank: number | null) => {
    const classId = rank != null ? run.sizes[rank]?.classId ?? null : null;
    const own = classId != null ? classes.find((c) => c.id === classId && c.role === 'size') : null;
    const target = own ?? classes.find((c) => c.role === 'common');
    if (target) {
      classes = classes.map((c) => (c === target ? { ...c, chains: [...c.chains, id] } : c));
      return;
    }
    const nextId = Math.max(-1, ...classes.map((c) => c.id)) + 1;
    classes = [
      ...classes,
      {
        id: nextId,
        role: 'common',
        sizeLabel: null,
        chains: [id],
        totalLengthMm: 0,
        evidence: [],
        confidence: 1,
      },
    ];
  };
  for (const b of bridges) {
    const s = snapBridge({ ...set, chains }, b.from, b.to, ignored);
    const dx = s.to.x - s.from.x;
    const dy = s.to.y - s.from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) continue;
    const ux = dx / len;
    const uy = dy / len;
    const id = chains.length;
    const near = nearestOnChains(chains, ignored, s.from, BRIDGE_END_SNAP_MM);
    chains.push({
      id,
      pts: [
        { x: s.from.x - ux * OVERSHOOT_MM, y: s.from.y - uy * OVERSHOOT_MM },
        { x: s.to.x + ux * OVERSHOOT_MM, y: s.to.y + uy * OVERSHOOT_MM },
      ],
      closed: false,
      ranges: [],
      motif: null,
      style: (near ? chains[near.chain]?.style : undefined) ?? set.chains[0]?.style ?? 0,
      lengthMm: len + 2 * OVERSHOOT_MM,
    });
    addTo(id, b.rank);
    out.push({ id, from: s.from, to: s.to, landed: s.landed });
  }
  const strip = (ids: ChainId[]) => ids.filter((id) => !ignored.has(id));
  if (ignored.size) {
    classes = [
      ...classes,
      {
        id: Math.max(-1, ...classes.map((c) => c.id)) + 1,
        role: 'ignore',
        sizeLabel: null,
        chains: [...ignored],
        totalLengthMm: 0,
        evidence: [],
        confidence: 1,
      },
    ];
  }
  return {
    set: {
      ...set,
      chains,
      classes,
      bundles: set.bundles.filter((b) => !b.chains.some((id) => ignored.has(id))),
      orphans: strip(set.orphans),
    },
    bridges: out,
  };
}
