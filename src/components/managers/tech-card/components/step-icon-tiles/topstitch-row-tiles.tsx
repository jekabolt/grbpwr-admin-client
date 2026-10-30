import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { InputField, Tiles } from 'ui';
import type { TechCardFormData } from '../schema';
import { IconTile, TileRow, useStepFieldErrors } from './icon-tile';
import { MAX_TOPSTITCH_ROWS, topstitchRowIcon, topstitchRowTileStates } from './rules';
import { useStepOpIcon } from './step-icon';
import { useStepWrite } from './use-step-write';

const NO_TOPSTITCH = 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN';

/**
 * Rows of topstitching as exact tiles 0–3 plus 4+, which reveals the exact 4–10 count.
 * 0 = unset; clicking the picked count clears it back to 0.
 */
export function TopstitchRowTiles({
  index,
  className,
  label = 'rows of topstitching',
}: {
  index: number;
  className?: string;
  label?: string;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const rows = (useWatch({ control, name: `operations.${index}.topstitchRows` }) ?? 0) as number;
  const mode = (useWatch({ control, name: `operations.${index}.topstitchMode` }) ??
    NO_TOPSTITCH) as string;
  const base = useStepOpIcon(index).key;
  const errors = useStepFieldErrors(index, ['topstitchRows']);
  const tiles = topstitchRowTileStates(rows);
  // The count field stays open from «4+» until a 0–3 tile is picked: typing «10» passes through «1»,
  // and clearing the field passes through empty — neither may unmount the field being typed in.
  const [exact, setExact] = useState(rows >= 4);
  const showExact = exact || rows >= 4;

  return (
    <TileRow
      field={`operations.${index}.topstitchRows`}
      label={label}
      errors={showExact ? undefined : errors}
      className={className}
    >
      <div className='flex items-end gap-2'>
        <Tiles min={72} className='min-w-0 flex-1'>
          {tiles.map((tile) => (
            <IconTile
              key={tile.value}
              icon={topstitchRowIcon(tile.iconRows, mode, base)}
              label={tile.label}
              selected={tile.value === 4 ? tile.pressed || exact : tile.pressed && !exact}
              onClick={() => {
                const more = tile.value === 4 && !(tile.pressed || exact);
                setExact(more);
                write(
                  'topstitchRows',
                  tile.value === 4 ? (more ? Math.max(rows, 4) : 0) : tile.nextRows,
                );
              }}
            />
          ))}
        </Tiles>
        {showExact && (
          <InputField
            name={`operations.${index}.topstitchRows`}
            type='number'
            valueAsNumber
            label='rows'
            min={4}
            max={MAX_TOPSTITCH_ROWS}
            step={1}
            className='w-14'
          />
        )}
      </div>
    </TileRow>
  );
}
