import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const dir = process.argv[2], want = process.argv[3];
const f = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop()))).fields;
const st = f.sheet.styles;
const lenOf = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
const all = f.sheet.paths.filter((p) => !st[p.style].fill && p.pts.length >= 2);
const mine = all.filter((p) => st[p.style].dash && st[p.style].dash.map((d) => d.toFixed(1)).join(',') === want);
const dseg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y); };
console.log('paths of this pen', mine.length, 'closed', mine.filter((p) => p.closed).length, 'lens of long:', mine.filter((p) => lenOf(p.pts) > 40).map((p) => `${Math.round(lenOf(p.pts))}${p.closed ? 'c' : ''}`).join(' '));
for (const p of mine.filter((q) => !q.closed && lenOf(q.pts) > 40)) {
  const a = p.pts[0], b = p.pts[p.pts.length - 1];
  const desc = (e) => {
    const near = [];
    for (const q of all) { if (q === p) continue; let d = Infinity; for (let i = 1; i < q.pts.length; i++) d = Math.min(d, dseg(e, q.pts[i - 1], q.pts[i])); if (d <= 1.2) { const s = st[q.style]; const endD = Math.min(Math.hypot(q.pts[0].x - e.x, q.pts[0].y - e.y), Math.hypot(q.pts.at(-1).x - e.x, q.pts.at(-1).y - e.y)); near.push(`${s.dash ? 'dash ' + s.dash.slice(0, 2).map((v) => v.toFixed(1)).join('/') : 'solid'} w${s.widthMm.toFixed(2)} rgb${s.strokeRgb?.[0]} len${Math.round(lenOf(q.pts))} d${d.toFixed(2)}${endD < 1.2 ? ' END' : ' mid'}${q.background ? ' bg:' + q.background : ''}`); } }
    return near.slice(0, 6).join(' | ');
  };
  console.log(`open path len ${Math.round(lenOf(p.pts))} page ${p.src.page} op ${p.src.op} ends apart ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)} mm\n   end A (${a.x.toFixed(0)},${a.y.toFixed(0)}): ${desc(a)}\n   end B (${b.x.toFixed(0)},${b.y.toFixed(0)}): ${desc(b)}`);
}
