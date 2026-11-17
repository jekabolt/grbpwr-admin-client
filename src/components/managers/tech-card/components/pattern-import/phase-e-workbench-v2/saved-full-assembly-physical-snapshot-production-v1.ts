import {
  decodeDxfGarmentPhysicalInitializationV1,
  type DxfGarmentPhysicalInitializationV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import type { DxfExactAssemblyGraphV1 } from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  decodePatternImportDxfProductCompositeSidecarV7,
  disposeSavedFullAssemblyPhysicalAuthorityReceiptV1,
  isSavedFullAssemblyPhysicalAuthorityReceiptV1,
  verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority,
  type SavedFullAssemblyPhysicalAuthorityReceiptV1,
} from './composite-sidecar-v7';
import {
  readSavedFullAssemblyPhysicalInitializationBytesV1,
  type SavedFullAssemblyPhysicalComponentDocumentV1,
} from './saved-full-assembly-physical-component-v1';
import {
  disposeSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  readSavedFullAssemblySnapshotV1,
  type SavedFullAssemblySnapshotRequestV1,
  type SavedFullAssemblySnapshotReceiptV1,
} from './saved-full-assembly-snapshot-production-v1';

export const SAVED_FULL_ASSEMBLY_PHYSICAL_SNAPSHOT_V1 =
  'saved-full-assembly-physical-snapshot/1' as const;

export type SavedFullAssemblyPhysicalSnapshotRequestV1 = SavedFullAssemblySnapshotRequestV1;

export type SavedFullAssemblyPhysicalSnapshotProjectionV1 = Readonly<{
  version: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_SNAPSHOT_V1;
  row: DxfProductSavedRowIdentityV1;
  seedOperationNumber: number;
  serverAssemblyRevision: string;
  freshSnapshotSha256: string;
  outer: Readonly<{
    mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7;
    sha256: string;
    byteLength: number;
    persistedCardLockVersion: number;
    persistedSavedRowRevision: number;
    currentRowBound: true;
  }>;
  graph: DxfExactAssemblyGraphV1;
  graphCanonicalSha256: string;
  compileInputSha256: string;
  physicalInitialization: DxfGarmentPhysicalInitializationV1;
  physicalInitializationCanonicalSha256: string;
  physicalComponentDocument: SavedFullAssemblyPhysicalComponentDocumentV1;
  authorityReceipt: SavedFullAssemblyPhysicalAuthorityReceiptV1;
}>;

declare const receiptBrand: unique symbol;
export type SavedFullAssemblyPhysicalSnapshotReceiptV1 = Readonly<{
  version: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_SNAPSHOT_V1;
  opaque: 'module-private-full-assembly-physical-read-receipt';
  readonly [receiptBrand]: never;
}>;

export class SavedFullAssemblyPhysicalSnapshotErrorV1 extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'SavedFullAssemblyPhysicalSnapshotErrorV1';
  }
}

type State = Readonly<{
  projection: SavedFullAssemblyPhysicalSnapshotProjectionV1;
  controller: AbortController;
  snapshotReceipt: SavedFullAssemblySnapshotReceiptV1;
  authorityReceipt: SavedFullAssemblyPhysicalAuthorityReceiptV1;
  unlink: () => void;
}>;

const states = new WeakMap<object, State>();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code: string, detail: string): never {
  throw new SavedFullAssemblyPhysicalSnapshotErrorV1(code, detail);
}

function check(signal: AbortSignal): void {
  if (aborted.call(signal)) fail('cancelled', 'Full Assembly physical read was cancelled.');
}

function exactDataRecord(value: unknown, keys: readonly string[], field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-request', `${field} must be an exact plain record.`);
  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    prototype = Object.getPrototypeOf(value);
  } catch {
    fail('invalid-request', `${field} could not be inspected.`);
  }
  const actual = Reflect.ownKeys(descriptors);
  if (
    prototype !== Object.prototype ||
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key)) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value');
    })
  )
    fail('invalid-request', `${field} has missing, hidden, active, symbol, or unexpected fields.`);
  return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])) as Record<
    string,
    unknown
  >;
}

function captureRequest(value: unknown): SavedFullAssemblyPhysicalSnapshotRequestV1 {
  const request = exactDataRecord(value, ['row', 'seedOperationNumber'], 'request');
  const row = exactDataRecord(
    request.row,
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
    'request.row',
  );
  return Object.freeze({
    row: Object.freeze({
      techCardId: row.techCardId as number,
      scopeKey: row.scopeKey as string,
      patternLineKey: row.patternLineKey as string,
      revision: row.revision as number,
      cardLockVersion: row.cardLockVersion as number,
      url: row.url as string,
      sizeBytes: row.sizeBytes as number,
      sha256: row.sha256 as string,
    }),
    seedOperationNumber: request.seedOperationNumber as number,
  });
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1) {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function freezeDetached<T>(value: T): T {
  const detached = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return;
    if (ArrayBuffer.isView(candidate) || candidate instanceof ArrayBuffer) return;
    for (const child of Object.values(candidate as Record<string, unknown>)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(detached);
  return detached;
}

function sameFreshIdentity(
  left: ReturnType<typeof projectSavedFullAssemblySnapshotV1>,
  right: ReturnType<typeof projectSavedFullAssemblySnapshotV1>,
): boolean {
  if (
    left.snapshotSha256 !== right.snapshotSha256 ||
    left.serverAssemblyRevision !== right.serverAssemblyRevision ||
    !sameRow(left.row, right.row) ||
    left.outer.status !== 'present' ||
    right.outer.status !== 'present'
  )
    return false;
  return (
    left.outer.mediaType === right.outer.mediaType &&
    left.outer.sha256 === right.outer.sha256 &&
    left.outer.byteLength === right.outer.byteLength &&
    left.outer.persistedCardLockVersion === right.outer.persistedCardLockVersion &&
    left.outer.persistedSavedRowRevision === right.outer.persistedSavedRowRevision &&
    left.outer.currentRowBound === right.outer.currentRowBound
  );
}

/**
 * Fixed production join: fresh full AO + exact V7 outer + registered physical component.
 * The caller supplies only row/seed intent; no callback, writer, decoded DTO, or authority boolean
 * can enter this boundary.
 */
export async function readSavedFullAssemblyPhysicalSnapshotV1(
  input: SavedFullAssemblyPhysicalSnapshotRequestV1,
  signal?: AbortSignal,
): Promise<SavedFullAssemblyPhysicalSnapshotReceiptV1> {
  if (signal !== undefined) aborted.call(signal);
  const request = captureRequest(input);
  const controller = new AbortController();
  let receipt: SavedFullAssemblyPhysicalSnapshotReceiptV1 | null = null;
  let baseReceipt: SavedFullAssemblySnapshotReceiptV1 | null = null;
  let confirmationReceipt: SavedFullAssemblySnapshotReceiptV1 | null = null;
  let authorityReceipt: SavedFullAssemblyPhysicalAuthorityReceiptV1 | null = null;
  const unlink = () => {
    if (signal) remove.call(signal, 'abort', cancel);
  };
  const cancel = () => {
    controller.abort();
    if (receipt) disposeSavedFullAssemblyPhysicalSnapshotV1(receipt);
    if (baseReceipt) disposeSavedFullAssemblySnapshotV1(baseReceipt);
    if (confirmationReceipt) disposeSavedFullAssemblySnapshotV1(confirmationReceipt);
    if (authorityReceipt) disposeSavedFullAssemblyPhysicalAuthorityReceiptV1(authorityReceipt);
  };
  try {
    if (signal) {
      add.call(signal, 'abort', cancel, { once: true });
      if (aborted.call(signal)) cancel();
    }
    check(controller.signal);
    baseReceipt = await readSavedFullAssemblySnapshotV1(request, controller.signal);
    check(controller.signal);
    const fresh = projectSavedFullAssemblySnapshotV1(baseReceipt);
    const outer = fresh.outer;
    if (
      outer.status !== 'present' ||
      outer.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 ||
      outer.currentRowBound !== true ||
      outer.persistedCardLockVersion !== fresh.row.cardLockVersion ||
      outer.persistedSavedRowRevision !== fresh.row.revision
    )
      fail(
        'current-v7-required',
        'A current Composite V7 bound to the exact saved DXF row is required.',
      );
    const decoded = await decodePatternImportDxfProductCompositeSidecarV7(outer.bytes);
    check(controller.signal);
    if (
      !decoded.ok ||
      decoded.seal.canonicalSha256 !== outer.sha256 ||
      decoded.seal.canonicalByteLength !== outer.byteLength
    )
      fail(
        'v7-codec-failed',
        decoded.ok ? 'Composite V7 digest or length differs.' : decoded.blockers[0].detail,
      );
    if (
      !sameRow(decoded.document.bindings.row, fresh.row) ||
      decoded.document.bindings.serverAssemblyRevision !== fresh.serverAssemblyRevision
    )
      fail(
        'v7-binding-drift',
        'Composite V7 row or Assembly revision differs from the fresh join.',
      );
    const authority = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      decoded.owner,
      baseReceipt,
    );
    check(controller.signal);
    if (!authority.ok || !isSavedFullAssemblyPhysicalAuthorityReceiptV1(authority.receipt))
      fail(
        'physical-authority-failed',
        authority.ok
          ? 'Composite V7 physical authority receipt is unavailable.'
          : authority.blocker.detail,
      );
    authorityReceipt = authority.receipt;
    confirmationReceipt = await readSavedFullAssemblySnapshotV1(request, controller.signal);
    check(controller.signal);
    const confirmedFresh = projectSavedFullAssemblySnapshotV1(confirmationReceipt);
    if (!sameFreshIdentity(fresh, confirmedFresh))
      fail(
        'post-verification-drift',
        'Full Assembly snapshot or exact V7 outer moved after physical verification.',
      );
    disposeSavedFullAssemblySnapshotV1(confirmationReceipt);
    confirmationReceipt = null;
    const component = authority.physicalDocument;
    const initializationBytes = readSavedFullAssemblyPhysicalInitializationBytesV1(
      authority.physicalOwner,
    );
    if (!initializationBytes)
      fail(
        'physical-initialization-missing',
        'Verified physical initialization bytes are missing.',
      );
    const initialization = await decodeDxfGarmentPhysicalInitializationV1(
      {
        bytes: initializationBytes,
        graph: component.graph,
        assemblySnapshot: fresh,
      },
      controller.signal,
    );
    check(controller.signal);
    if (
      !SHA256.test(component.graphCanonicalSha256) ||
      !SHA256.test(component.compileInputSha256) ||
      initialization.canonicalSha256 !== component.physicalInitialization.canonicalSha256 ||
      initialization.document.graphCanonicalSha256 !== component.graphCanonicalSha256 ||
      initialization.document.compileInputSha256 !== component.compileInputSha256
    )
      fail(
        'physical-binding-drift',
        'Verified graph, compile, or physical initialization differs.',
      );
    const projection = Object.freeze({
      version: SAVED_FULL_ASSEMBLY_PHYSICAL_SNAPSHOT_V1,
      row: freezeDetached(fresh.row),
      seedOperationNumber: request.seedOperationNumber,
      serverAssemblyRevision: fresh.serverAssemblyRevision,
      freshSnapshotSha256: fresh.snapshotSha256,
      outer: Object.freeze({
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
        sha256: outer.sha256,
        byteLength: outer.byteLength,
        persistedCardLockVersion: outer.persistedCardLockVersion,
        persistedSavedRowRevision: outer.persistedSavedRowRevision,
        currentRowBound: true as const,
      }),
      graph: freezeDetached(component.graph),
      graphCanonicalSha256: component.graphCanonicalSha256,
      compileInputSha256: component.compileInputSha256,
      physicalInitialization: freezeDetached(initialization.document),
      physicalInitializationCanonicalSha256: initialization.canonicalSha256,
      physicalComponentDocument: freezeDetached(component),
      authorityReceipt,
    }) satisfies SavedFullAssemblyPhysicalSnapshotProjectionV1;
    receipt = Object.freeze({
      version: SAVED_FULL_ASSEMBLY_PHYSICAL_SNAPSHOT_V1,
      opaque: 'module-private-full-assembly-physical-read-receipt',
    }) as SavedFullAssemblyPhysicalSnapshotReceiptV1;
    states.set(
      receipt,
      Object.freeze({
        projection,
        controller,
        snapshotReceipt: baseReceipt,
        authorityReceipt,
        unlink,
      }),
    );
    check(controller.signal);
    return receipt;
  } catch (error) {
    if (authorityReceipt) disposeSavedFullAssemblyPhysicalAuthorityReceiptV1(authorityReceipt);
    if (confirmationReceipt) disposeSavedFullAssemblySnapshotV1(confirmationReceipt);
    if (baseReceipt) disposeSavedFullAssemblySnapshotV1(baseReceipt);
    unlink();
    controller.abort();
    if (receipt) states.delete(receipt);
    throw error;
  }
}

export function projectSavedFullAssemblyPhysicalSnapshotV1(
  receipt: unknown,
): SavedFullAssemblyPhysicalSnapshotProjectionV1 {
  if (!receipt || typeof receipt !== 'object')
    fail('forged-receipt', 'The Full Assembly physical receipt is not genuine.');
  const state = states.get(receipt);
  if (!state) fail('forged-receipt', 'The Full Assembly physical receipt is unavailable.');
  check(state.controller.signal);
  if (!isSavedFullAssemblyPhysicalAuthorityReceiptV1(state.authorityReceipt))
    fail('revoked-authority', 'The Full Assembly physical authority is no longer current.');
  return state.projection;
}

export function disposeSavedFullAssemblyPhysicalSnapshotV1(receipt: unknown): void {
  if (!receipt || typeof receipt !== 'object') return;
  const state = states.get(receipt);
  if (!state) return;
  states.delete(receipt);
  state.unlink();
  disposeSavedFullAssemblyPhysicalAuthorityReceiptV1(state.authorityReceipt);
  disposeSavedFullAssemblySnapshotV1(state.snapshotReceipt);
  state.controller.abort();
}
