#!/usr/bin/env node
// DXF CHECK — the acceptance of the open-lines work (owner, 11 Nov 2026), read off a dxf-shot.mjs
// output: every piece in every size present and closed, no gap, nothing left undrawn.
//   node scripts/pattern-import/dxf-check.mjs <shot-out-dir> [--png]
// Per file it reads run.json (the piece × size matrix the pieces stage left), cells.json (the same
// with the outlines) and dxf/*.dxf (what was WRITTEN), and says:
//   cells      piece × size cells the size map exports;     closed = those that closed
//   blocks     outlines written to the DXF (layer-1 cut line, one per piece × size)
//   bad        written outlines that are open, degenerate (< 3 pts, < 1 cm²) or cross themselves
//   complete   the run wrote, every cell closed, blocks == cells, nothing bad
// --png draws <file>/shot.png: one panel per piece, every size overlaid — closed black (repaired
// blue, drawn-by-the-grade green), a leak red with its leak point, the grade's prediction dashed.
// Writes <shot-out-dir>/check.json and prints a table.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const OUT = resolve(argv[0] ?? '.');
const PNG = argv.includes('--png');

// ── DXF: the blocks and their layer-1 cut line ───────────────────────────────────────────────
function readBlocks(text) {
  const l = text.split(/\r?\n/);
  const blocks = [];
  let blk = null;
  let ent = null;
  let polyline = null;
  const flush = () => {
    if (ent && blk && ent.type === 'LWPOLYLINE') blk.polys.push(ent);
    if (ent?.type === 'VERTEX' && polyline) polyline.pts.push(...ent.pts);
    ent = null;
  };
  for (let i = 0; i + 1 < l.length; i += 2) {
    const code = +l[i].trim();
    const v = l[i + 1].trim();
    if (code === 0) {
      flush();
      if (v !== 'VERTEX' && polyline) {
        if (v === 'SEQEND') blk.polys.push(polyline);
        polyline = null;
      }
      if (v === 'BLOCK') blk = { name: null, polys: [] };
      else if (v === 'ENDBLK') {
        if (blk?.name && !blk.name.startsWith('*')) blocks.push(blk);
        blk = null;
      } else if (blk) {
        ent = { type: v, layer: null, closed: false, pts: [] };
        if (v === 'POLYLINE') polyline = ent;
      }
      continue;
    }
    if (blk && !ent && code === 2) blk.name = v;
    if (!ent) continue;
    if (code === 8) ent.layer = v;
    else if (code === 70) ent.closed = (+v & 1) === 1;
    else if (code === 10 && ent.type !== 'POLYLINE') ent.pts.push({ x: +v, y: 0 });
    else if (code === 20 && ent.pts.length) ent.pts[ent.pts.length - 1].y = +v;
  }
  return blocks;
}

const area = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    a += q.x * r.y - r.x * q.y;
  }
  return Math.abs(a) / 2;
};

/** Proper crossings of non-adjacent edges of a closed ring (bbox sweep). */
function selfCrossings(p) {
  const n = p.length;
  const seg = [];
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    seg.push({ i, a, b, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) });
  }
  seg.sort((s, t) => s.x0 - t.x0);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  let hits = 0;
  for (let k = 0; k < seg.length; k++) {
    const s = seg[k];
    for (let m = k + 1; m < seg.length && seg[m].x0 <= s.x1; m++) {
      const t = seg[m];
      const d = Math.abs(s.i - t.i);
      if (d <= 1 || d === n - 1) continue;
      const d1 = cr(s.a, s.b, t.a);
      const d2 = cr(s.a, s.b, t.b);
      const d3 = cr(t.a, t.b, s.a);
      const d4 = cr(t.a, t.b, s.b);
      if (d1 * d2 < 0 && d3 * d4 < 0) hits++;
    }
  }
  return hits;
}

// ── one file ─────────────────────────────────────────────────────────────────────────────────
function checkFile(dir) {
  const run = JSON.parse(readFileSync(resolve(dir, 'run.json'), 'utf8'));
  const fams = run.families ?? [];
  const cells = fams.reduce((a, f) => a + f.cells.length, 0);
  const closed = fams.reduce((a, f) => a + f.cells.filter((c) => c.outcome === 'closed').length, 0);
  const open = fams.flatMap((f) =>
    f.cells
      .filter((c) => c.outcome !== 'closed')
      .map((c) => `${f.label ?? `seed ${f.seed}`} ${c.size}:${c.outcome}${c.refusal ? `(${c.refusal})` : ''}`),
  );
  const repaired = fams.reduce(
    (a, f) => a + f.cells.filter((c) => c.outcome === 'closed' && c.from === 'repair').length,
    0,
  );
  const dxfDir = resolve(dir, 'dxf');
  const blocks = [];
  const bad = [];
  if (existsSync(dxfDir))
    for (const fn of readdirSync(dxfDir).filter((x) => x.endsWith('.dxf'))) {
      for (const b of readBlocks(readFileSync(resolve(dxfDir, fn), 'utf8'))) {
        const cut = b.polys.find((p) => p.layer === '1');
        blocks.push(b.name);
        const why = !cut
          ? 'no cut line'
          : !cut.closed
            ? 'open'
            : cut.pts.length < 3 || area(cut.pts) < 100
              ? 'degenerate'
              : selfCrossings(cut.pts)
                ? `crosses itself ×${selfCrossings(cut.pts)}`
                : null;
        if (why) bad.push(`${fn}:${b.name} ${why}`);
      }
    }
  const wrote = !!run.write;
  return {
    id: run.id,
    verdict: run.verdict,
    stop: run.stop ? `[${run.stop.step}] ${run.stop.reason}` : null,
    pieces: fams.length,
    sizes: run.card?.length ?? 0,
    cells,
    closed,
    repaired,
    open,
    wrote,
    blocks: blocks.length,
    bad,
    complete: wrote && cells > 0 && closed === cells && blocks.length === cells && !bad.length,
  };
}

// ── the picture ──────────────────────────────────────────────────────────────────────────────
async function draw(dir, res) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const fams = JSON.parse(readFileSync(resolve(dir, 'cells.json'), 'utf8'));
  if (!fams.length) return;
  const cols = Math.min(4, fams.length);
  const rows = Math.ceil(fams.length / cols);
  const W = 520;
  const H = 560;
  const cv = createCanvas(cols * W, rows * H + 40);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#000';
  g.font = '16px sans-serif';
  g.fillText(
    `${res.id} — ${res.closed}/${res.cells} closed${res.wrote ? `, ${res.blocks} written` : ', NOT WRITTEN'}${res.stop ? ` · ${res.stop.slice(0, 110)}` : ''}`,
    10,
    24,
  );
  fams.forEach((f, k) => {
    const ox = (k % cols) * W;
    const oy = 40 + Math.floor(k / cols) * H;
    const all = f.cells.flatMap((c) => [...(c.outer ?? []), ...(c.pred ?? [])]);
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    if (!xs.length) return;
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const s = Math.min((W - 30) / (Math.max(...xs) - x0 || 1), (H - 70) / (Math.max(...ys) - y0 || 1));
    const P = (p) => [ox + 15 + (p[0] - x0) * s, oy + 50 + (p[1] - y0) * s];
    const path = (pts, close) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
      if (close) g.closePath();
      g.stroke();
    };
    g.strokeStyle = '#ddd';
    g.lineWidth = 1;
    g.strokeRect(ox + 2, oy + 2, W - 4, H - 4);
    const bad = f.cells.filter((c) => c.outcome !== 'closed');
    g.fillStyle = bad.length ? '#c00' : '#060';
    g.font = '14px sans-serif';
    g.fillText(`${(f.label ?? `seed ${f.seed}`).slice(0, 34)}  ${f.cells.length - bad.length}/${f.cells.length}`, ox + 10, oy + 20);
    g.font = '11px sans-serif';
    g.fillText(bad.map((c) => c.size).join(' ').slice(0, 80), ox + 10, oy + 36);
    for (const c of f.cells.filter((x) => x.outcome === 'closed')) {
      g.strokeStyle = c.from === 'repair' ? '#06c' : '#000';
      g.lineWidth = 0.6;
      if (c.outer?.length) path(c.outer, true);
      for (const d of c.derived ?? []) {
        g.strokeStyle = d.kind === 'grade-draw' ? '#0a0' : '#f80';
        g.lineWidth = 2;
        if (d.pts.length > 1) path(d.pts, false);
      }
    }
    for (const c of bad) {
      g.strokeStyle = '#e00';
      g.lineWidth = 1.2;
      if (c.outer?.length > 2) path(c.outer, true);
      if (c.pred?.length) {
        g.setLineDash([5, 4]);
        g.strokeStyle = '#e90';
        path(c.pred, true);
        g.setLineDash([]);
      }
      if (c.leakAt) {
        const [x, y] = P(c.leakAt);
        g.fillStyle = '#e00';
        g.beginPath();
        g.arc(x, y, 4, 0, 7);
        g.fill();
      }
    }
  });
  writeFileSync(resolve(dir, 'shot.png'), cv.toBuffer('image/png'));
}

// ── all ──────────────────────────────────────────────────────────────────────────────────────
const dirs = readdirSync(OUT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(OUT, d.name, 'run.json')))
  .map((d) => resolve(OUT, d.name));
const res = [];
for (const d of dirs) {
  const r = checkFile(d);
  res.push(r);
  if (PNG && existsSync(resolve(d, 'cells.json'))) await draw(d, r);
}
res.sort((a, b) => a.id.localeCompare(b.id));
const tot = (k) => res.reduce((a, r) => a + r[k], 0);
for (const r of res)
  console.log(
    `${r.complete ? 'COMPLETE' : r.wrote ? 'written ' : 'NO DXF  '} ${String(r.closed).padStart(4)}/${String(r.cells).padEnd(4)} blk ${String(r.blocks).padStart(4)} bad ${String(r.bad.length).padStart(2)}  ${r.id.slice(0, 50)}${r.wrote ? '' : `  ${(r.stop ?? '').slice(0, 70)}`}`,
  );
console.log(
  `\nfiles ${res.length} · complete ${res.filter((r) => r.complete).length} · wrote ${res.filter((r) => r.wrote).length} · cells ${tot('closed')}/${tot('cells')} closed (${tot('repaired')} repaired) · blocks ${tot('blocks')} · bad ${res.reduce((a, r) => a + r.bad.length, 0)}`,
);
writeFileSync(resolve(OUT, 'check.json'), JSON.stringify(res, null, 1));
