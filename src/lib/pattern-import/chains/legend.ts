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

function splitByNesting(
  set: ChainSet,
  row: LineClass,
  classes: LineClass[],
): [number[], number[]] | null {
  // other size rows' lines, with their nesting rank: where does each line of this row stand among
  // them — the mean rank of the size lines next to it on either side (S between XS and M ≈ 2, L
  // between M and XL ≈ 4); the row's lines fall in two groups when the row holds two sizes
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
  const at: { i: number; v: number; len: number }[] = [];
  for (const i of row.chains) {
    const ch = set.chains[i];
    if (!ch || ch.lengthMm < 10) continue;
    const vs: number[] = [];
    for (const sm of resample(ch.pts, 5)) {
      const best = [Infinity, Infinity];
      const side = [-1, -1];
      grid.near(sm.p, 25, (j, si) => {
        const q = set.chains[j].pts;
        const r = segNearest(sm.p, q[si], q[si + 1]);
        if (r.d > 25 || r.d < 0.05) return;
        const a = q[si];
        const b = q[si + 1];
        const v: PtMm = {
          x: a.x + (b.x - a.x) * r.u - sm.p.x,
          y: a.y + (b.y - a.y) * r.u - sm.p.y,
        };
        // which side of the line's direction the neighbour is on
        const k = sm.t.x * v.y - sm.t.y * v.x > 0 ? 0 : 1;
        if (r.d < best[k]) {
          best[k] = r.d;
          side[k] = rankOf.get(j)!;
        }
      });
      if (side[0] >= 0 && side[1] >= 0) vs.push((side[0] + side[1]) / 2);
    }
    if (vs.length < 2) continue;
    vs.sort((x, y) => x - y);
    at.push({ i, v: vs[vs.length >> 1], len: ch.lengthMm });
  }
  if (at.length < 2) return null;
  // two groups along the rank axis: the cut with the widest gap, both sides ≥ 10 % of the length
  at.sort((x, y) => x.v - y.v);
  const total = at.reduce((t, e) => t + e.len, 0);
  let cut = -1;
  let gap = 0;
  let acc = 0;
  for (let k = 0; k + 1 < at.length; k++) {
    acc += at[k].len;
    const g = at[k + 1].v - at[k].v;
    if (g > gap && acc >= 0.1 * total && total - acc >= 0.1 * total) {
      gap = g;
      cut = k;
    }
  }
  // the two groups stand at least one size apart
  if (cut < 0 || gap < 1) return null;
  const lo = new Set(at.slice(0, cut + 1).map((e) => e.i));
  const hi = new Set(at.slice(cut + 1).map((e) => e.i));
  const L = (ids: Set<number>) => [...ids].reduce((t, i) => t + set.chains[i].lengthMm, 0);
  const [a, b] = L(lo) >= L(hi) ? [lo, hi] : [hi, lo];
  // lines too short to place stay with the larger part
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
