import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createSavedGenericDurablePhysicalHostV1,
  type SavedGenericDurablePhysicalHostSnapshotV1,
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
  status: Exclude<SavedClothPhysicalSourceStatusV1, 'idle' | 'awaiting-mannequin'>;
  error: string | null;
}>;

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
      error: null;
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

const EMPTY_BODY_SNAPSHOT = Object.freeze({ status: 'idle', generation: 0 });
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
  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
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

  useEffect(() => {
    setFirstAuthoring({ status: 'idle', bootstrap: null, sourceGeometry: null, error: null });
    void releaseFirstAuthoring();
    return () => {
      void releaseFirstAuthoring();
    };
  }, [releaseFirstAuthoring, sourceKey]);

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
        else setMounted({ ...base, host: durable, status: 'ready', error: null });
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

  const startFirstAuthoring = useCallback(async () => {
    if (
      sourceStatus !== 'placement-required' ||
      !savedRow ||
      !cardProjection ||
      !bodySession ||
      !sourceKey ||
      firstAuthoring.status === 'preparing'
    )
      return;
    await releaseFirstAuthoring();
    const controller = new AbortController();
    firstControllerRef.current = controller;
    setFirstAuthoring({ status: 'preparing', bootstrap: null, sourceGeometry: null, error: null });
    try {
      const bootstrap = await prepareSavedFullAssemblyGenericFirstBootstrapV1(
        savedRow,
        cardProjection,
        controller.signal,
        'native-drawn-sewing',
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
    sourceKey,
    sourceStatus,
  ]);

  const compileFirstAuthoring = useCallback(
    async (choices: SavedFullAssemblyGenericFirstCompileChoicesV1) => {
      if (firstAuthoring.status !== 'compile-required' || !bodySession || !savedRow || !sourceKey)
        return;
      const bootstrap = firstAuthoring.bootstrap;
      setFirstAuthoring({ status: 'compiling', bootstrap, sourceGeometry: null, error: null });
      await releaseFirstAuthoring();
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
          await releaseFirstAuthoring();
          setFirstAuthoring({
            status: 'blocked',
            bootstrap,
            sourceGeometry: null,
            error: detail(error),
          });
        }
      }
    },
    [bodySession, firstAuthoring, releaseFirstAuthoring, savedRow, sourceKey],
  );

  const saveFirstAuthoring = useCallback(
    async (placements: readonly SavedFullAssemblyTablePiecePlacementV1[]) => {
      if (firstAuthoring.status !== 'placement-required') return;
      const authoringHost = firstHostRef.current;
      const generation = firstGenerationRef.current;
      if (!authoringHost || generation < 1) return;
      const { bootstrap, sourceGeometry } = firstAuthoring;
      setFirstAuthoring({
        status: 'saving',
        bootstrap,
        sourceGeometry,
        error: null,
      });
      // The controller stored in `firstControllerRef` owns the compiled source lifetime. Aborting
      // it here revokes the genuine observed-host source before bind/persist can consume it. A
      // save has its own operation controller; release/replacement still aborts both lifetimes.
      firstSaveControllerRef.current?.abort();
      const controller = new AbortController();
      firstSaveControllerRef.current = controller;
      const sourceController = firstControllerRef.current;
      try {
        const bound = await bindSavedFullAssemblyGenericFirstAuthoringV1(
          authoringHost,
          {
            expectedGeneration: generation,
            placements,
          },
          controller.signal,
        );
        if (!bound.ok) throw new Error(bound.detail);
        const persisted = await persistCurrentSavedGenericObservedPhysicalHostV1(
          authoringHost,
          generation,
          controller.signal,
        );
        if (!persisted.ok) throw new Error(persisted.blockers[0].detail);
        await releaseFirstAuthoring();
        setFirstAuthoring({ status: 'idle', bootstrap: null, sourceGeometry: null, error: null });
        retry();
      } catch (error) {
        if (
          firstHostRef.current !== authoringHost ||
          firstSaveControllerRef.current !== controller ||
          controller.signal.aborted ||
          sourceController === null ||
          firstControllerRef.current !== sourceController ||
          sourceController.signal.aborted
        )
          return;
        setFirstAuthoring({
          status: 'blocked',
          bootstrap,
          sourceGeometry,
          error: detail(error),
        });
      }
    },
    [firstAuthoring, releaseFirstAuthoring, retry],
  );

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
  } as const;
}
