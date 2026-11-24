// Research: dump every stroked segment of a layered PDF with its OCG name, per page (page mm).
//   npx vite-node scripts/pattern-import/family-research/ocg-truth.ts <pdf> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extractPdf, DEFAULT_EXTRACT_OPTS, setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';

const LEGACY = resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);
const [pdf, out] = process.argv.slice(2);
const buf = readFileSync(pdf);
const doc = await extractPdf(
  { id: '0', name: pdf.split('/').pop()!, bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer },
  DEFAULT_EXTRACT_OPTS,
);
const pages = doc.pages.map((pg) => {
  const layers: string[] = [];
  const li = new Map<string, number>();
  const segs: number[] = []; // ax ay bx by layerIdx
  for (const p of pg.paths) {
    const st = pg.styles[p.style];
    if (!st || st.widthMm === 0) continue;
    const l = st.layer ?? '(none)';
    if (!li.has(l)) { li.set(l, layers.length); layers.push(l); }
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    for (let k = 1; k < pts.length; k++) segs.push(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y, li.get(l)!);
  }
  return { page: pg.page, w: pg.widthMm, h: pg.heightMm, layers, segs };
});
writeFileSync(out, JSON.stringify(pages));
console.log(pdf.split('/').pop(), 'pages', pages.length, 'segs', pages.reduce((a, p) => a + p.segs.length / 5, 0));
