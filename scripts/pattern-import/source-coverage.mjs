// Node with Map.groupBy. Inputs are fixed native captures from automatic-gap-replay.mjs.
// node scripts/pattern-import/source-coverage.mjs <capture-dir> <set40.txt> <holdout40.txt> <out.json>
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';

const scripts = dirname(fileURLToPath(import.meta.url));
const code = await build({
  stdin: {
    contents: [
      "export {bboxOf,dist,pointInPoly,signedArea} from './pieces/geom';",
      "export {selfIntersects} from './pieces/gfit/checks';",
      "export {readLegendPolygons} from './pieces/legend-polygons';",
      "export {readPrintedCuts} from './pieces/printed-cut-ranges';",
      "export {samePrintedCurve} from './pieces/printed-cut-curves';",
      "export {keyedDashLoop} from './pieces/keyed-dash-loop';",
      "export {pageMarginIds} from './chains/classify';",
    ].join('\n'),
    resolveDir: resolve(scripts, '../../src/lib/pattern-import'),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const {
  bboxOf,
  dist,
  pointInPoly,
  signedArea,
  selfIntersects,
  readLegendPolygons,
  readPrintedCuts,
  samePrintedCurve,
  keyedDashLoop,
  pageMarginIds,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(code.outputFiles[0].contents).toString('base64')
);

const kinds = ['fullPath', 'compositeCycle', 'sharedGroup', 'competing', 'insufficient'];
const counts = () => Object.fromEntries(kinds.map((kind) => [kind, 0]));
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const list = (path) =>
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'))
    .map((s) => basename(s).replace(/\.pdf$/i, ''));
const cellKey = (seed, rank) => seed + '/' + rank;

// Collect endpoint pairs with a single reciprocal mate. A branch or a dangling endpoint
// invalidates that entire traversal. At 0.05 mm only PDF-coordinate coincidence is admitted.
function endpointCycles(chains) {
  const eps = 0.05,
    ends = [],
    bins = new Map();
  for (const ch of chains) {
    const pts = ch.pts;
    if (ch.closed || pts.length < 2 || ch.lengthMm <= 2 * eps) continue;
    for (const [side, p] of [
      [0, pts[0]],
      [1, pts.at(-1)],
    ]) {
      const key = Math.floor(p.x / eps) + ',' + Math.floor(p.y / eps);
      const index = ends.push({ ch, side, p }) - 1;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(index);
    }
  }
  const mates = ends.map(({ ch, p }) => {
    const x = Math.floor(p.x / eps),
      y = Math.floor(p.y / eps),
      hits = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const k of bins.get(x + i + ',' + (y + j)) ?? [])
          if (ends[k].ch !== ch && dist(ends[k].p, p) <= eps) hits.push(k);
    return hits.length === 1 ? hits[0] : -1;
  });
  const seen = new Set(),
    cycles = [];
  for (let start = 0; start < ends.length; start += 2) {
    if (seen.has(ends[start].ch)) continue;
    let k = start;
    const path = [],
      pts = [];
    while (k >= 0 && !seen.has(ends[k].ch)) {
      const { ch, side } = ends[k];
      seen.add(ch);
      path.push(ch);
      pts.push(...(side ? [...ch.pts].reverse() : ch.pts));
      const far = k ^ 1,
        next = mates[far];
      k = next >= 0 && mates[next] === far ? next : -1;
    }
    if (k === start && path.length >= 2)
      cycles.push({ outer: pts, paths: path.flatMap((ch) => ch.ranges.map((r) => r.path)) });
  }
  return cycles;
}

function audit(s, native, recordedFamilies) {
  if (recordedFamilies) {
    const families = new Map(s.families.map((f) => [f.seed, f]));
    // The actual wizard may keep a subset of ranks after structural edits. Use its
    // exported row identities and outcomes, retaining full-precision native geometry.
    s.families = recordedFamilies.map((row) => {
      const family = families.get(row.seed);
      if (!family) throw new Error('No native geometry for exported seed ' + row.seed);
      const bySize = new Map(family.candidates.map((c) => [s.run.sizes[c.rank]?.label, c]));
      return {
        ...family,
        candidates: row.cells.map((cell) => {
          const c = bySize.get(cell.size);
          if (!c) throw new Error('Missing exported rank ' + cell.size + ' in seed ' + row.seed);
          if (c.outcome === cell.outcome) return c;
          return {
            ...c,
            outcome: cell.outcome,
            outer: (cell.outer ?? []).map(([x, y]) => ({ x, y })),
          };
        }),
      };
    });
  }
  const open = s.families.flatMap((f) =>
    f.candidates.filter((c) => c.outcome !== 'closed').map((c) => ({ seed: f.seed, c })),
  );
  const initial = s.families.flatMap((f) => f.candidates);
  if (
    open.length !== native.exportedCells - native.closed ||
    initial.length !== native.exportedCells
  )
    throw new Error('Captured candidates differ from the native outcome totals');
  if (!open.length) return [];
  const card = s.run.sizes.map((z) => z.label),
    candidates = new Map(s.families.map((f) => [f.seed, f.candidates]));
  const data = { ...s.sheet, ...s.set, seeds: s.seeds };
  const paths = new Map(s.sheet.paths.map((p) => [p.id, p])),
    lookup = new Map(s.seeds.map((q) => [q.id, q]));
  const excluded = new Set([...s.walls.exclude, ...pageMarginIds(s.set.chains, s.sheet.poses)]);
  const rejectedPaths = new Set(
    [...excluded].flatMap((id) => s.set.chains[id]?.ranges.map((r) => r.path) ?? []),
  );
  const cells = new Map(open.map(({ seed, c }) => [cellKey(seed, c.rank), []]));
  const byRank = Map.groupBy(open, ({ c }) => c.rank);
  function attach(seed, rank, kind, outer, sourceIds, note) {
    const key = cellKey(seed, rank),
      found = cells.get(key);
    if (
      !found ||
      outer.length < 3 ||
      sourceIds.some((id) => !paths.has(id) || rejectedPaths.has(id))
    )
      return;
    const p = lookup.get(seed)?.at;
    if (
      !p ||
      !pointInPoly(p, outer) ||
      s.seeds.some((q) => q.id !== seed && pointInPoly(q.at, outer))
    )
      return;
    const area = Math.abs(signedArea(outer));
    if (!area || selfIntersects(outer)) return;
    const ids = [...new Set(sourceIds)].sort((a, b) => a - b);
    if (
      !ids.length ||
      found.some(
        (f) =>
          f.kind === kind && ids.length === f.paths.length && ids.every((v, i) => v === f.paths[i]),
      )
    )
      return;
    found.push({ kind, outer, area, paths: ids, note });
  }

  const groups = [...readPrintedCuts(data, card), ...readLegendPolygons(data, card, candidates)];
  for (const group of groups)
    for (const g of group) {
      if (g.polygonSource?.confirmationPaths?.some((id) => rejectedPaths.has(id))) continue;
      for (let rank = g.lo; rank <= g.hi; rank++) {
        const source = g.polygonSource;
        const shared = source ? source.reference !== card[rank] : g.lo < g.hi;
        attach(g.seed, rank, shared ? 'sharedGroup' : 'compositeCycle', g.outer, g.paths, {
          rule: source ? 'legend-polygon' : 'printed-range',
          range: [card[g.lo], card[g.hi]],
          reference: source?.reference,
          confirmationPaths: source?.confirmationPaths,
        });
      }
    }
  const stamps = new Map(s.sheet.styles.map((st) => [st.id, st]));
  const roles = new Map();
  for (const row of s.set.classes)
    for (const id of row.chains) {
      if (!roles.has(id)) roles.set(id, new Set());
      roles.get(id).add(row.role === 'size' ? row.sizeLabel : row.role);
    }
  for (const [rank, rows] of byRank) {
    const label = card[rank];
    const pens = s.set.classes.filter(
      (g) =>
        g.role === 'size' &&
        g.sizeLabel === label &&
        g.evidence.some(
          (e) =>
            e.kind === 'legend-sample' && e.label === label && !e.nestingOnly && !e.alike.length,
        ),
    );
    const ids = new Set(pens.flatMap((g) => g.chains));
    const own = [...ids]
      .filter((id) => !excluded.has(id) && roles.get(id)?.size === 1)
      .map((id) => s.set.chains[id]);
    const ownerPaths = new Set(own.flatMap((ch) => ch.ranges.map((r) => r.path)));
    const conflicts = new Set(
      s.set.classes
        .filter((row) => row.role !== 'size' || row.sizeLabel !== label)
        .flatMap((row) => row.chains)
        .flatMap((id) => s.set.chains[id].ranges.map((r) => r.path)),
    );
    const traces = [];
    const possible = s.set.classes.filter((g) => g.role === 'size' && g.sizeLabel === label);
    const assigned = [...new Set(possible.flatMap((g) => g.chains))]
      .filter((id) => !excluded.has(id))
      .map((id) => s.set.chains[id]);
    const certainIds = new Set(own.map((ch) => ch.id));
    const byPath = Map.groupBy(
      assigned.flatMap((ch) => ch.ranges.map((r) => ({ ...r, chain: ch.id }))),
      (r) => r.path,
    );
    for (const [id, ranges] of byPath) {
      const p = paths.get(id);
      if (
        !p ||
        p.background ||
        stamps.get(p.style)?.fill ||
        p.pts.length < 3 ||
        (!p.closed && dist(p.pts[0], p.pts.at(-1)) > 0.05)
      )
        continue;
      const end = p.closed ? p.pts.length : p.pts.length - 1;
      let covered = 0;
      for (const r of ranges.sort((a, b) => a.from - b.from)) {
        if (r.from > covered) break;
        covered = Math.max(covered, r.to);
      }
      if (covered < end) continue;
      const certain = ranges.every((r) => certainIds.has(r.chain)) && !conflicts.has(id);
      traces.push({
        kind: certain ? 'fullPath' : 'uncertainPen',
        outer: p.pts,
        paths: [id],
        rule: 'complete-source-path',
      });
    }
    for (const ch of assigned) {
      if (ch.ranges.length > 1 && (ch.closed || dist(ch.pts[0], ch.pts.at(-1)) <= 0.05))
        traces.push({
          kind: certainIds.has(ch.id) ? 'compositeCycle' : 'uncertainPen',
          outer: ch.pts,
          paths: ch.ranges.map((r) => r.path),
          rule: 'source-chain',
        });
    }
    for (const cycle of endpointCycles(own))
      traces.push({ ...cycle, kind: 'compositeCycle', rule: 'reciprocal-endpoints' });
    for (const tr of traces) {
      if (tr.paths.some((id) => conflicts.has(id))) tr.kind = 'uncertainPen';
      const box = bboxOf(tr.outer);
      for (const { seed } of rows) {
        const p = lookup.get(seed)?.at;
        if (p && p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY)
          attach(seed, rank, tr.kind, tr.outer, tr.paths, { rule: tr.rule });
      }
    }
    for (const pen of pens) {
      const dash = pen.evidence.find((e) => e.kind === 'declared-dash')?.dash;
      if (!dash || dash.length < 4 || dash.some((v) => v <= 0)) continue;
      if (
        s.set.classes.some(
          (x) =>
            x.role === 'size' &&
            x.sizeLabel !== label &&
            x.evidence.some(
              (e) =>
                e.kind === 'declared-dash' &&
                e.dash.length === dash.length &&
                e.dash.every((v, i) => Math.abs(v - dash[i]) <= 0.12 * dash[i]),
            ),
        )
      )
        continue;
      const st = pen.chains
        .map((i) => stamps.get(s.set.chains[i].style))
        .find((v) => v?.dash?.length === dash.length);
      if (!st) continue;
      for (const { seed } of rows) {
        const q = lookup.get(seed);
        if (!q) continue;
        const cycle = keyedDashLoop(s.sheet, dash, st, q.at);
        if (!cycle) continue;
        const ids = [...cycle.paths];
        if (
          ids.some((id) => conflicts.has(id)) ||
          ids.filter((id) => ownerPaths.has(id)).length < 3
        )
          continue;
        attach(seed, rank, 'compositeCycle', cycle.pts, ids, { rule: 'legend-dash-corners' });
      }
    }
  }
  return open.map(({ seed, c }) => {
    const found = cells.get(cellKey(seed, c.rank));
    const rings = [];
    for (const f of found)
      if (!rings.some((r) => samePrintedCurve(r.outer, f.outer))) rings.push(f);
    const kind =
      rings.length > 1
        ? 'competing'
        : kinds.find((k) => found.some((f) => f.kind === k)) ?? 'insufficient';
    return {
      seed,
      name: lookup.get(seed)?.text?.text ?? null,
      size: card[c.rank],
      outcome: c.outcome,
      kind,
      evidence: found.map(({ outer, ...f }) => ({
        ...f,
        pages: [...new Set(f.paths.map((id) => paths.get(id).src.page))],
        bbox: bboxOf(outer),
      })),
    };
  });
}

function writeRollup(files, output) {
  const rows = [['set', 'pdf', 'scope', 'seed', 'piece', 'stop', 'open', ...kinds]];
  for (const f of files) {
    rows.push([
      f.group,
      f.id,
      'document',
      '',
      '',
      f.stop,
      f.rows.length,
      ...kinds.map((k) => f.tally[k]),
    ]);
    for (const [seed, cells] of Map.groupBy(f.rows, (c) => c.seed)) {
      const tally = counts();
      for (const c of cells) tally[c.kind]++;
      rows.push([
        f.group,
        f.id,
        'piece',
        seed,
        cells[0].name ?? '',
        f.stop,
        cells.length,
        ...kinds.map((k) => tally[k]),
      ]);
    }
  }
  const csv = (v) =>
    /["\r\n,]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
  writeFileSync(output, rows.map((row) => row.map(csv).join(',')).join('\n') + '\n');
}
if (process.argv[2] === '--csv') {
  writeRollup(json(process.argv[3]), process.argv[4]);
  process.exit(0);
}

const [capture, set, holdout, output] = process.argv.slice(2);
if (!output) throw new Error('Expected capture, set40 list, holdout40 list, output JSON');
const docs = json(join(capture, 'documents.json')),
  files = [];
const input = [
  ...list(set).map((id) => ({ id, group: 'set40' })),
  ...list(holdout).map((id) => ({ id, group: 'holdout40' })),
];
if (
  input.length !== docs.length ||
  new Set(input.map((x) => x.id)).size !== docs.length ||
  input.some((x) => !docs.includes(x.id))
)
  throw new Error('Corpus membership mismatch');
for (const { id, group } of input) {
  const dir = join(capture, id),
    native = json(join(dir, 'native.json')),
    path = join(dir, 'session.v8.gz');
  const captured = existsSync(path);
  if (!captured && native.exportedCells) throw new Error('Missing state for ' + id);
  const recorded = join(dir, 'cells.json');
  const rows = captured
    ? audit(
        deserialize(gunzipSync(readFileSync(path))),
        native,
        existsSync(recorded) ? json(recorded) : null,
      )
    : [];
  const tally = counts();
  for (const r of rows) tally[r.kind]++;
  files.push({
    id,
    group,
    captured,
    stop: native.stop?.step ?? native.verdict,
    closed: native.closed,
    total: native.exportedCells,
    tally,
    rows,
  });
  console.error(id, rows.length, JSON.stringify(tally));
}
writeFileSync(output, JSON.stringify(files, null, 2));
