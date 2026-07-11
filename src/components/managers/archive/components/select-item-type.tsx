import { cn } from 'lib/utility';
import { FC, useEffect, useRef, useState } from 'react';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ARCHIVE_ITEM_TYPES, ArchiveItemValue } from './item-types';

interface SelectItemTypeProps {
  /** Add a block of this type (parent appends it, assigns a uid, and opens its editor). */
  onAdd: (type: ArchiveItemValue) => void;
}

// Semantic buckets so the palette reads as a few labelled groups instead of a
// flat list — mirrors the hero add-block palette. Every type appears once.
const ARCHIVE_ITEM_GROUPS: { label: string; types: ArchiveItemValue[] }[] = [
  {
    label: 'media',
    types: [
      'ARCHIVE_ITEM_TYPE_MAIN_MEDIA',
      'ARCHIVE_ITEM_TYPE_MEDIA_LINE',
      'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION',
    ],
  },
  { label: 'text & embed', types: ['ARCHIVE_ITEM_TYPE_TEXT', 'ARCHIVE_ITEM_TYPE_EMBED'] },
  {
    label: 'products',
    types: [
      'ARCHIVE_ITEM_TYPE_PRODUCT',
      'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG',
      'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL',
    ],
  },
];

const ITEM_BY_VALUE = Object.fromEntries(ARCHIVE_ITEM_TYPES.map((t) => [t.value, t])) as Record<
  string,
  (typeof ARCHIVE_ITEM_TYPES)[number]
>;

// Frame + parts for the per-type schematic. Drawn from divs (not font glyphs) so
// they render identically everywhere, and they invert with the card on hover.
const FRAME =
  'flex h-10 w-14 shrink-0 border border-textInactiveColor p-1.5 group-hover:border-bgColor';
const FILL = 'bg-textColor group-hover:bg-bgColor';
const OUTLINE = 'border border-textInactiveColor group-hover:border-bgColor';

/** A tiny monochrome schematic of what each block renders on the storefront. */
function TypeGlyph({ value }: { value: ArchiveItemValue }) {
  switch (value) {
    case 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA': // one hero-scale filled frame
      return (
        <div className={cn(FRAME, 'items-center justify-center')} aria-hidden>
          <div className={cn('h-full w-full', FILL)} />
        </div>
      );
    case 'ARCHIVE_ITEM_TYPE_MEDIA_LINE': // a row of tiles
      return (
        <div className={cn(FRAME, 'items-center justify-center gap-1')} aria-hidden>
          <div className={cn('h-6 w-2', FILL)} />
          <div className={cn('h-6 w-2', FILL)} />
          <div className={cn('h-6 w-2', FILL)} />
        </div>
      );
    case 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION': // media over a caption line
      return (
        <div className={cn(FRAME, 'flex-col items-start justify-center gap-1')} aria-hidden>
          <div className={cn('h-5 w-full', FILL)} />
          <div className={cn('h-[3px] w-2/3', FILL)} />
        </div>
      );
    case 'ARCHIVE_ITEM_TYPE_TEXT': // stacked lines of copy
      return (
        <div className={cn(FRAME, 'flex-col items-start justify-center gap-[3px]')} aria-hidden>
          <div className={cn('h-[3px] w-full', FILL)} />
          <div className={cn('h-[3px] w-full', FILL)} />
          <div className={cn('h-[3px] w-2/3', FILL)} />
        </div>
      );
    case 'ARCHIVE_ITEM_TYPE_EMBED': // an iframe with a play marker
      return (
        <div className={cn(FRAME, 'items-center justify-center')} aria-hidden>
          <div className={cn('flex h-full w-full items-center justify-center', OUTLINE)}>
            <span className='h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-textInactiveColor group-hover:border-l-bgColor' />
          </div>
        </div>
      );
    case 'ARCHIVE_ITEM_TYPE_PRODUCT': // a single product tile
      return (
        <div className={cn(FRAME, 'items-center justify-center')} aria-hidden>
          <div className={cn('h-4 w-4', FILL)} />
        </div>
      );
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG': // a tag-driven set (variable count)
      return (
        <div className={cn(FRAME, 'items-center justify-center gap-1')} aria-hidden>
          <div className={cn('h-4 w-2.5', FILL)} />
          <div className={cn('h-4 w-2.5', FILL)} />
          <div className={cn('h-4 w-2.5', OUTLINE)} />
        </div>
      );
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL': // a hand-picked set
      return (
        <div className={cn(FRAME, 'items-center justify-center gap-1')} aria-hidden>
          <div className={cn('h-4 w-2.5', FILL)} />
          <div className={cn('h-4 w-2.5', FILL)} />
          <div className={cn('h-4 w-2.5', FILL)} />
        </div>
      );
    default:
      return null;
  }
}

/**
 * Add-block palette for the archive body — a searchable, grouped set of the eight
 * timeline block types, each with a schematic of what it renders. Keyboard-first:
 * the search autofocuses on open and Enter adds the first match.
 */
export const SelectItemType: FC<SelectItemTypeProps> = ({ onAdd }) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const q = query.trim().toLowerCase();
  const groups = ARCHIVE_ITEM_GROUPS.map((g) => ({
    label: g.label,
    types: g.types.filter((value) => {
      if (!q) return true;
      const t = ITEM_BY_VALUE[value];
      return t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }),
  })).filter((g) => g.types.length > 0);
  const flatMatches = groups.flatMap((g) => g.types);

  const renderCard = (value: ArchiveItemValue) => {
    const t = ITEM_BY_VALUE[value];
    if (!t) return null;
    return (
      <button
        key={value}
        type='button'
        onClick={() => onAdd(value)}
        aria-label={`add ${t.label} block`}
        className={cn(
          'group flex h-full min-h-[84px] items-start gap-3 border border-textInactiveColor p-3 text-left transition-colors',
          'hover:bg-textColor hover:text-bgColor',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        )}
      >
        <TypeGlyph value={value} />
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <div className='flex items-center justify-between gap-2'>
            <Text variant='uppercase' size='large' className='truncate group-hover:text-bgColor'>
              {t.label}
            </Text>
            <span className='shrink-0 text-lg leading-none' aria-hidden>
              +
            </span>
          </div>
          <Text variant='label' size='small' className='leading-tight group-hover:text-bgColor'>
            {t.description}
          </Text>
        </div>
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
              onAdd(flatMatches[0]);
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
