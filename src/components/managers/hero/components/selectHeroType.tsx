import { common_HeroType } from 'api/proto-http/admin';
import { heroTypes } from 'constants/constants';
import { cn } from 'lib/utility';
import React, { FC, useEffect, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { HeroSchema } from './schema';

interface SelectHeroTypeProps {
  append: (value: any) => void;
  form: UseFormReturn<HeroSchema>;
  entityRefs: React.MutableRefObject<{ [uid: string]: HTMLDivElement | null }>;
  /** Called with the new block's uid after it is added (open its editor / close the menu). */
  onAdded?: (uid: string) => void;
}

const HERO_TYPE_DESCRIPTIONS: Record<string, string> = {
  HERO_TYPE_MAIN: 'Full-width hero — landscape + portrait media, headline & description',
  HERO_TYPE_SINGLE: 'Single media block with headline and explore link',
  HERO_TYPE_DOUBLE: 'Two square media blocks side by side',
  HERO_TYPE_FEATURED_PRODUCTS: 'Hand-picked products with a headline',
  HERO_TYPE_FEATURED_PRODUCTS_TAG: 'Products auto-filled by a tag',
  HERO_TYPE_MARQUEE: 'Thin scrolling announcement bar — one line of text + optional link',
  HERO_TYPE_VIDEO: 'Full-screen video — muted autoplay loop + poster + CTA',
  HERO_TYPE_STATEMENT: 'Manifesto — large statement text, optionally over subtle media',
  HERO_TYPE_NEWSLETTER: 'Email capture — optional media + headline, button & success copy',
  HERO_TYPE_EMBED: 'Iframe embed (Spline / 3D / campaign) with fallback media + CTA',
  HERO_TYPE_DROP: 'Countdown to a drop — media bg + release timer, then explore link',
  HERO_TYPE_LAST_CHANCE: 'Low-stock products — auto-filled by stock threshold (no manual picks)',
  HERO_TYPE_NEW_ARRIVALS: 'Newest products — auto-filled by created date (no manual picks)',
  HERO_TYPE_SLIDESHOW: 'Carousel of media slides with autoplay interval',
  HERO_TYPE_MOSAIC: 'Grid of media tiles (double / triple as special cases)',
  HERO_TYPE_LOOKBOOK: 'Story of full-bleed frames, each with a caption',
  HERO_TYPE_SPLIT: 'Editorial media beside products from the shoot',
  HERO_TYPE_PRODUCT_SPOTLIGHT: 'One product — large media + name / price + quick-add',
};

// Semantic buckets so the palette reads as a handful of groups instead of a flat
// wall of 18 options. Every hero type appears in exactly one group.
const HERO_TYPE_GROUPS: { label: string; types: common_HeroType[] }[] = [
  { label: 'media ads', types: ['HERO_TYPE_MAIN', 'HERO_TYPE_SINGLE', 'HERO_TYPE_DOUBLE'] },
  {
    label: 'products',
    types: [
      'HERO_TYPE_FEATURED_PRODUCTS',
      'HERO_TYPE_FEATURED_PRODUCTS_TAG',
      'HERO_TYPE_PRODUCT_SPOTLIGHT',
      'HERO_TYPE_SPLIT',
      'HERO_TYPE_LAST_CHANCE',
      'HERO_TYPE_NEW_ARRIVALS',
    ],
  },
  {
    label: 'editorial',
    types: ['HERO_TYPE_STATEMENT', 'HERO_TYPE_VIDEO', 'HERO_TYPE_LOOKBOOK'],
  },
  { label: 'galleries', types: ['HERO_TYPE_SLIDESHOW', 'HERO_TYPE_MOSAIC'] },
  { label: 'signup & announce', types: ['HERO_TYPE_NEWSLETTER', 'HERO_TYPE_MARQUEE'] },
  { label: 'interactive', types: ['HERO_TYPE_DROP', 'HERO_TYPE_EMBED'] },
];

const HERO_TYPE_BY_VALUE = Object.fromEntries(heroTypes.map((t) => [t.value, t])) as Record<
  string,
  (typeof heroTypes)[number]
>;

export const SelectHeroType: FC<SelectHeroTypeProps> = ({ append, form, entityRefs, onAdded }) => {
  const [addedEntityUid, setAddedEntityUid] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const entities = form.watch('entities');

  const addEntity = (type: common_HeroType) => {
    const newEntity = { type, _uid: uuidv4() };
    append(newEntity);
    setAddedEntityUid(newEntity._uid);
    onAdded?.(newEntity._uid);
  };

  useEffect(() => {
    if (addedEntityUid !== null) {
      setTimeout(() => {
        const element = entityRefs.current[addedEntityUid];
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setAddedEntityUid(null);
      }, 100);
    }
  }, [entities?.length, addedEntityUid, entityRefs]);

  const q = query.trim().toLowerCase();
  const matches = (value: common_HeroType) => {
    if (!q) return true;
    const label = HERO_TYPE_BY_VALUE[value]?.label ?? '';
    const desc = HERO_TYPE_DESCRIPTIONS[value] ?? '';
    return label.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
  };

  const groups = HERO_TYPE_GROUPS.map((g) => ({
    label: g.label,
    types: g.types.filter(matches),
  })).filter((g) => g.types.length > 0);

  const renderCard = (value: common_HeroType) => {
    const type = HERO_TYPE_BY_VALUE[value];
    if (!type) return null;
    return (
      <button
        key={value}
        type='button'
        onClick={() => addEntity(value)}
        className={cn(
          'group flex h-full flex-col items-start gap-1 border border-textColor p-3 text-left transition-colors',
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
        <span className='text-small leading-tight'>{HERO_TYPE_DESCRIPTIONS[value]}</span>
      </button>
    );
  };

  return (
    <div className='space-y-5'>
      <div className='sticky top-0 z-10 -mt-1 bg-bgColor pb-2 pt-1'>
        <Input
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder='search block types…'
          aria-label='search block types'
          className='border px-2 py-1.5'
        />
      </div>

      {groups.length === 0 ? (
        <Text variant='inactive' size='small'>
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
