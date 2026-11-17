import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { SavedObservedPhysicalHostV1 } from 'components/cloth-simulation-spike/saved-observed-physical-host-v1';
import { createSavedModelDisplayedTriangleBodyQuerySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-query-session-v2';
import type { SavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 } from '../phase-e-workbench/assembly-order-entry';

export type SavedClothPhysicalProfileV1 = '' | 'canonical-reference' | 'observed-saved-model';

export type SavedClothPhysicalSelectionV1 =
  | Readonly<{
      profile: 'canonical-reference';
      owner: PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1;
    }>
  | Readonly<{ profile: 'observed-saved-model'; owner: SavedObservedPhysicalHostV1 }>;

export interface UseSavedClothPhysicalHostInputV1 {
  readonly row: DxfProductSavedRowIdentityV1 | null;
  readonly selectedOperationNumber: number;
  /** Keep this factory stable. Every committed source lifetime receives a new one-shot owner. */
  readonly createCanonicalOwner: () => PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1;
}

type BodySession = SavedModelDisplayedTriangleBodySessionV2;
/** 'ready' means a selected downstream owner exists; it does not claim compiled/body/runtime readiness. */
export type SavedClothPhysicalSourceStatusV1 = 'idle' | 'loading' | 'ready' | 'blocked';
type MountedSource = Readonly<{
  key: string;
  bodySession: BodySession;
  factory: UseSavedClothPhysicalHostInputV1['createCanonicalOwner'];
}> &
  (
    | Readonly<{ status: 'loading'; selected: null; error: null }>
    | Readonly<{ status: 'ready'; selected: SavedClothPhysicalSelectionV1; error: null }>
    | Readonly<{ status: 'blocked'; selected: null; error: string }>
  );

/**
 * Selects the real downstream owner before the table hands off its one-shot saved source.
 * The observed body consumer exists even without a saved row, so N1/zero-operation display
 * observation can arrive first. Displayed inputs are borrowed from the picker and never disposed.
 */
export function useSavedClothPhysicalHostV1({
  row,
  selectedOperationNumber,
  createCanonicalOwner,
}: UseSavedClothPhysicalHostInputV1) {
  const queryClient = useQueryClient();
  const [profile, updateProfile] = useState<SavedClothPhysicalProfileV1>('');
  const setProfile = useCallback((next: SavedClothPhysicalProfileV1) => {
    if (next !== '' && next !== 'canonical-reference' && next !== 'observed-saved-model')
      throw new TypeError('Choose an explicit supported cloth body profile.');
    updateProfile(next);
  }, []);
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

  // Capture each of the eight original fields. URL, byte size and revision are never inferred.
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
  const sourceKey =
    savedRow === null ? null : JSON.stringify([profile, savedRow, selectedOperationNumber]);
  const [mounted, setMounted] = useState<MountedSource | null>(null);

  useEffect(() => {
    if (!profile || !savedRow || sourceKey === null || !bodySession) {
      setMounted(null);
      return;
    }
    const controller = new AbortController();
    let owned: SavedClothPhysicalSelectionV1['owner'] | null = null;
    const binding = { key: sourceKey, bodySession, factory: createCanonicalOwner };
    setMounted({ ...binding, status: 'loading', selected: null, error: null });
    const block = () => {
      if (!controller.signal.aborted)
        setMounted({
          ...binding,
          status: 'blocked',
          selected: null,
          error: 'The selected cloth source could not be loaded.',
        });
    };
    const publish = (selected: SavedClothPhysicalSelectionV1) => {
      if (controller.signal.aborted) {
        selected.owner.dispose();
        return;
      }
      owned = selected.owner;
      setMounted({ ...binding, status: 'ready', selected, error: null });
    };
    if (profile === 'canonical-reference') {
      try {
        publish({ profile, owner: createCanonicalOwner() });
      } catch {
        block();
      }
    } else {
      void import('components/cloth-simulation-spike/saved-observed-physical-host-v1')
        .then(({ createSavedObservedPhysicalHostV1 }) => {
          if (controller.signal.aborted) return;
          publish({
            profile,
            owner: createSavedObservedPhysicalHostV1({ row: savedRow, bodySession }),
          });
        })
        .catch(() => {
          block();
        });
    }
    return () => {
      controller.abort();
      owned?.dispose();
      owned = null;
    };
  }, [profile, savedRow, sourceKey, bodySession, createCanonicalOwner]);

  // Suppress the preceding source and its error before replacement effects are committed.
  const current =
    mounted?.key === sourceKey &&
    mounted.bodySession === bodySession &&
    mounted.factory === createCanonicalOwner
      ? mounted
      : null;
  const selected = current?.status === 'ready' ? current.selected : null;
  const sourceStatus: SavedClothPhysicalSourceStatusV1 =
    !profile || !savedRow ? 'idle' : current?.status ?? 'loading';
  const sourceError = current?.status === 'blocked' ? current.error : null;
  return {
    profile,
    setProfile,
    bodySession,
    onDisplayedBodyInputV1,
    selected,
    sourceStatus,
    sourceError,
  } as const;
}
