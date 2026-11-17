import { describe, expect, it } from 'vitest';
import type { DxfProductSavedNativeCompilerSourceOwnerV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';

import {
  SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1,
  SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1,
  SavedFullAssemblyGenericFirstBootstrapErrorV1,
  buildSavedFullAssemblyGenericFirstCompileRequestV1,
  type SavedFullAssemblyGenericFirstBootstrapV1,
  type SavedFullAssemblyGenericFirstCompileChoicesV1,
} from './saved-full-assembly-generic-first-bootstrap-v1';

const sha = (value: string) => value.repeat(64).slice(0, 64);

function fixture() {
  const draft = { exact: 'original-replay-reference' };
  const sourceOwner = {
    version: 'dxf-product-saved-native-compiler-source-owner/1',
  } as unknown as DxfProductSavedNativeCompilerSourceOwnerV1;
  const row = {
    techCardId: 156,
    scopeKey: 'MAIN',
    patternLineKey: 'pattern-main',
    revision: 7,
    cardLockVersion: 11,
    url: 'https://cdn.invalid/card-156.dxf',
    sizeBytes: 2048,
    sha256: sha('a'),
  };
  const bootstrap: SavedFullAssemblyGenericFirstBootstrapV1 = {
    schemaVersion: SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1,
    row,
    sourceOwner,
    sourceRequest: {
      schemaVersion: 'dxf-product-saved-native-compiler-source-request/1',
      sourceFileId: 'saved-row-source',
      sourceSha256: row.sha256,
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      patternLineKey: row.patternLineKey,
      cardLockVersion: row.cardLockVersion,
      draft: draft as never,
    },
    expected: {
      row,
      serverAssemblyRevision: `asm:v1:${'b'.repeat(32)}:7`,
      fullAssemblySnapshotSha256: sha('c'),
    },
    seedOperationNumber: 20,
    catalog: {
      schemaVersion: 'pattern-import-dxf-product-phase-e-authoring-catalog/1',
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      sizeToken: 'M',
      sourceFileId: 'saved-row-source',
      sizeSelectionCanonicalSha256: sha('d'),
      pieces: [
        {
          pieceId: 'FRONT',
          pieceLineKey: 'front-line',
          contours: [
            {
              contourId: 'front-shell',
              role: 'sewing-boundary',
              geometry: { kind: 'seam' },
              closed: true,
              boundaryVertices: [
                { ordinal: 0, vertexId: 'front-v0', normalizedArc: 0 },
                { ordinal: 1, vertexId: 'front-v1', normalizedArc: 0.5 },
              ],
            },
          ],
        },
        {
          pieceId: 'BACK',
          pieceLineKey: 'back-line',
          contours: [
            {
              contourId: 'back-shell',
              role: 'sewing-boundary',
              geometry: { kind: 'seam' },
              closed: true,
              boundaryVertices: [
                { ordinal: 0, vertexId: 'back-v0', normalizedArc: 0 },
                { ordinal: 1, vertexId: 'back-v1', normalizedArc: 0.5 },
              ],
            },
          ],
        },
      ],
      requiredExplicitFields: [
        'documentId-and-revision',
        'physical-surface',
        'two-seam-sides-and-anchor-ranges',
        'side-directions',
        'mapping-and-length-ratio',
        'operation-stage-and-order',
        'immutable-material-revisions',
        'tolerances',
      ],
      canonicalSha256: sha('e'),
      geometryCoordinatesExposed: false,
      rawDxfExposed: false,
      assemblyInferred: false,
      productionReady: false,
    },
    documentAuthority: {
      schemaVersion: 'pattern-import-dxf-phase-e-document-authority/1',
      evidence: {
        techCardId: row.techCardId,
        scopeKey: row.scopeKey,
        patternLineKey: row.patternLineKey,
        dxfSha256: row.sha256,
        patternVersion: row.revision,
        cardLockVersion: row.cardLockVersion,
      },
      sizeSelectionCanonicalSha256: sha('d'),
      catalogCanonicalSha256: sha('e'),
      documentId: 'document-card-156-main',
      revision: 'revision-7',
    },
    pieces: [
      { pieceId: 'FRONT', pieceLineKey: 'front-line', grainDegrees: 90 },
      { pieceId: 'BACK', pieceLineKey: 'back-line', grainDegrees: 90 },
    ],
    operations: [
      {
        operationNumber: 20,
        work: 'join_lockstitch',
        inputKeys: ['front-line', 'back-line'],
        outputUnitKey: 'body-unit',
        outputUnitName: 'Body',
        seamKeys: ['side-seam'],
      },
    ],
    seams: [
      {
        seamKey: 'side-seam',
        sourceOperationNumber: 20,
        anchoredSize: 'M',
        direction: 'reversed',
        pieceLineKeys: ['front-line', 'back-line'],
      },
    ],
    existingExactSeamChoices: [],
    diagnosticProfiles: [
      {
        id: 'browser-medium-isotropic-diagnostic',
        revision: '1',
        label: 'Medium diagnostic preview',
        description: 'Uncalibrated visual cloth for the first mannequin preview.',
      },
    ],
    claims: SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1,
  };
  const choices: SavedFullAssemblyGenericFirstCompileChoicesV1 = {
    seamChoices: [
      {
        sourceSeamKey: 'side-seam',
        sides: [
          {
            pieceId: 'FRONT',
            pieceLineKey: 'front-line',
            contourId: 'front-shell',
            anchors: ['front-v0', 'front-v1'],
            direction: 'forward',
          },
          {
            pieceId: 'BACK',
            pieceLineKey: 'back-line',
            contourId: 'back-shell',
            anchors: ['back-v1', 'back-v0'],
            direction: 'reverse',
          },
        ],
      },
    ],
    diagnosticProfile: { id: 'browser-medium-isotropic-diagnostic', revision: '1' },
  };
  return { bootstrap, choices, sourceOwner, draft };
}

describe('saved full assembly first physical bootstrap', () => {
  it('builds one explicit full-graph compile request and preserves genuine owner/draft identity', () => {
    const { bootstrap, choices, sourceOwner, draft } = fixture();
    const request = buildSavedFullAssemblyGenericFirstCompileRequestV1(bootstrap, choices);

    expect(request.sourceOwner).toBe(sourceOwner);
    expect(request.sourceRequest.draft).toBe(draft);
    expect(request.intent.pieces.map(({ pieceId }) => pieceId)).toEqual(['FRONT', 'BACK']);
    expect(request.intent.operations[0]).toMatchObject({
      sourceOperationNumber: 20,
      clientOperationId: 'ao-operation:20',
      seamIds: ['side-seam'],
    });
    expect(request.intent.seams[0].sides[0].anchors).toEqual(['front-v0', 'front-v1']);
    expect(request.intent.compile.materials[0]).toMatchObject({
      id: 'browser-medium-isotropic-diagnostic-material',
      bendComplianceInvNm: { warp: 0.0006, weft: 0.0006 },
      provenance: { calibrationStatus: 'uncalibrated-visual' },
    });
    expect(request.intent.compile.continuumMaterials[0].complianceMPerN).toEqual({
      warp: 8e-11,
      weft: 1.2e-10,
      shear: 5e-10,
    });
  });

  it('does not infer a seam edge from V6 presentation data', () => {
    const { bootstrap, choices } = fixture();
    const missing: SavedFullAssemblyGenericFirstCompileChoicesV1 = {
      ...choices,
      seamChoices: [
        {
          ...choices.seamChoices[0]!,
          sides: [
            { ...choices.seamChoices[0]!.sides[0], anchors: ['', ''] },
            choices.seamChoices[0]!.sides[1],
          ],
        },
      ],
    };

    expect(() => buildSavedFullAssemblyGenericFirstCompileRequestV1(bootstrap, missing)).toThrow(
      SavedFullAssemblyGenericFirstBootstrapErrorV1,
    );
  });

  it('requires explicit selection of the immutable diagnostic profile', () => {
    const { bootstrap, choices } = fixture();
    const missing = {
      ...choices,
      diagnosticProfile: { id: 'missing-diagnostic-profile', revision: '1' },
    };

    expect(() => buildSavedFullAssemblyGenericFirstCompileRequestV1(bootstrap, missing)).toThrow(
      /diagnostic preview profile/,
    );
    expect(SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1).toMatchObject({
      continuumMaterialInferred: false,
      placementInferred: false,
      v6ArrangementPromoted: false,
    });
  });
});
