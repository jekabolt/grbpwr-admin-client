import { useEffect, useState } from 'react';

import {
  matchesPatternImportDxfProductExactNDesktopGeometryV2,
  matchesPatternImportDxfProductExactNSessionFreshAuthorityV1,
} from './durable-exact-session-current-v1';
import type {
  PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  PatternImportDxfProductExactNDesktopGeometryV2,
} from './exact-n-seam-production-mount-v2';
import {
  buildPatternImportDxfPhaseEMeasurementV1,
  resolvePatternImportDxfPhaseEVertexV1,
} from './measurement-v1';
import type { PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1 } from './saved-assembly-authority-transport-v1';
import type { PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5 } from './topology-annotation-application-transaction-v5';
import type { PatternImportDxfPhaseETopologyAnnotationDraftV5 } from './topology-annotation-save-control-v5';

type Session = PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
type Geometry = PatternImportDxfProductExactNDesktopGeometryV2;

export function createPatternImportDxfPhaseERestoredTopologyAnnotationReaderV1(
  authority: Pick<
    PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
    'readCurrentAssemblyTopology'
  >,
  annotations: Pick<PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5, 'load'>,
) {
  return async (
    session: Session,
    geometry: Geometry,
    signal: AbortSignal,
  ): Promise<PatternImportDxfPhaseETopologyAnnotationDraftV5> => {
    const { current } = session;
    const { row } = current;
    const { annotationSource, projection } = geometry;
    if (
      session.productionFeed ||
      !annotationSource ||
      annotationSource.revision !== String(row.revision) ||
      annotationSource.sha256 !== row.sha256 ||
      !matchesPatternImportDxfProductExactNDesktopGeometryV2(geometry, session)
    )
      throw new TypeError('Saved annotations do not match the current pattern projection.');

    signal.throwIfAborted();
    const loaded = await annotations.load(session, { ...annotationSource, projection }, signal);
    if (!loaded.ok) throw new TypeError(loaded.blockers[0].detail);
    signal.throwIfAborted();

    const measurements = loaded.readback.measurements.map(({ id, kind, anchors }) => {
      const rebuilt = buildPatternImportDxfPhaseEMeasurementV1(projection, id, kind, anchors);
      if (!rebuilt.ok) throw new TypeError(rebuilt.detail);
      return rebuilt.measurement;
    });
    const callouts = loaded.readback.callouts;
    if (callouts.some(({ anchor }) => !resolvePatternImportDxfPhaseEVertexV1(projection, anchor)))
      throw new TypeError('A saved callout anchor is absent from the current pattern projection.');

    // Recheck the selected operation after the independent outer-sidecar read.
    const fresh = await authority.readCurrentAssemblyTopology(
      { row, selectedOperationNumber: current.selectedOperation.sourceOperationNumber },
      signal,
    );
    signal.throwIfAborted();
    if (!matchesPatternImportDxfProductExactNSessionFreshAuthorityV1(session, fresh))
      throw new TypeError('Assembly Order changed while reading saved annotations.');

    return Object.freeze({ measurements: Object.freeze(measurements), callouts });
  };
}

export type PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1 = ReturnType<
  typeof createPatternImportDxfPhaseERestoredTopologyAnnotationReaderV1
>;

type Readback =
  | Readonly<{ status: 'ready'; draft: PatternImportDxfPhaseETopologyAnnotationDraftV5 }>
  | Readonly<{ status: 'blocked'; detail: string }>;

export function usePatternImportDxfPhaseERestoredTopologyAnnotationsV1(
  session: Session,
  geometry: Geometry | null,
  read: PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1 | undefined,
) {
  const [readback, setReadback] = useState<Readonly<{
    session: Session;
    geometry: Geometry;
    read: PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1;
    result: Readback;
  }> | null>(null);
  const available = !session.productionFeed && !!geometry?.annotationSource && !!read;
  useEffect(() => {
    setReadback(null);
    if (!available || !geometry || !read) return;
    const controller = new AbortController();
    void read(session, geometry, controller.signal).then(
      (draft) => {
        if (!controller.signal.aborted)
          setReadback({ session, geometry, read, result: { status: 'ready', draft } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setReadback({
            session,
            geometry,
            read,
            result: {
              status: 'blocked',
              detail:
                error instanceof Error ? error.message : 'Saved annotations could not be read.',
            },
          });
      },
    );
    return () => controller.abort();
  }, [available, geometry, read, session]);

  if (
    !available ||
    readback?.session !== session ||
    readback.geometry !== geometry ||
    readback.read !== read
  )
    return null;
  return readback.result;
}
