// pdf.js getTextContent items → IRText (page mm, y-up), with the OCG taken from the operator-list
// text run that starts at the item's origin (getTextContent cannot resolve /OC names itself).

import type { IRText } from 'lib/pattern-import/types';

import { boxOfPts, mul, type M6 } from './geom';
import type { TextRun } from './walk';

type Item = { str?: string; transform?: number[]; width?: number; height?: number };

/** Nearest run within this distance (mm) of the item origin is its own run. */
const SAME_RUN_MM = 1;
/** Otherwise: the nearest run to the LEFT on the same baseline within this many mm. */
const SAME_LINE_MM = 0.5;
const SAME_LINE_REACH_MM = 400;

export function textsOf(
  items: unknown[],
  base: M6,
  runs: readonly TextRun[],
  file: string,
  page: number,
  firstOp: number,
): IRText[] {
  const out: IRText[] = [];
  const layerAt = runs.some((r) => r.layer !== null) ? layerFinder(runs) : () => null;
  items.forEach((raw, idx) => {
    const it = raw as Item;
    if (typeof it.str !== 'string' || !it.str.trim() || !it.transform) return;
    const t = mul(base, it.transform);
    const fontSizeMm = Math.hypot(t[2], t[3]);
    const rot = Math.atan2(t[1], t[0]);
    const anchor = { x: t[4], y: t[5] };
    // width/height are user-space lengths along/normal to the baseline; map them through the
    // base scale (pt → mm) only — the item's own transform already carries the CTM.
    const unit = Math.hypot(base[0], base[1]);
    const w = (it.width ?? 0) * unit;
    const h = (it.height ?? 0) * unit || fontSizeMm;
    const ux = Math.cos(rot);
    const uy = Math.sin(rot);
    const nx = -uy;
    const ny = ux;
    const desc = 0.2 * h;
    const corners = [
      { x: anchor.x - nx * desc, y: anchor.y - ny * desc },
      { x: anchor.x + ux * w - nx * desc, y: anchor.y + uy * w - ny * desc },
      { x: anchor.x + ux * w + nx * h, y: anchor.y + uy * w + ny * h },
      { x: anchor.x + nx * h, y: anchor.y + ny * h },
    ];
    out.push({
      id: out.length,
      text: it.str,
      anchor,
      bbox: boxOfPts(corners),
      fontSizeMm,
      rotationDeg: (rot * 180) / Math.PI,
      layer: layerAt(anchor.x, anchor.y),
      // Text has no operator index of its own: `op` = firstOp + item index keeps it unique and
      // stable; `sub` 0. (Operator indices of paths are < firstOp.)
      src: { file, page, op: firstOp + idx, sub: 0 },
    });
  });
  return out;
}

/**
 * Text items and text-showing operators come in the same content-stream order, and one item may
 * merge several runs. So match IN ORDER: the first unused run at the item's origin from a cursor
 * on — the same label drawn once per size layer at the same spot (kombinezon) then gets each
 * size's layer instead of all landing on the last one.
 */
function layerFinder(runs: readonly TextRun[]) {
  const used = new Uint8Array(runs.length);
  let cursor = 0;
  const at = (k: number, x: number, y: number) =>
    !used[k] && Math.hypot(runs[k].x - x, runs[k].y - y) <= SAME_RUN_MM;
  return (x: number, y: number): string | null => {
    let hit = -1;
    for (let k = cursor; k < runs.length && hit < 0; k++) if (at(k, x, y)) hit = k;
    for (let k = 0; k < cursor && hit < 0; k++) if (at(k, x, y)) hit = k;
    if (hit >= 0) {
      used[hit] = 1;
      cursor = hit + 1;
      return runs[hit].layer;
    }
    // A run continued without a new text position: the nearest run to the LEFT on its baseline.
    let left: TextRun | null = null;
    let leftD = SAME_LINE_REACH_MM;
    for (const r of runs) {
      if (Math.abs(r.y - y) > SAME_LINE_MM || r.x > x) continue;
      if (x - r.x < leftD) {
        leftD = x - r.x;
        left = r;
      }
    }
    return left ? left.layer : null;
  };
}
