import { writeDxfDetailed } from '../../pattern-import/write';
import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import { readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3 } from './pattern-import-dxf-product-saved-annular-frame-replay-carrier-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2,
  type PatternImportDxfProductSavedAnnularWriterFramePieceV2,
  type PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
} from './pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';

export type PatternImportDxfProductSavedWriterFrameReceiptBlockerCodeV1 =
  | 'invalid-input'
  | 'composer-v2-owner-unavailable'
  | 'composer-binding-mismatch'
  | 'composition-rebuild-blocked'
  | 'writer-replay-binding-mismatch'
  | 'writer-frame-carrier-blocked'
  | 'writer-frame-binding-mismatch'
  | 'aggregate-source-path-binding-mismatch'
  | 'sha256-unavailable';

export type PatternImportDxfProductSavedWriterFrameReceiptResultV1 =
  | Readonly<{ ok: true; receipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: Readonly<{
        code: PatternImportDxfProductSavedWriterFrameReceiptBlockerCodeV1;
        detail: string;
      }>;
    }>;

class ReceiptFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductSavedWriterFrameReceiptBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: ReceiptFailure['code'], detail: string): never {
  throw new ReceiptFailure(code, detail);
}

// Snapshot before the first await. Accessors, sparse arrays and mutable caller graphs must not
// change either the authenticated source or the carrier between composition and receipt issuance.
function snapshotData(
  value: unknown,
  depth = 0,
  state = { nodes: 0, properties: 0, active: new Set<object>() },
): unknown {
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > 16 * 1024 * 1024) fail('invalid-input', 'Input string exceeds bounds.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-input', 'Input numbers must be finite canonical data.');
    return value;
  }
  if (!value || typeof value !== 'object' || depth > 48 || state.active.has(value))
    fail('invalid-input', 'Input must be bounded acyclic plain data.');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null)
    fail('invalid-input', 'Input contains an unsupported prototype.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
  state.nodes += 1;
  state.properties += keys.length;
  if (state.nodes > 300_000 || state.properties > 1_200_000)
    fail('invalid-input', 'Input graph exceeds bounds.');
  if (
    array &&
    (!descriptors.length ||
      !('value' in descriptors.length) ||
      !Number.isSafeInteger(descriptors.length.value) ||
      descriptors.length.value !== keys.length ||
      keys.length > 300_000)
  )
    fail('invalid-input', 'Input arrays must be bounded and dense.');
  state.active.add(value);
  try {
    const output: Record<string, unknown> | unknown[] = array ? [] : {};
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      if (typeof key !== 'string' || (array && key !== String(index)))
        fail('invalid-input', 'Input fields must be own data with dense array indices.');
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', 'Input accessors and hidden fields are not accepted.');
      Object.defineProperty(output, key, {
        value: snapshotData(descriptor.value, depth + 1, state),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

const encoder = new TextEncoder();
const subtle = globalThis.crypto?.subtle;
const nativeDigest = subtle?.digest;

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!subtle || !nativeDigest) fail('sha256-unavailable', 'SHA-256 is unavailable.');
  const result = await Reflect.apply(nativeDigest, subtle, ['SHA-256', bytes]);
  if (!(result instanceof ArrayBuffer) || result.byteLength !== 32)
    fail('sha256-unavailable', 'SHA-256 did not return one digest.');
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads the existing durable replay carrier; it does not create source frames or a new sidecar.
 * A live saved Composer V2 owner authenticates the fresh composition. The writer must reproduce
 * the authenticated saved-row hash and byte length before any carrier value becomes a receipt.
 */
export async function buildPatternImportDxfProductSavedWriterFrameReceiptV1(
  input: Readonly<{
    composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
    compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
    savedRow: DxfProductSavedRowIdentityV1;
  }>,
): Promise<PatternImportDxfProductSavedWriterFrameReceiptResultV1> {
  try {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
      fail('invalid-input', 'Receipt request must be a plain record.');
    const fields = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(fields);
    if (
      keys.length !== 3 ||
      !keys.every(
        (key) => key === 'composerV2Owner' || key === 'compositionRequest' || key === 'savedRow',
      ) ||
      !fields.composerV2Owner?.enumerable ||
      !('value' in fields.composerV2Owner) ||
      !fields.compositionRequest?.enumerable ||
      !('value' in fields.compositionRequest) ||
      !fields.savedRow?.enumerable ||
      !('value' in fields.savedRow)
    )
      fail('invalid-input', 'Receipt request requires three own data fields.');
    const owner = fields.composerV2Owner.value as PatternImportDxfProductGarmentMeshComposerOwnerV2;
    const projection = projectPatternImportDxfProductGarmentMeshComposerV2(owner);
    if (!projection)
      fail('composer-v2-owner-unavailable', 'A live genuine Composer V2 is required.');
    const snapshot = owner.snapshot;
    const row = snapshotData(fields.savedRow.value) as DxfProductSavedRowIdentityV1;
    if (
      snapshot.origin !== 'verified-saved-row' ||
      projection.composerCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
      projection.phase2ArtifactSha256 !== snapshot.seals.phase2ArtifactSha256
    )
      fail('composer-binding-mismatch', 'Composer V2 is not an exact saved source.');
    if (
      !row ||
      Object.keys(row).length !== 8 ||
      row.techCardId !== snapshot.row.techCardId ||
      row.scopeKey !== snapshot.row.scopeKey ||
      row.patternLineKey !== snapshot.row.patternLineKey ||
      row.revision !== snapshot.row.patternVersion ||
      row.cardLockVersion !== snapshot.row.cardLockVersion ||
      row.sha256 !== snapshot.row.dxfSha256 ||
      typeof row.url !== 'string' ||
      row.url.length === 0 ||
      !Number.isSafeInteger(row.sizeBytes) ||
      row.sizeBytes <= 0
    )
      fail('composer-binding-mismatch', 'Authenticated saved row differs from Composer V2.');
    const request = snapshotData(
      fields.compositionRequest.value,
    ) as PatternImportDxfProductMultiseamMappingCompositionRequestV2;
    const scopes = request.draft.scopes.filter(
      ({ target }) => target.scopeKey === snapshot.row.scopeKey,
    );
    const scope = scopes.length === 1 ? scopes[0] : null;
    const replay = scope?.writerReplay;
    if (!scope || !replay)
      fail(
        'writer-replay-binding-mismatch',
        'One exact saved scope and writer replay are required.',
      );
    const carrier = readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3(replay.job.replay);
    if (!carrier.ok)
      fail('writer-frame-carrier-blocked', `${carrier.blocker.code}: ${carrier.blocker.detail}`);
    const composed = await buildPatternImportDxfProductMultiseamMappingCompositionV2(request);
    if (!composed.ok)
      fail(
        'composition-rebuild-blocked',
        `${composed.blockers[0].code}: ${composed.blockers[0].detail}`,
      );
    if (
      composed.aggregateSeal.canonicalSha256 !== snapshot.seals.aggregateCanonicalSha256 ||
      composed.compositionSeal.canonicalSha256 !== snapshot.seals.compositionCanonicalSha256 ||
      composed.evidence.productExportSha256 !== snapshot.row.dxfSha256 ||
      composed.evidence.sourceFileSha256 !== snapshot.seals.sourceFileSha256 ||
      composed.evidence.techCardId !== snapshot.row.techCardId ||
      composed.evidence.scopeKey !== snapshot.row.scopeKey ||
      composed.evidence.patternLineKey !== snapshot.row.patternLineKey ||
      composed.evidence.patternVersion !== snapshot.row.patternVersion ||
      composed.evidence.cardLockVersion !== snapshot.row.cardLockVersion ||
      composed.evidence.importGeneration !== snapshot.row.importGeneration
    )
      fail('composer-binding-mismatch', 'Fresh composition differs from the retained saved owner.');
    const written = writeDxfDetailed(replay.job, { now: () => new Date(replay.createdAt) });
    const bytes = encoder.encode(written.dxfText);
    const replaySha256 = await sha256(bytes);
    if (
      replaySha256 !== snapshot.row.dxfSha256 ||
      replaySha256 !== snapshot.seals.sourceFileSha256 ||
      bytes.byteLength !== row.sizeBytes
    )
      fail(
        'writer-replay-binding-mismatch',
        'Replay hash/size differ from the authenticated saved row.',
      );
    const pieces = carrier.carrier.pieces.map(
      (piece): PatternImportDxfProductSavedAnnularWriterFramePieceV2 => {
        const blocks = written.plan.blocks.filter(
          (block) => block.identity === piece.pieceId && block.name === piece.blockName,
        );
        if (blocks.length !== 1 || !snapshot.assembly.pieceIds.includes(piece.pieceId))
          fail(
            'writer-frame-binding-mismatch',
            'Carrier piece/block identity differs from saved composition.',
          );
        const block = blocks[0]!;
        if (
          !written.transforms[block.name] ||
          !block.seam ||
          block.cut.length !== block.seam.length ||
          block.cut.some(
            (point, index) =>
              point.x !== block.seam![index]!.x || point.y !== block.seam![index]!.y,
          )
        )
          fail(
            'writer-frame-binding-mismatch',
            'An exact zero-allowance writer block is required.',
          );
        const sourcePathIds = [
          ...new Set(
            composed.aggregate.seams.flatMap(({ sides }) =>
              sides
                .filter((side) => side.pieceId === piece.pieceId)
                .map((side) => side.sourcePathId),
            ),
          ),
        ];
        if (sourcePathIds.length === 0)
          fail(
            'aggregate-source-path-binding-mismatch',
            'Carrier piece has no exact aggregate source path.',
          );
        return Object.freeze({
          ...piece,
          sourcePathIds: Object.freeze(sourcePathIds) as readonly [number, ...number[]],
        });
      },
    );
    const post = projectPatternImportDxfProductGarmentMeshComposerV2(owner);
    if (
      !post ||
      post.composerCanonicalSha256 !== projection.composerCanonicalSha256 ||
      post.phase2ArtifactSha256 !== projection.phase2ArtifactSha256
    )
      fail(
        'composer-v2-owner-unavailable',
        'Saved Composer V2 became stale during receipt derivation.',
      );
    return Object.freeze({
      ok: true as const,
      receipt: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2,
        sourceFileSha256: replaySha256,
        writerExportSha256: snapshot.row.dxfSha256,
        aggregateCanonicalSha256: composed.aggregateSeal.canonicalSha256,
        sourcePathCoordinateSha256: composed.aggregate.sourceBinding.sourcePathCoordinateSha256,
        provenance: 'saved-replay-answer-byte-bound' as const,
        pieces: Object.freeze(pieces) as readonly [
          PatternImportDxfProductSavedAnnularWriterFramePieceV2,
          PatternImportDxfProductSavedAnnularWriterFramePieceV2,
        ],
      }),
    });
  } catch (error) {
    const failure =
      error instanceof ReceiptFailure
        ? error
        : new ReceiptFailure(
            'invalid-input',
            'Saved writer-frame receipt derivation failed closed.',
          );
    return Object.freeze({
      ok: false as const,
      receipt: null,
      blocker: Object.freeze({ code: failure.code, detail: failure.message }),
    });
  }
}
