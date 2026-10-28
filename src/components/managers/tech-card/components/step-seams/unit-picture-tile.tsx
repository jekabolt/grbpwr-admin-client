// A UNIT ON THE STEP'S «WITH» ROW — its assembled shape above its name, as a piece tile shows a
// piece's silhouette. The same drawing as the picker's unit: the unit's pieces along the seams the
// card holds inside it (stored, or ones the engine is sure of; the rest stand apart), joined, upright,
// an ink outline — fixed, small, never a door. Without any geometry the unit stays a word.
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import { Tile } from 'ui';
import { useCardSeamGraph } from '../card-unit-pictures';
import type { TechCardFormData } from '../schema';
import { seamSig } from './step-picture';
import {
  innerSeamsOf,
  splitLaid,
  StepPictureSvg,
  useBoxSize,
  useCardGeoms,
  useCardPieceKeys,
  useSeamRows,
  useStable,
  useStepLayout,
} from './step-picture-view';
import type { FormOpLike } from './step-seams-model';

/** The row tile's raster: a 72 px picture needs no finer reading of what touches what. */
const RASTER_MM = 4;

export function UnitPictureTile({
  leaves,
  name,
  className,
}: {
  /** The unit's pieces, by line key. */
  leaves: readonly string[];
  name: string;
  className?: string;
}) {
  const { geoms, innerLines } = useCardGeoms();
  const { graph } = useCardSeamGraph();
  const byKey = useSeamRows();
  const pieceKeys = useCardPieceKeys();
  const ops = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOpLike[];
  const inputs = useStable([leaves], leaves.join(','));
  // The unit along the seams the card holds inside it: the engine's, and the steps' own (stored
  // or implied) — the whole card's, a unit is what every step so far made of its pieces.
  const innerRaw = useMemo(() => {
    const s = splitLaid(graph?.chosen ?? [], inputs, geoms, innerLines, byKey);
    return innerSeamsOf(s, ops, ops.length, pieceKeys, inputs, geoms, innerLines, byKey);
  }, [graph?.chosen, inputs, geoms, innerLines, byKey, ops, pieceKeys]);
  const inner = useStable(innerRaw, seamSig(innerRaw));
  const layout = useStepLayout(inputs, inner, geoms, 0, RASTER_MM);
  const [boxEl, box] = useBoxSize();
  if (layout.T.size === 0) return <Tile name={name} sub='unit' className='justify-center' />;
  return (
    <span
      title={name}
      className={cn('relative flex size-18 shrink-0 flex-col overflow-hidden bg-pageBg', className)}
    >
      <span ref={boxEl} className='block min-h-0 flex-1 px-1 pt-1'>
        {box.w > 0 && box.h > 0 && (
          <StepPictureSvg
            w={box.w}
            h={box.h}
            pad={1}
            look='tile'
            layout={layout}
            geoms={geoms}
            innerLines={innerLines}
          />
        )}
      </span>
      <span className='line-clamp-3 shrink-0 px-0.5 text-center text-nano leading-[1.35] tracking-pill break-words uppercase'>
        {name}
      </span>
    </span>
  );
}
