import type { TechCardSeamAnchor } from 'api/proto-http/common';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { anchorOfRunId } from 'lib/seams/anchor';
import { anchorToWire } from 'lib/seams/wire';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPatternImportDxfPhaseEExactAnchorEdgeV1 } from './cad-table-zero-connect-exact-anchor-geometry-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import {
  prepareSavedTaggedNativeStitchRangeV1,
  readSavedNativeStraightStitchPathsV1,
} from './saved-legacy-native-stitch-run-v8';
import { createSavedNativeSewingAuthoringViewV1 } from './saved-native-sewing-authoring-view-v1';

async function fixture() {
  const seed = await createSavedThreePanelFixtureV1();
  const { native, dispose } = await createSavedThreePanelSourceV1(seed, true);
  try {
    const { row } = native;
    const owned = consumeDxfProductSavedNativeCompilerSourceV1(native.sourceOwner, {
      schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
      sourceFileId: native.sourceFileId,
      sourceSha256: row.sha256,
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      patternLineKey: row.patternLineKey,
      cardLockVersion: row.cardLockVersion,
      draft: native.draft,
    });
    if (!owned.ok) throw new Error(JSON.stringify(owned.blockers));

    const sizeToken = 'M';
    const nativeDraft = createSavedNativeSewingAuthoringViewV1(
      native.draft,
      native.nativeSewingReplay,
      row.sha256,
    );
    const [built, selected] = await Promise.all([
      buildPatternImportDxfProductPhaseEAuthoringCatalogV1(nativeDraft, row.scopeKey, sizeToken),
      selectPatternImportDxfProductDraftPhaseDSizeV1(nativeDraft, row.scopeKey, sizeToken),
    ]);
    if (!built.ok || !selected.ok) throw new Error('Current saved native fixture unavailable.');
    const { catalog } = built;
    const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog, selected.selection);
    const carrier = nativeDraft.dxfPhaseDReplay?.carrier;
    if (!projected.ok || !carrier) throw new Error('No signed native projection for the fixture.');

    const piece = catalog.pieces.find(({ pieceId }) => pieceId === 'FRONT')!;
    const contour = piece.contours.find(({ role }) => role === 'sewing-boundary')!;
    const authored = carrier.contours.find(({ contourId }) => contourId === contour.contourId)!;
    const raw = carrier.source.paths.find(
      ({ pathId }) => pathId === authored.lineage.sourcePathIds[0],
    )!;
    const path: SavedAssemblyNativeSewingPathV1 = {
      row,
      sourceFileId: carrier.sourceFileId,
      sizeToken,
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      blockName: 'FRONT',
      contourId: contour.contourId,
      nativePathId: raw.pathId,
      sourceInstancePath: raw.provenance.instancePath,
      nativePointsMm: raw.pointsMm,
      vertexIds: raw.provenance.samples.map(({ vertexId }) => vertexId),
      lineage: authored.lineage,
    };
    const signed = await readSavedNativeStraightStitchPathsV1(
      Uint8Array.from(seed.bytes),
      path,
      [path.nativePathId],
      new AbortController().signal,
    );
    const from = contour.boundaryVertices.at(-1)!.vertexId;
    const to = contour.boundaryVertices[0]!.vertexId;
    const wire = (reversed: boolean): TechCardSeamAnchor => {
      const edge = buildPatternImportDxfPhaseEExactAnchorEdgeV1(
        {
          pieceId: path.pieceId,
          pieceLineKey: path.pieceLineKey,
          contourId: path.contourId,
          boundaryVertexIds: reversed ? [to, from] : [from, to],
        },
        catalog,
        projected.projection,
      );
      if (!edge.ok) throw new Error(JSON.stringify(edge.blocker));
      const anchor = anchorOfRunId([edge.piece], edge.target);
      if (!anchor) throw new Error('The existing authoring serializer rejected the fixture.');
      const encoded = anchorToWire(anchor);
      return { ...encoded, placement: encoded.placement, layer: encoded.layer };
    };
    return {
      owned: owned.value,
      path,
      from,
      to,
      forward: wire(false),
      reverse: wire(true),
      descriptors: signed.descriptors,
    };
  } finally {
    dispose();
  }
}

describe('tagged saved native L14 range replay', () => {
  let saved: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => {
    saved = await fixture();
  });

  it('preserves the exact closing native curve, raw interval and authored direction', async () => {
    const { owned, path, from, to, forward, reverse, descriptors } = saved;
    const resolve = await prepareSavedTaggedNativeStitchRangeV1(
      owned,
      path.sizeToken,
      new AbortController().signal,
    );
    const full = resolve(path, forward, descriptors);
    const partial = resolve(path, { ...reverse, rangeFrom: 0.2, rangeTo: 0.6 }, descriptors);
    expect(full.fullRunVertexIds).toEqual([from, to]);
    expect(partial.fullRunVertexIds).toEqual([to, from]);
    expect(full.intervals).toHaveLength(1);
    expect(partial.intervals).toHaveLength(1);
    const wholeEdge = full.intervals[0]!;
    const subrange = partial.intervals[0]!;
    expect(wholeEdge.nativeCurveId).toBe(subrange.nativeCurveId);
    expect(subrange.t0).toBeCloseTo(wholeEdge.t0 + 0.8 * (wholeEdge.t1 - wholeEdge.t0), 14);
    expect(subrange.t1).toBeCloseTo(wholeEdge.t0 + 0.4 * (wholeEdge.t1 - wholeEdge.t0), 14);
    expect(partial.nativeLengthMm).toBeCloseTo(full.nativeLengthMm * 0.4, 12);
  });

  it('refuses a changed full wire, source, occurrence or read generation', async () => {
    const { owned, path, forward, descriptors } = saved;
    const controller = new AbortController();
    const resolve = await prepareSavedTaggedNativeStitchRangeV1(
      owned,
      path.sizeToken,
      controller.signal,
    );
    const changedSamples = forward.samples!.map((sample, i) =>
      i === 2 ? { ...sample, u: (sample.u ?? 0) + 0.01 } : sample,
    );
    expect(() => resolve(path, { ...forward, samples: changedSamples }, descriptors)).toThrow(
      'fingerprint',
    );
    expect(() =>
      resolve(path, { ...forward, contourSig: 'ffffffffffffffff' }, descriptors),
    ).toThrow('fingerprint');
    expect(() =>
      resolve(
        path,
        { ...forward, edgeHint: forward.edgeHint!.replace('#dxf:0:', '#dxf:1:') },
        descriptors,
      ),
    ).toThrow('locator');
    expect(() =>
      resolve(
        { ...path, row: { ...path.row, revision: path.row.revision + 1 } },
        forward,
        descriptors,
      ),
    ).toThrow('current native row');
    expect(() => resolve({ ...path, sizeToken: 'S' }, forward, descriptors)).toThrow(
      'current native row',
    );
    expect(() =>
      resolve(
        path,
        forward,
        descriptors.map((edge, i) => (i === 0 ? { ...edge, instancePath: [] } : edge)),
      ),
    ).toThrow('occurrence');
    controller.abort();
    expect(() => resolve(path, forward, descriptors)).toThrow();
  });
});
