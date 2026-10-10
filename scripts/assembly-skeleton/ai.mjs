#!/usr/bin/env node
// E3 (stand-in for the paid run) — THE AI SECOND OPINION, MAPPED. The model's answer is a STUB; the
// rest is real: the engine reads SS26-005 and the lined blazer, the panel's request builder turns
// each proposal into a SuggestAssemblySkeleton request, and the panel's mappers turn a stubbed
// answer back into pins (→ a REBUILT proposal) and a reordered proposal — both checked by the same
// frontier rules «apply» checks (rules 1–3, 6, 7).
//
//   1  the request is one the server accepts: the bounds of assembly_skeleton_ai.go restated here
//      (unique ids, riders follow an earlier step, one maker per unit, decisions known, ≤ 80 pieces)
//   2  picks → pins → rebuilt proposal: every pick lands on its decision, the order stays clean
//   3  order → reordered proposal: the same steps, riders after their join, every unit made before
//      it is taken, the order stays clean — and the proposal it was read from is NOT touched
//   4  refusals, in words: a unit before its maker, a step left out, a proposal that changed since
//      the AI read it (a reading chosen in between)
//
//   node scripts/assembly-skeleton/ai.mjs [--verbose]
//   node scripts/assembly-skeleton/ai.mjs --mutate-no-dependency-check   gate 4a MUST fail
//   node scripts/assembly-skeleton/ai.mjs --mutate-in-place              gate 3 «not touched» MUST fail

import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const verbose = process.argv.includes('--verbose');
const MUT_DEP = process.argv.includes('--mutate-no-dependency-check');
const MUT_INPLACE = process.argv.includes('--mutate-in-place');

// Mutations live in the bundler's memory, never in the file.
const DEP_FIX = `if (m != null && m >= at)`;
const DEP_BROKEN = `if (false && m != null && m >= at)`;
const INPLACE_FIX = `return { ok: true, proposal: { ...proposal, steps: reordered }, moved };`;
const INPLACE_BROKEN = `proposal.steps.splice(0, proposal.steps.length, ...reordered);\n  return { ok: true, proposal, moved };`;
const plugins =
  MUT_DEP || MUT_INPLACE
    ? [
        {
          name: 'ai-mutation',
          setup(b) {
            b.onLoad({ filter: /assembly-skeleton\/ai\.ts$/ }, async (args) => {
              let src = await readFile(args.path, 'utf8');
              const [fix, broken] = MUT_DEP ? [DEP_FIX, DEP_BROKEN] : [INPLACE_FIX, INPLACE_BROKEN];
              if (!src.includes(fix)) throw new Error('mutation did not find its line');
              src = src.replace(fix, broken);
              return { contents: src, loader: 'ts' };
            });
          },
        },
      ]
    : [];

const outfile = resolve(tmpdir(), `assembly-skeleton-ai-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'ai-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
  plugins,
  define: { 'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}' },
  alias: Object.fromEntries(
    [
      'components',
      'lib',
      'api',
      'utils',
      'ui',
      'constants',
      'store',
      'hooks',
      'context',
      'types',
    ].map((a) => [a, resolve(root, 'src', a)]),
  ),
});
const E = await import(pathToFileURL(outfile).href);

let failed = 0;
const gate = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const quietly = async (f) => {
  const keep = [console.log, console.warn];
  console.log = console.warn = () => {};
  try {
    return await f();
  } finally {
    [console.log, console.warn] = keep;
  }
};
const dxf = (p) => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

const plans = process.env.SKELETON_PLANS ?? resolve(root, '../tmp/plans');
const cards = [];
{
  const p = resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf');
  if (existsSync(p)) {
    const { facts } = await quietly(() => E.loadFacts(dxf(p), 'M', 'shirt'));
    cards.push({ name: 'SS26-005 shirt', facts: { ...facts, category: 'shirt' } });
  }
  const b = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo/blazer.dxf');
  if (existsSync(b)) {
    const { facts } = await quietly(() => E.loadFacts(dxf(b), 'M', 'jacket-lined'));
    cards.push({
      name: 'blazer (lined, 46 pieces)',
      facts: { ...facts, category: 'jacket-lined' },
    });
  }
}
if (cards.length === 0) {
  console.log(`FAIL  no fixture under ${plans} (SKELETON_PLANS) — nothing was probed`);
  process.exit(1);
}

const seamWords = (s) => `score ${s.score.toFixed(2)}, ${s.kind}`;
const sweep = (facts, steps) => {
  const pieces = facts.pieces.map((p) => ({ lineKey: p.pieceKey, name: p.name }));
  const keys = new Set(pieces.map((p) => p.lineKey));
  return E.assemblySweep(
    pieces,
    steps.map((s) => ({
      inputs: E.classifyAssemblyInputs(keys, s.inputs),
      outputUnitKey: s.outputUnitKey,
      outputUnitName: s.outputUnitName,
    })),
  ).violations.filter((v) => v.rule !== 4);
};

/** The server's request doors (assembly_skeleton_ai.go skeletonAIInputOf), restated. */
function serverRefusal(req) {
  const B = E.SKELETON_AI;
  const runes = (s) => [...(s ?? '')].length;
  if (!req.pieces.length || req.pieces.length > B.maxPieces) return 'pieces count';
  if (!req.steps.length || req.steps.length > B.maxSteps) return 'steps count';
  if (req.seams.length > B.maxSeams) return 'seams count';
  if (req.decisions.length > B.maxDecisions) return 'decisions count';
  const CLOTH = new Set([
    '',
    'main',
    'lining',
    'pocketing',
    'interfacing',
    'insulation',
    'contrast',
    'mesh',
    'other',
  ]);
  const pieces = new Set();
  for (const p of req.pieces) {
    if (!p.key || pieces.has(p.key) || runes(p.key) > B.keyRunes) return `piece key ${p.key}`;
    if (runes(p.name) > B.nameRunes) return `piece name ${p.key}`;
    if (!CLOTH.has(p.cloth)) return `cloth ${p.cloth}`;
    if (!['', 'L', 'R'].includes(p.hand)) return `hand ${p.hand}`;
    if (p.count < 0 || p.count > 20) return `count ${p.count}`;
    pieces.add(p.key);
  }
  for (const s of req.seams) {
    if (!pieces.has(s.a) || !pieces.has(s.b)) return `seam ${s.a}/${s.b}`;
    if (!(s.score >= 0 && s.score <= 1)) return `seam score ${s.score}`;
    if (!['edge', 'partial', 'composite', 'surface', 'closure'].includes(s.kind))
      return `seam kind ${s.kind}`;
    if (runes(s.evidence) > B.evidenceRunes) return 'seam evidence';
  }
  const inputsOk = (ins) =>
    ins.length >= 1 && ins.length <= B.maxInputs && ins.every((k) => k && runes(k) <= B.keyRunes);
  const decisions = new Set();
  for (const d of req.decisions) {
    if (!d.id || decisions.has(d.id)) return `decision ${d.id}`;
    if (d.readings.length < 2 || d.readings.length > B.maxReadings) return `readings of ${d.id}`;
    if (d.chosen < 0 || d.chosen >= d.readings.length) return `chosen of ${d.id}`;
    if (!d.readings.every((r) => inputsOk(r.inputs) && runes(r.reason) <= B.reasonRunes))
      return `reading of ${d.id}`;
    decisions.add(d.id);
  }
  const ids = new Map();
  const units = new Set();
  const OPS = ['MACHINE', 'PRESS', 'PRESS_OPEN', 'FUSING', 'HANDWORK'];
  req.steps.forEach((s, i) => {
    if (ids.has(s.id)) throw new Error(`step id ${s.id} twice`);
    ids.set(s.id, i);
  });
  let ordered = 0;
  for (const [i, s] of req.steps.entries()) {
    if (!OPS.includes(s.operation)) return `operation ${s.operation}`;
    if (s.outputUnit && (units.has(s.outputUnit) || pieces.has(s.outputUnit)))
      return `unit ${s.outputUnit}`;
    if (s.outputUnit) units.add(s.outputUnit);
    if (s.decisionId && !decisions.has(s.decisionId)) return `decision of ${s.id}`;
    if (!inputsOk(s.inputs)) return `inputs of ${s.id}`;
    if (runes(s.label) > B.labelRunes || runes(s.outputName) > B.nameRunes)
      return `words of ${s.id}`;
    if (s.follows) {
      const j = ids.get(s.follows);
      if (j == null || j >= i) return `${s.id} follows ${s.follows}`;
    } else ordered++;
  }
  if (!ordered) return 'no ordered step';
  return null;
}

/** A DIFFERENT valid order of the ordered steps: Kahn's sort taking the LATEST ready step first. */
function otherOrder(req) {
  const riders = new Map();
  for (const s of req.steps)
    if (s.follows) riders.set(s.follows, [...(riders.get(s.follows) ?? []), s.id]);
  const group = (id) => [id, ...(riders.get(id) ?? []).flatMap(group)];
  const ordered = req.steps.filter((s) => !s.follows).map((s) => s.id);
  const byId = new Map(req.steps.map((s) => [s.id, s]));
  const maker = new Map(req.steps.filter((s) => s.outputUnit).map((s) => [s.outputUnit, s.id]));
  const rootOf = (id) => (byId.get(id).follows ? rootOf(byId.get(id).follows) : id);
  const needs = new Map(
    ordered.map((id) => [
      id,
      new Set(
        group(id)
          .flatMap((g) => byId.get(g).inputs)
          .map((k) => maker.get(k))
          .filter((m) => m && rootOf(m) !== id)
          .map(rootOf),
      ),
    ]),
  );
  // Work on a piece / unit (outputUnit empty) comes before the join that sews it on.
  for (const id of ordered) {
    const st = byId.get(id);
    if (st.outputUnit) continue;
    for (const k of st.inputs) {
      const consumer = ordered.find(
        (c) => c !== id && byId.get(c).outputUnit && byId.get(c).inputs.includes(k),
      );
      if (consumer) needs.get(consumer).add(id);
    }
  }
  const done = new Set();
  const out = [];
  while (out.length < ordered.length) {
    const ready = ordered.filter(
      (id) => !done.has(id) && [...needs.get(id)].every((n) => done.has(n)),
    );
    if (!ready.length) throw new Error('cycle');
    const pick = ready[ready.length - 1];
    done.add(pick);
    out.push({ stepId: pick, reason: 'stub: latest ready first' });
  }
  return out;
}

for (const card of cards) {
  console.log(`\n${card.name}`);
  const { facts } = card;
  const proposal = E.proposeSkeleton(facts, E.skeletonDeps);
  const stages = E.orderTemplate(facts.category).stages.map((s) => s.label);
  const built = E.skeletonAIRequest({
    proposal,
    facts,
    templateStages: stages,
    seamWords,
    techCardId: 1,
  });
  gate('1 the panel builds a request', built.ok, built.ok ? '' : built.why);
  if (!built.ok) continue;
  const req = built.request;
  const refusal = serverRefusal(req);
  const bytes = JSON.stringify(req).length;
  gate(
    `1 the server would accept it: ${req.pieces.length} pieces · ${req.steps.length} steps (${req.steps.filter((s) => !s.follows).length} ordered) · ${req.seams.length} seams · ${req.decisions.length} decisions · ${bytes} B`,
    refusal == null && bytes < 128 * 1024,
    refusal ?? '',
  );

  // ── 2. picks → pins → rebuilt proposal ──
  const picks = req.decisions.map((d) => ({
    decisionId: d.id,
    reading: (d.chosen + 1) % d.readings.length,
    reason: 'stub: the other reading',
  }));
  const answer = { order: otherOrder(req), picks, warnings: [], notes: [] };
  const { pins, changed } = E.skeletonAIPins(proposal, answer);
  gate(
    `2 every pick differs from the reading on screen (${changed}/${picks.length})`,
    changed === picks.length,
  );
  if (picks.length) {
    const rebuilt = E.proposeSkeleton(facts, E.skeletonDeps, { pins });
    const landed = picks.filter((p) => {
      const s = rebuilt.steps.find((st) => st.decision?.id === p.decisionId);
      // A decision a chosen reading made moot (its join disappeared) is not «landed wrong».
      return !s || s.decision.chosen === p.reading;
    });
    gate(`2 each pick is the reading the rebuilt proposal carries`, landed.length === picks.length);
    const v = sweep(facts, rebuilt.steps);
    gate(
      `2 rebuilt on the AI readings: ${rebuilt.steps.length} steps, rules 1–3/6/7 clean`,
      v.length === 0,
      v
        .map((x) => x.message)
        .slice(0, 3)
        .join('; '),
    );
    const stale = E.applySkeletonAIOrder(rebuilt, answer.order, built.signatures);
    const sameSteps =
      JSON.stringify(E.skeletonStepSignatures(rebuilt.steps).sort()) ===
      JSON.stringify([...built.signatures].sort());
    gate(
      '4c an order read before the readings changed is refused on the rebuilt proposal',
      sameSteps ? stale.ok : !stale.ok && /changed/.test(stale.why),
      stale.ok ? (sameSteps ? 'readings left the steps as they were' : 'APPLIED') : stale.why,
    );
  } else console.log('  (no decision on this card — picks gate skipped)');

  // ── 3. order → reordered proposal ──
  const before = JSON.stringify(proposal.steps);
  const res = E.applySkeletonAIOrder(proposal, answer.order, built.signatures);
  gate(
    '3 the AI order applies',
    res.ok,
    res.ok ? `${res.moved} of ${proposal.steps.length} steps move` : res.why,
  );
  gate(
    '3 the proposal it was read from is not touched (shown, not applied)',
    JSON.stringify(proposal.steps) === before,
  );
  if (res.ok) {
    const r = res.proposal.steps;
    gate(
      '3 the same steps, nothing lost or invented',
      JSON.stringify(E.skeletonStepSignatures(r).sort()) ===
        JSON.stringify([...built.signatures].sort()),
    );
    const ridersOk = r.every(
      (s, i) =>
        s.derivedFrom == null || s.derivedFrom < 0 || (s.derivedFrom < i && r[s.derivedFrom]),
    );
    gate('3 every rider follows its join', ridersOk);
    const v = sweep(facts, r);
    gate(
      '3 reordered: rules 1–3/6/7 clean',
      v.length === 0,
      v
        .map((x) => x.message)
        .slice(0, 3)
        .join('; '),
    );
    const places = E.skeletonAIPlaces(res.proposal, answer.order, built.signatures);
    const placedRight = answer.order.every((o, n) => places.some((p) => p?.place === n + 1));
    gate('3 every AI place is found on the reordered proposal', placedRight);
    if (verbose)
      console.log('   ' + r.map((s) => s.label || s.outputUnitName || s.operationType).join(' → '));
  }

  // ── 4. refusals ──
  const ordered = req.steps.filter((s) => !s.follows).map((s) => s.id);
  const consumer = req.steps.find(
    (s) => !s.follows && s.inputs.some((k) => req.steps.some((m) => m.outputUnit === k)),
  );
  if (consumer) {
    const makerId = req.steps.find((m) => consumer.inputs.includes(m.outputUnit)).id;
    const rootOf = (id) => {
      const st = req.steps.find((x) => x.id === id);
      return st.follows ? rootOf(st.follows) : id;
    };
    const mk = rootOf(makerId);
    const bad = [consumer.id, ...ordered.filter((id) => id !== consumer.id)].map((stepId) => ({
      stepId,
    }));
    const r = E.applySkeletonAIOrder(proposal, bad, built.signatures);
    gate(
      `4a a unit taken before its maker (${consumer.id} before ${mk}) is refused`,
      !r.ok && /before the step that makes it/.test(r.why),
      r.ok ? 'APPLIED' : r.why,
    );
  }
  const short = E.applySkeletonAIOrder(
    proposal,
    ordered.slice(1).map((stepId) => ({ stepId })),
    built.signatures,
  );
  gate(
    '4b an order that leaves a step out is refused',
    !short.ok && /leaves steps out/.test(short.why),
    short.ok ? 'APPLIED' : short.why,
  );
  // 4c work on a unit after the join that sews it on: take the stub's valid order and move one
  // own processing step (no output unit) to the very end.
  const work = req.steps.find(
    (s) =>
      !s.follows &&
      !s.outputUnit &&
      s.inputs.some((k) => req.steps.some((c) => c.outputUnit && c.inputs.includes(k))),
  );
  if (work) {
    const good = otherOrder(req).map((o) => o.stepId);
    const late = [...good.filter((id) => id !== work.id), work.id].map((stepId) => ({ stepId }));
    const r = E.applySkeletonAIOrder(proposal, late, built.signatures);
    gate(
      `4c work on a unit after it was sewn on (${work.id} last) is refused`,
      !r.ok && /after it was sewn into the next unit/.test(r.why),
      r.ok ? 'APPLIED' : r.why,
    );
  }
}

console.log(failed ? `\n${failed} gate(s) FAILED` : '\nall gates pass');
process.exit(failed ? 1 : 0);
