// A UNIT ON THE STEP'S «WITH» ROW — its assembled shape above its name, as a piece tile shows a
// piece's silhouette. The same drawing as the picker's unit: the unit's pieces along the seams the
// card holds inside it (stored, or ones the engine is sure of; the rest stand apart), joined, upright,
// an ink outline — fixed, small, never a door. Without any geometry the unit stays a word.
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { Tile } from 'ui';
import { useCardSeamGraph } from '../card-unit-pictures';
import { seamSig } from './step-picture';
import {
  splitLaid,
  StepPictureSvg,
  useBoxSize,
  useCardGeoms,
  useSeamRows,
  useStable,
  useStepLayout,
} from './step-picture-view';

/** The row tile's raster: a 56 px picture needs no finer reading of what touches what. */
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
  const inputs = useStable([leaves], leaves.join(','));
  const innerRaw = useMemo(
    () => splitLaid(graph?.chosen ?? [], inputs, geoms, innerLines, byKey).inner,
    [graph?.chosen, inputs, geoms, innerLines, byKey],
  );
  const inner = useStable(innerRaw, seamSig(innerRaw));
  const layout = useStepLayout(inputs, inner, geoms, 0, RASTER_MM);
  const [boxEl, box] = useBoxSize();
  if (layout.T.size === 0) return <Tile name={name} sub='unit' className='justify-center' />;
  return (
    <span
      title={name}
      className={cn('relative flex size-14 shrink-0 flex-col overflow-hidden bg-pageBg', className)}
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
