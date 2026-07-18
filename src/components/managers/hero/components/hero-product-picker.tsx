import { common_Colorway } from 'api/proto-http/admin';
import { useFormContext } from 'react-hook-form';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { ProductPickerModal } from './productPickerModal';
import { ProductSelectionApi } from './useProductSelection';

interface HeroProductPickerProps {
  /** Stable block uid — keys the resolved-product display cache. */
  uid: string;
  /** Shared product-selection API (modal state + resolved-product cache). */
  api: ProductSelectionApi;
  /** Form path that receives the id(s): an array, or a single number when `single`. */
  formPath: string;
  /** Store a single number instead of a number[]. */
  single?: boolean;
  /**
   * Restrict the picker to ACTIVE colourways only — for homepage-facing pickers
   * (split, spotlight) so a draft/hidden colourway can't be featured while
   * looking live (H1). Leave unset for pickers that legitimately reference
   * non-live products (e.g. archive/timeline blocks referencing past products).
   */
  activeOnly?: boolean;
}

/**
 * Product selection for the v2 product blocks (split / spotlight, and archive's
 * product / manual-products blocks). Reuses the shared ProductPickerModal +
 * selection API but writes to an arbitrary form path (unlike FeaturedProductBase,
 * which is hard-wired to featuredProducts) and can hold either a list or a single
 * product.
 */
export function HeroProductPicker({
  uid,
  api,
  formPath,
  single,
  activeOnly,
}: HeroProductPickerProps) {
  const { setValue } = useFormContext();
  const selected = api.products[uid] || [];

  const commit = (products: common_Colorway[]) => {
    const list = single ? products.slice(0, 1) : products;
    const ids = list.map((p) => p.id).filter((id): id is number => id !== undefined);
    setValue(formPath as any, single ? ids[0] ?? undefined : ids, {
      shouldDirty: true,
      shouldTouch: true,
    });
    api.saveSelection(list, uid);
    api.closeSelection();
  };

  const removeAt = (i: number) => commit(selected.filter((_, idx) => idx !== i));

  // A6: reorder hand-picked products in place (swap with the left/right neighbor)
  // instead of remove-and-re-add-one-at-a-time. Only meaningful for multi-select.
  const moveAt = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[i], next[j]] = [next[j], next[i]];
    const ids = next.map((p) => p.id).filter((id): id is number => id !== undefined);
    setValue(formPath as any, ids, { shouldDirty: true, shouldTouch: true });
    api.reorderProducts(next, uid);
  };

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap gap-2'>
        {selected.length === 0 && (
          <Text variant='label' size='small'>
            no product{single ? '' : 's'} selected yet.
          </Text>
        )}
        {selected.map((p, i) => (
          <div key={p.id ?? i} className='relative w-20'>
            <Media
              src={p.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
              alt='product'
              aspectRatio='1/1'
              fit='cover'
            />
            <button
              type='button'
              onClick={() => removeAt(i)}
              className='absolute right-0 top-0 bg-bgColor px-1.5 py-0.5 leading-none text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              aria-label='remove product'
            >
              ×
            </button>
            {!single && selected.length > 1 && (
              <div className='absolute bottom-0 left-0 flex w-full justify-between'>
                <button
                  type='button'
                  onClick={() => moveAt(i, -1)}
                  disabled={i === 0}
                  className='bg-bgColor px-1 leading-none text-textColor disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                  aria-label='move product earlier'
                >
                  ‹
                </button>
                <button
                  type='button'
                  onClick={() => moveAt(i, 1)}
                  disabled={i === selected.length - 1}
                  className='bg-bgColor px-1 leading-none text-textColor disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                  aria-label='move product later'
                >
                  ›
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <ProductPickerModal
        open={api.isOpen && api.currentUid === uid}
        selectedProductIds={selected
          .map((p) => p.id)
          .filter((id): id is number => id !== undefined)}
        onClose={api.closeSelection}
        onOpenRequest={() => api.openSelection(uid)}
        onSave={commit}
        statuses={activeOnly ? ['COLORWAY_LIFECYCLE_STATUS_ACTIVE'] : undefined}
      />
    </div>
  );
}
