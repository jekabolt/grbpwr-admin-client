import type { ReactNode } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { FormItem, Text, Tile } from 'ui';
import { cn } from 'lib/utility';
import { OpIconArt, type OpIcon } from '../../op-icons';
import type { TechCardFormData } from '../schema';

/** One pickable tile: a 40px icon over a short label; the picked one is inverted. */
export function IconTile({
  icon,
  label,
  title,
  selected = false,
  derived = false,
  dashed = false,
  onClick,
}: {
  icon?: OpIcon;
  label: string;
  title?: string;
  selected?: boolean;
  /** Read from another field, not stored: drawn picked, but in outline. */
  derived?: boolean;
  dashed?: boolean;
  onClick: () => void;
}) {
  const inverted = selected && !derived;
  return (
    <Tile
      onClick={onClick}
      pressed={selected}
      selected={selected}
      dashed={dashed || derived}
      title={title ?? label}
      className={cn('items-center', inverted && 'border-textColor bg-textColor text-bgColor')}
    >
      {icon ? <OpIconArt icon={icon} w={53} h={40} /> : <span className='h-10' />}
      <Text
        size='micro'
        tracking='label'
        variant={inverted ? 'selected' : 'uppercase'}
        component='span'
        className='mt-1 block w-full truncate text-center'
      >
        {label}
      </Text>
    </Tile>
  );
}

/** Field errors of one step, by flat field name (zod refines and server refusals land here). */
export function useStepFieldErrors(index: number, fields: readonly string[]): string[] {
  const { control } = useFormContext<TechCardFormData>();
  const { errors } = useFormState({ control, name: `operations.${index}` });
  const step = (
    errors.operations as unknown as Array<Record<string, { message?: unknown }> | undefined>
  )?.[index];
  return fields
    .map((field) => step?.[field]?.message)
    .filter((message): message is string => typeof message === 'string' && message !== '');
}

/** The label + tiles + errors frame every tile row shares (the look of a form field). */
export function TileRow({
  field,
  alsoField,
  label,
  lead,
  errors,
  className,
  children,
}: {
  /** The dotted RHF path, stamped as `data-field` so the error router can scroll to the row. */
  field: string;
  /** A second path this row edits (and shows the errors of), so a refusal on it finds the row. */
  alsoField?: string;
  label: string;
  lead?: ReactNode;
  errors?: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const row = (
    <FormItem className={cn('flex flex-col gap-1', !alsoField && className)} data-field={field}>
      <div className='flex items-center gap-2'>
        <Text
          size='micro'
          variant='label'
          tracking='label'
          component='span'
          className='leading-none uppercase'
        >
          {label}
        </Text>
        {lead}
      </div>
      {children}
      {errors?.map((message) => (
        <Text key={message} size='micro' variant='errorLabel'>
          {message}
        </Text>
      ))}
    </FormItem>
  );
  if (!alsoField) return row;
  return (
    <div className={className} data-field={alsoField}>
      {row}
    </div>
  );
}
