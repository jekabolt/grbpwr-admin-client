#!/usr/bin/env node
// One piece of a dxf-shot run, all sizes overlaid (grey), the suspect size red and alone with its
// neighbours. Reads <shot-file-dir>/cells.json.
//   node scripts/pattern-import/piece-pic.mjs <shot-file-dir> <piece label substring> <size> <out.png>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { createCanvas } = await import(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../node_modules/@napi-rs/canvas/index.js'),
);

const [dir, pieceQ, size, out] = process.argv.slice(2);
const fams = JSON.parse(readFileSync(resolve(dir, 'cells.json'), 'utf8'));
const fam = fams.find((f) => f.label.includes(pieceQ));
if (!fam) throw new Error(`no piece ${pieceQ}: ${fams.map((f) => f.label).join(' | ')}`);
const cells = fam.cells.filter((c) => c.outer?.length);
const iBad = cells.findIndex((c) => c.size === size);
if (iBad < 0) throw new Error(`no size ${size}: ${cells.map((c) => c.size).join(' ')}`);
const near = cells.filter((_, i) => Math.abs(i - iBad) === 1);
const bad = cells[iBad];

const panel = (g, ox, W, H, list, title) => {
  const pts = list.flatMap((c) => c.outer);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((W - 40) / (x1 - x0 || 1), (H - 60) / (y1 - y0 || 1));
  const T = ([x, y]) => [ox + 20 + (x - x0) * k, 40 + (y1 - y) * k];
  g.fillStyle = '#000';
  g.font = '14px sans-serif';
  g.fillText(title, ox + 10, 20);
  for (const c of list) {
    const isBad = c === bad;
    g.strokeStyle = isBad ? '#d00' : near.includes(c) ? '#06c' : '#bbb';
    g.lineWidth = isBad ? 2 : 1;
    g.beginPath();
    c.outer.forEach((p, i) => (i ? g.lineTo(...T(p)) : g.moveTo(...T(p))));
    g.closePath();
    g.stroke();
  }
  return { k };
};
const W = 700;
const H = 700;
const cv = createCanvas(W * 2, H);
const g = cv.getContext('2d');
g.fillStyle = '#fff';
g.fillRect(0, 0, cv.width, cv.height);
panel(g, 0, W, H, cells, `${fam.label} — all sizes, red ${size} (${bad.outcome})`);
panel(g, W, W, H, [...near, bad], `${size} red vs neighbours blue: ${near.map((c) => c.size).join(', ')}`);
writeFileSync(out, cv.toBuffer('image/png'));
console.log('wrote', out, 'sizes', cells.map((c) => c.size).join(' '));
