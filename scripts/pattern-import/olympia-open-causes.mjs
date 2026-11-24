// Classify preserved source evidence on the frozen Olympia corpus.
// node scripts/pattern-import/olympia-open-causes.mjs <olympia-corpus> <later-corpus> <out.csv> <out.json>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

const [corpus, later, csvPath, jsonPath] = process.argv.slice(2);
if (!jsonPath) throw new Error('Expected olympia corpus, later corpus, csv, json');

const repo = new URL('../..', import.meta.url).pathname;
const listIds = (name) =>
  readFileSync(join(repo, 'scripts/pattern-import', name), 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'))
    .map((s) => basename(s).replace(/\.pdf$/i, ''));
const setOf = new Map([
  ...listIds('set40.txt').map((id) => [id, 'set40']),
  ...listIds('holdout40.txt').map((id) => [id, 'holdout40']),
]);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const polyLen = (pts, closed) => {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) n += dist(pts[pts.length - 1], pts[0]);
  return n;
};
const signedArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return Math.abs(a / 2);
};
const pointInPoly = (p, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
};
const segHit = (a, b, c, d) => {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  return true;
};
const distSeg = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u));
};
const minLine = (pts, p) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distSeg(p, pts[i - 1], pts[i]));
  return d;
};
const bbox = (pts) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};
const spans = (box) => Math.max(box.maxX - box.minX, box.maxY - box.minY);
const nearBox = (box, p, pad) =>
  p.x >= box.minX - pad && p.x <= box.maxX + pad && p.y >= box.minY - pad && p.y <= box.maxY + pad;
const crosses = (pts) => {
  const n = pts.length;
  if (n < 4) return false;
  if (n > 4000) return null;
  const cell = 8;
  const bins = new Map();
  const put = (i, a, b) => {
    const x0 = Math.floor(Math.min(a.x, b.x) / cell);
    const x1 = Math.floor(Math.max(a.x, b.x) / cell);
    const y0 = Math.floor(Math.min(a.y, b.y) / cell);
    const y1 = Math.floor(Math.max(a.y, b.y) / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = x + ',' + y;
        const bin = bins.get(k);
        if (bin) bin.push(i);
        else bins.set(k, [i]);
      }
  };
  const seg = (i) => (i === n - 1 ? [pts[n - 1], pts[0]] : [pts[i], pts[i + 1]]);
  const last = n - (dist(pts[0], pts[n - 1]) < 0.05 ? 2 : 1);
  for (let i = 0; i <= last; i++) put(i, ...seg(i));
  const seen = new Set();
  for (const bin of bins.values()) {
    for (let a = 0; a < bin.length; a++)
      for (let b = a + 1; b < bin.length; b++) {
        const i = bin[a];
        const j = bin[b];
        if (Math.abs(i - j) <= 1 || (i === 0 && j === last) || (j === 0 && i === last)) continue;
        const key = i < j ? i + ',' + j : j + ',' + i;
        if (seen.has(key)) continue;
        seen.add(key);
        if (segHit(...seg(i), ...seg(j))) return true;
      }
  }
  return false;
};
const sameRing = (a, b) => {
  if (Math.abs(polyLen(a, true) - polyLen(b, true)) > 1.5) return false;
  let worst = 0;
  const step = Math.max(1, Math.floor(a.length / 24));
  for (let i = 0; i < a.length; i += step) {
    let d = Infinity;
    const p = a[i];
    for (let j = 1; j < b.length; j++) d = Math.min(d, distSeg(p, b[j - 1], b[j]));
    if (d > worst) worst = d;
    if (worst > 0.8) return false;
  }
  return true;
};
const heading = (pts, atStart) => {
  const origin = atStart ? pts[0] : pts[pts.length - 1];
  let acc = 0;
  if (atStart) {
    for (let i = 1; i < pts.length; i++) {
      acc += dist(pts[i - 1], pts[i]);
      if (acc >= 3 || i === pts.length - 1) {
        const v = { x: origin.x - pts[i].x, y: origin.y - pts[i].y };
        const l = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / l, y: v.y / l };
      }
    }
  } else {
    for (let i = pts.length - 2; i >= 0; i--) {
      acc += dist(pts[i + 1], pts[i]);
      if (acc >= 3 || i === 0) {
        const v = { x: origin.x - pts[i].x, y: origin.y - pts[i].y };
        const l = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / l, y: v.y / l };
      }
    }
  }
  return { x: 0, y: 0 };
};
const faces = (a, b, dirA, dirB) => {
  const g = { x: b.x - a.x, y: b.y - a.y };
  const l = Math.hypot(g.x, g.y) || 1;
  return (dirA.x * g.x + dirA.y * g.y) / l > 0.5 && (dirB.x * -g.x + dirB.y * -g.y) / l > 0.5;
};
const apply = (t, x, y) => ({ x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f });
const edgeDist = (corners, p) => {
  let d = Infinity;
  for (let i = 0; i < 4; i++) d = Math.min(d, distSeg(p, corners[i], corners[(i + 1) % 4]));
  return d;
};
const ptsOf = (raw) => (raw ?? []).map(([x, y]) => ({ x, y }));
const scaleOk = (length, predLen) =>
  predLen < 80 || (length >= 0.5 * predLen && length <= 2.2 * predLen);
const outlineOk = (pts) => {
  const box = bbox(pts);
  return spans(box) >= 25 && signedArea(pts) >= 200 && crosses(pts) === false;
};

const FEATURES = [
  'pen-path',
  'stroke-chain',
  'tile-continue',
  'shared-line',
  'angle-variants',
  'material-boundary',
];

function classify(session, openCells) {
  const { sheet, set, seeds } = session;
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  const styles = new Map(sheet.styles.map((st) => [st.id, st]));
  const chains = new Map(set.chains.map((ch) => [ch.id, ch]));
  const seedAt = new Map(seeds.map((q) => [q.id, q.at]));
  const seedPts = seeds.map((q) => q.at);
  const roles = new Map();
  for (const row of set.classes)
    for (const id of row.chains) {
      if (!roles.has(id)) roles.set(id, new Set());
      roles.get(id).add(row.role === 'size' ? 'size:' + row.sizeLabel : row.role);
    }
  const poses = new Map();
  let posed = 0;
  for (const pose of sheet.poses ?? []) {
    if (pose.row == null || pose.col == null) continue;
    posed++;
    const corners = [
      apply(pose.toSheet, 0, 0),
      apply(pose.toSheet, pose.widthMm, 0),
      apply(pose.toSheet, pose.widthMm, pose.heightMm),
      apply(pose.toSheet, 0, pose.heightMm),
    ];
    poses.set(pose.file + ':' + pose.page, { ...pose, corners });
  }
  const exclusive = (id, label) => {
    const tags = roles.get(id);
    return !!tags && tags.size === 1 && tags.has('size:' + label);
  };
  const stroked = (ch) => {
    const st = styles.get(ch.style);
    return (
      !!st && !st.fill && st.widthMm > 0 && !ch.ranges.some((r) => paths.get(r.path)?.background)
    );
  };
  const pageOf = (ch, atStart) => {
    const range = atStart ? ch.ranges[0] : ch.ranges[ch.ranges.length - 1];
    return paths.get(range?.path)?.src;
  };
  const citePath = (p) => ({
    path: p.id,
    page: p.src.page + 1,
    op: p.src.op,
    text: 'path ' + p.id + ' page ' + (p.src.page + 1) + ' op ' + p.src.op,
  });
  const citeChain = (ch) => {
    const src = pageOf(ch, true);
    const path = src ? paths.get(ch.ranges[0].path) : null;
    return {
      chain: ch.id,
      path: path?.id ?? '',
      page: src ? src.page + 1 : '',
      op: src ? src.op : '',
      text:
        'chain ' +
        ch.id +
        (path ? ' path ' + path.id + ' page ' + (src.page + 1) + ' op ' + src.op : ''),
    };
  };
  const containsOnly = (pts, seed) => {
    if (!pointInPoly(seed, pts)) return false;
    let n = 0;
    for (const p of seedPts) if (pointInPoly(p, pts)) n++;
    return n === 1;
  };

  const byLabel = new Map();
  for (const cell of openCells) {
    if (!byLabel.has(cell.size)) byLabel.set(cell.size, []);
    byLabel.get(cell.size).push(cell);
  }

  const shared = [];
  for (const ch of set.chains) {
    const tags = roles.get(ch.id);
    if (!tags || ch.lengthMm < 15 || ch.pts.length < 2) continue;
    const sizes = [...tags].filter((t) => t.startsWith('size:')).map((t) => t.slice(5));
    const multi =
      tags.has('common') ||
      sizes.length >= 2 ||
      (set.bundles ?? []).some((b) => b.endsOn?.[0] === ch.id || b.endsOn?.[1] === ch.id);
    if (multi) shared.push(ch);
  }
  const sharedHits = new Map();
  const buckets = new Map();
  const putSample = (ch, x, y) => {
    const k = Math.floor(x / 3) + ',' + Math.floor(y / 3);
    const bin = buckets.get(k);
    if (bin) bin.push(ch);
    else buckets.set(k, [ch]);
  };
  for (const ch of shared)
    for (let i = 1; i < ch.pts.length; i++) {
      const a = ch.pts[i - 1];
      const b = ch.pts[i];
      const n = Math.max(1, Math.ceil(dist(a, b) / 1.5));
      for (let k = 0; k <= n; k++)
        putSample(ch, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    }
  const nearShared = (p) => {
    const found = new Set();
    const x = Math.floor(p.x / 3);
    const y = Math.floor(p.y / 3);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const ch of buckets.get(x + i + ',' + (y + j)) ?? []) {
          if (found.has(ch.id)) continue;
          if (
            nearBox(bbox(ch.pts), p, 2) &&
            ch.pts.some((q, n) => n && distSeg(p, ch.pts[n - 1], q) <= 1.2)
          )
            found.add(ch.id);
        }
    return found;
  };
  const parked = new Map();
  for (const ch of set.chains) {
    const tags = roles.get(ch.id);
    if (!tags || tags.size !== 1 || ![...tags][0].startsWith('size:')) continue;
    const label = [...tags][0].slice(5);
    for (const p of [ch.pts[0], ch.pts[ch.pts.length - 1]])
      for (const id of nearShared(p)) {
        if (!parked.has(id)) parked.set(id, new Set());
        parked.get(id).add(label);
      }
  }
  for (const ch of shared) if ((parked.get(ch.id)?.size ?? 0) >= 3) sharedHits.set(ch.id, ch);

  const out = new Map();
  for (const [label, cells] of byLabel) {
    const certain = set.classes.filter(
      (g) =>
        g.role === 'size' &&
        g.sizeLabel === label &&
        g.evidence.some(
          (e) =>
            e.kind === 'legend-sample' && e.label === label && !e.nestingOnly && !e.alike?.length,
        ),
    );
    const certainIds = new Set(
      certain.flatMap((g) => g.chains).filter((id) => exclusive(id, label)),
    );
    const own = [...certainIds].map((id) => chains.get(id)).filter((ch) => ch && stroked(ch));
    const sizeChains = set.chains.filter((ch) => exclusive(ch.id, label) && stroked(ch));
    const covered = new Map();
    for (const ch of own)
      for (const range of ch.ranges) {
        if (!covered.has(range.path)) covered.set(range.path, []);
        covered.get(range.path).push(range);
      }
    const full = [];
    for (const [id, ranges] of covered) {
      const p = paths.get(id);
      const st = p && styles.get(p.style);
      if (!p || p.background || !st || st.fill || st.widthMm <= 0 || p.pts.length < 4) continue;
      if (dist(p.pts[0], p.pts[p.pts.length - 1]) > 0.05) continue;
      const end = p.closed ? p.pts.length : p.pts.length - 1;
      let at = 0;
      for (const range of ranges.sort((a, b) => a.from - b.from)) {
        if (range.from > at) break;
        at = Math.max(at, range.to);
      }
      if (at < end || !outlineOk(p.pts)) continue;
      if (!full.some((q) => sameRing(q.pts, p.pts))) full.push(p);
    }
    const loops = [];
    for (const ch of own) {
      if (ch.ranges.length < 2 || ch.lengthMm < 40) continue;
      const closed = ch.closed || dist(ch.pts[0], ch.pts[ch.pts.length - 1]) <= 0.5;
      if (!closed || !outlineOk(ch.pts)) continue;
      const ids = [...new Set(ch.ranges.map((r) => r.path))];
      if (ids.length === 1 && full.some((p) => p.id === ids[0])) continue;
      if (!loops.some((q) => sameRing(q.pts, ch.pts))) loops.push(ch);
    }
    const tile = [];
    const ends = [];
    for (const ch of sizeChains) {
      if (ch.pts.length < 2 || ch.lengthMm < 8) continue;
      for (const atStart of [true, false]) {
        const src = pageOf(ch, atStart);
        const pose = src && poses.get(src.file + ':' + src.page);
        const p = atStart ? ch.pts[0] : ch.pts[ch.pts.length - 1];
        if (!pose || edgeDist(pose.corners, p) > 4) continue;
        ends.push({ ch, p, pose, dir: heading(ch.pts, atStart), src });
      }
    }
    for (let i = 0; i < ends.length; i++)
      for (let j = i + 1; j < ends.length; j++) {
        const a = ends[i];
        const b = ends[j];
        if (a.ch === b.ch || a.src.page === b.src.page) continue;
        if (Math.abs(a.pose.row - b.pose.row) + Math.abs(a.pose.col - b.pose.col) !== 1) continue;
        if (dist(a.p, b.p) > 12 || !faces(a.p, b.p, a.dir, b.dir)) continue;
        const key = [a.ch.id, b.ch.id].sort((m, n) => m - n).join('+');
        if (tile.some((t) => t.key === key)) continue;
        tile.push({ key, a, b });
      }
    const corners = [];
    for (const wall of set.cornerWalls ?? []) {
      if (!wall.own?.length || !wall.own.every((id) => exclusive(id, label)) || !wall.ends?.length)
        continue;
      const key = [...wall.ends].sort().join('|');
      let group = corners.find((g) => g.key === key);
      if (!group) corners.push((group = { key, walls: [] }));
      group.walls.push(wall);
    }
    const angles = corners.filter((g) => {
      if (g.walls.length < 2) return false;
      const far = g.walls.map((w) => w.pts[w.pts.length - 1]);
      return far.some((p) => dist(p, far[0]) > 1);
    });
    const material = [];
    const layerHit = (p) => {
      const layer = styles.get(p.style)?.layer ?? '';
      return /lining|interlin|contrast|fabric/i.test(layer);
    };
    for (const p of [...(sheet.materialMarks ?? []), ...sheet.paths.filter(layerHit)]) {
      if (p.background || p.pts.length < 4) continue;
      if (!(p.closed || dist(p.pts[0], p.pts[p.pts.length - 1]) <= 0.05)) continue;
      if (!outlineOk(p.pts) || !p.src) continue;
      if (!material.some((q) => sameRing(q.pts, p.pts))) material.push(p);
    }

    for (const cell of cells) {
      const seed = seedAt.get(cell.seed);
      const pred = ptsOf(cell.pred);
      const predLen = polyLen(pred, false);
      const leak = cell.leakAt ? { x: cell.leakAt[0], y: cell.leakAt[1] } : null;
      const nearHole = (p) => !!leak && dist(leak, p) <= 8;
      const hits = [];
      let rings = [];
      if (seed) {
        const pens = full.filter(
          (p) =>
            containsOnly(p.pts, seed) &&
            scaleOk(polyLen(p.pts, true), predLen) &&
            (!leak || minLine(p.pts, leak) <= 5),
        );
        if (pens.length === 1) hits.push({ feature: 'pen-path', cite: citePath(pens[0]) });
        else if (pens.length > 1)
          hits.push({
            feature: 'pen-path',
            cite: citePath(pens[0]),
            extra: pens.slice(1).map(citePath),
          });
        rings = loops.filter(
          (ch) =>
            containsOnly(ch.pts, seed) &&
            scaleOk(ch.lengthMm, predLen) &&
            (!leak || minLine(ch.pts, leak) <= 5),
        );
        const marks = material.filter((p) => containsOnly(p.pts, seed));
        if (marks.length === 1)
          hits.push({ feature: 'material-boundary', cite: citePath(marks[0]) });
        else if (marks.length > 1)
          hits.push({
            feature: 'material-boundary',
            cite: citePath(marks[0]),
            extra: marks.slice(1).map(citePath),
          });
      }
      if (leak) {
        const added = [];
        for (const ch of sizeChains) {
          if (ch.ranges.length < 2 || ch.lengthMm < 40 || ch.lengthMm > 2000) continue;
          if (minLine(ch.pts, leak) > 3 || rings.some((r) => r.id === ch.id)) continue;
          added.push(ch);
        }
        if (added.length <= 2) rings.push(...added);
      }
      if (rings.length === 1) hits.push({ feature: 'stroke-chain', cite: citeChain(rings[0]) });
      else if (rings.length > 1)
        hits.push({
          feature: 'stroke-chain',
          cite: citeChain(rings[0]),
          extra: rings.slice(1).map(citeChain),
        });
      const joins = tile.filter((t) => nearHole(t.a.p) || nearHole(t.b.p));
      if (joins.length === 1) {
        const t = joins[0];
        const cite = citeChain(t.a.ch);
        cite.text =
          'chain ' +
          t.a.ch.id +
          ' page ' +
          (t.a.src.page + 1) +
          ' op ' +
          t.a.src.op +
          ' + chain ' +
          t.b.ch.id +
          ' page ' +
          (t.b.src.page + 1) +
          ' op ' +
          t.b.src.op;
        cite.page = t.a.src.page + 1;
        cite.op = t.a.src.op;
        cite.chain = t.a.ch.id;
        hits.push({ feature: 'tile-continue', cite });
      } else if (joins.length > 1) {
        const t = joins[0];
        hits.push({
          feature: 'tile-continue',
          cite: {
            ...citeChain(t.a.ch),
            text:
              'chain ' +
              t.a.ch.id +
              ' page ' +
              (t.a.src.page + 1) +
              ' + chain ' +
              t.b.ch.id +
              ' page ' +
              (t.b.src.page + 1),
          },
          extra: joins.slice(1).map((u) => citeChain(u.a.ch)),
        });
      }
      const lines = [...sharedHits.values()].filter(
        (ch) => leak && ch.lengthMm >= 30 && ch.lengthMm <= 800 && minLine(ch.pts, leak) <= 3,
      );
      if (lines.length === 1) hits.push({ feature: 'shared-line', cite: citeChain(lines[0]) });
      else if (lines.length > 1)
        hits.push({
          feature: 'shared-line',
          cite: citeChain(lines[0]),
          extra: lines.slice(1).map(citeChain),
        });
      const variants = angles.filter((g) => g.walls.some((w) => w.pts.some(nearHole)));
      if (variants.length) {
        const wall = variants[0].walls[0];
        const own = chains.get(wall.own[0]);
        const cite = own
          ? citeChain(own)
          : { chain: wall.own[0], path: '', page: '', op: '', text: '' };
        const ids = [...new Set(variants[0].walls.flatMap((w) => w.chains))];
        cite.text =
          'corner own ' +
          wall.own.join('+') +
          ' chains ' +
          ids.join('+') +
          (cite.page ? ' page ' + cite.page + ' op ' + cite.op : '');
        hits.push({
          feature: 'angle-variants',
          cite,
          extra: variants.length > 1 ? [{ text: 'corners ' + variants.length }] : [],
        });
      }
      const ambiguous = hits.length !== 1 || hits[0].extra?.length;
      const hit = hits[0];
      const feature = !hits.length ? 'insufficient' : ambiguous ? 'several' : hit.feature;
      const cites = hits.flatMap((h) => [h.cite, ...(h.extra ?? [])]);
      out.set(cell.seed + '/' + cell.size, {
        feature,
        evidence:
          cites
            .map((c) => (feature === 'several' ? c.text : c.text))
            .filter(Boolean)
            .join('; ') || 'none',
        features: [
          ...new Set(
            hits.map((h) => h.feature + (h.extra?.length ? '×' + (1 + h.extra.length) : '')),
          ),
        ].join('+'),
        path: feature === 'several' ? '' : hit?.cite.path ?? '',
        chain: feature === 'several' ? '' : hit?.cite.chain ?? '',
        page: feature === 'several' ? '' : hit?.cite.page ?? '',
        op: feature === 'several' ? '' : hit?.cite.op ?? '',
        posed,
      });
    }
  }
  return out;
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const dirs = readdirSync(corpus, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const rows = [];
const stops = new Map();
let posedDocs = 0;
for (const id of dirs) {
  const families = readJson(join(corpus, id, 'cells.json'));
  const run = readJson(join(corpus, id, 'run.json'));
  const step = run.stop?.step ?? run.verdict;
  stops.set(step, (stops.get(step) ?? 0) + 1);
  const group = setOf.get(id);
  if (!group) throw new Error('PDF outside set40/holdout40: ' + id);
  const open = [];
  for (const family of families) {
    const n = family.cells.filter((c) => c.outcome !== 'closed').length;
    const order = run.card?.length ? run.card : family.cells.map((c) => c.size);
    const outcome = new Map(family.cells.map((c) => [c.size, c.outcome]));
    for (const cell of family.cells) {
      if (cell.outcome === 'closed') continue;
      const at = order.indexOf(cell.size);
      let lo = '';
      let hi = '';
      if (at >= 0) {
        for (let i = at - 1; i >= 0; i--)
          if (outcome.get(order[i]) === 'closed') {
            lo = order[i];
            break;
          }
        for (let i = at + 1; i < order.length; i++)
          if (outcome.get(order[i]) === 'closed') {
            hi = order[i];
            break;
          }
      }
      open.push({
        set: group,
        pdf: id,
        seed: family.seed,
        piece: family.label ?? '',
        size: cell.size,
        outcome: cell.outcome,
        nearestLo: lo,
        nearestHi: hi,
        stop: step,
        pieceOpen: n,
        large: n >= 5,
        pred: cell.pred,
        leakAt: cell.leakAt,
      });
    }
  }
  if (!open.length) continue;
  const t = Date.now();
  const session = deserialize(gunzipSync(readFileSync(join(corpus, id, 'session.v8.gz'))));
  const found = classify(session, open);
  if ([...found.values()].some((v) => v.posed)) posedDocs++;
  for (const cell of open) {
    const hit = found.get(cell.seed + '/' + cell.size) ?? {
      feature: 'insufficient',
      evidence: 'none',
      features: '',
      path: '',
      chain: '',
      page: '',
      op: '',
    };
    rows.push({ ...cell, ...hit });
  }
  console.error(id, open.length, Math.round((Date.now() - t) / 1000) + 's');
}

const laterRows = new Map();
if (later) {
  for (const id of readdirSync(later, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    const file = join(later, id, 'cells.json');
    let families;
    try {
      families = readJson(file);
    } catch {
      continue;
    }
    for (const family of families)
      for (const cell of family.cells ?? [])
        laterRows.set(id + '\t' + family.seed + '\t' + cell.size, cell.outcome);
  }
}
let laterClosed = 0;
let laterMissing = 0;
const laterPdfs = new Map();
for (const row of rows) {
  const outcome = laterRows.get(row.pdf + '\t' + row.seed + '\t' + row.size);
  if (!outcome) laterMissing++;
  else if (outcome === 'closed') {
    laterClosed++;
    laterPdfs.set(row.pdf, (laterPdfs.get(row.pdf) ?? 0) + 1);
  }
}

const quote = (v) =>
  /[",\r\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
const header = [
  'set',
  'pdf',
  'seed',
  'piece',
  'size',
  'outcome',
  'nearest_closed_lo',
  'nearest_closed_hi',
  'stop',
  'piece_open',
  'large_group',
  'feature',
  'also',
  'path',
  'chain',
  'page',
  'op',
  'evidence',
];
writeFileSync(
  csvPath,
  [
    header,
    ...rows.map((r) =>
      [
        r.set,
        r.pdf,
        r.seed,
        r.piece,
        r.size,
        r.outcome,
        r.nearestLo,
        r.nearestHi,
        r.stop,
        r.pieceOpen,
        r.large ? 1 : 0,
        r.feature,
        r.features,
        r.path,
        r.chain,
        r.page,
        r.op,
        r.evidence,
      ]
        .map(quote)
        .join(','),
    ),
  ].join('\n') + '\n',
);

const tally = (list) => {
  const n = new Map();
  for (const row of list) n.set(row.feature, (n.get(row.feature) ?? 0) + 1);
  return Object.fromEntries(n);
};
const pieces = new Set(rows.map((r) => r.pdf + '\t' + r.seed));
const largePieces = new Set(rows.filter((r) => r.large).map((r) => r.pdf + '\t' + r.seed));
const outcomes = tally(rows.map((r) => ({ feature: r.outcome })));
const byPdf = Map.groupBy(rows, (r) => r.pdf);
const explained = Object.fromEntries([...FEATURES, 'several'].map((f) => [f, []]));
let mixed = 0;
let unresolved = 0;
for (const [pdf, cells] of byPdf) {
  const kinds = new Set(cells.map((c) => c.feature));
  if (kinds.size === 1) {
    const only = [...kinds][0];
    if (only === 'insufficient') unresolved++;
    else explained[only].push(pdf);
  } else mixed++;
}
const verified = (row) => row.page !== '' && row.op !== '' && (row.path !== '' || row.chain !== '');
const featureReport = (name) => {
  const cells = rows.filter((r) => r.feature === name);
  const pdfs = [...Map.groupBy(cells, (r) => r.pdf).entries()]
    .map(([pdf, list]) => ({
      pdf,
      cells: list.length,
      large: list.filter((r) => r.large).length,
      explainsAll: explained[name]?.includes(pdf) ?? false,
    }))
    .sort((a, b) => b.cells - a.cells || b.large - a.large);
  const startPdf = pdfs.find((p) => p.explainsAll) ?? pdfs[0];
  const examples = (startPdf ? cells.filter((r) => r.pdf === startPdf.pdf) : cells)
    .filter((r) => r.large)
    .slice(0, 4)
    .map((r) => ({
      pdf: r.pdf,
      piece: r.piece,
      size: r.size,
      path: r.path,
      chain: r.chain,
      page: r.page,
      op: r.op,
      evidence: r.evidence,
    }));
  return {
    cells: cells.length,
    large: cells.filter((r) => r.large).length,
    verified: cells.filter(verified).length,
    products: explained[name]?.length ?? 0,
    productIds: explained[name] ?? [],
    pdfs: pdfs.slice(0, 8),
    examples,
  };
};
const summary = {
  documents: dirs.length,
  cells: rows.length,
  pieces: pieces.size,
  largePieces: largePieces.size,
  largeCells: rows.filter((r) => r.large).length,
  outcomes,
  stops: Object.fromEntries(stops),
  posedDocs,
  features: Object.fromEntries(
    [...FEATURES, 'several', 'insufficient'].map((name) => [name, featureReport(name)]),
  ),
  products: { explained, mixed, unresolved, withOpen: byPdf.size },
  later: {
    closed: laterClosed,
    missing: laterMissing,
    stillOpen: rows.length - laterClosed - laterMissing,
    pdfs: [...laterPdfs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
  },
};
const expect = { cells: 1246, pieces: 348, largePieces: 81, largeCells: 678 };
for (const [key, value] of Object.entries(expect))
  if (summary[key] !== value) throw new Error(key + ' ' + summary[key] + ' != ' + value);
const assigned = Object.values(summary.features).reduce((n, f) => n + f.cells, 0);
if (assigned !== 1246) throw new Error('feature sum ' + assigned);
writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
console.error(
  JSON.stringify(
    {
      ...summary,
      features: Object.fromEntries(
        Object.entries(summary.features).map(([k, v]) => [
          k,
          { cells: v.cells, large: v.large, verified: v.verified, products: v.products },
        ]),
      ),
    },
    null,
    2,
  ),
);
