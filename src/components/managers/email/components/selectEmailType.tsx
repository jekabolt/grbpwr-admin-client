import {
  EmailBlockType,
  EMAIL_BLOCK_TYPE_DESCRIPTIONS,
  EMAIL_BLOCK_TYPE_GROUPS,
  emailBlockTypes,
} from 'constants/email-campaign';
import { cn } from 'lib/utility';
import React, { FC, useEffect, useRef, useState } from 'react';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { v4 as uuidv4 } from 'uuid';
import { makeEmptyBlock } from './schema';

interface SelectEmailTypeProps {
  /** useFieldArray append for the target block list (top-level body or a column). */
  append: (value: any) => void;
  /** Optional ref map used to scroll a newly-added top-level block into view. */
  entityRefs?: React.MutableRefObject<{ [uid: string]: HTMLDivElement | null }>;
  /** Called with the new block's uid after it is added (open its editor / close the menu). */
  onAdded?: (uid: string) => void;
  /** Block types to hide (e.g. TWO_COLUMN inside a column picker to bar nesting). */
  excludeTypes?: EmailBlockType[];
}

const EMAIL_TYPE_BY_VALUE = Object.fromEntries(emailBlockTypes.map((t) => [t.value, t])) as Record<
  string,
  (typeof emailBlockTypes)[number]
>;

// Fork of hero/components/selectHeroType.tsx over the 12 email block types +
// EMAIL_BLOCK_TYPE_GROUPS. Decoupled from the form so it can also drive a nested
// TWO_COLUMN column picker (which excludes TWO_COLUMN to bar infinite nesting).
export const SelectEmailType: FC<SelectEmailTypeProps> = ({
  append,
  entityRefs,
  onAdded,
  excludeTypes = [],
}) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const addBlock = (type: EmailBlockType) => {
    const uid = uuidv4();
    append(makeEmptyBlock(type, uid));
    onAdded?.(uid);
    // Scroll a newly-added top-level block into view once it renders.
    setTimeout(
      () => entityRefs?.current[uid]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      100,
    );
  };

  const q = query.trim().toLowerCase();
  const matches = (value: EmailBlockType) => {
    if (excludeTypes.includes(value)) return false;
    if (!q) return true;
    const label = EMAIL_TYPE_BY_VALUE[value]?.label ?? '';
    const desc = EMAIL_BLOCK_TYPE_DESCRIPTIONS[value] ?? '';
    return label.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
  };

  const groups = EMAIL_BLOCK_TYPE_GROUPS.map((g) => ({
    label: g.label,
    types: g.types.filter(matches),
  })).filter((g) => g.types.length > 0);
  const flatMatches = groups.flatMap((g) => g.types);

  const renderCard = (value: EmailBlockType) => {
    const type = EMAIL_TYPE_BY_VALUE[value];
    if (!type) return null;
    return (
      <button
        key={value}
        type='button'
        onClick={() => addBlock(value)}
        className={cn(
          'group flex h-full flex-col items-start gap-1 border border-textInactiveColor p-3 text-left transition-colors',
          'hover:bg-textColor hover:text-bgColor',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        )}
      >
        <div className='flex w-full items-center justify-between'>
          <Text variant='uppercase' className='group-hover:text-bgColor'>
            {type.label}
          </Text>
          <span className='text-lg leading-none'>+</span>
        </div>
        <span className='text-small leading-tight'>{EMAIL_BLOCK_TYPE_DESCRIPTIONS[value]}</span>
      </button>
    );
  };

  return (
    <div className='space-y-5'>
      <div className='sticky top-0 z-10 -mt-1 bg-bgColor pb-2 pt-1'>
        <Input
          ref={searchRef}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && query.trim() && flatMatches.length > 0) {
              e.preventDefault();
              addBlock(flatMatches[0]);
            }
          }}
          placeholder='search block types…'
          aria-label='search block types'
          className='border px-2 py-1.5'
        />
        {query.trim() && (
          <Text variant='label' size='small' className='mt-1 block'>
            {flatMatches.length} match{flatMatches.length === 1 ? '' : 'es'}
            {flatMatches.length > 0 && ' · enter adds the first'}
          </Text>
        )}
      </div>

      {groups.length === 0 ? (
        <Text variant='label' size='small'>
          no block types match “{query}”.
        </Text>
      ) : (
        groups.map((group) => (
          <div key={group.label} className='space-y-2'>
            <Text variant='uppercase' size='small'>
              {group.label}
            </Text>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {group.types.map(renderCard)}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
