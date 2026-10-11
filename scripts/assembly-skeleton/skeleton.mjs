#!/usr/bin/env node
// B4 — acceptance of the skeleton (lane B of the assembly-skeleton wave, 01-PLAN §2).
//
// GATE: on SS26-005 (prod shirt, 25 pieces) the skeleton reproduces ≥ 14 of the technologist's
// 18 join steps BY INPUTS: a join counts when one of ours takes exactly the same inputs, each
// input compared by the pieces it holds ({FP_L}, {FP_1_L}, {FP_2_L} → «Left front panel»). Order
// of inputs, unit keys and names do not count; the partition does. Tee (hand-written truth):
// 3 of 3 joins, ≤ 8 steps. Allsizes (CLO yoke shirt, truth in fixtures/allsizes.truth.json): 5 of 5
// joins by inputs in its own order (the collar first — reading 1 since sleeves-first became the
// default, 07 §4.6), ≥ 3 of 5 by default. Every proposal must pass the frontier sweep (rules 1–3,
// 6, 7) clean.
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
import { homedir, tmpdir } from 'node:os';
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
  groupUnits,
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
    // The hand truth sets the collar first; the default reading sets the sleeves first (07 §4.6),
    // so the two joins after that order are reading 1's — checked with that reading below.
    [
      `≥ ${m.joins - 2} of ${m.joins} truth joins by inputs (allsizes.truth.json, sleeves first)`,
      m.joins === 5 && m.byInputs >= m.joins - 2,
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

// F6: sleeves / collar is ONE order decision. Reading 0 sets the sleeves first (4 of 5 prod
// technologists' shirts; the owner's default, 07 §4.6) and costs SS26-005 its two order-dependent
// joins (≥ 16/18); reading 1 — the collar first, SS26-005's own order — rebuilds a clean order with
// the collar step before the sleeves step and gives all 18 back.
{
  const d = ssP.steps.find((x) => x.decision?.id === 'order:sleeves-collar');
  const at = (p, label) => p.steps.findIndex((x) => x.label?.startsWith(label));
  gate(
    'SS26-005: sleeves / collar order is a decision, sleeves first by default',
    !!d && d.alternatives?.length === 1 && at(ssP, 'Set sleeves') < at(ssP, 'Set collar'),
  );
  gate(
    'SS26-005: sleeves first costs only the two order-dependent joins (≥ 16/18 by inputs)',
    ssM.byInputs >= 16,
    `${ssM.byInputs}/${ssM.joins}`,
  );
  if (d) {
    const f = ss.facts;
    const p = buildSkeleton(ss.graph, f, orderTemplate(f.category), skeletonDeps, {
      pins: { 'order:sleeves-collar': 1 },
    });
    const flipped = p.steps.find((x) => x.decision?.id === 'order:sleeves-collar');
    const m = measure(ss, p);
    console.log(
      `  collar-first reading: ${m.byInputs}/${m.joins} by inputs, ${m.byLeaves}/${m.joins} by contents`,
    );
    gate(
      'SS26-005: the collar-first reading is chosen, set before the sleeves, 18/18, sweep clean',
      flipped?.decision.chosen === 1 &&
        at(p, 'Set collar') >= 0 &&
        at(p, 'Set collar') < at(p, 'Set sleeves') &&
        m.byInputs === m.joins &&
        broken(p).length === 0,
      `${m.byInputs}/${m.joins}; ${broken(p).join('; ')}`,
    );
  }
}

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
{
  const p = buildSkeleton(al.graph, al.facts, orderTemplate(al.facts.category), skeletonDeps, {
    pins: { 'order:sleeves-collar': 1 },
  });
  const m = measure(al, p);
  gate(
    'Allsizes: the collar-first reading gives all 5 truth joins by inputs, sweep clean',
    m.joins === 5 && m.byInputs === m.joins && broken(p).length === 0,
    `${m.byInputs}/${m.joins}${m.miss.length ? `, missed ${m.miss.join(', ')}` : ''}`,
  );
}

// ── H. an outside structural reading (the AI's units, «use AI structure») ────────────────────
// SkeletonOptions.units are made first, smallest first; a hint that cuts through a unit is said and
// skipped. Mutation control: the same measures on the engine's own proposal must differ.
{
  const withHints = (units) =>
    buildSkeleton(al.graph, al.facts, orderTemplate(al.facts.category), skeletonDeps, { units });
  const leavesOf = (p) => {
    const nm = new Map();
    const pk = new Set(al.facts.pieces.map((x) => x.pieceKey));
    for (const st of p.steps.filter((x) => x.outputUnitKey))
      nm.set(
        st.outputUnitKey,
        st.inputs.flatMap((k) => (pk.has(k) ? [k] : nm.get(k) ?? [])),
      );
    return [...nm.values()].map((l) => [...l].sort().join('+'));
  };
  const yoke = [
    { pieceKeys: ['BP_1', 'BP_2'], name: 'Back yoke' },
    { pieceKeys: ['BP', 'BP_1', 'BP_2'], name: 'Back' },
  ];
  const hp = withHints(yoke);
  const hm = measure({ ...al, truth: [{ name: 'Back yoke', inputs: ['BP_1', 'BP_2'] }] }, hp);
  const base = leavesOf(alP);
  gates('Allsizes hints', [
    [
      'a hinted unit the engine does not make (BP_1+BP_2 «Back yoke») is made',
      hm.byInputs === 1,
      hm,
    ],
    ['mutation: the engine alone does not make it', !base.includes('BP_1+BP_2'), base],
    [
      'the back is then the yoke + BP, every piece still in one garment',
      leavesOf(hp).includes('BP+BP_1+BP_2') && broken(hp).length === 0,
      broken(hp),
    ],
    [
      "the hinted unit says it is the AI's",
      hp.steps.some((x) => x.source === 'ai' && x.outputUnitName === 'Back yoke'),
      hp.steps.map((x) => `${x.source}:${x.outputUnitName}`),
    ],
  ]);
  const cut = withHints([
    { pieceKeys: ['CLR_3', 'CLR_4'], name: 'Collar' },
    { pieceKeys: ['CLR_3', 'FP_L'], name: 'Wrong' },
  ]);
  gates('Allsizes hints', [
    [
      'a hint that cuts through a made unit is said and not made',
      cut.warnings.some((w) => /AI unit «Wrong» cuts through/.test(w)) &&
        !leavesOf(cut).includes('CLR_3+FP_L'),
      cut.warnings,
    ],
  ]);
  const pk = new Set(al.facts.pieces.map((x) => x.pieceKey));
  const truthHints = partitions(al.truth, pk).map((t) => ({
    pieceKeys: t.leaves.split('+'),
    name: t.name,
  }));
  const tm = measure(al, withHints(truthHints));
  gates('Allsizes hints', [
    [
      `the technologist's own tree as hints: ${tm.byInputs}/${tm.joins} by inputs`,
      tm.byInputs === tm.joins,
      tm,
    ],
  ]);
}

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
    // 07 §4.7 (review): a bottom read from the pieces — the trousers' panel method, a skirt's words.
    card('bottom', ['FRONT_L', 'FRONT_R', 'BACK_L', 'BACK_R', 'WB', 'POCKET_L', 'POCKET_R'], {
      zipper: 1,
    }),
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
    // 07 §4.3: not left outside every unit either — placed as a guess the step says (0.4, a
    // decision with the other panels beside it), never as a confident join.
    else
      gate(
        'generic: the nameless, seamless piece is placed only as a said guess',
        p.steps.some(
          (s) =>
            s.decision?.id === 'orphan:P7' &&
            s.confidence < SKELETON.accept &&
            /P7: no role in its name and no seam found/.test(s.reason ?? ''),
        ),
        p.steps
          .filter((s) => s.inputs.includes('P7'))
          .map((s) => `${s.label} ${s.confidence} ${s.reason}`)
          .join('; '),
      );
    // 07 §4.4: trousers by the panel method — the backs into one, the fronts into one, then the
    // two in one (side seams, inseams, crotch), and only then the waistband.
    if (c.facts.category === 'trousers' || c.facts.category === 'bottom') {
      const at = (name) => p.steps.findIndex((s) => s.outputUnitName === name);
      const wb = p.steps.findIndex((s) => s.label?.startsWith('Attach the waistband'));
      gate(
        `${c.facts.category}: Back → Front → Body (back + front) → waistband`,
        at('Back') >= 0 && at('Back') < at('Front') && at('Front') < at('Body') && at('Body') < wb,
        `Back ${at('Back')}, Front ${at('Front')}, Body ${at('Body')}, waistband ${wb}`,
      );
    }
    // A bottom read from the pieces may be a skirt: no step claims what only trousers have.
    if (c.facts.category === 'bottom') {
      const claims = p.steps
        .map((s) => `${s.label} ${s.outputUnitName ?? ''}`)
        .filter((t) => /inseam|crotch|\bleg/i.test(t));
      gate('bottom: no inseam, crotch or leg in any step', claims.length === 0, claims.join('; '));
    }
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
  // Against the template read in this card's own order (the collar first, reading 1 since 07
  // §4.6): a random stage order must do worse than the template's order, not than the default
  // reading that was moved off this card on purpose.
  const own = measure(
    ss,
    buildSkeleton(ss.graph, ss.facts, base, skeletonDeps, { pins: { 'order:sleeves-collar': 1 } }),
  ).byInputs;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const below = scores.filter((s) => s < own).length;
  console.log(
    `  shuffled stages ×30: min ${Math.min(...scores)}, mean ${mean.toFixed(1)}, max ${Math.max(...scores)} (vs ${own} in the card's own order); lower in ${below}/30`,
  );
  gate('control: shuffled stage order loses joins', mean < own && below > 0);

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

// ── grouping cost on a pile of identical pieces (16 triangles of a bag, ×10) ──────────────────
// Layer pairs (F1) and repeats (F4) ask «identical?» for every pair of a family; a linear scan of
// twinOf there is Θ(n³) — 600 such pieces took ~1 s on the main thread. With twins indexed it is
// ~n²: 150 pieces well under 200 ms, 600 under 900 ms (the old scan, 1.2–1.6 s, goes red there).
console.log('\nGrouping cost: n pieces of one shape (synthetic, every pair identical twins)');
{
  const synth = (n, base) => {
    const keys = Array.from({ length: n }, (_, i) => `K${String(i).padStart(4, '0')}`);
    const name = (i) => `${base}_${i + 1}`;
    return {
      graph: {
        pieces: keys.map((k, i) => ({
          pieceKey: k,
          name: name(i),
          hand: null,
          cloth: 'main',
          rs: [],
          corners: [],
          notchIdx: [],
          edges: [],
          rect: false,
          areaMm2: 1000,
          perimMm: 100,
          twinOf: keys.filter((x) => x !== k).map((x) => ({ key: x, kind: 'identical' })),
        })),
        chosen: [],
        rejected: [],
        components: [],
        warnings: [],
      },
      facts: {
        pieces: keys.map((k, i) => ({
          pieceKey: k,
          name: name(i),
          piecesPerGarment: 1,
          cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL',
          cloth: 'main',
          fused: false,
        })),
        category: 'generic',
        bom: {},
        defaultMachineType: null,
      },
    };
  };
  const time = (n, base) => {
    const { graph, facts } = synth(n, base);
    const t0 = performance.now();
    const units = groupUnits(graph, facts, orderTemplate('generic'));
    return { ms: performance.now() - t0, units: units.length };
  };
  for (const [n, budget] of [
    [150, 200],
    [600, 900],
  ]) {
    // nameless (a repeat → one ring) and named (BLT_* → layer pairs by number)
    const ring = time(n, 'triangle');
    const pairs = time(n, 'BLT');
    console.log(
      `  ${n}: repeat ${ring.ms.toFixed(0)} ms (${ring.units} unit), pairs ${pairs.ms.toFixed(0)} ms (${pairs.units} units)`,
    );
    gate(
      `${n} identical pieces group in < ${budget} ms (repeat and layer pairs)`,
      ring.ms < budget && pairs.ms < budget && ring.units === 1 && pairs.units === n / 2 + 1,
      `${ring.ms.toFixed(0)} / ${pairs.ms.toFixed(0)} ms`,
    );
  }
}

// ── P2 lane D: darts (03-P2-DESIGN §4) ────────────────────────────────────────────────────────
// Synthetic fixtures (fixtures/darts-*.json: one V, two V, a V of two straight legs, a closed
// triangle, a mirror pair whose right side has no lines, and vees that are NOT darts + a dart cut
// out of the outline) run through the product pipeline (segmentPiece → marks → twins → graph →
// proposal). Gates: darts found n = 1/2/1/1, the mirror takes its twin's count; every dart step is
// a «decide» (confidence < accept, never auto-ticked), on the flat piece BEFORE its first join,
// with a machine and a zone; the pictogram draws the legs; the sweep is clean.
// Real negatives: NO dart in any corpus / Downloads file (all menswear) — the blazer's back vent
// (3_M: a vee of intake ≈ 194 mm) is NOT a dart; SS26 BP and Allsizes BP_1 read 0.
// Controls: each rule loosened alone turns one of the negative fixture's vees into a dart; all
// rules off («any vee is a dart») turns the blazer's vents into darts — the real gate goes red.
console.log('\nDarts (P2 lane D)');
{
  const D = await import(pathToFileURL(outfile).href);
  const NO_BOM = {
    zipper: 0,
    buttons: 0,
    snaps: 0,
    tape: 0,
    elastic: 0,
    drawcord: 0,
    interlining: 0,
  };
  const xy = (pts) => pts.map(([x, y]) => ({ x, y }));
  const dto = (p, i) => {
    const xs = p.poly.map((q) => q[0]);
    const ys = p.poly.map((q) => q[1]);
    let area = 0;
    p.poly.forEach((q, j) => {
      const r = p.poly[(j + 1) % p.poly.length];
      area += q[0] * r[1] - r[0] * q[1];
    });
    return {
      id: i + 1,
      name: p.key,
      blockName: p.key,
      layer: '1',
      source: 'fixture',
      poly: xy(p.poly),
      inner: p.inner.map((m) => ({ layer: m.layer, closed: m.closed, pts: xy(m.pts) })),
      bboxW: Math.max(...xs) - Math.min(...xs),
      bboxH: Math.max(...ys) - Math.min(...ys),
      areaCm2: Math.abs(area / 2),
      originX: 0,
      originY: 0,
    };
  };
  const factsOf = (fx) => ({
    pieces: fx.pieces.map((p, i) => ({
      pieceKey: p.key,
      name: p.key,
      piece: dto(p, i),
      piecesPerGarment: p.piecesPerGarment ?? 1,
      cutSymmetry: p.cutSymmetry ?? null,
      cloth: null,
      fused: false,
    })),
    category: fx.category,
    bom: NO_BOM,
    defaultMachineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  });
  const dartSteps = (p) =>
    p.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.feature?.kind === 'dart');
  /** Index of the first join whose unit holds `key`, or Infinity. */
  const firstJoin = (p, key) => {
    const leaves = new Map();
    for (let i = 0; i < p.steps.length; i++) {
      const s = p.steps[i];
      if (!s.outputUnitKey) continue;
      const ls = s.inputs.flatMap((k) => leaves.get(k) ?? [k]);
      leaves.set(s.outputUnitKey, ls);
      if (ls.includes(key)) return i;
    }
    return Infinity;
  };
  const notchWarnings = (p) => p.warnings.filter((w) => w.startsWith('V-notch in the outline'));

  const files = [
    'darts-skirt.json',
    'darts-bodice.json',
    'darts-trouser.json',
    'darts-triangle.json',
    'darts-mirror.json',
    'darts-negative.json',
  ];
  let panel = null;
  for (const f of files) {
    const fx = load(f);
    const facts = factsOf(fx);
    const p = proposeSkeleton(facts, skeletonDeps);
    const ds = dartSteps(p);
    const got = Object.fromEntries(ds.map(({ s }) => [s.feature.pieceKey, s.feature.count]));
    const perPiece = new Map();
    for (const { s } of ds)
      perPiece.set(s.feature.pieceKey, (perPiece.get(s.feature.pieceKey) ?? 0) + 1);
    console.log(
      `  ${fx.id} (${fx.category}): ${p.steps.length} steps; darts ${JSON.stringify(got)}; expected ${JSON.stringify(fx.expect)}`,
    );
    if (verbose) printSteps({ facts: { pieces: facts.pieces } }, p);
    for (const { s, i } of ds) console.log(`     ${i + 1}. ${s.label} — ${s.reason}`);
    for (const w of notchWarnings(p)) console.log(`     · ${w}`);
    const keys = new Set([...Object.keys(fx.expect), ...Object.keys(got)]);
    gate(
      `${fx.id}: darts per piece = ${JSON.stringify(fx.expect)}, one step each`,
      [...keys].every((k) => got[k] === fx.expect[k]) &&
        [...perPiece.values()].every((n) => n === 1),
      JSON.stringify(got),
    );
    gate(
      `${fx.id}: every dart step is a «decide» (confidence ${D.DART_CONFIDENCE} < accept ${D.SKELETON.accept}), geometry, machine + zone`,
      ds.every(
        ({ s }) =>
          s.confidence === D.DART_CONFIDENCE &&
          s.confidence < D.SKELETON.accept &&
          s.source === 'geometry' &&
          s.operationType === 'MACHINE' &&
          !!s.machineType &&
          !!s.zone &&
          !s.zone.endsWith('UNKNOWN') &&
          s.derivedFrom === undefined,
      ),
    );
    const late = ds.filter(({ s, i }) => firstJoin(p, s.feature.pieceKey) < i);
    gate(
      `${fx.id}: every dart step comes before the piece joins anything`,
      late.length === 0,
      late.map(({ s }) => s.feature.pieceKey).join(', '),
    );
    gate(`${fx.id}: frontier sweep clean`, broken(p).length === 0, broken(p).join('; '));
    gate(
      `${fx.id}: V-notch-in-the-outline warnings = ${fx.notchWarnings}`,
      notchWarnings(p).length === fx.notchWarnings,
      `${notchWarnings(p).length}`,
    );
    // The pictogram draws the legs of the piece's own darts over its silhouette.
    const geoms = p.graph.pieces;
    const drawn = [];
    for (const { s } of ds) {
      if (fx.inherited?.[s.feature.pieceKey]) continue;
      const pic = D.unionPicture(D.unionLayout([s.feature.pieceKey], [], geoms), geoms);
      const shape = pic.shapes.find((x) => x.pieceKey === s.feature.pieceKey);
      drawn.push([s.feature.pieceKey, shape?.lines.length ?? 0, s.feature.count]);
    }
    if (drawn.length)
      gate(
        `${fx.id}: the pictogram draws every own dart`,
        drawn.every(([, n, want]) => n === want),
        drawn.map(([k, n]) => `${k} ${n}`).join(', '),
      );
    for (const [k, from] of Object.entries(fx.inherited ?? {})) {
      const st = ds.find(({ s }) => s.feature.pieceKey === k)?.s;
      gate(
        `${fx.id}: ${k} (no lines of its own) takes its mirror ${from}'s count`,
        !!st &&
          st.feature.count === got[from] &&
          st.feature.marks.length === 0 &&
          st.reason.includes(from),
        st ? `${st.feature.count}, marks ${st.feature.marks.length}` : 'no step',
      );
    }
    if (fx.id === 'darts-negative') panel = geoms.find((g) => g.pieceKey === 'PANEL');
  }

  // Press: only with press-open on, as a rider on the dart step.
  {
    const fx = load('darts-skirt.json');
    const on = proposeSkeleton(factsOf(fx), skeletonDeps, { pressOpen: true });
    const off = proposeSkeleton(factsOf(fx), skeletonDeps, { pressOpen: false });
    const riders = (p) =>
      p.steps.filter(
        (s) => s.label === 'Press darts' && p.steps[s.derivedFrom]?.feature?.kind === 'dart',
      );
    gate(
      'darts-skirt: «Press darts» rides on each dart step with press-open on, none with it off',
      riders(on).length === 2 && riders(off).length === 0,
      `${riders(on).length} / ${riders(off).length}`,
    );
  }

  // Controls on the negative fixture: each rule loosened alone lets one vee through.
  if (panel) {
    const R = D.DART_RULES;
    const loosened = {
      'intake ≤ 80': { ...R, intakeMm: [R.intakeMm[0], 80] },
      'depth ≥ 30': { ...R, depthMin: 30 },
      'depth ≥ 1.0 × intake (apex ≤ 60°)': { ...R, depthRatio: 1.0, apexDeg: 60 },
    };
    for (const [name, rules] of Object.entries(loosened)) {
      const n = D.dartsOf(panel, rules).length;
      gate(`control: ${name} → the negative fixture reads a dart (would go red)`, n > 0, `${n}`);
    }
  } else gate('darts-negative: PANEL read', false);

  // Real negatives: every corpus / Downloads file, the product path (segmentPiece → marks → twins).
  const plans = process.env.SKELETON_PLANS ?? resolve(root, '../tmp/plans');
  const downloads = process.env.SKELETON_DOWNLOADS ?? resolve(homedir(), 'Downloads');
  const corpus = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo');
  const REAL = [
    [
      'ss26',
      resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
      'M',
      'shirt',
      true,
    ],
    ['allsizes', resolve(corpus, 'Allsizes_with_notches.dxf'), 'M', 'shirt', true],
    ['blazer', resolve(corpus, 'blazer.dxf'), 'M', 'jacket-lined', true],
    ['pockets', resolve(corpus, 'POCKETS.dxf'), null, 'generic', true],
    ['summer', resolve(corpus, 'summer men.dxf'), null, 'shirt', true],
    ['allsizes-plain', resolve(corpus, 'allsizes.dxf'), null, 'shirt', false],
    ['gerber-summer', resolve(corpus, 'summer men_ganjubas_gerber.dxf'), null, 'shirt', false],
    ['dl-blazer_1', resolve(downloads, 'blazer_1.dxf'), null, 'jacket-lined', false],
    [
      'dl-summer-outline',
      resolve(downloads, 'summer men with pattern outline1.dxf'),
      null,
      'shirt',
      false,
    ],
    ['dl-pockets-2', resolve(downloads, 'POCKETS (2).dxf'), null, 'generic', false],
  ];
  const ANY = { intakeMm: [0, Infinity], depthMin: 0, depthRatio: 0, apexDeg: 180 };
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
  const realGeoms = new Map();
  let anyVeeDarts = 0;
  for (const [id, dxf, want, category, required] of REAL) {
    let buf;
    try {
      buf = readFileSync(dxf);
    } catch {
      if (required) gate(`${id}: DXF found`, false, dxf);
      else console.log(`  ${id}: ${dxf} not found — skipped`);
      continue;
    }
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const bySize = await quietly(() => D.loadInputs(bytes));
    const size =
      want && bySize.has(want)
        ? want
        : [...bySize.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
    const inputs = bySize.get(size) ?? [];
    const geoms = D.twins(inputs.map(D.segmentPiece));
    realGeoms.set(id, geoms);
    const byPiece = D.dartsByPiece(geoms);
    const darts = [...byPiece.values()].reduce((n, d) => n + d.count, 0);
    const vees = geoms.flatMap((g) => (g.marks ?? []).filter((m) => m.kind === 'vee'));
    const notches = geoms.flatMap((g) => D.outlineVNotches(g).map(() => g.pieceKey));
    anyVeeDarts += [...D.dartsByPiece(geoms, ANY).values()].reduce((n, d) => n + d.count, 0);
    // The proposal itself: no dart step, no V-notch warning.
    const facts = { pieces: inputs, category, bom: NO_BOM, defaultMachineType: null };
    const p = inputs.length <= D.SKELETON.maxPieces ? proposeSkeleton(facts, skeletonDeps) : null;
    const steps = p ? dartSteps(p).length : 0;
    const warns = p ? notchWarnings(p).length : 0;
    console.log(
      `  ${id} (size ${size || '—'}, ${geoms.length} pieces): vees ${vees.length}${vees.length ? ` [${vees.map((v) => `${v.id} ${Math.round(v.vee.intakeMm)}×${Math.round(v.vee.depthMm)} ${Math.round(v.vee.apexDeg)}°`).join('; ')}]` : ''}; darts ${darts}; outline V-notches ${notches.length}${notches.length ? ` (${notches.join(', ')})` : ''}; dart steps ${steps}`,
    );
    gate(
      `${id}: 0 darts, 0 dart steps, 0 V-notch warnings (no darts in the file)`,
      darts === 0 && steps === 0 && notches.length === 0 && warns === 0,
      `darts ${darts}, steps ${steps}, notches ${notches.length}`,
    );
  }
  const g = (id, key) => realGeoms.get(id)?.find((x) => x.pieceKey === key);
  {
    const vents = ['3', '4', '17', '18'].map((k) => [k, g('blazer', k)]);
    const back = g('blazer', '3');
    const vent = back?.marks?.find((m) => m.kind === 'vee');
    gate(
      'blazer 3_M: the back vent is a vee (intake ≈ 194 mm) and NOT a dart',
      !!vent && Math.abs(vent.vee.intakeMm - 194) <= 6 && D.dartsOf(back).length === 0,
      vent
        ? `intake ${Math.round(vent.vee.intakeMm)}, depth ${Math.round(vent.vee.depthMm)}, apex ${Math.round(vent.vee.apexDeg)}°`
        : 'no vee',
    );
    gate(
      'blazer 3_M / 4_M / 17_M / 18_M: 0 darts',
      vents.every(([, x]) => x && D.dartsOf(x).length === 0),
      vents.map(([k, x]) => `${k}: ${x ? D.dartsOf(x).length : 'missing'}`).join(', '),
    );
    const bp = g('ss26', 'BP');
    gate('SS26 BP (lines across the shoulders): 0 darts', !!bp && D.dartsOf(bp).length === 0);
    const bp1 = g('allsizes', 'BP_1');
    gate('Allsizes BP_1 (two centre-back lines): 0 darts', !!bp1 && D.dartsOf(bp1).length === 0);
  }
  gate(
    'control: all dart rules off («any vee is a dart») → the real files read darts (the gate above would go red)',
    anyVeeDarts > 0,
    `${anyVeeDarts}`,
  );
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
    // The shirt opens along its plackets: each front's centre edge is sewn to its placket, so no
    // FRONT_L ~ FRONT_R pair is a closure. (Until 10.10 this gate passed on the two 77 mm hem
    // ends, taken as a «closure» on BOM buttons alone — the bug that glued card 49's fronts.)
    const cs = closureSet(p.graph, nm);
    const cfToPlacket = ['FRONT_L', 'FRONT_R'].every((f) =>
      p.graph.chosen.some(
        (c) =>
          [c.a, c.b]
            .map((id) => nm(id.slice(0, id.lastIndexOf('#'))))
            .sort()
            .join('~') === `${f}~PLCK_${f.slice(-1)}`,
      ),
    );
    gate(
      'SS26-005: no closure off the centre front (the fronts open along the plackets)',
      cs === '' && cfToPlacket,
      `closures «${cs}» · fronts sewn to plackets ${cfToPlacket}`,
    );

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

/** Compact card → { graph, facts }: one fresh edge per seam end, twins both ways. */
const synthCard = (spec, rename = {}) => {
  const nm = (n) => rename[n] ?? n;
  const twins = new Map();
  for (const [n, , t, kind] of spec.pieces) {
    if (!t) continue;
    twins.set(n, [...(twins.get(n) ?? []), { key: t, kind }]);
    twins.set(t, [...(twins.get(t) ?? []), { key: n, kind }]);
  }
  const edges = new Map(spec.pieces.map(([n]) => [n, 0]));
  const edge = (n) => {
    const k = edges.get(n);
    edges.set(n, k + 1);
    return `${n}#${k}`;
  };
  const chosen = spec.seams.map(([a, b, score]) => ({
    a: edge(a),
    b: edge(b),
    score,
    evidence: {
      dLenMm: 0,
      relLen: 0,
      notchScore: 0,
      curvature: 'flat',
      hand: 'neutral',
      self: false,
    },
    kind: 'edge',
  }));
  for (const [i, j] of spec.rivals ?? [])
    chosen[i].ambiguousWith = [...(chosen[i].ambiguousWith ?? []), chosen[j]];
  return {
    graph: {
      pieces: spec.pieces.map(([n, area]) => ({
        pieceKey: n,
        name: nm(n),
        hand: null,
        cloth: 'main',
        rs: [],
        corners: [],
        notchIdx: [],
        edges: [],
        rect: false,
        areaMm2: area,
        perimMm: 0,
        twinOf: twins.get(n) ?? [],
      })),
      chosen,
      rejected: [],
      components: [],
      warnings: [],
    },
    facts: {
      pieces: spec.pieces.map(([n]) => ({
        pieceKey: n,
        name: nm(n),
        piecesPerGarment: 1,
        cutSymmetry: null,
        cloth: 'main',
        fused: false,
      })),
      category: spec.category,
      bom: {},
      defaultMachineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
    },
  };
};
/** What each unit of a proposal holds, by its output key. */
const leavesOf = (p) => {
  const m = new Map();
  for (const s of p.steps.filter((x) => x.outputUnitKey))
    m.set(
      s.outputUnitKey,
      s.inputs.flatMap((k) => m.get(k) ?? [k]),
    );
  return m;
};
/** The join whose inputs hold exactly these piece sets (any order), with its step index. */
const joinOf = (p, ...sets) => {
  const m = leavesOf(p);
  const want = sets
    .map((s) => [...s].sort().join('+'))
    .sort()
    .join(' | ');
  const i = p.steps.findIndex(
    (s) =>
      s.outputUnitKey &&
      s.inputs
        .map((k) => [...(m.get(k) ?? [k])].sort().join('+'))
        .sort()
        .join(' | ') === want,
  );
  return { i, step: p.steps[i] };
};
/** The first join that takes `piece` together with something else, and what that is. */
const partnerOf = (p, piece) => {
  const m = leavesOf(p);
  const i = p.steps.findIndex((s) => s.outputUnitKey && s.inputs.some((k) => k === piece));
  const s = p.steps[i];
  return {
    i,
    step: s,
    with: s ? s.inputs.filter((k) => k !== piece).flatMap((k) => m.get(k) ?? [k]) : [],
  };
};
/** The first step whose unit holds every one of these pieces (−1: never). */
const meetAt = (p, ...pieces) => {
  const m = leavesOf(p);
  return p.steps.findIndex(
    (s) => s.outputUnitKey && pieces.every((k) => m.get(s.outputUnitKey)?.includes(k)),
  );
};
/** «PIECE → what it first joins at step i (decision id)». */
const placed = (p, piece) => {
  const j = partnerOf(p, piece);
  return `${piece} → ${j.with.join('+') || 'nothing'} at ${j.i}${j.step?.decision ? ` (${j.step.decision.id})` : ''}`;
};
const cleanGate = (name, p) =>
  gate(
    `${name}: sweep clean, one terminal`,
    !p.warnings.some((w) => /rule \d+ broken|terminal|never reach/.test(w)),
    p.warnings.filter((w) => /rule \d+ broken|terminal|never reach/.test(w)).join('; '),
  );

// ── placement without a seam (07-ENGINE-QUALITY §4.1–4.3) ─────────────────────────────────────
// A part the pattern gives no seam to its panel for (a patch pocket, a bag half, a border strip) is
// still placed while the panel is flat — by name, position word and balance — as a decision, never
// left for the end. Synthetic cards (fixtures/placement.json), each with a mutation or a control.
console.log('\nPlacement without a seam (synthetic, fixtures/placement.json)');
{
  const { cards } = load('placement.json');

  // §4.1 strips: a BOTTOM pocket onto the main strip (not the larger upper one) before the strips meet
  {
    const c = synthCard(cards.strips);
    const p = run(c);
    const pocket = partnerOf(p, 'PCK_BTTM_L');
    const strips = joinOf(p, ['FP_U_L'], ['FP_L', 'PCK_BTTM_L']);
    console.log(`  strips: ${placed(p, 'PCK_BTTM_L')}; strips joined at ${strips.i}`);
    gate(
      'strips: the bottom pocket goes onto the main strip by its position word, as a decision',
      pocket.with.join() === 'FP_L' &&
        pocket.step.decision?.id === 'place:PCK_BTTM_L' &&
        pocket.step.alternatives?.some((a) => a.inputs.includes('FP_U_L')) &&
        pocket.step.confidence < SKELETON.accept,
      placed(p, 'PCK_BTTM_L'),
    );
    gate(
      'strips: … before the two strips meet',
      pocket.i >= 0 && strips.i > pocket.i,
      `${pocket.i} / ${strips.i}`,
    );
    cleanGate('strips', p);
    // Mutation: the position word gone, the pocket goes onto the larger strip (the upper one).
    const m = run(synthCard(cards.strips, { PCK_BTTM_L: 'PCK_L' }));
    gate(
      'mutation: no position word → the larger strip',
      partnerOf(m, 'PCK_BTTM_L').with.join() === 'FP_U_L',
      placed(m, 'PCK_BTTM_L'),
    );
    // Control: a pocket WITH a seam to a strip is step E's — onto that strip, no placement decision.
    const s = synthCard({
      ...cards.strips,
      seams: [...cards.strips.seams, ['PCK_BTTM_L', 'FP_U_L', 0.8]],
    });
    const ps = run(s);
    const js = partnerOf(ps, 'PCK_BTTM_L');
    gate(
      'control: a pocket with a seam to a strip is not placed by name',
      js.with.join() === 'FP_U_L' && !js.step.decision,
      placed(ps, 'PCK_BTTM_L'),
    );
  }

  // §4.2 bag: the belt's seam fits the inner and the outer panel alike (each the other's rival)
  {
    const p = run(synthCard(cards.bag));
    const belt = joinOf(p, ['BLT_1', 'BLT_2'], ['INNER']);
    const border = partnerOf(p, 'BRDR');
    const closed = meetAt(p, 'INNER', 'OUTER');
    console.log(
      `  bag: belt onto INNER at ${belt.i} (${belt.step?.decision?.id ?? 'no decision'}); ${placed(p, 'BRDR')}; bag closed at ${closed}`,
    );
    gate(
      'bag: a belt fitting twin panels alike goes onto INNER (first by name), as a decision with the other beside it',
      belt.i >= 0 &&
        belt.step.decision?.id === 'place:BLT_1+BLT_2' &&
        belt.step.alternatives?.some((a) => a.inputs.includes('OUTER')),
      belt.step ? `${belt.step.decision?.id} ${belt.step.confidence}` : placed(p, 'BLT_1'),
    );
    gate(
      'bag: … before the twin panels meet',
      belt.i >= 0 && closed > belt.i,
      `${belt.i} / ${closed}`,
    );
    // §4.3: the border strip (no role, no seam) onto the panel with no parts yet, before the bag closes.
    gate(
      'bag: the seamless border strip goes onto the panel with no parts, as a guess, before the bag closes',
      border.with.join() === 'OUTER' &&
        border.step.decision?.id === 'orphan:BRDR' &&
        border.step.confidence < SKELETON.accept &&
        closed > border.i,
      placed(p, 'BRDR'),
    );
    cleanGate('bag', p);
  }
  // §4.2 halves: identical bag halves, one named for the back — each on its own panel
  {
    const p = run(synthCard(cards.halves));
    const layered = joinOf(p, ['PCK_L'], ['PCK_B_L']);
    const front = partnerOf(p, 'PCK_L');
    const back = partnerOf(p, 'PCK_B_L');
    console.log(`  halves: ${placed(p, 'PCK_L')}; ${placed(p, 'PCK_B_L')}`);
    gate(
      'halves: PCK_L and PCK_B_L are not joined as layers; one onto the front, one onto the back',
      layered.i < 0 && front.with.join() === 'FP_L' && back.with.join() === 'BP_L',
      `${placed(p, 'PCK_L')}; ${placed(p, 'PCK_B_L')}`,
    );
    cleanGate('halves', p);
    // Control: halves whose names point at no panel (PCK_1_L, PCK_2_L) are still layers of one bag.
    const c = run(synthCard(cards.halves, { PCK_L: 'PCK_1_L', PCK_B_L: 'PCK_2_L' }));
    gate(
      'control: numbered halves with no panel in their names stay layers',
      joinOf(c, ['PCK_L'], ['PCK_B_L']).i >= 0,
      placed(c, 'PCK_L'),
    );
  }
  // §4.3 orphans: a seamless, roleless left placket onto the left panel with the fewest parts
  {
    const p = run(synthCard(cards.orphans));
    const j = partnerOf(p, 'FLP_L');
    console.log(`  orphans: ${placed(p, 'FLP_L')}`);
    gate(
      'orphans: the placket goes onto the left panel with no parts (the sleeve), as a guess at 0.4',
      j.with.join() === 'SLV_L' &&
        j.step.decision?.id === 'orphan:FLP_L' &&
        j.step.alternatives?.length >= 1 &&
        j.step.confidence === 0.4,
      placed(p, 'FLP_L'),
    );
    cleanGate('orphans', p);
    // Mutation: without the pocket on the front, the parts are even — the larger panel takes it.
    const m = run(
      synthCard({
        ...cards.orphans,
        pieces: cards.orphans.pieces.filter(([n]) => n !== 'PCK_L'),
        seams: cards.orphans.seams.filter(([a]) => a !== 'PCK_L'),
      }),
    );
    gate(
      'mutation: parts even → the larger left panel (the front)',
      partnerOf(m, 'FLP_L').with.join() === 'FP_L',
      placed(m, 'FLP_L'),
    );
    // Controls: a piece as large as the sleeve is a copy or a layer of it, not a part (onto the
    // front instead); a bare number («7») says nothing to place it by and is not placed.
    const big = run(
      synthCard({
        ...cards.orphans,
        pieces: cards.orphans.pieces.map((x) => (x[0] === 'FLP_L' ? ['FLP_L', 30000] : x)),
      }),
    );
    gate(
      'control: an orphan as large as a panel is not placed on it',
      [...partnerOf(big, 'FLP_L').with].sort().join() === 'FP_L,PCK_L',
      placed(big, 'FLP_L'),
    );
    const bare = run(synthCard(cards.orphans, { FLP_L: '7' }));
    gate(
      'control: a bare number is not placed',
      !bare.steps.some((s) => s.decision?.id === 'orphan:FLP_L'),
      placed(bare, 'FLP_L'),
    );
  }
}

// ── placement does not depend on the order of the pieces on the card (07 review, major 2) ──────
// E, E2 and E3 rank hosts by evidence (seam, name, position, parts, size); where the evidence ties,
// the last word is the name, then the piece key — never where a piece stands on the card. A tie
// that only the name or key broke is said as a TIE: auto mode leaves it «to decide».
console.log('\nPlacement under reversed and shuffled pieces (synthetic, fixtures/placement.json)');
{
  const { cards } = load('placement.json');
  /** The proposal as a set: each join's inputs (by leaves), its unit, its decision, and a tie. */
  const signature = (p) => {
    const m = leavesOf(p);
    return p.steps
      .filter((s) => s.outputUnitKey)
      .map(
        (s) =>
          `${s.outputUnitName} ← ${s.inputs
            .map((k) => [...(m.get(k) ?? [k])].sort().join('+'))
            .sort()
            .join(
              ' | ',
            )}${s.decision ? ` [${s.decision.id}=${s.decision.chosen}${s.decision.tie ? ' tie' : ''}]` : ''}`,
      )
      .sort();
  };
  const r = rng(7041);
  for (const [name, spec] of Object.entries(cards)) {
    const base = signature(run(synthCard(spec)));
    const orders = [
      ['reversed', [...spec.pieces].reverse()],
      ...Array.from({ length: 5 }, (_, i) => [`shuffle #${i + 1}`, shuffled(spec.pieces, r)]),
    ];
    const differ = [];
    for (const [how, pieces] of orders) {
      const sig = signature(run(synthCard({ ...spec, pieces })));
      const only = (a, b) => a.filter((x) => !b.includes(x));
      if (sig.join('\n') !== base.join('\n'))
        differ.push(`${how}: ${only(sig, base).join('; ')} (was ${only(base, sig).join('; ')})`);
    }
    gate(
      `${name}: the same joins, units and decisions under reversed and 5 shuffled piece orders`,
      differ.length === 0,
      differ.join(' · '),
    );
  }
  // The bag's belt fits INNER and OUTER alike (twins, no parts on either): the engine's reading is
  // INNER by name, said as a tie — not a pick auto mode may tick.
  const p = run(synthCard(cards.bag));
  const belt = p.steps.find((s) => s.decision?.id === 'place:BLT_1+BLT_2');
  gate(
    'bag: the belt on twin panels is a tie decision (INNER by name, OUTER beside it)',
    !!belt?.decision?.tie && belt.inputs.includes('INNER'),
    belt ? JSON.stringify(belt.decision) : 'no place decision',
  );
  // E2 and E3 ties of their own: twin strips for a seamless pocket, twin panels for an orphan.
  for (const [card, id] of [
    ['twinStrips', 'place:PCK_L'],
    ['twinOrphan', 'orphan:TAB_L'],
  ]) {
    const t = run(synthCard(cards[card]));
    const st = t.steps.find((s) => s.decision?.id === id);
    gate(
      `${card}: ${id} is a tie decision, said in words, the other host beside it`,
      !!st?.decision?.tie && /alike/.test(st.decision.tie) && (st.alternatives?.length ?? 0) >= 1,
      st ? JSON.stringify(st.decision) : `no ${id}`,
    );
  }
  // A pinned reading 0 is a person's: no longer a tie.
  {
    const c = synthCard(cards.bag);
    const pinned = buildSkeleton(c.graph, c.facts, orderTemplate('generic'), skeletonDeps, {
      pins: { 'place:BLT_1+BLT_2': 0 },
    });
    const belt = pinned.steps.find((s) => s.decision?.id === 'place:BLT_1+BLT_2');
    gate(
      'bag: reading 0 pinned by a person is not a tie',
      !!belt && !belt.decision.tie,
      JSON.stringify(belt?.decision),
    );
  }
  // Control: the strips' pocket is placed by its position word — evidence, not a tie.
  const st = run(synthCard(cards.strips));
  const pocket = st.steps.find((s) => s.decision?.id === 'place:PCK_BTTM_L');
  gate(
    'control: a placement by evidence (position word) is no tie',
    !!pocket && !pocket.decision.tie,
    pocket ? JSON.stringify(pocket.decision) : 'no place decision',
  );
}

// ── same-shape warnings once per pair of name families (07-ENGINE-QUALITY §4.8) ──────────────
// Lane A says every unproven same-shape pair: 8 inner and 8 outer panels of one shape were 64 lines
// on the screen. Grouped by name stems they are one question; a lone pair keeps lane A's words.
console.log('\nSame-shape warnings by family (synthetic)');
{
  const inner = Array.from({ length: 8 }, (_, i) => [`inner_trapezoid_${i + 1}`, 20000]);
  const outer = Array.from({ length: 8 }, (_, i) => [`outer_trapezoid_${i + 1}`, 20000]);
  const card = synthCard({
    category: 'generic',
    pieces: [...inner, ...outer, ['BP', 90000], ['17', 90000]],
    seams: [],
  });
  const tail = ' have the same shape — a layer, the lining or a copy? not joined to each other';
  card.graph.warnings = [
    ...inner.flatMap(([a]) => outer.map(([b]) => `${a} and ${b}${tail}`)),
    `17 and BP${tail}`,
  ];
  const p = run(card);
  const said = p.warnings.filter((w) => w.includes('have the same shape'));
  for (const w of said) console.log(`  · ${w}`);
  gate(
    "64 inner × outer pairs are said once by family, the lone pair in lane A's words",
    said.length === 2 &&
      said.includes(`inner_trapezoid ×8 and outer_trapezoid ×8${tail}`) &&
      said.includes(`17 and BP${tail}`),
    `${said.length} lines`,
  );
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
