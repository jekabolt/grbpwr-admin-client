// `+ fold` ON A PIECE TILE (A-fold, owner OK 11.11): the same fold picker, opened on the piece
// rather than on a step. A saved fold closes on the piece's own non-fusing step that already closes
// its folds, else on its own Press step, else on a new draft Press step placed where `+ operation`
// would put it. Never on FUSING, so un-fusing keeps the fold.

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Close, GroupLabel } from 'ui';
import { useTechCardAutosave } from '../design/autosave-contract';
import type { TechCardFormData } from '../schema';
import { useStepSeams } from '../step-seams/step-seams-context';
import { sizeOf } from './fold-model';
import { FoldPicker, usePieceReads } from './fold-picker';
import { pieceFoldStep } from './fold-step';

/** Inserts the draft Press step for the piece at `at`, closing `foldKeys`; its index, or null. */
export type InsertFoldPress = (
  at: number,
  pieceKey: string,
  foldKeys: readonly string[],
) => number | null;

type Ops = NonNullable<TechCardFormData['operations']>;

/**
 * The step a fold picked on the piece closes on, making a Press step only when the piece has none
 * of its own. `blocked` guards the piece's fold order; a new step that would break it is not made.
 */
export function resolvePieceFoldStep({
  ops,
  pieceKey,
  pieceFoldKeys,
  foldKeys,
  at,
  blocked,
  insertPress,
}: {
  ops: readonly Ops[number][];
  pieceKey: string;
  pieceFoldKeys: ReadonlySet<string>;
  foldKeys: readonly string[];
  at: number | undefined;
  blocked: (ops: readonly Ops[number][], index: number) => boolean;
  insertPress: InsertFoldPress | undefined;
}): number | null {
  const own = pieceFoldStep(ops, pieceKey, pieceFoldKeys);
  if (own !== null) return blocked(ops, own) ? null : own;
  if (at === undefined || !insertPress) return null;
  const index = Math.min(Math.max(at, 0), ops.length);
  const planned = [
    ...ops.slice(0, index),
    { inputKeys: [pieceKey], foldKeys: [] } as unknown as Ops[number],
    ...ops.slice(index),
  ];
  if (blocked(planned, index)) return null;
  return insertPress(index, pieceKey, foldKeys);
}

export function PieceFoldPicker({
  pieceKey,
  at,
  insertPress,
  onClose,
}: {
  pieceKey: string;
  /** Where `+ operation` would put a step on this piece; none = no new step can be made. */
  at: number | undefined;
  insertPress: InsertFoldPress | undefined;
  onClose: () => void;
}) {
  const ctx = useStepSeams();
  const form = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const geo = ctx?.geometry;
  const piece = geo?.pieces.get(pieceKey);
  const pieces = useMemo(
    () => (piece?.geom && piece.geom.rs.length >= 3 ? [piece.geom] : []),
    [piece],
  );
  const innerLines = useMemo(
    () =>
      new Map<string, Pt2[][]>(
        piece ? [[pieceKey, piece.inner.map((line) => line.map(([x, y]): Pt2 => [x, -y]))]] : [],
      ),
    [piece, pieceKey],
  );
  const shapes = geo?.shapes.shapeByKey ?? null;
  const reads = usePieceReads(pieces, shapes, geo?.grainDeg, innerLines);
  const size = useMemo(() => sizeOf(shapes), [shapes]);
  const read = reads[0];
  if (!ctx || !read) return null;

  const pieceFoldKeys = new Set(read.rows.map((row) => row.foldKey));
  return (
    <div className='flex flex-col' data-piece-fold={read.geom.name}>
      <GroupLabel
        flush
        action={<Close size='sm' aria-label={`close fold ${read.geom.name}`} onClick={onClose} />}
      >
        {read.geom.name} · fold
      </GroupLabel>
      <FoldPicker
        key={pieceKey}
        read={read}
        cardId={ctx.cardId}
        frozen={ctx.frozen}
        size={size}
        resolveStep={(foldKeys, blocked) => {
          const ops = form.getValues('operations') ?? [];
          const index = resolvePieceFoldStep({
            ops,
            pieceKey,
            pieceFoldKeys,
            foldKeys,
            at,
            blocked,
            insertPress: insertPress
              ? (place, key, keys) => {
                  const made = insertPress(place, key, keys);
                  if (made !== null) autosave.request('fold-step');
                  return made;
                }
              : undefined,
          });
          return index;
        }}
        onClose={onClose}
      />
    </div>
  );
}
