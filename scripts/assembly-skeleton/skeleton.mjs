#!/usr/bin/env node
// B4 — acceptance of the skeleton (lane B of the assembly-skeleton wave, 01-PLAN §2).
//
// GATE: on SS26-005 (prod shirt, 25 pieces) the skeleton reproduces ≥ 14 of the technologist's
// 18 join steps BY INPUTS: a join counts when one of ours takes exactly the same inputs, each
// input compared by the pieces it holds ({FP_L}, {FP_1_L}, {FP_2_L} → «Left front panel»). Order
// of inputs, unit keys and names do not count; the partition does. Tee (hand-written truth):
// 3 of 3 joins, ≤ 8 steps. Every proposal must pass the frontier sweep (rules 1–3, 6, 7) clean.
//
// CONTROLS (the probe must be able to go red):
//   • shuffled template stages → the joins that depend on order (collar before sleeves …) drop;
//   • names stripped (P01 …) → geometry alone; shows what the graph carries without names;
//   • seams removed → names alone; shows what the names carry without the graph.
//
// Graph: the feasibility probe's seam graph converted to the SeamGraph contract
// (fixtures/*.json, made by fixture-from-probe.mjs). Re-run on lane A's real graph by replacing
// `graph` in the fixture — or pass `--graph <file>` with a SeamGraph JSON for SS26-005.
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
const { buildSkeleton, orderTemplate, skeletonDeps } = await import(pathToFileURL(outfile).href);

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
gate('SS26-005: ≥ 14 of 18 technologist joins by inputs', ssM.byInputs >= 14, `${ssM.byInputs}/18`);
gate(
  'SS26-005: frontier sweep clean (rules 1–3, 6, 7)',
  broken(ssP).length === 0,
  broken(ssP).join('; '),
);
gate(
  'SS26-005: every MACHINE step has a machine, every step a zone',
  ssP.steps.every(
    (s) =>
      (s.operationType !== 'MACHINE' || s.machineType) && s.zone && !s.zone.endsWith('UNKNOWN'),
  ),
);

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
gate('Tee: 3 of 3 joins by inputs', teeM.byInputs === teeM.joins, `${teeM.byInputs}/${teeM.joins}`);
gate('Tee: ≤ 8 steps', teeP.steps.length <= 8, `${teeP.steps.length}`);
gate('Tee: frontier sweep clean', broken(teeP).length === 0, broken(teeP).join('; '));
const teePress = run(tee, {
  template: { ...orderTemplate('tee'), pressOpen: true, pressFlat: true },
});
console.log(`  with press steps switched on: ${teePress.steps.length} steps`);

// Allsizes (CLO yoke shirt) — informative, hand-written truth
const al = load('allsizes.json');
const alP = run(al);
const alM = measure(al, alP);
console.log(
  `\nAllsizes_with_notches (yoke shirt, 9 pieces, hand truth): joins by inputs ${alM.byInputs}/${alM.joins}, steps ${alP.steps.length}`,
);
if (alM.miss.length) console.log(`  missed: ${alM.miss.join(', ')}`);
for (const w of alP.warnings) console.log(`    · ${w}`);
if (verbose) printSteps(al, alP);
gate('Allsizes: frontier sweep clean', broken(alP).length === 0, broken(alP).join('; '));

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

console.log(failed ? `\n${failed} FAILED` : '\nall gates green');
process.exit(failed ? 1 : 0);
