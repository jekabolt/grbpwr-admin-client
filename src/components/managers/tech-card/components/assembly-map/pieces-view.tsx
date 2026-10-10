// PIECES — каждое семейство деталей один раз, номер шага у каждой сшиваемой кромки (§4 zone 4, D7).
// Близнецы L/R — одна плитка «L·R», одинаковые слои — «×n»; номера двойника ложатся на ту же кромку.
import { pieceFamilies } from 'lib/assembly-skeleton/map';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import Text from 'ui/components/text';
import { PieceMapShape } from './piece-map-shape';
import { MAP_W } from './step-view';
import type { MapModel } from './use-map-model';

const COLS = 3;
const GAP = 4;
const TILE = Math.floor((MAP_W - GAP * (COLS - 1)) / COLS);
const NAME_H = 14;

const num = (i: number) => (i + 1) * 10;

export function PiecesView({
  model,
  active,
  onHover,
  onPick,
}: {
  model: MapModel;
  active: number | null;
  onHover: (index: number | null) => void;
  onPick: (index: number) => void;
}) {
  const families = useMemo(() => (model.read ? pieceFamilies(model.read) : []), [model.read]);
  if (!model.read) return null;
  return (
    <div className='flex flex-col gap-1.5'>
      <div
        className='grid gap-1'
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        data-map-pieces={families.length}
      >
        {families.map((f) => {
          const hot = active != null && f.picture.edges.some((e) => e.steps.includes(active));
          const name = f.name;
          return (
            <div
              key={f.leader}
              data-map-family={f.leader}
              data-map-family-hot={hot ? '1' : undefined}
              className={cn(
                'relative flex flex-col items-center bg-bgZebra',
                hot && 'outline outline-2 -outline-offset-2 outline-textColor',
              )}
              title={`${name}${f.tag ? ` ${f.tag}` : ''} · ${f.members.map(model.pieceName).join(', ')}`}
            >
              <PieceMapShape
                picture={f.picture}
                boxW={TILE}
                boxH={TILE - NAME_H}
                active={active}
                numberOf={num}
                onHoverStep={onHover}
                onPickStep={onPick}
                label={`${name}: sewn edges numbered by step`}
              />
              {f.tag && (
                <span className='absolute top-0 right-0.5 text-nano leading-[1.35] tracking-pill text-labelColor tabular-nums'>
                  {f.tag}
                </span>
              )}
              <span className='w-full truncate px-0.5 text-center text-nano leading-[1.35] tracking-pill uppercase'>
                {name}
              </span>
            </div>
          );
        })}
      </div>
      <Text size='micro' variant='label'>
        number at an edge = the step that sews it · thin edge = not sewn in any step · tick = notch
      </Text>
    </div>
  );
}
