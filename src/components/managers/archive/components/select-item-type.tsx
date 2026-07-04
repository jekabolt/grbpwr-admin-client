import { common_ArchiveItemType } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { FC, useEffect, useRef, useState } from 'react';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ARCHIVE_ITEM_TYPES } from './item-types';

interface SelectItemTypeProps {
  /** Add a block of this type (parent appends it, assigns a uid, and opens its editor). */
  onAdd: (type: common_ArchiveItemType) => void;
}

/**
 * Add-block palette for the archive body — searchable grid of the six timeline
 * item types. Mirrors the hero SelectHeroType, minus the semantic grouping (six
 * types read fine as a flat grid).
 */
export const SelectItemType: FC<SelectItemTypeProps> = ({ onAdd }) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard-first: focus the search once Radix's open-focus settles.
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = ARCHIVE_ITEM_TYPES.filter(
    (t) => !q || t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
  );

  return (
    <div className='space-y-4'>
      <div className='sticky top-0 z-10 -mt-1 bg-bgColor pb-2 pt-1'>
        <Input
          ref={searchRef}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && query.trim() && matches.length > 0) {
              e.preventDefault();
              onAdd(matches[0].value);
            }
          }}
          placeholder='search block types…'
          aria-label='search block types'
          className='border px-2 py-1.5'
        />
        {query.trim() && (
          <Text variant='label' size='small' className='mt-1 block'>
            {matches.length} match{matches.length === 1 ? '' : 'es'}
            {matches.length > 0 && ' · enter adds the first'}
          </Text>
        )}
      </div>

      {matches.length === 0 ? (
        <Text variant='label' size='small'>
          no block types match “{query}”.
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          {matches.map((t) => (
            <button
              key={t.value}
              type='button'
              onClick={() => onAdd(t.value)}
              className={cn(
                'group flex h-full flex-col items-start gap-1 border border-textColor p-3 text-left transition-colors',
                'hover:bg-textColor hover:text-bgColor',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              )}
            >
              <div className='flex w-full items-center justify-between'>
                <Text variant='uppercase' className='group-hover:text-bgColor'>
                  {t.label}
                </Text>
                <span className='text-lg leading-none'>+</span>
              </div>
              <span className='text-small leading-tight'>{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
