// PATTERN-IMPORT · LEAKS-2 DIAGNOSTIC (probe only) — for every leaking size × piece, WHY the size has
// no line of its own where it should run. The place it should run = the grade of the family
// (GRADE P2's `gradeHint.pred`, else the pair prediction from the two nearest closed sizes). Along
// that prediction (1 mm samples) each sample is covered (own line / common line within the corridor)
// or missing; a missing sample is classified by what the drawing has there:
//   other-rank-conv   another size's line, the sizes converge here (step < 0.35 mm) — a shared edge
//                     drawn ONCE with another size's pen
//   other-rank-pen-r  another rank's line drawn with r's own pen (mis-ranked line)
//   other-rank        another size's line at r's place, sizes apart (pred off / crossing)
//   role-<x>          a chain of role ignore/internal/notch/seam/grain/orphan (extracted, set aside)
//   raw-masked-<k>    a source path masked as page furniture by clean (kind k)
//   raw-unchained     a source path, no chain (lost between the IR and the chains)
//   own-off-pred      r's own line within 3 corridors (drawn, the prediction is off)
//   tile-seam / text  nothing drawn, a tile edge / a text box at the sample
//   absent-nbrs       nothing drawn for r; the neighbouring sizes ARE drawn near (designer drew some)
//   absent            nothing drawn near at all
// ARCHIVE_LEAKS2=<dir> (archive-entry.ts) writes rec.leaks2 and, with ARCHIVE_LEAKS2_PNG=N, close-ups
// (left: the PDF page rendered by pdftoppm; right: what the engine sees) of the N longest stretches.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import type {
  BoxMm,
  ChainId,
  ChainSet,
  PieceCandidate,
  PieceFamily,
  PtMm,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';
import { lonePortions, wallModel } from 'lib/pattern-import/pieces/walls';
import { chainLook, onPen, rankLooks } from 'lib/pattern-import/pieces/identity';
import { outlineOf, predictPair } from 'lib/pattern-import/pieces/gfit/checks';
import { gradeAnchor } from 'lib/pattern-import/pieces/gfit/repair-hook';

import { PALETTE, renderPng, type Stroke } from './sizes-render';

const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
function segD(p: PtMm, a: PtMm, b: PtMm) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1e-12;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
}

/** Segment grid: nearest polyline (by key) within r of a point. */
class SegIndex<K> {
  private cell = 4;
  private g = new Map<string, { k: K; a: PtMm; b: PtMm }[]>();
  add(k: K, pts: readonly PtMm[], closed = false) {
    const n = pts.length;
    for (let i = 0; i + 1 < n + (closed ? 1 : 0); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      // the cells the segment passes through (a long straight edge is one segment)
      const L = dist(a, b);
      const m = Math.max(1, Math.ceil(L / (this.cell / 2)));
      const seen = new Set<string>();
      for (let j = 0; j <= m; j++) {
        const x = Math.floor((a.x + ((b.x - a.x) * j) / m) / this.cell);
        const y = Math.floor((a.y + ((b.y - a.y) * j) / m) / this.cell);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            const key = `${x + dx},${y + dy}`;
            if (seen.has(key)) continue;
            seen.add(key);
            let l = this.g.get(key);
            if (!l) this.g.set(key, (l = []));
            l.push({ k, a, b });
          }
      }
    }
  }
  /** Every key within r, with its distance (min over its segments). */
  near(p: PtMm, r: number): Map<K, number> {
    const out = new Map<K, number>();
    const x0 = Math.floor((p.x - r) / this.cell);
    const x1 = Math.floor((p.x + r) / this.cell);
    const y0 = Math.floor((p.y - r) / this.cell);
    const y1 = Math.floor((p.y + r) / this.cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (const s of this.g.get(`${x},${y}`) ?? []) {
          const d = segD(p, s.a, s.b);
          if (d <= r && d < (out.get(s.k) ?? Infinity)) out.set(s.k, d);
        }
    return out;
  }
}

function ringD(p: PtMm, ring: readonly PtMm[]) {
  let m = Infinity;
  for (let j = 0; j < ring.length; j++)
    m = Math.min(m, segD(p, ring[j], ring[(j + 1) % ring.length]));
  return m;
}

function resample(ring: readonly PtMm[], step = 1): PtMm[] {
  const out: PtMm[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const k = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let j = 0; j < k; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  return out;
}

export type L2Stretch = {
  lenMm: number;
  mid: PtMm;
  cls: string;
  /** composition of the stretch by sample class, mm */
  mix: Record<string, number>;
  /** what lies there: tags of the chains / paths met */
  what: string[];
  /** the local size step (mm per size) at the middle */
  stepMm: number;
  png?: string;
  /** picked stretches: the source paths within 1.5 mm of the middle, and what chain holds them */
  raw?: string[];
};

export type L2Row = {
  seed: number;
  name: string;
  rank: number;
  label: string;
  pred: 'hint' | 'hint-x' | 'pair' | 'pair-x' | 'none';
  from?: [number, number];
  /** how the two sizes the prediction stands on closed (rankFrom, * = grade anchor) */
  fromHow?: string[];
  refusals?: string[];
  predLenMm: number;
  missMm: number;
  /** class → missing mm (whole leak) */
  mix: Record<string, number>;
  cls: string;
  stretches: L2Stretch[];
};

export type L2Fam = {
  seed: number;
  name: string;
  n: number;
  closed: number;
  leaks: number[];
  /** non-leak, non-closed outcomes (tiny/merged/refused…) */
  other: number;
  /** the leaks' classes: union of dominant classes */
  classes: string[];
  /** class → missing mm over the family */
  mix: Record<string, number>;
};

type Ctx = {
  sheet: Sheet | null;
  wallSet: ChainSet | null;
  chains: ChainSet | null;
  families: PieceFamily[] | null;
  run: SizeRun | null;
};

const MICRO = 2; // a missing stretch this short (mm) is a junction/crossing, not a missing line

export function leaks2Diag(
  rel: string,
  S: Ctx,
  names: Map<number, string>,
  png: { dir: string; max: number; pdf: string | null; pick?: Set<string> } | null,
): { rows: L2Row[]; fams: L2Fam[]; ms: number; classes?: string[] } {
  const t0 = Date.now();
  const set = S.wallSet ?? S.chains;
  const sheet = S.sheet;
  const run = S.run;
  if (!set || !sheet || !run || !S.families) return { rows: [], fams: [], ms: 0 };
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const model = wallModel(set, run, sheet.texts, styles);
  const rankOf = new Map<ChainId, number>();
  model.byRank.forEach((ids, r) => ids.forEach((id) => rankOf.set(id, r)));
  const roleOf = new Map<ChainId, string>();
  for (const c of set.classes) for (const id of c.chains) roleOf.set(id, c.role);
  for (const id of set.orphans) if (!roleOf.has(id)) roleOf.set(id, 'orphan');
  const classOf = new Map<ChainId, number>();
  for (const c of set.classes) for (const id of c.chains) classOf.set(id, c.id);
  // the evidence a set-aside row stands on (face-stray why, face-graded, grid…)
  const evOf = new Map<ChainId, string>();
  for (const c of set.classes) {
    if (c.role === 'size' || c.role === 'common') continue;
    for (const e of c.evidence) {
      if (e.kind === 'face-stray') {
        for (const b of e.byWhy ?? [])
          for (const id of b.chains) evOf.set(id, `:stray ${b.why.slice(0, 24)}`);
        for (const id of c.chains) if (!evOf.has(id)) evOf.set(id, `:stray ${e.why.slice(0, 24)}`);
        continue;
      }
      const tag = e.kind === 'layer' ? `:layer ${e.meaning}` : `:${e.kind}`;
      for (const id of c.chains) if (!evOf.has(id)) evOf.set(id, tag);
    }
  }
  const common = new Set(model.common);
  const lone = lonePortions(set, model);
  const { looks } = rankLooks(set, run, styles);
  // indices
  type WK = { kind: 'own'; r: number } | { kind: 'common' };
  const wallIdx = new SegIndex<string>(); // key: "r<k>" | "common"
  model.byRank.forEach((ids, r) =>
    ids.forEach((id) => {
      const c = set.chains[id];
      if (c && c.pts.length >= 2) wallIdx.add(`r${r}`, c.pts, c.closed);
    }),
  );
  for (const k of model.corners ?? []) wallIdx.add(`r${k.rank}`, k.pts);
  for (const id of model.common) {
    const c = set.chains[id];
    if (c && c.pts.length >= 2) wallIdx.add('common', c.pts, c.closed);
  }
  for (const it of lone) wallIdx.add('common', it.pts);
  void (null as unknown as WK);
  const chainIdx = new SegIndex<ChainId>();
  for (const c of set.chains) if (c.pts.length >= 2) chainIdx.add(c.id, c.pts, c.closed);
  const pathIdx = new SegIndex<number>();
  sheet.paths.forEach((p, k) => {
    if (p.pts.length >= 2) pathIdx.add(k, p.pts, p.closed);
  });
  // the source paths some chain is made of (a path no chain references: never extracted, or
  // taken as another line's decoration)
  const refd = new Set<number>();
  for (const c of set.chains) for (const g of c.ranges) refd.add(g.path);
  const edges: [PtMm, PtMm][] = [];
  for (const p of sheet.poses) {
    const t = p.toSheet;
    const P = (x: number, y: number) => ({
      x: t.a * x + t.c * y + t.e,
      y: t.b * x + t.d * y + t.f,
    });
    const q = [P(0, 0), P(p.widthMm, 0), P(p.widthMm, p.heightMm), P(0, p.heightMm)];
    for (let i = 0; i < 4; i++) edges.push([q[i], q[(i + 1) % 4]]);
  }
  const nearTileEdge = (p: PtMm, tol: number) => edges.some(([a, b]) => segD(p, a, b) <= tol);
  const textAt = (p: PtMm, m: number) =>
    sheet.texts.some(
      (t) =>
        t.text.trim() &&
        p.x >= t.bbox.minX - m &&
        p.x <= t.bbox.maxX + m &&
        p.y >= t.bbox.minY - m &&
        p.y <= t.bbox.maxY + m,
    );
  const tagOf = (id: ChainId) => {
    const r = rankOf.get(id);
    if (r != null) return `r${r}`;
    if (common.has(id)) return 'common';
    return roleOf.get(id) ?? 'none';
  };
  const rows: L2Row[] = [];
  const fams: L2Fam[] = [];
  const pngJobs: { row: L2Row; st: L2Stretch; f: PieceFamily; c: PieceCandidate; pred: PtMm[] }[] =
    [];
  for (const f of S.families) {
    const closed = f.candidates.filter((c) => c.outcome === 'closed');
    const leaks = f.candidates.filter((c) => c.outcome === 'leak');
    const fam: L2Fam = {
      seed: f.seed,
      name: names.get(f.seed) ?? '',
      n: f.candidates.length,
      closed: closed.length,
      leaks: leaks.map((c) => c.rank),
      other: f.candidates.length - closed.length - leaks.length,
      classes: [],
      mix: {},
    };
    fams.push(fam);
    for (const c of leaks) {
      const r = c.rank;
      const row: L2Row = {
        seed: f.seed,
        name: fam.name,
        rank: r,
        label: run.sizes[r]?.label ?? '',
        pred: 'none',
        predLenMm: 0,
        missMm: 0,
        mix: {},
        cls: 'no-pred',
        stretches: [],
      };
      rows.push(row);
      let pred: PtMm[] | null = null;
      let from: [number, number] | null = null;
      if (c.gradeHint?.pred?.length) {
        pred = c.gradeHint.pred;
        from = c.gradeHint.from;
        row.pred = c.gradeHint.extrapolated ? 'hint-x' : 'hint';
        row.refusals = c.gradeHint.refusals;
      } else {
        // the two nearest closed sizes (anchors first)
        const pool = closed
          .filter((x) => x.outer.length > 2)
          .sort(
            (a, b) =>
              Number(gradeAnchor(b)) - Number(gradeAnchor(a)) ||
              Math.abs(a.rank - r) - Math.abs(b.rank - r),
          );
        const lo = pool.filter((x) => x.rank < r).sort((a, b) => b.rank - a.rank)[0];
        const hi = pool.filter((x) => x.rank > r).sort((a, b) => a.rank - b.rank)[0];
        let pair =
          lo && hi
            ? [lo, hi]
            : pool.sort((a, b) => Math.abs(a.rank - r) - Math.abs(b.rank - r)).slice(0, 2);
        pair = pair.sort((a, b) => a.rank - b.rank);
        if (pair.length === 2 && pair[0].rank !== pair[1].rank) {
          const [A, B] = pair;
          const oa = outlineOf(A.outer);
          const ob = outlineOf(B.outer);
          const P =
            oa && ob
              ? predictPair(oa, ob, (r - A.rank) / (B.rank - A.rank), B.rank - A.rank)
              : null;
          if (P) {
            pred = P.pts;
            from = [A.rank, B.rank];
            row.pred = r < A.rank || r > B.rank ? 'pair-x' : 'pair';
          }
        }
      }
      if (!pred || !from) {
        // no grade to say where it runs: a picture at the fill's leak mouth (picked rows only)
        if (png?.pick?.has(`${f.seed}:${r}`) && c.leakAt)
          pngJobs.push({
            row,
            st: { lenMm: 0, mid: c.leakAt, cls: 'no-pred', mix: {}, what: [], stepMm: 0 },
            f,
            c,
            pred: [],
          });
        continue;
      }
      row.from = from;
      row.fromHow = from.map((k) => {
        const x = f.candidates.find((y) => y.rank === k);
        return x ? `${x.rankFrom ?? 'class'}${gradeAnchor(x) ? '*' : ''}` : '?';
      });
      const candA = f.candidates.find((x) => x.rank === from![0]);
      const candB = f.candidates.find((x) => x.rank === from![1]);
      const ringA = candA?.outer ?? [];
      const ringB = candB?.outer ?? [];
      const samp = resample(pred, 1);
      row.predLenMm = samp.length;
      const sc: { q: PtMm; cls: string; what: string; step: number }[] = [];
      for (const q of samp) {
        const dA = ringA.length ? ringD(q, ringA) : Infinity;
        const dB = ringB.length ? ringD(q, ringB) : Infinity;
        const sA = Math.abs(r - from[0]) || 1;
        const sB = Math.abs(r - from[1]) || 1;
        const step = Math.min(dA / sA, dB / sB, (dA + dB) / (sA + sB));
        const T = Math.max(0.45, Math.min(1.5, 0.5 * step + 0.2));
        const w = wallIdx.near(q, T);
        if (w.has(`r${r}`)) {
          sc.push({ q, cls: 'own', what: '', step });
          continue;
        }
        if (w.has('common')) {
          sc.push({ q, cls: 'common', what: '', step });
          continue;
        }
        const conv = step < 0.35;
        const ch = [...chainIdx.near(q, T)].sort((a, b) => a[1] - b[1]);
        let cls = '';
        let what = '';
        // the prediction stands on the neighbours: where either runs on ANOTHER size's line (not
        // its own, not common), the place it gives is not trusted here
        const foreign: string[] = [];
        for (const [x, d] of [
          [candA, dA],
          [candB, dB],
        ] as const) {
          if (!x || !(d < 30)) continue;
          const ws = new Set(x.walls);
          let best: [ChainId, number] | null = null;
          for (const [id, dd] of chainIdx.near(q, d + 1))
            if (ws.has(id) && (!best || Math.abs(dd - d) < Math.abs(best[1] - d))) best = [id, dd];
          if (!best) continue;
          const t = tagOf(best[0]);
          if (t.startsWith('r') && t !== `r${x.rank}`) foreign.push(`r${x.rank}on${t}`);
        }
        const ownNear0 = wallIdx.near(q, 3 * T + 1).get(`r${r}`);
        if (ownNear0 == null && foreign.length) {
          sc.push({ q, cls: 'nbr-foreign', what: foreign.join(','), step });
          continue;
        }
        const ownNear = ownNear0;
        const unref =
          ownNear == null
            ? [...pathIdx.near(q, T)]
                .filter(([k]) => !refd.has(sheet.paths[k].id) && !sheet.paths[k].background)
                .sort((a, b) => a[1] - b[1])
            : [];
        if (ownNear != null) {
          cls = 'own-off-pred';
          what = `d${ownNear.toFixed(1)}`;
        } else if (unref.length) {
          const p = sheet.paths[unref[0][0]];
          const st = styles.get(p.style);
          cls = st?.fill ? 'unref-fill' : 'unref-stroke';
          what = `path${p.id} w${(st?.widthMm ?? 0).toFixed(2)}${st?.dash ? ' dash' : ''}${ch.length ? ` among ${[...new Set(ch.map(([id]) => tagOf(id)))].slice(0, 3).join(',')}` : ''}`;
        } else if (ch.length) {
          // the most telling chain: another rank first, then roles
          const ranked = ch.filter(([id]) => rankOf.has(id) && rankOf.get(id) !== r);
          if (ranked.length) {
            const [id] = ranked[0];
            const k = rankOf.get(id)!;
            const l = chainLook(set.chains[id], styles);
            const penR = !!l && !!looks[r]?.length && onPen(l, looks[r]);
            const penK = !!l && !!looks[k]?.length && onPen(l, looks[k]);
            cls = conv ? 'other-rank-conv' : penR && !penK ? 'other-rank-pen-r' : 'other-rank';
            what = `r${k}${penR ? '/penR' : ''}${penK ? '/penK' : ''}/${Math.round(set.chains[id].lengthMm)}`;
          } else {
            const [id] = ch[0];
            const t = tagOf(id);
            cls = t === `r${r}` ? 'own-unwalled' : `role-${t}`;
            const l = chainLook(set.chains[id], styles);
            const penR = !!l && !!looks[r]?.length && onPen(l, looks[r]);
            what = `${t}${penR ? '/penR' : ''}/${Math.round(set.chains[id].lengthMm)}${evOf.get(id) ?? ''}#${classOf.get(id) ?? '-'}`;
          }
        } else {
          const ps = [...pathIdx.near(q, T)].sort((a, b) => a[1] - b[1]);
          if (ps.length) {
            const p = sheet.paths[ps[0][0]];
            const st = styles.get(p.style);
            cls = p.background
              ? `raw-masked-${p.background}`
              : st?.fill
                ? 'raw-fill'
                : 'raw-unchained';
            what = `path${p.id} w${(st?.widthMm ?? 0).toFixed(2)}${st?.dash ? ' dash' : ''}${st?.fill ? ' fill' : ''}${st?.layer ? ` L:${st.layer.slice(0, 12)}` : ''}`;
          } else if (nearTileEdge(q, 3)) cls = 'tile-seam';
          else if (textAt(q, 1)) cls = 'text';
          else {
            // the neighbouring sizes drawn near?
            const reach = Math.max(2, 2.5 * step) + T;
            const nb = [...wallIdx.near(q, reach).keys()].filter((k) => k !== `r${r}`);
            cls = nb.length ? 'absent-nbrs' : 'absent';
            what = nb.slice(0, 4).join(',');
          }
        }
        sc.push({ q, cls, what, step });
      }
      // stretches: contiguous non-covered samples (cyclic)
      const cov = (x: { cls: string }) =>
        x.cls === 'own' || x.cls === 'common' || x.cls === 'own-off-pred';
      const k0 = sc.findIndex(cov);
      if (k0 < 0) {
        // nothing of r at all along the prediction
      }
      const start = k0 < 0 ? 0 : k0;
      let cur: typeof sc = [];
      const flush = () => {
        if (!cur.length) return;
        const mix: Record<string, number> = {};
        for (const x of cur) mix[x.cls] = (mix[x.cls] ?? 0) + 1;
        const top = Object.entries(mix).sort((a, b) => b[1] - a[1])[0][0];
        const what = [...new Set(cur.map((x) => x.what).filter(Boolean))].slice(0, 8);
        const m = cur[cur.length >> 1];
        row.stretches.push({
          lenMm: cur.length,
          mid: { x: +m.q.x.toFixed(1), y: +m.q.y.toFixed(1) },
          cls: cur.length <= MICRO ? 'micro' : top,
          mix,
          what,
          stepMm: +m.step.toFixed(2),
        });
        cur = [];
      };
      for (let j = 0; j < sc.length; j++) {
        const x = sc[(start + j) % sc.length];
        if (cov(x)) flush();
        else cur.push(x);
      }
      flush();
      for (const st of row.stretches) {
        if (st.cls === 'micro') {
          row.mix.micro = (row.mix.micro ?? 0) + st.lenMm;
          continue;
        }
        for (const [k, v] of Object.entries(st.mix)) row.mix[k] = (row.mix[k] ?? 0) + v;
      }
      row.missMm = Object.entries(row.mix)
        .filter(([k]) => k !== 'micro')
        .reduce((a, [, v]) => a + v, 0);
      row.cls =
        row.missMm < 1
          ? 'covered'
          : Object.entries(row.mix)
              .filter(([k]) => k !== 'micro')
              .sort((a, b) => b[1] - a[1])[0][0];
      for (const [k, v] of Object.entries(row.mix)) fam.mix[k] = (fam.mix[k] ?? 0) + v;
      if (!fam.classes.includes(row.cls)) fam.classes.push(row.cls);
      if (png && (!png.pick || png.pick.has(`${f.seed}:${r}`)))
        for (const st of row.stretches
          .filter((s) => s.cls !== 'micro' && s.lenMm >= 3)
          .sort((a, b) => b.lenMm - a.lenMm)
          .slice(0, png.pick ? 2 : 99))
          pngJobs.push({ row, st, f, c, pred });
    }
    if (leaks.some((c) => !rows.find((x) => x.seed === f.seed && x.rank === c.rank)?.from))
      if (!fam.classes.includes('no-pred')) fam.classes.push('no-pred');
  }
  if (png && pngJobs.length) {
    // the longest stretch of each family first, then the rest
    const seen = new Set<number>();
    const ordered = pngJobs
      .sort((a, b) => b.st.lenMm - a.st.lenMm)
      .sort((a, b) => Number(seen.has(a.f.seed)) - Number(seen.has(b.f.seed)));
    const pick: typeof pngJobs = [];
    for (const j of ordered) {
      if (pick.length >= png.max) break;
      if (
        seen.has(j.f.seed) &&
        pick.length < Math.min(png.max, new Set(ordered.map((o) => o.f.seed)).size)
      )
        continue;
      seen.add(j.f.seed);
      pick.push(j);
    }
    const chainOfPath = new Map<number, number[]>();
    for (const c of set.chains)
      for (const g of c.ranges) {
        const a = chainOfPath.get(g.path);
        if (a) {
          if (!a.includes(c.id)) a.push(c.id);
        } else chainOfPath.set(g.path, [c.id]);
      }
    for (const j of pick) {
      j.st.raw = [...pathIdx.near(j.st.mid, 1.5)]
        .sort((a, b) => a[1] - b[1])
        .slice(0, 16)
        .map(([k, d]) => {
          const p = sheet.paths[k];
          const st = sheet.styles.find((x) => x.id === p.style);
          let L = 0;
          for (let i = 1; i < p.pts.length; i++) L += dist(p.pts[i - 1], p.pts[i]);
          const ch = chainOfPath.get(p.id) ?? [];
          return `p${p.id} d${d.toFixed(2)} n${p.pts.length} L${L.toFixed(1)}${p.closed ? ' closed' : ''} w${(st?.widthMm ?? 0).toFixed(2)}${st?.fill ? ' FILL' : ''}${st?.dash ? ` dash[${st.dash.map((v) => v.toFixed(2)).join(',')}]` : ''} rgb${(st?.strokeRgb ?? []).join(',')}${st?.layer ? ` L:${st.layer}` : ''}${p.background ? ` BG:${p.background}` : ''} -> ${ch.length ? ch.map((id) => `c${id}:${tagOf(id)}`).join(',') : 'NO CHAIN'}`;
        });
    }
    for (const j of pick)
      try {
        j.st.png = closeUp(rel, j, set, sheet, styles, rankOf, common, roleOf, run, png);
      } catch (e) {
        j.st.png = `ERR ${String(e).slice(0, 120)}`;
      }
  }
  // the line classes (role, size, evidence kinds, chains, length) — what a set-aside line stands on
  const classes = set.classes.map(
    (c) =>
      `${c.id}:${c.role}${c.sizeLabel ? `=${c.sizeLabel}` : ''} n${c.chains.length} L${Math.round(c.totalLengthMm)} conf${c.confidence.toFixed(2)} [${c.evidence.map((e) => e.kind + ('why' in e && e.why ? `(${String(e.why).slice(0, 30)})` : '')).join(',')}] sig ${(c.sig ?? '').slice(0, 40)}`,
  );
  return { rows, fams, ms: Date.now() - t0, classes };
}

/** Left: the PDF page under the stretch (pdftoppm); right: the engine's view. */
function closeUp(
  rel: string,
  j: { row: L2Row; st: L2Stretch; f: PieceFamily; c: PieceCandidate; pred: PtMm[] },
  set: ChainSet,
  sheet: Sheet,
  styles: Map<number, { fill: boolean; widthMm: number }>,
  rankOf: Map<ChainId, number>,
  common: Set<ChainId>,
  roleOf: Map<ChainId, string>,
  run: SizeRun,
  png: { dir: string; max: number; pdf: string | null; pick?: Set<string> },
): string {
  mkdirSync(png.dir, { recursive: true });
  const { row, st, f, pred } = j;
  const h = Math.max(14, Math.min(60, st.lenMm * 0.7 + 8));
  const m0 = st.mid;
  const bb: BoxMm = { minX: m0.x - h, minY: m0.y - h, maxX: m0.x + h, maxY: m0.y + h };
  const inB = (pts: readonly PtMm[]) =>
    pts.some((q) => q.x >= bb.minX && q.x <= bb.maxX && q.y >= bb.minY && q.y <= bb.maxY);
  const rs: Stroke[] = [];
  for (const p of sheet.paths) {
    if (p.pts.length < 2 || !inB(p.pts)) continue;
    const s = styles.get(p.style);
    rs.push({
      pts: p.pts as PtMm[],
      closed: p.closed,
      color: p.background ? '#d0d0ff' : s?.fill ? '#000' : '#9a9a9a',
      width: s?.fill ? 2 : 1.6,
    });
  }
  for (const ch of set.chains) {
    if (ch.pts.length < 2 || !inB(ch.pts)) continue;
    const rk = rankOf.get(ch.id);
    const role = roleOf.get(ch.id);
    rs.push({
      pts: ch.pts,
      closed: ch.closed,
      color:
        rk === row.rank
          ? '#e00000'
          : rk != null
            ? PALETTE[(rk + 3) % PALETTE.length]
            : common.has(ch.id)
              ? '#00b0b0'
              : role === 'ignore'
                ? '#3050ff'
                : '#ff00ff',
      width: rk === row.rank ? 1.4 : 0.9,
      dash: rk === row.rank ? undefined : '3 2',
    });
  }
  const labels: { at: PtMm; text: string; color: string; size?: number }[] = [];
  {
    // one tag per chain in the box, at its vertex nearest the middle
    const tags: { at: PtMm; text: string; color: string }[] = [];
    for (const ch of set.chains) {
      if (ch.pts.length < 2 || !inB(ch.pts) || ch.lengthMm < 4) continue;
      let best = ch.pts[0];
      for (const q of ch.pts) if (dist(q, m0) < dist(best, m0)) best = q;
      const rk = rankOf.get(ch.id);
      const text =
        rk != null
          ? `r${rk}`
          : common.has(ch.id)
            ? 'cmn'
            : (roleOf.get(ch.id) ?? 'none').slice(0, 5);
      if (tags.some((t) => t.text === text && dist(t.at, best) < h / 4)) continue;
      tags.push({ at: best, text, color: rk === row.rank ? '#e00000' : '#333' });
    }
    labels.push(...tags.slice(0, 30).map((t) => ({ ...t, size: 11 })));
  }
  for (const x of f.candidates)
    if (
      x.outcome === 'closed' &&
      x.outer.length > 2 &&
      (x.rank === row.from?.[0] || x.rank === row.from?.[1])
    )
      rs.push({ pts: x.outer, closed: true, color: '#ff9900', width: 0.8, dash: '1 2' });
  if (pred.length) rs.push({ pts: pred, closed: true, color: '#00a000', width: 1.1, dash: '5 3' });
  const name = `${rel.replace(/[^\w.-]+/g, '_').slice(0, 44)}__s${row.seed}_r${row.rank}_${st.cls}_${Math.round(st.lenMm)}mm`;
  const right = `${png.dir}/${name}.eng.png`;
  const scale = Math.min(14, 700 / (2 * h));
  const lbl = (k: number) => run.sizes[k]?.label ?? String(k);
  renderPng(right, bb, rs, labels, scale, [
    {
      color: '#000',
      text: `${row.name.slice(0, 22)} size ${row.label} (r${row.rank}) ${st.cls} ${st.lenMm}mm step ${st.stepMm}`,
    },
    {
      color: '#e00000',
      text: `red = r${row.rank} own; green dashed = where it should run (${row.pred} ${row.from?.map(lbl).join('+')})`,
    },
    {
      color: '#9a9a9a',
      text: `grey = source paths; colours dashed = other sizes; cyan common; blue ignore; magenta other roles`,
    },
    {
      color: '#ff9900',
      text: `orange = closed neighbours ${row.from?.map(lbl).join('/')}; ${st.what.slice(0, 3).join(' ')}`.slice(
        0,
        110,
      ),
    },
  ]);
  // the PDF underneath: the pose holding the middle
  let left: string | null = null;
  if (png.pdf && existsSync(png.pdf)) {
    for (const p of sheet.poses) {
      const t = p.toSheet;
      const det = t.a * t.d - t.b * t.c;
      if (!det) continue;
      const inv = (q: PtMm) => {
        const x = q.x - t.e;
        const y = q.y - t.f;
        return { x: (t.d * x - t.c * y) / det, y: (-t.b * x + t.a * y) / det };
      };
      const pm = inv(m0);
      if (pm.x < 0 || pm.y < 0 || pm.x > p.widthMm || pm.y > p.heightMm) continue;
      const corners = [
        inv({ x: bb.minX, y: bb.minY }),
        inv({ x: bb.maxX, y: bb.minY }),
        inv({ x: bb.maxX, y: bb.maxY }),
        inv({ x: bb.minX, y: bb.maxY }),
      ];
      const x0 = Math.max(0, Math.min(...corners.map((c) => c.x)));
      const x1 = Math.min(p.widthMm, Math.max(...corners.map((c) => c.x)));
      const y0 = Math.max(0, Math.min(...corners.map((c) => c.y)));
      const y1 = Math.min(p.heightMm, Math.max(...corners.map((c) => c.y)));
      const dpi = Math.round(scale * 25.4);
      const k = dpi / 25.4;
      // the scale step may have rescaled the page (IR mm = drawn mm × f): render at dpi × f
      let f = 1;
      try {
        const info = execFileSync('pdfinfo', [
          '-f',
          String(p.page + 1),
          '-l',
          String(p.page + 1),
          '-box',
          png.pdf,
        ]).toString();
        const m = info.match(/CropBox:\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
        if (m) f = p.widthMm / (((+m[3] - +m[1]) * 25.4) / 72);
      } catch {
        /* keep 1 */
      }
      const out = `${png.dir}/${name}.pdf`;
      execFileSync('pdftoppm', [
        '-png',
        '-singlefile',
        '-cropbox',
        '-r',
        String(Math.round(dpi * f * 100) / 100),
        '-f',
        String(p.page + 1),
        '-l',
        String(p.page + 1),
        '-x',
        String(Math.floor(x0 * k)),
        '-y',
        String(Math.floor((p.heightMm - y1) * k)),
        '-W',
        String(Math.ceil((x1 - x0) * k)),
        '-H',
        String(Math.ceil((y1 - y0) * k)),
        png.pdf,
        out,
      ]);
      left = `${out}.png`;
      // the pred over the page crop (page frame), so the two panels can be compared
      const rot = Math.round((Math.atan2(t.b, t.a) * 180) / Math.PI);
      const tag = `p${p.page + 1} rot${rot} scale ${f.toFixed(3)} (pdf page, pred overlaid in green)`;
      const predPage = pred
        .map(inv)
        .map((q) => `${((q.x - x0) * k).toFixed(1)},${((y1 - q.y) * k).toFixed(1)}`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil((x1 - x0) * k)}" height="${Math.ceil((y1 - y0) * k)}"><image width="${Math.ceil((x1 - x0) * k)}" height="${Math.ceil((y1 - y0) * k)}" xlink:href="data:image/png;base64,${readFileSync(left).toString('base64')}"/>${predPage.length ? `<polyline points="${predPage.join(' ')} ${predPage[0]}" fill="none" stroke="#00a000" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="6 4"/>` : ''}<text x="6" y="16" font-size="13" font-family="monospace" fill="#000" stroke="white" stroke-width="3" paint-order="stroke">${tag}</text></svg>`;
      const svgF = `${out}.svg`;
      writeFileSync(svgF, svg);
      execFileSync('rsvg-convert', ['-o', `${out}.ov.png`, svgF]);
      left = `${out}.ov.png`;
      break;
    }
  }
  // the overview: the whole piece — r's own lines red, the prediction green, the closed sizes
  // thin, the close-up's box black
  const ov = `${png.dir}/${name}.ovw.png`;
  {
    let b: BoxMm = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const around = pred.length
      ? pred
      : [
          { x: m0.x - 250, y: m0.y - 250 },
          { x: m0.x + 250, y: m0.y + 250 },
        ];
    for (const q of around)
      b = {
        minX: Math.min(b.minX, q.x),
        minY: Math.min(b.minY, q.y),
        maxX: Math.max(b.maxX, q.x),
        maxY: Math.max(b.maxY, q.y),
      };
    b = { minX: b.minX - 20, minY: b.minY - 20, maxX: b.maxX + 20, maxY: b.maxY + 20 };
    const inO = (pts: readonly PtMm[]) =>
      pts.some((q) => q.x >= b.minX && q.x <= b.maxX && q.y >= b.minY && q.y <= b.maxY);
    const os: Stroke[] = [];
    for (const ch of set.chains) {
      if (ch.pts.length < 2 || !inO(ch.pts)) continue;
      const rk = rankOf.get(ch.id);
      if (rk === row.rank) continue;
      os.push({ pts: ch.pts, closed: ch.closed, color: '#cfcfcf', width: 0.7 });
    }
    for (const x of f.candidates)
      if (x.outcome === 'closed' && x.outer.length > 2)
        os.push({
          pts: x.outer,
          closed: true,
          color: PALETTE[(x.rank + 3) % PALETTE.length],
          width: 0.7,
        });
    for (const ch of set.chains)
      if (rankOf.get(ch.id) === row.rank && ch.pts.length >= 2 && inO(ch.pts))
        os.push({ pts: ch.pts, closed: ch.closed, color: '#e00000', width: 2 });
    if (pred.length)
      os.push({ pts: pred, closed: true, color: '#00a000', width: 1.2, dash: '6 4' });
    os.push({
      pts: [
        { x: bb.minX, y: bb.minY },
        { x: bb.maxX, y: bb.minY },
        { x: bb.maxX, y: bb.maxY },
        { x: bb.minX, y: bb.maxY },
      ],
      closed: true,
      color: '#000',
      width: 2,
    });
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    renderPng(ov, b, os, [], 700 / span, [
      {
        color: '#e00000',
        text: `overview: r${row.rank} own lines (red), pred green, closed sizes thin`,
      },
    ]);
  }
  const final = `${png.dir}/${name}.png`;
  execFileSync('magick', [
    ...(left ? [left] : []),
    right,
    ov,
    '-background',
    'white',
    '-gravity',
    'north',
    '+append',
    final,
  ]);
  return final;
}

/**
 * A whole family for a by-eye judgement (ARCHIVE_FAMPNG): the source paths (grey; masked by clean
 * = lavender), every closed size's outline in its colour over them. Returns the PNG paths.
 */
export function famRender(
  rel: string,
  S: Ctx,
  seeds: Set<number>,
  dir: string,
  tag: string,
): string[] {
  const sheet = S.sheet;
  const run = S.run;
  if (!sheet || !run || !S.families) return [];
  mkdirSync(dir, { recursive: true });
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const out: string[] = [];
  for (const f of S.families) {
    if (!seeds.has(f.seed)) continue;
    let b: BoxMm = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const c of f.candidates)
      for (const q of c.outer ?? [])
        b = {
          minX: Math.min(b.minX, q.x),
          minY: Math.min(b.minY, q.y),
          maxX: Math.max(b.maxX, q.x),
          maxY: Math.max(b.maxY, q.y),
        };
    if (!Number.isFinite(b.minX)) continue;
    b = { minX: b.minX - 15, minY: b.minY - 15, maxX: b.maxX + 15, maxY: b.maxY + 15 };
    const inB = (pts: readonly PtMm[]) =>
      pts.some((q) => q.x >= b.minX && q.x <= b.maxX && q.y >= b.minY && q.y <= b.maxY);
    const rs: Stroke[] = [];
    const masked: Record<string, number> = {};
    for (const p of sheet.paths) {
      if (p.pts.length < 2 || !inB(p.pts)) continue;
      const s = styles.get(p.style);
      if (p.background) {
        const k = `${String(p.background)}/${(s?.strokeRgb ?? []).join(',')}${s?.fill ? 'f' : ''}`;
        masked[k] = (masked[k] ?? 0) + 1;
      }
      rs.push({
        pts: p.pts as PtMm[],
        closed: p.closed,
        color: p.background ? '#b9a6ff' : s?.fill ? '#555' : '#a8a8a8',
        width: p.background ? 1.6 : 0.8,
      });
    }
    const counts: Record<string, number> = {};
    for (const c of f.candidates) counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
    for (const c of f.candidates)
      if (c.outcome === 'closed' && c.outer.length > 2)
        rs.push({
          pts: c.outer,
          closed: true,
          color: PALETTE[(c.rank + 3) % PALETTE.length],
          width: 1.1,
        });
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    const name = `${dir}/${rel.replace(/[^\w.-]+/g, '_').slice(0, 50)}__s${f.seed}_${tag}.png`;
    const lbl = (k: number) => run.sizes[k]?.label ?? String(k);
    const notClosed = f.candidates.filter((c) => c.outcome !== 'closed');
    renderPng(name, b, rs, [], Math.min(6, 1100 / span), [
      { color: '#000', text: `${tag}: seed ${f.seed} ${JSON.stringify(counts)}` },
      {
        color: '#000',
        text: `not closed: ${notClosed.map((c) => `${lbl(c.rank)}:${c.outcome}`).join(' ') || 'none'}`.slice(
          0,
          120,
        ),
      },
      {
        color: '#7a5cff',
        text: 'grey = source paths, lavender = masked by clean, colours = closed sizes',
      },
      { color: '#7a5cff', text: `masked here: ${JSON.stringify(masked)}`.slice(0, 140) },
    ]);
    out.push(name);
  }
  return out;
}
