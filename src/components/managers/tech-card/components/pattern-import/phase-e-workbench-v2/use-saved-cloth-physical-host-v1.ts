import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createSavedGenericDurablePhysicalHostV1,
  type SavedGenericDurablePhysicalHostSnapshotV1,
} from 'components/cloth-simulation-spike/saved-generic-durable-physical-host-v1';
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

  return {
    /** Rowless zero-operation compatibility only; saved routes no longer expose profile selection. */
    profile: '' as '' | 'canonical-reference' | 'observed-saved-model',
    setProfile: (_profile: '' | 'canonical-reference' | 'observed-saved-model') => undefined,
    selected: null,
    bodySession,
    onDisplayedBodyInputV1,
    host,
    durableSnapshot,
    sourceStatus,
    sourceError: current?.error ?? null,
    retry,
  } as const;
}
