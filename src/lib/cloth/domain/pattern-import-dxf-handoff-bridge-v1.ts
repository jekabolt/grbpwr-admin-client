import type {
  ConversionManifest,
  ManifestSource,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
} from '../../pattern-import/types';
import {
  DXF_ASSEMBLY_HANDOFF_V1,
  buildDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffFailureV1,
  type DxfAssemblyHandoffOptionsV1,
  type DxfAssemblyHandoffV1,
  type DxfAssemblyOperationV1,
  type DxfMaterialAssignmentV1,
  type DxfSeamV1,
  type DxfSourceCurveParameterSpaceV1,
} from './dxf-assembly-handoff-v1';

export const PATTERN_IMPORT_DXF_HANDOFF_BRIDGE_V1 = '1.0.0' as const;

export type PatternImportDxfManifestBridgeViewV1 = Pick<
  ConversionManifest,
  'v' | 'generator' | 'createdAt' | 'techCardId' | 'units' | 'cutLayerIsFinal' | 'source'
>;

export type PatternImportDxfBridgeSelectionV1 = {
  readonly pieceId: string;
  readonly sizeToken: string;
};

export type PatternImportDxfBridgeContourV1 = {
  readonly id: string;
  readonly role: 'sewing-boundary' | 'cut-boundary' | 'hole';
  readonly geometry:
    | { readonly kind: 'seam' }
    | { readonly kind: 'cut' }
    | { readonly kind: 'cut-loop'; readonly index: number };
  /** Exactly one provenance record per existing PieceSizeSpec point, in unchanged point order. */
  readonly sourceVertices: readonly {
    readonly vertexId: string;
    readonly sourceCurveId: string;
    readonly parameterSpace: DxfSourceCurveParameterSpaceV1;
    readonly sourceCurveT: number;
    readonly normalizedArc: number;
  }[];
};

export type PatternImportDxfBridgePieceV1 = {
  readonly pieceId: string;
  readonly sizeToken: string;
  readonly contours: readonly PatternImportDxfBridgeContourV1[];
};

export type PatternImportDxfBridgeExplicitAssemblyV1 = {
  readonly physicalSurface:
    | { readonly mode: 'sewing-surface'; readonly seamAllowancePhysical: false }
    | { readonly mode: 'cut-surface'; readonly seamAllowancePhysical: true };
  readonly pieces: readonly PatternImportDxfBridgePieceV1[];
  readonly seams: readonly DxfSeamV1[];
  readonly operations: readonly DxfAssemblyOperationV1[];
  readonly materials: readonly DxfMaterialAssignmentV1[];
};

export type PatternImportDxfBridgeUnsignedBindingV1 = {
  readonly documentId: string;
  readonly revision: string;
  readonly exporterId: string;
  readonly exporterVersion: string;
  /** Computed beside the writer result. Raw DXF text/bytes never cross this bridge. */
  readonly exportSha256: string;
  readonly manifestIdentitySha256: string;
  readonly selectedGeometrySha256: string;
  readonly manifestCreatedAt: string;
  readonly manifestGenerator: string;
  readonly techCardId: number;
  readonly provenanceKind: 'synthetic-fixture' | 'untrusted-product' | 'trusted-corpus';
  readonly corpusEntryId: string | null;
};

export type PatternImportDxfBridgeBindingV1 = PatternImportDxfBridgeUnsignedBindingV1 & {
  /** Binds revision/export hash to the exact current manifest and selected geometry digests. */
  readonly artifactBindingSha256: string;
};

export type PatternImportDxfHandoffBridgeInputV1 = {
  readonly schemaVersion: typeof PATTERN_IMPORT_DXF_HANDOFF_BRIDGE_V1;
  readonly binding: PatternImportDxfBridgeBindingV1;
  readonly manifest: PatternImportDxfManifestBridgeViewV1;
  /** `SemanticsOutput.pieces`: the narrow real pre-writer geometry boundary. */
  readonly pieces: readonly PieceSpec[];
  readonly selections: readonly PatternImportDxfBridgeSelectionV1[];
  readonly explicit: PatternImportDxfBridgeExplicitAssemblyV1;
};

export type PatternImportDxfBridgeCapabilityV1 = {
  readonly required: string;
  readonly current: string;
  readonly availability: 'native' | 'partial' | 'absent';
  readonly bridgePolicy: string;
};

export const PATTERN_IMPORT_DXF_HANDOFF_CAPABILITY_MATRIX_V1 = deepFreeze(
  [
    ['millimetre units', 'ConversionManifest.units', 'native', 'copy only exact mm'],
    [
      'source SHA-256',
      'ManifestSource.files[].sha256',
      'partial',
      'canonical aggregate of sorted source descriptors',
    ],
    [
      'written DXF SHA-256',
      'absent from ConversionManifest',
      'absent',
      'require writer-bound digest; never accept DXF bytes',
    ],
    [
      'document revision',
      'absent from pattern-import artifacts',
      'absent',
      'require explicit revision bound to current artifact digests',
    ],
    [
      'stable piece id and geometry',
      'PieceSpec.identity + selected PieceSizeSpec',
      'native',
      'copy points exactly; never resample/reverse/offset',
    ],
    [
      'cut/sewing/hole roles',
      'cut/seam arrays; cutLoops lack durable roles',
      'partial',
      'require explicit role plus exact geometry reference',
    ],
    [
      'native curve provenance',
      'flattened points lose per-output-point PathSource',
      'absent',
      'require one explicit provenance record per unchanged point',
    ],
    [
      'grain direction',
      'selected PieceSizeSpec.grain',
      'native',
      'copy accepted angle; null blocks',
    ],
    [
      'two-sided seam anchors',
      'seam contour is not an inter-piece relation',
      'absent',
      'require explicit vertex anchors; never pair by proximity',
    ],
    [
      'assembly stage/order',
      'separate inferred/editor model',
      'absent',
      'require explicit operations; do not import inferred assembly',
    ],
    [
      'material revision',
      'PieceSpec.fabrics only stores scope keys',
      'partial',
      'require explicit material assignments and revisions',
    ],
  ].map(([required, current, availability, bridgePolicy]) => ({
    required,
    current,
    availability,
    bridgePolicy,
  })) as readonly PatternImportDxfBridgeCapabilityV1[],
);

export type PatternImportDxfBridgeFieldProvenanceV1 = {
  readonly target: string;
  readonly origin: string;
  readonly mode: 'copied' | 'canonical-aggregate' | 'explicit-supplement';
};

export const PATTERN_IMPORT_DXF_HANDOFF_FIELD_PROVENANCE_V1 = deepFreeze([
  { target: 'source.documentId/revision', origin: 'binding', mode: 'explicit-supplement' },
  {
    target: 'source.sourceSha256',
    origin: 'manifest.source.files canonical descriptors',
    mode: 'canonical-aggregate',
  },
  { target: 'source.exportSha256', origin: 'writer binding', mode: 'explicit-supplement' },
  { target: 'pieces[].id/name/cutCount', origin: 'PieceSpec', mode: 'copied' },
  {
    target: 'pieces[].grainDegrees',
    origin: 'selected PieceSizeSpec.grain.angleDeg',
    mode: 'copied',
  },
  {
    target: 'contours[].vertices[].positionMm',
    origin: 'selected PieceSizeSpec geometry reference',
    mode: 'copied',
  },
  {
    target: 'contours[].role/source mapping',
    origin: 'explicit.pieces[].contours',
    mode: 'explicit-supplement',
  },
  {
    target: 'seams/operations/materials',
    origin: 'explicit assembly supplement',
    mode: 'explicit-supplement',
  },
] as const satisfies readonly PatternImportDxfBridgeFieldProvenanceV1[]);

export type PatternImportDxfBridgeBlockerCodeV1 =
  | 'invalid-input'
  | 'bounds-exceeded'
  | 'raw-dxf-forbidden'
  | 'source-binding-missing'
  | 'stale-manifest-binding'
  | 'stale-geometry-binding'
  | 'stale-revision-binding'
  | 'piece-selection-missing'
  | 'contour-role-missing'
  | 'curve-provenance-missing'
  | 'grain-missing'
  | 'seam-anchors-missing'
  | 'assembly-order-missing'
  | 'material-revision-missing'
  | 'trusted-corpus-authority-missing'
  | 'invalid-seam-contract'
  | 'sha256-unavailable'
  | 'handoff-contract-rejected';

export type PatternImportDxfBridgeBlockerV1 = {
  readonly code: PatternImportDxfBridgeBlockerCodeV1;
  readonly field: string;
  readonly detail: string;
  readonly identities: readonly string[];
};

export type PatternImportDxfBindingDigestsV1 = {
  readonly manifestIdentitySha256: string;
  readonly selectedGeometrySha256: string;
  readonly sourceAggregateSha256: string;
};

export type PatternImportDxfBindingDigestsResultV1 =
  | { readonly ok: true; readonly value: PatternImportDxfBindingDigestsV1 }
  | {
      readonly ok: false;
      readonly code: 'invalid-current-artifacts' | 'sha256-unavailable';
      readonly errors: readonly string[];
    };

export type PatternImportDxfArtifactBindingSealResultV1 =
  | { readonly ok: true; readonly artifactBindingSha256: string }
  | { readonly ok: false; readonly code: 'sha256-unavailable' };

type BridgeFailureCode = 'bridge-blocked' | 'stale-binding' | 'sha256-unavailable';

export type PatternImportDxfHandoffBridgeResultV1 =
  | {
      readonly ok: true;
      readonly handoff: DxfAssemblyHandoffV1;
      readonly bindingDigests: PatternImportDxfBindingDigestsV1;
      readonly capabilities: typeof PATTERN_IMPORT_DXF_HANDOFF_CAPABILITY_MATRIX_V1;
      readonly fieldProvenance: typeof PATTERN_IMPORT_DXF_HANDOFF_FIELD_PROVENANCE_V1;
    }
  | {
      readonly ok: false;
      readonly code: BridgeFailureCode;
      readonly blockers: readonly PatternImportDxfBridgeBlockerV1[];
      readonly capabilities: typeof PATTERN_IMPORT_DXF_HANDOFF_CAPABILITY_MATRIX_V1;
      readonly fieldProvenance: typeof PATTERN_IMPORT_DXF_HANDOFF_FIELD_PROVENANCE_V1;
    };

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_PIECES = 256;
const MAX_POINTS = 100_000;
const MAX_SOURCE_FILES = 256;
const MAX_BLOCKERS = 128;
const MAX_SCAN_NODES = 1_000_000;
const MAX_CANONICAL_BYTES = 16 * 1024 * 1024;
const KAT_PREIMAGE = 'pattern-import-dxf-handoff-bridge-v1-kat';
const KAT_DIGEST = '6fe22f4278c01e47a8a32fdef0137e9373c47c14cf5db15658fa4759763c49c7';
const textEncoder = new TextEncoder();

type ResolvedSelection = {
  readonly selection: PatternImportDxfBridgeSelectionV1;
  readonly piece: PieceSpec;
  readonly size: PieceSizeSpec;
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError('non-canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || typeof value !== 'object') throw new TypeError('unsupported canonical value');
  return (
    '{' +
    Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]))
      .join(',') +
    '}'
  );
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Canonical(
  value: unknown,
  options: Pick<DxfAssemblyHandoffOptionsV1, 'crypto'>,
): Promise<string | null> {
  const crypto = options.crypto ?? globalThis.crypto;
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const kat = new Uint8Array(
      await crypto.subtle.digest('SHA-256', textEncoder.encode(KAT_PREIMAGE)),
    );
    if (kat.byteLength !== 32 || hex(kat) !== KAT_DIGEST) return null;
    const bytes = textEncoder.encode('pattern-import-dxf-handoff-bridge-v1\0' + canonical(value));
    if (bytes.byteLength > MAX_CANONICAL_BYTES) return null;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return digest.byteLength === 32 ? hex(digest) : null;
  } catch {
    return null;
  }
}

function sourceFilesPayload(source: ManifestSource) {
  return [...source.files]
    .map((file) => ({
      name: file.name,
      sha256: file.sha256,
      bytes: file.bytes,
      kind: file.kind,
      pages: file.pages,
    }))
    .sort(
      (left, right) =>
        compareCodeUnits(left.name, right.name) ||
        compareCodeUnits(left.sha256, right.sha256) ||
        compareCodeUnits(left.kind, right.kind) ||
        left.bytes - right.bytes ||
        left.pages - right.pages,
    );
}

function manifestIdentityPayload(manifest: PatternImportDxfManifestBridgeViewV1) {
  return {
    v: manifest.v,
    generator: manifest.generator,
    createdAt: manifest.createdAt,
    techCardId: manifest.techCardId,
    units: manifest.units,
    cutLayerIsFinal: manifest.cutLayerIsFinal,
    source: {
      files: sourceFilesPayload(manifest.source),
      scale: manifest.source.scale,
      sheet: manifest.source.sheet,
      sheets: manifest.source.sheets ?? [],
      holes: manifest.source.holes ?? [],
      sizeEncoding: manifest.source.sizeEncoding,
      variant: manifest.source.variant,
      generatedFusing: manifest.source.generatedFusing ?? false,
      presegmentedIdentities: [...(manifest.source.presegmentedIdentities ?? [])].sort(
        compareCodeUnits,
      ),
    },
  };
}

function pointPayload(points: readonly PtMm[]): readonly (readonly [number, number])[] {
  return points.map((point) => [point.x, point.y] as const);
}

function selectedGeometryPayload(resolved: readonly ResolvedSelection[]) {
  return [...resolved]
    .sort(
      (left, right) =>
        compareCodeUnits(left.selection.pieceId, right.selection.pieceId) ||
        compareCodeUnits(left.selection.sizeToken, right.selection.sizeToken),
    )
    .map(({ piece, size }) => ({
      identity: piece.identity,
      displayName: piece.displayName,
      piecesPerGarment: piece.piecesPerGarment,
      sizeToken: size.sizeToken,
      sizeId: size.sizeId,
      rank: size.rank,
      cut: pointPayload(size.cut),
      cutLoops: (size.cutLoops ?? []).map(pointPayload),
      seam: size.seam ? pointPayload(size.seam) : null,
      grain: size.grain
        ? {
            a: [size.grain.a.x, size.grain.a.y],
            b: [size.grain.b.x, size.grain.b.y],
            angleDeg: size.grain.angleDeg,
            origin: size.grain.origin,
            evidence: [...(size.grain.evidence ?? [])],
          }
        : null,
    }));
}

function resolveSelections(
  pieces: readonly PieceSpec[],
  selections: readonly PatternImportDxfBridgeSelectionV1[],
): { readonly resolved: readonly ResolvedSelection[]; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const resolved: ResolvedSelection[] = [];
  const seen = new Set<string>();
  for (const selection of selections) {
    const key = selection.pieceId + '\0' + selection.sizeToken;
    if (seen.has(key)) {
      errors.push('duplicate selection ' + selection.pieceId + '/' + selection.sizeToken);
      continue;
    }
    seen.add(key);
    const matchingPieces = pieces.filter((piece) => piece.identity === selection.pieceId);
    const matchingSizes = matchingPieces[0]?.sizes.filter(
      (size) => size.sizeToken === selection.sizeToken,
    );
    if (matchingPieces.length !== 1 || matchingSizes?.length !== 1) {
      errors.push(selection.pieceId + '/' + selection.sizeToken + ' does not resolve exactly once');
      continue;
    }
    resolved.push({ selection, piece: matchingPieces[0], size: matchingSizes[0] });
  }
  return { resolved, errors };
}

function currentArtifactErrors(
  manifest: PatternImportDxfManifestBridgeViewV1,
  pieces: readonly PieceSpec[],
  selections: readonly PatternImportDxfBridgeSelectionV1[],
): readonly string[] {
  const errors: string[] = [];
  if (pieces.length > MAX_PIECES || selections.length === 0 || selections.length > MAX_PIECES) {
    errors.push('piece or selection count is outside the bridge bounds');
  }
  if (manifest.source.files.length === 0 || manifest.source.files.length > MAX_SOURCE_FILES) {
    errors.push('source file count is outside the bridge bounds');
  }
  if (manifest.source.files.some((file) => !SHA256.test(file.sha256))) {
    errors.push('every source file needs lowercase SHA-256');
  }
  return errors;
}

export async function computePatternImportDxfBridgeBindingDigestsV1(
  manifest: PatternImportDxfManifestBridgeViewV1,
  pieces: readonly PieceSpec[],
  selections: readonly PatternImportDxfBridgeSelectionV1[],
  options: Pick<DxfAssemblyHandoffOptionsV1, 'crypto'> = {},
): Promise<PatternImportDxfBindingDigestsResultV1> {
  const selection = resolveSelections(pieces, selections);
  const errors = [...currentArtifactErrors(manifest, pieces, selections), ...selection.errors];
  if (errors.length > 0) {
    return deepFreeze({ ok: false, code: 'invalid-current-artifacts', errors });
  }
  let totalPoints = 0;
  for (const { piece, size } of selection.resolved) {
    totalPoints += size.cut.length + (size.seam?.length ?? 0);
    totalPoints += (size.cutLoops ?? []).reduce((sum, loop) => sum + loop.length, 0);
    const points = [...size.cut, ...(size.seam ?? []), ...(size.cutLoops ?? []).flat()];
    if (
      !piece.identity ||
      !piece.displayName ||
      !Number.isSafeInteger(piece.piecesPerGarment) ||
      !size.sizeToken ||
      !Number.isSafeInteger(size.sizeId) ||
      !Number.isSafeInteger(size.rank) ||
      points.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          Object.is(point.x, -0) ||
          Object.is(point.y, -0),
      )
    ) {
      errors.push(
        piece.identity + '/' + size.sizeToken + ' has invalid canonical geometry metadata',
      );
    }
  }
  if (errors.length > 0) {
    return deepFreeze({ ok: false, code: 'invalid-current-artifacts', errors });
  }
  if (totalPoints > MAX_POINTS) {
    return deepFreeze({
      ok: false,
      code: 'invalid-current-artifacts',
      errors: ['selected geometry exceeds the bridge point bound'],
    });
  }
  const [manifestIdentitySha256, selectedGeometrySha256, sourceAggregateSha256] = await Promise.all(
    [
      sha256Canonical(manifestIdentityPayload(manifest), options),
      sha256Canonical(selectedGeometryPayload(selection.resolved), options),
      sha256Canonical({ files: sourceFilesPayload(manifest.source) }, options),
    ],
  );
  if (!manifestIdentitySha256 || !selectedGeometrySha256 || !sourceAggregateSha256) {
    return deepFreeze({
      ok: false,
      code: 'sha256-unavailable',
      errors: ['Web Crypto SHA-256 is unavailable, failed its KAT, or exceeded canonical bounds.'],
    });
  }
  return deepFreeze({
    ok: true,
    value: { manifestIdentitySha256, selectedGeometrySha256, sourceAggregateSha256 },
  });
}

export async function computePatternImportDxfBridgeArtifactBindingSha256V1(
  binding: PatternImportDxfBridgeUnsignedBindingV1,
  options: Pick<DxfAssemblyHandoffOptionsV1, 'crypto'> = {},
): Promise<PatternImportDxfArtifactBindingSealResultV1> {
  const artifactBindingSha256 = await sha256Canonical(binding, options);
  return artifactBindingSha256
    ? deepFreeze({ ok: true, artifactBindingSha256 })
    : deepFreeze({ ok: false, code: 'sha256-unavailable' });
}

function pushBlocker(
  blockers: PatternImportDxfBridgeBlockerV1[],
  code: PatternImportDxfBridgeBlockerCodeV1,
  field: string,
  detail: string,
  identities: readonly string[] = [],
): void {
  if (blockers.length >= MAX_BLOCKERS) return;
  blockers.push({
    code,
    field,
    detail,
    identities: [...identities].slice(0, 16).sort(compareCodeUnits),
  });
}

function blocked(
  blockers: readonly PatternImportDxfBridgeBlockerV1[],
  code: BridgeFailureCode = 'bridge-blocked',
): PatternImportDxfHandoffBridgeResultV1 {
  return deepFreeze({
    ok: false,
    code,
    blockers: [...blockers].sort(
      (left, right) =>
        compareCodeUnits(left.field, right.field) ||
        compareCodeUnits(left.code, right.code) ||
        compareCodeUnits(left.detail, right.detail),
    ),
    capabilities: PATTERN_IMPORT_DXF_HANDOFF_CAPABILITY_MATRIX_V1,
    fieldProvenance: PATTERN_IMPORT_DXF_HANDOFF_FIELD_PROVENANCE_V1,
  });
}

function scanForForbiddenData(value: unknown): string | null {
  const active = new Set<object>();
  let nodes = 0;
  const visit = (current: unknown, path: string, depth: number): string | null => {
    nodes += 1;
    if (nodes > MAX_SCAN_NODES || depth > 32) return 'input exceeds the inspection bound';
    if (!current || typeof current !== 'object') return null;
    if (current instanceof ArrayBuffer || ArrayBuffer.isView(current) || current instanceof Blob) {
      return path + ' contains binary data';
    }
    if (active.has(current)) return path + ' contains a cycle';
    active.add(current);
    try {
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key === 'symbol') return path + ' contains a symbol property';
        if (['rawDxf', 'dxfText', 'bareText'].includes(key)) {
          return path + '.' + key + ' carries raw DXF content';
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !('value' in descriptor)) return path + '.' + key + ' is not plain data';
        const problem = visit(descriptor.value, path + '.' + key, depth + 1);
        if (problem) return problem;
      }
      return null;
    } finally {
      active.delete(current);
    }
  };
  return visit(value, 'bridgeInput', 0);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function runtimeCollectionsAreStructured(input: PatternImportDxfHandoffBridgeInputV1): boolean {
  const source = record(record(input.manifest)?.source);
  if (!source || !Array.isArray(source.files)) return false;
  if (
    !input.pieces.every((piece) => record(piece) && Array.isArray(record(piece)?.sizes)) ||
    !input.selections.every(
      (selection) =>
        typeof record(selection)?.pieceId === 'string' &&
        typeof record(selection)?.sizeToken === 'string',
    )
  ) {
    return false;
  }
  if (
    !input.explicit.pieces.every(
      (piece) =>
        record(piece) &&
        Array.isArray(record(piece)?.contours) &&
        piece.contours.every(
          (contour) => record(contour) && Array.isArray(record(contour)?.sourceVertices),
        ),
    ) ||
    !input.explicit.seams.every(
      (seam) => record(seam) && Array.isArray(record(seam)?.sides) && seam.sides.length === 2,
    ) ||
    !input.explicit.operations.every(
      (operation) => record(operation) && Array.isArray(record(operation)?.seamIds),
    ) ||
    !input.explicit.materials.every(
      (material) => record(material) && Array.isArray(record(material)?.pieceIds),
    )
  ) {
    return false;
  }
  return true;
}

function exactTopLevelInput(value: unknown): value is PatternImportDxfHandoffBridgeInputV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expected = ['binding', 'explicit', 'manifest', 'pieces', 'schemaVersion', 'selections'];
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function geometryPoints(
  size: PieceSizeSpec,
  contour: PatternImportDxfBridgeContourV1,
): readonly PtMm[] | null {
  if (contour.geometry.kind === 'cut') return size.cut;
  if (contour.geometry.kind === 'seam') return size.seam;
  return size.cutLoops?.[contour.geometry.index] ?? null;
}

function handoffFailureBlockers(
  failure: DxfAssemblyHandoffFailureV1,
): readonly PatternImportDxfBridgeBlockerV1[] {
  return failure.errors.map((error) => ({
    code: 'handoff-contract-rejected',
    field: 'dxfAssemblyHandoffV1',
    detail: failure.code + ': ' + error,
    identities: [],
  }));
}

function seamContractBlockers(
  seams: readonly DxfSeamV1[],
): readonly PatternImportDxfBridgeBlockerV1[] {
  const blockers: PatternImportDxfBridgeBlockerV1[] = [];
  for (const seam of seams) {
    if (seam.mapping === 'equal' && seam.lengthRatio !== 1) {
      pushBlocker(
        blockers,
        'invalid-seam-contract',
        'explicit.seams[' + seam.id + '].lengthRatio',
        'equal mapping requires lengthRatio exactly 1; the bridge will not repair it',
        seam.sides.map((side) => side.pieceId),
      );
    }
    const [a, b] = seam.sides;
    const sameContour = a.pieceId === b.pieceId && a.contourId === b.contourId;
    const sameAnchors =
      (a.anchors[0] === b.anchors[0] && a.anchors[1] === b.anchors[1]) ||
      (a.anchors[0] === b.anchors[1] && a.anchors[1] === b.anchors[0]);
    if (sameContour && sameAnchors) {
      pushBlocker(
        blockers,
        'invalid-seam-contract',
        'explicit.seams[' + seam.id + '].sides',
        'both sides resolve to the same exact contour range',
        [a.pieceId],
      );
    }
  }
  return blockers;
}

function validateBinding(
  input: PatternImportDxfHandoffBridgeInputV1,
  digests: PatternImportDxfBindingDigestsV1,
  expectedArtifactBindingSha256: string,
  blockers: PatternImportDxfBridgeBlockerV1[],
): void {
  const { binding, manifest } = input;
  if (
    manifest.units !== 'mm' ||
    manifest.cutLayerIsFinal !== true ||
    !SHA256.test(binding.exportSha256)
  ) {
    pushBlocker(
      blockers,
      'source-binding-missing',
      'binding.exportSha256',
      'manifest must be final millimetre geometry and carry writer-computed DXF SHA-256',
    );
  }
  if (
    binding.manifestIdentitySha256 !== digests.manifestIdentitySha256 ||
    binding.manifestCreatedAt !== manifest.createdAt ||
    binding.manifestGenerator !== manifest.generator ||
    binding.techCardId !== manifest.techCardId
  ) {
    pushBlocker(
      blockers,
      'stale-manifest-binding',
      'binding.manifestIdentitySha256',
      'binding does not match the current manifest identity',
    );
  }
  if (binding.selectedGeometrySha256 !== digests.selectedGeometrySha256) {
    pushBlocker(
      blockers,
      'stale-geometry-binding',
      'binding.selectedGeometrySha256',
      'binding does not match selected PieceSpec geometry',
      input.selections.map((selection) => selection.pieceId),
    );
  }
  if (
    !SHA256.test(binding.artifactBindingSha256) ||
    binding.artifactBindingSha256 !== expectedArtifactBindingSha256
  ) {
    pushBlocker(
      blockers,
      'stale-revision-binding',
      'binding.artifactBindingSha256',
      'document revision, export hash or artifact digest binding changed after sealing',
    );
  }
  if (!binding.documentId || !binding.revision || !binding.exporterId || !binding.exporterVersion) {
    pushBlocker(
      blockers,
      'source-binding-missing',
      'binding.documentId/revision',
      'document, revision and exporter identity are required',
    );
  }
  if (binding.provenanceKind === 'trusted-corpus') {
    pushBlocker(
      blockers,
      'trusted-corpus-authority-missing',
      'binding.provenanceKind',
      'a caller-provided corpus array is not authority; an opaque registry owner is required',
    );
  } else if (
    !['synthetic-fixture', 'untrusted-product'].includes(binding.provenanceKind) ||
    binding.corpusEntryId !== null
  ) {
    pushBlocker(
      blockers,
      'source-binding-missing',
      'binding.provenanceKind/corpusEntryId',
      'bridge accepts only explicitly synthetic or untrusted-product non-production artifacts',
    );
  }
}

export async function buildPatternImportDxfAssemblyHandoffBridgeV1(
  raw: unknown,
  options: DxfAssemblyHandoffOptionsV1 = {},
): Promise<PatternImportDxfHandoffBridgeResultV1> {
  const forbidden = scanForForbiddenData(raw);
  if (forbidden) {
    return blocked([
      {
        code:
          forbidden.includes('binary') || forbidden.includes('raw DXF')
            ? 'raw-dxf-forbidden'
            : 'invalid-input',
        field: 'bridgeInput',
        detail: forbidden,
        identities: [],
      },
    ]);
  }
  if (!exactTopLevelInput(raw) || raw.schemaVersion !== PATTERN_IMPORT_DXF_HANDOFF_BRIDGE_V1) {
    return blocked([
      {
        code: 'invalid-input',
        field: 'bridgeInput',
        detail: 'bridge input must have the exact v1 top-level shape',
        identities: [],
      },
    ]);
  }
  const input = raw;
  const blockers: PatternImportDxfBridgeBlockerV1[] = [];
  if (
    !input.binding ||
    typeof input.binding !== 'object' ||
    Array.isArray(input.binding) ||
    !input.manifest ||
    typeof input.manifest !== 'object' ||
    Array.isArray(input.manifest) ||
    !Array.isArray(input.pieces) ||
    !Array.isArray(input.selections) ||
    !input.explicit ||
    typeof input.explicit !== 'object' ||
    Array.isArray(input.explicit) ||
    !Array.isArray(input.explicit.pieces) ||
    !Array.isArray(input.explicit.seams) ||
    !Array.isArray(input.explicit.operations) ||
    !Array.isArray(input.explicit.materials) ||
    !runtimeCollectionsAreStructured(input)
  ) {
    return blocked([
      {
        code: 'invalid-input',
        field: 'bridgeInput',
        detail: 'current artifacts, selections and explicit assembly arrays are required',
        identities: [],
      },
    ]);
  }

  const digestResult = await computePatternImportDxfBridgeBindingDigestsV1(
    input.manifest,
    input.pieces,
    input.selections,
    options,
  );
  if (!digestResult.ok) {
    for (const error of digestResult.errors) {
      pushBlocker(
        blockers,
        digestResult.code === 'sha256-unavailable' ? 'sha256-unavailable' : 'bounds-exceeded',
        'currentArtifacts',
        error,
      );
    }
    return blocked(
      blockers,
      digestResult.code === 'sha256-unavailable' ? 'sha256-unavailable' : 'bridge-blocked',
    );
  }
  const unsignedBinding: PatternImportDxfBridgeUnsignedBindingV1 = {
    documentId: input.binding.documentId,
    revision: input.binding.revision,
    exporterId: input.binding.exporterId,
    exporterVersion: input.binding.exporterVersion,
    exportSha256: input.binding.exportSha256,
    manifestIdentitySha256: input.binding.manifestIdentitySha256,
    selectedGeometrySha256: input.binding.selectedGeometrySha256,
    manifestCreatedAt: input.binding.manifestCreatedAt,
    manifestGenerator: input.binding.manifestGenerator,
    techCardId: input.binding.techCardId,
    provenanceKind: input.binding.provenanceKind,
    corpusEntryId: input.binding.corpusEntryId,
  };
  const bindingSeal = await computePatternImportDxfBridgeArtifactBindingSha256V1(
    unsignedBinding,
    options,
  );
  if (!bindingSeal.ok) {
    pushBlocker(
      blockers,
      'sha256-unavailable',
      'binding.artifactBindingSha256',
      'Web Crypto SHA-256 cannot verify the revision/export binding.',
    );
    return blocked(blockers, 'sha256-unavailable');
  }
  validateBinding(input, digestResult.value, bindingSeal.artifactBindingSha256, blockers);

  const resolved = resolveSelections(input.pieces, input.selections);
  for (const error of resolved.errors) {
    pushBlocker(blockers, 'piece-selection-missing', 'selections', error);
  }
  const explicitByKey = new Map(
    input.explicit.pieces.map((piece) => [piece.pieceId + '\0' + piece.sizeToken, piece]),
  );
  if (explicitByKey.size !== input.explicit.pieces.length) {
    pushBlocker(blockers, 'invalid-input', 'explicit.pieces', 'piece bindings must be unique');
  }

  const candidatePieces: {
    id: string;
    name: string;
    cutCount: number;
    grainDegrees: number;
    contours: {
      id: string;
      role: PatternImportDxfBridgeContourV1['role'];
      closed: true;
      vertices: {
        id: string;
        positionMm: readonly [number, number];
        source: {
          sourceCurveId: string;
          parameterSpace: DxfSourceCurveParameterSpaceV1;
          sourceCurveT: number;
          normalizedArc: number;
        };
      }[];
    }[];
  }[] = [];

  for (const { selection, piece, size } of resolved.resolved) {
    const pieceId = selection.pieceId;
    const explicitPiece = explicitByKey.get(pieceId + '\0' + selection.sizeToken);
    if (!explicitPiece || explicitPiece.contours.length === 0) {
      pushBlocker(
        blockers,
        'contour-role-missing',
        'explicit.pieces[' + pieceId + '].contours',
        'every selected piece needs explicit roles and geometry references',
        [pieceId],
      );
      pushBlocker(
        blockers,
        'curve-provenance-missing',
        'explicit.pieces[' + pieceId + '].contours[].sourceVertices',
        'flattened current points have no durable native-curve provenance',
        [pieceId],
      );
      continue;
    }
    if (!size.grain || !Number.isFinite(size.grain.angleDeg)) {
      pushBlocker(
        blockers,
        'grain-missing',
        'pieces[' + pieceId + '].sizes[' + selection.sizeToken + '].grain',
        'selected PieceSizeSpec has no accepted finite grain direction',
        [pieceId],
      );
      continue;
    }
    const contours = [] as (typeof candidatePieces)[number]['contours'];
    for (const contour of explicitPiece.contours) {
      const points = geometryPoints(size, contour);
      if (!points) {
        pushBlocker(
          blockers,
          'contour-role-missing',
          'explicit.pieces[' + pieceId + '].contours[' + contour.id + '].geometry',
          'geometry reference is absent from selected PieceSizeSpec',
          [pieceId],
        );
        continue;
      }
      const requiredGeometry =
        contour.role === 'sewing-boundary'
          ? 'seam'
          : contour.role === 'cut-boundary'
            ? 'cut'
            : 'cut-loop';
      if (contour.geometry.kind !== requiredGeometry) {
        pushBlocker(
          blockers,
          'contour-role-missing',
          'explicit.pieces[' + pieceId + '].contours[' + contour.id + ']',
          'role must reference same-kind current geometry; no conversion is inferred',
          [pieceId],
        );
        continue;
      }
      if (contour.sourceVertices.length !== points.length) {
        pushBlocker(
          blockers,
          'curve-provenance-missing',
          'explicit.pieces[' + pieceId + '].contours[' + contour.id + '].sourceVertices',
          'requires one provenance record per unchanged current point',
          [pieceId],
        );
        continue;
      }
      contours.push({
        id: contour.id,
        role: contour.role,
        closed: true,
        vertices: points.map((point, index) => ({
          id: contour.sourceVertices[index].vertexId,
          positionMm: [point.x, point.y] as const,
          source: {
            sourceCurveId: contour.sourceVertices[index].sourceCurveId,
            parameterSpace: contour.sourceVertices[index].parameterSpace,
            sourceCurveT: contour.sourceVertices[index].sourceCurveT,
            normalizedArc: contour.sourceVertices[index].normalizedArc,
          },
        })),
      });
    }
    candidatePieces.push({
      id: pieceId,
      name: piece.displayName,
      cutCount: piece.piecesPerGarment,
      grainDegrees: size.grain.angleDeg,
      contours,
    });
  }

  if (input.explicit.pieces.length !== resolved.resolved.length) {
    pushBlocker(
      blockers,
      'invalid-input',
      'explicit.pieces',
      'explicit piece set must exactly match current selections',
    );
  }
  if (resolved.resolved.length > 1 && input.explicit.seams.length === 0) {
    pushBlocker(
      blockers,
      'seam-anchors-missing',
      'explicit.seams',
      'pattern-import sewing contours are not inter-piece seam relations',
      resolved.resolved.map(({ piece }) => piece.identity),
    );
  }
  blockers.push(...seamContractBlockers(input.explicit.seams));
  if (input.explicit.operations.length === 0) {
    pushBlocker(
      blockers,
      'assembly-order-missing',
      'explicit.operations',
      'pattern-import output has no simulation assembly stage/order',
    );
  }
  if (
    input.explicit.materials.length === 0 ||
    input.explicit.materials.some((material) => !material.materialRevision)
  ) {
    pushBlocker(
      blockers,
      'material-revision-missing',
      'explicit.materials',
      'fabric scope keys do not carry material revision identity',
    );
  }
  if (blockers.length > 0) {
    const stale = blockers.some((blocker) =>
      ['stale-manifest-binding', 'stale-geometry-binding', 'stale-revision-binding'].includes(
        blocker.code,
      ),
    );
    return blocked(blockers, stale ? 'stale-binding' : 'bridge-blocked');
  }

  const built = await buildDxfAssemblyHandoffV1(
    {
      schemaVersion: DXF_ASSEMBLY_HANDOFF_V1,
      source: {
        format: 'DXF',
        documentId: input.binding.documentId,
        revision: input.binding.revision,
        units: 'mm',
        sourceSha256: digestResult.value.sourceAggregateSha256,
        exportSha256: input.binding.exportSha256,
        exporterId: input.binding.exporterId,
        exporterVersion: input.binding.exporterVersion,
        provenanceKind: 'synthetic-fixture',
        corpusEntryId: null,
      },
      physicalSurface: input.explicit.physicalSurface,
      pieces: candidatePieces,
      seams: input.explicit.seams,
      operations: input.explicit.operations,
      materials: input.explicit.materials,
    },
    { crypto: options.crypto },
  );
  if (!built.ok) return blocked(handoffFailureBlockers(built));
  return deepFreeze({
    ok: true,
    handoff: built.value,
    bindingDigests: digestResult.value,
    capabilities: PATTERN_IMPORT_DXF_HANDOFF_CAPABILITY_MATRIX_V1,
    fieldProvenance: PATTERN_IMPORT_DXF_HANDOFF_FIELD_PROVENANCE_V1,
  });
}
