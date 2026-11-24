// Pieces that are cut by measurements, not from a drawn outline: the text beside the piece label
// says so ("Cut a rectangle of fabric with the following dimensions", "Your waist circumference x 2").
//   node by-measure.mjs <bench.json with label positions> <snapshot root> [<snapshot root> …]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const [benchPath, ...roots] = process.argv.slice(2);
const bench = new Map(JSON.parse(readFileSync(benchPath, 'utf8')).files.map((x) => [x.id, x]));
const RX = /cut (a |an |\d+ )?(rectangles?|strips?|squares?|circles?)|foll?owing dimensions|measurement\s*[x×]|your (waist|hips?|bust|chest)|circumference\s*[x×]/i;
let files = 0, cellsAll = 0, openAll = 0; const hits = [];
for (const root of roots) for (const id of readdirSync(root)) {
  const dir = `${root}/${id}`; if (id.endsWith('.json') || !existsSync(`${dir}/cells.json`)) continue;
  const snaps = readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort(); if (!snaps.length) continue; files++;
  const f = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`))).fields;
  const T = (f.sheet.texts ?? []).map((t) => ({ s: String(t.text ?? ''), x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 }));
  const b = bench.get(id);
  for (const fam of JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'))) {
    const open = fam.cells.filter((c) => c.outcome !== 'closed').length; cellsAll += fam.cells.length; openAll += open;
    const label = (fam.label ?? '').trim(); const at = b?.pieces.find((q) => q.seed === fam.seed)?.at; if (!at) continue;
    // the lines of text just beside the label: within 30 mm up or down and 130 mm sideways
    const near = T.filter((t) => Math.abs(t.y - at.y) <= 30 && Math.abs(t.x - at.x) <= 130 && t.s.trim() !== label);
    const m = near.filter((t) => RX.test(t.s)); if (!m.length) continue;
    hits.push({ id, label, cells: fam.cells.length, open, text: m.sort((p, q) => Math.abs(p.y - at.y) - Math.abs(q.y - at.y)).slice(0, 2).map((t) => t.s.trim().slice(0, 70)) });
  }
}
console.log(`files ${files} · cells ${cellsAll} · open ${openAll}`);
console.log(`pieces with a cut-by-measurement text beside the label: ${hits.length} in ${new Set(hits.map((h) => h.id)).size} files · their cells ${hits.reduce((a, h) => a + h.cells, 0)} · of them open ${hits.reduce((a, h) => a + h.open, 0)}`);
for (const h of hits) console.log(`  ${h.id.replace(/^(MoodFabrics\.com-|A4-|2-)/, '').slice(0, 26).padEnd(26)} ${h.label.slice(0, 28).padEnd(28)} cells ${String(h.cells).padStart(2)} open ${String(h.open).padStart(2)} · ${h.text.join(' | ')}`);
