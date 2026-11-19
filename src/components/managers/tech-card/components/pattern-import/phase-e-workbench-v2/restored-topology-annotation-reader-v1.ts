import { useEffect, useState } from 'react';

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';

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
import type {
  PatternImportDxfPhaseETopologyAnnotationApplicationResultV5,
  PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5,
} from './topology-annotation-application-transaction-v5';
import type { PatternImportDxfPhaseETopologyAnnotationDraftV5 } from './topology-annotation-save-control-v5';

type Session = PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
type Geometry = PatternImportDxfProductExactNDesktopGeometryV2;

export type PatternImportDxfPhaseERestoredTopologyAnnotationReadbackV1 = Readonly<{
  mediaType: Extract<
    PatternImportDxfPhaseETopologyAnnotationApplicationResultV5,
    { ok: true }
  >['mediaType'];
  sidecarSha256: string;
  draft: PatternImportDxfPhaseETopologyAnnotationDraftV5;
}>;

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
  ): Promise<PatternImportDxfPhaseERestoredTopologyAnnotationReadbackV1> => {
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

    return Object.freeze({
      mediaType: loaded.mediaType,
      sidecarSha256: loaded.readback.sidecarSha256,
      draft: Object.freeze({ measurements: Object.freeze(measurements), callouts }),
    });
  };
}

export type PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1 = ReturnType<
  typeof createPatternImportDxfPhaseERestoredTopologyAnnotationReaderV1
>;

type Readback =
  | Readonly<{
      status: 'ready';
      readback: PatternImportDxfPhaseERestoredTopologyAnnotationReadbackV1;
    }>
  | Readonly<{ status: 'blocked'; detail: string }>;

export function usePatternImportDxfPhaseERestoredTopologyAnnotationsV1(
  session: Session,
  geometry: Geometry | null,
  read: PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1 | undefined,
) {
  const [generation, setGeneration] = useState(0);
  const [readback, setReadback] = useState<Readonly<{
    session: Session;
    geometry: Geometry;
    generation: number;
    read: PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1;
    result: Readback;
  }> | null>(null);
  const available = !session.productionFeed && !!geometry?.annotationSource && !!read;
  useEffect(() => {
    setReadback(null);
    if (!available || !geometry || !read) return;
    const controller = new AbortController();
    void read(session, geometry, controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted)
          setReadback({
            session,
            geometry,
            read,
            generation,
            result: { status: 'ready', readback: loaded },
          });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setReadback({
            session,
            geometry,
            read,
            generation,
            result: {
              status: 'blocked',
              detail:
                error instanceof Error ? error.message : 'Saved annotations could not be read.',
            },
          });
      },
    );
    return () => controller.abort();
  }, [available, generation, geometry, read, session]);

  const current =
    available &&
    readback?.session === session &&
    readback.geometry === geometry &&
    readback.read === read &&
    readback.generation === generation
      ? readback.result
      : null;
  const publish = (
    expectedPreviousSidecarSha256: string,
    next: PatternImportDxfPhaseERestoredTopologyAnnotationReadbackV1,
  ) => {
    setReadback((stored) =>
      stored?.session === session &&
      stored.geometry === geometry &&
      stored.read === read &&
      stored.generation === generation &&
      stored.result.status === 'ready' &&
      stored.result.readback.sidecarSha256 === expectedPreviousSidecarSha256 &&
      (stored.result.readback.mediaType === next.mediaType ||
        (stored.result.readback.mediaType ===
          PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 &&
          next.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5))
        ? { ...stored, result: { status: 'ready', readback: next } }
        : stored,
    );
  };
  return { current, publish, reload: () => setGeneration((value) => value + 1) };
}
