import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { CheckboxCommon } from 'ui';
import { OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1 } from 'lib/cloth/domain/observed-bounded-radial-initialization-v1';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SavedObservedPlacementAuthoringV1,
  SavedObservedRadialInitializationChoiceV1,
  createSavedObservedPlacementSubmissionV1,
  savedObservedPlacementAuthoringKeyV1,
  type SavedObservedPlacementAuthoringPropsV1,
} from './saved-observed-placement-authoring-v1';
import { SavedPlacementGarmentRoleEditorV1 } from './saved-placement-garment-role-editor-v1';
import {
  createQualifiedTwoPanelObservedPlacementDraftV1 as create,
  confirmQualifiedTwoPanelObservedPlacementDraftV1 as confirm,
  type QualifiedTwoPanelObservedPlacementAuthoringInputV1 as Input,
  type QualifiedTwoPanelObservedPlacementDraftV1 as Draft,
} from './qualified-two-panel-observed-placement-authoring-v1';
import { createObservedPlacementPairCubeBodyFixtureV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from './saved-model-observed-placement-target-v1';

const hashGate = vi.hoisted(() => ({
  enabled: false,
  entered: null as (() => void) | null,
  wait: null as Promise<void> | null,
}));
vi.mock('lib/features/sha256', async (original) => {
  const actual = await original<typeof import('lib/features/sha256')>();
  return {
    ...actual,
    sha256Hex: async (bytes: Parameters<typeof actual.sha256Hex>[0]) => {
      if (hashGate.enabled) {
        hashGate.enabled = false;
        hashGate.entered?.();
        await hashGate.wait;
      }
      return actual.sha256Hex(bytes);
    },
  };
});
afterEach(() => {
  hashGate.enabled = false;
  hashGate.entered = null;
  hashGate.wait = null;
});
function gateHash() {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((done) => {
    entered = done;
  });
  hashGate.wait = new Promise<void>((done) => {
    release = done;
  });
  hashGate.entered = entered;
  hashGate.enabled = true;
  return { ready, release };
}
// Synthetic exact provenance fixture + genuine observed cube target. UI/intent/lifetime evidence,
// not garment/body qualification, persistence, React browser mounting or runtime acceptance.
async function fixture() {
  const body = await createObservedPlacementPairCubeBodyFixtureV1();
  const target = await projectSavedModelObservedPlacementTargetV1(body.bodyOwner, body.binding);
  if (!target.ok) throw new Error(target.detail);
  const sample = ['c0', 'c1', 'c1', 'c2', 'c3', 'c3'].map((sourceCurveId, vertexIndex) => ({
    pieceId: 'FRONT',
    contourId: 'front',
    sourceCurveId,
    vertexIndex,
    normalizedArc: vertexIndex / 6,
    sourceCurveT: 0,
  }));
  const projection = {
    composerCanonicalSha256: 'a'.repeat(64),
    phase2ArtifactSha256: 'b'.repeat(64),
    mesh: {
      restPositions2Mm: new Float32Array([
        0, 0, 1, 0, 2, 0, 2, 1, 1, 2, 0, 1, 3, 0, 4, 0, 5, 0, 5, 1, 4, 2, 3, 1,
      ]),
      pieceRanges: [
        { pieceId: 'FRONT', vertexOffset: 0, vertexCount: 6 },
        { pieceId: 'BACK', vertexOffset: 6, vertexCount: 6 },
      ],
      seams: [{ seamId: 'left' }, { seamId: 'right' }],
      boundarySamples: [
        ...sample,
        ...sample.map((s) => ({
          ...s,
          pieceId: 'BACK',
          contourId: 'back',
          vertexIndex: s.vertexIndex + 6,
        })),
      ],
    },
  } as unknown as Input['composerProjection'];
  const snapshot = {
    seal: { canonicalSha256: 'a'.repeat(64) },
    seals: { phase2ArtifactSha256: 'b'.repeat(64) },
    mesh: { pieceCount: 2, seamCount: 2 },
    assembly: { pieceIds: ['FRONT', 'BACK'], seamIds: ['left', 'right'] },
  } as unknown as Input['composerSnapshot'];
  const roles = (contour: string) =>
    Object.fromEntries(
      [
        ['waist', 'c0'],
        ['hem', 'c2'],
        ['leftSeam', 'c1'],
        ['rightSeam', 'c3'],
      ].map(([role, curve]) => [
        role,
        {
          firstCurveKey: JSON.stringify([contour, curve]),
          lastCurveKey: JSON.stringify([contour, curve]),
          traversal: 'forward',
        },
      ]),
    ) as Draft['boundaries']['front'];
  const draft = {
    ...create(snapshot.seal.canonicalSha256, target.canonicalSha256),
    frontPieceId: 'FRONT',
    backPieceId: 'BACK',
    leftSeamId: 'left',
    rightSeamId: 'right',
    boundaries: { front: roles('front'), back: roles('back') },
    annularProfileReviewed: true,
  };
  const input: Input = {
    composerSnapshot: snapshot,
    composerProjection: projection,
    draft,
    observedTarget: {
      target: structuredClone(target.target),
      canonicalSha256: target.canonicalSha256,
    },
  };
  return { body, input, target };
}

describe('observed placement authoring UI and submission', () => {
  it('renders blank roles/profile with disabled controls until a current observed target exists', async () => {
    const f = await fixture();
    try {
      const onConfirmedIntent = vi.fn(async () => {});
      const props = { ...f.input, observedTarget: null, onConfirmedIntent };
      const html = renderToStaticMarkup(<SavedObservedPlacementAuthoringV1 {...props} />);
      expect(html).toContain('Confirm target and save placement');
      expect(html).toMatch(/<button[^>]*disabled[^>]*>Confirm target and save placement/);
      expect(html).toContain('data-placement-choice="placement-front"');
      expect(html).not.toContain('A-rest');
      expect(html).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="false"[^>]*disabled/);
      expect(html).toContain('Allow up to 1% initial stretch for clearance');
      expect(html).toContain('Saved with placement. Pattern dimensions stay unchanged.');
      expect(html).not.toContain('data-source-curve-id=');
      const controls = html.match(/<button[^>]*role="combobox"[^>]*>/g) ?? [];
      expect(controls.length).toBeGreaterThan(4);
      expect(controls.every((control) => control.includes('disabled=""'))).toBe(true);
      expect(onConfirmedIntent).not.toHaveBeenCalled();
      const enabled = renderToStaticMarkup(
        <SavedObservedPlacementAuthoringV1 {...props} observedTarget={f.input.observedTarget} />,
      );
      expect(enabled).toContain('current pose.');
      expect(enabled).toContain('female body');
      expect(enabled).toMatch(/<button[^>]*disabled[^>]*>Confirm target and save placement/);
    } finally {
      f.body.dispose();
    }
  });
  it('uses the existing pointer/keyboard checkbox contract and clears confirmation before submitting the changed allowance', async () => {
    const f = await fixture();
    const submission = createSavedObservedPlacementSubmissionV1(() => true);
    let draft = confirm(f.input.draft);
    const update = (apply: (previous: Draft) => Draft) => {
      draft = apply(draft);
    };
    const checkbox = (disabled: boolean) => {
      const choice = SavedObservedRadialInitializationChoiceV1({
        draft,
        disabled,
        onChange: update,
      });
      const label = Children.toArray(choice.props.children).find(
        (child): child is ReactElement<{ children: ReactNode }> =>
          isValidElement<{ children: ReactNode }>(child) && child.type === 'label',
      );
      if (!label) throw new Error('Expected associated visible checkbox label.');
      const control = Children.toArray(label.props.children).find(
        (child): child is ReactElement<Parameters<typeof CheckboxCommon>[0]> =>
          isValidElement<Parameters<typeof CheckboxCommon>[0]>(child) &&
          child.type === CheckboxCommon,
      );
      if (!control) throw new Error('Expected the existing accessible checkbox primitive.');
      return control;
    };
    try {
      const initial = checkbox(false);
      expect(initial.props.checked).toBe(false);
      expect(initial.props.disabled).toBe(false);
      expect(initial.props['aria-label']).toBe('Allow up to 1% initial stretch for clearance');
      const html = renderToStaticMarkup(initial);
      expect(html).toContain('role="checkbox"');
      expect(html).toContain('aria-checked="false"');
      // Exercise the real shared checked-change entry supplied to Radix for click/Space. This is
      // CPU component/event-contract evidence, not a browser-generated keyboard or pointer event.
      const nativeControl = CheckboxCommon(initial.props);
      expect(nativeControl.props.onKeyDown).toBeUndefined();
      nativeControl.props.onCheckedChange(true);
      expect(draft.allowBoundedRadialInitialization).toBe(true);
      expect(draft.confirmation).toBeNull();
      expect(draft.boundaries).toEqual(f.input.draft.boundaries);
      expect(draft.observedTargetSha256).toBe(f.target.canonicalSha256);
      expect(renderToStaticMarkup(checkbox(false))).toContain('aria-checked="true"');
      const publish = vi.fn<SavedObservedPlacementAuthoringPropsV1['onConfirmedIntent']>(
        async () => {},
      );
      expect(await submission.submit({ ...f.input, draft }, publish)).toEqual({
        status: 'submitted',
      });
      expect(publish.mock.calls[0]![0].policy).toMatchObject(
        OBSERVED_BOUNDED_RADIAL_INITIALIZATION_POLICY_V1,
      );
      draft = confirm(draft);
      CheckboxCommon(checkbox(false).props).props.onCheckedChange(false);
      expect(draft.allowBoundedRadialInitialization).toBe(false);
      expect(draft.confirmation).toBeNull();
      const unchanged = draft;
      const locked = checkbox(true);
      expect(locked.props.disabled).toBe(true);
      CheckboxCommon(locked.props).props.onCheckedChange(true);
      expect(draft).toBe(unchanged);
    } finally {
      submission.dispose();
      f.body.dispose();
    }
  });

  it('keeps detached-read keys stable but resets choices for changed source or target seals', async () => {
    const f = await fixture();
    try {
      const props = { ...f.input, onConfirmedIntent: async () => {} };
      const before = savedObservedPlacementAuthoringKeyV1(props);
      expect(
        savedObservedPlacementAuthoringKeyV1({
          ...props,
          composerSnapshot: structuredClone(props.composerSnapshot),
          observedTarget: structuredClone(props.observedTarget),
        }),
      ).toBe(before);
      expect(
        savedObservedPlacementAuthoringKeyV1({
          ...props,
          observedTarget: { ...f.target, canonicalSha256: 'e'.repeat(64) },
        }),
      ).not.toBe(before);
      expect(
        savedObservedPlacementAuthoringKeyV1({
          ...props,
          composerProjection: {
            ...props.composerProjection,
            composerCanonicalSha256: 'f'.repeat(64),
          },
        }),
      ).not.toBe(before);
    } finally {
      f.body.dispose();
    }
  });
  it('reuses exact source-curve controls, source IDs and keyboard paths', async () => {
    const f = await fixture();
    try {
      const html = renderToStaticMarkup(
        <SavedPlacementGarmentRoleEditorV1
          composerSnapshot={f.input.composerSnapshot}
          composerProjection={f.input.composerProjection}
          draft={f.input.draft}
          locked={false}
          onChange={() => {}}
        />,
      );
      expect(html).toContain('data-source-curve-id="c0"');
      expect(html).toContain('data-contour-id="front"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('placement-front-waist-first');
      expect(html).toContain('Contour traversal');
      expect(html).toContain('stroke-highlightColor');
    } finally {
      f.body.dispose();
    }
  });
  it('confirms only the explicit draft and emits the exact current observed target SHA through the real builder', async () => {
    const f = await fixture();
    try {
      expect(f.input.draft.confirmation).toBeNull();
      const publish = vi.fn<SavedObservedPlacementAuthoringPropsV1['onConfirmedIntent']>(
        async () => {},
      );
      const submission = createSavedObservedPlacementSubmissionV1(() => true);
      expect(await submission.submit(f.input, publish)).toEqual({ status: 'submitted' });
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish.mock.calls[0]![0]).toMatchObject({
        confirmedTargetSha256: f.target.canonicalSha256,
      });
      expect(Object.keys(publish.mock.calls[0]![0]!).sort()).toEqual([
        'annularParameters',
        'confirmedTargetSha256',
        'garment',
        'policy',
      ]);
      expect(f.input.draft.confirmation).toBeNull();
      submission.dispose();
    } finally {
      f.body.dispose();
    }
  });
  it.each(['disposed', 'target-changed'] as const)(
    'does not start the host save after async validation becomes %s',
    async (reason) => {
      const f = await fixture();
      let current = true;
      const submission = createSavedObservedPlacementSubmissionV1(() => current);
      try {
        const publish = vi.fn<SavedObservedPlacementAuthoringPropsV1['onConfirmedIntent']>(
          async () => {},
        );
        const gate = gateHash();
        const work = submission.submit(f.input, publish);
        await gate.ready;
        if (reason === 'disposed') submission.dispose();
        else current = false;
        gate.release();
        expect(await work).toEqual({ status: 'stale' });
        expect(publish).not.toHaveBeenCalled();
      } finally {
        submission.dispose();
        f.body.dispose();
      }
    },
  );
  it('rejects duplicate submission during hashing and preserves an explicit host save failure', async () => {
    const f = await fixture();
    const submission = createSavedObservedPlacementSubmissionV1(() => true);
    try {
      const publish = vi.fn(async () => {
        throw new Error('Save outcome unknown. Reload placement.');
      });
      const gate = gateHash();
      const work = submission.submit(f.input, publish);
      await gate.ready;
      expect(await submission.submit(f.input, publish)).toEqual({ status: 'pending' });
      gate.release();
      expect(await work).toEqual({
        status: 'failed',
        detail: 'Save outcome unknown. Reload placement.',
      });
      expect(publish).toHaveBeenCalledTimes(1);
    } finally {
      submission.dispose();
      f.body.dispose();
    }
  });
  it('keeps invalid exact selections inside the UI and never calls the save host', async () => {
    const f = await fixture();
    const submission = createSavedObservedPlacementSubmissionV1(() => true);
    try {
      const publish = vi.fn<SavedObservedPlacementAuthoringPropsV1['onConfirmedIntent']>(
        async () => {},
      );
      const result = await submission.submit(
        { ...f.input, draft: { ...f.input.draft, frontPieceId: 'BACK' } },
        publish,
      );
      expect(result.status).toBe('failed');
      expect(publish).not.toHaveBeenCalled();
    } finally {
      submission.dispose();
      f.body.dispose();
    }
  });
});
