import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button, Input, Select } from 'ui';
import type { JoinPicks, JoinReview } from './draft-cad-saved-join-review';
import { openSavedJoinInPatterns } from './cad-command-compiled-reimport-handoff-v1';
export type PrepareJoin = (picks: JoinPicks, isCurrent: () => boolean) => Promise<JoinReview>;

export function SavedJoinControl({
  pieces,
  prepare,
}: {
  pieces: JoinPicks['fixed'][];
  prepare: PrepareJoin;
}) {
  const [reverse, setReverse] = useState(false),
    [identity, setIdentity] = useState('JN'),
    [review, setReview] = useState<JoinReview | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const version = useRef(0),
    locked = useRef(false),
    details = useRef<HTMLDetailsElement>(null);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  const invalidate = () => {
    version.current++;
    setReview(null);
    setMessage('');
  };
  const fixed = pieces[reverse ? 1 : 0]!,
    moving = pieces[reverse ? 0 : 1]!;
  const run = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const current = version.current;
    const valid = () => version.current === current && details.current?.open === true;
    try {
      if (review) {
        await openSavedJoinInPatterns(review, valid);
        return;
      }
      const r = await prepare({ fixed, moving, newIdentity: identity }, valid);
      if (valid()) setReview(r);
    } catch (e) {
      if (valid()) {
        setMessage(e instanceof Error ? e.message : 'The saved Join could not be verified.');
        setReview(null);
      }
    } finally {
      locked.current = false;
      if (details.current) setBusy(false);
    }
  };
  return (
    <details
      ref={details}
      onToggle={(e) => {
        if (!e.currentTarget.open) invalidate();
      }}
      className='relative text-small'
    >
      <summary className='cursor-pointer'>Join pieces</summary>
      <div className='absolute left-0 top-full z-20 grid min-w-64 gap-2 border border-hairline bg-bgColor p-2'>
        <div>
          Fixed right edge
          <Select
            name='join-fixed-right-edge'
            placeholder='Fixed right edge'
            size='sm'
            value={fixed.pieceId}
            items={pieces.map((piece) => ({ value: piece.pieceId, label: piece.pieceId }))}
            onValueChange={(pieceId) => {
              invalidate();
              setReverse(pieceId === pieces[1]?.pieceId);
            }}
          />
        </div>
        <span>Moving left edge · {moving.pieceId}</span>
        <label>
          New piece identity
          <Input
            aria-label='New piece identity'
            value={identity}
            maxLength={6}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              invalidate();
              setIdentity(e.target.value.toUpperCase());
            }}
          />
        </label>
        {review && (
          <p>
            Move {moving.pieceId} by X {review.dx} mm, Y {review.dy} mm. Apply will replace{' '}
            {fixed.pieceId} and {moving.pieceId} with {review.identity}.
          </p>
        )}
        {message && <span role='status'>{message}</span>}
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={busy || !/^[A-Z]{2,6}$/.test(identity)}
          onClick={run}
        >
          {review ? 'Review Join in Patterns' : 'Check registered edges'}
        </Button>
      </div>
    </details>
  );
}
