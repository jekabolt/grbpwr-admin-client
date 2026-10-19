#!/usr/bin/env node
// `yarn seams:check` — confirmed seams saved on the tech card, lane L2 (client resolver).
// 03-SEAMS-DESIGN.md §2 / §4 / §6 L2, on real patterns: SS26-005 (probe copy) + prod cards 4 / 5 / 6
// (tmp/plans/assembly-3d-doll/prod-data), base size M.
//
// Gates:
//  G1 ROUND TRIP: anchors for every seam the graph reads (chosen + closures), through the wire and
//     back, resolved on the same geometry → 100 % the same edges, by the fast path;
//  G2 ROBUSTNESS: the contours re-exported (start vertex moved ×2, mirrored, mirrored + moved,
//     resampled ×2) → every row resolves to the run where the anchored one went (truth = the
//     perturbation's own point mapping; a side whose edge the new segmentation lengthened or
//     shortened at a moved corner — one contains the other, ±10 % length — is counted and named,
//     not wrong) or is stale in words; 0 wrong re-points;
//  G3 STALENESS: one piece redrawn 5 % bigger → every seam it shares with another piece is stale
//     with words, every other seam resolves to the same edges;
//  G4 DECISIONS (SS26-005): a confirmed seam the matcher does not pick is in graph.chosen (with
//     provenance); a rejected seam is not in chosen and is in rejected with the words; a confirmed
//     closure is in rejected as a closure and no chosen seam (A3 or A4) touches its edges;
//  G5 NEGATIVE CONTROL: the fit threshold broken (fitMax 0.5, no tie margin) → G2 goes red;
//     the drift threshold broken → G3 goes red;
//  G6 NO DECISIONS = NO CHANGE: readSeamGraph / proposeSkeleton without decisions, with an empty
//     decisions object and with decisionsFor([]) give byte-identical JSON on every file.
//
// Usage: node scripts/seams/check.mjs   (SEAMS_PLANS=<tmp/plans dir>, SEAMS_VERBOSE=1)

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `seams-check-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'check-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'error',
  jsx: 'automatic',
  absWorkingDir: resolve(here, '../..'),
});
const mod = await import(pathToFileURL(outfile).href);

const plans = process.env.SEAMS_PLANS ?? resolve(here, '../../../tmp/plans');
const verbose = process.env.SEAMS_VERBOSE === '1';
const prod = resolve(plans, 'assembly-3d-doll/prod-data');
const cards = existsSync(resolve(prod, 'cards.json'))
  ? JSON.parse(await readFile(resolve(prod, 'cards.json'), 'utf8'))
  : {};
const prodFile = (id, purpose) => {
  const dir = resolve(prod, 'dxf');
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((x) => x.startsWith(`card${id}-${purpose}`));
  return f ? resolve(dir, f) : null;
};
const FILES = [
  {
    id: 'ss26',
    label: 'SS26-005 (probe copy)',
    dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
    category: 'shirt',
    card: null,
  },
  { id: 'card4', label: 'prod card 4', dxf: prodFile(4, 'UNSET'), category: 'shirt', card: '4' },
  { id: 'card5', label: 'prod card 5', dxf: prodFile(5, 'UNSET'), category: 'shirt', card: '5' },
  {
    id: 'card6',
    label: 'prod card 6 MAIN',
    dxf: prodFile(6, 'MAIN'),
    category: 'shirt',
    card: '6',
  },
  ...(process.env.SEAMS_EXTRA === '1'
    ? [
        {
          id: 'card8',
          label: 'prod card 8 MAIN (blazer)',
          dxf: prodFile(8, 'MAIN'),
          category: 'jacket-lined',
          card: '8',
        },
        {
          id: 'card7',
          label: 'prod card 7 MAIN (pants)',
          dxf: prodFile(7, 'MAIN'),
          category: 'trousers',
          card: '7',
        },
        {
          id: 'card11',
          label: 'prod card 11 MAIN (pants)',
          dxf: prodFile(11, 'MAIN'),
          category: 'trousers',
          card: '11',
        },
      ]
    : []),
];
for (const f of FILES)
  if (!f.dxf || !existsSync(f.dxf)) {
    console.log(`FAIL: ${f.label} not found (${f.dxf})`);
    process.exit(1);
  }

const quiet = async (fn) => {
  const w = console.warn;
  const l = console.log;
  console.warn = () => {};
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.warn = w;
    console.log = l;
  }
};
let bad = 0;
const gate = (ok, msg) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) bad++;
};
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '—');

const loaded = [];
for (const f of FILES) {
  const buf = await readFile(f.dxf);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const l = await quiet(() =>
    mod.load(bytes, f.category, f.card ? cards[f.card]?.pieces ?? [] : []),
  );
  const graph = mod.readSeamGraph(l.facts);
  const rows = mod.anchorAll(graph, l.facts);
  const pieces = mod.segmentAll(l.facts);
  loaded.push({ ...f, ...l, graph, rows, pieces });
  const kinds = {};
  for (const { row } of rows) kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
  console.log(
    `${f.label}: ${l.facts.pieces.length} pieces (base ${l.baseSize}), ${rows.length} seams anchored ${JSON.stringify(kinds)}`,
  );
}

// ── G1 round trip ────────────────────────────────────────────────────────────────────────────
console.log('\n── G1 round trip (anchor → wire → resolve on the same geometry)');
const sameSides = (c, cand) =>
  c.kind === 'surface'
    ? cand.surface?.host === c.surface.host && cand.surface?.part === c.surface.part
    : mod.sideSet(c, 'a') === mod.sideSet(cand, 'a') &&
      mod.sideSet(c, 'b') === mod.sideSet(cand, 'b');
for (const f of loaded) {
  const r = mod.resolve(
    f.rows.map((x) => x.row),
    f.facts,
  );
  const byKey = new Map(r.applied.map((a) => [a.seam.seamKey, a]));
  let same = 0;
  let hint = 0;
  const miss = [];
  for (const { c, row } of f.rows) {
    const a = byKey.get(row.seamKey);
    if (a?.candidate && sameSides(c, a.candidate)) {
      same++;
      if (a.candidate.provenance?.how === 'hint') hint++;
    } else
      miss.push(`${c.a}~${c.b}${a ? ` → ${a.candidate?.a}~${a.candidate?.b}` : ' (not applied)'}`);
  }
  for (const s of [...r.stale, ...r.orphan]) miss.push(s.words);
  gate(
    same === f.rows.length && hint === f.rows.length,
    `${f.label}: ${same}/${f.rows.length} same edges (${pct(same, f.rows.length)}), ${hint} by the fast path${miss.length ? ` — ${miss.slice(0, 4).join('; ')}` : ''}`,
  );
}

// ── G2 robustness ────────────────────────────────────────────────────────────────────────────
const PERTURBS = [
  { name: 'start vertex +37 %', fn: mod.rotateStart(0.37), map: 'same' },
  { name: 'start vertex +71 %', fn: mod.rotateStart(0.71), map: 'same' },
  { name: 'mirrored', fn: mod.mirror, map: 'mirror' },
  {
    name: 'mirrored + start +53 %',
    fn: (p) => mod.rotateStart(0.53)(mod.mirror(p)),
    map: 'mirror',
  },
  { name: 'resampled 3.5 mm', fn: mod.resampleAt(0.35, 0.13), map: 'same' },
  { name: 'resampled 5 mm', fn: mod.resampleAt(0.5, 0.21), map: 'same' },
];

function robustness(f, thresholds) {
  const rows = f.rows.map((x) => x.row);
  const out = [];
  for (const p of PERTURBS) {
    const facts2 = mod.perturb(f.facts, p.fn);
    const pieces2 = mod.segmentAll(facts2);
    const r = mod.resolve(rows, facts2, thresholds);
    let right = 0;
    let wrong = 0;
    let partials = 0;
    let reseg = 0;
    const wrongs = [];
    for (const a of r.applied) {
      if (a.seam.kind === 'surface') {
        right++;
        continue;
      }
      const ok = [...a.a, ...a.b].every((h) => {
        const orig = mod.runPts(f.pieces, h.anchor.edgeHint);
        const now = mod.runPts(pieces2, h.run);
        const dto = f.facts.pieces.find((q) => q.pieceKey === h.anchor.piece).piece;
        const map = mod.truthMap(p.map, dto);
        const v = orig && now ? mod.placeVerdict(orig, map, now) : 'wrong';
        if (v === 'wrong') return false;
        if (v === 'resegmented') reseg++;
        // A partial: the SEWN part must land where the anchored sewn part went.
        const c = a.candidate;
        if (a.seam.kind !== 'partial' || !c) return true;
        const mm = c.a === h.run ? c.range?.a : c.b === h.run ? c.range?.b : null;
        const shares = mm ? [mm[0] / h.lenMm, mm[1] / h.lenMm] : [0, 1];
        partials++;
        return mod.samePlace(mod.subPts(orig, h.anchor.range), map, mod.subPts(now, shares));
      });
      if (ok) right++;
      else {
        wrong++;
        wrongs.push(
          `${[...a.a, ...a.b].map((h) => `${h.anchor.edgeHint}→${h.run} ${h.frame} ${h.fit}`).join(' | ')}`,
        );
      }
    }
    out.push({
      p,
      right,
      wrong,
      partials,
      reseg,
      stale: r.stale.length,
      orphan: r.orphan.length,
      total: rows.length,
      wrongs,
      r,
    });
  }
  return out;
}

console.log('\n── G2 robustness (re-exported contours; truth = the perturbation mapping)');
const g2 = new Map();
for (const f of loaded) {
  const res = robustness(f);
  g2.set(f.id, res);
  for (const x of res) {
    gate(
      x.wrong === 0 && x.right + x.stale === x.total,
      `${f.label} · ${x.p.name}: ${x.right}/${x.total} resolved right (${pct(x.right, x.total)}; ${x.partials} partial sides by sewn range${x.reseg ? `; ${x.reseg} side(s) on the same edge whose corner moved` : ''}), ${x.stale} stale, ${x.wrong} WRONG${x.wrongs.length ? ` — ${x.wrongs.slice(0, 3).join('; ')}` : ''}`,
    );
    if (verbose) for (const s of x.r.stale) console.log(`        ${s.words}`);
  }
}

// ── G3 staleness ─────────────────────────────────────────────────────────────────────────────
function staleness(f, thresholds) {
  // The piece most seams touch (shared with another piece).
  const touch = new Map();
  for (const { row } of f.rows) {
    const ks = new Set([...row.sideA, ...row.sideB].map((a) => a.piece));
    if (ks.size < 2) continue;
    for (const k of ks) touch.set(k, (touch.get(k) ?? 0) + 1);
  }
  const key = [...touch.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  const facts2 = mod.perturb(f.facts, mod.scaleBy(1.05), key);
  const r = mod.resolve(
    f.rows.map((x) => x.row),
    facts2,
    thresholds,
  );
  const staleKeys = new Map(r.stale.map((s) => [s.seam.seamKey, s]));
  const appliedKeys = new Map(r.applied.map((a) => [a.seam.seamKey, a]));
  let shared = 0;
  let sharedStale = 0;
  let others = 0;
  let othersSame = 0;
  let inside = 0;
  const words = [];
  const broken = [];
  for (const { c, row } of f.rows) {
    const ks = new Set([...row.sideA, ...row.sideB].map((a) => a.piece));
    if (ks.has(key) && ks.size > 1) {
      shared++;
      if (staleKeys.has(row.seamKey)) {
        sharedStale++;
        words.push(staleKeys.get(row.seamKey).words);
      } else broken.push(`${c.a}~${c.b} not stale`);
    } else if (ks.has(key)) inside++;
    else {
      others++;
      const a = appliedKeys.get(row.seamKey);
      if (a?.candidate && sameSides(c, a.candidate)) othersSame++;
      else broken.push(`${c.a}~${c.b} moved`);
    }
  }
  return {
    key,
    name: f.facts.pieces.find((p) => p.pieceKey === key)?.name,
    shared,
    sharedStale,
    others,
    othersSame,
    inside,
    words,
    broken,
  };
}
console.log('\n── G3 staleness (one piece redrawn 5 % bigger)');
for (const f of loaded) {
  const s = staleness(f);
  gate(
    s.shared > 0 && s.sharedStale === s.shared && s.othersSame === s.others,
    `${f.label} · ${s.name} ×1.05: ${s.sharedStale}/${s.shared} of its seams stale, ${s.othersSame}/${s.others} others unchanged${s.inside ? ` (${s.inside} inside the piece: info)` : ''}${s.broken.length ? ` — ${s.broken.slice(0, 3).join('; ')}` : ''}`,
  );
  console.log(`        e.g. «${s.words[0] ?? '—'}»`);
}

// ── G4 decisions ─────────────────────────────────────────────────────────────────────────────
console.log('\n── G4 decisions (SS26-005)');
{
  const f = loaded[0];
  const g = f.graph;
  const sides = (c) => [...mod.sideSet(c, 'a').split(','), ...mod.sideSet(c, 'b').split(',')];
  const pairKey = (c) => [mod.sideSet(c, 'a'), mod.sideSet(c, 'b')].sort().join('~');
  const chosenEdges = new Set(g.chosen.flatMap(sides));
  // A seam the matcher does NOT pick: the best rejected edge pair whose edges the matcher gave away.
  const forcedC = g.rejected.find(
    (c) => c.kind === 'edge' && !c.evidence.self && sides(c).some((e) => chosenEdges.has(e)),
  );
  const forcedEdges = new Set(sides(forcedC));
  const displaced = g.chosen.filter((c) => sides(c).some((e) => forcedEdges.has(e)));
  const free = g.chosen.filter(
    (c) => c.kind === 'edge' && !displaced.includes(c) && !sides(c).some((e) => forcedEdges.has(e)),
  );
  const wrongShoulder = free.find((c) => pairKey(c) === ['BP#8', 'FRONT_L#2'].sort().join('~'));
  const rejectC = wrongShoulder ?? free[0];
  const closureC = free.find(
    (c) => c !== rejectC && !sides(c).some((e) => sides(rejectC).includes(e)),
  );
  const mk = (c, status, kind, i) => {
    const row = mod.anchorAll({ ...g, chosen: [c], rejected: [] }, f.facts, status)[0].row;
    return {
      ...row,
      seamKey: `${row.seamKey.slice(0, 20)}G4000${i}`,
      kind: kind ?? row.kind,
      note: status === 'rejected' ? 'the other shoulder' : '',
    };
  };
  const rows = [
    mk(forcedC, 'confirmed', null, 1),
    mk(rejectC, 'rejected', null, 2),
    mk(closureC, 'confirmed', 'closure', 3),
  ];
  let res;
  const g2 = mod.readSeamGraph(
    f.facts,
    undefined,
    {},
    mod.decisionsFor(rows, f.facts, (r) => (res = r)),
  );
  const inChosen = (c) => g2.chosen.find((x) => pairKey(x) === pairKey(c));
  const fc = inChosen(forcedC);
  gate(
    !g.chosen.some((x) => pairKey(x) === pairKey(forcedC)) && !!fc?.provenance,
    `forced ${forcedC.a} ↔ ${forcedC.b} (matcher alone: not chosen, score ${forcedC.score}) → in graph.chosen, provenance ${fc?.provenance?.status}/${fc?.provenance?.how}, rule «${fc?.evidence.rule}»; displaced ${displaced.map((c) => `${c.a}~${c.b}`).join(', ')}`,
  );
  const rj = g2.rejected.find((x) => pairKey(x) === pairKey(rejectC));
  gate(
    !inChosen(rejectC) && !!rj && /rejected by/.test(rj.evidence.rule ?? ''),
    `rejected ${rejectC.a} ↔ ${rejectC.b}${wrongShoulder ? ' (the wrong shoulder)' : ''} → not chosen; in rejected «${rj?.evidence.rule}»`,
  );
  const cl = g2.rejected.find(
    (x) => x.kind === 'closure-not-seam' && pairKey(x) === pairKey(closureC),
  );
  const clEdges = new Set(sides(closureC));
  const touching = g2.chosen.filter(
    (c) => c.kind !== 'surface' && sides(c).some((e) => clEdges.has(e)),
  );
  gate(
    !!cl && touching.length === 0,
    `closure ${closureC.a} ↔ ${closureC.b} → rejected as closure «${cl?.evidence.rule}»; chosen seams on its edges: ${touching.map((c) => `${c.kind} ${c.a}~${c.b}`).join(', ') || 'none'}`,
  );
  gate(
    res && res.applied.length === 3 && res.stale.length === 0,
    `resolver: ${res?.applied.length} applied, ${res?.stale.length} stale; graph warnings carry ${g2.warnings.filter((w) => /closure/.test(w)).length} closure line(s)`,
  );
  // Mutation: the same rows with the forced-first rule withheld (forced list emptied) — the
  // matcher's own reading wins the edge, so the gate above is measuring the forcing.
  const g3 = mod.readSeamGraph(f.facts, undefined, {}, (pieces) => {
    const d = mod.decisionsFor(rows, f.facts)(pieces);
    return { ...d, forced: [] };
  });
  gate(
    !g3.chosen.some((x) => pairKey(x) === pairKey(forcedC)),
    'mutation: forced-first withheld → the forced seam is NOT chosen (the gate above would go red)',
  );
}

// A rejected A4 partial is not found again by the second pass.
{
  const f = loaded[0];
  const pk = (c) => [mod.sideSet(c, 'a'), mod.sideSet(c, 'b')].sort().join('~');
  const part = f.graph.chosen.find((c) => c.kind === 'partial');
  const row = {
    ...mod.anchorAll({ ...f.graph, chosen: [part], rejected: [] }, f.facts, 'rejected')[0].row,
    note: 'pleated, not sewn flat',
  };
  const g2 = mod.readSeamGraph(f.facts, undefined, {}, mod.decisionsFor([row], f.facts));
  const rj = g2.rejected.find((c) => pk(c) === pk(part));
  gate(
    !g2.chosen.some((c) => pk(c) === pk(part)) && /rejected by/.test(rj?.evidence.rule ?? ''),
    `rejected A4 partial ${part.a} ↔ ${part.b} → not chosen; in rejected «${rj?.evidence.rule}»`,
  );
}

// Composite (no A4 composite on these files, so a synthetic one: two chosen seams glued into ONE
// seam, side A = both a-runs, side B = both b-runs): anchored per part, resolved, forced as one
// composite whose parts no other seam re-sews; re-resolved on a mirrored + restarted export.
{
  const f = loaded[0];
  const g = f.graph;
  const [x, y] = g.chosen.filter((c) => c.kind === 'edge' && !c.evidence.self).slice(2, 4);
  const comp = { ...x, kind: 'composite', aParts: [x.a, y.a], bParts: [x.b, y.b] };
  const row = {
    ...mod.anchorAll({ ...g, chosen: [comp], rejected: [] }, f.facts)[0].row,
    seamKey: '01JZZZZZZZZZZZZZZZZCOMP01',
  };
  const parts = new Set(
    [...comp.aParts, ...comp.bParts].flatMap((id) => mod.sideSet({ a: id, b: id }, 'a').split(',')),
  );
  const g2 = mod.readSeamGraph(f.facts, undefined, {}, mod.decisionsFor([row], f.facts));
  const got = g2.chosen.find((c) => c.kind === 'composite' && c.provenance);
  const others = g2.chosen.filter(
    (c) =>
      c !== got &&
      c.kind !== 'surface' &&
      [...mod.sideSet(c, 'a').split(','), ...mod.sideSet(c, 'b').split(',')].some((e) =>
        parts.has(e),
      ),
  );
  gate(
    !!got && got.aParts?.length === 2 && got.bParts?.length === 2 && others.length === 0,
    `composite ${comp.aParts.join('+')} ↔ ${comp.bParts.join('+')} → chosen as one composite (a ${got?.a}, parts ${got?.aParts?.length}/${got?.bParts?.length}); other seams on its parts: ${others.map((c) => `${c.kind} ${c.a}~${c.b}`).join(', ') || 'none'}`,
  );
  const facts2 = mod.perturb(f.facts, (p) => mod.rotateStart(0.53)(mod.mirror(p)));
  const pieces2 = mod.segmentAll(facts2);
  const r = mod.resolve([row], facts2);
  const hits = r.applied[0] ? [...r.applied[0].a, ...r.applied[0].b] : [];
  const right = hits.filter((h) => {
    const dto = f.facts.pieces.find((q) => q.pieceKey === h.anchor.piece).piece;
    return (
      mod.placeVerdict(
        mod.runPts(f.pieces, h.anchor.edgeHint),
        mod.truthMap('mirror', dto),
        mod.runPts(pieces2, h.run),
      ) !== 'wrong'
    );
  });
  gate(
    hits.length === 4 && right.length === 4,
    `composite on a mirrored + restarted export: ${right.length}/4 parts where they went${r.stale.length ? ` — ${r.stale[0].words}` : ''}`,
  );
}

// Surface joins (the corpus blazer has four): a rejected one is not drawn and sits in rejected with
// the words; a confirmed one carries its provenance; one confirmed on pieces with no mark says so.
{
  const dxf = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo/blazer.dxf');
  if (!existsSync(dxf)) console.log('  (corpus blazer not found — surface check skipped)');
  else {
    const buf = await readFile(dxf);
    const l = await quiet(() =>
      mod.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'jacket-lined'),
    );
    const g = mod.readSeamGraph(l.facts);
    const surf = g.chosen.filter((c) => c.kind === 'surface');
    const rows = mod.anchorAll({ ...g, chosen: surf.slice(0, 2), rejected: [] }, l.facts);
    rows[0].row = { ...rows[0].row, status: 'rejected', note: 'flap is sewn into the welt' };
    const loose = mod.anchorAll({ ...g, chosen: [surf[0]], rejected: [] }, l.facts)[0].row;
    const ghost = {
      ...loose,
      seamKey: '01JZZZZZZZZZZZZZZZZSURF09',
      sideA: [{ ...loose.sideA[0], piece: surf[1].surface.host }],
      sideB: [{ ...loose.sideB[0], piece: surf[0].surface.host }],
    };
    const g2 = mod.readSeamGraph(
      l.facts,
      undefined,
      {},
      mod.decisionsFor([...rows.map((x) => x.row), ghost], l.facts),
    );
    const same = (c, q) => c.surface?.host === q.surface.host && c.surface?.part === q.surface.part;
    const rej = g2.rejected.find((c) => same(c, surf[0]));
    const conf = g2.chosen.find((c) => same(c, surf[1]));
    gate(
      surf.length >= 2 &&
        !g2.chosen.some((c) => same(c, surf[0])) &&
        /rejected by/.test(rej?.evidence.rule ?? '') &&
        conf?.provenance?.status === 'confirmed' &&
        g2.warnings.some((w) => /not found on today's marks/.test(w)),
      `blazer surface joins ${surf.length}: rejected ${surf[0]?.surface.part} on ${surf[0]?.surface.host} → rejected «${rej?.evidence.rule}»; confirmed ${surf[1]?.surface.part} → provenance ${conf?.provenance?.status}; a confirmed join with no mark → «${g2.warnings.find((w) => /not found on today's marks/.test(w))}»`,
    );
  }
}

// ── G5 negative controls ─────────────────────────────────────────────────────────────────────
console.log('\n── G5 negative controls');
{
  const broken = { fitMax: 0.5, tieMargin: 0, frameMargin: 0 };
  let wrong = 0;
  let total = 0;
  for (const f of loaded)
    for (const x of robustness(f, broken)) {
      wrong += x.wrong;
      total += x.total;
    }
  gate(
    wrong > 0,
    `fit threshold broken (${JSON.stringify(broken)}): G2 has ${wrong} wrong re-points of ${total} → red`,
  );
  let red = 0;
  for (const f of loaded) {
    const s = staleness(f, { ratioDrift: 1 });
    if (s.sharedStale !== s.shared) red++;
  }
  gate(red > 0, `drift threshold broken (ratioDrift 1): G3 red on ${red}/${loaded.length} files`);
}

// ── G6 no decisions = no change ──────────────────────────────────────────────────────────────
console.log('\n── G6 no decisions = byte-identical');
for (const f of loaded) {
  const base = JSON.stringify(mod.readSeamGraph(f.facts));
  const variants = [
    mod.readSeamGraph(f.facts, undefined, {}, undefined),
    mod.readSeamGraph(f.facts, undefined, {}, mod.EMPTY),
    mod.readSeamGraph(f.facts, undefined, {}, mod.decisionsFor([], f.facts)),
    mod.readSeamGraph(f.facts, undefined, {}, () => mod.EMPTY),
  ].map((g) => JSON.stringify(g));
  const p0 = JSON.stringify(mod.proposeSkeleton(f.facts, mod.skeletonDeps));
  const p1 = JSON.stringify(
    mod.proposeSkeleton(f.facts, mod.skeletonDeps, { decisions: mod.EMPTY }),
  );
  gate(
    variants.every((v) => v === base) && p0 === p1,
    `${f.label}: graph ×4 variants and proposeSkeleton identical (${base.length} + ${p0.length} bytes)`,
  );
}

// ── G7 every size ────────────────────────────────────────────────────────────────────────────
// Rows are confirmed on the base size (anchoredSize); every other size gets them by the piece's
// edge sequence (topology), shape fit at 0.02 only where the sequence differs, else stale naming the
// size. Cross-check (info): a carried run vs what a loose shape fit (0.06) would pick on that size.
// NEGATIVE CONTROL: one piece redrawn 5 % bigger on ONE size → its shared seams stale on that size
// only, every other size exactly as before.
console.log('\n── G7 every size (resolved on the base size, carried by topology)');
const sizeTable = [];
for (const f of loaded) {
  const rows = f.rows.map((x) => ({ ...x.row, anchoredSize: f.baseSize }));
  const sp = mod.sizePieces(f.sizes);
  const res = mod.resolveAcrossSizes(rows, sp);
  const cells = [];
  const staleLines = [];
  let all = true;
  let disagree = 0;
  let checked = 0;
  for (const s of f.sizes) {
    const r = res.get(s.size);
    const ok = r.applied.length === rows.length;
    all &&= ok;
    cells.push(
      `${s.size}${s.size === f.baseSize ? '*' : ''} ${r.applied.length}/${rows.length}${s.size === f.baseSize ? '' : ` (${r.carried} topo, ${r.byShape} shape)`}`,
    );
    for (const x of [...r.stale, ...r.orphan]) staleLines.push({ size: s.size, x });
    if (s.size === f.baseSize) continue;
    // Cross-check carried runs against a loose shape fit on the same size.
    const loose = mod.resolveSeamDecisions(rows, sp.find((q) => q.size === s.size).pieces, {
      grainDeg: sp.find((q) => q.size === s.size).grainDeg,
      thresholds: { fitMax: 0.06 },
    });
    const looseOf = new Map(loose.applied.map((a) => [a.seam.seamKey, a]));
    for (const a of r.applied) {
      const l = looseOf.get(a.seam.seamKey);
      if (!l || a.seam.kind === 'surface') continue;
      checked++;
      const runs = (x) => [...x.a, ...x.b].map((h) => h.run).join('|');
      if (runs(a) !== runs(l)) {
        disagree++;
        if (verbose)
          console.log(`        ${s.size}: topology ${runs(a)} vs loose shape ${runs(l)}`);
      }
    }
  }
  sizeTable.push(`  ${f.label.padEnd(26)} ${cells.join(' · ')}`);
  // SS26-005 must resolve on every size; elsewhere a row not placed must be stale in words that
  // name the size (a seam whose two sides grade apart is a finding, not a resolver failure).
  const named = staleLines.every(({ size, x }) => x.words.includes(`on ${size}`));
  const strict = f.id === 'ss26';
  gate(
    (strict ? all : named) && disagree === 0,
    `${f.label}: ${all ? 'every size resolves every row' : `${staleLines.length} row×size stale, each in words naming the size`} — ${cells.join(' · ')}`,
  );
  for (const { size, x } of staleLines)
    console.log(
      `        ${size} ${x.reason ?? 'orphan'}: ${x.words.replace(/^.*?: stale · /, '')}`,
    );
  console.log(
    `        info: carried runs agreeing with a loose shape fit (0.06) where it finds one: ${checked - disagree}/${checked}`,
  );
}
// Negative control: the most-shared piece redrawn ×1.05 on one non-base size.
for (const f of loaded) {
  const rows = f.rows.map((x) => ({ ...x.row, anchoredSize: f.baseSize }));
  const touch = new Map();
  for (const r of rows) {
    const ks = new Set([...r.sideA, ...r.sideB].map((a) => a.piece));
    if (ks.size > 1) for (const k of ks) touch.set(k, (touch.get(k) ?? 0) + 1);
  }
  const key = [...touch.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  const other =
    f.sizes.find((s) => s.size !== f.baseSize && s.size !== f.sizes[0].size) ??
    f.sizes.find((s) => s.size !== f.baseSize);
  if (!other) continue;
  const clean = mod.resolveAcrossSizes(rows, mod.sizePieces(f.sizes));
  const bent = mod.resolveAcrossSizes(
    rows,
    mod.sizePieces(f.sizes, { size: other.size, key, k: 1.05 }),
  );
  // Partials are graded apart by design on other sizes (they hold up to the eased band there), so
  // a 5 % redraw is not a signal on them: counted for edge / composite / closure seams, partials info.
  const sharedAll = rows.filter((r) => {
    const ks = new Set([...r.sideA, ...r.sideB].map((a) => a.piece));
    return ks.has(key) && ks.size > 1;
  });
  const shared = sharedAll.filter((r) => r.kind !== 'partial');
  const partialsHere = sharedAll.length - shared.length;
  const sig = (r) =>
    JSON.stringify(r.applied.map((a) => [a.seam.seamKey, [...a.a, ...a.b].map((h) => h.run)]));
  const staleThere = bent.get(other.size).stale.filter((x) => shared.includes(x.seam)).length;
  const restSame = f.sizes
    .filter((s) => s.size !== other.size)
    .every((s) => sig(clean.get(s.size)) === sig(bent.get(s.size)));
  const appliedThere = bent
    .get(other.size)
    .applied.filter((a) => !sharedAll.includes(a.seam) || a.seam.kind === 'partial').length;
  const cleanThere = clean.get(other.size).applied.filter((a) => !shared.includes(a.seam)).length;
  gate(
    staleThere === shared.length && restSame && appliedThere === cleanThere,
    `NEG ${f.label}: ${f.facts.pieces.find((p) => p.pieceKey === key)?.name} ×1.05 on ${other.size} only → ${staleThere}/${shared.length} of its seams stale on ${other.size}${partialsHere ? ` (+${partialsHere} partial, info: ${bent.get(other.size).stale.filter((x) => sharedAll.includes(x.seam) && x.seam.kind === 'partial').length} stale)` : ''}, ${appliedThere} others applied there as without the redraw, other sizes ${restSame ? 'unchanged' : 'CHANGED'} — «${bent.get(other.size).stale[0]?.words ?? '—'}»`,
  );
}
console.log('\n  per-size table (* = base size the rows were confirmed on):');
for (const l of sizeTable) console.log(l);

// ── timing ───────────────────────────────────────────────────────────────────────────────────
{
  const f = loaded[0];
  const rows = f.rows.map((x) => x.row);
  const pieces2 = mod.segmentAll(mod.perturb(f.facts, mod.mirror));
  const t0 = performance.now();
  for (let i = 0; i < 10; i++)
    mod.resolve(
      rows,
      mod.perturb(f.facts, (p) => p),
    );
  console.log(
    `\n  info: resolve ${rows.length} rows on SS26-005 (with segmentation) ${((performance.now() - t0) / 10).toFixed(1)} ms; mirrored pieces ${pieces2.length}`,
  );
}

console.log(bad ? `\n${bad} gate(s) FAILED` : '\nall gates green');
process.exit(bad ? 1 : 0);
