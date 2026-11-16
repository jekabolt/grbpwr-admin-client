import {
  buildPatternImportDxfProductGarmentMeshComposerV2,
  disposePatternImportDxfProductGarmentMeshComposerV2,
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
  type PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductSavedGarmentMeshIngressV1,
  type PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
  type PatternImportDxfProductSavedGarmentMeshIngressResultV1,
} from './pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import type { PatternImportDxfProductGarmentMeshNativeIngressReportV1 } from './pattern-import-dxf-product-garment-mesh-native-ingress-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_SESSION_V1 =
  'pattern-import-dxf-product-saved-garment-mesh-compile-session/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1 =
  'pattern-import-dxf-product-saved-garment-mesh-compile-result/1' as const;

type SavedIngressBuilderV1 = (
  input: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
) => Promise<PatternImportDxfProductSavedGarmentMeshIngressResultV1>;

export type PatternImportDxfProductSavedGarmentMeshCompileBlockerCodeV1 =
  | 'session-disposed'
  | 'session-busy'
  | 'session-cancelled'
  | 'saved-ingress-blocked'
  | 'composer-blocked'
  | 'composer-owner-invalid';

export type PatternImportDxfProductSavedGarmentMeshCompileClaimsV1 = Readonly<{
  savedIngressImplementation: 'production-default' | 'injected-test-seam';
  savedSourceOwnerConsumedByIngress: boolean;
  composerV2Executed: boolean;
  genuineComposerOwnerValidated: boolean;
  composerOwnerPrivatelyRetained: boolean;
  staleComposerOwnerRetainedAfterNewAttempt: false;
  callerReceivesMutableMeshCopiesOnly: true;
  tableOwnsPhysicalMesh: false;
  physicalPackageCompiled: false;
  solverRuntimeImported: false;
  staticPreviewAuthority: false;
  placementAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductSavedGarmentMeshCompileResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1;
      generation: number;
      ingressReport: PatternImportDxfProductGarmentMeshNativeIngressReportV1;
      composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
      blockers: readonly [];
      claims: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1;
      generation: number;
      ingressReport: null;
      composerSnapshot: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductSavedGarmentMeshCompileBlockerCodeV1;
          detail: string;
        }>,
      ];
      claims: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1;
    }>;

type SessionStatus = 'idle' | 'compiling' | 'ready' | 'blocked' | 'disposed';

function claims(
  savedIngressImplementation: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1['savedIngressImplementation'],
  progress: Partial<PatternImportDxfProductSavedGarmentMeshCompileClaimsV1> = {},
): PatternImportDxfProductSavedGarmentMeshCompileClaimsV1 {
  return Object.freeze({
    savedIngressImplementation,
    savedSourceOwnerConsumedByIngress: false,
    composerV2Executed: false,
    genuineComposerOwnerValidated: false,
    composerOwnerPrivatelyRetained: false,
    staleComposerOwnerRetainedAfterNewAttempt: false as const,
    callerReceivesMutableMeshCopiesOnly: true as const,
    tableOwnsPhysicalMesh: false as const,
    physicalPackageCompiled: false as const,
    solverRuntimeImported: false as const,
    staticPreviewAuthority: false as const,
    placementAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
    ...progress,
  });
}

function blocked(
  generation: number,
  code: PatternImportDxfProductSavedGarmentMeshCompileBlockerCodeV1,
  detail: string,
  savedIngressImplementation: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1['savedIngressImplementation'],
  progress: Partial<PatternImportDxfProductSavedGarmentMeshCompileClaimsV1> = {},
): PatternImportDxfProductSavedGarmentMeshCompileResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1,
    generation,
    ingressReport: null,
    composerSnapshot: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
    claims: claims(savedIngressImplementation, progress),
  });
}

/**
 * Cloth-owned saved-row sink. The Assembly table only invokes `consume`; the genuine Composer V2
 * owner never leaves this session. A new verified handoff first revokes the previous candidate so a
 * failed recompilation cannot leave a stale garment projected as current.
 */
export function createPatternImportDxfProductSavedGarmentMeshCompileSessionV1(
  options: Readonly<{ buildIngress?: SavedIngressBuilderV1 }> = {},
) {
  const buildIngress =
    options.buildIngress ?? buildPatternImportDxfProductSavedGarmentMeshIngressV1;
  const savedIngressImplementation = options.buildIngress
    ? ('injected-test-seam' as const)
    : ('production-default' as const);
  const savedSourceOwnerConsumedByIngress = savedIngressImplementation === 'production-default';
  let disposed = false;
  let running = false;
  let generation = 0;
  let status: SessionStatus = 'idle';
  let currentOwner: PatternImportDxfProductGarmentMeshComposerOwnerV2 | null = null;
  let currentSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2 | null = null;

  const revokeCurrent = () => {
    if (currentOwner) disposePatternImportDxfProductGarmentMeshComposerV2(currentOwner);
    currentOwner = null;
    currentSnapshot = null;
  };

  const consume = async (
    input: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedGarmentMeshCompileResultV1> => {
    if (disposed)
      return blocked(
        generation,
        'session-disposed',
        'The saved garment compile session is disposed.',
        savedIngressImplementation,
      );
    if (running)
      return blocked(
        generation,
        'session-busy',
        'A saved garment compilation is already running.',
        savedIngressImplementation,
      );
    if (signal?.aborted)
      return blocked(
        generation,
        'session-cancelled',
        'The saved garment compilation was cancelled before source handoff.',
        savedIngressImplementation,
      );

    running = true;
    generation += 1;
    const attempt = generation;
    status = 'compiling';
    revokeCurrent();
    let candidate: PatternImportDxfProductGarmentMeshComposerOwnerV2 | null = null;
    try {
      const ingress = await buildIngress(input);
      if (disposed) {
        status = 'disposed';
        return blocked(
          attempt,
          'session-disposed',
          'The saved garment compile session was disposed during ingress.',
          savedIngressImplementation,
        );
      }
      if (signal?.aborted) {
        status = 'blocked';
        return blocked(
          attempt,
          'session-cancelled',
          'The saved garment compilation was cancelled after source handoff.',
          savedIngressImplementation,
        );
      }
      if (!ingress.ok) {
        status = 'blocked';
        return blocked(
          attempt,
          'saved-ingress-blocked',
          `${ingress.blockers[0].code}: ${ingress.blockers[0].detail}`,
          savedIngressImplementation,
          {
            savedSourceOwnerConsumedByIngress:
              savedIngressImplementation === 'production-default' &&
              ingress.claims.savedSourceOwnerConsumedOnce === true,
          },
        );
      }

      const composed = await buildPatternImportDxfProductGarmentMeshComposerV2(ingress.request);
      if (composed.ok) candidate = composed.owner;
      if (disposed) {
        status = 'disposed';
        return blocked(
          attempt,
          'session-disposed',
          'The saved garment compile session was disposed during Composer V2 execution.',
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }
      if (signal?.aborted) {
        status = 'blocked';
        return blocked(
          attempt,
          'session-cancelled',
          'The saved garment compilation was cancelled during Composer V2 execution.',
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }
      if (!composed.ok) {
        status = 'blocked';
        return blocked(
          attempt,
          'composer-blocked',
          `${composed.blockers[0].code}: ${composed.blockers[0].detail}`,
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }
      const projection = projectPatternImportDxfProductGarmentMeshComposerV2(candidate);
      if (
        !projection ||
        projection.composerCanonicalSha256 !== composed.snapshot.seal.canonicalSha256 ||
        projection.phase2ArtifactSha256 !== composed.snapshot.seals.phase2ArtifactSha256 ||
        projection.mesh.restPositions2Mm.length / 2 !== composed.snapshot.mesh.vertexCount ||
        projection.mesh.triangles.length / 3 !== composed.snapshot.mesh.triangleCount
      ) {
        status = 'blocked';
        return blocked(
          attempt,
          'composer-owner-invalid',
          'Composer V2 did not publish an exact projectable owner for its sealed snapshot.',
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }

      currentOwner = candidate;
      candidate = null;
      currentSnapshot = composed.snapshot;
      status = 'ready';
      return Object.freeze({
        ok: true as const,
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1,
        generation: attempt,
        ingressReport: ingress.report,
        composerSnapshot: composed.snapshot,
        blockers: Object.freeze([]) as readonly [],
        claims: claims(savedIngressImplementation, {
          savedSourceOwnerConsumedByIngress,
          composerV2Executed: true,
          genuineComposerOwnerValidated: true,
          composerOwnerPrivatelyRetained: true,
        }),
      });
    } catch (error) {
      status = disposed ? 'disposed' : 'blocked';
      return blocked(
        attempt,
        disposed ? 'session-disposed' : signal?.aborted ? 'session-cancelled' : 'composer-blocked',
        disposed
          ? 'The saved garment compile session was disposed during compilation.'
          : signal?.aborted
            ? 'The saved garment compilation was cancelled.'
            : error instanceof Error
              ? `Saved garment compilation failed closed: ${error.message}`
              : 'Saved garment compilation failed closed.',
        savedIngressImplementation,
      );
    } finally {
      if (candidate) disposePatternImportDxfProductGarmentMeshComposerV2(candidate);
      running = false;
    }
  };

  const projectLatest = (): PatternImportDxfProductGarmentMeshComposerProjectionV2 | null => {
    if (disposed || running || status !== 'ready' || !currentOwner || !currentSnapshot) return null;
    const projection = projectPatternImportDxfProductGarmentMeshComposerV2(currentOwner);
    if (
      !projection ||
      projection.composerCanonicalSha256 !== currentSnapshot.seal.canonicalSha256 ||
      projection.phase2ArtifactSha256 !== currentSnapshot.seals.phase2ArtifactSha256
    ) {
      revokeCurrent();
      status = 'blocked';
      return null;
    }
    return projection;
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_SESSION_V1,
    consume,
    projectLatest,
    dispose() {
      if (disposed) return;
      disposed = true;
      status = 'disposed';
      revokeCurrent();
    },
    snapshot() {
      return Object.freeze({
        disposed,
        running,
        generation,
        status,
        composerCanonicalSha256: currentSnapshot?.seal.canonicalSha256 ?? null,
        phase2ArtifactSha256: currentSnapshot?.seals.phase2ArtifactSha256 ?? null,
      });
    },
  });
}
