// chains/ — operator edits to the legend (ApplyLegendFn): class → role / size label.
//
// Edits change the class row only; chains, bundles and ambiguities stay as built. A class moved
// out of role 'size' loses its size label; ambiguities naming an edited class are dropped (the
// operator answered them). Orphans are recomputed: size-line chains no class claims as size/common.
import type { ApplyLegendFn, ChainSet, LineClass, PtMm, Style } from 'lib/pattern-import/types';

import { resample, SegGrid, segNearest } from './geom';
import { normDash } from './link';

/**
 * Every row's signature (LineClass.sig): the dominant pen of its lines (colour, width, dash,
 * layer) and how it was found (its evidence kinds); rows alike in all of that are told apart by
 * their order.
 */
export function withClassSigs(set: ChainSet, styles: readonly Style[]): ChainSet {
  const byId = new Map(styles.map((s) => [s.id, s]));
  const seen = new Map<string, number>();
  const classes = set.classes.map((c) => {
    const len = new Map<number, number>();
    for (const id of c.chains) {
      const ch = set.chains[id];
      if (ch) len.set(ch.style, (len.get(ch.style) ?? 0) + ch.lengthMm);
    }
    const top = [...len].sort((a, b) => b[1] - a[1])[0]?.[0];
    const st = top != null ? byId.get(top) : undefined;
    const pen = st
      ? `${st.strokeRgb ? st.strokeRgb.join(',') : '-'}|${st.widthMm.toFixed(2)}|${st.dash ? st.dash.join(',') : '-'}|${st.layer ?? '-'}`
      : '-';
    // the key sample is where the row was read, not what it is: a rebuild that reads the key
    // better (or worse) keeps the operator's answers on the row
    const how = [...new Set(c.evidence.map((e) => e.kind).filter((k) => k !== 'legend-sample'))]
      .sort()
      .join(',');
    const base = `${pen}|${how}|${c.sizeLabel ?? ''}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...c, sig: `${base}#${n}` };
  });
  return { ...set, classes };
}

export const applyLegend: ApplyLegendFn = (set, edits) => {
  // an answer bound to a row signature finds that row whatever its number now, and is dropped when
  // no row carries it any more; an unbound (older) answer goes by the number
  const editOf = (c: LineClass) =>
    edits.find((e) => (e.sig ? e.sig === c.sig : e.classId === c.id));
  const classes: LineClass[] = set.classes.map((c) => {
    const e = editOf(c);
    if (!e) return c;
    const sizeLabel = e.role === 'size' ? e.sizeLabel : null;
    // an edit that changes nothing is no answer (T3): the row keeps its confidence and its question
    if (e.role === c.role && (sizeLabel ?? null) === (c.sizeLabel ?? null)) return c;
    return { ...c, role: e.role, sizeLabel, confidence: 1 };
  });
  const edited = new Set(classes.filter((c, k) => c !== set.classes[k]).map((c) => c.id));
  const ambiguities = set.ambiguities?.filter((a) => !a.classes.some((c) => edited.has(c)));
  const claimed = new Set(classes.filter((c) => c.role !== 'ignore').flatMap((c) => c.chains));
  const orphans = set.orphans.filter((i) => !claimed.has(i));
  return { ...set, classes, orphans, ...(ambiguities ? { ambiguities } : {}) };
};

/**
 * The operator's "confirm" on a row as proposed (the sizes step's chip; keys as `legendConfirmed`:
 * the row's sig, or `#id` for a row without one). An answer like a role edit — confidence 1, the
 * row's questions dropped — in a NEW set, so what is keyed by the set (gradeView, the solver's cache)
 * sees it. `applyLegend` alone keeps a same-role edit at its proposed confidence (T3: a row sent
 * back as built is no answer); this is the explicit one. Rows nobody touched stay as built.
 */
export function confirmRows(set: ChainSet, keys: readonly string[]): ChainSet {
  const want = new Set(keys);
  const classes = set.classes.map((c) =>
    want.has(c.sig ?? `#${c.id}`) && c.confidence < 1 ? { ...c, confidence: 1 } : c,
  );
  const edited = new Set(classes.filter((c, k) => c !== set.classes[k]).map((c) => c.id));
  if (!edited.size) return set;
  const ambiguities = set.ambiguities?.filter((a) => !a.classes.some((c) => edited.has(c)));
  return { ...set, classes, ...(ambiguities ? { ambiguities } : {}) };
}

/**
 * Same size label on two size rows = one size (a size drawn in two looks, F3 `class-split`): the
 * chains join the lower-ranked row. Run after `applyLegend` (the operator's labels).
 */
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
 * MOOD-F1: the operator's "split row" (an edit with `split`): the row's lines go into two rows —
 *   look     by the pen of each line (declared dash shape, recovered motif, width): a row that took
 *            two looks the reader could not tell apart (one look cluster, two sizes);
 *   nesting  by the sizes each line runs between (its nearest size line on either side): Mood S
 *            and L drawn alike, one runs between XS and M, the other between M and XL.
 * The larger part keeps the row (its label, its answers); the other becomes a new size row with
 * no label (the operator names it — or types the label of a row to merge into). Run on a set with
 * sigs (withClassSigs) BEFORE applyLegend: the new row's sig `<row sig>/split-<by>` is what the
 * operator's label for it is bound to. A row that does not divide is left as is, with a warning.
 */
export function splitRows(set: ChainSet, edits: Parameters<ApplyLegendFn>[1]): ChainSet {
  const asks = edits.filter((e) => e.split);
  if (!asks.length) return set;
  let classes = set.classes.slice();
  const warnings = [...set.warnings];
  for (const e of asks) {
    const row = classes.find((c) => (e.sig ? c.sig === e.sig : c.id === e.classId));
    if (!row || row.chains.length < 2) continue;
    const parts = e.split === 'look' ? splitByLook(set, row) : splitByNesting(set, row, classes);
    if (!parts) {
      warnings.push(
        `row ${row.sizeLabel ?? row.id} not split: its lines are all ${e.split === 'look' ? 'drawn alike' : 'between the same sizes'}`,
      );
      continue;
    }
    const total = (ids: number[]) => ids.reduce((a, i) => a + (set.chains[i]?.lengthMm ?? 0), 0);
    const [keep, away] = parts;
    const id = Math.max(...classes.map((c) => c.id)) + 1;
    classes = classes.map((c) =>
      c === row ? { ...c, chains: keep, totalLengthMm: total(keep) } : c,
    );
    classes.push({
      id,
      role: row.role,
      sizeLabel: null,
      chains: away,
      totalLengthMm: total(away),
      evidence: row.evidence.filter((x) => x.kind !== 'legend-sample' && x.kind !== 'text-label'),
      confidence: 0.4,
      sig: `${row.sig ?? `#${row.id}`}/split-${e.split}`,
    });
    warnings.push(
      `row ${row.sizeLabel ?? row.id} split by ${e.split}: ${away.length} lines in a new row — name it`,
    );
  }
  return { ...set, classes, warnings };
}

function splitByLook(set: ChainSet, row: LineClass): [number[], number[]] | null {
  const look = new Map<string, number[]>();
  for (const i of row.chains) {
    const c = set.chains[i];
    if (!c) continue;
    const k = c.motif
      ? normDash(c.motif)
          .map((v) => v.toFixed(1))
          .join('/')
      : 'solid';
    const a = look.get(k);
    if (a) a.push(i);
    else look.set(k, [i]);
  }
  return twoBiggest(set, [...look.values()], row.chains);
}

/**
 * Nesting split tuning. A line of the row reads its place among the other sizes only where it
 * stands apart from them: on a stretch where every size runs on top of one another (a fold, a
 * straight edge all sizes share — LEAKS' motif rows give each size its own copy of it) the nearest
 * line on either side says nothing about the line's size.
 */
const NEST = {
  stepMm: 5,
  reachMm: 25,
  /** a size line this close runs on top of this one: the sample is coincident, not read */
  coincideMm: 0.15,
  /** lines within this of the nearest on one side stand there together (a coincident bundle) */
  bundleMm: 0.15,
  /** the nearer neighbour is ≥ this fraction of the local grade step (not a converging stretch) */
  apartFrac: 0.25,
  /** a line is placed by ≥ this many separated samples */
  minSamples: 3,
  /** a line read only on coincident stretches: ≥ this share of its samples say one of the two gaps */
  hairAgree: 0.8,
  /** a copy of a line: ≥ copyCover of it within copyMm of that line; a line shorter than
   *  copyMinMm on a placed line is not trusted to be the other size (a tile-overlap duplicate) */
  copyMm: 0.5,
  copyCover: 0.6,
  copyMinMm: 30,
  /** extents compared only when each copy lies ≥ this much on the other colour's copies; another
   *  size's copy of the line counts in the trend when ≥ this much of it lies on the copies */
  trendCover: 0.75,
  /** the extent trend over the other sizes' copies (Kendall τ), and the colours' length difference */
  trendTau: 0.6,
  trendMinSizes: 3,
  copyDiffMm: 1,
};

function splitByNesting(
  set: ChainSet,
  row: LineClass,
  classes: LineClass[],
): [number[], number[]] | null {
  // other size rows' lines, with their nesting rank: where does each line of this row stand among
  // them — between the size lines next to it on either side (S between XS and M ≈ 2, L between M
  // and XL ≈ 4); the row's lines fall in two groups when the row holds two sizes
  const rankOfRow = (c: LineClass) => {
    for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
    return null;
  };
  const rankOf = new Map<number, number>();
  for (const c of classes) {
    const r = rankOfRow(c);
    if (c.role === 'size' && c !== row && r != null) for (const i of c.chains) rankOf.set(i, r);
  }
  const grid = new SegGrid(8);
  for (const i of rankOf.keys()) if (set.chains[i]) grid.addPolyline(i, set.chains[i].pts);
  const lenOf = (i: number) => set.chains[i]?.lengthMm ?? 0;

  // the gaps between the other sizes, in nesting order: each of the row's two sizes stands in one
  // (S between XS and M, L between M and XL)
  const ranks = [...new Set(rankOf.values())].sort((x, y) => x - y);
  const cellOf = new Map(ranks.map((r, k) => [r, k]));

  // 1 — each line's place, read on its separated stretches only: every sample says "between these
  // two sizes" (a span of gaps); a sample spanning several gaps shares its vote among them
  const score = new Map<number, Map<number, number>>();
  // the same read on its coincident stretches: lines a hair apart (≤ coincideMm) still in order
  // (L 0.05 mm inside XL and 0.05 mm outside M) — trusted only for a line with no separated read,
  // and only when nearly all of it says one gap (true coincidence jitters from gap to gap)
  const hair = new Map<number, { sc: Map<number, number>; n: number }>();
  for (const i of row.chains) {
    const ch = set.chains[i];
    if (!ch) continue;
    const sc = new Map<number, number>();
    const sc2 = new Map<number, number>();
    let n = 0;
    let n2 = 0;
    for (const sm of resample(ch.pts, NEST.stepMm)) {
      // per side: the nearest distance of each rank there
      const sides = [new Map<number, number>(), new Map<number, number>()];
      grid.near(sm.p, NEST.reachMm, (j, si) => {
        const q = set.chains[j].pts;
        const r = segNearest(sm.p, q[si], q[si + 1]);
        if (r.d > NEST.reachMm) return;
        const a = q[si];
        const b = q[si + 1];
        const v: PtMm = {
          x: a.x + (b.x - a.x) * r.u - sm.p.x,
          y: a.y + (b.y - a.y) * r.u - sm.p.y,
        };
        // which side of the line's direction the neighbour is on
        const m = sides[sm.t.x * v.y - sm.t.y * v.x > 0 ? 0 : 1];
        const rk = rankOf.get(j)!;
        if (r.d < (m.get(rk) ?? Infinity)) m.set(rk, r.d);
      });
      if (!sides[0].size || !sides[1].size) continue;
      const best = sides.map((m) => Math.min(...m.values()));
      const near = Math.min(best[0], best[1]);
      // the bundle standing nearest on each side (sizes coinciding there stand together)
      const [A, B] = sides.map((m, k) =>
        [...m].filter(([, d]) => d <= best[k] + NEST.bundleMm).map(([rk]) => rk),
      );
      let lo: number;
      let hi: number;
      if (Math.max(...A) < Math.min(...B)) [lo, hi] = [Math.max(...A), Math.min(...B)];
      else if (Math.max(...B) < Math.min(...A)) [lo, hi] = [Math.max(...B), Math.min(...A)];
      else continue; // the same size on both sides (two pieces' lines), or out of order
      const c0 = cellOf.get(lo)!;
      const c1 = cellOf.get(hi)!;
      // another size runs on top of this one here: only a hair's read
      if (near < NEST.coincideMm) {
        for (let c = c0; c < c1; c++) sc2.set(c, (sc2.get(c) ?? 0) + 1 / (c1 - c0));
        n2++;
        continue;
      }
      // converging: the line hugs one side much closer than a grade step
      if (near < (NEST.apartFrac * (best[0] + best[1])) / (hi - lo)) continue;
      for (let c = c0; c < c1; c++) sc.set(c, (sc.get(c) ?? 0) + 1 / (c1 - c0));
      n++;
    }
    if (n >= NEST.minSamples) score.set(i, sc);
    else if (n2 >= NEST.minSamples) hair.set(i, { sc: sc2, n: n2 });
  }
  // the two gaps holding the most of the row's read length (its separated samples), each ≥ 10 %
  // of it — a long line read on a few samples weighs those samples, not its whole length
  const byCell = new Map<number, number>();
  let total = 0;
  for (const sc of score.values())
    for (const [c, x] of sc) {
      byCell.set(c, (byCell.get(c) ?? 0) + x * NEST.stepMm);
      total += x * NEST.stepMm;
    }
  const [cA, cB] = [...byCell]
    .filter(([, len]) => len >= 0.1 * total)
    .sort((x, y) => y[1] - x[1])
    .map(([c]) => c);
  // the row's lines all stand in one gap: one size
  if (cA == null || cB == null) return null;
  const [cLo, cHi] = cA < cB ? [cA, cB] : [cB, cA];
  const lo = new Set<number>();
  const hi = new Set<number>();
  const place = new Set<number>();
  for (const [i, sc] of score) {
    const a = sc.get(cLo) ?? 0;
    const b = sc.get(cHi) ?? 0;
    if (a === b) continue;
    (a > b ? lo : hi).add(i);
    place.add(i);
  }
  for (const [i, { sc, n }] of hair) {
    const a = sc.get(cLo) ?? 0;
    const b = sc.get(cHi) ?? 0;
    if (Math.max(a, b) < NEST.hairAgree * n) continue;
    (a > b ? lo : hi).add(i);
    place.add(i);
  }
  // a gap whose lines all lean to the other one after all: no second size
  if (!lo.size || !hi.size) return null;

  // 2 — the lines with no separated stretch (every size on top of them). A line of this row lying on
  // another line of this row is the other size's copy of that stretch (a size does not draw its line
  // twice): it goes to the other group. So the copies of one line are coloured in two, starting
  // from the lines placed above; copies of a line none of which is placed are told apart by their
  // extent — the other sizes' copies of that line grow (or shrink) with the size, and the longer
  // colour follows that trend. Anything else stays with the larger part, as before.
  const unplaced = row.chains.filter((i) => set.chains[i] && !place.has(i));
  if (unplaced.length) {
    const rowGrid = new SegGrid(8);
    for (const i of row.chains) if (set.chains[i]) rowGrid.addPolyline(i, set.chains[i].pts);
    // the share of line i's samples running within copyMm of each line of the grid (or of any of
    // `only`, when given)
    const onTop = (i: number, g: SegGrid, only?: Set<number>) => {
      const n = new Map<number, number>();
      let any = 0;
      const smp = resample(set.chains[i].pts, NEST.stepMm);
      for (const sm of smp) {
        const hit = new Set<number>();
        g.near(sm.p, NEST.copyMm, (j, si) => {
          if (j === i || hit.has(j) || (only && !only.has(j))) return;
          const q = set.chains[j].pts;
          if (segNearest(sm.p, q[si], q[si + 1]).d <= NEST.copyMm) hit.add(j);
        });
        for (const j of hit) n.set(j, (n.get(j) ?? 0) + 1);
        if (hit.size) any++;
      }
      const k = Math.max(1, smp.length);
      return { share: new Map([...n].map(([j, c]) => [j, c / k])), any: any / k };
    };
    // copies: an unplaced line lying on another line of the row (both ways count as one edge)
    const edges = new Map<number, Set<number>>();
    const link = (x: number, y: number) => {
      for (const [p, q] of [
        [x, y],
        [y, x],
      ]) {
        const e = edges.get(p);
        if (e) e.add(q);
        else edges.set(p, new Set([q]));
      }
    };
    // a short stray on a placed line may be a tile-overlap duplicate of the same size
    for (const u of unplaced)
      for (const [j, sh] of onTop(u, rowGrid).share)
        if (sh >= NEST.copyCover && (!place.has(j) || lenOf(u) >= NEST.copyMinMm)) link(u, j);
    // the other sizes' copies of one line (its copies in two colours): how their length goes with
    // their rank (Kendall τ) — each counts when ≥ trendCover of it lies on one colour's copies
    const trendOf = (cls: Set<number>[]) => {
      const over = new Map<number, number>();
      for (const c of cls) {
        const mm = new Map<number, number>();
        for (const i of c)
          for (const [j, sh] of onTop(i, grid).share) mm.set(j, (mm.get(j) ?? 0) + sh * lenOf(i));
        for (const [j, x] of mm) over.set(j, Math.max(over.get(j) ?? 0, x));
      }
      const pts = [...over]
        .filter(([j, mm]) => mm >= NEST.trendCover * lenOf(j))
        .map(([j]) => ({ r: rankOf.get(j)!, len: lenOf(j) }));
      if (new Set(pts.map((p) => p.r)).size < NEST.trendMinSizes) return 0;
      let c = 0;
      let d = 0;
      for (let a = 0; a < pts.length; a++)
        for (let b = a + 1; b < pts.length; b++) {
          const x = Math.sign(pts[a].r - pts[b].r) * Math.sign(pts[a].len - pts[b].len);
          if (x > 0) c++;
          else if (x < 0) d++;
        }
      return c + d ? (c - d) / (c + d) : 0;
    };
    // colour from the placed lines: across an edge, the other group
    const side = new Map<number, 0 | 1>();
    for (const i of lo) side.set(i, 0);
    for (const i of hi) side.set(i, 1);
    const clash = new Set<number>();
    const spread = (seeds: number[], into: Map<number, 0 | 1>) => {
      const q = seeds.slice();
      while (q.length) {
        const x = q.shift()!;
        for (const y of edges.get(x) ?? []) {
          if (place.has(y)) continue;
          const want = (1 - into.get(x)!) as 0 | 1;
          const had = into.get(y);
          if (had == null) {
            into.set(y, want);
            q.push(y);
          } else if (had !== want) clash.add(y);
        }
      }
    };
    spread(
      [...place].filter((i) => edges.has(i)),
      side,
    );
    // copies coloured both ways (a duplicate of one size, a third copy): their whole run of
    // unplaced copies stays unplaced
    for (const q = [...clash]; q.length; )
      for (const y of edges.get(q.pop()!) ?? [])
        if (!place.has(y) && !clash.has(y)) {
          clash.add(y);
          q.push(y);
        }
    // components with no placed line: two colours, oriented by the extent trend
    const free = new Set(unplaced.filter((u) => !side.has(u) && edges.has(u)));
    for (const u of free) {
      if (side.has(u)) continue;
      const col = new Map<number, 0 | 1>([[u, 0]]);
      spread([u], col);
      for (const [x, c] of col) side.set(x, c); // claimed, oriented below
      const comp = [...col.keys()];
      if (comp.some((x) => clash.has(x))) {
        for (const x of comp) clash.add(x);
        continue;
      }
      const cls = [0, 1].map((c) => new Set(comp.filter((x) => col.get(x) === c)));
      // each copy runs end to end on the other colour's copies (not a line turning a corner)
      const ok = comp.every((x) => onTop(x, rowGrid, cls[1 - col.get(x)!]).any >= NEST.trendCover);
      const tau = ok ? trendOf(cls) : 0;
      const L2 = cls.map((c) => [...c].reduce((t, i) => t + lenOf(i), 0));
      const diff = L2[0] - L2[1];
      if (Math.abs(tau) < NEST.trendTau || Math.abs(diff) < NEST.copyDiffMm) {
        for (const x of comp) clash.add(x);
        continue;
      }
      // the longer colour is the larger size when the other sizes' copies grow with the size
      const big = diff > 0 === tau > 0 ? 0 : 1;
      for (const x of comp) side.set(x, col.get(x) === big ? 1 : 0);
    }
    for (const [x, c] of side) {
      if (place.has(x) || clash.has(x)) continue;
      (c ? hi : lo).add(x);
    }
  }
  const L = (ids: Set<number>) => [...ids].reduce((t, i) => t + lenOf(i), 0);
  const [, b] = L(lo) >= L(hi) ? [lo, hi] : [hi, lo];
  // lines that could not be placed stay with the larger part
  return [row.chains.filter((i) => !b.has(i)), [...b]];
}

/** The two largest groups by length; the rest go with the larger. Null when < 2 groups. */
function twoBiggest(set: ChainSet, groups: number[][], all: number[]): [number[], number[]] | null {
  if (groups.length < 2) return null;
  const len = (ids: number[]) => ids.reduce((a, i) => a + (set.chains[i]?.lengthMm ?? 0), 0);
  const sorted = groups.slice().sort((a, b) => len(b) - len(a));
  const away = new Set(sorted[1]);
  return [all.filter((i) => !away.has(i)), sorted[1]];
}
