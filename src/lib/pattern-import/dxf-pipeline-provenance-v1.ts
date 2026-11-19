import type { DxfSegmentation } from './adapters/dxf/dxf-types';
import {
  bridgeDxfProvenanceToPieceSpecBoundaryV1,
  createDxfPieceSpecProvenanceBridgeInputV1,
  DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1,
  type DxfPieceSpecProvenanceBlockerCodeV1,
  type DxfPieceSpecProvenanceBridgeArtifactV1,
  type DxfPieceSpecContourBoundaryV1,
  type DxfPieceSpecProvenanceSourceV1,
  type DxfPieceSpecTopologyMutationV1,
} from './dxf-piece-spec-provenance-bridge-v1';
import type { PieceSpec, PtMm } from './types';

export const DXF_PIPELINE_PROVENANCE_V1 = 'dxf-pipeline-provenance/1' as const;
export const DXF_PIPELINE_PROVENANCE_REQUEST_V1 = 'dxf-pipeline-provenance-request/1' as const;
export const DXF_CANDIDATE_LINEAGE_V1 = 'dxf-candidate-lineage/1' as const;
export const DXF_PIPELINE_CONTENT_BINDING_V1 = 'dxf-pipeline-content-binding/1' as const;

const MAX_CANDIDATES = 4_096;
const MAX_PATHS_PER_CANDIDATE = 64;
const MAX_BLOCKERS = 128;
const MAX_STABLE_ID_BYTES = 256;
const MAX_DETAIL_BYTES = 1_024;
const MAX_CONTENT_BINDING_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();
const CUT_MODES = new Set(['A', 'B', 'C', 'single', 'cut-only', 'seam-only']);

export type DxfPipelineProvenanceRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PIPELINE_PROVENANCE_REQUEST_V1;
}>;

export type DxfPathProvenanceOpenV1 = Readonly<{
  sourceFileId: string;
}>;

/** `unknown` is deliberately blocking: a new unclassified semantics branch cannot pass silently. */
export type DxfPipelineMutationEventV1 = DxfPieceSpecTopologyMutationV1 | 'synthetic' | 'unknown';

export type DxfPipelineProvenanceBlockerCodeV1 =
  | DxfPieceSpecProvenanceBlockerCodeV1
  | 'not-opted-in'
  | 'unsupported-source-set'
  | 'rul-derived-source'
  | 'synthetic-source'
  | 'detailed-read-blocked'
  | 'candidate-lineage-missing'
  | 'ambiguous-final-locator'
  | 'semantics-not-ready'
  | 'clone-contract-invalid'
  | 'content-binding-unavailable'
  | 'unclassified-mutation';

export type DxfPipelineProvenanceBlockerV1 = Readonly<{
  code: DxfPipelineProvenanceBlockerCodeV1;
  identity: string | null;
  sizeToken: string | null;
  detail: string;
}>;

export type DxfCandidateLineageEntryV1 = Readonly<{
  seed: number;
  rank: number;
  sourcePathIds: readonly number[];
  sourceGeometry: 'cut' | 'seam';
  closed: true;
}>;

/** Private Session carrier. It is never added to PieceSpec or posted to the main thread. */
export type DxfCandidateLineageSidecarV1 = Readonly<{
  schemaVersion: typeof DXF_CANDIDATE_LINEAGE_V1;
  source: DxfPieceSpecProvenanceSourceV1;
  uniformPositiveScale: number;
  entries: readonly DxfCandidateLineageEntryV1[];
  productionReady: false;
  heuristicRecoveryUsed: false;
  pieceSpecWireIntegrated: false;
}>;

export type DxfSemanticsProvenanceTraceV1 = Readonly<{
  seed: number;
  rank: number;
  geometry: 'cut' | 'seam';
  cyclicShift: 0;
  direction: 'forward' | 'reverse';
  cutLoopSourcePathIds?: readonly number[];
  mutations: readonly DxfPipelineMutationEventV1[];
}>;

export type DxfPipelineProvenanceStageOutputV1 = Readonly<{
  schemaVersion: typeof DXF_PIPELINE_PROVENANCE_V1;
  pipelineIntegrated: boolean;
  productionReady: false;
  heuristicRecoveryUsed: false;
  pieceSpecWireIntegrated: false;
  includesRawDxf: false;
  includesTags: false;
  includesAst: false;
  carrier: DxfPieceSpecProvenanceBridgeArtifactV1 | null;
  blockers: readonly DxfPipelineProvenanceBlockerV1[];
  /** Present only on an actual successful Session route; blocked/legacy output keeps its old keys. */
  contentBinding?: DxfPipelineContentBindingV1;
}>;

export type DxfPipelineContentBindingV1 = Readonly<{
  schemaVersion: typeof DXF_PIPELINE_CONTENT_BINDING_V1;
  algorithm: 'SHA-256';
  sourceFileId: string;
  sourceSha256: string;
  /** Hashes exact carrier identities together with the selected final PieceSpec coordinates. */
  selectedGeometrySha256: string;
}>;

export type DxfPipelineContentBindingResultV1 =
  | Readonly<{ ok: true; value: DxfPipelineContentBindingV1 }>
  | Readonly<{ ok: false; blocker: DxfPipelineProvenanceBlockerV1 }>;

export const DXF_PIPELINE_PROVENANCE_CONTRACT_V1 = Object.freeze({
  detailedRead: 'explicit caller-owned sourceFileId bound to one exact session file index',
  candidateLineage: 'exact DxfContour.paths only',
  finalLocator: 'pipeline-declared PieceSizeSpec cut/seam only',
  unknownMutationPolicy: 'fail-closed',
  transformSearchAllowed: false,
  nearestGeometryRecoveryAllowed: false,
  layerRecoveryAllowed: false,
  atomicPartialIdentityAllowed: false,
  successfulSessionContentBinding: 'source DXF SHA-256 + canonical selected geometry SHA-256',
  contentBindingAuthority:
    'unsigned consistency evidence only; not authenticity, trusted provenance, or production authority',
  legacyPieceSpecSchemaChanged: false,
  productionReadyClaim: false,
} as const);

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalContent(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError('non-canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalContent).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('unsupported canonical value');
  return `{${Object.keys(value)
    .sort(compareCodeUnits)
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalContent((value as Record<string, unknown>)[key])}`,
    )
    .join(',')}}`;
}

function selectedPoints(
  piece: PieceSpec,
  sizeToken: string,
  geometry: DxfPieceSpecProvenanceBridgeArtifactV1['pieces'][number]['contours'][number]['geometry'],
): readonly PtMm[] | null {
  const sizes = piece.sizes.filter((size) => size.sizeToken === sizeToken);
  if (sizes.length !== 1) return null;
  const size = sizes[0];
  if (geometry.kind === 'cut') return size.cut;
  if (geometry.kind === 'seam') return size.seam;
  return size.cutLoops?.[geometry.index] ?? null;
}

/**
 * Binds the private Phase-D coordinate verification to the public identity-only carrier. The
 * digest includes source SHA, sourceFileId, every source vertex record and the selected final
 * coordinates. It exposes no coordinates or raw source bytes.
 */
export async function computeDxfPipelineContentBindingV1(
  carrier: DxfPieceSpecProvenanceBridgeArtifactV1,
  pieces: readonly PieceSpec[],
  sourceSha256: string,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfPipelineContentBindingResultV1> {
  try {
    if (!SHA256.test(sourceSha256)) throw new TypeError('source SHA-256 is unavailable');
    if (
      carrier.schemaVersion !== DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1 ||
      carrier.pieces.length === 0 ||
      carrier.pieces.length > 256 ||
      !crypto?.subtle ||
      typeof crypto.subtle.digest !== 'function'
    )
      throw new TypeError('content binding input is unavailable');
    const pieceById = new Map<string, PieceSpec>();
    for (const piece of pieces) {
      if (pieceById.has(piece.identity)) throw new TypeError('duplicate PieceSpec identity');
      pieceById.set(piece.identity, piece);
    }
    let totalVertices = 0;
    const payloadPieces = carrier.pieces.map((carriedPiece) => {
      const piece = pieceById.get(carriedPiece.pieceId);
      if (!piece) throw new TypeError('carrier piece is absent from PieceSpec');
      const contours = carriedPiece.contours.map((contour) => {
        const points = selectedPoints(piece, carriedPiece.sizeToken, contour.geometry);
        if (!points || points.length !== contour.sourceVertices.length)
          throw new TypeError('carrier geometry cardinality mismatch');
        totalVertices += points.length;
        if (totalVertices > 100_000) throw new RangeError('content binding vertex bound exceeded');
        return {
          id: contour.id,
          role: contour.role,
          geometry:
            contour.geometry.kind === 'cut-loop'
              ? { kind: contour.geometry.kind, index: contour.geometry.index }
              : { kind: contour.geometry.kind },
          pointsMm: points.map((point) => {
            if (
              !Number.isFinite(point.x) ||
              !Number.isFinite(point.y) ||
              Object.is(point.x, -0) ||
              Object.is(point.y, -0)
            )
              throw new TypeError('non-canonical selected coordinate');
            return [point.x, point.y] as const;
          }),
          sourceVertices: contour.sourceVertices.map((vertex) => ({
            vertexId: vertex.vertexId,
            sourceCurveId: vertex.sourceCurveId,
            parameterSpace: vertex.parameterSpace,
            sourceCurveT: vertex.sourceCurveT,
            normalizedArc: vertex.normalizedArc,
          })),
        };
      });
      return { pieceId: carriedPiece.pieceId, sizeToken: carriedPiece.sizeToken, contours };
    });
    const canonical = canonicalContent({
      schemaVersion: DXF_PIPELINE_CONTENT_BINDING_V1,
      sourceFileId: carrier.sourceFileId,
      sourceSha256,
      pieces: payloadPieces,
    });
    const encoded = textEncoder.encode(`dxf-pipeline-content-binding-v1\0${canonical}`);
    if (encoded.byteLength > MAX_CONTENT_BINDING_BYTES)
      throw new RangeError('content binding canonical byte bound exceeded');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
    if (digest.byteLength !== 32) throw new TypeError('invalid SHA-256 output');
    const selectedGeometrySha256 = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        schemaVersion: DXF_PIPELINE_CONTENT_BINDING_V1,
        algorithm: 'SHA-256' as const,
        sourceFileId: carrier.sourceFileId,
        sourceSha256,
        selectedGeometrySha256,
      }),
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      blocker: dxfPipelineBlockerV1(
        'content-binding-unavailable',
        'selected geometry/source content binding could not be computed exactly.',
      ),
    });
  }
}

export function attachDxfPipelineContentBindingV1(
  output: DxfPipelineProvenanceStageOutputV1,
  contentBinding: DxfPipelineContentBindingV1,
): DxfPipelineProvenanceStageOutputV1 {
  if (!output.pipelineIntegrated || !output.carrier || output.blockers.length)
    return blockedDxfPipelineProvenanceV1([
      dxfPipelineBlockerV1(
        'clone-contract-invalid',
        'content binding can only attach to an exact successful pipeline carrier.',
      ),
    ]);
  if (
    contentBinding.schemaVersion !== DXF_PIPELINE_CONTENT_BINDING_V1 ||
    contentBinding.algorithm !== 'SHA-256' ||
    contentBinding.sourceFileId !== output.carrier.sourceFileId ||
    !SHA256.test(contentBinding.sourceSha256) ||
    !SHA256.test(contentBinding.selectedGeometrySha256)
  )
    return blockedDxfPipelineProvenanceV1([
      dxfPipelineBlockerV1('clone-contract-invalid', 'content binding is inconsistent.'),
    ]);
  return Object.freeze({ ...output, contentBinding: Object.freeze({ ...contentBinding }) });
}

export function dxfPipelineBlockerV1(
  code: DxfPipelineProvenanceBlockerCodeV1,
  detail: string,
  identity: string | null = null,
  sizeToken: string | null = null,
): DxfPipelineProvenanceBlockerV1 {
  return Object.freeze({
    code,
    identity: boundedLabel(identity),
    sizeToken: boundedLabel(sizeToken),
    detail: boundedText(detail, MAX_DETAIL_BYTES),
  });
}

function boundedText(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string') return 'invalid blocker detail';
  if (textEncoder.encode(value).byteLength <= maxBytes) return value;
  let out = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${out}${scalar}…`).byteLength > maxBytes) break;
    out += scalar;
  }
  return `${out}…`;
}

function boundedLabel(value: string | null): string | null {
  return value !== null && textEncoder.encode(value).byteLength <= MAX_STABLE_ID_BYTES
    ? value
    : null;
}

function boundedBlockers(
  input: readonly DxfPipelineProvenanceBlockerV1[],
): readonly DxfPipelineProvenanceBlockerV1[] {
  if (input.length <= MAX_BLOCKERS) return Object.freeze([...input]);
  return Object.freeze([
    ...input.slice(0, MAX_BLOCKERS - 1),
    dxfPipelineBlockerV1(
      'bounds-exceeded',
      `pipeline blocker output is capped at ${MAX_BLOCKERS}; remaining failures were suppressed.`,
    ),
  ]);
}

export function blockedDxfPipelineProvenanceV1(
  blockers: readonly DxfPipelineProvenanceBlockerV1[],
): DxfPipelineProvenanceStageOutputV1 {
  return Object.freeze({
    schemaVersion: DXF_PIPELINE_PROVENANCE_V1,
    pipelineIntegrated: false,
    productionReady: false,
    heuristicRecoveryUsed: false,
    pieceSpecWireIntegrated: false,
    includesRawDxf: false,
    includesTags: false,
    includesAst: false,
    carrier: null,
    blockers: boundedBlockers(
      blockers.length
        ? blockers
        : [dxfPipelineBlockerV1('candidate-lineage-missing', 'pipeline carried no identity.')],
    ),
  });
}

function successfulDxfPipelineProvenanceV1(
  carrier: DxfPieceSpecProvenanceBridgeArtifactV1,
): DxfPipelineProvenanceStageOutputV1 {
  if (
    carrier.schemaVersion !== DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1 ||
    carrier.pieces.length === 0 ||
    carrier.pieces.every((piece) => piece.contours.length === 0)
  )
    return blockedDxfPipelineProvenanceV1([
      dxfPipelineBlockerV1(
        'clone-contract-invalid',
        'Phase-C carrier is empty or has an unsupported schema.',
      ),
    ]);
  return Object.freeze({
    schemaVersion: DXF_PIPELINE_PROVENANCE_V1,
    pipelineIntegrated: true,
    productionReady: false,
    heuristicRecoveryUsed: false,
    pieceSpecWireIntegrated: false,
    includesRawDxf: false,
    includesTags: false,
    includesAst: false,
    carrier,
    blockers: Object.freeze([]),
  });
}

/** The only success constructor: Phase C validates, coordinate-checks and rebuilds the carrier. */
let bridgeClaimed = false;

export function bridgeDxfPipelineProvenanceV1(
  source: DxfPieceSpecProvenanceSourceV1,
  contours: readonly DxfPieceSpecContourBoundaryV1[],
): DxfPipelineProvenanceStageOutputV1 {
  if (bridgeClaimed)
    return blockedDxfPipelineProvenanceV1([
      dxfPipelineBlockerV1('invalid-input', 'reentrant DXF pipeline bridge call was refused.'),
    ]);
  bridgeClaimed = true;
  try {
    return bridgeDxfPipelineProvenanceUnclaimedV1(source, contours);
  } finally {
    bridgeClaimed = false;
  }
}

function bridgeDxfPipelineProvenanceUnclaimedV1(
  source: DxfPieceSpecProvenanceSourceV1,
  contours: readonly DxfPieceSpecContourBoundaryV1[],
): DxfPipelineProvenanceStageOutputV1 {
  const input = createDxfPieceSpecProvenanceBridgeInputV1(source, contours);
  if (!input.ok) return blockedDxfPipelineProvenanceV1(phaseCBlockersToPipelineV1(input.blockers));
  const carried = bridgeDxfProvenanceToPieceSpecBoundaryV1(input.value);
  return carried.ok
    ? successfulDxfPipelineProvenanceV1(carried.value)
    : blockedDxfPipelineProvenanceV1(phaseCBlockersToPipelineV1(carried.blockers));
}

export function phaseCBlockersToPipelineV1(
  blockers: readonly Readonly<{
    code: DxfPieceSpecProvenanceBlockerCodeV1;
    contourId: string | null;
    detail: string;
  }>[],
): readonly DxfPipelineProvenanceBlockerV1[] {
  return Object.freeze(
    blockers.map((blocker) =>
      dxfPipelineBlockerV1(
        blocker.code,
        `${blocker.contourId ? `${blocker.contourId}: ` : ''}${blocker.detail}`,
      ),
    ),
  );
}

/** Captures the exact contour selection made before candidateOf discards DxfContour.paths. */
let candidateSnapshotClaimed = false;

export function createDxfCandidateLineageSidecarV1(
  segmentation: DxfSegmentation,
  source: DxfPieceSpecProvenanceSourceV1,
  uniformPositiveScale: number,
):
  | Readonly<{ ok: true; value: DxfCandidateLineageSidecarV1 }>
  | Readonly<{ ok: false; blockers: readonly DxfPipelineProvenanceBlockerV1[] }> {
  if (candidateSnapshotClaimed)
    return Object.freeze({
      ok: false as const,
      blockers: Object.freeze([
        dxfPipelineBlockerV1('invalid-input', 'reentrant candidate lineage snapshot was refused.'),
      ]),
    });
  candidateSnapshotClaimed = true;
  try {
    return createDxfCandidateLineageSidecarUnclaimedV1(segmentation, source, uniformPositiveScale);
  } finally {
    candidateSnapshotClaimed = false;
  }
}

/** Additive selected-surface capture. Only a single explicitly labelled L14 path is eligible;
 * the legacy outer contour choice above is unchanged. No coordinate search establishes its role. */
export function createDxfNativeSewingCandidateLineageV1(
  segmentation: DxfSegmentation,
  source: DxfPieceSpecProvenanceSourceV1,
  uniformPositiveScale: number,
): ReturnType<typeof createDxfCandidateLineageSidecarV1> {
  if (candidateSnapshotClaimed)
    return Object.freeze({
      ok: false as const,
      blockers: Object.freeze([
        dxfPipelineBlockerV1('invalid-input', 'reentrant native sewing capture was refused.'),
      ]),
    });
  candidateSnapshotClaimed = true;
  try {
    return createDxfCandidateLineageSidecarUnclaimedV1(
      segmentation,
      source,
      uniformPositiveScale,
      true,
    );
  } finally {
    candidateSnapshotClaimed = false;
  }
}

function createDxfCandidateLineageSidecarUnclaimedV1(
  segmentation: DxfSegmentation,
  source: DxfPieceSpecProvenanceSourceV1,
  uniformPositiveScale: number,
  nativeSewing = false,
):
  | Readonly<{ ok: true; value: DxfCandidateLineageSidecarV1 }>
  | Readonly<{ ok: false; blockers: readonly DxfPipelineProvenanceBlockerV1[] }> {
  const blockers: DxfPipelineProvenanceBlockerV1[] = [];
  let snapshot: ReturnType<typeof snapshotSegmentationSelection>;
  let exactSource: DxfPieceSpecProvenanceSourceV1;
  try {
    snapshot = snapshotSegmentationSelection(segmentation, nativeSewing);
    const validatedSource = createDxfPieceSpecProvenanceBridgeInputV1(source, Object.freeze([]));
    if (!validatedSource.ok)
      return Object.freeze({
        ok: false as const,
        blockers: phaseCBlockersToPipelineV1(validatedSource.blockers),
      });
    exactSource = validatedSource.value.source;
  } catch {
    return Object.freeze({
      ok: false as const,
      blockers: Object.freeze([
        dxfPipelineBlockerV1(
          'invalid-input',
          'candidate lineage input is inaccessible, hostile, or structurally invalid.',
        ),
      ]),
    });
  }
  if (
    !Number.isFinite(uniformPositiveScale) ||
    uniformPositiveScale <= 0 ||
    uniformPositiveScale > 1_000_000
  )
    blockers.push(
      dxfPipelineBlockerV1(
        'invalid-input',
        'candidate scale must be finite, positive and bounded.',
      ),
    );
  const entries: DxfCandidateLineageEntryV1[] = [];
  const keys = new Set<string>();
  const sourcePathIds = new Set(exactSource.paths.map((path) => path.pathId));
  const tokenRanks = new Map<string, number[]>();
  snapshot.sizes.forEach((token, rank) => {
    const ranks = tokenRanks.get(token) ?? [];
    ranks.push(rank);
    tokenRanks.set(token, ranks);
  });
  for (let seed = 0; seed < snapshot.identities.length; seed += 1) {
    const identity = snapshot.identities[seed];
    const preferSeam = identity.mode === 'A';
    for (const pieceIndex of identity.pieces) {
      if (entries.length >= MAX_CANDIDATES) {
        blockers.push(
          dxfPipelineBlockerV1(
            'bounds-exceeded',
            `candidate lineage exceeds ${MAX_CANDIDATES} entries.`,
          ),
        );
        break;
      }
      const piece = snapshot.pieces[pieceIndex];
      if (!piece) {
        blockers.push(
          dxfPipelineBlockerV1(
            'candidate-lineage-missing',
            `segmentation identity ${seed} references missing piece ${pieceIndex}.`,
          ),
        );
        continue;
      }
      const ranks = piece.size ? tokenRanks.get(piece.size) ?? [] : [0];
      if (ranks.length !== 1) {
        blockers.push(
          dxfPipelineBlockerV1(
            'ambiguous-final-locator',
            `candidate ${seed}/${pieceIndex} has ${ranks.length} exact size ranks.`,
            identity.identity,
            piece.size,
          ),
        );
        continue;
      }
      const rank = ranks[0];
      const key = `${seed}:${rank}`;
      if (keys.has(key)) {
        blockers.push(
          dxfPipelineBlockerV1(
            'duplicate-identity',
            `candidate lineage repeats seed/rank ${key}.`,
            identity.identity,
            piece.size,
          ),
        );
        continue;
      }
      keys.add(key);
      if (
        nativeSewing &&
        (piece.seamSource !== 'L14' ||
          !piece.seam ||
          piece.seam.paths.length !== 1 ||
          piece.seamRolePathIds?.length !== 1 ||
          piece.seamRolePathIds[0] !== piece.seam.paths[0])
      ) {
        blockers.push(
          dxfPipelineBlockerV1(
            'candidate-lineage-missing',
            `candidate ${key} requires one unambiguous explicitly labelled L14 seam path; inferred, absent or merged seams are unsupported.`,
            identity.identity,
            piece.size,
          ),
        );
        continue;
      }
      const selected = nativeSewing
        ? { contour: piece.seam!, geometry: 'seam' as const }
        : preferSeam
          ? piece.seam
            ? { contour: piece.seam, geometry: 'seam' as const }
            : piece.cut
              ? { contour: piece.cut, geometry: 'cut' as const }
              : null
          : piece.cut
            ? { contour: piece.cut, geometry: 'cut' as const }
            : piece.seam
              ? { contour: piece.seam, geometry: 'seam' as const }
              : null;
      const outer = selected?.contour ?? null;
      if (!outer) {
        blockers.push(
          dxfPipelineBlockerV1(
            'candidate-lineage-missing',
            `candidate ${key} has no selected DXF outer contour.`,
            identity.identity,
            piece.size,
          ),
        );
        continue;
      }
      if (outer.paths.length === 0 || outer.paths.length > MAX_PATHS_PER_CANDIDATE) {
        blockers.push(
          dxfPipelineBlockerV1(
            outer.paths.length ? 'bounds-exceeded' : 'source-path-missing',
            `candidate ${key} has ${outer.paths.length} source paths.`,
            identity.identity,
            piece.size,
          ),
        );
        continue;
      }
      if (new Set(outer.paths).size !== outer.paths.length) {
        blockers.push(
          dxfPipelineBlockerV1(
            'duplicate-identity',
            `candidate ${key} repeats a source PathId.`,
            identity.identity,
            piece.size || null,
          ),
        );
        continue;
      }
      const missingPathId = outer.paths.find((pathId) => !sourcePathIds.has(pathId));
      if (missingPathId !== undefined) {
        blockers.push(
          dxfPipelineBlockerV1(
            'source-path-missing',
            `candidate ${key} references a PathId absent from its exact source carrier.`,
            identity.identity,
            piece.size,
          ),
        );
        continue;
      }
      entries.push(
        Object.freeze({
          seed,
          rank,
          sourcePathIds: Object.freeze([...outer.paths]),
          sourceGeometry: selected!.geometry,
          closed: true as const,
        }),
      );
    }
  }
  if (blockers.length)
    return Object.freeze({ ok: false as const, blockers: boundedBlockers(blockers) });
  if (entries.length === 0)
    return Object.freeze({
      ok: false as const,
      blockers: Object.freeze([
        dxfPipelineBlockerV1('candidate-lineage-missing', 'no DXF candidates were captured.'),
      ]),
    });
  entries.sort((left, right) => left.seed - right.seed || left.rank - right.rank);
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      schemaVersion: DXF_CANDIDATE_LINEAGE_V1,
      source: exactSource,
      uniformPositiveScale,
      entries: Object.freeze(entries),
      productionReady: false as const,
      heuristicRecoveryUsed: false as const,
      pieceSpecWireIntegrated: false as const,
    }),
  });
}

type SelectionSnapshot = Readonly<{
  identities: readonly Readonly<{
    identity: string;
    mode: string;
    pieces: readonly number[];
  }>[];
  sizes: readonly string[];
  pieces: readonly Readonly<{
    size: string;
    cut: Readonly<{ paths: readonly number[] }> | null;
    seam: Readonly<{ paths: readonly number[] }> | null;
    seamSource?: string | null;
    seamRolePathIds?: readonly number[];
  }>[];
}>;

function dataRecord(value: unknown, label: string): Record<PropertyKey, PropertyDescriptor> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    throw new TypeError(`${label} is not an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype) throw new TypeError(`${label} has an unsupported prototype`);
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (
      typeof key === 'symbol' ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      throw new TypeError(`${label} contains an accessor`);
  }
  return descriptors;
}

function strictBoundedLabel(value: unknown, label: string, allowEmpty = true): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    textEncoder.encode(value).byteLength > MAX_STABLE_ID_BYTES
  )
    throw new TypeError(`${label} is not a bounded string`);
  return value;
}

function field(
  descriptors: Record<PropertyKey, PropertyDescriptor>,
  key: string,
  label: string,
): unknown {
  const descriptor = descriptors[key];
  if (!descriptor || !descriptor.enumerable) throw new TypeError(`${label}.${key} is missing`);
  return descriptor.value;
}

function dataArray(value: unknown, label: string, max: number): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} is not an array`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > max)
    throw new TypeError(`${label} exceeds its bound`);
  const out: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
      throw new TypeError(`${label}[${index}] is sparse or accessor-backed`);
    out.push(descriptor.value);
  }
  const allowed = new Set<PropertyKey>(['length', ...out.map((_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key)))
    throw new TypeError(`${label} has extra keys`);
  return out;
}

function snapshotPathRef(value: unknown, label: string): Readonly<{ paths: readonly number[] }> {
  const descriptors = dataRecord(value, label);
  const rawPaths = dataArray(
    field(descriptors, 'paths', label),
    `${label}.paths`,
    MAX_PATHS_PER_CANDIDATE,
  );
  const paths = rawPaths.map((pathId) => {
    if (!Number.isSafeInteger(pathId) || (pathId as number) < 0)
      throw new TypeError(`${label}.paths contains an invalid PathId`);
    return pathId as number;
  });
  return Object.freeze({ paths: Object.freeze(paths) });
}

function snapshotSegmentationSelection(value: unknown, nativeSewing = false): SelectionSnapshot {
  const root = dataRecord(value, 'segmentation');
  const rawIdentities = dataArray(
    field(root, 'identities', 'segmentation'),
    'segmentation.identities',
    MAX_CANDIDATES,
  );
  const rawSizes = dataArray(
    field(root, 'sizes', 'segmentation'),
    'segmentation.sizes',
    MAX_CANDIDATES,
  );
  const rawPieces = dataArray(
    field(root, 'pieces', 'segmentation'),
    'segmentation.pieces',
    MAX_CANDIDATES,
  );
  const identities = rawIdentities.map((value, index) => {
    const descriptors = dataRecord(value, `segmentation.identities[${index}]`);
    const identity = field(descriptors, 'identity', `segmentation.identities[${index}]`);
    const mode = field(descriptors, 'mode', `segmentation.identities[${index}]`);
    const rawIndices = dataArray(
      field(descriptors, 'pieces', `segmentation.identities[${index}]`),
      `segmentation.identities[${index}].pieces`,
      MAX_CANDIDATES,
    );
    const exactIdentity = strictBoundedLabel(
      identity,
      `segmentation.identities[${index}].identity`,
      false,
    );
    const exactMode = strictBoundedLabel(mode, `segmentation.identities[${index}].mode`);
    if (!CUT_MODES.has(exactMode)) throw new TypeError('invalid cut mode');
    const pieces = rawIndices.map((pieceIndex) => {
      if (!Number.isSafeInteger(pieceIndex) || (pieceIndex as number) < 0)
        throw new TypeError('invalid piece index');
      return pieceIndex as number;
    });
    return Object.freeze({
      identity: exactIdentity,
      mode: exactMode,
      pieces: Object.freeze(pieces),
    });
  });
  const sizes = rawSizes.map((value, index) => {
    const descriptors = dataRecord(value, `segmentation.sizes[${index}]`);
    const token = field(descriptors, 'token', `segmentation.sizes[${index}]`);
    return strictBoundedLabel(token, `segmentation.sizes[${index}].token`);
  });
  if (new Set(identities.map((identity) => identity.identity)).size !== identities.length)
    throw new TypeError('segmentation repeats an identity');
  const pieces = rawPieces.map((value, index) => {
    const descriptors = dataRecord(value, `segmentation.pieces[${index}]`);
    const size = field(descriptors, 'size', `segmentation.pieces[${index}]`);
    const cut = field(descriptors, 'cut', `segmentation.pieces[${index}]`);
    const seam = field(descriptors, 'seam', `segmentation.pieces[${index}]`);
    const exactSize = strictBoundedLabel(size, `segmentation.pieces[${index}].size`);
    let selectedSeam: { seamSource: string | null; seamRolePathIds: readonly number[] } | undefined;
    if (nativeSewing) {
      const label = `segmentation.pieces[${index}]`;
      const rawSource = field(descriptors, 'seamSource', label);
      const seamSource =
        rawSource === null ? null : strictBoundedLabel(rawSource, `${label}.seamSource`);
      const roles = dataRecord(field(descriptors, 'roles', label), `${label}.roles`);
      if (Reflect.ownKeys(roles).length > 100_000)
        throw new TypeError('too many native path roles');
      const seamRolePathIds = Object.keys(roles)
        .filter((key) => roles[key].value === 'seam')
        .map((key) => {
          const id = Number(key);
          if (!Number.isSafeInteger(id) || id < 0 || String(id) !== key)
            throw new TypeError('invalid native seam role PathId');
          return id;
        });
      selectedSeam = { seamSource, seamRolePathIds: Object.freeze(seamRolePathIds) };
    }
    return Object.freeze({
      size: exactSize,
      ...selectedSeam,
      cut: cut === null ? null : snapshotPathRef(cut, `segmentation.pieces[${index}].cut`),
      seam: seam === null ? null : snapshotPathRef(seam, `segmentation.pieces[${index}].seam`),
    });
  });
  return Object.freeze({
    identities: Object.freeze(identities),
    sizes: Object.freeze(sizes),
    pieces: Object.freeze(pieces),
  });
}

let requestSnapshotClaimed = false;

export function validateDxfPipelineProvenanceRequestV1(
  value: unknown,
): DxfPipelineProvenanceBlockerV1 | null {
  if (requestSnapshotClaimed)
    return dxfPipelineBlockerV1(
      'invalid-input',
      'reentrant DXF provenance request validation was refused.',
    );
  requestSnapshotClaimed = true;
  try {
    const descriptors = dataRecord(value, 'dxf provenance request');
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== 1 || keys[0] !== 'schemaVersion') throw new TypeError('unexpected keys');
    if (
      field(descriptors, 'schemaVersion', 'dxf provenance request') !==
      DXF_PIPELINE_PROVENANCE_REQUEST_V1
    )
      throw new TypeError('unsupported schema');
    return null;
  } catch {
    return dxfPipelineBlockerV1(
      'invalid-input',
      'dxf provenance request must be an exact descriptor-safe V1 record.',
    );
  } finally {
    requestSnapshotClaimed = false;
  }
}

function hexUtf8(value: string): string {
  return Array.from(textEncoder.encode(value), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function createDxfPipelineContourIdV1(
  identity: string,
  sizeToken: string,
  geometry: 'cut' | 'seam' | Readonly<{ kind: 'cut-loop'; index: number }>,
): string | null {
  if (typeof geometry !== 'string' && (!Number.isSafeInteger(geometry.index) || geometry.index < 0))
    return null;
  const locator = typeof geometry === 'string' ? geometry : `cut-loop/${geometry.index}`;
  const value = `dxf-piece-v1/p/${hexUtf8(identity)}/s/${hexUtf8(sizeToken)}/g/${locator}`;
  return textEncoder.encode(value).byteLength <= MAX_STABLE_ID_BYTES ? value : null;
}
