import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  buildDxfAssemblyHandoffV1,
  compileDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffV1,
  type DxfAssemblySourceV1,
  type DxfSeamV1,
} from './dxf-assembly-handoff-v1';
import {
  DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1,
  type DxfGarmentAssemblyMaterialCompileStageRequestV1,
} from './dxf-garment-assembly-material-compile-stage-v1';
import type { Phase2BoundarySamplingRequestV1 } from '../mesh/triangulation/phase2-boundary-sampling-v1';
import { GARMENT_BOUNDARY_MESH_POLICY_V1 } from '../mesh/garment-phase2-boundary-recovery-v1';
import { GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1 } from '../mesh/garment-phase1-cloth-mesh-compiler-v1';
import { validateClothMaterialV1 } from '../material/cloth-material-v1';

/** Internal, unsigned authoring DTO. This is NOT a registered Composite component/media version. */
export const DXF_EXACT_ASSEMBLY_GRAPH_V1 = 'dxf-exact-assembly-graph/1' as const;
export const DXF_EXACT_ASSEMBLY_GRAPH_CLAIMS_V1 = Object.freeze({
  contentConsistencyOnly: true,
  savedSnapshotAuthenticated: false,
  nativeSourceAuthenticated: false,
  durableGraphVerified: false,
  runtimeAuthority: false,
  assemblyScheduleExecuted: false,
  supportAttachmentPolicy: 'none',
} as const);

/** A detached AO read projection is data, never a bearer capability. */
export type DxfExactAssemblyGraphAoSnapshotV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  operations: readonly Readonly<{
    operationNumber: number;
    work: string;
    inputKeys: readonly string[];
    outputUnitKey: string;
    outputUnitName: string;
    seamKeys: readonly string[];
  }>[];
  seams: readonly Readonly<{
    seamKey: string;
    sourceOperationNumber: number;
    anchoredSize: string;
    direction: 'same' | 'reversed';
    pieceLineKeys: readonly [string, string];
  }>[];
}>;

export type DxfExactAssemblyGraphV1 = Readonly<{
  schemaVersion: typeof DXF_EXACT_ASSEMBLY_GRAPH_V1;
  profile: 'single-saved-row-size-adjacent-native-stitch';
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  source: Readonly<{
    sourceFileId: string;
    nativeDxfSha256: string;
    sizeToken: string;
    handoffCanonicalSha256: string;
    handoffSource: DxfAssemblySourceV1;
  }>;
  pieces: readonly Readonly<{
    pieceId: string;
    pieceLineKey: string;
    cutCount: 1;
    grainDegrees: number;
    materialId: string;
    materialRevision: string;
  }>[];
  operations: readonly Readonly<{
    /** Authored once and retained explicitly; never a backend database operation ID. */
    clientOperationId: string;
    /** Locator in this exact server revision, not a persistent identity. */
    sourceOperationNumber: number;
    inputKeys: readonly string[];
    outputUnitKey: string;
    stage: number;
    order: number;
    kind: 'stitch';
    seamIds: readonly string[];
  }>[];
  seams: readonly Readonly<{
    id: string;
    sourceSeamKey: string;
    clientOperationId: string;
    mapping: 'equal';
    lengthRatio: 1;
    sides: readonly [
      DxfSeamV1['sides'][0] & Readonly<{ pieceLineKey: string }>,
      DxfSeamV1['sides'][1] & Readonly<{ pieceLineKey: string }>,
    ];
  }>[];
  compile: Readonly<
    Pick<
      DxfGarmentAssemblyMaterialCompileStageRequestV1,
      | 'exactSeamToleranceMm'
      | 'materialPolicy'
      | 'materials'
      | 'continuumMaterials'
      | 'materialSolver'
    > & { targetEdgeMm: number }
  >;
}>;

export class DxfExactAssemblyGraphErrorV1 extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'DxfExactAssemblyGraphErrorV1';
  }
}
function fail(code: string, detail: string): never {
  throw new DxfExactAssemblyGraphErrorV1(code, detail);
}
const sha = /^[0-9a-f]{64}$/;
const id = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const stitchWorks = new Set([
  'join_lockstitch',
  'topstitch',
  'overlock_serge',
  'coverstitch',
  'coverlock',
  'chainstitch',
  'blindhem',
  'zigzag',
  'amf_handstitch_imitation',
]);
const encoder = new TextEncoder();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function check(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal))
    fail('cancelled', 'Graph projection cancelled.');
}

function capture(value: unknown): unknown {
  let nodes = 0;
  let textBytes = 0;
  const seen = new Set<object>();
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 500_000 || depth > 32) fail('bounds', 'Graph data exceeds the snapshot bound.');
    if (v === undefined || v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return v;
    if (typeof v === 'string') {
      textBytes += encoder.encode(v).length;
      if (textBytes > 16 * 1024 * 1024 || v.length > 65_536)
        fail('bounds', 'Graph text exceeds bounds.');
      return v;
    }
    if (!v || typeof v !== 'object' || seen.has(v))
      fail('invalid-data', 'Expected an acyclic plain graph.');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype))
      fail('invalid-data', 'Expected plain data, not owners or class instances.');
    seen.add(v);
    const ds = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(ds).some((key) => typeof key !== 'string'))
      fail('invalid-data', 'Symbol keys are unsupported.');
    if (array && (ds.length.value > 100_000 || Object.keys(ds).length !== ds.length.value + 1))
      fail('bounds', 'Arrays must be dense and bounded.');
    const out: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const [key, d] of Object.entries(ds)) {
      if (array && key === 'length') continue;
      if (
        !('value' in d) ||
        !d.enumerable ||
        key === '__proto__' ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        fail('invalid-data', 'Accessors, hidden fields and array extras are unsupported.');
      Object.defineProperty(out, key, { value: copy(d.value, depth + 1), enumerable: true });
    }
    seen.delete(v);
    return Object.freeze(out);
  }
  return copy(value, 0);
}
function record(
  value: unknown,
  fields: readonly string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...fields].sort().join('|')
  )
    fail('invalid-shape', `${path} fields differ.`);
}
function list(
  value: unknown,
  min: number,
  max: number,
  path: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    fail('bounds', `${path} count is unsupported.`);
}
function stable(value: unknown, path: string): void {
  if (typeof value !== 'string' || !id.test(value))
    fail('invalid-id', `${path} requires an explicit stable ID.`);
}
function integer(value: unknown, min: number, path: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < min)
    fail('invalid-number', `${path} is invalid.`);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function row(value: unknown): void {
  record(
    value,
    [
      'techCardId',
      'scopeKey',
      'patternLineKey',
      'revision',
      'cardLockVersion',
      'url',
      'sizeBytes',
      'sha256',
    ],
    'row',
  );
  integer(value.techCardId, 1, 'row.techCardId');
  integer(value.revision, 1, 'row.revision');
  integer(value.cardLockVersion, 0, 'row.cardLockVersion');
  integer(value.sizeBytes, 1, 'row.sizeBytes');
  stable(value.scopeKey, 'row.scopeKey');
  stable(value.patternLineKey, 'row.patternLineKey');
  if (
    typeof value.url !== 'string' ||
    !value.url ||
    value.url.length > 4096 ||
    typeof value.sha256 !== 'string' ||
    !sha.test(value.sha256)
  )
    fail('invalid-row', 'Exact row URL and SHA are required.');
}

function validate(graph: DxfExactAssemblyGraphV1, ao: DxfExactAssemblyGraphAoSnapshotV1): void {
  record(
    graph,
    [
      'schemaVersion',
      'profile',
      'row',
      'serverAssemblyRevision',
      'source',
      'pieces',
      'operations',
      'seams',
      'compile',
    ],
    'graph',
  );
  if (
    graph.schemaVersion !== DXF_EXACT_ASSEMBLY_GRAPH_V1 ||
    graph.profile !== 'single-saved-row-size-adjacent-native-stitch'
  )
    fail('unsupported-profile', 'The explicit single-row adjacent-edge profile is required.');
  row(graph.row);
  row(ao.row);
  if (
    canonical(graph.row) !== canonical(ao.row) ||
    graph.serverAssemblyRevision !== ao.serverAssemblyRevision ||
    !/^asm:v1:[0-9a-f]{32}:[1-9][0-9]*$/.test(graph.serverAssemblyRevision)
  )
    fail('assembly-drift', 'Graph and AO snapshot identity differ.');
  record(
    graph.source,
    ['sourceFileId', 'nativeDxfSha256', 'sizeToken', 'handoffCanonicalSha256', 'handoffSource'],
    'source',
  );
  stable(graph.source.sourceFileId, 'sourceFileId');
  stable(graph.source.sizeToken, 'sizeToken');
  record(
    graph.source.handoffSource,
    [
      'format',
      'documentId',
      'revision',
      'units',
      'sourceSha256',
      'exportSha256',
      'exporterId',
      'exporterVersion',
      'provenanceKind',
      'corpusEntryId',
    ],
    'handoffSource',
  );
  if (
    graph.source.handoffSource.format !== 'DXF' ||
    graph.source.handoffSource.units !== 'mm' ||
    !sha.test(graph.source.handoffSource.sourceSha256) ||
    graph.source.handoffSource.exportSha256 !== graph.row.sha256
  )
    fail(
      'source-binding',
      'Exact saved DXF bytes must match the handoff export digest; aggregate source digest remains distinct.',
    );
  stable(graph.source.handoffSource.documentId, 'documentId');
  stable(graph.source.handoffSource.revision, 'source revision');
  if (
    !sha.test(graph.source.handoffCanonicalSha256) ||
    graph.source.nativeDxfSha256 !== graph.row.sha256
  )
    fail('source-binding', 'Native DXF and exact handoff seals are required.');
  list(graph.pieces, 1, 64, 'pieces');
  list(graph.operations, 1, 400, 'operations');
  list(graph.seams, 1, 400, 'seams');
  list(ao.operations, 1, 4096, 'AO operations');
  list(ao.seams, 1, 400, 'AO seams');
  const numbers = new Set<number>();
  const backendSeams = new Set<string>();
  for (const op of ao.operations) {
    integer(op.operationNumber, 1, 'AO operationNumber');
    if (numbers.has(op.operationNumber))
      fail('duplicate-operation', 'AO operation numbers are not unique.');
    numbers.add(op.operationNumber);
    if (!stitchWorks.has(op.work))
      fail(
        'unsupported-operation',
        'Every AO operation must explicitly name supported stitch work; no operation is silently omitted.',
      );
    if (!Array.isArray(op.seamKeys) || op.seamKeys.length === 0)
      fail(
        'unsupported-empty-operation',
        'Empty AO operations cannot be compiled or silently omitted.',
      );
    list(op.seamKeys, 1, 64, 'AO seam keys');
    for (const key of op.seamKeys) {
      stable(key, 'AO seam key');
      if (backendSeams.has(key)) fail('duplicate-seam-owner', 'An AO seam has multiple owners.');
      backendSeams.add(key);
    }
  }
  const active = ao.operations;
  if (
    active.length !== graph.operations.length ||
    backendSeams.size !== graph.seams.length ||
    ao.seams.length !== graph.seams.length
  )
    fail('incomplete-coverage', 'Every seam-bearing operation and seam must be covered exactly.');
  const pieceIds = new Set<string>();
  const lines = new Set<string>();
  for (const p of graph.pieces) {
    record(
      p,
      ['pieceId', 'pieceLineKey', 'cutCount', 'grainDegrees', 'materialId', 'materialRevision'],
      'piece',
    );
    for (const key of ['pieceId', 'pieceLineKey', 'materialId', 'materialRevision'] as const)
      stable(p[key], key);
    if (pieceIds.has(p.pieceId) || lines.has(p.pieceLineKey))
      fail('duplicate-piece', 'Piece identities and line keys must be unique.');
    pieceIds.add(p.pieceId);
    lines.add(p.pieceLineKey);
    if (
      p.cutCount !== 1 ||
      !Number.isFinite(p.grainDegrees) ||
      p.grainDegrees < 0 ||
      p.grainDegrees >= 360
    )
      fail('piece-semantics', 'One explicit instance and explicit grain in [0,360) are required.');
  }
  const opIds = new Set<string>();
  const seamIds = new Set<string>();
  const sourceKeys = new Set<string>();
  const usedSpans = new Set<string>();
  // Explicit AO inputs use one namespace: source piece line keys or earlier output units.
  // This validates named connectivity, never geometric proximity or backend database row IDs.
  const frontier = new Map([...lines].map((line) => [line, new Set([line])]));
  for (const [i, op] of graph.operations.entries()) {
    const storedOperation = active[i];
    list(storedOperation.inputKeys, 1, 128, 'AO inputKeys');
    const inputSet = new Set<string>();
    const leaves = new Set<string>();
    for (const key of storedOperation.inputKeys) {
      stable(key, 'AO input key');
      const closure = frontier.get(key);
      if (!closure || inputSet.has(key))
        fail(
          'input-graph',
          'AO inputs must name distinct current pieces or earlier available units.',
        );
      inputSet.add(key);
      closure.forEach((line) => leaves.add(line));
    }
    const output = storedOperation.outputUnitKey;
    if (
      typeof output !== 'string' ||
      typeof storedOperation.outputUnitName !== 'string' ||
      (!output && storedOperation.outputUnitName)
    )
      fail('input-graph', 'An output name requires an explicit unit key.');
    if (output) {
      stable(output, 'output unit key');
      if (inputSet.size < 2 || lines.has(output) || (frontier.has(output) && !inputSet.has(output)))
        fail(
          'input-graph',
          'An output needs at least two inputs and cannot overwrite an unrelated unit or piece.',
        );
      inputSet.forEach((key) => frontier.delete(key));
      frontier.set(output, leaves);
    }
    record(
      op,
      [
        'clientOperationId',
        'sourceOperationNumber',
        'inputKeys',
        'outputUnitKey',
        'stage',
        'order',
        'kind',
        'seamIds',
      ],
      'operation',
    );
    stable(op.clientOperationId, 'clientOperationId');
    if (
      canonical(op.inputKeys) !== canonical(storedOperation.inputKeys) ||
      op.outputUnitKey !== storedOperation.outputUnitKey
    )
      fail(
        'input-graph',
        'Explicit ordered graph inputs/output must match the current AO unit contract.',
      );
    integer(op.stage, 0, 'stage');
    if (
      opIds.has(op.clientOperationId) ||
      op.order !== i ||
      op.kind !== 'stitch' ||
      op.sourceOperationNumber !== active[i].operationNumber ||
      (i > 0 && op.stage < graph.operations[i - 1].stage)
    )
      fail('operation-binding', 'Explicit IDs, stage/order and current AO order must agree.');
    opIds.add(op.clientOperationId);
    list(op.seamIds, 1, 64, 'operation.seamIds');
    if (op.seamIds.length !== active[i].seamKeys.length)
      fail('incomplete-coverage', 'Operation seam count differs.');
    for (const [j, seamId] of op.seamIds.entries()) {
      const candidates = graph.seams.filter((s) => s.id === seamId);
      if (candidates.length !== 1 || seamIds.has(seamId))
        fail('duplicate-seam-owner', 'Every seam must have one explicit operation owner.');
      seamIds.add(seamId);
      const seam = candidates[0];
      record(
        seam,
        ['id', 'sourceSeamKey', 'clientOperationId', 'mapping', 'lengthRatio', 'sides'],
        'seam',
      );
      stable(seam.id, 'seam.id');
      stable(seam.sourceSeamKey, 'sourceSeamKey');
      if (
        seam.clientOperationId !== op.clientOperationId ||
        seam.sourceSeamKey !== active[i].seamKeys[j] ||
        sourceKeys.has(seam.sourceSeamKey) ||
        seam.mapping !== 'equal' ||
        seam.lengthRatio !== 1
      )
        fail('seam-binding', 'Exact ordered seam mapping differs.');
      sourceKeys.add(seam.sourceSeamKey);
      list(seam.sides, 2, 2, 'seam.sides');
      const stored = ao.seams.filter((s) => s.seamKey === seam.sourceSeamKey);
      if (
        stored.length !== 1 ||
        stored[0].sourceOperationNumber !== op.sourceOperationNumber ||
        stored[0].anchoredSize !== graph.source.sizeToken
      )
        fail('seam-binding', 'AO seam owner/size differs.');
      for (const [si, side] of seam.sides.entries()) {
        record(side, ['pieceId', 'pieceLineKey', 'contourId', 'anchors', 'direction'], 'side');
        stable(side.pieceId, 'pieceId');
        stable(side.contourId, 'contourId');
        list(side.anchors, 2, 2, 'anchors');
        side.anchors.forEach((a) => stable(a, 'boundaryVertexId'));
        if (
          !graph.pieces.some(
            (p) => p.pieceId === side.pieceId && p.pieceLineKey === side.pieceLineKey,
          ) ||
          side.pieceLineKey !== stored[0].pieceLineKeys[si] ||
          !leaves.has(side.pieceLineKey) ||
          side.anchors[0] === side.anchors[1] ||
          !['forward', 'reverse'].includes(side.direction)
        )
          fail('side-binding', 'Exact source piece/side identity differs.');
        const key = canonical([side.pieceId, side.contourId, [...side.anchors].sort()]);
        if (usedSpans.has(key))
          fail('reused-span', 'An exact native span cannot be stitched twice.');
        usedSpans.add(key);
      }
      if (
        seam.sides[0].pieceId === seam.sides[1].pieceId ||
        (seam.sides[0].direction === seam.sides[1].direction ? 'same' : 'reversed') !==
          stored[0].direction
      )
        fail('direction-binding', 'Explicit directions must match the current AO echo.');
    }
  }
  record(
    graph.compile,
    [
      'targetEdgeMm',
      'exactSeamToleranceMm',
      'materialPolicy',
      'materials',
      'continuumMaterials',
      'materialSolver',
    ],
    'compile',
  );
  const c = graph.compile;
  if (
    !(c.targetEdgeMm > 0 && c.targetEdgeMm <= 1000) ||
    !(
      c.exactSeamToleranceMm >= 0 &&
      c.exactSeamToleranceMm <= GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1
    )
  )
    fail('compile-policy', 'Sampling/tolerance bounds differ.');
  record(
    c.materialPolicy,
    ['version', 'policyId', 'revision', 'minEdgeMm', 'maxEdgeMm'],
    'materialPolicy',
  );
  if (
    c.materialPolicy.version !== GARMENT_BOUNDARY_MESH_POLICY_V1 ||
    !(c.materialPolicy.minEdgeMm > 0 && c.materialPolicy.maxEdgeMm >= c.materialPolicy.minEdgeMm)
  )
    fail('compile-policy', 'Material edge policy is invalid.');
  stable(c.materialPolicy.policyId, 'policyId');
  stable(c.materialPolicy.revision, 'revision');
  record(
    c.materialSolver,
    ['dtS', 'solverIterations', 'allowUncalibratedVisual'],
    'materialSolver',
  );
  if (!(c.materialSolver.dtS > 0) || typeof c.materialSolver.allowUncalibratedVisual !== 'boolean')
    fail('compile-policy', 'Explicit material solver parameters are required.');
  integer(c.materialSolver.solverIterations, 1, 'solverIterations');
  list(c.materials, 1, 64, 'materials');
  list(c.continuumMaterials, 1, 64, 'continuumMaterials');
  const keys = c.materials.map((m) => `${m.id}@${m.revision}`);
  const assigned = new Set(graph.pieces.map((p) => `${p.materialId}@${p.materialRevision}`));
  if (
    new Set(keys).size !== keys.length ||
    keys.length !== assigned.size ||
    keys.some((key) => !assigned.has(key)) ||
    c.materials.some((m) => validateClothMaterialV1(m).length > 0)
  )
    fail('material-binding', 'Exact complete valid immutable material definitions are required.');
  const continuumKeys = new Set<string>();
  for (const m of c.continuumMaterials) {
    record(
      m,
      ['materialId', 'materialRevision', 'complianceMPerN', 'provenance'],
      'continuum material',
    );
    record(m.complianceMPerN, ['warp', 'weft', 'shear'], 'continuum compliance');
    record(m.provenance, ['calibrationStatus', 'sourceId'], 'continuum provenance');
    const key = `${m.materialId}@${m.materialRevision}`;
    if (
      !assigned.has(key) ||
      continuumKeys.has(key) ||
      Object.values(m.complianceMPerN).some((v) => !(v > 0)) ||
      !['measured', 'estimated', 'uncalibrated-visual'].includes(m.provenance.calibrationStatus)
    )
      fail('material-binding', 'Continuum material revision/compliance/provenance differs.');
    stable(m.provenance.sourceId, 'continuum sourceId');
    continuumKeys.add(key);
  }
  if (continuumKeys.size !== assigned.size)
    fail('material-binding', 'Every assigned material needs exact continuum parameters.');
}

export function validateDxfExactAssemblyGraphV1(input: {
  graph: unknown;
  assemblySnapshot: unknown;
}): Readonly<{
  graph: DxfExactAssemblyGraphV1;
  assemblySnapshot: DxfExactAssemblyGraphAoSnapshotV1;
  claims: typeof DXF_EXACT_ASSEMBLY_GRAPH_CLAIMS_V1;
}> {
  const captured = capture(input) as {
    graph: DxfExactAssemblyGraphV1;
    assemblySnapshot: DxfExactAssemblyGraphAoSnapshotV1;
  };
  record(captured, ['graph', 'assemblySnapshot'], 'request');
  validate(captured.graph, captured.assemblySnapshot);
  return Object.freeze({ ...captured, claims: DXF_EXACT_ASSEMBLY_GRAPH_CLAIMS_V1 });
}

/** Pure replay adapter. The caller must separately authenticate the saved native source and durable
 * graph; neither a plain snapshot nor this new sealed handoff establishes those authorities. */
export async function projectDxfExactAssemblyGraphCompileRequestV1(
  input: {
    graph: DxfExactAssemblyGraphV1;
    assemblySnapshot: DxfExactAssemblyGraphAoSnapshotV1;
    sourceHandoff: DxfAssemblyHandoffV1;
    sourceSampling: Phase2BoundarySamplingRequestV1;
  },
  signal?: AbortSignal,
): Promise<
  Readonly<{
    request: DxfGarmentAssemblyMaterialCompileStageRequestV1;
    claims: typeof DXF_EXACT_ASSEMBLY_GRAPH_CLAIMS_V1;
  }>
> {
  check(signal);
  const captured = capture(input) as typeof input;
  record(captured, ['graph', 'assemblySnapshot', 'sourceHandoff', 'sourceSampling'], 'projection');
  const { graph, assemblySnapshot, sourceHandoff, sourceSampling } = captured;
  validate(graph, assemblySnapshot);
  const compiledSource = await compileDxfAssemblyHandoffV1(sourceHandoff);
  check(signal);
  if (
    !compiledSource.ok ||
    sourceHandoff.seal.canonicalSha256 !== graph.source.handoffCanonicalSha256 ||
    canonical(sourceHandoff.source) !== canonical(graph.source.handoffSource) ||
    sourceSampling.sourceFileId !== graph.source.sourceFileId ||
    sourceHandoff.physicalSurface.mode !== 'sewing-surface'
  )
    fail('source-binding', 'Source handoff seal/identity/surface differs.');
  if (
    graph.pieces.length !== sourceHandoff.pieces.length ||
    sourceSampling.pieces.length !== graph.pieces.length
  )
    fail('source-binding', 'Complete source piece coverage is required.');
  for (const p of graph.pieces) {
    const originals = sourceHandoff.pieces.filter((item) => item.id === p.pieceId);
    const samples = sourceSampling.pieces.filter((item) => item.input.pieceId === p.pieceId);
    if (
      originals.length !== 1 ||
      samples.length !== 1 ||
      originals[0].cutCount !== p.cutCount ||
      originals[0].grainDegrees !== p.grainDegrees ||
      samples[0].input.grainDegrees !== p.grainDegrees
    )
      fail('source-binding', 'Exact source piece instance/grain differs.');
  }
  const seams: DxfSeamV1[] = graph.seams.map((seam) => ({
    id: seam.id,
    operationId: seam.clientOperationId,
    mapping: seam.mapping,
    lengthRatio: seam.lengthRatio,
    sides: [
      {
        pieceId: seam.sides[0].pieceId,
        contourId: seam.sides[0].contourId,
        anchors: seam.sides[0].anchors,
        direction: seam.sides[0].direction,
      },
      {
        pieceId: seam.sides[1].pieceId,
        contourId: seam.sides[1].contourId,
        anchors: seam.sides[1].anchors,
        direction: seam.sides[1].direction,
      },
    ],
  }));
  const equalSeams = seams.map((seam) => {
    const side = (index: 0 | 1) => {
      const s = seam.sides[index];
      const piece = sourceHandoff.pieces.find((p) => p.id === s.pieceId)!;
      const contour = piece.contours.find((c) => c.id === s.contourId);
      const ordinal = contour?.vertices.findIndex((v) => v.id === s.anchors[0]) ?? -1;
      if (
        !contour ||
        ordinal < 0 ||
        contour.vertices[(ordinal + 1) % contour.vertices.length].id !== s.anchors[1]
      )
        fail(
          'unsupported-span',
          'Exact adjacent native boundary IDs are required; no coordinate recovery.',
        );
      const edges = sourceSampling.pieces
        .find((p) => p.input.pieceId === s.pieceId)!
        .edges.filter(
          (e) =>
            e.pieceId === s.pieceId &&
            e.ringId === s.contourId &&
            e.startBoundaryVertexId === s.anchors[0] &&
            e.endBoundaryVertexId === s.anchors[1],
        );
      if (edges.length !== 1)
        fail('native-binding', 'An exact native edge occurrence is missing or ambiguous.');
      return { pieceId: s.pieceId, edgeId: edges[0].edgeId, direction: s.direction };
    };
    return {
      seamId: seam.id,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      exactToleranceMm: graph.compile.exactSeamToleranceMm,
      sides: [side(0), side(1)] as const,
    };
  });
  const handoff = await buildDxfAssemblyHandoffV1({
    schemaVersion: sourceHandoff.schemaVersion,
    source: sourceHandoff.source,
    physicalSurface: sourceHandoff.physicalSurface,
    pieces: sourceHandoff.pieces,
    seams,
    operations: graph.operations.map(({ clientOperationId, stage, order, kind, seamIds }) => ({
      id: clientOperationId,
      stage,
      order,
      kind,
      seamIds,
    })),
    materials: graph.compile.materials.map((m) => ({
      id: m.id,
      materialRevision: m.revision,
      pieceIds: graph.pieces
        .filter((p) => p.materialId === m.id && p.materialRevision === m.revision)
        .map((p) => p.pieceId),
    })),
  });
  check(signal);
  if (!handoff.ok) fail('handoff-blocked', handoff.errors.join('; '));
  return Object.freeze({
    request: Object.freeze({
      schemaVersion: DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1,
      handoff: handoff.value,
      samplingRequest: {
        ...sourceSampling,
        targetEdgeMm: graph.compile.targetEdgeMm,
        equalSeams,
        pieces: sourceSampling.pieces.map((p) => ({
          ...p,
          input: {
            ...p.input,
            seamEndpoints: seams.flatMap((seam) =>
              seam.sides.flatMap((s, si) =>
                s.pieceId === p.input.pieceId
                  ? s.anchors.map((boundaryVertexId, ai) => ({
                      id: `${seam.id}/side-${si}/anchor-${ai}`,
                      boundaryVertexId,
                    }))
                  : [],
              ),
            ),
          },
        })),
      },
      exactSeamToleranceMm: graph.compile.exactSeamToleranceMm,
      materialPolicy: graph.compile.materialPolicy,
      materials: graph.compile.materials,
      continuumMaterials: graph.compile.continuumMaterials,
      materialSolver: graph.compile.materialSolver,
    }),
    claims: DXF_EXACT_ASSEMBLY_GRAPH_CLAIMS_V1,
  });
}
