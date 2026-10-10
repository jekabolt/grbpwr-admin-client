// THE AI SECOND OPINION ON A SKELETON (lane E) — the pure half: the proposal as the request
// SuggestAssemblySkeleton reads, and the answer mapped back onto the engine's own levers.
//
//   proposal → skeletonAIRequest → (server, one paid call) → answer
//   answer.picks → skeletonAIPins → SkeletonOptions.pins → the engine REBUILDS the proposal
//   answer.order → applySkeletonAIOrder → the same steps, reordered (riders after their join)
//
// Nothing here calls the server or touches the form; the panel does both, and only on a press.
// The answer refers to the steps by the ids the REQUEST gave them (s1…), so a mapped order is only
// valid on a proposal whose steps are the ones that were sent: the steps are matched by what they
// do (`skeletonStepSignatures`), never by position, and a proposal that changed in between (another
// reading chosen) is refused in words instead of being reordered wrong.
import type {
  AssemblySkeletonPiece,
  AssemblySkeletonSeam,
  SuggestAssemblySkeletonRequest,
  SuggestAssemblySkeletonResponse,
} from 'api/proto-http/admin';

import { SKELETON_CATEGORIES } from './skeleton';
import { pieceKeyOf } from './union';
import type {
  ClothState,
  SeamCandidate,
  SkeletonCategory,
  SkeletonFacts,
  SkeletonPins,
  SkeletonProposal,
  SkeletonStep,
  SkeletonUnitHint,
} from './types';

/** The server's bounds (assembly_skeleton_ai.go) — a request over them is refused, so say it first. */
export const SKELETON_AI = {
  maxPieces: 80,
  maxSteps: 240,
  maxSeams: 400,
  maxDecisions: 60,
  maxReadings: 6,
  maxInputs: 16,
  keyRunes: 64,
  nameRunes: 80,
  labelRunes: 120,
  evidenceRunes: 160,
  reasonRunes: 200,
  stageRunes: 80,
  maxStages: 40,
} as const;

const cut = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  const r = [...t];
  return r.length > n ? r.slice(0, n).join('').trim() : t;
};

const CLOTH: Partial<Record<ClothState, string>> = {
  main: 'main',
  contrast: 'contrast',
  lining: 'lining',
  pocketing: 'pocketing',
  mesh: 'mesh',
  interfacing: 'interfacing',
  insulation: 'insulation',
  other: 'other',
};

const SEAM_KIND: Record<SeamCandidate['kind'], string> = {
  edge: 'edge',
  partial: 'partial',
  composite: 'composite',
  surface: 'surface',
  'closure-not-seam': 'closure',
};

/** The id a step carries in the request (and the answer): its place in the proposal, 1-based. */
export const skeletonAIStepId = (i: number) => `s${i + 1}`;

/**
 * The id a decision carries in the request (and the answer). A decision id names its pieces, so a
 * card with long piece names makes one over the server's 64 runes — and the whole ask is refused.
 * A long id is cut and tagged with a hash of the whole: a function of the id alone, so it survives
 * a rebuild exactly as the id does.
 */
export function skeletonAIDecisionKey(id: string): string {
  const r = [...id];
  if (r.length <= SKELETON_AI.keyRunes) return id;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return `${r.slice(0, SKELETON_AI.keyRunes - 9).join('')}~${(h >>> 0).toString(16).padStart(8, '0')}`;
}

const isRider = (s: SkeletonStep) => s.derivedFrom != null && s.derivedFrom >= 0;

/**
 * A step by WHAT it does, not where it sits or which code its unit got: operation, label and the
 * pieces each input holds. Two proposals of one card (before and after a chosen reading, before and
 * after a reorder) share every step the change did not touch.
 */
export function skeletonStepSignatures(steps: readonly SkeletonStep[]): string[] {
  const leaves = new Map<string, string>();
  const seen = new Map<string, number>();
  // Leaves first, in a dependency order that does not depend on the steps' order: a step's unit is
  // known before any step that takes it, whatever order the list is in.
  const pending = steps.map((s, i) => i);
  const sig: string[] = new Array(steps.length);
  let guard = steps.length + 1;
  while (pending.length && guard-- > 0) {
    for (let j = 0; j < pending.length; ) {
      const s = steps[pending[j]];
      const waits = s.inputs.some(
        (k) => !leaves.has(k) && steps.some((o) => o.outputUnitKey === k && o !== s),
      );
      if (waits) {
        j += 1;
        continue;
      }
      const parts = s.inputs.map((k) => leaves.get(k) ?? k).sort();
      if (s.outputUnitKey) leaves.set(s.outputUnitKey, parts.join('+').split('+').sort().join('+'));
      sig[pending[j]] = `${s.operationType}|${s.label ?? ''}|${parts.join(' | ')}`;
      pending.splice(j, 1);
    }
  }
  // A cycle (never from the engine) keeps the plain inputs.
  for (const i of pending)
    sig[i] = `${steps[i].operationType}|${steps[i].label ?? ''}|${steps[i].inputs.join(' | ')}`;
  return sig.map((base) => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

export type SkeletonAIRequestResult =
  | { ok: true; request: SuggestAssemblySkeletonRequest; signatures: string[] }
  | { ok: false; why: string };

/**
 * The proposal as SuggestAssemblySkeleton reads it. Refuses, in words, what the server would refuse:
 * too many pieces / steps, a key longer than the server's bound, a step with too many inputs.
 * `seamWords` is the panel's own evidence sentence («518 = 518 mm, 2 notches»).
 */
export function skeletonAIRequest(args: {
  proposal: SkeletonProposal;
  facts: SkeletonFacts;
  templateStages: readonly string[];
  seamWords: (s: SeamCandidate) => string;
  techCardId?: number;
}): SkeletonAIRequestResult {
  const { proposal, facts } = args;
  const steps = proposal.steps;
  if (steps.length === 0) return { ok: false, why: 'no step to give an opinion on' };
  if (steps.length > SKELETON_AI.maxSteps)
    return {
      ok: false,
      why: `${steps.length} steps — the AI reads at most ${SKELETON_AI.maxSteps}`,
    };
  if (facts.pieces.length > SKELETON_AI.maxPieces)
    return {
      ok: false,
      why: `${facts.pieces.length} pieces — the AI reads at most ${SKELETON_AI.maxPieces}`,
    };

  const hand = new Map((proposal.graph?.pieces ?? []).map((p) => [p.pieceKey, p.hand]));
  const pieces: AssemblySkeletonPiece[] = [];
  for (const p of facts.pieces) {
    if ([...p.pieceKey].length > SKELETON_AI.keyRunes)
      return { ok: false, why: `piece key ${p.pieceKey.slice(0, 20)}… is too long for the AI` };
    pieces.push({
      key: p.pieceKey,
      name: cut(p.name, SKELETON_AI.nameRunes),
      cloth: (p.cloth && CLOTH[p.cloth]) || '',
      hand: hand.get(p.pieceKey) ?? '',
      count: Math.max(1, Math.min(20, Math.round(p.piecesPerGarment || 1))),
      fused: p.fused,
    });
  }
  const known = new Set(pieces.map((p) => p.key ?? ''));

  // The seams the graph chose and the alternatives it hesitated over, best first, within the bound.
  const seamList: SeamCandidate[] = [];
  const seenSeam = new Set<string>();
  for (const c of proposal.graph?.chosen ?? []) {
    for (const s of [c, ...(c.ambiguousWith ?? [])]) {
      const k = `${s.a}|${s.b}`;
      if (seenSeam.has(k)) continue;
      seenSeam.add(k);
      seamList.push(s);
    }
  }
  seamList.sort((x, y) => y.score - x.score);
  const seams: AssemblySkeletonSeam[] = [];
  for (const s of seamList) {
    if (seams.length === SKELETON_AI.maxSeams) break;
    const a = pieceKeyOf(s.a);
    const b = pieceKeyOf(s.b);
    if (!known.has(a) || !known.has(b)) continue;
    seams.push({
      a,
      b,
      score: Math.max(0, Math.min(1, Number.isFinite(s.score) ? s.score : 0)),
      kind: SEAM_KIND[s.kind] ?? 'edge',
      evidence: cut(args.seamWords(s), SKELETON_AI.evidenceRunes),
    });
  }

  const inputsOk = (inputs: string[]) =>
    inputs.length > 0 &&
    inputs.length <= SKELETON_AI.maxInputs &&
    inputs.every((k) => k.trim() !== '' && [...k].length <= SKELETON_AI.keyRunes);

  const decisions: NonNullable<SuggestAssemblySkeletonRequest['decisions']> = [];
  for (const s of steps) {
    if (!s.decision) continue;
    // The readings in their stable order: the chosen one spliced back in at its place.
    const readings = [...(s.alternatives ?? [])];
    readings.splice(Math.min(s.decision.chosen, readings.length), 0, {
      inputs: s.inputs,
      seams: s.seams,
      reason: s.reason,
    });
    if (readings.length < 2) continue;
    if (decisions.length === SKELETON_AI.maxDecisions)
      return { ok: false, why: `more than ${SKELETON_AI.maxDecisions} open decisions for the AI` };
    if (readings.length > SKELETON_AI.maxReadings || !readings.every((r) => inputsOk(r.inputs)))
      return { ok: false, why: `decision ${s.decision.id} has readings the AI cannot take` };
    decisions.push({
      id: skeletonAIDecisionKey(s.decision.id),
      chosen: Math.min(s.decision.chosen, readings.length - 1),
      readings: readings.map((r) => ({
        inputs: r.inputs,
        reason: cut(r.reason ?? '', SKELETON_AI.reasonRunes),
      })),
    });
  }
  const decisionKeys = new Set(decisions.map((d) => d.id));

  const reqSteps: NonNullable<SuggestAssemblySkeletonRequest['steps']> = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!inputsOk(s.inputs))
      return { ok: false, why: `step ${i + 1} has inputs the AI cannot take` };
    // A rider (a press, a hem on the unit a join made) follows the join at the root of its chain.
    let root = isRider(s) ? s.derivedFrom! : null;
    while (root != null && root < i && isRider(steps[root])) root = steps[root].derivedFrom!;
    reqSteps.push({
      id: skeletonAIStepId(i),
      inputs: s.inputs,
      outputUnit: s.outputUnitKey,
      outputName: cut(s.outputUnitName ?? '', SKELETON_AI.nameRunes),
      operation: s.operationType,
      label: cut(s.label ?? '', SKELETON_AI.labelRunes),
      confidence: Math.max(0, Math.min(1, Number.isFinite(s.confidence) ? s.confidence : 0)),
      decisionId:
        s.decision && decisionKeys.has(skeletonAIDecisionKey(s.decision.id))
          ? skeletonAIDecisionKey(s.decision.id)
          : '',
      follows: root != null && root < i ? skeletonAIStepId(root) : '',
    });
  }

  return {
    ok: true,
    signatures: skeletonStepSignatures(steps),
    request: {
      techCardId: args.techCardId ?? 0,
      category: cut(facts.category, 32),
      templateStages: args.templateStages
        .slice(0, SKELETON_AI.maxStages)
        .map((t) => cut(t, SKELETON_AI.stageRunes)),
      pieces,
      seams,
      decisions,
      steps: reqSteps,
      force: false,
      // The categories the engine has a template for: the AI may read the garment as one of them —
      // a garment, so not «bottom» (the pieces' «trousers or a skirt»): that is what it settles.
      categoryOptions: SKELETON_CATEGORIES.filter((c) => c !== 'bottom'),
      // none from the panel: the server shows the model the workshop's own trees (house style)
      examples: [],
    },
  };
}

/**
 * The AI's picks as pins over the readings the proposal was built with. `changed` = how many picks
 * differ from the reading on screen (0 = the AI agrees; nothing to apply).
 */
export function skeletonAIPins(
  proposal: SkeletonProposal,
  answer: SuggestAssemblySkeletonResponse,
): { pins: SkeletonPins; changed: number } {
  const pins: Record<string, number> = {};
  const byKey = new Map<string, string>();
  for (const s of proposal.steps)
    if (s.decision) {
      pins[s.decision.id] = s.decision.chosen;
      byKey.set(skeletonAIDecisionKey(s.decision.id), s.decision.id);
    }
  let changed = 0;
  for (const p of answer.picks ?? []) {
    const id = byKey.get(p.decisionId ?? '');
    if (id == null) continue;
    const reading = p.reading ?? 0;
    if (pins[id] !== reading) changed += 1;
    pins[id] = reading;
  }
  return { pins, changed };
}

/**
 * The AI's structural reading as the engine's options («use AI structure»): the category it reads
 * the pieces as (only one the engine has a template for, and only when it differs from the one on
 * screen) and its units, kept to the card's own pieces (a unit of fewer than two of them says
 * nothing). `changes` = 0 → the AI keeps the structure on screen; the door stays shut.
 */
export function skeletonAIStructure(
  facts: SkeletonFacts,
  answer: SuggestAssemblySkeletonResponse,
): {
  category: SkeletonCategory | null;
  categoryReason: string;
  units: SkeletonUnitHint[];
  changes: number;
} {
  const id = answer.aiCategory?.id?.trim() ?? '';
  const known = (SKELETON_CATEGORIES as string[]).includes(id);
  const category = known && id !== facts.category ? (id as SkeletonCategory) : null;
  const pieces = new Set(facts.pieces.map((p) => p.pieceKey));
  const units: SkeletonUnitHint[] = [];
  for (const u of answer.units ?? []) {
    const keys = [...new Set((u.pieceKeys ?? []).filter((k) => pieces.has(k)))];
    if (keys.length < 2) continue;
    units.push({
      pieceKeys: keys,
      name: cut(u.name ?? '', SKELETON_AI.nameRunes) || 'unit',
      ...(u.reason ? { reason: cut(u.reason, SKELETON_AI.reasonRunes) } : {}),
    });
  }
  return {
    category,
    categoryReason: category ? cut(answer.aiCategory?.reason ?? '', SKELETON_AI.reasonRunes) : '',
    units,
    changes: (category ? 1 : 0) + units.length,
  };
}

export type SkeletonAIOrderResult =
  | { ok: true; proposal: SkeletonProposal; moved: number }
  | { ok: false; why: string };

/**
 * The AI's order applied to `proposal`: the ordered steps in the AI's order, each followed by its
 * riders in their own order, `derivedFrom` renumbered. `sent` = the signatures of the steps the
 * request carried (s1 = sent[0] …). Refused, in words, when the proposal is not the one the AI read,
 * when the order is not complete, or when it would take a unit before the step that makes it.
 */
export function applySkeletonAIOrder(
  proposal: SkeletonProposal,
  order: readonly { stepId?: string }[],
  sent: readonly string[],
): SkeletonAIOrderResult {
  const steps = proposal.steps;
  const now = skeletonStepSignatures(steps);
  const byNow = new Map(now.map((sig, i) => [sig, i]));
  if (now.length !== sent.length || sent.some((sig) => !byNow.has(sig)))
    return {
      ok: false,
      why: 'the skeleton changed since the AI read it (another reading?) — ask again',
    };
  const index = (id: string): number | null => {
    const m = /^s(\d+)$/.exec(id);
    if (!m) return null;
    const sig = sent[Number(m[1]) - 1];
    return sig == null ? null : byNow.get(sig) ?? null;
  };
  const riders = new Map<number, number[]>();
  steps.forEach((s, i) => {
    if (isRider(s)) riders.set(s.derivedFrom!, [...(riders.get(s.derivedFrom!) ?? []), i]);
  });
  const placed: number[] = [];
  const seen = new Set<number>();
  const place = (i: number) => {
    if (seen.has(i)) return;
    seen.add(i);
    placed.push(i);
    for (const r of riders.get(i) ?? []) place(r);
  };
  for (const o of order) {
    const i = index(o.stepId ?? '');
    if (i == null) return { ok: false, why: `the AI order names ${o.stepId}, not a step here` };
    if (isRider(steps[i])) continue;
    place(i);
  }
  if (placed.length !== steps.length)
    return { ok: false, why: 'the AI order leaves steps out — not applied' };

  const madeAt = new Map<string, number>();
  placed.forEach((i, at) => {
    if (steps[i].outputUnitKey) madeAt.set(steps[i].outputUnitKey, at);
  });
  for (let at = 0; at < placed.length; at++) {
    const s = steps[placed[at]];
    for (const k of s.inputs) {
      const m = madeAt.get(k);
      if (m != null && m >= at)
        return {
          ok: false,
          why: `the AI order takes ${k} before the step that makes it — not applied`,
        };
    }
  }
  // Work on a piece or a unit (a dart, buttonholes, a press) must come before the join that sews it
  // into the next unit — after that it is no longer on the table on its own.
  const consumedAt = new Map<string, number>();
  placed.forEach((i, at) => {
    const s = steps[i];
    if (!s.outputUnitKey) return;
    for (const k of s.inputs) if (!consumedAt.has(k)) consumedAt.set(k, at);
  });
  for (let at = 0; at < placed.length; at++) {
    const s = steps[placed[at]];
    if (s.outputUnitKey) continue;
    for (const k of s.inputs) {
      const c = consumedAt.get(k);
      if (c != null && c < at)
        return {
          ok: false,
          why: `the AI order works on ${k} after it was sewn into the next unit — not applied`,
        };
    }
  }
  const newIndex = new Map(placed.map((old, at) => [old, at]));
  const reordered = placed.map((old) => {
    const s = steps[old];
    return isRider(s) ? { ...s, derivedFrom: newIndex.get(s.derivedFrom!)! } : s;
  });
  // Moved = steps of their own whose place among the steps of their own changed (riders follow).
  const own = (list: number[]) => list.filter((i) => !isRider(steps[i]));
  const was = own(steps.map((_, i) => i));
  const moved = own(placed).filter((old, at) => was[at] !== old).length;
  return { ok: true, proposal: { ...proposal, steps: reordered }, moved };
}

/**
 * Where the AI puts each step of `proposal` (by index): its 1-based place among the ORDERED steps,
 * or null for a rider / a step the AI order does not name. Read by signature, like the order.
 */
export function skeletonAIPlaces(
  proposal: SkeletonProposal,
  order: readonly { stepId?: string; reason?: string }[],
  sent: readonly string[],
): ({ place: number; reason: string } | null)[] {
  const indexOf = skeletonAIStepIndex(proposal, sent);
  const out: ({ place: number; reason: string } | null)[] = proposal.steps.map(() => null);
  order.forEach((o, n) => {
    const i = indexOf(o.stepId ?? '');
    if (i != null) out[i] = { place: n + 1, reason: o.reason ?? '' };
  });
  return out;
}

/** A step id of the answer (s3) → the index of that step in `proposal`, or null when it is gone. */
export function skeletonAIStepIndex(
  proposal: SkeletonProposal,
  sent: readonly string[],
): (stepId: string) => number | null {
  const byNow = new Map(skeletonStepSignatures(proposal.steps).map((sig, i) => [sig, i]));
  return (stepId) => {
    const m = /^s(\d+)$/.exec(stepId);
    const sig = m ? sent[Number(m[1]) - 1] : undefined;
    return sig != null ? byNow.get(sig) ?? null : null;
  };
}
