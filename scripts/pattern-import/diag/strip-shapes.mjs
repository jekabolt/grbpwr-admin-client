import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const require = createRequire(process.cwd() + '/');
const { createCanvas } = require('@napi-rs/canvas');
const dir = process.argv[2];
const f = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop()))).fields;
const marks = [];
for (const p of f.sheet.paths) {
  const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (Math.abs(cx - 26.3) > 1.2 || cy < 805 || cy > 1065 || p.src.page !== 10) continue;
  if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) > 6) continue;
  const st = f.sheet.styles[p.style];
  let per = 0, area = 0; const n = p.pts.length;
  for (let i = 0; i < n; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; if (p.closed || i < n - 1) per += Math.hypot(b.x - a.x, b.y - a.y); if (p.closed) area += a.x * b.y - b.x * a.y; }
  marks.push({ p, cy, fill: st.fill, per, area: Math.abs(area) / 2 });
}
// kinds by (fill, perimeter, area)
const kinds = [];
for (const m of marks) { const k = kinds.find((x) => x.fill === m.fill && Math.abs(x.per - m.per) <= 0.12 * Math.max(x.per, m.per) && Math.abs(x.area - m.area) <= 0.2 * Math.max(x.area, m.area, 0.02)); if (k) k.items.push(m); else kinds.push({ fill: m.fill, per: m.per, area: m.area, items: [m] }); }
kinds.sort((a, b) => b.items.length - a.items.length);
const med = (v) => [...v].sort((a, b) => a - b)[v.length >> 1];
for (const k of kinds.slice(0, 9)) {
  const ys = k.items.map((m) => m.cy).sort((a, b) => a - b);
  const d = ys.slice(1).map((y, i) => y - ys[i]);
  const m = med(d), reg = d.filter((x) => Math.abs(x - m) <= 0.15 * m).length / d.length;
  console.log(`${k.fill ? 'fill' : 'stroke'} ${k.items[0].p.pts.length}pt perimeter ${k.per.toFixed(2)} area ${k.area.toFixed(2)}: ${k.items.length} marks | step median ${m.toFixed(2)} mm | steps within 15% of it: ${Math.round(100 * reg)}% | covers y ${Math.round(ys[0])}..${Math.round(ys.at(-1))}`);
}
// picture: 30 mm of the strip, stretched sideways; left = everything, then one column per kind
const Y0 = 900, Y1 = 930, K = 40, COLS = 5, CW = 150;
const cv = createCanvas(CW * COLS, (Y1 - Y0) * K + 30), g = cv.getContext('2d');
g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
const draw = (m, col) => { g.beginPath(); m.p.pts.forEach((q, i) => { const x = col * CW + CW / 2 + (q.x - 26.3) * K, y = 30 + (q.y - Y0) * K; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); if (m.fill) { g.fillStyle = '#111'; g.fill(); } else { g.strokeStyle = '#111'; g.lineWidth = 0.35 * K; g.stroke(); } };
g.font = '14px sans-serif';
[['all marks', marks], ...kinds.slice(0, 4).map((k, i) => [`kind ${i + 1}: ${k.items.length}`, k.items])].forEach(([t, list], col) => { g.fillStyle = '#000'; g.fillText(t, col * CW + 8, 16); for (const m of list) if (m.cy > Y0 && m.cy < Y1) draw(m, col); });
writeFileSync(process.argv[3], cv.toBuffer('image/png'));
