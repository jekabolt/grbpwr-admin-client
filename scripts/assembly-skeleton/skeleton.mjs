#!/usr/bin/env node
// B4 — acceptance of the skeleton (lane B of the assembly-skeleton wave, 01-PLAN §2).
//
// GATE: on SS26-005 (prod shirt, 25 pieces) the skeleton reproduces ≥ 14 of the technologist's
// 18 join steps BY INPUTS: a join counts when one of ours takes exactly the same inputs, each
// input compared by the pieces it holds ({FP_L}, {FP_1_L}, {FP_2_L} → «Left front panel»). Order
// of inputs, unit keys and names do not count; the partition does. Tee (hand-written truth):
// 3 of 3 joins, ≤ 8 steps. Allsizes (CLO yoke shirt, truth in fixtures/allsizes.truth.json): 5 of 5
// joins by inputs. Every proposal must pass the frontier sweep (rules 1–3, 6, 7) clean.
//
// CONTROLS (the probe must be able to go red):
//   • shuffled template stages → the joins that depend on order (collar before sleeves …) drop;
//   • names stripped (P01 …) → geometry alone; shows what the graph carries without names;
//   • seams removed → names alone; shows what the names carry without the graph;
//   • EMPTY PROPOSAL → every fixture's gate set (SS26-005, tee, Allsizes) must FAIL on it: a gate a
//     proposal of no steps passes measures nothing (a sweep of nothing is always clean).
//
// Graph: the feasibility probe's seam graph converted to the SeamGraph contract
// (fixtures/*.json, made by fixture-from-probe.mjs). Re-run on lane A's real graph by replacing
// `graph` in the fixture — or pass `--graph <file>` with a SeamGraph JSON for SS26-005.
//
// REAL GRAPH (integration round): SS26-005 is also run on the product pipeline itself — the DXF
// through the nesting parser, the sewing line per block (seamPieceOf over every layer), A3 → units →
// A4 (`readSeamGraph`, the function the tech card's provider calls) — keyed by the card's lineKeys
// exactly as buildSkeletonFacts keys them. Same gate (≥ 14 / 18 by inputs), same names-stripped
// control. Needs the plans folder (SKELETON_PLANS, default ../tmp/plans); skipped, loudly, without it.
//
//   node scripts/assembly-skeleton/skeleton.mjs [--verbose] [--graph ss26-graph.json]

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outfile = resolve(tmpdir(), `assembly-skeleton-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'skeleton-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
});
const {
  buildSkeleton,
  orderTemplate,
  skeletonDeps,
  readSeamGraph,
  proposeSkeleton,
  loadFacts,
  SKELETON,
} = await import(pathToFileURL(outfile).href);

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const graphArg = args.includes('--graph') ? args[args.indexOf('--graph') + 1] : null;
const load = (f) => JSON.parse(readFileSync(resolve(here, 'fixtures', f), 'utf8'));

// ── measuring ─────────────────────────────────────────────────────────────────────────────────

/** Join steps → partition per step: sorted list of the leaf sets of its inputs. */
function partitions(joins, pieceKeys) {
  const leaves = new Map();
  const out = [];
  for (const j of joins) {
    const parts = j.inputs.map((k) => (pieceKeys.has(k) ? [k] : leaves.get(k) ?? [`?${k}`]));
    const all = parts.flat();
    leaves.set(j.name, all);
    out.push({
      name: j.name,
      key: parts
        .map((p) => [...p].sort().join('+'))
        .sort()
        .join(' | '),
      leaves: [...all].sort().join('+'),
    });
  }
  return out;
}

function measure(fixture, proposal) {
  const pieceKeys = new Set(fixture.facts.pieces.map((p) => p.pieceKey));
  const truth = partitions(fixture.truth, pieceKeys);
  const ours = partitions(
    proposal.steps
      .filter((s) => s.outputUnitKey)
      .map((s) => ({ name: s.outputUnitKey, inputs: s.inputs })),
    pieceKeys,
  );
  const byInputs = new Set(ours.map((o) => o.key));
  const byLeaves = new Set(ours.map((o) => o.leaves));
  const hit = truth.filter((t) => byInputs.has(t.key));
  const miss = truth.filter((t) => !byInputs.has(t.key));
  return {
    joins: truth.length,
    ours: ours.length,
    byInputs: hit.length,
    byLeaves: truth.filter((t) => byLeaves.has(t.leaves)).length,
    miss: miss.map((m) => m.name),
  };
}

const broken = (p) => p.warnings.filter((w) => /^rule \d+ broken/.test(w));

function run(fixture, { template, graph, facts } = {}) {
  const f = facts ?? fixture.facts;
  return buildSkeleton(
    graph ?? fixture.graph,
    f,
    template ?? orderTemplate(f.category),
    skeletonDeps,
  );
}

// seeded shuffle (mulberry32) — reproducible controls
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(xs, r) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const names = (fixture) => new Map(fixture.facts.pieces.map((p) => [p.pieceKey, p.name]));
function printSteps(fixture, proposal) {
  const nm = names(fixture);
  const unitName = new Map(
    proposal.steps.filter((s) => s.outputUnitKey).map((s) => [s.outputUnitKey, s.outputUnitName]),
  );
  proposal.steps.forEach((s, i) => {
    const ins = s.inputs.map((k) => nm.get(k) ?? `[${unitName.get(k) ?? k}]`).join(', ');
    const out = s.outputUnitKey ? ` → ${s.outputUnitKey} «${s.outputUnitName}»` : '';
    const zone = s.zone.replace('TECH_CARD_GARMENT_ZONE_', '');
    const alt = s.alternatives?.length ? ` (+${s.alternatives.length} alt)` : '';
    console.log(
      `  ${String(i + 1).padStart(2)} ${s.operationType.padEnd(10)} ${zone.padEnd(9)} ${s.source.padEnd(8)} ${s.confidence.toFixed(2)}  ${s.label ?? ''}: ${ins}${out}${alt}`,
    );
  });
}

// ── runs ──────────────────────────────────────────────────────────────────────────────────────

let failed = 0;
const gate = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// ── the gate sets, as predicates: run on the real proposal AND on an empty one (must fail) ────
const ssGates = (fx, p) => {
  const m = measure(fx, p);
  return [
    [`≥ 14 of 18 technologist joins by inputs`, m.byInputs >= 14, `${m.byInputs}/18`],
    ['frontier sweep clean (rules 1–3, 6, 7)', broken(p).length === 0, broken(p).join('; ')],
    [
      'every MACHINE step has a machine, every step a zone',
      p.steps.every(
        (s) =>
          (s.operationType !== 'MACHINE' || s.machineType) && s.zone && !s.zone.endsWith('UNKNOWN'),
      ),
    ],
  ];
};
const teeGates = (fx, p) => {
  const m = measure(fx, p);
  return [
    ['3 of 3 joins by inputs', m.joins === 3 && m.byInputs === 3, `${m.byInputs}/${m.joins}`],
    ['≤ 8 steps', p.steps.length <= 8, `${p.steps.length}`],
    ['frontier sweep clean', broken(p).length === 0, broken(p).join('; ')],
  ];
};
const alGates = (fx, p) => {
  const m = measure(fx, p);
  return [
    [
      `all ${m.joins} truth joins by inputs (allsizes.truth.json)`,
      m.joins === 5 && m.byInputs === m.joins,
      `${m.byInputs}/${m.joins}${m.miss.length ? `, missed ${m.miss.join(', ')}` : ''}`,
    ],
    // ≤ 8 decisions: joins and own steps; press riders ride on their join and are not decisions.
    [
      '≤ 8 steps that are not riders',
      p.steps.filter((s) => !s.derivedFrom).length <= 8,
      `${p.steps.filter((s) => !s.derivedFrom).length} (+${p.steps.filter((s) => s.derivedFrom).length} riders)`,
    ],
    ['frontier sweep clean', broken(p).length === 0, broken(p).join('; ')],
  ];
};
const gates = (prefix, list) => list.forEach(([n, ok, d]) => gate(`${prefix}: ${n}`, ok, d));

// SS26-005
const ss = load('ss26-005.json');
if (graphArg) ss.graph = JSON.parse(readFileSync(resolve(graphArg), 'utf8'));
const ssP = run(ss);
const ssM = measure(ss, ssP);
console.log(
  `\nSS26-005 (shirt, ${ss.facts.pieces.length} pieces, graph: ${graphArg ?? 'probe fixture'}, ${ss.graph.chosen.length} seams)`,
);
console.log(
  `  steps ${ssP.steps.length}, joins ${ssM.ours} (technologist: ${ssM.joins} joins / 47 steps)`,
);
console.log(
  `  joins reproduced by inputs: ${ssM.byInputs}/${ssM.joins}; same unit contents: ${ssM.byLeaves}/${ssM.joins}`,
);
if (ssM.miss.length) console.log(`  missed: ${ssM.miss.join(', ')}`);
console.log(
  `  geometry-backed joins: ${ssP.steps.filter((s) => s.outputUnitKey && s.source === 'geometry').length}/${ssM.ours}; with alternatives: ${ssP.steps.filter((s) => s.alternatives?.length).length}; unresolved seams: ${ssP.unresolved.length}`,
);
console.log(`  warnings (${ssP.warnings.length}):`);
for (const w of ssP.warnings) console.log(`    · ${w}`);
if (verbose) printSteps(ss, ssP);
gates('SS26-005', ssGates(ss, ssP));

// SS26-005 on the REAL graph (A3 + A4 through the product pipeline)
{
  const plans = process.env.SKELETON_PLANS ?? resolve(root, '../tmp/plans');
  const dxf = resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf');
  let bytes = null;
  try {
    const buf = readFileSync(dxf);
    bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    console.log(`\nSS26-005 REAL graph: SKIPPED — ${dxf} not found`);
    failed++;
  }
  if (bytes) {
    const quiet = [console.log, console.warn];
    console.log = () => {};
    console.warn = () => {};
    const { facts: parsed } = await loadFacts(bytes, 'M', 'shirt');
    [console.log, console.warn] = quiet;
    // block name → the card's piece (lineKey, name, cut symmetry, cloth) — as buildSkeletonFacts.
    const byName = new Map(parsed.pieces.map((p) => [p.name, p.piece]));
    const realFacts = {
      ...ss.facts,
      pieces: ss.facts.pieces
        .filter((p) => byName.has(p.name))
        .map((p) => ({ ...p, piece: byName.get(p.name) })),
    };
    const t0 = performance.now();
    const graph = readSeamGraph(realFacts);
    const ms = performance.now() - t0;
    const real = { ...ss, facts: realFacts, graph };
    const p = run(real);
    const m = measure(real, p);
    const joins = p.steps.filter((s) => s.outputUnitKey);
    const geo = joins.filter((s) => s.source === 'geometry').length;
    const kinds = graph.chosen.reduce((a, c) => ({ ...a, [c.kind]: (a[c.kind] ?? 0) + 1 }), {});
    console.log(
      `\nSS26-005 on the REAL graph (A3 + A4, ${realFacts.pieces.length} pieces, ${graph.chosen.length} seams ${JSON.stringify(kinds)}, graph ${ms.toFixed(0)} ms)`,
    );
    console.log(
      `  joins reproduced by inputs: ${m.byInputs}/${m.joins}; same unit contents: ${m.byLeaves}/${m.joins}`,
    );
    if (m.miss.length) console.log(`  missed: ${m.miss.join(', ')}`);
    console.log(
      `  geometry-backed joins: ${geo}/${joins.length} (${Math.round((100 * geo) / Math.max(1, joins.length))} %)`,
    );
    if (verbose) printSteps(real, p);
    gate('SS26-005 REAL graph: ≥ 14 of 18 joins by inputs', m.byInputs >= 14, `${m.byInputs}/18`);
    gate('SS26-005 REAL graph: frontier sweep clean', broken(p).length === 0, broken(p).join('; '));

    // names stripped BEFORE the graph is read: no hands, no roles — geometry alone end to end.
    const rename = new Map(
      realFacts.pieces.map((q, i) => [q.name, `P${String(i + 1).padStart(2, '0')}`]),
    );
    const strippedFacts = {
      ...realFacts,
      pieces: realFacts.pieces.map((q) => ({
        ...q,
        name: rename.get(q.name),
        piece: { ...q.piece, name: rename.get(q.name), blockName: rename.get(q.name) },
      })),
    };
    const sGraph = readSeamGraph(strippedFacts);
    const sReal = { ...ss, facts: strippedFacts, graph: sGraph };
    const sp = run(sReal);
    const sm = measure(sReal, sp);
    const sJoins = sp.steps.filter((s) => s.outputUnitKey);
    console.log(
      `  names stripped (geometry alone, REAL graph): ${sm.byInputs}/${sm.joins} by inputs, ${sm.byLeaves}/${sm.joins} by contents; geometry-backed ${sJoins.filter((s) => s.source === 'geometry').length}/${sJoins.length}`,
    );
    gate(
      'control (REAL graph): stripping names loses joins',
      sm.byInputs < m.byInputs,
      `${m.byInputs} → ${sm.byInputs}`,
    );
  }
}

// Tee
const tee = load('tee.json');
const teeP = run(tee);
const teeM = measure(tee, teeP);
console.log(`\nTee (hand-written truth, ${tee.facts.pieces.length} pieces)`);
console.log(
  `  steps ${teeP.steps.length} (truth ${tee.truthSteps.length}), joins by inputs ${teeM.byInputs}/${teeM.joins}`,
);
console.log(`  ours : ${teeP.steps.map((s) => s.label).join(' → ')}`);
console.log(`  truth: ${tee.truthSteps.join(' → ')}`);
for (const w of teeP.warnings) console.log(`    · ${w}`);
if (verbose) printSteps(tee, teeP);
gates('Tee', teeGates(tee, teeP));
const teePress = run(tee, {
  template: { ...orderTemplate('tee'), pressOpen: true, pressFlat: true },
});
console.log(`  with press steps switched on: ${teePress.steps.length} steps`);

// Allsizes (CLO yoke shirt) — hand-written truth, measured against allsizes.truth.json itself
const al = { ...load('allsizes.json'), truth: load('allsizes.truth.json').joins };
const alP = run(al);
const alM = measure(al, alP);
console.log(
  `\nAllsizes_with_notches (yoke shirt, 9 pieces, hand truth): joins by inputs ${alM.byInputs}/${alM.joins}, steps ${alP.steps.length}`,
);
if (alM.miss.length) console.log(`  missed: ${alM.miss.join(', ')}`);
for (const w of alP.warnings) console.log(`    · ${w}`);
if (verbose) printSteps(al, alP);
gates('Allsizes', alGates(al, alP));

// ── every category template on a name-only card: sweep clean, one terminal, nothing orphaned ──
console.log('\nTemplate smoke (names only, no seams)');
{
  const card = (category, names, extra = {}) => ({
    graph: { pieces: [], chosen: [], rejected: [], components: [], warnings: [] },
    facts: {
      pieces: names.map((n) => ({
        pieceKey: n,
        name: n,
        piecesPerGarment: 1,
        cutSymmetry: null,
        cloth: n.startsWith('LIN_') ? 'lining' : n.startsWith('INT_') ? 'interfacing' : 'main',
        fused: false,
      })),
      category,
      bom: {
        zipper: 0,
        buttons: 0,
        snaps: 0,
        tape: 0,
        elastic: 0,
        drawcord: 0,
        interlining: 0,
        ...extra,
      },
      defaultMachineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
    },
    truth: [],
  });
  const cards = [
    card(
      'sweat',
      [
        'FRONT',
        'BACK',
        'SLEEVE_L',
        'SLEEVE_R',
        'HOOD_L',
        'HOOD_R',
        'CUFF_RIB',
        'HEM_RIB',
        'POCKET',
      ],
      { drawcord: 1 },
    ),
    card(
      'trousers',
      [
        'FRONT_L',
        'FRONT_R',
        'BACK_L',
        'BACK_R',
        'WB',
        'POCKET_BAG_L',
        'POCKET_BAG_R',
        'FLY',
        'BELT_LOOP',
      ],
      { zipper: 1, buttons: 1 },
    ),
    card(
      'jacket-lined',
      [
        'FRONT_L',
        'FRONT_R',
        'BACK',
        'SIDE_L',
        'SIDE_R',
        'SLEEVE_L',
        'SLEEVE_R',
        'COLLAR',
        'UNDER_COLLAR',
        'FACING_L',
        'FACING_R',
        'LIN_FRONT_L',
        'LIN_FRONT_R',
        'LIN_BACK',
        'LIN_SLEEVE_L',
        'LIN_SLEEVE_R',
        'INT_FACING_L',
      ],
      { buttons: 1, interlining: 1 },
    ),
    card('generic', ['FRONT', 'BACK', 'SLEEVE', 'COLLAR', 'P7'], {}),
  ];
  for (const c of cards) {
    const p = run(c);
    const bad = p.warnings.filter((w) => /rule \d+ broken|terminal|never reach/.test(w));
    console.log(
      `  ${c.facts.category}: ${p.steps.length} steps — ${p.steps
        .filter((s) => s.outputUnitKey)
        .map((s) => s.outputUnitName)
        .join(' · ')}`,
    );
    for (const w of p.warnings) console.log(`    · ${w}`);
    if (c.facts.category !== 'generic')
      gate(`${c.facts.category}: sweep clean, one terminal`, bad.length === 0, bad.join('; '));
    else
      gate(
        'generic: the nameless, seamless piece is reported, not invented',
        p.warnings.some((w) => w.includes('P7')),
      );
  }
}

// ── controls ──────────────────────────────────────────────────────────────────────────────────
console.log('\nControls on SS26-005');
{
  const base = orderTemplate('shirt');
  const r = rng(26005);
  const scores = [];
  for (let i = 0; i < 30; i++) {
    const p = run(ss, { template: { ...base, stages: shuffled(base.stages, r) } });
    scores.push(measure(ss, p).byInputs);
    if (broken(p).length) gate(`shuffle #${i}: sweep clean`, false, broken(p).join('; '));
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const below = scores.filter((s) => s < ssM.byInputs).length;
  console.log(
    `  shuffled stages ×30: min ${Math.min(...scores)}, mean ${mean.toFixed(1)}, max ${Math.max(...scores)} (vs ${ssM.byInputs}); lower in ${below}/30`,
  );
  gate('control: shuffled stage order loses joins', mean < ssM.byInputs && below > 0);

  const stripped = structuredClone(ss);
  const rename = new Map(
    stripped.facts.pieces.map((p, i) => [p.name, `P${String(i + 1).padStart(2, '0')}`]),
  );
  for (const p of stripped.facts.pieces) p.name = rename.get(p.name);
  for (const p of stripped.graph.pieces) {
    p.name = rename.get(p.name) ?? p.name;
    p.hand = null;
  }
  const geo = measure(stripped, run(stripped));
  console.log(
    `  names stripped (geometry alone): ${geo.byInputs}/${geo.joins} by inputs, ${geo.byLeaves}/${geo.joins} by contents`,
  );

  const noSeams = { ...ss, graph: { ...ss.graph, chosen: [] } };
  const nm = measure(noSeams, run(noSeams));
  console.log(`  seams removed (names alone): ${nm.byInputs}/${nm.joins} by inputs`);

  const noHands = structuredClone(ss);
  for (const p of noHands.facts.pieces) p.name = p.name.replace(/_(L|R)(?=_|$)/g, '');
  for (const p of noHands.graph.pieces) p.hand = null;
  const nh = measure(noHands, run(noHands));
  console.log(`  hands removed from names: ${nh.byInputs}/${nh.joins} by inputs`);
  gate('control: without hands L/R the fronts and sleeves collapse', nh.byInputs < ssM.byInputs);
}

// ── chosen readings: every reading of every ambiguous join REBUILDS a clean order ─────────────
// The blazer (46 numbered pieces) is the corpus card whose skeleton has readings. Pinning one must
// give a proposal where that reading IS the step and the frontier sweep stays clean — a patched
// step would double-consume downstream (the defect this gate exists for).
console.log('\nChosen readings on the blazer (pins → rebuild)');
{
  const plans = process.env.SKELETON_PLANS ?? resolve(root, '../tmp/plans');
  const dxf = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo/blazer.dxf');
  let bytes = null;
  try {
    const buf = readFileSync(dxf);
    bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    gate('blazer DXF found', false, dxf);
  }
  if (bytes) {
    const quiet = [console.log, console.warn];
    console.log = () => {};
    console.warn = () => {};
    const { facts } = await loadFacts(bytes, 'M', 'jacket-lined');
    [console.log, console.warn] = quiet;
    const base = proposeSkeleton(facts, skeletonDeps);
    const decisions = base.steps.filter((x) => x.decision);
    let runs = 0;
    let worst = 0;
    const bad = [];
    for (const d of decisions) {
      for (let v = 1; v <= d.alternatives.length; v++) {
        const t0 = performance.now();
        const p = proposeSkeleton(facts, skeletonDeps, { pins: { [d.decision.id]: v } });
        worst = Math.max(worst, performance.now() - t0);
        runs++;
        const step = p.steps.find((x) => x.decision?.id === d.decision.id);
        if (!step || step.decision.chosen !== v) bad.push(`${d.decision.id}=${v}: not chosen`);
        if (broken(p).length) bad.push(`${d.decision.id}=${v}: ${broken(p).join('; ')}`);
      }
    }
    console.log(
      `  ${decisions.length} ambiguous joins, ${runs} other readings rebuilt, slowest ${worst.toFixed(0)} ms`,
    );
    gate('blazer: the skeleton offers readings', decisions.length > 0, `${decisions.length}`);
    gate('blazer: every chosen reading rebuilds a clean order', bad.length === 0, bad.join(' | '));
  }
}

// ── P2 lane Z: closures off the centre front (03-P2-DESIGN §5) ───────────────────────────────
// Z1 button columns on real files (SS26-005, Allsizes, blazer, summer men), Z2 BOM-led zip seats
// (never ticked), Z3 vent template steps (jacket/coat only, «check»). Controls: BOM without a zip
// gives no zip step; marks stripped gives the template's BOM steps back; SKELETON.drillEdgeMm → 10
// (one reach for closure-not-seam and columns) takes the placket and front columns out of reach —
// the SS26 and Allsizes gates must go red.
console.log('\nClosures (P2 lane Z)');
{
  const plans = process.env.SKELETON_PLANS ?? resolve(root, '../tmp/plans');
  const corpus = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo');
  const bytesOf = (f) => {
    try {
      const buf = readFileSync(f);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch {
      gate(`closures: ${f} found`, false, f);
      return null;
    }
  };
  const quietly = async (fn) => {
    const q = [console.log, console.warn];
    console.log = () => {};
    console.warn = () => {};
    try {
      return await fn();
    } finally {
      [console.log, console.warn] = q;
    }
  };
  const BOM0 = {
    zipper: 0,
    buttons: 0,
    snaps: 0,
    tape: 0,
    elastic: 0,
    drawcord: 0,
    interlining: 0,
  };
  const z1 = (p) =>
    p.steps.filter((s) => s.feature?.kind === 'buttonholes' || s.feature?.kind === 'buttons');
  const zips = (p) =>
    p.steps.filter((s) => s.feature?.kind === 'zip' || /\bzip/i.test(s.label ?? ''));
  const vents = (p) => p.steps.filter((s) => s.feature?.kind === 'vent');
  const tmplButtons = (p) =>
    p.steps.filter(
      (s) => s.source === 'bom' && /^(Buttonholes|Attach buttons)$/.test(s.label ?? ''),
    );
  const show = (xs) => xs.map((s) => `${s.label} [${s.confidence}]`).join(' · ') || 'none';
  const closureSet = (g, nm) =>
    g.rejected
      .filter((c) => c.kind === 'closure-not-seam')
      .map((c) =>
        [c.a, c.b]
          .map((id) => nm(id.slice(0, id.lastIndexOf('#'))))
          .sort()
          .join('~'),
      )
      .sort()
      .join(', ');
  const accept = 0.6;

  // SS26-005 on the real graph, keyed by the card's lineKeys (the order probe's real run)
  const ssBytes = bytesOf(resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'));
  if (ssBytes) {
    const { facts: parsed } = await quietly(() => loadFacts(ssBytes, 'M', 'shirt'));
    const byName = new Map(parsed.pieces.map((p) => [p.name, p.piece]));
    const facts = {
      ...ss.facts,
      pieces: ss.facts.pieces
        .filter((p) => byName.has(p.name))
        .map((p) => ({ ...p, piece: byName.get(p.name) })),
    };
    const nm = (k) => facts.pieces.find((p) => p.pieceKey === k)?.name ?? k;
    const placket = (p) => {
      const steps = z1(p);
      const holes = steps.find((s) => /^Buttonholes ×6 on PLCK_[LR]\b/.test(s.label));
      const btns = steps.find((s) => /^Attach buttons ×6 on PLCK_[LR]\b/.test(s.label));
      const ok =
        !!holes &&
        !!btns &&
        holes.feature.pieceKey !== btns.feature.pieceKey &&
        holes.feature.count === 6 &&
        btns.feature.count === 6;
      return { ok, holes, btns, steps };
    };
    const p = proposeSkeleton(facts, skeletonDeps);
    const { ok, holes, btns, steps } = placket(p);
    console.log(`  SS26-005 (BOM buttons ${facts.bom.buttons}): ${show(steps)}`);
    gate(
      'SS26-005: buttonholes ×6 / buttons ×6 on the two plackets (folded column counted once)',
      ok,
      show([holes, btns].filter(Boolean)),
    );
    gate(
      'SS26-005: CLO draws both sides alike — the side is a decision (< accept, «which side: check»)',
      [holes, btns].every((s) => s && s.confidence < accept && /which side: check/.test(s.label)),
    );
    gate(
      'SS26-005: the template BOM button steps yield',
      tmplButtons(p).length === 0,
      show(tmplButtons(p)),
    );
    const cs = closureSet(p.graph, nm);
    gate('SS26-005: closure-not-seam = the centre front only', cs === 'FRONT_L~FRONT_R', cs);

    // control: marks stripped — Z1 silent, the template's BOM steps come back
    const bare = { ...p.graph, pieces: p.graph.pieces.map((g) => ({ ...g, marks: [] })) };
    const pb = buildSkeleton(bare, facts, orderTemplate('shirt'), skeletonDeps);
    gate(
      'control: marks stripped → no column steps, the template BOM steps return',
      z1(pb).length === 0 && tmplButtons(pb).length === 2,
      `${z1(pb).length} column steps, ${tmplButtons(pb).length} template`,
    );
    // mutation: one reach for closures and columns — at 10 mm the placket columns (13 / 38 mm in)
    // are out of reach, the placket gate must go red
    const keep = SKELETON.drillEdgeMm;
    SKELETON.drillEdgeMm = 10;
    const pm = proposeSkeleton(facts, skeletonDeps);
    SKELETON.drillEdgeMm = keep;
    gate(
      'mutation: drillEdgeMm 10 → the SS26 placket gate goes red',
      !placket(pm).ok,
      show(z1(pm)),
    );
  }

  // Allsizes: one column of 6 per front; the centre front stays a closure, not a seam
  const alBytes = bytesOf(resolve(corpus, 'Allsizes_with_notches.dxf'));
  if (alBytes) {
    const { facts } = await quietly(() => loadFacts(alBytes, 'M', 'shirt', { buttons: 1 }));
    const p = proposeSkeleton(facts, skeletonDeps);
    const steps = z1(p);
    console.log(`  Allsizes: ${show(steps)}`);
    gate(
      'Allsizes: buttonholes ×6 + buttons ×6 on FP_L / FP_R',
      steps.length === 2 &&
        steps.some((s) => /^Buttonholes ×6 on FP_[LR]/.test(s.label)) &&
        steps.some((s) => /^Attach buttons ×6 on FP_[LR]/.test(s.label)),
      show(steps),
    );
    const cf = p.graph.rejected.find(
      (c) => c.kind === 'closure-not-seam' && c.a === 'FP_L#3' && c.b === 'FP_R#0',
    );
    gate(
      'Allsizes: FP_L#3 ~ FP_R#0 still a closure (6 drills), never a chosen seam',
      cf?.evidence.rule === 'closure: 6 drills along the edge' &&
        cf.closure?.kind === 'buttons' &&
        !p.graph.chosen.some((c) => [c.a, c.b].includes('FP_L#3') || [c.a, c.b].includes('FP_R#0')),
      cf?.evidence.rule ?? 'missing',
    );
    const keep = SKELETON.drillEdgeMm;
    SKELETON.drillEdgeMm = 10;
    const pm = proposeSkeleton(facts, skeletonDeps);
    SKELETON.drillEdgeMm = keep;
    const cm = pm.graph.rejected.find(
      (c) => c.kind === 'closure-not-seam' && c.a === 'FP_L#3' && c.b === 'FP_R#0',
    );
    gate(
      'mutation: drillEdgeMm 10 → the Allsizes centre front is no longer read off its drills',
      cm?.evidence.rule !== 'closure: 6 drills along the edge' && z1(pm).length === 0,
      `${cm?.evidence.rule ?? 'no closure'}; ${z1(pm).length} column steps`,
    );
  }

  // blazer (Gerber): buttonholes drawn as slits on 6, none on its mirror twin 10 — the side is read
  const blBytes = bytesOf(resolve(corpus, 'blazer.dxf'));
  if (blBytes) {
    const { facts } = await quietly(() => loadFacts(blBytes, 'M', 'jacket-lined', { buttons: 1 }));
    const p = proposeSkeleton(facts, skeletonDeps);
    const steps = z1(p);
    console.log(`  blazer: ${show(steps)}`);
    gate(
      'blazer: buttonholes ×2 on 6, buttons ×2 on 10, ticked (0.7) — the facing copies add nothing',
      steps.length === 2 &&
        steps[0].label === 'Buttonholes ×2 on 6' &&
        steps[1].label === 'Attach buttons ×2 on 10' &&
        steps.every((s) => s.confidence === 0.7),
      show(steps),
    );
    // Z3: the same blazer named — vents are «check» steps on sleeves and back, raised by evidence
    const names = {
      3: 'BACK_L',
      17: 'BACK_R',
      19: 'SLEEVE_TOP_1',
      28: 'SLEEVE_TOP_2',
      16: 'SLEEVE_UNDER_1',
      26: 'SLEEVE_UNDER_2',
      6: 'FRONT_L',
      10: 'FRONT_R',
    };
    const named = {
      ...facts,
      pieces: facts.pieces.map((q) => (names[q.pieceKey] ? { ...q, name: names[q.pieceKey] } : q)),
    };
    const pj = proposeSkeleton(named, skeletonDeps);
    const vj = vents(pj);
    console.log(`  blazer named, jacket-lined: ${show(vj)}`);
    gate(
      'blazer named: a back vent and sleeve vents, all «check», none ticked',
      vj.some((s) => /^Back vent/.test(s.label)) &&
        vj.some((s) => /^Sleeve vent/.test(s.label)) &&
        vj.every((s) => s.confidence < accept && /check$/.test(s.label)),
      show(vj),
    );
    gate(
      'blazer named: the back vent is raised by the 199 mm V line (0.55 > 0.4)',
      vj.some(
        (s) => /^Back vent/.test(s.label) && s.confidence === 0.55 && /199 mm/.test(s.reason),
      ),
    );
    const ps = proposeSkeleton({ ...named, category: 'shirt' }, skeletonDeps);
    gate('control: the shirt template proposes no vent', vents(ps).length === 0, show(vents(ps)));
  }

  // summer men: BOM zip, no fly, button front read by drills → a zip seat «check», never ticked
  const smBytes = bytesOf(resolve(corpus, 'summer men.dxf'));
  if (smBytes) {
    const run1 = async (bom) => {
      const { facts } = await quietly(() => loadFacts(smBytes, 'XS', 'shirt', bom));
      return proposeSkeleton(facts, skeletonDeps);
    };
    const p = await run1({ zipper: 1 });
    const zs = zips(p);
    console.log(`  summer men, BOM zip 1: ${show(zs)}`);
    gate(
      'summer men (zip, no fly): a CB / side seat as a decision, 0 ticked',
      zs.length >= 1 &&
        zs.every((s) => s.confidence <= 0.5 && /check/.test(s.label)) &&
        zs.some((s) => /centre back|side seam/.test(s.label)),
      show(zs),
    );
    const p0 = await run1({ ...BOM0 });
    gate('control: BOM without a zip → no zip step', zips(p0).length === 0, show(zips(p0)));
  }

  // centre back: a skirt whose two backs meet along a straight 600 mm edge notched at 200 mm —
  // the zip stops at the notch, the seam below it is closed after it (riding on the zip's tick)
  {
    const edge = (key, notches) => ({
      id: `${key}#0`,
      pieceKey: key,
      k: 0,
      s: 0,
      e: 0,
      pts: [
        [0, 0],
        [0, 600],
      ],
      lenMm: 600,
      chordMm: 600,
      turnDeg: 0,
      notchesMm: notches,
      kind: 'edge',
    });
    const geomOf = (key, hand, twin, notches) => ({
      pieceKey: key,
      name: key,
      hand,
      cloth: 'main',
      rs: [],
      corners: [],
      notchIdx: [],
      edges: [edge(key, notches)],
      rect: false,
      areaMm2: 1e5,
      perimMm: 2000,
      twinOf: twin ? [{ key: twin, kind: 'mirror' }] : [],
      marks: [],
    });
    const skirt = (notches, zipper) => {
      const pieces = [
        geomOf('BACK_L', 'L', 'BACK_R', notches),
        geomOf('BACK_R', 'R', 'BACK_L', notches),
        geomOf('FRONT', null, null, []),
      ];
      const ev = {
        dLenMm: 0,
        relLen: 0,
        notchScore: 1,
        curvature: 'flat',
        hand: 'cross',
        twin: 'mirror',
        self: false,
      };
      return {
        graph: {
          pieces,
          chosen: [{ a: 'BACK_L#0', b: 'BACK_R#0', score: 0.9, evidence: ev, kind: 'edge' }],
          rejected: [],
          components: [['BACK_L', 'BACK_R'], ['FRONT']],
          warnings: [],
        },
        facts: {
          pieces: pieces.map((g) => ({
            pieceKey: g.pieceKey,
            name: g.name,
            piecesPerGarment: 1,
            cutSymmetry: null,
            cloth: 'main',
            fused: false,
          })),
          category: 'skirt',
          bom: { ...BOM0, zipper },
          defaultMachineType: null,
        },
      };
    };
    const p = run(skirt([200], 1));
    const zs = zips(p);
    const set = zs.find((s) =>
      /^Set the zip into the centre back seam \(to the notch, 200 mm\) — check$/.test(s.label),
    );
    const below = zs.find((s) => /below the zip/.test(s.label));
    console.log(`  skirt, CB notched at 200 mm: ${show(zs)}`);
    gate(
      'skirt: the zip goes into the CB seam to its notch (200 mm), the seam below is closed after it',
      !!set &&
        set.confidence < accept &&
        set.seams[0]?.closure?.open === 'to-notch' &&
        set.seams[0]?.closure?.lengthMm === 200 &&
        !!below &&
        below.derivedFrom === p.steps.indexOf(set),
      show(zs),
    );
    const pf = run(skirt([], 1));
    gate(
      'skirt, no notch: the zip runs the whole CB seam (600 mm), nothing closed below',
      zips(pf).length === 1 && /\(600 mm\) — check$/.test(zips(pf)[0].label),
      show(zips(pf)),
    );
  }

  // fly: a trousers card by names — the zip goes to the fly, «check»
  {
    const fx = {
      graph: { pieces: [], chosen: [], rejected: [], components: [], warnings: [] },
      facts: {
        pieces: ['FRONT_L', 'FRONT_R', 'BACK_L', 'BACK_R', 'WB', 'FLY'].map((n) => ({
          pieceKey: n,
          name: n,
          piecesPerGarment: 1,
          cutSymmetry: null,
          cloth: 'main',
          fused: false,
        })),
        category: 'trousers',
        bom: { ...BOM0, zipper: 1 },
        defaultMachineType: null,
      },
    };
    const p = run(fx);
    const zs = zips(p);
    gate(
      'trousers with a fly: the zip goes into the fly, «check», and the template step yields',
      zs.length === 1 &&
        /^Set the zip into the fly — check$/.test(zs[0].label) &&
        zs[0].confidence < accept,
      show(zs),
    );
  }
}

// ── mutation: an EMPTY proposal must fail every fixture's gate set ────────────────────────────
console.log('\nMutation: the empty proposal');
{
  const empty = { steps: [], unresolved: [], warnings: [], template: 'none' };
  for (const [name, fx, set] of [
    ['SS26-005', ss, ssGates],
    ['Tee', tee, teeGates],
    ['Allsizes', al, alGates],
  ]) {
    const failing = set(fx, empty)
      .filter(([, ok]) => !ok)
      .map(([n]) => n);
    gate(
      `mutation: ${name} gates go red on an empty proposal`,
      failing.length > 0,
      failing.length ? `red: ${failing.join('; ')}` : 'ALL GREEN on nothing',
    );
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall gates green');
process.exit(failed ? 1 : 0);
