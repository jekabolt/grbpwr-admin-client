// THE STEP THAT CLOSES A FOLD — the piece flat, then folded. Reads the same thumbnails as the fold
// picker; a step that names no fold draws nothing.
import type { FoldStep } from 'lib/folds';
import { foldGroupsOf } from '../assembly-folds/fold-model';
import { FlatThumb, FoldedThumb } from '../assembly-folds/fold-picture';
import { useFoldRows } from '../assembly-folds/folds-store';
import { useCardGeoms } from '../step-seams/step-picture-view';
import { closingFoldsOf } from '../step-seams/step-folds';

export function StepFoldThumbs({ ops, index }: { ops: readonly FoldStep[]; index: number }) {
  const rows = useFoldRows();
  const { geoms, innerLines, geo } = useCardGeoms();
  const closing = closingFoldsOf(ops, index, rows).flatMap((hit) => {
    const piece =
      geoms.get(hit.pieceKey) ??
      [...geoms.values()].find((g) => g.pieceKey.toUpperCase() === hit.pieceKey.toUpperCase());
    if (!piece) return [];
    const deg = geo?.grainDeg?.get(piece.pieceKey) ?? 0;
    const { groups } = foldGroupsOf(piece, hit.rows, deg, innerLines.get(piece.pieceKey));
    return groups.length ? [{ piece, deg, groups }] : [];
  });
  if (!closing.length) return null;
  return (
    <div className='flex flex-wrap items-center gap-2' data-map-fold-step=''>
      {closing.map(({ piece, deg, groups }) => (
        <div
          key={piece.pieceKey}
          className='flex items-center gap-1'
          data-map-fold={piece.pieceKey}
        >
          <FlatThumb
            piece={piece}
            deg={deg}
            inner={innerLines.get(piece.pieceKey)}
            groups={groups}
            hints={[]}
          />
          <FoldedThumb piece={piece} deg={deg} groups={groups} />
        </div>
      ))}
    </div>
  );
}
