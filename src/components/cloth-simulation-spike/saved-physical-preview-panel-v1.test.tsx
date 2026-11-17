import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1,
  type PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench/assembly-order-entry';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import { PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import { createPatternImportDxfProductSavedPhysicalSessionV1 } from './pattern-import-dxf-product-saved-physical-session-v1';
import {
  SavedPhysicalPreviewPanelV1,
  savedPhysicalPreviewCompileKeyV1,
} from './saved-physical-preview-panel-v1';
import {
  SavedPhysicalPlacementAuthoringV1,
  savedPhysicalPlacementAuthoringKeyV1,
  type SavedPhysicalPlacementAuthoringPropsV1,
} from './saved-physical-placement-authoring-v1';

let owner: PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1;
let row: DxfProductSavedRowIdentityV1;

beforeAll(async () => {
  const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
  row = seed.row;
  owner = createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1(async () => ({
    createPatternImportDxfProductSavedGarmentMeshCompileSessionV1:
      createPatternImportDxfProductSavedPhysicalSessionV1,
  }));
  const signal = new AbortController().signal;
  await owner.downstream.ready(signal);
  await withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    async (inputs) => {
      await owner.downstream.consume(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
          sourceOwner: inputs.sourceOwner,
          compositionRequest: inputs.compositionRequest,
          targetEdgeMm: inputs.targetEdgeMm,
        },
        signal,
      );
    },
  );
  expect(owner.latestCompile()?.composerSnapshot.origin).toBe('verified-saved-row');
  expect(owner.physicalStage()?.status).toBe('local-frame-ready');
}, 120_000);

afterAll(() => owner?.dispose());

describe('saved physical panel CPU rendering and source lifetime', () => {
  it('renders nothing before a genuine saved compile and does not load the physical module', () => {
    const load = vi.fn(async () => ({
      createPatternImportDxfProductSavedGarmentMeshCompileSessionV1:
        createPatternImportDxfProductSavedPhysicalSessionV1,
    }));
    const empty = createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1(load);
    try {
      expect(renderToStaticMarkup(<SavedPhysicalPreviewPanelV1 owner={empty} row={row} />)).toBe(
        '',
      );
      expect(load).not.toHaveBeenCalled();
    } finally {
      empty.dispose();
    }
  });

  it('requires an explicit canonical choice and fresh placement before enabling bounded execution', () => {
    const html = renderToStaticMarkup(<SavedPhysicalPreviewPanelV1 owner={owner} row={row} />);
    expect(html).toContain('Use canonical medium');
    expect(html).toMatch(/<button[^>]*aria-pressed="false"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Run 32 frames<\/button>/);
    expect(html).toContain('Reading saved placement');
    expect(html).not.toContain('Saved placement verified');
    expect(html).not.toContain('Canonical medium mannequin used for this cloth preview');
    expect(html).not.toContain('32 frames complete');
    expect(html).not.toContain('Play');
    expect(html).not.toContain('Pause');
    expect(owner.physicalStage()?.status).toBe('local-frame-ready');
    expect(owner.projectLatestActualBody()).toBeNull();
  });

  it('keeps the context key stable for detached compile clones and harmless owner notifications', () => {
    const first = owner.latestCompile()!;
    const second = owner.latestCompile()!;
    expect(first).not.toBe(second);
    const key = savedPhysicalPreviewCompileKeyV1(row, first);
    expect(savedPhysicalPreviewCompileKeyV1({ ...row }, second)).toBe(key);
    expect(owner.stopBetaPreview()).toBe(false);
    expect(savedPhysicalPreviewCompileKeyV1(row, owner.latestCompile()!)).toBe(key);
  });

  it('locks every authoring choice until a target is available and retains actual target resets', () => {
    const compiled = owner.latestCompile()!;
    const props: SavedPhysicalPlacementAuthoringPropsV1 = {
      composerSnapshot: compiled.composerSnapshot,
      composerProjection: owner.projectLatest()!,
      bodyTarget: null,
      onConfirmedIntent: vi.fn(async () => {}),
    };
    const html = renderToStaticMarkup(<SavedPhysicalPlacementAuthoringV1 {...props} />);
    const controls = [...html.matchAll(/<button\b[^>]*role="combobox"[^>]*>/g)];
    expect(controls).toHaveLength(29);
    for (const [control] of controls) expect(control).toContain('disabled=""');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Clear choices<\/button>/);
    expect(html).toContain('Select a current neutral A-rest body to confirm placement.');

    // Presentation identity only: this DTO never impersonates display admission or runtime.
    // The production panel obtains it solely from its genuine admitted body's projection.
    const bodyTarget: NonNullable<SavedPhysicalPlacementAuthoringPropsV1['bodyTarget']> = {
      providerId: 'canonical-presentation-target',
      providerRevision: 'revision-1',
      bodyId: 'canonical-presentation-target',
      bodyRevision: 'revision-1',
      poseKind: 'A',
      poseRevision: 'a-rest',
      collisionLodId: 'rendered-body-13380v-26756t',
      landmarks: {
        revision: 'revision-1:landmarks-v1',
        waistCenterId: 'waist-center',
        hipLeftId: 'hip-left',
        hipRightId: 'hip-right',
      },
    };
    const ready = { ...props, bodyTarget };
    const readyHtml = renderToStaticMarkup(<SavedPhysicalPlacementAuthoringV1 {...ready} />);
    const enabled = [...readyHtml.matchAll(/<button\b[^>]*role="combobox"[^>]*>/g)].filter(
      ([control]) => !control.includes('disabled=""'),
    );
    // The four piece/seam roles and profile open; boundary spans still need an exact piece.
    expect(enabled).toHaveLength(5);
    expect(readyHtml).toMatch(/<button[^>]*disabled=""[^>]*>Save canonical placement<\/button>/);
    expect(savedPhysicalPlacementAuthoringKeyV1(ready)).not.toBe(
      savedPhysicalPlacementAuthoringKeyV1(props),
    );
    expect(
      savedPhysicalPlacementAuthoringKeyV1({ ...ready, bodyTarget: structuredClone(bodyTarget) }),
    ).toBe(savedPhysicalPlacementAuthoringKeyV1(ready));
    expect(
      savedPhysicalPlacementAuthoringKeyV1({
        ...ready,
        bodyTarget: { ...bodyTarget, bodyRevision: 'revision-2' },
      }),
    ).not.toBe(savedPhysicalPlacementAuthoringKeyV1(ready));
    expect(props.onConfirmedIntent).not.toHaveBeenCalled();
    expect(owner.projectLatestActualBody()).toBeNull();
  });

  it('reads the published one-shot latch on every new mount even after placement invalidation', () => {
    // Presentation-only simulation of a published consumed latch. The real private latch and
    // invalidate/stop behavior are exercised with genuine bodies/runtime in displayed-body.test.
    const consumedView: PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 = {
      ...owner,
      physicalStage: () => ({
        ...owner.physicalStage()!,
        status: 'local-frame-ready',
        runtimeSourceConsumed: true,
      }),
    };
    for (let mount = 0; mount < 2; mount += 1) {
      const html = renderToStaticMarkup(
        <SavedPhysicalPreviewPanelV1 owner={consumedView} row={row} />,
      );
      expect(html).toContain('Reconfirm the saved assembly to start a fresh simulation.');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Run 32 frames<\/button>/);
    }
    expect(owner.physicalStage()?.runtimeSourceConsumed).toBe(false);
  });

  it('invalidates the view for every saved source identity field, generation and composer seal', () => {
    const compiled = owner.latestCompile()!;
    const key = savedPhysicalPreviewCompileKeyV1(row, compiled);
    for (const field of Object.keys(row) as (keyof typeof row)[]) {
      const changed = {
        ...row,
        [field]: typeof row[field] === 'number' ? Number(row[field]) + 1 : `${row[field]}-changed`,
      };
      expect(savedPhysicalPreviewCompileKeyV1(changed, compiled), field).not.toBe(key);
    }
    expect(
      savedPhysicalPreviewCompileKeyV1(row, { ...compiled, generation: compiled.generation + 1 }),
    ).not.toBe(key);
    const resealed = structuredClone(compiled);
    Object.defineProperty(resealed.composerSnapshot.seal, 'canonicalSha256', {
      value: 'f'.repeat(64),
    });
    expect(savedPhysicalPreviewCompileKeyV1(row, resealed)).not.toBe(key);
  });

  it('keeps production mounting lazy and the new UI free of fixture or shared-owner disposal paths', () => {
    const source = readFileSync(
      new URL('./saved-physical-preview-panel-v1.tsx', import.meta.url),
      'utf8',
    );
    const entry = readFileSync(
      new URL(
        '../managers/tech-card/components/pattern-import/phase-e-workbench/assembly-order-entry.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    const controls = readFileSync(
      new URL('./saved-cloth-physical-controls-v1.tsx', import.meta.url),
      'utf8',
    );
    expect(controls).toContain("import('./saved-physical-preview-panel-v1')");
    expect(controls).toContain('const CanonicalPanel = lazy(');
    expect(entry).toContain('SavedClothPhysicalControlsV1');
    expect(entry).toContain('physicalHost={physicalHost}');
    expect(source).not.toContain('.test-fixture');
    expect(source).not.toContain('owner.dispose(');
    expect(source).not.toContain('createBetaSkirtG3b2');
    expect(source).toContain('owner.stopBetaPreview()');
    expect(source).toContain('isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(displayedBody)');
  });
});
