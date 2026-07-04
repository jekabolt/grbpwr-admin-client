import { common_Product } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import {
  buildStorefrontLink,
  CatalogLink,
  GENDER_OPTIONS,
  ORDER_OPTIONS,
  parseStorefrontLink,
  SEASON_OPTIONS,
  SORT_OPTIONS,
  StorefrontLink,
  StorefrontLinkType,
} from 'lib/storefront-links';
import { cn } from 'lib/utility';
import { ChangeEvent, ReactNode, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { useArchives } from '../../archives/components/useArchiveQuery';
import { ProductPickerModal } from './productPickerModal';

// Radix Select forbids an empty-string item value, so use a sentinel for "any".
const ANY = '__any';

interface LinkFieldProps {
  /** RHF form path holding the URL string (unchanged contract). */
  name: string;
  label: string;
  optional?: boolean;
}

const TYPE_TABS: { value: StorefrontLinkType; label: string }[] = [
  { value: 'none', label: 'none' },
  { value: 'product', label: 'product' },
  { value: 'catalog', label: 'catalog' },
  { value: 'archive', label: 'archive' },
  { value: 'external', label: 'custom url' },
];

/**
 * Structured picker for a hero "explore / CTA" link. Replaces the raw URL input:
 * the user picks a target (product / catalog+filters / archive / custom / none)
 * and the component serializes it to the URL string the storefront expects (via
 * lib/storefront-links), writing that string back to the same form field — so
 * the contract is unchanged. On edit, the stored URL is parsed back into the
 * picker; anything unrecognized falls back to "custom url" and stays editable.
 */
export function LinkField({ name, label, optional }: LinkFieldProps) {
  const { watch, setValue } = useFormContext();
  const raw: string = watch(name) || '';
  const [link, setLink] = useState<StorefrontLink>(() => parseStorefrontLink(raw));
  const [productModalOpen, setProductModalOpen] = useState(false);
  // Resolved product for display only (thumbnail); the link stores just the slug.
  const [pickedProduct, setPickedProduct] = useState<common_Product | null>(null);

  // Re-sync when the form value changes from outside (form reset / duplicate),
  // but not on our own writes (then raw already equals build(link)).
  useEffect(() => {
    if (raw !== buildStorefrontLink(link)) setLink(parseStorefrontLink(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const update = (next: StorefrontLink) => {
    setLink(next);
    setValue(name, buildStorefrontLink(next), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const changeType = (type: StorefrontLinkType) => {
    if (type === link.type) return;
    switch (type) {
      case 'none':
        return update({ type: 'none' });
      case 'external':
        return update({ type: 'external', url: link.type === 'external' ? link.url : '' });
      case 'product':
        return update({ type: 'product', slug: link.type === 'product' ? link.slug : '' });
      case 'archive':
        return update({ type: 'archive', slug: link.type === 'archive' ? link.slug : '' });
      case 'catalog':
        return update(link.type === 'catalog' ? link : { type: 'catalog' });
    }
  };

  // Only trust the resolved product for display when it matches the stored slug
  // (guards against a stale pick when this field is reused for another block).
  const showProduct =
    link.type === 'product' && pickedProduct && pickedProduct.slug === link.slug
      ? pickedProduct
      : null;

  return (
    <div className='space-y-2'>
      <Text component='label' size='small' variant='label'>
        {label}
        {optional ? ' (optional)' : ''}
      </Text>

      <div className='flex flex-wrap gap-1'>
        {TYPE_TABS.map((t) => {
          const active = link.type === t.value;
          return (
            <button
              key={t.value}
              type='button'
              onClick={() => changeType(t.value)}
              aria-pressed={active}
              className={cn(
                'border px-2 py-1 text-small uppercase leading-none cursor-pointer',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                active
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor hover:border-textColor',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {link.type === 'external' && (
        <Input
          value={link.url}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update({ type: 'external', url: e.target.value })
          }
          placeholder='https://…'
          className='border px-2 py-1.5'
        />
      )}

      {link.type === 'none' && (
        <Text variant='label' size='small'>
          this block has no link.
        </Text>
      )}

      {link.type === 'product' && (
        <div className='space-y-2'>
          {link.slug ? (
            <div className='flex items-center gap-2'>
              {showProduct?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl && (
                <div className='w-12 shrink-0'>
                  <Media
                    src={showProduct.productDisplay.thumbnail.media.thumbnail.mediaUrl}
                    alt='product'
                    aspectRatio='1/1'
                    fit='cover'
                  />
                </div>
              )}
              <Text size='small'>product: {link.slug}</Text>
            </div>
          ) : (
            <Text variant='label' size='small'>
              no product selected yet.
            </Text>
          )}
          <ProductPickerModal
            open={productModalOpen}
            selectedProductIds={showProduct?.id ? [showProduct.id] : []}
            onOpenRequest={() => setProductModalOpen(true)}
            onClose={() => setProductModalOpen(false)}
            onSave={(prods) => {
              const p = prods[prods.length - 1];
              update({ type: 'product', slug: p?.slug || '' });
              setPickedProduct(p || null);
              setProductModalOpen(false);
            }}
          />
        </div>
      )}

      {link.type === 'catalog' && <CatalogBody link={link} onChange={update} fieldName={name} />}

      {link.type === 'archive' && <ArchiveBody link={link} onChange={update} fieldName={name} />}
    </div>
  );
}

/** Archive picker → serialized into the archive URL by the parent. */
function ArchiveBody({
  link,
  onChange,
  fieldName,
}: {
  link: { slug: string };
  onChange: (l: StorefrontLink) => void;
  fieldName: string;
}) {
  const { data: archives = [], isLoading } = useArchives();
  const items = (archives || [])
    .filter((a) => a.slug)
    .map((a) => ({
      value: a.slug as string,
      label: a.translations?.find((t) => t.heading)?.heading || a.tag || (a.slug as string),
    }));
  // Keep the stored slug visible even if it isn't in the fetched page.
  const hasCurrent = items.some((i) => i.value === link.slug);
  const allItems =
    link.slug && !hasCurrent ? [{ value: link.slug, label: link.slug }, ...items] : items;

  return (
    <Labeled label='archive'>
      <Select
        name={`${fieldName}-archive`}
        placeholder={isLoading ? 'loading…' : 'select an archive'}
        value={link.slug || ''}
        items={allItems}
        onValueChange={(v: string) => onChange({ type: 'archive', slug: v })}
      />
    </Labeled>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='space-y-1'>
      <Text component='label' size='small' variant='label'>
        {label}
      </Text>
      {children}
    </div>
  );
}

/** Catalog filters + sort → serialized into the catalog URL by the parent. */
function CatalogBody({
  link,
  onChange,
  fieldName,
}: {
  link: CatalogLink;
  onChange: (l: StorefrontLink) => void;
  fieldName: string;
}) {
  const { dictionary } = useDictionary();
  const set = (patch: Partial<CatalogLink>) => onChange({ ...link, ...patch });

  const withAny = (items: { value: string; label: string }[], anyLabel = 'any') => [
    { value: ANY, label: anyLabel },
    ...items,
  ];

  const categoryItems = (dictionary?.categories || [])
    .filter((c) => c.id != null && c.name)
    .map((c) => ({ value: String(c.id), label: c.name as string }));
  const collectionItems = (dictionary?.collections || [])
    .filter((c) => c.name)
    .map((c) => ({ value: c.name as string, label: c.name as string }));

  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
      <Labeled label='gender'>
        <Select
          name={`${fieldName}-gender`}
          placeholder='any'
          value={link.gender || ANY}
          items={withAny(GENDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })))}
          onValueChange={(v: string) =>
            set({ gender: v === ANY ? undefined : (v as CatalogLink['gender']) })
          }
        />
      </Labeled>

      <Labeled label='category'>
        <Select
          name={`${fieldName}-category`}
          placeholder='any'
          value={link.categoryId != null ? String(link.categoryId) : ANY}
          items={withAny(categoryItems)}
          onValueChange={(v: string) => set({ categoryId: v === ANY ? undefined : Number(v) })}
        />
      </Labeled>

      <Labeled label='collection'>
        <Select
          name={`${fieldName}-collection`}
          placeholder='any'
          value={link.collection || ANY}
          items={withAny(collectionItems)}
          onValueChange={(v: string) => set({ collection: v === ANY ? undefined : v })}
        />
      </Labeled>

      <Labeled label='tag'>
        <Input
          value={link.tag || ''}
          placeholder='e.g. ss26'
          className='border px-2 py-1.5'
          onChange={(e: ChangeEvent<HTMLInputElement>) => set({ tag: e.target.value || undefined })}
        />
      </Labeled>

      <Labeled label='season'>
        <Select
          name={`${fieldName}-season`}
          placeholder='any'
          value={link.season || ANY}
          items={withAny(SEASON_OPTIONS.map((o) => ({ value: o.value, label: o.label })))}
          onValueChange={(v: string) =>
            set({ season: v === ANY ? undefined : (v as CatalogLink['season']) })
          }
        />
      </Labeled>

      <Labeled label='sort by'>
        <Select
          name={`${fieldName}-sort`}
          placeholder='default'
          value={link.sort || ANY}
          items={withAny(
            SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            'default',
          )}
          onValueChange={(v: string) =>
            set({
              sort: v === ANY ? undefined : (v as CatalogLink['sort']),
              order: v === ANY ? undefined : link.order,
            })
          }
        />
      </Labeled>

      {link.sort && (
        <Labeled label='order'>
          <Select
            name={`${fieldName}-order`}
            placeholder='descending'
            value={link.order || ANY}
            items={withAny(
              ORDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              'default (desc)',
            )}
            onValueChange={(v: string) =>
              set({ order: v === ANY ? undefined : (v as CatalogLink['order']) })
            }
          />
        </Labeled>
      )}

      <button
        type='button'
        onClick={() => set({ onSale: !link.onSale })}
        aria-pressed={!!link.onSale}
        className={cn(
          'flex items-center gap-2 self-end border px-2 py-1.5 cursor-pointer',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
          link.onSale ? 'border-textColor' : 'border-textInactiveColor',
        )}
      >
        <span
          className={cn(
            'inline-block h-3 w-3 border',
            link.onSale ? 'border-textColor bg-textColor' : 'border-textInactiveColor',
          )}
        />
        <Text size='small' variant='uppercase'>
          on sale only
        </Text>
      </button>
    </div>
  );
}
