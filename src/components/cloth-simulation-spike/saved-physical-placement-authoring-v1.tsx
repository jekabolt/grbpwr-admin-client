import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, GroupLabel, Text } from 'ui';
import type { PatternImportDxfProductConfirmedAnnularIntentV1 } from 'lib/cloth/domain/pattern-import-dxf-product-confirmed-annular-intent-v1';
import type { DxfProductTwoPanelSkirtPlacementSemanticsRequestV1 } from 'lib/cloth/domain/dxf-product-two-panel-skirt-placement-semantics-v1';
import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildQualifiedTwoPanelPlacementIntentV1,
  createQualifiedTwoPanelPlacementDraftV1,
} from './qualified-two-panel-placement-authoring-v1';
import {
  SavedPlacementChoiceV1 as Choice,
  SavedPlacementGarmentRoleEditorV1,
  SavedAnnularPlacementProfileDetailsV1,
} from './saved-placement-garment-role-editor-v1';

export type SavedPhysicalPlacementAuthoringPropsV1 = Readonly<{
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  composerProjection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  bodyTarget: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['body'] | null;
  onConfirmedIntent: (intent: PatternImportDxfProductConfirmedAnnularIntentV1) => Promise<void>;
  disabled?: boolean;
}>;

/** Value keys clear draft choices on actual source/target changes, never on a detached clone. */
export function savedPhysicalPlacementAuthoringKeyV1(
  props: SavedPhysicalPlacementAuthoringPropsV1,
) {
  return JSON.stringify([
    props.composerSnapshot.seal.canonicalSha256,
    props.composerProjection.composerCanonicalSha256,
    props.composerProjection.phase2ArtifactSha256,
    props.bodyTarget,
  ]);
}

export function SavedPhysicalPlacementAuthoringV1(props: SavedPhysicalPlacementAuthoringPropsV1) {
  return <CurrentAuthoring key={savedPhysicalPlacementAuthoringKeyV1(props)} {...props} />;
}

function CurrentAuthoring({
  composerSnapshot,
  composerProjection,
  bodyTarget,
  onConfirmedIntent,
  disabled = false,
}: SavedPhysicalPlacementAuthoringPropsV1) {
  const [draft, setDraft] = useState(() =>
    createQualifiedTwoPanelPlacementDraftV1(composerSnapshot.seal.canonicalSha256),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const pendingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Admission changes the target key and intentionally clears this draft. Do not accept
  // choices while that target is still absent, or the first accepted body would erase them.
  const locked = !bodyTarget || disabled || pending;
  const confirmation = useMemo(() => {
    try {
      return {
        intent: buildQualifiedTwoPanelPlacementIntentV1({
          composerSnapshot,
          composerProjection,
          draft: { ...draft, neutralTargetConfirmed: true },
          bodyTarget,
        }),
        detail: null,
      };
    } catch (cause) {
      return {
        intent: null,
        detail: cause instanceof Error ? cause.message : 'Complete the explicit garment roles.',
      };
    }
  }, [composerSnapshot, composerProjection, draft, bodyTarget]);
  const submit = async () => {
    if (pendingRef.current || locked || !confirmation.intent) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirmedIntent(confirmation.intent);
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : 'Placement could not be saved.');
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <div
      className='flex flex-col gap-stack'
      role='group'
      aria-label='Canonical placement authoring'
      data-saved-placement-authoring-v1=''
    >
      <SavedPlacementGarmentRoleEditorV1
        composerSnapshot={composerSnapshot}
        composerProjection={composerProjection}
        draft={draft}
        locked={locked}
        description='Choose the exact pieces, Assembly seams and source-curve spans. The canonical profile supports FRONT and BACK with 40 waist curves, 50 hem curves and one curve per side seam.'
        onChange={(update) => {
          setError(null);
          setDraft((previous) => ({ ...previous, ...update(previous) }));
        }}
      />
      <GroupLabel>Placement profile</GroupLabel>
      <Choice
        name='placement-profile'
        label='Reviewed profile'
        value={draft.canonicalProfileReviewed ? 'canonical-annular' : ''}
        items={[
          { value: 'canonical-annular', label: 'Canonical annular · 700 / 900 mm · 0.64 rad' },
        ]}
        disabled={locked}
        onChange={(value) =>
          setDraft((previous) => ({
            ...previous,
            canonicalProfileReviewed: value === 'canonical-annular',
          }))
        }
      />
      <SavedAnnularPlacementProfileDetailsV1 />
      <Text>
        {bodyTarget
          ? 'Placement target: the displayed canonical medium mannequin in A-rest.'
          : 'Select a current neutral A-rest body to confirm placement.'}
      </Text>
      {error ? (
        <Text variant='errorLabel' role='alert'>
          {error}
        </Text>
      ) : null}
      {confirmation.detail ? (
        <Text variant='label' role='status'>
          {confirmation.detail}
        </Text>
      ) : null}
      <div className='flex flex-wrap items-center gap-stack'>
        <Button
          type='button'
          size='sm'
          variant='main'
          disabled={locked || !confirmation.intent}
          onClick={() => {
            void submit();
          }}
        >
          {pending ? 'Saving placement…' : 'Save canonical placement'}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={locked}
          onClick={() => {
            setDraft(
              createQualifiedTwoPanelPlacementDraftV1(composerSnapshot.seal.canonicalSha256),
            );
            setError(null);
          }}
        >
          Clear choices
        </Button>
      </div>
    </div>
  );
}
