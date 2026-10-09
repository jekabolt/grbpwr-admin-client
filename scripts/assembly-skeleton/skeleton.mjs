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
const { buildSkeleton, orderTemplate, skeletonDeps, readSeamGraph, proposeSkeleton, loadFacts } =
  await import(pathToFileURL(outfile).href);

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
