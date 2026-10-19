// chains/ (E2) — a SEAM LINE drawn in a pen of its own is not a size.
//
// One-size vector files draw the cut line and, a constant few millimetres inside it, the seam line
// in another pen (BLAZER: black solid cut line + red dashed seam line 6–8 mm inside; the PLT/SVG
// fixtures likewise). Size recovery reads two pens as two looks — two nameless "sizes" the operator
// must tell apart, and picking the seam row made the seam line the piece. A pen whose lines run
// (≥ 55 % of their length) at a distance that holds edge by edge (3–30 mm, ± 0.5 mm over ≥ 20 mm)
// beside another pen's lines, and lie inside that pen's extent, is that pen's seam line: role 'seam', with the measured offset as
// evidence (`{ kind: 'seam-offset', offsetMm }`). semantics/allowance reads role-'seam' chains
// inside a piece as the drawn seam line and measures the allowance from them (origin 'measured').
// Graded sheets (≥ 3 sizes with lines) are left alone: their sizes nest at varying distances.
import type { Chain, Style } from 'lib/pattern-import/types';

import type { RecoverOut } from '../sizes/recover';
import { bboxOf, resample, SegGrid, segNearest } from './geom';
import { styleKey } from './link';

export type SeamPen = { chains: number[]; offsetMm: number; insideOf: string[] };

const STEP_MM = 2;
const REACH_MM = 32;

/** Pens (style ids) among the line work a one-size file draws, and which of them is a seam line. */
export function seamPens(rec: RecoverOut, styles: ReadonlyMap<number, Style>): SeamPen[] {
  const chains: Chain[] = rec.chains;
  const sized = rec.sizes.filter((s) => s.chains.length);
  if (sized.length >= 3) return [];
  const sizedIds = new Set(sized.flatMap((s) => s.chains));
  const dashed = (pen: string) => !pen.endsWith('|-');
  const pool = [
    ...sized.flatMap((s) => s.chains),
    ...rec.orphans,
    ...rec.common,
    ...rec.internal,
  ].filter((i) => chains[i] && chains[i].pts.length >= 2 && chains[i].lengthMm >= 8);
  // a pen is how the line LOOKS (style ids are per page: BLAZER's black has one per tile)
  const penKey = (i: number) => {
    const st = styles.get(chains[i].style);
    return st ? styleKey(st) : `#${chains[i].style}`;
  };
  const byPen = new Map<string, number[]>();
  for (const i of new Set(pool)) {
    const k = penKey(i);
    const a = byPen.get(k);
    if (a) a.push(i);
    else byPen.set(k, [i]);
  }
  if (byPen.size < 2) return [];
  const penOf = new Map<number, string>();
  for (const [pen, ids] of byPen) for (const i of ids) penOf.set(i, pen);
  const grid = new SegGrid(8);
  for (const ids of byPen.values()) for (const i of ids) grid.addPolyline(i, closedPts(chains[i]));
  const out: SeamPen[] = [];
  for (const [pen, ids] of byPen) {
    const total = ids.reduce((a, i) => a + chains[i].lengthMm, 0);
    if (total < 100) continue;
    // per chain: the nearest line of ANOTHER pen at each sample — a seam loop keeps its distance
    // to the cut line edge by edge (BLAZER: 6, 7, 10 or 12 mm)
    let constLen = 0;
    const offs: { d: number; len: number }[] = [];
    const at: string[] = [];
    for (const i of ids) {
      const ds: { d: number; pen: string }[] = [];
      for (const s of resample(closedPts(chains[i]), STEP_MM)) {
        let best = REACH_MM;
        let bp = '';
        grid.near(s.p, REACH_MM, (o, si) => {
          const op = penOf.get(o);
          if (op === undefined || op === pen) return;
          const q = closedPts(chains[o]);
          const r = segNearest(s.p, q[si], q[si + 1]);
          if (r.d < best) {
            best = r.d;
            bp = op;
          }
        });
        ds.push({ d: bp ? best : Infinity, pen: bp });
      }
      if (ds.length < 4) continue;
      // stretches where the distance holds (± 0.5 mm over ≥ 20 mm): the offset is constant per
      // EDGE (hem 40, seams 7), not per loop
      let k = 0;
      let held = 0;
      while (k < ds.length) {
        let j = k + 1;
        const d0 = ds[k].d;
        if (d0 >= 3 && d0 <= 30) while (j < ds.length && Math.abs(ds[j].d - d0) <= 0.5) j++;
        if (d0 >= 3 && d0 <= 30 && (j - k) * STEP_MM >= 20) {
          held += j - k;
          offs.push({ d: d0, len: (j - k) * STEP_MM });
          for (let q = k; q < j; q++) at.push(ds[q].pen);
        }
        k = j;
      }
      constLen += (held / ds.length) * chains[i].lengthMm;
    }
    if (constLen < 0.55 * total || !offs.length) continue;
    offs.sort((a, b) => a.d - b.d);
    const held = offs.reduce((a, o) => a + o.len, 0);
    let acc = 0;
    let med = offs[0].d;
    for (const o of offs) {
      acc += o.len;
      if (acc >= held / 2) {
        med = o.d;
        break;
      }
    }
    // the partner pen(s) it runs beside, and inside their extent
    const partners = [...new Set(at)].filter(
      (p) => at.filter((x) => x === p).length >= 0.2 * at.length,
    );
    if (!partners.length) continue;
    const mine = bboxOf(ids.flatMap((i) => chains[i].pts));
    const theirs = bboxOf(partners.flatMap((p) => byPen.get(p)!.flatMap((i) => chains[i].pts)));
    const inside =
      mine.minX >= theirs.minX + 1 &&
      mine.minY >= theirs.minY + 1 &&
      mine.maxX <= theirs.maxX - 1 &&
      mine.maxY <= theirs.maxY - 1;
    if (!inside) continue;
    // a pen recovery RANKED as a size stays one unless it is drawn as a seam line is: dashed,
    // beside solid lines (two graded sizes also nest, edge by edge)
    const sizedLen = ids.reduce((a, i) => a + (sizedIds.has(i) ? chains[i].lengthMm : 0), 0);
    if (sizedLen >= 0.5 * total && !(dashed(pen) && partners.every((p) => !dashed(p)))) continue;
    out.push({ chains: ids, offsetMm: Math.round(med * 10) / 10, insideOf: partners });
  }
  // two pens each "inside" the other cannot both be seam lines: keep the innermost (smaller extent)
  if (out.length > 1) {
    const area = (s: SeamPen) => {
      const b = bboxOf(s.chains.flatMap((i) => chains[i].pts));
      return (b.maxX - b.minX) * (b.maxY - b.minY);
    };
    out.sort((a, b) => area(a) - area(b));
    return [out[0]];
  }
  return out;
}

function closedPts(c: Chain) {
  return c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts;
}
