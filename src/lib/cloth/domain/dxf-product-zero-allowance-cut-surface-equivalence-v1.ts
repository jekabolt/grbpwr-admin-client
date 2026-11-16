import { compileDxfAssemblyHandoffV1, type DxfAssemblyHandoffV1 } from './dxf-assembly-handoff-v1';
import type { PatternImportDxfProductMultiseamMappingCompositionRequestV2 } from './pattern-import-dxf-product-multiseam-mapping-composition-v2';

export const DXF_PRODUCT_ZERO_ALLOWANCE_CUT_SURFACE_EQUIVALENCE_V1 =
  'dxf-product-zero-allowance-cut-surface-equivalence/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();
const MAX_DEPTH = 48;
const MAX_NODES = 1_000_000;
const MAX_PROPERTIES = 2_000_000;
const MAX_ARRAY_LENGTH = 250_000;
const MAX_STRING_LENGTH = 32 * 1024 * 1024;

export type DxfProductZeroAllowanceCutSurfaceEquivalencePieceBindingV1 = Readonly<{
  pieceId: string;
  sizeToken: string;
  contourId: string;
  cutSeamCanonicalSha256: string;
}>;

export type DxfProductZeroAllowanceCutSurfaceEquivalenceV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_ZERO_ALLOWANCE_CUT_SURFACE_EQUIVALENCE_V1;
  validated: true;
  handoffCanonicalSha256: string;
  sourceFileId: string;
  sizeToken: string;
  pieceBindings: readonly [
    DxfProductZeroAllowanceCutSurfaceEquivalencePieceBindingV1,
    DxfProductZeroAllowanceCutSurfaceEquivalencePieceBindingV1,
  ];
  canonicalSha256: string;
}>;

declare const equivalenceOwnerBrand: unique symbol;
export type DxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_ZERO_ALLOWANCE_CUT_SURFACE_EQUIVALENCE_V1;
  readonly [equivalenceOwnerBrand]: never;
}>;

export type DxfProductZeroAllowanceCutSurfaceEquivalenceResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1;
      evidence: DxfProductZeroAllowanceCutSurfaceEquivalenceV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      owner: null;
      evidence: null;
      blockers: readonly [
        Readonly<{ code: 'invalid-input' | 'sha256-unavailable'; detail: string }>,
      ];
    }>;

export type DxfProductZeroAllowanceCutSurfaceEquivalenceConsumeResultV1 =
  | Readonly<{
      ok: true;
      evidence: DxfProductZeroAllowanceCutSurfaceEquivalenceV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      evidence: null;
      blockers: readonly [
        Readonly<{ code: 'forged-owner' | 'stale-owner' | 'binding-mismatch'; detail: string }>,
      ];
    }>;

type OwnerState = {
  consumed: boolean;
  evidence: DxfProductZeroAllowanceCutSurfaceEquivalenceV1;
};

const owners = new WeakMap<object, OwnerState>();

type SnapshotState = {
  nodes: number;
  properties: number;
  active: Set<object>;
};

function snapshotData(value: unknown, path: string, depth: number, state: SnapshotState): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw new TypeError(`${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${path} is not plain serializable data.`);
  if (depth > MAX_DEPTH) throw new TypeError(`${path} exceeds the depth bound.`);
  if (state.active.has(value)) throw new TypeError(`${path} contains a cycle.`);

  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError(`${path} could not be inspected safely.`);
  }
  const isArray = Array.isArray(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype))
    throw new TypeError(`${path} must use a supported plain prototype.`);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string'))
    throw new TypeError(`${path} contains symbol properties.`);
  const dataKeys = (keys as string[]).filter((key) => !(isArray && key === 'length'));
  state.nodes += 1;
  state.properties += dataKeys.length;
  if (state.nodes > MAX_NODES || state.properties > MAX_PROPERTIES)
    throw new TypeError(`${path} exceeds the snapshot bound.`);
  state.active.add(value);
  try {
    if (isArray) {
      const length = descriptors.length;
      if (!length || !('value' in length) || !Number.isSafeInteger(length.value))
        throw new TypeError(`${path} has no plain length.`);
      if (length.value > MAX_ARRAY_LENGTH) throw new TypeError(`${path} exceeds the array bound.`);
      if (dataKeys.length !== length.value || dataKeys.some((key, index) => key !== String(index)))
        throw new TypeError(`${path} must be a dense array without extras.`);
      return dataKeys.map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          throw new TypeError(`${path}[${key}] must be enumerable own data.`);
        return snapshotData(descriptor.value, `${path}[${key}]`, depth + 1, state);
      });
    }
    const output: Record<string, unknown> = {};
    for (const key of dataKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new TypeError(`${path}.${key} must be enumerable own data.`);
      output[key] = snapshotData(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function snapshotInput(value: unknown): Readonly<{
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  handoff: DxfAssemblyHandoffV1;
}> {
  const snapshot = snapshotData(value, 'input', 0, {
    nodes: 0,
    properties: 0,
    active: new Set<object>(),
  });
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError();
  const record = snapshot as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'compositionRequest' || keys[1] !== 'handoff')
    throw new TypeError();
  return record as {
    compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
    handoff: DxfAssemblyHandoffV1;
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function digest(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
    const result = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (result.byteLength !== 32) return null;
    return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function blocked(
  code: 'invalid-input' | 'sha256-unavailable',
  detail: string,
): DxfProductZeroAllowanceCutSurfaceEquivalenceResultV1 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    evidence: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
  });
}

function consumeBlocked(
  code: 'forged-owner' | 'stale-owner' | 'binding-mismatch',
  detail: string,
): DxfProductZeroAllowanceCutSurfaceEquivalenceConsumeResultV1 {
  return Object.freeze({
    ok: false as const,
    evidence: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
  });
}

/**
 * Repeats the full zero-allowance proof before minting an opaque, one-shot compiler projection
 * capability. The original cut-surface handoff and all of its seals remain unchanged.
 */
export async function createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfProductZeroAllowanceCutSurfaceEquivalenceResultV1> {
  try {
    const { compositionRequest: request, handoff } = snapshotInput(input);
    if (
      handoff.physicalSurface.mode !== 'cut-surface' ||
      handoff.physicalSurface.seamAllowancePhysical !== true ||
      !SHA256.test(handoff.seal.canonicalSha256) ||
      request.catalog.sourceFileId.length === 0 ||
      request.catalog.sizeToken.length === 0
    )
      return blocked(
        'invalid-input',
        'A sealed cut-surface handoff and exact catalog are required.',
      );
    const compiledHandoff = await compileDxfAssemblyHandoffV1(handoff, { crypto });
    if (!compiledHandoff.ok || compiledHandoff.sourceHandoffSha256 !== handoff.seal.canonicalSha256)
      return blocked('invalid-input', 'The cut-surface handoff seal did not verify.');
    const pieceIds = handoff.pieces.map(({ id }) => id).sort();
    if (pieceIds.length !== 2 || pieceIds[0] === pieceIds[1])
      return blocked('invalid-input', 'Exactly two distinct handoff pieces are required.');
    const scopes = request.draft.scopes.filter(
      ({ target, writerReplay }) =>
        target.scopeKey === request.catalog.scopeKey && writerReplay !== undefined,
    );
    if (scopes.length !== 1)
      return blocked('invalid-input', 'One exact writer replay scope is required.');
    const writerPieces = scopes[0].writerReplay!.job.pieces;
    const pieceBindings: DxfProductZeroAllowanceCutSurfaceEquivalencePieceBindingV1[] = [];
    for (const pieceId of pieceIds) {
      const catalogPiece = request.catalog.pieces.find((piece) => piece.pieceId === pieceId);
      const handoffPiece = handoff.pieces.find((piece) => piece.id === pieceId);
      const matchingWriterPieces = writerPieces.filter((piece) => piece.identity === pieceId);
      if (!catalogPiece || !handoffPiece || matchingWriterPieces.length !== 1)
        return blocked(
          'invalid-input',
          `${pieceId} lacks one exact catalog/handoff/writer binding.`,
        );
      const catalogShells = catalogPiece.contours.filter(({ role }) => role === 'cut-boundary');
      const handoffShells = handoffPiece.contours.filter(({ role }) => role === 'cut-boundary');
      if (
        catalogShells.length !== 1 ||
        handoffShells.length !== 1 ||
        catalogPiece.contours.some(({ role }) => role === 'sewing-boundary') ||
        handoffPiece.contours.some(({ role }) => role === 'sewing-boundary') ||
        catalogShells[0].contourId !== handoffShells[0].id ||
        handoff.seams.some((seam) =>
          seam.sides.some(
            (side) => side.pieceId === pieceId && side.contourId !== handoffShells[0].id,
          ),
        )
      )
        return blocked('invalid-input', `${pieceId} is not bound to one selected cut shell.`);
      const writerPiece = matchingWriterPieces[0];
      if (
        writerPiece.allowance.allowanceMm !== 0 ||
        Object.is(writerPiece.allowance.allowanceMm, -0)
      )
        return blocked('invalid-input', `${pieceId} has a physical or non-canonical allowance.`);
      const matchingSizes = writerPiece.sizes.filter(
        ({ sizeToken }) => sizeToken === request.catalog.sizeToken,
      );
      if (matchingSizes.length !== 1)
        return blocked('invalid-input', `${pieceId} lacks one exact selected writer size.`);
      const size = matchingSizes[0];
      if (
        !Array.isArray(size.seam) ||
        size.seam.length < 3 ||
        size.cut.length !== size.seam.length ||
        canonical(size.cut) !== canonical(size.seam)
      )
        return blocked('invalid-input', `${pieceId} cut and seam geometry are not exact-equal.`);
      const cutSeamCanonicalSha256 = await digest(
        'dxf-product-zero-allowance-cut-seam-equivalence-piece-v1',
        {
          pieceId,
          sizeToken: request.catalog.sizeToken,
          contourId: handoffShells[0].id,
          cut: size.cut,
          seam: size.seam,
        },
        crypto,
      );
      if (!cutSeamCanonicalSha256)
        return blocked('sha256-unavailable', `${pieceId} equivalence digest is unavailable.`);
      pieceBindings.push(
        Object.freeze({
          pieceId,
          sizeToken: request.catalog.sizeToken,
          contourId: handoffShells[0].id,
          cutSeamCanonicalSha256,
        }),
      );
    }
    pieceBindings.sort((left, right) =>
      left.pieceId < right.pieceId ? -1 : left.pieceId > right.pieceId ? 1 : 0,
    );
    const unsigned = Object.freeze({
      schemaVersion: DXF_PRODUCT_ZERO_ALLOWANCE_CUT_SURFACE_EQUIVALENCE_V1,
      validated: true as const,
      handoffCanonicalSha256: handoff.seal.canonicalSha256,
      sourceFileId: request.catalog.sourceFileId,
      sizeToken: request.catalog.sizeToken,
      pieceBindings: Object.freeze(pieceBindings) as readonly [
        DxfProductZeroAllowanceCutSurfaceEquivalencePieceBindingV1,
        DxfProductZeroAllowanceCutSurfaceEquivalencePieceBindingV1,
      ],
    });
    const canonicalSha256 = await digest(
      'dxf-product-zero-allowance-cut-surface-equivalence-v1',
      unsigned,
      crypto,
    );
    if (!canonicalSha256)
      return blocked('sha256-unavailable', 'The equivalence receipt digest is unavailable.');
    const evidence = Object.freeze({ ...unsigned, canonicalSha256 });
    const owner = Object.freeze({
      schemaVersion: DXF_PRODUCT_ZERO_ALLOWANCE_CUT_SURFACE_EQUIVALENCE_V1,
    }) as DxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1;
    owners.set(owner, { consumed: false, evidence });
    return Object.freeze({
      ok: true as const,
      owner,
      evidence,
      blockers: Object.freeze([]) as readonly [],
    });
  } catch {
    return blocked('invalid-input', 'Zero-allowance cut-surface evidence could not be validated.');
  }
}

export function consumeDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(
  owner: DxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1,
  expected: Readonly<{
    handoffCanonicalSha256: string;
    sourceFileId: string;
    sizeToken: string;
    pieceIds: readonly [string, string];
  }>,
): DxfProductZeroAllowanceCutSurfaceEquivalenceConsumeResultV1 {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null)
    return consumeBlocked('forged-owner', 'Equivalence owner is not an object capability.');
  const state = owners.get(owner);
  if (!state) return consumeBlocked('forged-owner', 'Equivalence owner is forged or cloned.');
  if (state.consumed)
    return consumeBlocked('stale-owner', 'Equivalence owner was already consumed.');
  state.consumed = true;
  const evidence = state.evidence;
  const expectedPieceIds = [...expected.pieceIds].sort();
  const evidencePieceIds = evidence.pieceBindings.map(({ pieceId }) => pieceId).sort();
  if (
    evidence.handoffCanonicalSha256 !== expected.handoffCanonicalSha256 ||
    evidence.sourceFileId !== expected.sourceFileId ||
    evidence.sizeToken !== expected.sizeToken ||
    expectedPieceIds.length !== 2 ||
    expectedPieceIds[0] !== evidencePieceIds[0] ||
    expectedPieceIds[1] !== evidencePieceIds[1]
  )
    return consumeBlocked('binding-mismatch', 'Equivalence evidence does not bind this build.');
  return Object.freeze({
    ok: true as const,
    evidence,
    blockers: Object.freeze([]) as readonly [],
  });
}
