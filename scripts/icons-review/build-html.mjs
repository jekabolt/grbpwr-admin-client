#!/usr/bin/env node
// Builds the one self-contained review sheet from two stand runs.
//
//   node scripts/icons-review/build-html.mjs <before.json> <after.json> <out.html>
//
// Per family, per icon: before | after at the call-site size, then before | after at 2×.
// Ink #111 on white. Pictures wider than 300 px (marker quiz) are shown at 1× only.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FAMILY_TITLE = {
  placeholder: 'Placeholder glyphs',
  trim: 'Trim pictograms',
  garment: 'Garment pictograms',
  measurement: 'Measurement pictograms',
  parts: 'Garment parts',
  seams: 'Seams · palette',
  hardware: 'Hardware · labels',
  marker: 'Marker quiz',
};
const MAX_2X = 300;

const esc = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

let cellId = 0;
/** Ids inside one inline svg must not collide with another copy of the same icon. */
function scopeIds(svg) {
  const suffix = `-r${++cellId}`;
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  let out = svg;
  for (const id of ids) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\sid="${safe}"`, 'g'), ` id="${id}${suffix}"`)
      .replace(new RegExp(`url\\(#${safe}\\)`, 'g'), `url(#${id}${suffix})`)
      .replace(new RegExp(`href="#${safe}"`, 'g'), `href="#${id}${suffix}"`);
  }
  return out;
}

function cell(row, scale, side) {
  if (!row) return `<div class="cell missing" title="${side}: absent">—</div>`;
  if (row.error) return `<div class="cell missing" title="${esc(row.error)}">error</div>`;
  const w = row.w * scale;
  const h = row.h * scale;
  return `<div class="cell" style="width:${w}px;height:${h}px;font-size:${Math.round(
    15 * scale,
  )}px">${scopeIds(row.svg)}</div>`;
}

export function buildHtml(before, after, meta = {}) {
  const key = (r) => `${r.family}|${r.name}|${r.variant}`;
  const b = new Map(before.map((r) => [key(r), r]));
  const a = new Map(after.map((r) => [key(r), r]));
  const order = [...new Set([...after.map(key), ...before.map(key)])];
  const families = [...new Set(order.map((k) => k.split('|')[0]))];

  const sections = families.map((family) => {
    const keys = order.filter((k) => k.startsWith(`${family}|`));
    const cards = keys.map((k) => {
      const rb = b.get(k);
      const ra = a.get(k);
      const ref = ra ?? rb;
      const big = ref.w <= MAX_2X;
      const same = rb && ra && rb.svg === ra.svg;
      return `<figure class="card${same ? ' same' : ''}">
  <figcaption><b>${esc(ref.name)}</b> ${esc(ref.variant)}${same ? ' <i>unchanged</i>' : ''}</figcaption>
  <div class="pair"><div><span>before</span>${cell(rb, 1, 'before')}</div><div><span>after</span>${cell(ra, 1, 'after')}</div></div>
  ${big ? `<div class="pair"><div><span>before 2×</span>${cell(rb, 2, 'before')}</div><div><span>after 2×</span>${cell(ra, 2, 'after')}</div></div>` : ''}
</figure>`;
    });
    const changed = keys.filter((k) => b.get(k)?.svg !== a.get(k)?.svg).length;
    return `<section><h2>${esc(FAMILY_TITLE[family] ?? family)} <small>${keys.length} · ${changed} changed</small></h2>
<div class="grid">${cards.join('\n')}</div></section>`;
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Icons review</title>
<style>
:root{--color-textColor:#111;--color-labelColor:#666;--color-error:#f00;--color-bgColor:#fff;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:#fff;color:#111;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}
h1{font-size:14px;margin:0 0 4px}
h2{font-size:13px;margin:24px 0 8px;padding-bottom:4px;border-bottom:1px solid #111;text-transform:uppercase;letter-spacing:.04em}
h2 small{font-weight:400;color:#666;text-transform:none;letter-spacing:0}
.meta{color:#666;margin:0}
.grid{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.card{margin:0;padding:6px;border:1px solid #ddd;display:flex;flex-direction:column;gap:6px}
.card.same{border-style:dashed}
figcaption{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
figcaption i{color:#999;font-style:normal}
.pair{display:flex;gap:8px;align-items:flex-end}
.pair>div{display:flex;flex-direction:column;gap:2px}
.pair span{color:#999;font-size:10px}
.cell{position:relative;display:flex;align-items:center;justify-content:center;color:#111;outline:1px solid #f0f0f0;line-height:1;font-family:system-ui,sans-serif}
.cell>svg,.cell>span>svg{width:100%;height:100%;display:block;overflow:visible}
.cell.missing{width:48px;height:48px;color:#c00;outline-color:#fbb}
</style></head><body>
<h1>ICONS-UNIFY · before (origin/beta) | after (feat/icons-unify${meta.head ? ` ${esc(meta.head)}` : ''})</h1>
<p class="meta">${after.length} icons · rendered ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>
${sections.join('\n')}
</body></html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [beforePath, afterPath, outPath] = process.argv.slice(2);
  if (!beforePath || !afterPath || !outPath) {
    console.error('usage: build-html.mjs <before.json> <after.json> <out.html>');
    process.exit(2);
  }
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  writeFileSync(outPath, buildHtml(read(beforePath), read(afterPath)));
  console.log(`review → ${outPath}`);
}
