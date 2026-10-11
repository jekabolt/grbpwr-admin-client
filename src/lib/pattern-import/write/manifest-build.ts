// The ConversionManifest of one scope file (08-CONTRACT §3), built from the plan — never from
// the text, so the gate can compare the two.

import type {
  AutopilotRecord,
  ConversionManifest,
  ManifestBlock,
  ManifestPiece,
  PieceSpec,
  WriteJob,
} from '../types';
import { MANIFEST_VERSION } from '../types';
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
  };
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
