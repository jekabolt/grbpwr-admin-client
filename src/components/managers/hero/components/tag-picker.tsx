import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { HeroSectionModal } from './hero-section-modal';

interface TagPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Reusable product-tag picker. A trigger shows the current tag and opens a modal
 * with a search box, the full list of the dictionary's `productTags` as clickable
 * chips, and a "use custom tag" action for a value that isn't in the list (a drop
 * may reference a tag before products carry it). Controlled (value + onChange) so
 * it works both as an RHF-bound field and inside the link builder's local state.
 */
export function TagPicker({
  value,
  onChange,
  label = 'tag',
  placeholder = 'select a tag',
}: TagPickerProps) {
  const { dictionary } = useDictionary();
  const productTags = dictionary?.productTags || [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = productTags.filter((t) => t.toLowerCase().includes(q));
  const isExisting = productTags.some((t) => t.toLowerCase() === q);

  const pick = (tag: string) => {
    onChange(tag);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className='space-y-1'>
      {label && (
        <Text component='label' size='small' variant='label'>
          {label}
        </Text>
      )}

      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={() => setOpen(true)}
          className='flex flex-1 items-center justify-between border border-textInactiveColor px-2 py-1.5 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        >
          <Text size='small' variant={value ? 'default' : 'label'} className='truncate'>
            {value || placeholder}
          </Text>
          <span className='text-labelColor'>▾</span>
        </button>
        {value && (
          <button
            type='button'
            onClick={() => onChange('')}
            aria-label='clear tag'
            className='border border-textInactiveColor px-2 py-1.5 leading-none cursor-pointer text-textInactiveColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            ×
          </button>
        )}
      </div>

      <HeroSectionModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery('');
        }}
        title='select tag'
      >
        <div className='space-y-4'>
          <Input
            ref={searchRef}
            value={query}
            placeholder='search tags, or type a new one…'
            aria-label='search tags'
            className='border px-2 py-1.5'
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && query.trim()) {
                e.preventDefault();
                pick(query.trim());
              }
            }}
          />

          {q && !isExisting && (
            <button
              type='button'
              onClick={() => pick(query.trim())}
              className='w-full border border-textInactiveColor px-2 py-2 text-left cursor-pointer hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='small'>use “{query.trim()}” as a custom tag</Text>
            </button>
          )}

          {filtered.length === 0 && !q ? (
            <Text variant='label' size='small'>
              no product tags in the dictionary yet — type one above.
            </Text>
          ) : filtered.length === 0 ? (
            <Text variant='label' size='small'>
              no tags match “{query.trim()}”.
            </Text>
          ) : (
            <div className='flex flex-wrap gap-2'>
              {filtered.map((t) => {
                const selected = value === t;
                return (
                  <button
                    key={t}
                    type='button'
                    onClick={() => pick(t)}
                    aria-pressed={selected}
                    className={cn(
                      'border px-2 py-1 cursor-pointer',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                      selected
                        ? 'border-textColor bg-textColor text-bgColor'
                        : 'border-textInactiveColor hover:border-textInactiveColor',
                    )}
                  >
                    <Text size='small' className={selected ? '!text-bgColor' : ''}>
                      {t}
                    </Text>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </HeroSectionModal>
    </div>
  );
}
