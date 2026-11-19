import { draftOutlineMoveHistoryV1 } from './draft-cad-outline-move-history-v1';
import type { SavedGeometryCurrentV1 } from './draft-cad-saved-dart-tip-review-v1';
import { activeDraftCadTransactionsV1 } from './draft-cad-session-v1';
import type { NativePieceCopyMode } from 'lib/pattern-import/fabrics/native-piece-copy-review';
import type { CopyReview, SavedCopyCurrentV1 } from './draft-cad-unlinked-piece-copy-review-v1';
import { DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1';
import {
  createDxfProductSavedForeignNativeReprocessOwnerV1,
  createDxfProductSavedNativeReprocessOwnerV1,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type {
  SavedAddPointCurrentV1,
  SavedAddPointReviewOwner,
} from './draft-cad-saved-add-point-review-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { CardContext } from '../client';
import {
  createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1,
  type PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1,
} from './saved-assembly-snapshot-production-rpc-v1';
import {
  createPatternImportDxfPhaseESavedDxfReprocessHostV1,
  type PatternImportDxfPhaseESavedDxfReprocessHostDepsV1,
} from './saved-dxf-reprocess-host-v1';
import { createPatternImportDxfPhaseESavedRowPreparationOwnerV1 } from './saved-row-preparation-owner-v1';
import type { SavedDraftPairedAllowanceAuthorityV1 } from './draft-cad-paired-allowance-authority-v1';
import type { SavedRankedPointReviewV1 } from './draft-cad-saved-ranked-point-review-v1';
import { sameSavedDraftRowV1 } from './draft-cad-saved-source-selection-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1 =
  'pattern-import-dxf-phase-e-saved-row-production-runtime/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_CLAIMS_V1 = Object.freeze({
  callerProvidedCurrentCardProjectionRequired: true,
  getTechCardFallbackUsed: false,
  localFormAssemblyAuthorityUsed: false,
  exactCardIdAndLockRevalidatedBeforeReprocess: true,
  transactionalSnapshotRowReadUsed: true,
  transactionalSnapshotAssemblyReadUsed: true,
  freshDisposableReprocessHostPerPreparation: true,
  privateSavedNativeSourceCapabilityOwnedByPreparation: true,
  confirmedCompilerSourceOneShotExposedByRuntime: true,
  previewCompilerSourceExposed: false,
  generatedSnapshotRpcIntegratedByProductionFactory: true,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseESavedRowCardProjectionV1 = Readonly<{
  card: CardContext;
  cardLockVersion: number;
}>;

type SnapshotAuthority = Readonly<{
  bridge: Pick<
    PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1['bridge'],
    'readAuthoritativeRow'
  >;
  authorityAdapter: Pick<
    PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1['authorityAdapter'],
    'readAuthoritativeAssembly'
  >;
  readInitialAssembly?: PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1['readInitialAssembly'];
}>;

export type PatternImportDxfPhaseESavedRowRuntimeDepsV1 = Readonly<{
  selectedOperationNumber: number;
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1;
  snapshot: SnapshotAuthority;
  fetch?: typeof globalThis.fetch;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfPhaseESavedRowProductionRuntimeDepsV1 = Omit<
  PatternImportDxfPhaseESavedRowRuntimeDepsV1,
  'snapshot'
>;

type PreparationOwner = ReturnType<typeof createPatternImportDxfPhaseESavedRowPreparationOwnerV1>;

export type PatternImportDxfPhaseESavedRowProductionRuntimeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1;
  preparationOwner: PreparationOwner;
  consumeConfirmedCompilerSource: PreparationOwner['consumeConfirmedCompilerSource'];
  prepareSavedAddPointReview?: (
    row: DxfProductSavedRowIdentityV1,
    readCurrent: () => Omit<SavedAddPointCurrentV1, 'card'> | null,
  ) => Promise<SavedAddPointReviewOwner>;
  prepareSavedRankedPointReview?: SavedRankedPointReviewRuntimeV1['prepareSavedRankedPointReview'];
  prepareSavedDartTip?: (
    row: DxfProductSavedRowIdentityV1,
    readCurrent: () => Omit<SavedAddPointCurrentV1, 'card'> | null,
  ) => ReturnType<
    typeof import('./draft-cad-saved-dart-tip-review-v1').compileSavedDraftGeometryReviewV1
  >;
  prepareSavedGeometryReview?: (
    row: DxfProductSavedRowIdentityV1,
    readCurrent: () => Omit<SavedGeometryCurrentV1, 'card'> | null,
  ) => ReturnType<
    typeof import('./draft-cad-saved-dart-tip-review-v1').compileSavedDraftGeometryReviewV1
  >;
  prepareSavedPairedAllowance?: (
    row: DxfProductSavedRowIdentityV1,
    readCurrent: () => Omit<SavedAddPointCurrentV1, 'card'> | null,
    turnAuthority?: import('./saved-fixed-end-outline-authority-v1').SavedFixedEndAuthorityV1,
  ) => Promise<SavedDraftPairedAllowanceAuthorityV1>;
  prepareSavedJoin?: (
    row: DxfProductSavedRowIdentityV1,
    picks: import('./draft-cad-saved-join-review').JoinPicks,
    readCurrent: () => Omit<SavedAddPointCurrentV1, 'card'> | null,
  ) => Promise<import('./draft-cad-saved-join-review').JoinReview>;
  prepareSavedPieceCopyReview?: (
    row: DxfProductSavedRowIdentityV1,
    readCurrent: () => Omit<SavedCopyCurrentV1, 'card'> | null,
    mode?: NativePieceCopyMode,
  ) => Promise<CopyReview>;
  dispose: () => void;
  snapshot: () => Readonly<{
    disposed: boolean;
    preparation: ReturnType<PreparationOwner['snapshot']>;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_CLAIMS_V1;
}>;

function abortError(): DOMException {
  return new DOMException('Saved-row card projection resolution was cancelled.', 'AbortError');
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

function captureProjection(
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1,
): PatternImportDxfPhaseESavedRowCardProjectionV1 {
  if (
    !projection ||
    !projection.card ||
    !Number.isSafeInteger(projection.card.techCardId) ||
    projection.card.techCardId <= 0 ||
    !Number.isSafeInteger(projection.cardLockVersion) ||
    projection.cardLockVersion < 0
  )
    throw new TypeError('A positive card id and non-negative current card lock are required.');
  let card: CardContext;
  try {
    card = structuredClone(projection.card);
  } catch {
    throw new TypeError('The current card projection must be detachable plain data.');
  }
  return Object.freeze({
    card: deepFreeze(card),
    cardLockVersion: projection.cardLockVersion,
  });
}

/**
 * Captures one current GetTechCard projection and resolves it only for the exact saved-row card and
 * optimistic lock. Assembly topology is deliberately absent from this seam: it always comes from
 * the transactional snapshot adapter.
 */
export function createPatternImportDxfPhaseESavedRowCardProjectionResolverV1(
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1,
) {
  const captured = captureProjection(projection);
  return async (expected: DxfProductSavedRowIdentityV1, signal: AbortSignal) => {
    if (signal.aborted) throw abortError();
    if (
      expected.techCardId !== captured.card.techCardId ||
      expected.cardLockVersion !== captured.cardLockVersion
    )
      throw new Error('The current card projection moved from the saved-row card or lock.');
    return Object.freeze({
      card: captured.card,
      cardLockVersion: captured.cardLockVersion,
    });
  };
}

type SavedDraftSourceReaderDepsV1 = Pick<
  PatternImportDxfPhaseESavedDxfReprocessHostDepsV1,
  'resolveCard' | 'readAuthoritativeRow' | 'fetch' | 'crypto'
>;

type SavedRankedPointReviewRuntimeV1 = Readonly<{
  prepareSavedRankedPointReview: (
    row: DxfProductSavedRowIdentityV1,
    readCurrent: () => Omit<SavedAddPointCurrentV1, 'card'> | null,
  ) => Promise<SavedRankedPointReviewV1 | null>;
  dispose: () => void;
}>;

function createSavedDraftSourceReaderV1(deps: SavedDraftSourceReaderDepsV1) {
  const crypto = deps.crypto ?? globalThis.crypto;
  let disposed = false;
  const liveHosts = new Set<{ dispose: () => void }>();

  const createSavedReprocessHost = (requiredStablePiece?: string) => {
    if (disposed) throw new Error('Saved-row production runtime is disposed.');
    const concrete = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      resolveCard: deps.resolveCard,
      ...(requiredStablePiece ? { nativeSewingReplay: true, requiredStablePiece } : {}),
      readAuthoritativeRow: deps.readAuthoritativeRow,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      ...(crypto ? { crypto } : {}),
    });
    liveHosts.add(concrete);
    // The preparation owner accepts only the narrow DxfProductSavedReprocessHostV1 capability.
    // Strip the concrete host's audit metadata instead of weakening that boundary.
    return Object.freeze({
      readAuthoritativeRow: concrete.readAuthoritativeRow,
      reprocess: concrete.reprocess,
      readCurrentRowIdentity: concrete.readCurrentRowIdentity,
      ...(crypto ? { crypto } : {}),
      dispose() {
        try {
          concrete.dispose();
        } finally {
          liveHosts.delete(concrete);
        }
      },
    });
  };

  async function withSavedDraftSource<T>(
    row: DxfProductSavedRowIdentityV1,
    stablePiece: string,
    prepare: (
      proof: Pick<
        Parameters<
          typeof import('./draft-cad-saved-add-point-review-v1').prepareSavedAddPointReviewV1
        >[0],
        'sourceOwner' | 'sourceRequest' | 'savedBytes'
      >,
      card: CardContext,
      readCurrentRow: () => Promise<DxfProductSavedRowIdentityV1>,
    ) => Promise<T>,
    allowForeign = false,
  ): Promise<T> {
    const host = createSavedReprocessHost(stablePiece);
    const signal = new AbortController().signal;
    const sourceBytes: { current: Uint8Array | null } = { current: null };
    const captureBytes =
      (read: typeof host.readAuthoritativeRow): typeof host.readAuthoritativeRow =>
      async (expected, signal, progress) => {
        const loaded = await read(expected, signal, progress);
        sourceBytes.current?.fill(0);
        sourceBytes.current = loaded.bytes.slice();
        return loaded;
      };
    const owner = createDxfProductSavedNativeReprocessOwnerV1({
      ...host,
      readAuthoritativeRow: captureBytes(host.readAuthoritativeRow),
    });
    let disposeForeign: (() => void) | undefined;
    try {
      const card = (await deps.resolveCard(row, signal)).card;
      let read = await owner.run({
        schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
        row,
      });
      if (allowForeign && !read.ok && read.blockers[0].code === 'foreign-saved-dxf-detected') {
        owner.dispose();
        host.dispose();
        if (disposed) throw new Error('The saved Draft runtime has closed.');
        const { createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1 } = await import(
          './foreign-saved-dxf-reprocess-host-v1'
        );
        if (disposed) throw new Error('The saved Draft runtime has closed.');
        const foreignHost = createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1({
          resolveCard: deps.resolveCard,
          nativeSewingReplay: true,
          requiredStablePiece: stablePiece,
          readAuthoritativeRow: deps.readAuthoritativeRow,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
          ...(crypto ? { crypto } : {}),
        });
        liveHosts.add(foreignHost);
        const foreignOwner = createDxfProductSavedForeignNativeReprocessOwnerV1({
          ...foreignHost,
          readAuthoritativeRow: captureBytes(foreignHost.readAuthoritativeRow),
        });
        disposeForeign = () => {
          foreignOwner.dispose();
          foreignHost.dispose();
          liveHosts.delete(foreignHost);
        };
        read = await foreignOwner.run({
          schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
          row,
        });
      }
      if (!read.ok) throw new Error(read.blockers[0].detail);
      if (!sourceBytes.current) throw new Error('The verified saved DXF bytes are unavailable.');
      return await prepare(
        {
          sourceOwner: read.sourceOwner,
          sourceRequest: {
            schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
            sourceFileId: read.sourceFileId,
            sourceSha256: row.sha256,
            techCardId: row.techCardId,
            patternLineKey: row.patternLineKey,
            cardLockVersion: row.cardLockVersion,
            scopeKey: row.scopeKey,
            draft: read.draft,
          },
          savedBytes: sourceBytes.current.buffer as ArrayBuffer,
        },
        card,
        async () => {
          if (disposed) throw new Error('The saved Draft runtime has closed.');
          const currentHost = createSavedReprocessHost();
          try {
            return await currentHost.readCurrentRowIdentity(row, signal);
          } finally {
            currentHost.dispose();
          }
        },
      );
    } finally {
      sourceBytes.current?.fill(0);
      disposeForeign?.();
      owner.dispose();
      host.dispose();
    }
  }

  const prepareSavedRankedPointReview: SavedRankedPointReviewRuntimeV1['prepareSavedRankedPointReview'] =
    async (row, readCurrent) => {
      const opening = readCurrent();
      const point = opening?.session.history
        .slice(0, opening.session.cursor)
        .flatMap(({ commands }) => commands)
        .find((command) => command.tool === 'draft-point');
      if (!opening || !point) return null;
      if (!sameSavedDraftRowV1(row, opening.row)) throw new Error('The saved Draft row changed.');
      return withSavedDraftSource(
        row,
        point.target.pieceId,
        async (proof, card, readCurrentRow) => {
          const { prepareSavedRankedPointReviewV1 } = await import(
            './draft-cad-saved-ranked-point-review-v1'
          );
          return prepareSavedRankedPointReviewV1({
            ...proof,
            readCurrent: () => {
              const current = readCurrent();
              return !disposed &&
                current?.session === opening.session &&
                current.generation === opening.generation &&
                current.sizeToken === opening.sizeToken &&
                sameSavedDraftRowV1(row, current.row)
                ? { ...current, card }
                : null;
            },
            readCurrentRow,
          });
        },
        true,
      );
    };

  const prepareSavedGeometryReview: NonNullable<
    PatternImportDxfPhaseESavedRowProductionRuntimeV1['prepareSavedGeometryReview']
  > = async (row, readCurrent) => {
    const opening = readCurrent();
    const commands = opening
      ? activeDraftCadTransactionsV1(opening.session).flatMap((tx) => tx.commands)
      : [];
    const command = commands[0];
    if (
      !opening ||
      !sameSavedDraftRowV1(row, opening.row) ||
      !(
        (command?.tool === 'dart' && command.payload.savedTip) ||
        (command?.tool === 'fish-eye' && command.payload.savedMove) ||
        (command?.tool === 'french-curve' && command.payload.savedCurve) ||
        command?.tool === 'cut' ||
        command?.tool === 'sharpen-corner' ||
        (command?.tool === 'round-corner' && commands.length === 1 && opening.sharedOutlineBlock) ||
        ((commands.length > 1 || opening.sharedOutlineBlock) && draftOutlineMoveHistoryV1(commands))
      )
    )
      throw new Error('Select the original saved geometry.');
    return withSavedDraftSource(
      row,
      command.target.pieceId,
      async (proof, card, readCurrentRow) => {
        const { compileSavedDraftGeometryReviewV1 } = await import(
          './draft-cad-saved-dart-tip-review-v1'
        );
        return compileSavedDraftGeometryReviewV1(
          {
            ...proof,
            readCurrent: () => {
              const current = readCurrent();
              return !disposed &&
                current?.session === opening.session &&
                current.generation === opening.generation &&
                current.sizeToken === opening.sizeToken &&
                current.sharedOutlineBlock === opening.sharedOutlineBlock &&
                sameSavedDraftRowV1(row, current.row)
                ? { ...current, card }
                : null;
            },
          },
          async () => {
            await readCurrentRow();
          },
        );
      },
    );
  };
  const prepareSavedPairedAllowance: NonNullable<
    PatternImportDxfPhaseESavedRowProductionRuntimeV1['prepareSavedPairedAllowance']
  > = async (row, readCurrent, turnAuthority) => {
    const opening = readCurrent();
    const command = opening?.session.history[0]?.commands[0];
    if (
      !opening ||
      !sameSavedDraftRowV1(row, opening.row) ||
      opening.session.cursor !== 1 ||
      opening.session.history[0]?.commands.length !== 1 ||
      (command?.tool !== 'edge-length' && command?.tool !== 'allowance-offset')
    )
      throw new Error('The current saved Draft must contain one edge length or allowance offset.');
    return withSavedDraftSource(
      row,
      command.target.pieceId,
      async (proof, card, readCurrentRow) => {
        const { prepareSavedDraftPairedAllowanceAuthorityV1 } = await import(
          './draft-cad-paired-allowance-authority-v1'
        );
        return prepareSavedDraftPairedAllowanceAuthorityV1({
          ...proof,
          turnAuthority,
          readCurrent: () => {
            const current = readCurrent();
            return !disposed &&
              current?.session === opening.session &&
              current.generation === opening.generation &&
              current.sizeToken === opening.sizeToken &&
              sameSavedDraftRowV1(row, current.row)
              ? { ...current, card }
              : null;
          },
          verifyCurrentRow: async () => {
            await readCurrentRow();
          },
        });
      },
    );
  };
  return {
    createSavedReprocessHost,
    withSavedDraftSource,
    prepareSavedRankedPointReview,
    prepareSavedGeometryReview,
    prepareSavedPairedAllowance,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const host of liveHosts) host.dispose();
      liveHosts.clear();
    },
  };
}

/** Opens a retained Draft Point review using only the authority for the selected saved DXF row. */
export function createSavedRankedPointReviewRuntimeV1(
  deps: SavedDraftSourceReaderDepsV1,
): SavedRankedPointReviewRuntimeV1 {
  const { prepareSavedRankedPointReview, dispose } = createSavedDraftSourceReaderV1(deps);
  return Object.freeze({ prepareSavedRankedPointReview, dispose });
}

/** Runs the same signed-row geometry Review without a selected Assembly operation. */
export function createSavedGeometryReviewRuntimeV1(deps: SavedDraftSourceReaderDepsV1) {
  const { prepareSavedGeometryReview, dispose } = createSavedDraftSourceReaderV1(deps);
  return Object.freeze({ prepareSavedGeometryReview, dispose });
}

/** Verifies the same native allowance pair for a signed row opened from the saved table. */
export function createSavedPairedAllowanceReviewRuntimeV1(deps: SavedDraftSourceReaderDepsV1) {
  const { prepareSavedPairedAllowance, dispose } = createSavedDraftSourceReaderV1(deps);
  return Object.freeze({ prepareSavedPairedAllowance, dispose });
}

/** Injectable composition used by the production factory and focused tests. */
export function createPatternImportDxfPhaseESavedRowRuntimeV1(
  deps: PatternImportDxfPhaseESavedRowRuntimeDepsV1,
): PatternImportDxfPhaseESavedRowProductionRuntimeV1 {
  if (!Number.isSafeInteger(deps.selectedOperationNumber) || deps.selectedOperationNumber < 1)
    throw new TypeError('A positive selected Assembly operation number is required.');
  if (
    !deps.snapshot ||
    typeof deps.snapshot.bridge?.readAuthoritativeRow !== 'function' ||
    typeof deps.snapshot.authorityAdapter?.readAuthoritativeAssembly !== 'function'
  )
    throw new TypeError('Transactional saved-row and Assembly snapshot capabilities are required.');
  const resolveCard = createPatternImportDxfPhaseESavedRowCardProjectionResolverV1(deps.projection);

  const crypto = deps.crypto ?? globalThis.crypto;
  const {
    createSavedReprocessHost,
    withSavedDraftSource,
    prepareSavedRankedPointReview,
    prepareSavedGeometryReview,
    prepareSavedPairedAllowance,
    dispose: disposeDraftSource,
  } = createSavedDraftSourceReaderV1({
    resolveCard,
    readAuthoritativeRow: deps.snapshot.bridge.readAuthoritativeRow,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(crypto ? { crypto } : {}),
  });
  let disposed = false;

  const preparationOwner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1({
    createSavedReprocessHost,
    readAuthoritativeAssembly: deps.snapshot.authorityAdapter.readAuthoritativeAssembly,
    ...(deps.snapshot.readInitialAssembly && {
      readInitialAssembly: deps.snapshot.readInitialAssembly,
    }),
    ...(crypto ? { crypto } : {}),
  });

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1,
    preparationOwner,
    consumeConfirmedCompilerSource: preparationOwner.consumeConfirmedCompilerSource,
    prepareSavedRankedPointReview,
    async prepareSavedAddPointReview(row, readCurrent) {
      const opening = readCurrent(),
        command = opening?.session.history[0]?.commands[0];
      if (
        !opening ||
        opening.session.cursor !== 1 ||
        opening.session.history[0]?.commands.length !== 1 ||
        command?.tool !== 'add-point'
      )
        throw new Error('The current saved Draft must contain one confirmed Add point.');
      return withSavedDraftSource(
        row,
        command.target.pieceId,
        async (proof, card, readCurrentRow) => {
          const { prepareSavedAddPointReviewV1 } = await import(
            './draft-cad-saved-add-point-review-v1'
          );
          return prepareSavedAddPointReviewV1({
            ...proof,
            readCurrent: () => {
              const current = readCurrent();
              return !disposed && current ? { ...current, card } : null;
            },
            verifyCurrentRow: async () => {
              await readCurrentRow();
            },
          });
        },
      );
    },
    prepareSavedGeometryReview,
    prepareSavedDartTip: prepareSavedGeometryReview,
    prepareSavedPairedAllowance,
    async prepareSavedJoin(row, picks, readCurrent) {
      const opening = readCurrent();
      if (!opening || opening.session.cursor !== 0)
        throw new Error('Select two pieces in the unmodified saved Draft.');
      const check = () => {
        const now = readCurrent();
        if (
          !now ||
          now.session !== opening.session ||
          now.generation !== opening.generation ||
          now.sizeToken !== opening.sizeToken
        )
          throw new Error('The selected Draft or rank changed.');
      };
      return withSavedDraftSource(row, picks.fixed.pieceId, async (proof, card, readRow) => {
        const { prepareSavedJoinReview } = await import('./draft-cad-saved-join-review');
        const result = await prepareSavedJoinReview(
          {
            ...proof,
            session: opening.session,
            selection: { ...picks, row, sizeToken: opening.sizeToken },
            readCurrent: () => {
              check();
              return { card, row };
            },
          },
          opening.generation,
          check,
        );
        await readRow();
        check();
        return result;
      });
    },
    async prepareSavedPieceCopyReview(row, readCurrent, mode) {
      const opening = readCurrent();
      if (
        !opening ||
        opening.session.cursor !== 0 ||
        !opening.selectedPieceId ||
        !opening.selectedPieceLineKey
      )
        throw new Error('Select one piece in an unmodified saved Draft.');
      return withSavedDraftSource(
        row,
        opening.selectedPieceId,
        async (proof, card, readCurrentRow) => {
          const { prepareUnlinkedDraftPieceCopyV1 } = await import(
            './draft-cad-unlinked-piece-copy-review-v1'
          );
          return prepareUnlinkedDraftPieceCopyV1({
            ...proof,
            mode,
            readCurrentRow,
            readCurrent: () => {
              const current = readCurrent();
              return !disposed && current ? { ...current, card } : null;
            },
          });
        },
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      preparationOwner.dispose();
      disposeDraftSource();
    },
    snapshot: () =>
      Object.freeze({
        disposed,
        preparation: preparationOwner.snapshot(),
      }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_CLAIMS_V1,
  });
}

/** Production binding: generated abortable RPC + client Composite V3 codec + saved-DXF replay. */
export function createPatternImportDxfPhaseESavedRowProductionRuntimeV1(
  deps: PatternImportDxfPhaseESavedRowProductionRuntimeDepsV1,
): PatternImportDxfPhaseESavedRowProductionRuntimeV1 {
  const snapshot = createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
    deps.selectedOperationNumber,
    deps.crypto,
  );
  return createPatternImportDxfPhaseESavedRowRuntimeV1({
    ...deps,
    snapshot,
  });
}
