// PATTERN-IMPORT · LEAK DIAGNOSTIC (probe only) — for every leaking size × piece of a run, where the
// outside got in (the fill's leak mouth) and what the drawing does there: the size's own line ends
// (a gap between two of its ends — at a corner or along a line), its end running onto another line
// (common, another size, an ignored stub), or no line of its own near the mouth at all. Each leak
// gets one class; ARCHIVE_LEAKS=<dir> writes a close-up PNG of each (archive-entry.ts).
import type {
  Chain,
  ChainId,
  ChainSet,
  IRText,
  PieceFamily,
  PtMm,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';
import { lonePortions, wallModel } from 'lib/pattern-import/pieces/walls';
import { chainLook, describeLook, onPen, rankLooks } from 'lib/pattern-import/pieces/identity';
import { segNearest } from 'lib/pattern-import/pieces/geom';
import { furniture } from 'lib/pattern-import/chains/classify';

import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';

type End = { chain: ChainId; end: 0 | 1; at: PtMm; dir: PtMm };

const sub = (a: PtMm, b: PtMm) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: PtMm) => Math.hypot(v.x, v.y);
const norm = (v: PtMm) => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
/** Vertices every ≤ 3 mm (the renderer skips a stroke with no vertex in its box). */
function dense(pts: PtMm[], closed = false): PtMm[] {
  const out: PtMm[] = [];
  const n = pts.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const k = Math.max(1, Math.ceil(dist(a, b) / 3));
    for (let j = 0; j < k; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed && n) out.push(pts[n - 1]);
  return out;
}

/** Outward tangent at an end (from ~2 mm inside towards the end). */
function endDir(pts: PtMm[], end: 0 | 1): PtMm {
  const n = pts.length;
  const p = end === 0 ? pts[0] : pts[n - 1];
  let acc = 0;
  let q = p;
  for (let i = 1; i < n; i++) {
    const k = end === 0 ? i : n - 1 - i;
    acc += dist(pts[k], q);
    q = pts[k];
    if (acc >= 2) break;
  }
  return norm(sub(p, q));
}

function nearChain(p: PtMm, c: Chain): number {
  let best = Infinity;
  for (let i = 0; i + 1 < c.pts.length; i++)
    best = Math.min(best, segNearest(p, c.pts[i], c.pts[i + 1]).d);
  if (c.closed && c.pts.length > 2)
    best = Math.min(best, segNearest(p, c.pts[c.pts.length - 1], c.pts[0]).d);
  return best;
}

/** A raw close-up: every source path (black; filled thick), chains coloured by tag (dashed). */
function rawCrop(
  file: string,
  m0: PtMm,
  h: number,
  label: string,
  sheet: Sheet,
  set: ChainSet,
  styles: Map<number, { fill: boolean; widthMm: number }>,
  colorOf: (id: ChainId) => string,
  extra: Stroke[],
  tagOfX: (id: ChainId) => string = () => '',
) {
  const labels: Label[] = [];
  const bb = { minX: m0.x - h, minY: m0.y - h, maxX: m0.x + h, maxY: m0.y + h };
  const inB = (pts: PtMm[]) =>
    pts.some((q) => q.x >= bb.minX && q.x <= bb.maxX && q.y >= bb.minY && q.y <= bb.maxY);
  const rs: Stroke[] = [];
  const own: Stroke[] = [];
  for (const pth of sheet.paths) {
    if (pth.pts.length < 2) continue;
    const dp = dense(pth.pts, pth.closed);
    if (!inB(dp)) continue;
    const st = styles.get(pth.style);
    rs.push({
      pts: dp,
      closed: pth.closed,
      color: st?.fill ? '#000000' : '#555555',
      width: st?.fill ? 2.5 : Math.max(0.6, (st?.widthMm ?? 0.2) * 10),
    });
  }
  for (const ch of set.chains) {
    if (ch.pts.length < 2) continue;
    const dc = dense(ch.pts, ch.closed);
    if (!inB(dc)) continue;
    const col = colorOf(ch.id);
    if (col !== '#e00000' && ch.lengthMm >= 8) {
      const q = dc.find(
        (v) => v.x >= bb.minX && v.x <= bb.maxX && v.y >= bb.minY && v.y <= bb.maxY,
      );
      if (q) labels.push({ at: q, text: tagOfX(ch.id), color: col, size: 11 });
    }
    (col === '#e00000' ? own : rs).push(
      col === '#e00000'
        ? { pts: dc, closed: ch.closed, color: col, width: 2 }
        : { pts: dc, closed: ch.closed, color: col, width: 1.2, dash: '3 2' },
    );
  }
  rs.push(...extra, ...own);
  renderPng(
    file,
    bb,
    rs,
    [
      { at: { x: bb.minX + 0.5, y: bb.maxY - 1.5 }, text: label, color: '#000', size: 13 },
      ...labels,
    ],
    Math.min(22, 800 / (2 * h)),
  );
}

export type Hole = {
  /** gap between the two dangling ends of r, mm (-1: an end with no partner within 120 mm) */
  gap: number;
  turn: number;
  mid: PtMm;
  /** other ranks with a line within 0.15 / 1 / 3 mm of the hole's middle */
  ov: [number, number, number];
  /** both bracketing ranks (nearest drawn below / above) within 3 mm of both ends */
  bracket: boolean;
  /** pen of the two ends */
  pens: string;
  /** lines in r's own pen touching an end (≤ 3 mm) that are NOT r's: tag/length */
  samePen?: string[];
  /** every line ≥ 8 mm touching an end (≤ 1.5 mm), not r's: tag/length/look */
  touch?: string[];
  /** r's own look */
  rlook?: string;
  cls: string;
};

export type LeakRow = {
  holes?: Hole[];
  seed: number;
  name: string;
  rank: number;
  label: string;
  look: string;
  at: PtMm | null;
  cls: string;
  sub?: string;
  gapMm?: number;
  turnDeg?: number;
  ownEnds: number;
  dOwnMm: number;
  ranksNear: number;
  commonNear: boolean;
  onto?: string;
  stub?: string;
  tileSeam?: boolean;
  text?: string;
  closedRanks: number;
  png?: string;
  /** corner gaps: how far ahead of each own end the two tangents cross (mm) */
  ahead?: [number, number];
  /** corner gaps: short lines touching an own end — tag, length, pen, vertex off the crossing */
  stubs?: string[];
  /**
   * Along the nearest closed size's outline: stretches (≥ 6 mm) with no wall of r (its own lines,
   * its corner walls, common lines) within `gapTol` — length, and what lies on the ref there.
   */
  missing?: { lenMm: number; mid: PtMm; on: string[]; endsOnOne?: string }[];
  /** P1: the continuity closure the family refused (why) */
  contWhy?: string;
  /** the own ends' chains: pen kind and width */
  ownPen?: string;
};

export function leakDiag(
  rel: string,
  S: {
    sheet: Sheet | null;
    wallSet: ChainSet | null;
    chains: ChainSet | null;
    families: PieceFamily[] | null;
    run: SizeRun | null;
    contRefused?: { seed: number; rank: number; why: string }[];
  },
  names: Map<number, string>,
  pngDir: string | null,
  maxPng = 6,
): LeakRow[] {
  const set = S.wallSet ?? S.chains;
  const sheet = S.sheet;
  const run = S.run;
  if (!set || !sheet || !run || !S.families) return [];
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const model = wallModel(set, run, sheet.texts, styles);
  const rankOf = new Map<ChainId, number>();
  model.byRank.forEach((ids, r) => ids.forEach((id) => rankOf.set(id, r)));
  const roleOf = new Map<ChainId, string>();
  for (const c of set.classes) for (const id of c.chains) roleOf.set(id, c.role);
  for (const id of set.orphans) if (!roleOf.has(id)) roleOf.set(id, 'orphan');
  const common = new Set(model.common);
  const lone = lonePortions(set, model);
  const looks = rankLooks(set, run, styles).looks;
  const lookKind = (r: number) => looks[r]?.[0]?.kind ?? (looks[r]?.length ? '?' : 'none');
  // ends index (open chains)
  const ends: End[] = [];
  for (const c of set.chains) {
    if (c.closed || c.pts.length < 2) continue;
    ends.push({ chain: c.id, end: 0, at: c.pts[0], dir: endDir(c.pts, 0) });
    ends.push({ chain: c.id, end: 1, at: c.pts[c.pts.length - 1], dir: endDir(c.pts, 1) });
  }
  // tile edges in sheet frame
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
  const nearTileEdge = (p: PtMm, tol = 3) => edges.some(([a, b]) => segNearest(p, a, b).d <= tol);
  const textAt = (p: PtMm, m = 2) =>
    sheet.texts.find(
      (t: IRText) =>
        p.x >= t.bbox.minX - m &&
        p.x <= t.bbox.maxX + m &&
        p.y >= t.bbox.minY - m &&
        p.y <= t.bbox.maxY + m &&
        t.text.trim(),
    );
  const tagOf = (id: ChainId) => {
    const r = rankOf.get(id);
    if (r != null) return `r${r}`;
    if (common.has(id)) return 'common';
    return roleOf.get(id) ?? 'none';
  };
  const rows: LeakRow[] = [];
  let pngs = 0;
  for (const f of S.families) {
    const closedRanks = f.candidates.filter((c) => c.outcome === 'closed').length;
    for (const c of f.candidates) {
      if (c.outcome !== 'leak') continue;
      const r = c.rank;
      const row: LeakRow = {
        seed: f.seed,
        name: names.get(f.seed) ?? '',
        rank: r,
        label: run.sizes[r]?.label ?? '',
        look: lookKind(r),
        at: c.leakAt ?? null,
        cls: '?',
        ownEnds: 0,
        dOwnMm: Infinity,
        ranksNear: 0,
        commonNear: false,
        closedRanks,
      };
      {
        const ref = f.candidates
          .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
          .sort((a, b) => Math.abs(a.rank - r) - Math.abs(b.rank - r))[0];
        if (ref) {
          const ownW = [
            ...(model.byRank[r] ?? []).map((id) => set.chains[id].pts),
            ...model.common.map((id) => set.chains[id].pts),
            ...(model.corners ?? []).filter((k) => k.rank === r).map((k) => k.pts),
            ...lone.map((it) => it.pts),
          ];
          const tol = 3 + 16 * Math.abs(ref.rank - r);
          const near = (q: PtMm) => {
            for (const pts of ownW) {
              let minX = Infinity,
                maxX = -Infinity,
                minY = Infinity,
                maxY = -Infinity;
              for (const v of pts) {
                if (v.x < minX) minX = v.x;
                if (v.x > maxX) maxX = v.x;
                if (v.y < minY) minY = v.y;
                if (v.y > maxY) maxY = v.y;
              }
              if (q.x < minX - tol || q.x > maxX + tol || q.y < minY - tol || q.y > maxY + tol)
                continue;
              for (let i = 0; i + 1 < pts.length; i++)
                if (segNearest(q, pts[i], pts[i + 1]).d <= tol) return true;
            }
            return false;
          };
          const o = ref.outer;
          const samp: { q: PtMm; ok: boolean }[] = [];
          for (let i = 0; i < o.length; i++) {
            const a = o[i];
            const b = o[(i + 1) % o.length];
            const L = dist(a, b);
            const n = Math.max(1, Math.ceil(L / 2));
            for (let k = 0; k < n; k++) {
              const q = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
              samp.push({ q, ok: near(q) });
            }
          }
          // rotate to start on a covered sample
          const k0 = samp.findIndex((x) => x.ok);
          const runs: PtMm[][] = [];
          if (k0 >= 0) {
            let cur: PtMm[] = [];
            for (let j = 0; j < samp.length; j++) {
              const x = samp[(k0 + j) % samp.length];
              if (!x.ok) cur.push(x.q);
              else if (cur.length) {
                runs.push(cur);
                cur = [];
              }
            }
            if (cur.length) runs.push(cur);
          }
          row.missing = runs
            .filter((x) => x.length >= 3)
            .map((x) => {
              const mid = x[x.length >> 1];
              const on: string[] = [];
              for (const ch of set.chains) {
                if (ch.pts.length < 2 || nearChain(mid, ch) > 1) continue;
                const st = styles.get(ch.style);
                const pen =
                  st?.dash && st.dash.some((v) => v > 0.01)
                    ? 'dash'
                    : ch.motif
                      ? 'motif'
                      : st?.fill
                        ? 'fill'
                        : 'solid';
                on.push(`${tagOf(ch.id)}/${pen}/${Math.round(ch.lengthMm)}`);
              }
              return {
                lenMm: x.length * 2,
                mid: { x: +mid.x.toFixed(1), y: +mid.y.toFixed(1) },
                on: on.slice(0, 14),
              };
            });
        }
      }
      // raw close-up of the longest missing stretch: every source path (black; filled = thick),
      // r's lines red, other ranks coloured, unranked blue, the ref outline orange
      if (pngDir && process.env.ARCHIVE_LEAKS_RAW && row.missing?.length && pngs < maxPng) {
        const ms = row.missing.slice().sort((a, b) => b.lenMm - a.lenMm)[0];
        const m0 = ms.mid;
        const h = 18;
        const bb = { minX: m0.x - h, minY: m0.y - h, maxX: m0.x + h, maxY: m0.y + h };
        const inB = (pts: PtMm[]) =>
          pts.some((q) => q.x >= bb.minX && q.x <= bb.maxX && q.y >= bb.minY && q.y <= bb.maxY);
        const rs: Stroke[] = [];
        for (const pth of sheet.paths) {
          const dp = dense(pth.pts, pth.closed);
          if (pth.pts.length < 2 || !inB(dp)) continue;
          const st = styles.get(pth.style);
          rs.push({
            pts: dp,
            closed: pth.closed,
            color: st?.fill ? '#000000' : '#555555',
            width: st?.fill ? 2.5 : Math.max(0.6, (st?.widthMm ?? 0.2) * 20 * 0.5),
          });
        }
        for (const ch of set.chains) {
          const dc = dense(ch.pts, ch.closed);
          if (ch.pts.length < 2 || !inB(dc)) continue;
          const t = tagOf(ch.id);
          const rk = rankOf.get(ch.id);
          rs.push({
            pts: dc,
            closed: ch.closed,
            color:
              t === `r${r}`
                ? '#e00000'
                : rk != null
                  ? PALETTE[(rk + 3) % PALETTE.length]
                  : t === 'common'
                    ? '#00cccc'
                    : '#1f5fff',
            width: 1,
            dash: '3 2',
          });
        }
        const ref = f.candidates
          .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
          .sort((a, b) => Math.abs(a.rank - r) - Math.abs(b.rank - r))[0];
        if (ref)
          rs.push({
            pts: dense(ref.outer, true),
            closed: true,
            color: '#ff9900',
            width: 1.2,
            dash: '1 3',
          });
        const name = `${rel.replace(/[^\w.-]+/g, '_').slice(0, 40)}__RAW_s${f.seed}_r${r}.png`;
        try {
          renderPng(
            `${pngDir}/${name}`,
            bb,
            rs,
            [
              {
                at: { x: bb.minX + 0.5, y: bb.maxY - 1.5 },
                text: `${row.name.slice(0, 20)} r${r}=${row.label} ${row.look} miss ${ms.lenMm}mm ref r${ref?.rank}`,
                color: '#000',
                size: 13,
              },
            ],
            22,
          );
        } catch {
          /* diagnostic only */
        }
      }
      const cw = S.contRefused?.find((x) => x.seed === f.seed && x.rank === r);
      if (cw) row.contWhy = cw.why.slice(0, 120);
      const p = c.leakAt;
      if (!p) {
        row.cls = 'no-mouth';
        rows.push(row);
        continue;
      }
      const own = model.byRank[r] ?? [];
      let dOwn = Infinity;
      for (const id of own) dOwn = Math.min(dOwn, nearChain(p, set.chains[id]));
      row.dOwnMm = +dOwn.toFixed(1);
      const near = new Set<string>();
      for (const ch of set.chains) {
        if (ch.pts.length < 2) continue;
        const b = ch.pts;
        // cheap bbox reject
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const q of b) {
          if (q.x < minX) minX = q.x;
          if (q.y < minY) minY = q.y;
          if (q.x > maxX) maxX = q.x;
          if (q.y > maxY) maxY = q.y;
        }
        if (p.x < minX - 3 || p.x > maxX + 3 || p.y < minY - 3 || p.y > maxY + 3) continue;
        if (nearChain(p, ch) > 3) continue;
        const t = tagOf(ch.id);
        if (t.startsWith('r') && t !== `r${r}`) near.add(t);
        if (t === 'common') row.commonNear = true;
      }
      row.ranksNear = near.size;
      const ownSet = new Set(own);
      const ownEnds = ends.filter((e) => ownSet.has(e.chain) && dist(e.at, p) <= 10);
      row.ownEnds = ownEnds.length;
      row.tileSeam = nearTileEdge(p);
      const tx = textAt(p);
      if (tx) row.text = tx.text.slice(0, 20);
      // the nearest pair of own ends facing each other
      let best: { a: End; b: End; g: number } | null = null;
      for (let i = 0; i < ownEnds.length; i++)
        for (let j = i + 1; j < ownEnds.length; j++) {
          const a = ownEnds[i];
          const b = ownEnds[j];
          if (a.chain === b.chain && set.chains[a.chain].lengthMm < 5) continue;
          const g = dist(a.at, b.at);
          if (g > 20) continue;
          if (!best || g < best.g) best = { a, b, g };
        }
      // stubs near an own end: short chains not of rank r whose end touches it
      const stubAt = (e: End) => {
        for (const o of ends) {
          if (o.chain === e.chain || ownSet.has(o.chain)) continue;
          const ch = set.chains[o.chain];
          if (ch.lengthMm > 16 || dist(o.at, e.at) > 1.5) continue;
          return `${tagOf(o.chain)}:${ch.lengthMm.toFixed(1)}`;
        }
        return undefined;
      };
      if (best) {
        const turn =
          (Math.acos(
            Math.max(-1, Math.min(1, -(best.a.dir.x * best.b.dir.x + best.a.dir.y * best.b.dir.y))),
          ) *
            180) /
          Math.PI;
        row.gapMm = +best.g.toFixed(1);
        row.turnDeg = Math.round(turn);
        row.stub = stubAt(best.a) ?? stubAt(best.b);
        {
          const A = best.a;
          const B = best.b;
          const den = A.dir.x * B.dir.y - A.dir.y * B.dir.x;
          let X: PtMm | null = null;
          if (Math.abs(den) > 1e-9) {
            const dx = B.at.x - A.at.x;
            const dy = B.at.y - A.at.y;
            const a = (dx * B.dir.y - dy * B.dir.x) / den;
            const b = (dx * A.dir.y - dy * A.dir.x) / den;
            row.ahead = [+a.toFixed(1), +b.toFixed(1)];
            X = { x: A.at.x + a * A.dir.x, y: A.at.y + a * A.dir.y };
          }
          const penOf = (id: ChainId) => {
            const ch = set.chains[id];
            const st = styles.get(ch.style);
            const d =
              st?.dash && st.dash.some((v) => v > 0.01) ? 'dash' : ch.motif ? 'motif' : 'solid';
            return `${d}${st?.fill ? '+fill' : ''} w${(st?.widthMm ?? 0).toFixed(2)} rgb${(st?.strokeRgb ?? []).join(',')}`;
          };
          row.ownPen = `${penOf(A.chain)} | ${penOf(B.chain)}`;
          const seen = new Set<ChainId>();
          row.stubs = [];
          for (const o of ends) {
            if (seen.has(o.chain) || ownSet.has(o.chain)) continue;
            const ch = set.chains[o.chain];
            if (ch.lengthMm > 16) continue;
            const dA = dist(o.at, A.at);
            const dB = dist(o.at, B.at);
            if (Math.min(dA, dB) > 3) continue;
            seen.add(o.chain);
            // the stub's farthest-from-chord point vs the crossing
            let vOff = -1;
            if (X && ch.pts.length >= 2) {
              let bd = Infinity;
              for (const q of ch.pts) bd = Math.min(bd, dist(q, X));
              vOff = +bd.toFixed(2);
            }
            const other = o.end === 0 ? ch.pts[ch.pts.length - 1] : ch.pts[0];
            const both = Math.min(dist(other, A.at), dist(other, B.at)) <= 3;
            row.stubs.push(
              `${tagOf(o.chain)} L${ch.lengthMm.toFixed(1)} n${ch.pts.length} ${penOf(o.chain)} d${Math.min(dA, dB).toFixed(1)} both=${both} vOff=${vOff}`,
            );
          }
        }
        const mid = { x: (best.a.at.x + best.b.at.x) / 2, y: (best.a.at.y + best.b.at.y) / 2 };
        if (turn > 25) row.cls = 'corner-gap';
        else if (nearTileEdge(mid, 4)) row.cls = 'tile-seam-gap';
        else if (textAt(mid, 1)) row.cls = 'text-gap';
        else row.cls = 'line-gap';
        row.sub = best.g <= 3 ? '≤3' : best.g <= 8 ? '3–8' : best.g <= 15 ? '8–15' : '>15';
      } else if (ownEnds.length >= 1) {
        // one own end: what does it run onto?
        const e = ownEnds.sort((a, b) => dist(a.at, p) - dist(b.at, p))[0];
        const ahead = { x: e.at.x + e.dir.x * 4, y: e.at.y + e.dir.y * 4 };
        let onto: string | undefined;
        for (const ch of set.chains) {
          if (ch.id === e.chain || ownSet.has(ch.id) || ch.pts.length < 2) continue;
          if (nearChain(e.at, ch) > 1 || nearChain(ahead, ch) > 1.2) continue;
          onto = tagOf(ch.id);
          if (onto === 'common' || onto.startsWith('r')) break;
        }
        row.onto = onto;
        row.stub = stubAt(e);
        row.cls = onto ? 'end-onto-line' : 'dangling-end';
      } else if (dOwn <= 2) {
        row.cls = 'own-line-passes';
      } else {
        row.cls = row.ranksNear >= 2 || row.commonNear ? 'no-own-line-shared' : 'no-own-line';
      }
      // HOLES: r's dangling ends inside the piece (ref box + 20 mm), paired mutually nearest
      {
        const ref = f.candidates
          .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
          .sort((a, b) => Math.abs(a.rank - r) - Math.abs(b.rank - r))[0];
        const pts0 = ref ? ref.outer : [];
        if (pts0.length) {
          let bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
          for (const q of pts0)
            bb = {
              minX: Math.min(bb.minX, q.x),
              minY: Math.min(bb.minY, q.y),
              maxX: Math.max(bb.maxX, q.x),
              maxY: Math.max(bb.maxY, q.y),
            };
          const M = 20 + 16 * Math.abs(ref!.rank - r);
          const inBB = (q: PtMm) =>
            q.x >= bb.minX - M && q.x <= bb.maxX + M && q.y >= bb.minY - M && q.y <= bb.maxY + M;
          const walls: { id: number; pts: PtMm[] }[] = [
            ...(model.byRank[r] ?? []).map((id) => ({ id, pts: set.chains[id].pts })),
            ...model.common.map((id) => ({ id, pts: set.chains[id].pts })),
            ...(model.corners ?? [])
              .filter((k) => k.rank === r)
              .map((k) => ({ id: -4, pts: k.pts })),
            ...lone.map((it) => ({ id: -5, pts: it.pts })),
          ];
          const touches = (q: PtMm, self: number) => {
            for (const w of walls) {
              if (w.id === self) continue;
              for (let i = 0; i + 1 < w.pts.length; i++)
                if (segNearest(q, w.pts[i], w.pts[i + 1]).d <= 1) return true;
            }
            return false;
          };
          const dang = ends.filter(
            (e) => ownSet.has(e.chain) && inBB(e.at) && !touches(e.at, e.chain),
          );
          // other ranks' lines near a point
          const ranksWithin = (q: PtMm, tol: number) => {
            const out = new Set<number>();
            for (const [id, k] of rankOf) {
              if (k === r) continue;
              const ch = set.chains[id];
              if (nearChain(q, ch) <= tol) out.add(k);
            }
            return out;
          };
          const drawn = (k: number) => (model.byRank[k] ?? []).length > 0;
          let lo = -1;
          for (let k = r - 1; k >= 0; k--)
            if (drawn(k)) {
              lo = k;
              break;
            }
          let hi = -1;
          for (let k = r + 1; k < model.n; k++)
            if (drawn(k)) {
              hi = k;
              break;
            }
          const nearRank = (q: PtMm, k: number, tol: number) =>
            k >= 0 && (model.byRank[k] ?? []).some((id) => nearChain(q, set.chains[id]) <= tol);
          const used = new Set<number>();
          const holes: Hole[] = [];
          const penOfE = (e: End) => {
            const st = styles.get(set.chains[e.chain].style);
            return st?.dash && st.dash.some((v) => v > 0.01)
              ? 'dash'
              : set.chains[e.chain].motif
                ? 'motif'
                : 'solid';
          };
          dang.forEach((a, i) => {
            if (used.has(i)) return;
            let bj = -1;
            let bd = 120;
            dang.forEach((b, j) => {
              if (j === i || used.has(j)) return;
              if (a.chain === b.chain && set.chains[a.chain].lengthMm < 5) return;
              const d = dist(a.at, b.at);
              if (d < bd) {
                bd = d;
                bj = j;
              }
            });
            const b = bj >= 0 ? dang[bj] : null;
            used.add(i);
            if (b) used.add(bj);
            const mid = b ? { x: (a.at.x + b.at.x) / 2, y: (a.at.y + b.at.y) / 2 } : a.at;
            const turn = b
              ? Math.round(
                  (Math.acos(Math.max(-1, Math.min(1, -(a.dir.x * b.dir.x + a.dir.y * b.dir.y)))) *
                    180) /
                    Math.PI,
                )
              : -1;
            const ov: [number, number, number] = [
              ranksWithin(mid, 0.15).size,
              ranksWithin(mid, 1).size,
              ranksWithin(mid, 3).size,
            ];
            const bracket =
              !!b &&
              lo >= 0 &&
              hi >= 0 &&
              [a.at, b.at].every((q) => nearRank(q, lo, 3) && nearRank(q, hi, 3));
            const gap = b ? +bd.toFixed(1) : -1;
            const cls = !b
              ? 'unpaired'
              : gap <= 15
                ? turn > 25
                  ? 'H-corner'
                  : 'H-line'
                : ov[0] >= 3
                  ? 'H-overlay'
                  : ov[1] >= 2
                    ? 'H-bundle'
                    : 'H-long';
            const samePen: string[] = [];
            if (looks[r]?.length)
              for (const ch of set.chains) {
                if (ownSet.has(ch.id) || ch.pts.length < 2 || ch.lengthMm < 3) continue;
                if (Math.min(nearChain(a.at, ch), b ? nearChain(b.at, ch) : Infinity) > 3) continue;
                const l = chainLook(ch, styles);
                if (!l || !onPen(l, looks[r])) continue;
                samePen.push(`${tagOf(ch.id)}:${Math.round(ch.lengthMm)}`);
              }
            const touch: string[] = [];
            for (const ch of set.chains) {
              if (ownSet.has(ch.id) || ch.pts.length < 2 || ch.lengthMm < 5) continue;
              if (Math.min(nearChain(a.at, ch), b ? nearChain(b.at, ch) : Infinity) > 1.5) continue;
              let iw = (set as unknown as { ignoreWhy?: Record<number, string> }).ignoreWhy?.[
                ch.id
              ];
              const jm = iw ? /joined into chain (\d+)/.exec(iw) : null;
              if (jm) iw = `joined→${tagOf(+jm[1])}`;
              touch.push(
                `${tagOf(ch.id)}:${Math.round(ch.lengthMm)}:${describeLook(chainLook(ch, styles))}${iw ? `:${iw}` : ''}`,
              );
            }
            holes.push({
              touch: touch.slice(0, 6),
              rlook: (looks[r] ?? []).map((l) => describeLook(l)).join('+'),
              ...(samePen.length ? { samePen: samePen.slice(0, 6) } : {}),
              gap,
              turn,
              mid: { x: +mid.x.toFixed(1), y: +mid.y.toFixed(1) },
              ov,
              bracket,
              pens: `${penOfE(a)}${b ? `/${penOfE(b)}` : ''}`,
              cls,
            });
          });
          row.holes = holes;
          // ARCHIVE_LEAKS_OPS: the source paths around the first hole by drawing operation
          if (process.env.ARCHIVE_LEAKS_OPS && holes.length && !(row as { ops?: unknown }).ops) {
            const m0 = holes[0].mid;
            const ops = new Map<string, { n: number; fill: number; subs: number[]; c: PtMm }>();
            for (const pth of sheet.paths) {
              const q = pth.pts[0];
              if (!q || Math.abs(q.x - m0.x) > 12 || Math.abs(q.y - m0.y) > 12) continue;
              const k = `${pth.src.file}|${pth.src.page}|${pth.src.op}`;
              const st = styles.get(pth.style);
              const v = ops.get(k) ?? { n: 0, fill: 0, subs: [], c: q };
              v.n++;
              if (st?.fill) v.fill++;
              if (v.subs.length < 4) v.subs.push(pth.src.sub);
              ops.set(k, v);
            }
            (row as { ops?: unknown }).ops = [...ops].map(
              ([k, v]) => `${k} n${v.n} fill${v.fill} subs${v.subs.join(',')}`,
            );
          }
          if (pngDir && process.env.ARCHIVE_LEAKS_HOLES)
            holes
              .filter((x) => x.gap < 0 || x.gap > 3)
              .slice(0, 3)
              .forEach((x, hi2) => {
                if (pngs >= maxPng) return;
                pngs++;
                const colorOf = (id: ChainId) => {
                  const t = tagOf(id);
                  const rk = rankOf.get(id);
                  return t === `r${r}`
                    ? '#e00000'
                    : rk != null
                      ? PALETTE[(rk + 3) % PALETTE.length]
                      : t === 'common'
                        ? '#00cccc'
                        : '#1f5fff';
                };
                const name = `${rel.replace(/[^\w.-]+/g, '_').slice(0, 40)}__HOLE_s${f.seed}_r${r}_${hi2}_${x.cls}.png`;
                try {
                  rawCrop(
                    `${pngDir}/${name}`,
                    x.mid,
                    Math.max(15, x.gap / 2 + 8),
                    `${row.name.slice(0, 16)} r${r}=${row.label} ${row.look} ${x.cls} gap ${x.gap} turn ${x.turn} ov ${x.ov.join('/')} ${x.pens}`,
                    sheet,
                    set,
                    styles,
                    colorOf,
                    ref
                      ? [
                          {
                            pts: dense(ref.outer, true),
                            closed: true,
                            color: '#ff9900',
                            width: 1,
                            dash: '1 3',
                          },
                        ]
                      : [],
                    (id) => `${tagOf(id)}#${id}`,
                  );
                } catch {
                  /* diagnostic only */
                }
              });
        }
      }
      // the family view: rank r's own lines red (ends dotted), unranked lines blue (ignore) /
      // green (orphans) / grey (notch, internal), other ranks light, common black, the nearest
      // closed size dashed orange
      if (pngDir && process.env.ARCHIVE_LEAKS_FAMILY && pngs < maxPng) {
        const ref = f.candidates
          .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
          .sort((a, b) => Math.abs(a.rank - r) - Math.abs(b.rank - r))[0];
        const pts = ref ? ref.outer : f.candidates.flatMap((x) => x.outer);
        if (pts.length) {
          let bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
          for (const q of pts)
            bb = {
              minX: Math.min(bb.minX, q.x),
              minY: Math.min(bb.minY, q.y),
              maxX: Math.max(bb.maxX, q.x),
              maxY: Math.max(bb.maxY, q.y),
            };
          bb = { minX: bb.minX - 20, minY: bb.minY - 20, maxX: bb.maxX + 20, maxY: bb.maxY + 20 };
          const fs: Stroke[] = [];
          for (const ch of set.chains) {
            if (ch.pts.length < 2) continue;
            const t = tagOf(ch.id);
            if (t === `r${r}`) continue;
            const color = t.startsWith('r')
              ? '#dddddd'
              : t === 'common'
                ? '#000000'
                : t === 'ignore'
                  ? '#1f5fff'
                  : t === 'orphan'
                    ? '#00a000'
                    : '#999999';
            fs.push({
              pts: ch.pts,
              closed: ch.closed,
              color,
              width: t.startsWith('r') ? 0.6 : 0.9,
            });
          }
          if (ref)
            fs.push({ pts: ref.outer, closed: true, color: '#ff9900', width: 1, dash: '4 3' });
          for (const id of own) {
            const ch = set.chains[id];
            if (ch.pts.length < 2) continue;
            fs.push({ pts: ch.pts, closed: ch.closed, color: '#e00000', width: 1.6 });
            if (!ch.closed)
              for (const q of [ch.pts[0], ch.pts[ch.pts.length - 1]])
                fs.push({
                  pts: [
                    { x: q.x - 1.2, y: q.y },
                    { x: q.x + 1.2, y: q.y },
                  ],
                  color: '#e00000',
                  width: 5,
                });
          }
          for (const k of model.corners ?? [])
            if (k.rank === r) fs.push({ pts: k.pts, color: '#ff00ff', width: 2.5 });
          const span = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
          const name = `${rel.replace(/[^\w.-]+/g, '_').slice(0, 50)}__FAM_s${f.seed}_r${r}.png`;
          try {
            renderPng(
              `${pngDir}/${name}`,
              bb,
              fs,
              [
                {
                  at: { x: bb.minX + 2, y: bb.maxY - 4 },
                  text: `${row.name.slice(0, 24)} r${r}=${row.label} ${row.look} ref r${ref?.rank ?? '-'}`,
                  color: '#000',
                  size: 14,
                },
              ],
              Math.min(6, 1400 / span),
            );
          } catch {
            /* diagnostic only */
          }
        }
      }
      // close-up
      if (pngDir && pngs < maxPng) {
        pngs++;
        const m = 35;
        const box = { minX: p.x - m, minY: p.y - m, maxX: p.x + m, maxY: p.y + m };
        const strokes: Stroke[] = [];
        for (const ch of set.chains) {
          if (ch.pts.length < 2) continue;
          const t = tagOf(ch.id);
          const isOwn = t === `r${r}`;
          const rk = rankOf.get(ch.id);
          strokes.push({
            pts: ch.pts,
            closed: ch.closed,
            color: isOwn
              ? '#e00000'
              : rk != null
                ? PALETTE[(rk + 1) % PALETTE.length]
                : t === 'common'
                  ? '#000000'
                  : '#b0b0b0',
            width: isOwn ? 2.2 : t === 'common' ? 1.2 : 0.8,
            ...(rk == null && t !== 'common' ? { dash: '2 2' } : {}),
          });
        }
        for (const k of model.corners ?? [])
          if (k.rank === r) strokes.push({ pts: k.pts, color: '#ff00ff', width: 2.5 });
        strokes.push({
          pts: [
            { x: p.x - 2, y: p.y - 2 },
            { x: p.x + 2, y: p.y + 2 },
          ],
          color: '#00aa00',
          width: 3,
        });
        strokes.push({
          pts: [
            { x: p.x - 2, y: p.y + 2 },
            { x: p.x + 2, y: p.y - 2 },
          ],
          color: '#00aa00',
          width: 3,
        });
        const labels: Label[] = [
          {
            at: { x: box.minX + 1, y: box.maxY - 3 },
            text: `${row.name.slice(0, 24)} r${r}=${row.label} ${row.look} · ${row.cls} ${row.sub ?? ''} gap ${row.gapMm ?? '-'} turn ${row.turnDeg ?? '-'} onto ${row.onto ?? '-'} stub ${row.stub ?? '-'}`,
            color: '#000',
            size: 11,
          },
        ];
        const name = `${rel.replace(/[^\w.-]+/g, '_').slice(0, 50)}__s${f.seed}_r${r}_${row.cls}.png`;
        try {
          renderPng(`${pngDir}/${name}`, box, strokes, labels, 12);
          row.png = name;
        } catch {
          /* diagnostic only */
        }
      }
      rows.push(row);
    }
  }
  // the long lines set aside (role ignore / internal / orphan) by their class: pen, total length
  const set2: Record<string, { n: number; m: number }> = {};
  const furn = furniture(set.chains, styles, sheet.poses, sheet.texts);
  for (const k of set.classes) {
    if (k.role === 'size' || k.role === 'common') continue;
    for (const id of k.chains) {
      const ch = set.chains[id];
      if (!ch || ch.lengthMm < 20) continue;
      const l = chainLook(ch, styles);
      const pen = l ? l.kind : 'none';
      const ev = k.evidence
        .map((e) => e.kind + ('why' in e ? `:${String(e.why).slice(0, 50)}` : ''))
        .join(',');
      const iw = (set as unknown as { ignoreWhy?: Record<number, string> }).ignoreWhy?.[id];
      const why = `${(k.sig ?? '').slice(0, 24)} ${furn[id] ?? (ch.lengthMm < 8 ? 'frag' : '-')} ${ev} ${iw ? iw.replace(/\d+/g, '#') : ''}`;
      const key = `${k.role}|${pen}|${why}`;
      const v = (set2[key] ??= { n: 0, m: 0 });
      v.n++;
      v.m += ch.lengthMm / 1000;
    }
  }
  for (const id of set.orphans) {
    const ch = set.chains[id];
    if (!ch || ch.lengthMm < 20) continue;
    const l = chainLook(ch, styles);
    const key = `orphan|${l ? l.kind : 'none'}|`;
    const v = (set2[key] ??= { n: 0, m: 0 });
    v.n++;
    v.m += ch.lengthMm / 1000;
  }
  (rows as LeakRow[] & { aside?: unknown }).aside = Object.entries(set2)
    .sort((a, b) => b[1].m - a[1].m)
    .slice(0, 12)
    .map(([k, v]) => `${k} ×${v.n} ${v.m.toFixed(1)}m`);
  return rows;
}
