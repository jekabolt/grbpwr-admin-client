// Before/after media for two dxf-shot runs: one PNG per cell whose result changed.
//
//   node scripts/pattern-import/media-diff.mjs <before-run-dir> <after-run-dir> <name> [--max N] [--moved-mm 0.5]
//
// A run dir is a `dxf-shot.mjs --out` directory (one sub-dir per PDF with `cells.json`).
// Output: /private/tmp/patimport-runs/media/<name>/
//   NNN-<kind>-<file>-<piece>-<size>.png   left = before, right = after, one shared scale
//   index.json                              { name, before, after, totals, items[] }
//   index.md                                the same as a table, worst first
// kind: loss (closed → not closed), gain (not closed → closed), moved (closed in both, outline
// moved more than --moved-mm), changed (both open, different outcome).
// Drawing: the piece's other sizes in grey (closed outline solid, open prediction dotted); the cell
// itself green solid when closed, red dashed prediction + a cross at the leak when open.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { createCanvas } = await import(resolve(REPO, 'node_modules/@napi-rs/canvas/index.js'));

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i < 0 ? d : argv.splice(i, 2)[1];
};
const MAX = Number(opt('--max', 200));
const MOVED_MM = Number(opt('--moved-mm', 0.5));
const [beforeDir, afterDir, name] = argv;
if (!beforeDir || !afterDir || !name) {
  console.error('usage: media-diff.mjs <before-run-dir> <after-run-dir> <name> [--max N] [--moved-mm 0.5]');
  process.exit(2);
}
const OUT = resolve('/private/tmp/patimport-runs/media', name);
mkdirSync(OUT, { recursive: true });

const load = (dir) => {
  const out = new Map();
  for (const f of readdirSync(dir)) {
    const p = resolve(dir, f, 'cells.json');
    if (existsSync(p)) out.set(f, JSON.parse(readFileSync(p, 'utf8')));
  }
  return out;
};
const A = load(beforeDir);
const B = load(afterDir);

const closed = (c) => c?.outcome === 'closed' && c.outer?.length > 2;
const lineOf = (c) => (closed(c) ? c.outer : c?.pred?.length > 1 ? c.pred : []);
// symmetric max distance from the vertices of one outline to the vertices of the other
const moved = (p, q) => {
  const one = (u, v) => {
    let m = 0;
    for (const a of u) {
      let b = Infinity;
      for (const x of v) b = Math.min(b, Math.hypot(a[0] - x[0], a[1] - x[1]));
      m = Math.max(m, b);
    }
    return m;
  };
  return Math.max(one(p, q), one(q, p));
};

const items = [];
const totals = { before: 0, after: 0, cells: 0 };
for (const [file, famsA] of A) {
  const famsB = B.get(file);
  if (!famsB) continue;
  for (const fa of famsA) {
    const fb = famsB.find((f) => f.label === fa.label);
    if (!fb) continue;
    for (const ca of fa.cells) {
      const cb = fb.cells.find((c) => c.size === ca.size);
      totals.cells++;
      if (closed(ca)) totals.before++;
      if (closed(cb)) totals.after++;
      let kind = null;
      let mm = 0;
      if (closed(ca) && !closed(cb)) kind = 'loss';
      else if (!closed(ca) && closed(cb)) kind = 'gain';
      else if (closed(ca) && closed(cb)) {
        mm = moved(ca.outer, cb.outer);
        if (mm > MOVED_MM) kind = 'moved';
      } else if ((ca.outcome ?? '-') !== (cb?.outcome ?? '-')) kind = 'changed';
      if (kind) items.push({ file, piece: fa.label, size: ca.size, kind, mm, ca, cb, fa, fb });
    }
  }
}
const rank = { loss: 0, moved: 1, changed: 2, gain: 3 };
items.sort((x, y) => rank[x.kind] - rank[y.kind] || y.mm - x.mm);

const W = 640;
const H = 640;
const draw = (it, png) => {
  const cv = createCanvas(W * 2, H + 30);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  // shared bounds: the cell's own lines in both runs (+ its neighbours for context)
  const own = [lineOf(it.ca), lineOf(it.cb)].flat();
  const ctx = [...it.fa.cells, ...it.fb.cells].flatMap(lineOf);
  const pts = own.length ? [...own, ...ctx] : ctx;
  if (!pts.length) return false;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((W - 40) / (x1 - x0 || 1), (H - 70) / (y1 - y0 || 1));
  const panel = (ox, fam, cell, title) => {
    const T = ([x, y]) => [ox + 20 + (x - x0) * k, 50 + (y1 - y) * k];
    const path = (line, close) => {
      g.beginPath();
      line.forEach((p, i) => (i ? g.lineTo(...T(p)) : g.moveTo(...T(p))));
      if (close) g.closePath();
      g.stroke();
    };
    for (const c of fam.cells) {
      if (c.size === cell?.size) continue;
      g.strokeStyle = '#ccc';
      g.lineWidth = 1;
      g.setLineDash(closed(c) ? [] : [2, 3]);
      if (lineOf(c).length) path(lineOf(c), closed(c));
    }
    g.setLineDash([]);
    if (closed(cell)) {
      g.strokeStyle = '#090';
      g.lineWidth = 2.5;
      path(cell.outer, true);
    } else if (cell) {
      g.strokeStyle = '#d00';
      g.lineWidth = 2;
      g.setLineDash([7, 5]);
      if (cell.pred?.length > 1) path(cell.pred, false);
      g.setLineDash([]);
      if (cell.leakAt) {
        const [cx, cy] = T(cell.leakAt);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cx - 9, cy - 9);
        g.lineTo(cx + 9, cy + 9);
        g.moveTo(cx + 9, cy - 9);
        g.lineTo(cx - 9, cy + 9);
        g.stroke();
      }
    }
    g.fillStyle = '#000';
    g.font = 'bold 16px sans-serif';
    g.fillText(title, ox + 12, 22);
    g.font = '12px sans-serif';
    const why = cell && !closed(cell) ? String(cell.refusal ?? cell.outcome ?? '-').slice(0, 95) : '';
    g.fillText(why, ox + 12, 40);
  };
  panel(0, it.fa, it.ca, `ДО: ${it.ca?.outcome ?? '-'}`);
  panel(W, it.fb, it.cb, `ПОСЛЕ: ${it.cb?.outcome ?? '-'}`);
  g.strokeStyle = '#888';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(W, 0);
  g.lineTo(W, H + 30);
  g.stroke();
  g.fillStyle = '#000';
  g.font = '13px sans-serif';
  g.fillText(
    `${it.kind.toUpperCase()}${it.kind === 'moved' ? ` ${it.mm.toFixed(1)} mm` : ''} · ${it.file.slice(0, 60)} · ${it.piece} · ${it.size}`,
    12,
    H + 20,
  );
  writeFileSync(png, cv.toBuffer('image/png'));
  return true;
};

const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const index = [];
items.slice(0, MAX).forEach((it, i) => {
  const png = `${String(i + 1).padStart(3, '0')}-${it.kind}-${slug(it.file)}-${slug(it.piece)}-${slug(it.size)}.png`;
  const ok = draw(it, resolve(OUT, png));
  index.push({
    file: it.file,
    piece: it.piece,
    size: it.size,
    kind: it.kind,
    movedMm: it.kind === 'moved' ? +it.mm.toFixed(2) : undefined,
    before: it.ca?.outcome ?? '-',
    after: it.cb?.outcome ?? '-',
    refusalBefore: closed(it.ca) ? undefined : it.ca?.refusal,
    refusalAfter: closed(it.cb) ? undefined : it.cb?.refusal,
    png: ok ? png : null,
  });
});
const count = (k) => items.filter((x) => x.kind === k).length;
const summary = {
  name,
  before: resolve(beforeDir),
  after: resolve(afterDir),
  created: new Date().toISOString(),
  totals: { ...totals, loss: count('loss'), gain: count('gain'), moved: count('moved'), changed: count('changed') },
  shown: index.length,
  items: index,
};
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(summary, null, 1));
writeFileSync(
  resolve(OUT, 'index.md'),
  [
    `# ${name}`,
    '',
    `before \`${summary.before}\` → after \`${summary.after}\``,
    '',
    `closed ${totals.before} → ${totals.after} of ${totals.cells} · loss ${count('loss')} · gain ${count('gain')} · moved ${count('moved')} · changed ${count('changed')}`,
    '',
    '| # | kind | file | piece | size | before → after | picture |',
    '|---|---|---|---|---|---|---|',
    ...index.map(
      (x, i) =>
        `| ${i + 1} | ${x.kind}${x.movedMm ? ` ${x.movedMm} mm` : ''} | ${x.file.slice(0, 40)} | ${x.piece} | ${x.size} | ${x.before} → ${x.after} | ${x.png ? `[png](${x.png})` : '-'} |`,
    ),
    '',
  ].join('\n'),
);
console.log(
  `${OUT}: closed ${totals.before} → ${totals.after} · loss ${count('loss')} · gain ${count('gain')} · moved ${count('moved')} · changed ${count('changed')} · ${index.length} pictures`,
);
