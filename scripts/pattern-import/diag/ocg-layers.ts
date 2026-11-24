// Layered (OCG) patterns: who owns each line, and how a shared line is drawn. Read-only.
//   npx vite-node <this> <pdf> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extractPdf, DEFAULT_EXTRACT_OPTS, setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';

const LEGACY = resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);
const [pdf, out] = process.argv.slice(2);
const buf = readFileSync(pdf);
const doc = await extractPdf({ id: "0", name: pdf.split("/").pop()!, bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer }, DEFAULT_EXTRACT_OPTS);
const CELL = 2;
type Seg = [number, number, number, number];
const layerLen = new Map<string, number>();
const layerStyle = new Map<string, Map<string, number>>();
// coincidence: for layer A's stroke length, the set of OTHER layers with a stroke within 0.2 mm
const combo = new Map<string, Map<string, number>>();
for (const pg of doc.pages) {
  const grid = new Map<string, { s: Seg; l: string }[]>();
  const segs: { s: Seg; l: string }[] = [];
  for (const p of pg.paths) {
    const st = pg.styles[p.style];
    if (st.fill && st.widthMm === 0) continue;
    const l = st.layer ?? '(no layer)';
    const key = `${st.strokeRgb?.join(',')}|w${st.widthMm.toFixed(2)}|${st.dash ? 'dash ' + st.dash.map((d) => d.toFixed(1)).join(',') : 'solid'}`;
    for (let k = 1; k < p.pts.length; k++) {
      const a = p.pts[k - 1], b = p.pts[k];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1e-6) continue;
      layerLen.set(l, (layerLen.get(l) ?? 0) + L);
      const m = layerStyle.get(l) ?? layerStyle.set(l, new Map()).get(l)!;
      m.set(key, (m.get(key) ?? 0) + L);
      const e = { s: [a.x, a.y, b.x, b.y] as Seg, l };
      segs.push(e);
      const n = Math.ceil(L / CELL) + 1;
      const seen = new Set<string>();
      for (let q = 0; q <= n; q++) {
        const gx = Math.floor((a.x + ((b.x - a.x) * q) / n) / CELL), gy = Math.floor((a.y + ((b.y - a.y) * q) / n) / CELL);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const kk = `${gx + dx},${gy + dy}`;
          if (seen.has(kk)) continue;
          seen.add(kk);
          (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push(e);
        }
      }
    }
  }
  for (const e of segs) {
    const [ax, ay, bx, by] = e.s;
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 1));
    for (let q = 0; q < n; q++) {
      const x = ax + ((bx - ax) * (q + 0.5)) / n, y = ay + ((by - ay) * (q + 0.5)) / n;
      const others = new Set<string>();
      for (const o of grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
        if (o.l === e.l || others.has(o.l)) continue;
        const [cx, cy, dx2, dy2] = o.s;
        const ux = dx2 - cx, uy = dy2 - cy, LL = ux * ux + uy * uy;
        const t = LL ? Math.max(0, Math.min(1, ((x - cx) * ux + (y - cy) * uy) / LL)) : 0;
        if (Math.hypot(cx + t * ux - x, cy + t * uy - y) <= 0.2) others.add(o.l);
      }
      const m = combo.get(e.l) ?? combo.set(e.l, new Map()).get(e.l)!;
      const k2 = String(others.size);
      m.set(k2, (m.get(k2) ?? 0) + L / n);
    }
  }
}
const res = {
  file: pdf.split('/').pop(), pages: doc.pages.length, layersInFile: [...new Set(doc.pages.flatMap((p) => p.layers))],
  layers: [...layerLen].sort((a, b) => b[1] - a[1]).map(([l, len]) => ({
    layer: l, m: +(len / 1000).toFixed(1),
    styles: [...layerStyle.get(l)!].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round((100 * v) / len)}%`),
    coincidesWithNOtherLayers: Object.fromEntries([...combo.get(l)!].sort((a, b) => +a[0] - +b[0]).map(([k, v]) => [k, Math.round((100 * v) / len) + '%'])),
  })),
};
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
