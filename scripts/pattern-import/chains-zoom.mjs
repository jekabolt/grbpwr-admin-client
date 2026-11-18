#!/usr/bin/env node
// Source chains near a point, coloured by rank and labelled with their ids. Needs walls-dump.json
// in the shot dir (written by a run with the walls dump on) and run.json.
//   node scripts/pattern-import/chains-zoom.mjs <shot-file-dir> <cx> <cy> <r> <out.png>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { createCanvas } = await import(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../node_modules/@napi-rs/canvas/index.js'),
);
const [dir, cx, cy, r, out] = process.argv.slice(2).map((v, i) => (i && i < 4 ? +v : v));
const w = JSON.parse(readFileSync(`${dir}/walls-dump.json`, 'utf8')).at(-1);
const card = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8')).card;
const rk = new Map(); w.byRank.forEach((ids, k) => ids.forEach((i) => rk.set(+i, k)));
const common = new Set(w.common.map(Number));
const S = 700, k = S / (2 * r), T = ([x, y]) => [(x - cx + r) * k, (cy + r - y) * k];
const cv = createCanvas(S, S), g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.font = '11px sans-serif';
for (const [id, c] of Object.entries(w.chains)) {
  const P = c.pts.filter(([x, y]) => Math.abs(x - cx) < r * 1.2 && Math.abs(y - cy) < r * 1.2); if (P.length < 2) continue;
  const rr = rk.get(+id); const col = common.has(+id) ? '#090' : rr == null ? '#999' : `hsl(${(rr * 47) % 360} 80% 40%)`;
  g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(...T(p)) : g.moveTo(...T(p)))); g.stroke();
  const m = T(P[Math.floor(P.length / 2)]); g.fillStyle = col; g.fillText(`${id}:${common.has(+id) ? 'common' : rr == null ? '?' : card[rr]}`, m[0] + 2, m[1] - 2);
}
g.fillStyle = '#000'; g.fillText(`chains @${cx},${cy} r${r}`, 5, 12); writeFileSync(out, cv.toBuffer('image/png'));
