// PIECES — each family once, with the steps that sew its edges. Twin marks live in the name.
import { useMemo } from 'react';
import { Tile, Tiles } from 'ui';
import { PieceMapShape } from './piece-map-shape';
import { MAP_W } from './step-view';
import type { MapModel } from './use-map-model';

const COLS = 3;
const GAP = 4;
const TILE = Math.floor((MAP_W - GAP * (COLS - 1)) / COLS);
const SHAPE_W = TILE - 12;
const SHAPE_H = TILE - 24;

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
  const mapped = useMemo(
    () => new Set(model.families.flatMap((family) => family.members)),
    [model.families],
  );
  const withoutContour = model.pieces.filter((piece) => !mapped.has(piece.key));

  return (
    <Tiles min={88} className='gap-1'>
      {model.families.map((family) => {
        const hot =
          active != null &&
          family.picture.edges.some((edge) => edge.steps.some((step) => step === active));
        const name = model.pieceName(family.leader);
        const unsewn = family.picture.edges.length === 0;
        return (
          <div
            key={family.leader}
            data-map-family={family.leader}
            data-map-family-hot={hot ? '1' : undefined}
          >
            <Tile
              selected={hot}
              title={name}
              className='p-1'
              media={
                <span className='flex justify-center'>
                  <PieceMapShape
                    picture={family.picture}
                    boxW={SHAPE_W}
                    boxH={SHAPE_H}
                    active={active}
                    numberOf={num}
                    onHoverStep={onHover}
                    onPickStep={onPick}
                    label={name}
                  />
                </span>
              }
              name={unsewn ? <span className='text-error'>{name}</span> : name}
            />
          </div>
        );
      })}
      {withoutContour.map((piece) => (
        <Tile
          key={piece.key}
          title={piece.name}
          name={<span className='text-error'>{piece.name}</span>}
          className='justify-end p-1'
        />
      ))}
    </Tiles>
  );
}
