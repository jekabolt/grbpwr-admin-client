import { useEffect, useRef, useState } from 'react';
import {
  MeasurementWatertightSurfaceV1Stage,
  type MeasurementSurfaceDisplayedGeometryAcceptanceV1,
  type MeasurementSurfaceStageStatus,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import {
  createMeasurementWatertightSurfaceV1,
  type MeasurementWatertightSurfaceArtifactV1,
} from 'lib/cloth/body/measurement-watertight-surface-v1';
import { CalloutBox, Text } from 'ui';

import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from './beta-skirt-g3b2-preview-mannequin-request-v1';
import {
  admitBetaSkirtCanonicalMediumDisplayedBodyV2,
  buildBetaSkirtCanonicalMediumBodyV2,
  type BetaSkirtCanonicalMediumBodyOwnerV2,
  type BetaSkirtCanonicalMediumBodyProjectionV2,
  type BetaSkirtCanonicalMediumDisplayedBodyOwnerV2,
} from './beta-skirt-canonical-medium-displayed-body-admission-v2';

type Built = Readonly<{
  owner: BetaSkirtCanonicalMediumBodyOwnerV2;
  projection: BetaSkirtCanonicalMediumBodyProjectionV2;
  artifact: MeasurementWatertightSurfaceArtifactV1;
}>;
const overlays = Object.freeze({
  wireframe: false,
  normals: false,
  landmarks: false,
  sectionPlanes: false,
});
const ignoreRenderCount = () => {};

/** Mounted only for the explicit Canonical medium choice, never as a selected-model fallback. */
export function SavedPhysicalCanonicalStageV1({
  onBody,
}: {
  onBody: (owner: BetaSkirtCanonicalMediumDisplayedBodyOwnerV2 | null) => void;
}) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState<MeasurementSurfaceDisplayedGeometryAcceptanceV1 | null>(
    null,
  );
  const callback = useRef(onBody);
  callback.current = onBody;
  const current = useRef({ built, accepted, ready });
  current.current = { built, accepted, ready };
  const admission = useRef<BetaSkirtCanonicalMediumDisplayedBodyOwnerV2 | null>(null);
  const mounted = useRef(false);

  const revoke = () => {
    admission.current?.dispose();
    admission.current = null;
    callback.current(null);
  };

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let owner: BetaSkirtCanonicalMediumBodyOwnerV2 | null = null;
    void (async () => {
      try {
        const result = await buildBetaSkirtCanonicalMediumBodyV2(controller.signal);
        if (!result.ok) throw new Error(result.detail);
        owner = result.owner;
        if (controller.signal.aborted) return;
        const projection = owner.project();
        if (!projection) throw new Error('The canonical mannequin is unavailable.');
        const artifact = createMeasurementWatertightSurfaceV1({
          measurements: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1.measurements,
          sourceRevision: projection.frame.sourceRevision,
          pose: 'A',
        });
        if (!controller.signal.aborted) setBuilt({ owner, projection, artifact });
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'The canonical mannequin could not load.',
          );
      } finally {
        if (controller.signal.aborted) owner?.dispose();
      }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
      current.current = { built: null, accepted: null, ready: false };
      admission.current?.dispose();
      admission.current = null;
      callback.current(null);
      owner?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!built || !accepted || !ready) return;
    if (
      accepted.frame !== built.projection.frame ||
      accepted.mesh !== built.projection.displayMesh ||
      accepted.sourcePositions !== built.projection.displayMesh.positions
    )
      return;
    const controller = new AbortController();
    let disposed = false;
    const isCurrent = () =>
      !disposed &&
      mounted.current &&
      built.owner.isCurrent() &&
      current.current.built === built &&
      current.current.accepted === accepted &&
      current.current.ready;
    const input = {
      project: () =>
        isCurrent()
          ? {
              binding: built.projection.binding,
              frame: accepted.frame,
              pose: built.projection.pose,
              bodyPositionsM: accepted.positions,
              bodyTriangles: accepted.indices,
            }
          : null,
      isCurrent,
      dispose: () => {
        const changed = !disposed;
        disposed = true;
        return changed;
      },
    };
    void admitBetaSkirtCanonicalMediumDisplayedBodyV2(
      {
        canonicalBodyOwner: built.owner,
        displayedBodyInput: input,
      },
      controller.signal,
    )
      .then((result) => {
        if (!isCurrent() || controller.signal.aborted) {
          if (result.ok) result.owner.dispose();
          return;
        }
        if (!result.ok) {
          setError(result.detail);
          return;
        }
        admission.current = result.owner;
        callback.current(result.owner);
      })
      .catch((cause: unknown) => {
        if (isCurrent())
          setError(cause instanceof Error ? cause.message : 'Body verification failed.');
      });
    return () => {
      disposed = true;
      controller.abort();
      admission.current?.dispose();
      admission.current = null;
      callback.current(null);
    };
  }, [built, accepted, ready]);

  const onStatus = (status: MeasurementSurfaceStageStatus, detail?: string) => {
    current.current.ready = status === 'ready';
    if (status !== 'ready') revoke();
    setReady(status === 'ready');
    if (status === 'error') setError(detail ?? 'The mannequin display is unavailable.');
  };
  const onGeometry = (geometry: MeasurementSurfaceDisplayedGeometryAcceptanceV1 | null) => {
    current.current.accepted = geometry;
    if (!geometry) {
      current.current.ready = false;
      setReady(false);
      revoke();
    }
    setAccepted(geometry);
  };

  return (
    <div className='flex min-w-0 flex-col gap-stack'>
      <Text variant='label'>Canonical medium · A-rest</Text>
      {error ? <CalloutBox tone='error'>{error}</CalloutBox> : null}
      {!built && !error ? (
        <Text role='status'>Loading mannequin…</Text>
      ) : built ? (
        <MeasurementWatertightSurfaceV1Stage
          artifact={built.artifact}
          frame={built.projection.frame}
          lod='display'
          displayMeshOverride={built.projection.displayMesh}
          viewPreset='front'
          overlays={overlays}
          onStatus={onStatus}
          onRenderCount={ignoreRenderCount}
          onDisplayedGeometryV1={onGeometry}
          className='min-h-80'
          accessibleLabel='Canonical medium mannequin used for this cloth preview'
        />
      ) : null}
    </div>
  );
}
