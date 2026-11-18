import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createSavedGenericDurablePhysicalHostV1,
  type SavedGenericDurablePhysicalBindingV1,
  type SavedGenericDurablePhysicalHostSnapshotV1,
  type SavedV7PieceTranslationV1,
  type SavedV7PlacementEditV1,
} from 'components/cloth-simulation-spike/saved-generic-durable-physical-host-v1';
import {
  createSavedGenericObservedPhysicalHostV1,
  projectSavedGenericObservedPhysicalHostAuthoringContextV1,
} from 'components/cloth-simulation-spike/saved-generic-observed-physical-host-v1';
import type { SavedGenericObservedSourceGeometryV1 } from 'components/cloth-simulation-spike/saved-generic-observed-source-geometry-v1';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import { createSavedModelDisplayedTriangleBodyQuerySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-query-session-v2';
import type { SavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import {
  disposeSavedFullAssemblyPhysicalSnapshotV1,
  readSavedFullAssemblyPhysicalSnapshotV1,
  SavedFullAssemblyPhysicalSnapshotErrorV1,
} from './saved-full-assembly-physical-snapshot-production-v1';
import { prepareSavedFullAssemblyGenericNativeHandoffV1 } from './saved-full-assembly-generic-native-handoff-v1';
import {
  buildSavedFullAssemblyGenericFirstCompileRequestV1,
  prepareSavedFullAssemblyGenericFirstBootstrapV1,
  type SavedFullAssemblyGenericFirstBootstrapV1,
  type SavedFullAssemblyGenericFirstCompileChoicesV1,
} from './saved-full-assembly-generic-first-bootstrap-v1';
import {
  bindSavedFullAssemblyGenericFirstAuthoringV1,
  type SavedFullAssemblyTablePiecePlacementV1,
} from './saved-full-assembly-generic-first-authoring-v1';
import { persistCurrentSavedGenericObservedPhysicalHostV1 } from './saved-full-assembly-physical-document-production-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

type BodySession = SavedModelDisplayedTriangleBodySessionV2;
export type SavedClothDurableHostV1 = ReturnType<typeof createSavedGenericDurablePhysicalHostV1>;
export type SavedClothPhysicalSourceStatusV1 =
  | 'idle'
  | 'awaiting-mannequin'
  | 'loading'
  | 'ready'
  | 'placement-required'
  | 'blocked';

export interface UseSavedClothPhysicalHostInputV1 {
  readonly row: DxfProductSavedRowIdentityV1 | null;
  readonly selectedOperationNumber: number;
  readonly cardProjection?: PatternImportDxfPhaseESavedRowCardProjectionV1 | null;
  /** Compatibility-only for the rowless zero-operation picker; no owner is constructed. */
  readonly createCanonicalOwner?: () => unknown;
}

type Mounted = Readonly<{
  key: string;
  bodySession: BodySession;
  cardProjection: PatternImportDxfPhaseESavedRowCardProjectionV1;
  host: SavedClothDurableHostV1 | null;
  initialBinding?: SavedGenericDurablePhysicalBindingV1;
  status: Exclude<SavedClothPhysicalSourceStatusV1, 'idle' | 'awaiting-mannequin'>;
  error: string | null;
}>;
export type SavedV7PlacementEditorStateV1 =
  | Readonly<{ status: 'idle' | 'preparing'; draft: null; error: null }>
  | Readonly<{ status: 'editing' | 'saving'; draft: SavedV7PlacementEditV1; error: null }>
  | Readonly<{ status: 'blocked'; draft: null; error: string }>;
type PlacementEditTurn = {
  controller: AbortController;
  actor: SavedClothDurableHostV1 | null;
  draft: SavedV7PlacementEditV1 | null;
  current: () => boolean;
  saving: boolean;
};

export type SavedClothFirstAuthoringStateV1 =
  | Readonly<{ status: 'idle'; bootstrap: null; sourceGeometry: null; error: null }>
  | Readonly<{ status: 'preparing'; bootstrap: null; sourceGeometry: null; error: null }>
  | Readonly<{
      status: 'compile-required';
      bootstrap: SavedFullAssemblyGenericFirstBootstrapV1;
      sourceGeometry: null;
      error: null;
    }>
  | Readonly<{
      status: 'compiling';
      bootstrap: SavedFullAssemblyGenericFirstBootstrapV1;
      sourceGeometry: null;
      error: null;
    }>
  | Readonly<{
      status: 'placement-required';
      bootstrap: SavedFullAssemblyGenericFirstBootstrapV1;
      sourceGeometry: SavedGenericObservedSourceGeometryV1;
      error: string | null;
    }>
  | Readonly<{
      status: 'save-retry';
      bootstrap: SavedFullAssemblyGenericFirstBootstrapV1;
      sourceGeometry: SavedGenericObservedSourceGeometryV1;
      initializationSha256: string;
      error: string;
    }>
  | Readonly<{
      status: 'saving';
      bootstrap: SavedFullAssemblyGenericFirstBootstrapV1;
      sourceGeometry: SavedGenericObservedSourceGeometryV1;
      error: null;
    }>
  | Readonly<{
      status: 'blocked';
      bootstrap: SavedFullAssemblyGenericFirstBootstrapV1 | null;
      sourceGeometry: SavedGenericObservedSourceGeometryV1 | null;
      error: string;
    }>;

const EMPTY_BODY_SNAPSHOT = Object.freeze({ status: 'idle', generation: 0, blocker: null });
const EMPTY_DURABLE_SNAPSHOT: SavedGenericDurablePhysicalHostSnapshotV1 | null = null;
const noopSubscribe = () => () => undefined;

function detail(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 600)
    : 'The saved cloth preview could not be restored.';
}

export function classifySavedClothPhysicalRestoreErrorV1(
  error: unknown,
): Extract<SavedClothPhysicalSourceStatusV1, 'placement-required' | 'blocked'> {
  return error instanceof SavedFullAssemblyPhysicalSnapshotErrorV1 &&
    (error.code === 'current-v7-required' || error.code === 'physical-initialization-missing')
    ? 'placement-required'
    : 'blocked';
}

/** Fixed production restore chain; tests may replace its imported transports, never inject them. */
export async function restoreSavedClothPhysicalHostV1(
  input: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    selectedOperationNumber: number;
    cardProjection: PatternImportDxfPhaseESavedRowCardProjectionV1;
    bodySession: BodySession;
  }>,
  signal: AbortSignal,
): Promise<SavedClothDurableHostV1> {
  let receipt: Awaited<ReturnType<typeof readSavedFullAssemblyPhysicalSnapshotV1>> | null = null;
  let durable: SavedClothDurableHostV1 | null = null;
  try {
    receipt = await readSavedFullAssemblyPhysicalSnapshotV1(
      { row: input.row, seedOperationNumber: input.selectedOperationNumber },
      signal,
    );
    const handoff = await prepareSavedFullAssemblyGenericNativeHandoffV1(
      receipt,
      input.cardProjection,
      signal,
    );
    durable = createSavedGenericDurablePhysicalHostV1({
      row: input.row,
      bodySession: input.bodySession,
    });
    const restored = await durable.restore({ verifiedReceipt: receipt, ...handoff }, signal);
    if (!restored.ok) throw new Error(restored.detail);
    return durable;
  } catch (error) {
    if (durable) await durable.dispose();
    throw error;
  } finally {
    if (receipt) disposeSavedFullAssemblyPhysicalSnapshotV1(receipt);
  }
}

/**
 * One production owner joins the current saved V7, its genuine native replay and the displayed
 * mannequin body. There is no profile selector, parallel canonical owner, or savedSession
 * downstream. A V6 visual arrangement is reported as authoring-required and is never promoted.
 */
export function useSavedClothPhysicalHostV1({
  row,
  selectedOperationNumber,
  cardProjection = null,
}: UseSavedClothPhysicalHostInputV1) {
  const queryClient = useQueryClient();
  const observation = useRef<{
    accepting: boolean;
    latest: ModelDisplayedTriangleBodyOwnedInputV1 | null;
    session: BodySession | null;
  }>({ accepting: true, latest: null, session: null });
  const [mountedBody, setMountedBody] = useState<{
    queryClient: typeof queryClient;
    session: BodySession;
  } | null>(null);
  const onDisplayedBodyInputV1 = useCallback(
    (input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => {
      const current = observation.current;
      if (!current.accepting) return;
      current.latest = input;
      current.session?.onDisplayedBodyInputV1(input);
    },
    [],
  );

  useEffect(() => {
    const session = createSavedModelDisplayedTriangleBodyQuerySessionV2(queryClient);
    observation.current.accepting = true;
    observation.current.session = session;
    setMountedBody({ queryClient, session });
    session.onDisplayedBodyInputV1(observation.current.latest);
    return () => {
      if (observation.current.session === session) {
        observation.current.session = null;
        observation.current.accepting = false;
      }
      session.dispose();
    };
  }, [queryClient]);
  const bodySession = mountedBody?.queryClient === queryClient ? mountedBody.session : null;
  const subscribeBody = useCallback(
    (listener: () => void) => bodySession?.subscribe(listener) ?? noopSubscribe(),
    [bodySession],
  );
  const readBody = useCallback(
    () => bodySession?.getSnapshot() ?? EMPTY_BODY_SNAPSHOT,
    [bodySession],
  );
  const bodySnapshot = useSyncExternalStore(subscribeBody, readBody, readBody);

  const techCardId = row?.techCardId ?? null;
  const scopeKey = row?.scopeKey ?? null;
  const patternLineKey = row?.patternLineKey ?? null;
  const revision = row?.revision ?? null;
  const cardLockVersion = row?.cardLockVersion ?? null;
  const url = row?.url ?? null;
  const sizeBytes = row?.sizeBytes ?? null;
  const sha256 = row?.sha256 ?? null;
  const savedRow = useMemo<DxfProductSavedRowIdentityV1 | null>(() => {
    if (
      techCardId === null ||
      scopeKey === null ||
      patternLineKey === null ||
      revision === null ||
      cardLockVersion === null ||
      url === null ||
      sizeBytes === null ||
      sha256 === null
    )
      return null;
    return Object.freeze({
      techCardId,
      scopeKey,
      patternLineKey,
      revision,
      cardLockVersion,
      url,
      sizeBytes,
      sha256,
    });
  }, [techCardId, scopeKey, patternLineKey, revision, cardLockVersion, url, sizeBytes, sha256]);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const sourceKey =
    savedRow && cardProjection && selectedOperationNumber > 0
      ? JSON.stringify([
          savedRow,
          selectedOperationNumber,
          cardProjection.cardLockVersion,
          bodySnapshot.generation,
          retryGeneration,
        ])
      : null;
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const firstHostRef = useRef<ReturnType<typeof createSavedGenericObservedPhysicalHostV1> | null>(
    null,
  );
  const firstControllerRef = useRef<AbortController | null>(null);
  const firstSaveControllerRef = useRef<AbortController | null>(null);
  const firstGenerationRef = useRef(0);
  const [firstAuthoring, setFirstAuthoring] = useState<SavedClothFirstAuthoringStateV1>({
    status: 'idle',
    bootstrap: null,
    sourceGeometry: null,
    error: null,
  });

  const releaseFirstAuthoring = useCallback(async () => {
    firstControllerRef.current?.abort();
    firstControllerRef.current = null;
    firstSaveControllerRef.current?.abort();
    firstSaveControllerRef.current = null;
    const host = firstHostRef.current;
    firstHostRef.current = null;
    firstGenerationRef.current = 0;
    if (host) await host.dispose();
  }, []);

  const retry = useCallback(() => {
    void releaseFirstAuthoring();
    setRetryGeneration((value) => value + 1);
  }, [releaseFirstAuthoring]);

  useLayoutEffect(() => {
    setFirstAuthoring({ status: 'idle', bootstrap: null, sourceGeometry: null, error: null });
    void releaseFirstAuthoring();
    return () => {
      void releaseFirstAuthoring();
    };
  }, [releaseFirstAuthoring, sourceKey, cardProjection, bodySession]);

  useEffect(() => {
    if (
      !savedRow ||
      !cardProjection ||
      !bodySession ||
      !sourceKey ||
      bodySnapshot.status !== 'observed-body-bound'
    ) {
      setMounted(null);
      return;
    }
    const controller = new AbortController();
    let durable: SavedClothDurableHostV1 | null = null;
    const base = { key: sourceKey, bodySession, cardProjection };
    setMounted({ ...base, host: null, status: 'loading', error: null });
    void (async () => {
      try {
        durable = await restoreSavedClothPhysicalHostV1(
          {
            row: savedRow,
            selectedOperationNumber,
            cardProjection,
            bodySession,
          },
          controller.signal,
        );
        if (controller.signal.aborted) void durable.dispose();
        else {
          const initialBinding = durable.getSnapshot().binding;
          if (!initialBinding) throw new Error('The restored V7 is no longer current.');
          setMounted({ ...base, host: durable, initialBinding, status: 'ready', error: null });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const status = classifySavedClothPhysicalRestoreErrorV1(error);
          setMounted({ ...base, host: null, status, error: detail(error) });
        }
      }
    })();
    return () => {
      controller.abort();
      if (durable) void durable.dispose();
    };
  }, [
    bodySession,
    bodySnapshot.generation,
    bodySnapshot.status,
    cardProjection,
    savedRow,
    selectedOperationNumber,
    sourceKey,
  ]);

  const current =
    mounted?.key === sourceKey &&
    mounted.bodySession === bodySession &&
    mounted.cardProjection === cardProjection
      ? mounted
      : null;
  const host = current?.status === 'ready' ? current.host : null;
  const subscribeHost = useCallback(
    (listener: () => void) => host?.subscribe(listener) ?? noopSubscribe(),
    [host],
  );
  const readHost = useCallback(() => host?.getSnapshot() ?? EMPTY_DURABLE_SNAPSHOT, [host]);
  const durableSnapshot = useSyncExternalStore(subscribeHost, readHost, readHost);
  const sourceStatus: SavedClothPhysicalSourceStatusV1 =
    !savedRow || !cardProjection || selectedOperationNumber <= 0
      ? 'idle'
      : !bodySession || bodySnapshot.status !== 'observed-body-bound'
        ? 'awaiting-mannequin'
        : current?.status ?? 'loading';

  const [placementEditor, setPlacementEditor] = useState<SavedV7PlacementEditorStateV1>({
    status: 'idle',
    draft: null,
    error: null,
  });
  const placementTurn = useRef<PlacementEditTurn | null>(null);
  const placementContext = useRef({ sourceKey, cardProjection, bodySession, host });
  placementContext.current = { sourceKey, cardProjection, bodySession, host };
  const releasePlacementEdit = useCallback(() => {
    const turn = placementTurn.current;
    placementTurn.current = null;
    turn?.controller.abort();
    void turn?.actor?.dispose();
  }, []);
  useLayoutEffect(() => {
    setPlacementEditor({ status: 'idle', draft: null, error: null });
    return releasePlacementEdit;
  }, [sourceKey, cardProjection, bodySession, host, releasePlacementEdit]);

  const canEditSavedPlacement = Boolean(
    sourceStatus === 'ready' &&
      host &&
      current?.initialBinding &&
      durableSnapshot &&
      (durableSnapshot.status === 'ready' || durableSnapshot.status === 'blocked') &&
      !durableSnapshot.numeric.cleanupPending,
  );
  const startSavedPlacementEdit = async (previewIdle: () => boolean) => {
    if (
      !canEditSavedPlacement ||
      !previewIdle() ||
      placementTurn.current ||
      !savedRow ||
      !cardProjection ||
      !bodySession ||
      !sourceKey ||
      !host ||
      !current?.initialBinding
    )
      return;
    const prior = current.initialBinding;
    const controller = new AbortController();
    const live = () => {
      const context = placementContext.current;
      const body = bodySession.getSnapshot();
      const numeric = host.getSnapshot();
      return (
        !controller.signal.aborted &&
        context.sourceKey === sourceKey &&
        context.cardProjection === cardProjection &&
        context.bodySession === bodySession &&
        context.host === host &&
        body.status === 'observed-body-bound' &&
        body.generation === bodySnapshot.generation &&
        (numeric.status === 'ready' || numeric.status === 'blocked') &&
        !numeric.numeric.cleanupPending &&
        previewIdle()
      );
    };
    if (!live()) return;
    const turn: PlacementEditTurn = {
      controller,
      actor: null,
      draft: null,
      current: live,
      saving: false,
    };
    placementTurn.current = turn;
    setPlacementEditor({ status: 'preparing', draft: null, error: null });
    try {
      const actor = await restoreSavedClothPhysicalHostV1(
        {
          row: savedRow,
          selectedOperationNumber,
          cardProjection,
          bodySession,
        },
        controller.signal,
      );
      if (placementTurn.current !== turn || !live()) {
        await actor.dispose();
        throw new Error('The current saved placement or preview changed.');
      }
      turn.actor = actor;
      const draft = await actor.preparePlacementEdit(controller.signal);
      if (
        !live() ||
        draft.binding.outerSha256 !== prior.outerSha256 ||
        draft.binding.graphCanonicalSha256 !== prior.graphCanonicalSha256 ||
        draft.binding.compileInputSha256 !== prior.compileInputSha256 ||
        draft.binding.physicalInitializationCanonicalSha256 !==
          prior.physicalInitializationCanonicalSha256 ||
        draft.binding.freshSnapshotSha256 !== prior.freshSnapshotSha256
      )
        throw new Error('The saved V7 changed. Reload the cloth before editing placement.');
      turn.draft = draft;
      setPlacementEditor({ status: 'editing', draft, error: null });
    } catch (error) {
      if (placementTurn.current !== turn) return;
      releasePlacementEdit();
      setPlacementEditor({ status: 'blocked', draft: null, error: detail(error) });
    }
  };
  const saveSavedPlacementEdit = async (
    draft: SavedV7PlacementEditV1,
    pieces: readonly SavedV7PieceTranslationV1[],
  ) => {
    const turn = placementTurn.current;
    if (!turn || !turn.actor || turn.draft !== draft || turn.saving || !turn.current()) return;
    turn.saving = true;
    setPlacementEditor({ status: 'saving', draft, error: null });
    try {
      await turn.actor.savePlacementEdit(draft, pieces, turn.controller.signal);
      if (placementTurn.current !== turn) return;
      if (turn.current()) retry();
      else {
        releasePlacementEdit();
        setPlacementEditor({ status: 'idle', draft: null, error: null });
      }
    } catch (error) {
      if (placementTurn.current !== turn) return;
      releasePlacementEdit();
      setPlacementEditor({ status: 'blocked', draft: null, error: detail(error) });
    }
  };
  const cancelSavedPlacementEdit = () => {
    if (placementTurn.current?.saving) return;
    releasePlacementEdit();
    setPlacementEditor({ status: 'idle', draft: null, error: null });
  };

  const startFirstAuthoring = useCallback(async () => {
    if (
      sourceStatus !== 'placement-required' ||
      !savedRow ||
      !cardProjection ||
      !bodySession ||
      !sourceKey ||
      firstControllerRef.current ||
      (firstAuthoring.status !== 'idle' && firstAuthoring.status !== 'blocked')
    )
      return;
    const controller = new AbortController();
    firstControllerRef.current = controller;
    setFirstAuthoring({ status: 'preparing', bootstrap: null, sourceGeometry: null, error: null });
    try {
      const bootstrap = await prepareSavedFullAssemblyGenericFirstBootstrapV1(
        savedRow,
        cardProjection,
        controller.signal,
        'native-drawn-sewing',
        selectedOperationNumber,
      );
      if (firstControllerRef.current !== controller || controller.signal.aborted) return;
      setFirstAuthoring({
        status: 'compile-required',
        bootstrap,
        sourceGeometry: null,
        error: null,
      });
    } catch (error) {
      if (firstControllerRef.current !== controller || controller.signal.aborted) return;
      void releaseFirstAuthoring();
      setFirstAuthoring({
        status: 'blocked',
        bootstrap: null,
        sourceGeometry: null,
        error: detail(error),
      });
    }
  }, [
    bodySession,
    cardProjection,
    firstAuthoring.status,
    releaseFirstAuthoring,
    savedRow,
    selectedOperationNumber,
    sourceKey,
    sourceStatus,
  ]);

  const publishedSource = firstControllerRef.current;
  const compileFirstAuthoring = useCallback(
    async (choices: SavedFullAssemblyGenericFirstCompileChoicesV1) => {
      if (
        firstAuthoring.status !== 'compile-required' ||
        !publishedSource ||
        firstControllerRef.current !== publishedSource ||
        firstHostRef.current ||
        !bodySession ||
        !savedRow ||
        !sourceKey
      )
        return;
      const bootstrap = firstAuthoring.bootstrap;
      setFirstAuthoring({ status: 'compiling', bootstrap, sourceGeometry: null, error: null });
      publishedSource.abort();
      const controller = new AbortController();
      firstControllerRef.current = controller;
      const authoringHost = createSavedGenericObservedPhysicalHostV1({
        row: savedRow,
        bodySession,
      });
      firstHostRef.current = authoringHost;
      try {
        const compiled = await authoringHost.consume(
          buildSavedFullAssemblyGenericFirstCompileRequestV1(bootstrap, choices),
          controller.signal,
        );
        if (!compiled.ok)
          throw new Error(
            'detail' in compiled
              ? compiled.detail
              : compiled.result.blockers
                  .map(({ detail: blockerDetail }) => blockerDetail)
                  .join('; '),
          );
        const generation = compiled.result.generation;
        const context = await projectSavedGenericObservedPhysicalHostAuthoringContextV1(
          authoringHost,
          generation,
          controller.signal,
        );
        if (!context.ok) throw new Error(context.detail);
        if (
          firstHostRef.current !== authoringHost ||
          firstControllerRef.current !== controller ||
          controller.signal.aborted
        )
          throw new Error('Authoring source changed.');
        firstGenerationRef.current = generation;
        setFirstAuthoring({
          status: 'placement-required',
          bootstrap,
          sourceGeometry: context.sourceGeometry,
          error: null,
        });
      } catch (error) {
        if (
          firstHostRef.current === authoringHost &&
          firstControllerRef.current === controller &&
          !controller.signal.aborted
        ) {
          void releaseFirstAuthoring();
          setFirstAuthoring({
            status: 'blocked',
            bootstrap,
            sourceGeometry: null,
            error: detail(error),
          });
        }
      }
    },
    [bodySession, firstAuthoring, publishedSource, releaseFirstAuthoring, savedRow, sourceKey],
  );

  const authoringHost = firstHostRef.current;
  const generation = firstGenerationRef.current;
  const savePlacement = useCallback(
    async (placements: readonly SavedFullAssemblyTablePiecePlacementV1[] | null) => {
      if (
        (firstAuthoring.status !== 'placement-required' &&
          firstAuthoring.status !== 'save-retry') ||
        (placements === null) !== (firstAuthoring.status === 'save-retry') ||
        !authoringHost ||
        firstHostRef.current !== authoringHost ||
        generation < 1 ||
        firstGenerationRef.current !== generation ||
        firstSaveControllerRef.current ||
        !bodySession
      )
        return;
      const sourceController = firstControllerRef.current;
      if (!sourceController || sourceController.signal.aborted) return;
      const controller = new AbortController();
      firstSaveControllerRef.current = controller;
      const ownsAttempt = () =>
        firstHostRef.current === authoringHost &&
        firstControllerRef.current === sourceController &&
        !sourceController.signal.aborted &&
        firstSaveControllerRef.current === controller &&
        !controller.signal.aborted;
      const bodyCurrent = () => {
        const snapshot = bodySession.getSnapshot();
        return (
          snapshot.status === 'observed-body-bound' &&
          snapshot.generation === bodySnapshot.generation
        );
      };
      const retire = (error: string) => {
        void releaseFirstAuthoring();
        setFirstAuthoring({ status: 'blocked', bootstrap: null, sourceGeometry: null, error });
      };
      const { bootstrap, sourceGeometry } = firstAuthoring;
      let boundSha =
        firstAuthoring.status === 'save-retry' ? firstAuthoring.initializationSha256 : null;
      try {
        // A retained handler from before the bind must never replace the confirmed actor.
        if (!ownsAttempt()) return;
        const actor = authoringHost.getSnapshot();
        if (!bodyCurrent() || actor.sourceGeneration !== generation) {
          retire('The placement source or mannequin changed.');
          return;
        }
        if (
          actor.initializationSha256 !== boundSha ||
          (boundSha && actor.status !== 'initialization-bound')
        ) {
          if (boundSha) retire('The confirmed placement changed. Reopen physical setup.');
          return;
        }
        setFirstAuthoring({ status: 'saving', bootstrap, sourceGeometry, error: null });
        if (placements) {
          const bound = await bindSavedFullAssemblyGenericFirstAuthoringV1(
            authoringHost,
            { expectedGeneration: generation, placements },
            controller.signal,
          );
          if (!bound.ok) throw new Error(bound.detail);
          boundSha = bound.initializationSha256;
        }
        if (!ownsAttempt()) return;
        if (!bodyCurrent()) {
          retire('The displayed mannequin changed.');
          return;
        }
        const persisted = await persistCurrentSavedGenericObservedPhysicalHostV1(
          authoringHost,
          generation,
          controller.signal,
        );
        if (!persisted.ok) throw new Error(persisted.blockers[0].detail);
        if (ownsAttempt() && bodyCurrent()) retry();
      } catch (error) {
        if (!ownsAttempt()) return;
        // A read-only check distinguishes a still-current editable/bound actor from a changed
        // row, body or V6. Only an explicit subsequent gesture may retry persistence.
        const fresh = await projectSavedGenericObservedPhysicalHostAuthoringContextV1(
          authoringHost,
          generation,
          controller.signal,
        );
        if (!ownsAttempt()) return;
        const actor = authoringHost.getSnapshot();
        const current =
          fresh.ok &&
          fresh.sourceGeneration === generation &&
          bodyCurrent() &&
          actor.sourceGeneration === generation &&
          actor.initializationSha256 === boundSha &&
          (!boundSha ||
            (actor.status === 'initialization-bound' &&
              actor.targetSha256 === fresh.observedTarget.canonicalSha256));
        if (!current) {
          retire(
            fresh.ok ? 'The saved source or confirmed mannequin placement changed.' : fresh.detail,
          );
        } else if (boundSha) {
          setFirstAuthoring({
            status: 'save-retry',
            bootstrap,
            sourceGeometry,
            initializationSha256: boundSha,
            error: detail(error),
          });
        } else {
          setFirstAuthoring({
            status: 'placement-required',
            bootstrap,
            sourceGeometry,
            error: detail(error),
          });
        }
      } finally {
        if (firstSaveControllerRef.current === controller) firstSaveControllerRef.current = null;
      }
    },
    [
      authoringHost,
      generation,
      bodySession,
      bodySnapshot.generation,
      firstAuthoring,
      releaseFirstAuthoring,
      retry,
    ],
  );
  const saveFirstAuthoring = (placements: readonly SavedFullAssemblyTablePiecePlacementV1[]) =>
    savePlacement(placements);
  const retryFirstPlacementSave = () => savePlacement(null);

  return {
    /** Rowless zero-operation compatibility only; saved routes no longer expose profile selection. */
    profile: '' as '' | 'canonical-reference' | 'observed-saved-model',
    setProfile: () => undefined,
    selected: null,
    bodySession,
    onDisplayedBodyInputV1,
    host,
    durableSnapshot,
    sourceStatus,
    sourceError:
      sourceStatus === 'awaiting-mannequin'
        ? bodySnapshot.blocker?.detail ??
          (bodySnapshot.status === 'binding' ? 'Verifying displayed mannequin…' : null)
        : current?.error ?? null,
    retry,
    firstAuthoring,
    startFirstAuthoring,
    compileFirstAuthoring,
    saveFirstAuthoring,
    retryFirstPlacementSave,
    placementEditor,
    canEditSavedPlacement,
    isEditingSavedPlacement: () => placementTurn.current !== null,
    startSavedPlacementEdit,
    saveSavedPlacementEdit,
    cancelSavedPlacementEdit,
  } as const;
}
