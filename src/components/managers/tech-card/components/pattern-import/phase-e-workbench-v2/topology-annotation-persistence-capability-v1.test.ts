import { describe, expect, it } from 'vitest';

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';
import { createPatternImportDxfProductCompositeSidecarProductionPersistenceV5 } from './composite-sidecar-persistence-v5';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 } from './composite-sidecar-v7';
import { createPatternImportDxfPhaseEDraftCadTopologyScopeV1 } from './draft-cad-topology-scope-v1';
import { resolvePatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1 } from './topology-annotation-persistence-capability-v1';

const hash = (character: string) => character.repeat(64);
const sourceIdentity = 'topology-source:card-11:main';
const expected = Object.freeze({
  row: Object.freeze({
    techCardId: 11,
    scopeKey: 'fabric:main',
    patternLineKey: 'pattern:main',
    revision: 8,
    cardLockVersion: 301,
    url: 'https://media.example.invalid/pants.dxf',
    sizeBytes: 42,
    sha256: hash('a'),
  }),
  sourceIdentity,
  sourceRevision: 'revision:8',
  sourceSha256: hash('b'),
  serverAssemblyRevision: 'assembly:91',
  assemblyTopologySha256: hash('c'),
});
const current = Object.freeze({
  techCardId: expected.row.techCardId,
  scopeKey: expected.row.scopeKey,
  patternLineKey: expected.row.patternLineKey,
  savedRowRevision: expected.row.revision,
  cardLockVersion: expected.row.cardLockVersion,
  dxfSha256: expected.row.sha256,
  sourceIdentity: expected.sourceIdentity,
  sourceRevision: expected.sourceRevision,
  sourceSha256: expected.sourceSha256,
  serverAssemblyRevision: expected.serverAssemblyRevision,
  assemblyTopologySha256: expected.assemblyTopologySha256,
});
const scope = createPatternImportDxfPhaseEDraftCadTopologyScopeV1(
  expected.row.scopeKey,
  sourceIdentity,
);

describe('topology annotation production persistence capability', () => {
  it('keeps Save absent for the editable Composite V3 workbench', () => {
    const capability = resolvePatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1({
      scope,
      expected,
      current,
      currentCompositeMediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v3+json',
      productionPersistence: createPatternImportDxfProductCompositeSidecarProductionPersistenceV5(),
    });

    expect(capability).toMatchObject({
      status: 'unavailable',
      saveActionAllowed: false,
      persistence: null,
      blocker: { code: 'current-composite-v4-or-v5-unavailable' },
    });
  });

  it('keeps Save absent for a structural writer lookalike', () => {
    const capability = resolvePatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1({
      scope,
      expected,
      current,
      currentCompositeMediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
      productionPersistence: Object.freeze({ adapter: {}, claims: {} }),
    });

    expect(capability).toMatchObject({
      status: 'unavailable',
      saveActionAllowed: false,
      persistence: null,
      blocker: { code: 'production-v5-writer-unavailable' },
    });
  });

  it('does not expose the V5 writer over Composite V7 fullgraph bytes', () => {
    const capability = resolvePatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1({
      scope,
      expected,
      current,
      currentCompositeMediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
      productionPersistence: createPatternImportDxfProductCompositeSidecarProductionPersistenceV5(),
    });

    expect(capability).toMatchObject({
      status: 'unavailable',
      saveActionAllowed: false,
      persistence: null,
      blocker: { code: 'versioned-rewrap-required' },
    });
  });

  it('exposes Save/readback and the exact adapter only for a genuine owner', () => {
    const productionPersistence =
      createPatternImportDxfProductCompositeSidecarProductionPersistenceV5();
    const capability = resolvePatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1({
      scope,
      expected,
      current,
      currentCompositeMediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
      productionPersistence,
    });

    expect(capability).toMatchObject({
      status: 'available',
      durableSaveAvailable: true,
      durableReadbackAvailable: true,
      saveActionAllowed: true,
      autosaveAllowed: false,
      blocker: null,
    });
    expect(capability.persistence).toBe(productionPersistence);
    expect(capability.persistence?.adapter).toBe(productionPersistence.adapter);
  });

  it('rejects stale source authority before considering the writer', () => {
    const capability = resolvePatternImportDxfPhaseETopologyAnnotationPersistenceCapabilityV1({
      scope,
      expected,
      current: { ...current, sourceRevision: 'revision:9' },
      currentCompositeMediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
      productionPersistence: createPatternImportDxfProductCompositeSidecarProductionPersistenceV5(),
    });

    expect(capability).toMatchObject({
      status: 'unavailable',
      blocker: { code: 'stale-source-revision' },
    });
  });
});
