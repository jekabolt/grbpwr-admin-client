import { useEffect, useRef } from 'react';
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
import { variantAfterWork } from './rules';
import { useStepWrite } from './use-step-write';

/**
 * «Type» of a work that has variants (set_zip: open-end, two-way, …). The first tile is the work
 * itself, no variant. Always mounted: when the work changes, a variant the new work does not
 * declare is dropped in the same edit (the server refuses it).
 */
export function WorkVariantTiles({ index, className }: { index: number; className?: string }) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const work = ((useWatch({ control, name: `operations.${index}.work` }) ?? '') as string).trim();
  const variant = (
    (useWatch({ control, name: `operations.${index}.workVariant` }) ?? '') as string
  ).trim();
  const errors = useStepFieldErrors(index, ['workVariant']);

  // Never on mount — opening a step does not edit it.
  const seenWork = useRef(work);
  useEffect(() => {
    if (seenWork.current === work) return;
    seenWork.current = work;
    const next = variantAfterWork(work, variant);
    if (next !== variant) write('workVariant', next);
  }, [work, variant, write]);

  const variants = workVariantsOf(work);
  if (variants.length === 0 && !variant) return null;

  const baseIcon: IconKey = WORK_ICON[work as WorkToken] ?? 'other';
  const shown = variant && !variants.includes(variant) ? [...variants, variant] : variants;

  return (
    <TileRow
      field={`operations.${index}.workVariant`}
      label='type'
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
