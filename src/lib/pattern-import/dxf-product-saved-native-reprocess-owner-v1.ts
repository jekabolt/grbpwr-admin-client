import {
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
  type DxfSourceNativeStraightEdgeBlockerCodeV1,
  type DxfSourceNativeStraightEdgeReadV1,
} from './dxf-source-native-straight-edge-authority-v1';
import {
  computeDxfProductSavedSourceFileIdV1,
  createDxfProductSavedReprocessOwnerV1,
  type DxfProductSavedReprocessBlockerV1,
  type DxfProductSavedReprocessHostV1,
  type DxfProductSavedReprocessProgressV1,
  type DxfProductSavedReprocessRequestV1,
  type DxfProductSavedRowIdentityV1,
} from './dxf-product-saved-reprocess-owner-v1';
import { PATIMPORT, type CardDraft } from './types';

export const DXF_PRODUCT_SAVED_NATIVE_REPROCESS_OWNER_V1 =
  'dxf-product-saved-native-reprocess-owner/1' as const;
export const DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1 =
  'dxf-product-saved-native-compiler-source-owner/1' as const;
export const DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 =
  'dxf-product-saved-native-compiler-source-request/1' as const;

export const DXF_PRODUCT_SAVED_NATIVE_REPROCESS_CLAIMS_V1 = Object.freeze({
  authoritativeRowDownloadedOnce: true,
  savedRowSha256VerifiedBeforeNativeDecode: true,
  nativeDecodeUsesDisposableVerifiedCopy: true,
  nativeStraightEdgeOwnerDecoderMinted: true,
  nativeStraightEdgeOwnerPublishedOnlyAfterSavedRowRevalidation: true,
  nativeReadReturnedDirectly: false,
  opaqueCompilerSourceOwnerReturned: true,
  savedReprocessOwnerReused: true,
  assemblyIrCreated: false,
  rawDxfReturned: false,
  rawDxfRetained: false,
  /**
   * The current worker importer cannot transfer its module-private one-shot capability. Until that
   * boundary is replaced, one bounded main-thread authority decode precedes the existing worker
   * reconstruction decode. Keeping this explicit prevents a false single-parse production claim.
   */
  sourceDecodePasses: 2,
  workerCapabilityTransferIntegrated: false,
  productionReady: false,
} as const);

export type DxfProductSavedNativeReprocessBlockerV1 = Readonly<{
  code:
    | DxfProductSavedReprocessBlockerV1['code']
    | 'source-native-read-blocked'
    | 'source-native-binding-mismatch';
  detail: string;
  nativeCode?: DxfSourceNativeStraightEdgeBlockerCodeV1;
}>;

/** Opaque one-shot compiler capability. Its native owner remains in this module's WeakMap. */
export type DxfProductSavedNativeCompilerSourceOwnerV1 = Readonly<{
  version: typeof DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1;
  opaque: 'module-private-weak-owner';
}>;

export type DxfProductSavedNativeCompilerSourceRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1;
  sourceFileId: string;
  sourceSha256: string;
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  cardLockVersion: number;
  draft: CardDraft;
}>;

export type DxfProductSavedNativeCompilerSourceProjectionV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  sourceFileId: string;
  draft: CardDraft;
  nativeRead: DxfSourceNativeStraightEdgeReadV1;
}>;

export type DxfProductSavedNativeCompilerSourceResultV1 =
  | Readonly<{
      ok: true;
      value: DxfProductSavedNativeCompilerSourceProjectionV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      value: null;
      blockers: readonly [
        Readonly<{
          code: 'forged-owner' | 'stale-owner' | 'invalid-request' | 'binding-mismatch';
          detail: string;
        }>,
      ];
    }>;

export type DxfProductSavedNativeReprocessResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof DXF_PRODUCT_SAVED_NATIVE_REPROCESS_OWNER_V1;
      row: DxfProductSavedRowIdentityV1;
      sourceFileId: string;
      draft: CardDraft;
      sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
      blockers: readonly [];
      claims: typeof DXF_PRODUCT_SAVED_NATIVE_REPROCESS_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof DXF_PRODUCT_SAVED_NATIVE_REPROCESS_OWNER_V1;
      row: DxfProductSavedRowIdentityV1 | null;
      sourceFileId: string | null;
      draft: null;
      sourceOwner: null;
      blockers: readonly [DxfProductSavedNativeReprocessBlockerV1];
      claims: typeof DXF_PRODUCT_SAVED_NATIVE_REPROCESS_CLAIMS_V1;
    }>;

type NativeFailure = Readonly<{
  code: 'source-native-read-blocked' | 'source-native-binding-mismatch';
  detail: string;
  nativeCode?: DxfSourceNativeStraightEdgeBlockerCodeV1;
}>;

type CompilerSourceState = {
  consumed: boolean;
  row: DxfProductSavedRowIdentityV1;
  sourceFileId: string;
  draft: CardDraft;
  nativeRead: DxfSourceNativeStraightEdgeReadV1;
};

const compilerSourceState = new WeakMap<object, CompilerSourceState>();

function blocked(
  blocker: DxfProductSavedNativeReprocessBlockerV1,
  row: DxfProductSavedRowIdentityV1 | null = null,
  sourceFileId: string | null = null,
): DxfProductSavedNativeReprocessResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: DXF_PRODUCT_SAVED_NATIVE_REPROCESS_OWNER_V1,
    row,
    sourceFileId,
    draft: null,
    sourceOwner: null,
    blockers: Object.freeze([Object.freeze({ ...blocker })]) as readonly [
      DxfProductSavedNativeReprocessBlockerV1,
    ],
    claims: DXF_PRODUCT_SAVED_NATIVE_REPROCESS_CLAIMS_V1,
  });
}

function compilerSourceBlocked(
  code: 'forged-owner' | 'stale-owner' | 'invalid-request' | 'binding-mismatch',
  detail: string,
): DxfProductSavedNativeCompilerSourceResultV1 {
  return Object.freeze({
    ok: false as const,
    value: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
  });
}

/** Consumes the opaque saved-source capability only after every caller binding exact-matches. */
export function consumeDxfProductSavedNativeCompilerSourceV1(
  owner: unknown,
  request: DxfProductSavedNativeCompilerSourceRequestV1,
): DxfProductSavedNativeCompilerSourceResultV1 {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null)
    return compilerSourceBlocked('forged-owner', 'Saved compiler source owner is not genuine.');
  const state = compilerSourceState.get(owner);
  if (!state)
    return compilerSourceBlocked('forged-owner', 'Saved compiler source owner is not genuine.');
  if (state.consumed)
    return compilerSourceBlocked(
      'stale-owner',
      'Saved compiler source owner was already consumed.',
    );
  if (
    !request ||
    request.schemaVersion !== DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 ||
    typeof request.sourceFileId !== 'string' ||
    typeof request.sourceSha256 !== 'string' ||
    !Number.isSafeInteger(request.techCardId) ||
    typeof request.scopeKey !== 'string' ||
    typeof request.patternLineKey !== 'string' ||
    !Number.isSafeInteger(request.cardLockVersion) ||
    !request.draft
  )
    return compilerSourceBlocked('invalid-request', 'Exact saved compiler bindings are required.');
  if (
    request.sourceFileId !== state.sourceFileId ||
    request.sourceSha256 !== state.row.sha256 ||
    request.techCardId !== state.row.techCardId ||
    request.scopeKey !== state.row.scopeKey ||
    request.patternLineKey !== state.row.patternLineKey ||
    request.cardLockVersion !== state.row.cardLockVersion ||
    request.draft !== state.draft
  )
    return compilerSourceBlocked(
      'binding-mismatch',
      'Saved compiler source does not exact-match the requested row, source and draft owner.',
    );

  state.consumed = true;
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      row: state.row,
      sourceFileId: state.sourceFileId,
      draft: state.draft,
      nativeRead: state.nativeRead,
    }),
    blockers: Object.freeze([]) as readonly [],
  });
}

function nativeBindingFailure(detail: string): NativeFailure {
  return Object.freeze({
    code: 'source-native-binding-mismatch' as const,
    detail,
  });
}

/**
 * Extends the saved-row replay owner with the one-shot source-native straight-edge capability that
 * cloth Phase D requires. The authoritative bytes are fetched once. The base owner verifies their
 * SHA-256 before invoking the wrapped reprocess seam; only then is a disposable copy decoded.
 *
 * This owner deliberately does not claim one total parse: the existing worker reconstruction still
 * decodes the same verified source independently because a module-private WeakMap capability cannot
 * cross the worker boundary. That remaining optimization is isolated by this contract.
 */
export function createDxfProductSavedNativeReprocessOwnerV1(host: DxfProductSavedReprocessHostV1) {
  let disposed = false;
  let running = false;
  let activeNativeRead: DxfSourceNativeStraightEdgeReadV1 | null = null;
  let activeNativeFailure: NativeFailure | null = null;
  // Keep the callback-owned assignment opaque to TypeScript's local control-flow narrowing. The
  // wrapped async reprocess callback publishes this value before baseOwner.run() resolves, but a
  // direct read after assigning null above is otherwise incorrectly narrowed to null/never.
  const readActiveNative = (): DxfSourceNativeStraightEdgeReadV1 | null => activeNativeRead;

  const wrappedHost: DxfProductSavedReprocessHostV1 = Object.freeze({
    readAuthoritativeRow: (expected, signal, onProgress) =>
      host.readAuthoritativeRow(expected, signal, onProgress),
    async reprocess(input, signal, onProgress) {
      let decodeBytes: Uint8Array | null = input.bytes.slice();
      try {
        if (!(decodeBytes.buffer instanceof ArrayBuffer)) {
          activeNativeFailure = nativeBindingFailure(
            'Verified saved-DXF bytes do not own a transferable ArrayBuffer.',
          );
          throw new Error(activeNativeFailure.detail);
        }
        const native = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
          {
            id: input.sourceFileId,
            name: input.syntheticFilename,
            bytes: decodeBytes.buffer,
          },
          { sagittaMm: PATIMPORT.sagittaMm, keepFills: true },
          { sourceFileId: input.sourceFileId },
        );
        if (!native.ok) {
          const first = native.blockers[0];
          activeNativeFailure = Object.freeze({
            code: 'source-native-read-blocked' as const,
            detail: first?.detail ?? 'Verified saved DXF could not mint native line authority.',
            ...(first ? { nativeCode: first.code } : {}),
          });
          throw new Error(activeNativeFailure.detail);
        }
        if (
          native.value.provenance.sourceFileId !== input.sourceFileId ||
          native.value.read.doc.file.sha256 !== input.row.sha256
        ) {
          activeNativeFailure = nativeBindingFailure(
            'Native read identity does not exact-match the verified saved row.',
          );
          throw new Error(activeNativeFailure.detail);
        }
        activeNativeRead = native.value;
      } finally {
        try {
          decodeBytes?.fill(0);
        } finally {
          decodeBytes = null;
        }
      }

      try {
        return await host.reprocess(input, signal, onProgress);
      } catch (error) {
        activeNativeRead = null;
        throw error;
      }
    },
    readCurrentRowIdentity: (expected, signal) => host.readCurrentRowIdentity(expected, signal),
    ...(host.crypto ? { crypto: host.crypto } : {}),
    dispose: () => host.dispose?.(),
  });
  const baseOwner = createDxfProductSavedReprocessOwnerV1(wrappedHost);

  const run = async (
    request: DxfProductSavedReprocessRequestV1,
    onProgress?: (progress: DxfProductSavedReprocessProgressV1) => void,
  ): Promise<DxfProductSavedNativeReprocessResultV1> => {
    if (disposed)
      return blocked({
        code: 'owner-disposed',
        detail: 'The saved native-DXF reprocess owner is disposed.',
      });
    if (running)
      return blocked({
        code: 'owner-busy',
        detail: 'A saved native-DXF reprocess is already running.',
      });

    running = true;
    activeNativeRead = null;
    activeNativeFailure = null;
    try {
      const base = await baseOwner.run(request, onProgress);
      if (!base.ok) {
        const nativeFailure = activeNativeFailure;
        return blocked(nativeFailure ?? base.blockers[0], base.row, base.sourceFileId);
      }
      const nativeRead = readActiveNative();
      if (!nativeRead)
        return blocked(
          nativeBindingFailure('Saved-row replay completed without native line authority.'),
          base.row,
          base.sourceFileId,
        );
      if (
        base.sourceFileId !== computeDxfProductSavedSourceFileIdV1(base.row) ||
        nativeRead.provenance.sourceFileId !== base.sourceFileId ||
        nativeRead.read.doc.file.sha256 !== base.row.sha256
      )
        return blocked(
          nativeBindingFailure(
            'Published saved-row and native-read identities do not exact-match after revalidation.',
          ),
          base.row,
          base.sourceFileId,
        );

      const sourceOwner = Object.freeze({
        version: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1,
        opaque: 'module-private-weak-owner' as const,
      });
      compilerSourceState.set(sourceOwner, {
        consumed: false,
        row: base.row,
        sourceFileId: base.sourceFileId,
        draft: base.draft,
        nativeRead,
      });

      return Object.freeze({
        ok: true as const,
        schemaVersion: DXF_PRODUCT_SAVED_NATIVE_REPROCESS_OWNER_V1,
        row: base.row,
        sourceFileId: base.sourceFileId,
        draft: base.draft,
        sourceOwner,
        blockers: Object.freeze([]) as readonly [],
        claims: DXF_PRODUCT_SAVED_NATIVE_REPROCESS_CLAIMS_V1,
      });
    } finally {
      activeNativeRead = null;
      activeNativeFailure = null;
      running = false;
    }
  };

  return Object.freeze({
    schemaVersion: DXF_PRODUCT_SAVED_NATIVE_REPROCESS_OWNER_V1,
    claims: DXF_PRODUCT_SAVED_NATIVE_REPROCESS_CLAIMS_V1,
    run,
    cancel() {
      baseOwner.cancel();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      baseOwner.dispose();
      activeNativeRead = null;
      activeNativeFailure = null;
    },
    snapshot() {
      return Object.freeze({ disposed, running });
    },
  });
}
