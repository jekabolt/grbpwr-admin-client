import { useFormContext, useWatch } from 'react-hook-form';
import { Tiles } from 'ui';
import type { TechCardFormData } from '../schema';
import { IconTile, TileRow, useStepFieldErrors } from './icon-tile';
import { NO_PRESS_TOWARD, PRESS_TOWARD_TILES } from './rules';
import { useStepWrite } from './use-step-write';

const ARROWS = PRESS_TOWARD_TILES.filter((t) => t.icon.arrow);
const SIDES = PRESS_TOWARD_TILES.filter((t) => !t.icon.arrow);

/**
 * «Allowance goes» of a press-to-one-side step: one tile per `press.toward` value — the four
 * directions as arrows, then the named sides as chips. Clicking the picked tile clears it.
 */
export function PressTowardTiles({ index, className }: { index: number; className?: string }) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const toward = (useWatch({ control, name: `operations.${index}.pressToward` }) ??
    NO_PRESS_TOWARD) as string;
  const errors = useStepFieldErrors(index, ['pressToward']);
  const pick = (value: string) => write('pressToward', toward === value ? NO_PRESS_TOWARD : value);
  // A value newer than this bundle is shown as itself, picked, instead of as «nothing».
  const stray =
    toward !== NO_PRESS_TOWARD && !PRESS_TOWARD_TILES.some((t) => t.value === toward) ? toward : '';

  return (
    <TileRow
      field={`operations.${index}.pressToward`}
      label='allowance goes *'
      errors={errors}
      className={className}
    >
      <Tiles min={72}>
        {ARROWS.map((t) => (
          <IconTile
            key={t.value}
            icon={t.icon}
            label={t.label}
            selected={toward === t.value}
            onClick={() => pick(t.value)}
          />
        ))}
      </Tiles>
      <Tiles min={72}>
        {SIDES.map((t) => (
          <IconTile
            key={t.value}
            icon={t.icon}
            label={t.label}
            selected={toward === t.value}
            onClick={() => pick(t.value)}
          />
        ))}
        {stray && (
          <IconTile
            icon={{ key: 'press_to_one_side' }}
            label={stray.replace('TECH_CARD_PRESS_TOWARD_', '').toLowerCase()}
            selected
            onClick={() => pick(stray)}
          />
        )}
      </Tiles>
    </TileRow>
  );
}
