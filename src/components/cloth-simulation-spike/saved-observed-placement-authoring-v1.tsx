import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, CheckboxCommon, GroupLabel, Text } from 'ui';
import {
  buildQualifiedTwoPanelObservedPlacementIntentV1,
  confirmQualifiedTwoPanelObservedPlacementDraftV1,
  createQualifiedTwoPanelObservedPlacementDraftV1,
  type QualifiedTwoPanelObservedPlacementDraftV1,
  type QualifiedTwoPanelObservedPlacementAuthoringInputV1,
  type QualifiedTwoPanelObservedPlacementIntentV1,
} from './qualified-two-panel-observed-placement-authoring-v1';
import { qualifiedTwoPanelPlacementAuthoringInternalsV1 } from './qualified-two-panel-placement-authoring-v1';
import {
  SavedAnnularPlacementProfileDetailsV1,
  SavedPlacementChoiceV1,
  SavedPlacementGarmentRoleEditorV1,
} from './saved-placement-garment-role-editor-v1';

export type SavedObservedPlacementAuthoringPropsV1 = Readonly<{
  composerSnapshot: QualifiedTwoPanelObservedPlacementAuthoringInputV1['composerSnapshot'];
  composerProjection: QualifiedTwoPanelObservedPlacementAuthoringInputV1['composerProjection'];
  observedTarget: QualifiedTwoPanelObservedPlacementAuthoringInputV1['observedTarget'];
  onConfirmedIntent: (intent: QualifiedTwoPanelObservedPlacementIntentV1) => Promise<void>;
  disabled?: boolean;
}>;

/** Cloned reads retain choices; an actual source or displayed-target change clears them. */
export function savedObservedPlacementAuthoringKeyV1(
  props: SavedObservedPlacementAuthoringPropsV1,
) {
  return JSON.stringify([
    props.composerSnapshot.seal.canonicalSha256,
    props.composerProjection.composerCanonicalSha256,
    props.composerProjection.phase2ArtifactSha256,
    props.observedTarget?.canonicalSha256 ?? null,
  ]);
}

type SubmissionResult =
  | Readonly<{ status: 'submitted' }>
  | Readonly<{ status: 'pending' | 'stale' }>
  | Readonly<{ status: 'failed'; detail: string }>;

/** Local UI submission only. No body, persistence or runtime capability is issued here.
 * The host owns cancellation and write outcomes once onConfirmedIntent starts. */
export function createSavedObservedPlacementSubmissionV1(isCurrent: () => boolean) {
  let disposed = false;
  let pending = false;
  const current = () => {
    if (disposed) return false;
    try {
      return isCurrent() && !disposed;
    } catch {
      return false;
    }
  };
  return Object.freeze({
    async submit(
      input: QualifiedTwoPanelObservedPlacementAuthoringInputV1,
      onConfirmedIntent: SavedObservedPlacementAuthoringPropsV1['onConfirmedIntent'],
    ): Promise<SubmissionResult> {
      if (!current()) return { status: 'stale' };
      if (pending) return { status: 'pending' };
      pending = true;
      try {
        // This method is called only from the explicit confirm-and-save action.
        const intent = await buildQualifiedTwoPanelObservedPlacementIntentV1({
          ...input,
          draft: confirmQualifiedTwoPanelObservedPlacementDraftV1(input.draft),
        });
        if (!current()) return { status: 'stale' };
        await onConfirmedIntent(intent);
        return current() ? { status: 'submitted' } : { status: 'stale' };
      } catch (cause) {
        return current()
          ? {
              status: 'failed',
              detail: cause instanceof Error ? cause.message : 'Placement could not be saved.',
            }
          : { status: 'stale' };
      } finally {
        pending = false;
      }
    },
    dispose() {
      disposed = true;
    },
  });
}

/** The existing checkbox supplies pointer and native keyboard activation; a changed allowance
 * always requires a new explicit confirmation, independently of garment roles or target identity. */
export function SavedObservedRadialInitializationChoiceV1({
  draft,
  disabled,
  onChange,
}: Readonly<{
  draft: QualifiedTwoPanelObservedPlacementDraftV1;
  disabled: boolean;
  onChange: (
    update: (
      previous: QualifiedTwoPanelObservedPlacementDraftV1,
    ) => QualifiedTwoPanelObservedPlacementDraftV1,
  ) => void;
}>) {
  return (
    <div className='flex flex-col gap-1'>
      <label className='flex min-h-7 items-center gap-2'>
        <CheckboxCommon
          name='observed-placement-bounded-radial-initialization'
          checked={draft.allowBoundedRadialInitialization}
          disabled={disabled}
          aria-label='Allow up to 1% initial stretch for clearance'
          onChange={(checked) => {
            if (disabled) return;
            onChange((previous) => ({
              ...previous,
              allowBoundedRadialInitialization: checked === true,
              confirmation: null,
            }));
          }}
        />
        <Text component='span'>Allow up to 1% initial stretch for clearance</Text>
      </label>
      <Text variant='label'>Saved with placement. Pattern dimensions stay unchanged.</Text>
    </div>
  );
}

export function SavedObservedPlacementAuthoringV1(props: SavedObservedPlacementAuthoringPropsV1) {
  const key = savedObservedPlacementAuthoringKeyV1(props);
  const currentKey = useRef(key);
  currentKey.current = key;
  return (
    <CurrentObservedAuthoring
      key={key}
      {...props}
      isCurrentKey={() => currentKey.current === key}
    />
  );
}

function CurrentObservedAuthoring({
  composerSnapshot,
  composerProjection,
  observedTarget,
  onConfirmedIntent,
  disabled = false,
  isCurrentKey,
}: SavedObservedPlacementAuthoringPropsV1 & Readonly<{ isCurrentKey: () => boolean }>) {
  const [draft, setDraft] = useState(() =>
    createQualifiedTwoPanelObservedPlacementDraftV1(
      composerSnapshot.seal.canonicalSha256,
      observedTarget?.canonicalSha256 ?? null,
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionRef = useRef<ReturnType<typeof createSavedObservedPlacementSubmissionV1> | null>(
    null,
  );
  const currentRef = useRef({ disabled, observedTarget, isCurrentKey, onConfirmedIntent });
  currentRef.current = { disabled, observedTarget, isCurrentKey, onConfirmedIntent };
  useEffect(() => {
    const submission = createSavedObservedPlacementSubmissionV1(
      () =>
        !currentRef.current.disabled &&
        currentRef.current.observedTarget !== null &&
        currentRef.current.isCurrentKey(),
    );
    submissionRef.current = submission;
    return () => {
      submission.dispose();
      if (submissionRef.current === submission) submissionRef.current = null;
    };
  }, []);
  const locked = !observedTarget || disabled || pending;
  const review = useMemo(() => {
    try {
      if (!observedTarget || observedTarget.canonicalSha256 !== draft.observedTargetSha256)
        throw new TypeError('Display the selected saved model before choosing placement.');
      qualifiedTwoPanelPlacementAuthoringInternalsV1.requireSource(
        composerSnapshot,
        composerProjection,
      );
      qualifiedTwoPanelPlacementAuthoringInternalsV1.buildGarmentProfile(
        composerSnapshot,
        composerProjection,
        draft,
        draft.annularProfileReviewed,
      );
      return { ready: true, detail: null };
    } catch (cause) {
      return {
        ready: false,
        detail: cause instanceof Error ? cause.message : 'Complete the exact garment roles.',
      };
    }
  }, [composerSnapshot, composerProjection, draft, observedTarget]);
  const submit = async () => {
    const submission = submissionRef.current;
    if (!submission || locked || !review.ready) return;
    setPending(true);
    setError(null);
    const result = await submission.submit(
      { composerSnapshot, composerProjection, observedTarget, draft },
      (intent) => currentRef.current.onConfirmedIntent(intent),
    );
    if (submissionRef.current !== submission) return;
    // A second click cannot clear the first pending operation.
    if (result.status === 'pending') return;
    setPending(false);
    if (result.status === 'failed') setError(result.detail);
  };
  return (
    <div
      className='flex flex-col gap-stack'
      role='group'
      aria-label='Observed body placement authoring'
      data-saved-observed-placement-authoring-v1=''
    >
      <SavedPlacementGarmentRoleEditorV1
        composerSnapshot={composerSnapshot}
        composerProjection={composerProjection}
        draft={draft}
        locked={locked}
        onChange={(update) => {
          setError(null);
          setDraft((previous) => ({ ...previous, ...update(previous), confirmation: null }));
        }}
      />
      <GroupLabel>Placement profile</GroupLabel>
      <SavedPlacementChoiceV1
        name='observed-placement-profile'
        label='Reviewed profile'
        value={draft.annularProfileReviewed ? 'annular' : ''}
        items={[{ value: 'annular', label: 'Annular · 700 / 900 mm · 0.64 rad' }]}
        disabled={locked}
        onChange={(value) => {
          setError(null);
          setDraft((previous) => ({
            ...previous,
            annularProfileReviewed: value === 'annular',
            confirmation: null,
          }));
        }}
      />
      <SavedAnnularPlacementProfileDetailsV1 />
      <SavedObservedRadialInitializationChoiceV1
        draft={draft}
        disabled={locked}
        onChange={(update) => {
          setError(null);
          setDraft(update);
        }}
      />
      <Text>
        {observedTarget
          ? `Placement target: displayed model #${observedTarget.target.persistedModel.id}, ${observedTarget.target.displayedModel.basisKind} body, current pose.`
          : 'Display the selected saved model to confirm placement.'}
      </Text>
      <Text variant='label'>
        Saving confirms this displayed body and pose. Changing either requires a new placement
        confirmation.
      </Text>
      {error ? (
        <Text variant='errorLabel' role='alert'>
          {error}
        </Text>
      ) : null}
      {review.detail ? (
        <Text variant='label' role='status'>
          {review.detail}
        </Text>
      ) : null}
      <div className='flex flex-wrap items-center gap-stack'>
        <Button
          type='button'
          size='sm'
          variant='main'
          disabled={locked || !review.ready}
          onClick={() => {
            void submit();
          }}
        >
          {pending ? 'Saving placement…' : 'Confirm target and save placement'}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={locked}
          onClick={() => {
            setDraft(
              createQualifiedTwoPanelObservedPlacementDraftV1(
                composerSnapshot.seal.canonicalSha256,
                observedTarget?.canonicalSha256 ?? null,
              ),
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
