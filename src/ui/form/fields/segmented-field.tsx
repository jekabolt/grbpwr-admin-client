import { cn } from 'lib/utility';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormMessage } from '..';

type Item = { value: string; label: string };

type Props = {
  name: string;
  label?: string;
  srLabel?: boolean;
  items: Item[];
  disabled?: boolean;
  className?: string;
};

// Single-select segmented control bound to react-hook-form — the exclusive-choice counterpart to
// ToggleGroupField (./toggle-group-field.tsx), whose value is an ARRAY (multi-select). Reach for
// this one when the field is an exclusive enum (e.g. a journal line's debit/credit side or its
// EUR/FX amount mode); reach for ToggleGroupField when several items can be selected at once.
// Brutalist two-button strip matching the kit.
export default function SegmentedField({
  name,
  label,
  srLabel,
  items,
  disabled,
  className,
}: Props) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          {label && <FormLabel className={srLabel ? 'sr-only' : ''}>{label}</FormLabel>}
          <div className='flex'>
            {items.map((item) => {
              const selected = field.value === item.value;
              return (
                <button
                  key={item.value}
                  type='button'
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => field.onChange(item.value)}
                  className={cn(
                    '-ml-px flex-1 border border-textInactiveColor px-2 py-1 text-textBaseSize uppercase first:ml-0 disabled:opacity-50',
                    selected
                      ? 'border-textColor bg-textColor text-bgColor'
                      : 'bg-bgColor text-textColor hover:bg-textInactiveColor/20',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
