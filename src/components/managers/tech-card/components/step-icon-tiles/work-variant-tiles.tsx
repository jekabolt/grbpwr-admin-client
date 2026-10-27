import { useFormContext, useWatch } from 'react-hook-form';
import { Tiles } from 'ui';
import {
  WORK_ICON,
  workVariantIconKey,
  workVariantLabel,
  workVariantsOf,
  type IconKey,
  type WorkToken,
} from '../../op-icons';
import type { TechCardFormData } from '../schema';
import { IconTile, TileRow, useStepFieldErrors } from './icon-tile';
import { useStepWrite } from './use-step-write';

/**
 * «Type» of a work that has variants (set_zip: open-end, two-way, …). The first tile is the work
 * itself, no variant. Work changes clear incompatible variants in the shared work writer.
 */
export function WorkVariantTiles({
  index,
  className,
  label = 'type',
}: {
  index: number;
  className?: string;
  label?: string;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const work = ((useWatch({ control, name: `operations.${index}.work` }) ?? '') as string).trim();
  const variant = (
    (useWatch({ control, name: `operations.${index}.workVariant` }) ?? '') as string
  ).trim();
  const errors = useStepFieldErrors(index, ['workVariant']);

  const variants = workVariantsOf(work);
  if (variants.length === 0 && !variant) return null;

  const baseIcon: IconKey = WORK_ICON[work as WorkToken] ?? 'other';
  const shown = variant && !variants.includes(variant) ? [...variants, variant] : variants;

  return (
    <TileRow
      field={`operations.${index}.workVariant`}
      label={label}
      errors={errors}
      className={className}
    >
      <Tiles min={72}>
        <IconTile
          icon={{ key: baseIcon }}
          label='regular'
          selected={!variant}
          onClick={() => write('workVariant', '')}
        />
        {shown.map((v) => (
          <IconTile
            key={v}
            icon={{ key: workVariantIconKey(work, v) ?? baseIcon }}
            label={workVariantLabel(v)}
            selected={variant === v}
            onClick={() => write('workVariant', variant === v ? '' : v)}
          />
        ))}
      </Tiles>
    </TileRow>
  );
}
