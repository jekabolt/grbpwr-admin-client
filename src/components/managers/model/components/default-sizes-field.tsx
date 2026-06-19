import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useController, useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import { ModelFormData } from './schema';

// Multi-select of default sample sizes (a model can be e.g. M on top, L on bottom).
export function DefaultSizesField() {
  const { control } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: 'defaultSizeIds' });
  const { dictionary } = useDictionary();

  const selected = new Set(field.value ?? []);
  const sizes = dictionary?.sizes ?? [];

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    field.onChange([...next]);
  };

  return (
    <div className='space-y-1'>
      <Text variant='inactive' size='small'>
        default sizes (optional, multiple)
      </Text>
      <div className='flex flex-wrap gap-2'>
        {sizes.map((s) => {
          const id = s.id ?? 0;
          const on = selected.has(id);
          return (
            <button
              type='button'
              key={id}
              onClick={() => toggle(id)}
              aria-pressed={on}
              className={cn(
                'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                on
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor hover:border-textColor',
              )}
            >
              {s.name ?? `#${id}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
