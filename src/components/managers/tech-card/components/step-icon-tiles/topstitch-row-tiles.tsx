import { useFormContext, useWatch } from 'react-hook-form';
import { Tiles } from 'ui';
import type { TechCardFormData } from '../schema';
import { IconTile, TileRow, useStepFieldErrors } from './icon-tile';
import { TOPSTITCH_ROW_TILES, topstitchRowIcon } from './rules';
import { useStepWrite } from './use-step-write';

const NO_TOPSTITCH = 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN';

/**
 * Rows of topstitching as tiles 0–4, each previewing its bars (the server caps rows at four).
 * 0 = unset; clicking the picked count clears it back to 0.
 */
export function TopstitchRowTiles({ index, className }: { index: number; className?: string }) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const rows = (useWatch({ control, name: `operations.${index}.topstitchRows` }) ?? 0) as number;
  const mode = (useWatch({ control, name: `operations.${index}.topstitchMode` }) ??
    NO_TOPSTITCH) as string;
  const errors = useStepFieldErrors(index, ['topstitchRows']);
  const counts: readonly number[] = (TOPSTITCH_ROW_TILES as readonly number[]).includes(rows)
    ? TOPSTITCH_ROW_TILES
    : [...TOPSTITCH_ROW_TILES, rows];

  return (
    <TileRow
      field={`operations.${index}.topstitchRows`}
      label='rows of topstitching'
      errors={errors}
      className={className}
    >
      <Tiles min={72}>
        {counts.map((n) => (
          <IconTile
            key={n}
            icon={topstitchRowIcon(n, mode)}
            label={String(n)}
            selected={rows === n}
            onClick={() => write('topstitchRows', rows === n ? 0 : n)}
          />
        ))}
      </Tiles>
    </TileRow>
  );
}
