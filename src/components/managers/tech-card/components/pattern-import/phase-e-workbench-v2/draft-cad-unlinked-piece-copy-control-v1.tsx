import type { NativePieceCopyMode } from 'lib/pattern-import/fabrics/native-piece-copy-review';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { openSavedCopyInPatternsReviewV1 } from './cad-command-compiled-reimport-handoff-v1';
import type { PatternImportDxfPhaseEDraftCadSessionV1 } from './draft-cad-session-v1';
import type {
  CopyReview,
  PrepareSavedCopyReviewV1,
  SavedCopySelectionV1,
} from './draft-cad-unlinked-piece-copy-review-v1';

export function SavedDraftPieceCopyControlV1({
  prepare,
  mode,
  readSelection,
  session,
}: {
  mode: NativePieceCopyMode;
  prepare?: PrepareSavedCopyReviewV1;
  readSelection: () => SavedCopySelectionV1 | null;
  session: PatternImportDxfPhaseEDraftCadSessionV1;
}) {
  const details = useRef<HTMLDetailsElement>(null),
    busy = useRef(false);
  const [expanded, setExpanded] = useState(false),
    [review, setReview] = useState<CopyReview | null>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    setReview(null);
    setMessage('');
    if (expanded && prepare) {
      void prepare(readSelection, mode)
        .then((r) => {
          if (r.mode !== mode) throw new Error('The reviewed copy operation changed.');
          if (current) setReview(r);
        })
        .catch((error) => {
          if (current)
            setMessage(
              error instanceof Error
                ? error.message
                : 'The selected saved DXF could not be verified.',
            );
        });
    }
    return () => {
      current = false;
    };
  }, [expanded, prepare, readSelection, session, mode]);
  const [opening, setOpening] = useState(false);
  const open = async () => {
    const element = details.current;
    if (!review || !element?.open || busy.current) return;
    busy.current = true;
    setOpening(true);
    try {
      await openSavedCopyInPatternsReviewV1(
        review,
        () => details.current === element && element.open,
      );
      element.open = false;
    } catch (error) {
      if (details.current === element) {
        setReview(null);
        setMessage(error instanceof Error ? error.message : 'The copy review could not open.');
      }
    } finally {
      busy.current = false;
      if (details.current === element) setOpening(false);
    }
  };
  return (
    <details
      ref={details}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
      className='relative text-xs'
    >
      <summary className='cursor-pointer'>
        {mode === 'mirror-across-grain' ? 'Mirror piece' : 'Duplicate piece'}
      </summary>
      {expanded && (
        <div className='absolute left-0 top-full z-20 grid min-w-52 gap-2 border border-hairline bg-bgColor p-2 shadow'>
          <span role='status'>
            {!prepare
              ? 'Select one piece in an unmodified saved Draft with Patterns available.'
              : message ||
                (review
                  ? mode === 'mirror-across-grain'
                    ? `Mirror across each size’s grain to create ${review.identity} without seam bindings.`
                    : `Create ${review.identity} without copying its seam bindings.`
                  : 'Checking the saved piece and its sizes…')}
          </span>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={!prepare || !review || opening}
            loading={opening}
            onClick={open}
          >
            {mode === 'mirror-across-grain' ? 'Review unlinked mirror' : 'Review unlinked copy'}
          </Button>
        </div>
      )}
    </details>
  );
}
