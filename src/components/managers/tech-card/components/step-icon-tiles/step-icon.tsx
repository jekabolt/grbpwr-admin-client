import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { cn } from 'lib/utility';
import { opIcon, OpIconArt, type OpIcon } from '../../op-icons';
import type { TechCardFormData } from '../schema';
import { formRowOpIconInput, type IconFormRow } from './rules';

/** The step's icon, read live from its form row (the same registry the printed sheet draws from). */
export function useStepOpIcon(index: number): OpIcon {
  const { control } = useFormContext<TechCardFormData>();
  const row = useWatch({ control, name: `operations.${index}` }) as IconFormRow | undefined;
  const defaultSeamClass = useWatch({ control, name: 'construction.defaultSeamClass' }) as
    | string
    | undefined;
  return useMemo(
    () => opIcon(formRowOpIconInput(row), { defaultSeamClass }),
    [row, defaultSeamClass],
  );
}

/** 24px icon cell of a step row in the sequence list. */
export function StepIconCell({ index }: { index: number }) {
  const icon = useStepOpIcon(index);
  return (
    <span className='flex h-6 w-8 shrink-0 items-center justify-center'>
      <OpIconArt icon={icon} w={32} h={24} className={cn(icon.missing && 'text-borderColor')} />
    </span>
  );
}

/** Compact icon in the step editor header. */
export function StepHeaderIcon({ index }: { index: number }) {
  const icon = useStepOpIcon(index);
  return (
    <OpIconArt
      icon={icon}
      w={32}
      h={24}
      className={cn('shrink-0', icon.missing && 'text-borderColor')}
    />
  );
}
