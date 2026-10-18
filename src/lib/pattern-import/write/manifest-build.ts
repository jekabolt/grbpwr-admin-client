// The ConversionManifest of one scope file (08-CONTRACT §3), built from the plan — never from
// the text, so the gate can compare the two.

import type {
  ReplayRecord,
  AutopilotRecord,
  ConversionManifest,
  ManifestBlock,
  ManifestContinuity,
  ManifestPiece,
  PieceSpec,
  WriteJob,
} from '../types';
import { MANIFEST_VERSION, REPLAY_MAX, REPLAY_VALUE_MAX } from '../types';
import type { PlannedBlock } from './plan';
import { contourSigCap, contourSignature } from '../manifest/contour-sig';

// Manifest numbers are provenance, not geometry (the geometry is the DXF): bbox to 0.1 mm and
// area to 1 mm² keep the per-block entry short (M1: the 999 prologue of a 138-block sheet).
const r1 = (v: number) => Math.round(v * 10) / 10;
const r0 = (v: number) => Math.round(v);

export const LAYERS = { cut: '1', seam: '14', grain: '7', notch: '4', internal: '8' } as const;

export function manifestPiece(p: PieceSpec): ManifestPiece {
  const m: ManifestPiece = {
    identity: p.identity,
    code: p.code,
    mods: [...p.mods],
    displayName: p.displayName,
    pairHand: p.pairHand,
    pairOf: p.pairOf,
    unfoldedFold: p.unfoldedFold,
    piecesPerGarment: p.piecesPerGarment,
    fabrics: [...p.fabrics],
    fused: p.fused,
    ungraded: p.ungraded,
    allowanceMm: p.allowance.allowanceMm,
    nameOrigin: p.nameOrigin,
  };
  // Optional key only when present: an `undefined` value would not survive the JSON round trip
  // and G9's deep-equal would read that as a difference.
  if (p.aiConfidence != null) m.aiConfidence = p.aiConfidence;
  // GRADE P1: count differences the operator answered "intended"
  if (p.gradeIntended?.length) m.gradeIntended = [...p.gradeIntended];
  // SHAPE-KINK: the operator's one-shape moves (fixShape / dropSize)
  if (p.shapeFixes?.length) m.shapeFixes = p.shapeFixes.map((f) => ({ ...f }));
  return m;
}

export function manifestBlock(b: PlannedBlock, sigPts?: number): ManifestBlock {
  const contour = contourSignature(b.cut, sigPts);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of b.cut) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    block: b.name,
    identity: b.identity,
    sizeToken: b.sizeToken,
    sizeId: b.sizeId,
    bboxMm: [r1(minX), r1(minY), r1(maxX), r1(maxY)],
    areaMm2: r0(b.size.areaMm2),
    hasGrain: !!b.grain,
    notches: b.notches.length,
    // GRADE P1: notches not drawn in this size, graded from the sizes that draw them (D5)
    ...(b.size.notches.some((n) => n.graded)
      ? { notchesGraded: b.size.notches.filter((n) => n.graded).length }
      : {}),
    // GRADE P1: the operator's "in every size" (graded drills / internal lines) and "in no size"
    ...(b.size.drills.some((d) => d.graded)
      ? { drillsGraded: b.size.drills.filter((d) => d.graded).length }
      : {}),
    ...(b.size.internal.some((l) => l.graded)
      ? { internalGraded: b.size.internal.filter((l) => l.graded).length }
      : {}),
    ...(b.size.removedByOperator?.notches
      ? { notchesRemoved: b.size.removedByOperator.notches }
      : {}),
    ...(b.size.removedByOperator?.drills ? { drillsRemoved: b.size.removedByOperator.drills } : {}),
    ...(b.size.removedByOperator?.internal
      ? { internalRemoved: b.size.removedByOperator.internal }
      : {}),
    // GRADE P1: notches drawn as the outline, the line crossing them by the chord (not as drawn)
    ...(b.size.notches.some((n) => n.chord)
      ? { notchesChorded: b.size.notches.filter((n) => n.chord).length }
      : {}),
    drills: b.drills.length,
    internal: b.internal.length,
    hasSeam: !!b.seam,
    // G18 (A8): which evidence the grain stands on, so the card (and a reader) can tell a found
    // grain from a drawn one
    ...(b.size.grain
      ? { grain: { origin: b.size.grain.origin, evidence: [...(b.size.grain.evidence ?? [])] } }
      : {}),
    // F14f (Codex R2): binds this entry to the written cut ring (manifest/contour-sig.ts)
    ...(contour ? { contour } : {}),
    // P1: closed through continuity walls — the rules, chains and anchors (G21 checks them)
    ...(b.size.continuity ? { continuity: continuityOfBlock(b.size.continuity) } : {}),
    // SHAPE-KINK: stretches straightened onto the size's line / the family's shape (D5)
    ...(b.size.kinks?.length
      ? {
          kinkStraightened: b.size.kinks.map((k) => ({
            rule: k.rule,
            mm: r1(k.mm),
            spanMm: r1(k.spanMm),
          })),
        }
      : {}),
    // GRADE P2: repaired from the grade — where the geometry comes from, never presented as drawn
    ...(b.size.repair
      ? {
          grade: {
            geometryOrigin: 'repaired' as const,
            from: b.size.repair.fromTokens ?? [
              String(b.size.repair.from[0]),
              String(b.size.repair.from[1]),
            ],
            holes: b.size.repair.holes,
            holesMm: r1(b.size.repair.holesMm),
            cover: Math.round(b.size.repair.cover * 1000) / 1000,
          },
        }
      : {}),
  };
}

/**
 * The manifest's continuity audit of a size, canonical (fixed key order, copies): every edge with
 * its rule, chains, roles, bracket and own-class flag, and the D3 verdict with every check. The
 * write and G21 both build it here, so the gate compares like with like.
 */
export function continuityOfBlock(c: ManifestContinuity): ManifestContinuity {
  return {
    edges: c.edges.map((e) => ({
      rule: e.rule,
      chains: [...e.chains],
      roles: [...e.roles],
      ...(e.bracket ? { bracket: true } : {}),
      ownRank: !!e.ownRank,
    })),
    verdict: c.verdict
      ? {
          anchors: [...c.verdict.anchors],
          checks: c.verdict.checks.map((k) => ({
            vs: k.vs,
            steps: k.steps,
            hMm: k.hMm,
            hAllowMm: k.hAllowMm,
            hu: k.hu,
            huAllow: k.huAllow,
            growth: k.growth,
            band: [k.band[0], k.band[1]] as [number, number],
            dk: k.dk,
            kMax: k.kMax,
          })),
        }
      : null,
  };
}

/** Most common per-piece allowance (ties → smaller), 0 for an empty file. */
function fileAllowance(pieces: readonly PieceSpec[]): number {
  const n = new Map<number, number>();
  for (const p of pieces) n.set(p.allowance.allowanceMm, (n.get(p.allowance.allowanceMm) ?? 0) + 1);
  let best = 0;
  let bestN = -1;
  for (const [v, k] of [...n].sort((a, b) => a[0] - b[0])) {
    if (k > bestN) {
      best = v;
      bestN = k;
    }
  }
  return best;
}

export function buildManifest(
  job: WriteJob,
  specs: readonly PieceSpec[],
  blocks: readonly PlannedBlock[],
  createdAt: string,
): ConversionManifest {
  return {
    v: MANIFEST_VERSION,
    generator: job.generator,
    createdAt,
    techCardId: job.techCardId,
    scope: { fabricPurpose: job.scope.fabricPurpose, bomLineKey: job.scope.bomLineKey },
    units: 'mm',
    layers: { ...LAYERS },
    cutLayerIsFinal: true,
    allowanceMm: fileAllowance(specs),
    sizes: job.sizes.map((s) => ({ ...s })),
    pieces: specs.map(manifestPiece),
    blocks: blocks.map((b) => manifestBlock(b, contourSigCap(blocks.length))),
    source: job.source,
    gate: null,
    ...(job.autopilot ? { autopilot: autopilotForManifest(job.autopilot) } : {}),
    ...(job.passport ? { passport: job.passport } : {}),
    ...(job.replay ? { replay: replayForManifest(job.replay) } : {}),
  };
}

/**
 * AP-replay: the run's answers as the manifest carries them — bounded like the reader
 * (manifest/index.ts `validateReplay`): a kind that is not kebab-case or a value over
 * `REPLAY_VALUE_MAX` JSON characters is left out (it is not replayed), every subject clipped.
 */
export function replayForManifest(r: ReplayRecord): ReplayRecord {
  const clip = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);
  const KIND = /^[a-z][a-z0-9-]{0,47}$/;
  const answers: ReplayRecord['answers'] = [];
  for (const a of r.answers) {
    if (answers.length >= REPLAY_MAX) break;
    if (!KIND.test(a.kind) || a.value === undefined) continue;
    const text = JSON.stringify(a.value);
    if (text === undefined || text.length > REPLAY_VALUE_MAX) continue;
    answers.push({
      step: clip(a.step, 32),
      kind: a.kind,
      subject: clip(a.subject, 160),
      value: JSON.parse(text),
      ...(a.strong ? { strong: true } : {}),
      ...(a.auto ? { auto: true } : {}),
    });
  }
  return { v: 1, answers };
}

/**
 * A10: the autopilot record as the manifest carries it — bounded (the 999 prologue stays small,
 * G14), every string clipped, the list capped. The full list stays with the wizard session.
 */
export function autopilotForManifest(r: AutopilotRecord): AutopilotRecord {
  const clip = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);
  return {
    v: 1,
    assumptions: r.assumptions.slice(0, AUTOPILOT_MAX).map((a) => ({
      step: clip(a.step, 32),
      kind: clip(a.kind, 48),
      subject: clip(a.subject, 120),
      answer: clip(a.answer, 160),
      rule: clip(a.rule, 200),
      evidence: a.evidence.slice(0, 4).map((e) => clip(e, 160)),
      confidence: Math.max(0, Math.min(1, Math.round(a.confidence * 100) / 100)),
      strong: a.strong,
      ...(a.value !== undefined && JSON.stringify(a.value).length <= AUTOPILOT_VALUE_MAX
        ? { value: a.value }
        : {}),
    })),
  };
}

/** A10: at most this many assumptions are written into one manifest. */
export const AUTOPILOT_MAX = 400;
/** A10: an assumption's replayable value is written up to this many JSON characters. */
export const AUTOPILOT_VALUE_MAX = 2048;
