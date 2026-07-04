import { useCallback, useEffect, useMemo, useState } from 'react';
import { Control, useWatch } from 'react-hook-form';
import { HeroPreview } from './hero-preview';
import { mapFormToHeroFull } from './map-form-to-hero-full';
import { HeroSchema } from './schema';
import { useProductsByTag } from './useProductsByTag';

interface HeroPreviewPanelProps {
  control: Control<HeroSchema>;
  /** Live uid-keyed product cache (lifted to Hero) so product edits show in the preview. */
  products: Record<string, any[]>;
  deletedIndicesRef: React.MutableRefObject<Set<string>>;
  /** Bumped when the soft-deleted set changes, so the draft re-excludes/re-includes blocks. */
  deletedVersion: number;
  onBlockClick: (index: number) => void;
}

// Hidden per-tag-block loader: resolves the products for a FEATURED_PRODUCTS_TAG
// block's tag (the same query the storefront resolves under the hood) and reports
// them by uid, so the preview can render the block with real product media
// instead of empty.
function TagProductsLoader({
  uid,
  tag,
  onProducts,
}: {
  uid: string;
  tag: string;
  onProducts: (uid: string, products: any[]) => void;
}) {
  const { data } = useProductsByTag(tag, true);
  useEffect(() => {
    onProducts(uid, data || []);
  }, [data, uid, onProducts]);
  return null;
}

/**
 * Owns the per-keystroke useWatch so only this subtree re-renders on form edits
 * (the canvas stays put; the iframe stays mounted and the push is debounced).
 * Builds the hydrated draft from live form values, dropping soft-deleted blocks
 * so the preview and its block-click indices match what will actually be saved.
 *
 * FEATURED_PRODUCTS_TAG blocks have no picked products; their products are fetched
 * by tag here and merged into the uid-keyed product map the mapper reads.
 */
export function HeroPreviewPanel({
  control,
  products,
  deletedIndicesRef,
  deletedVersion,
  onBlockClick,
}: HeroPreviewPanelProps) {
  const values = useWatch({ control });
  const [tagProducts, setTagProducts] = useState<Record<string, any[]>>({});

  const handleTagProducts = useCallback((uid: string, prods: any[]) => {
    // React Query returns a stable array ref until the data changes, so this
    // no-ops after the first set and can't loop.
    setTagProducts((prev) => (prev[uid] === prods ? prev : { ...prev, [uid]: prods }));
  }, []);

  const tagBlocks = (((values?.entities as any[]) || []) as any[]).filter(
    (e) =>
      e?.type === 'HERO_TYPE_FEATURED_PRODUCTS_TAG' &&
      e?.featuredProductsTag?.tag &&
      !deletedIndicesRef.current.has(e?._uid),
  );

  const mergedProducts = useMemo(() => ({ ...products, ...tagProducts }), [products, tagProducts]);

  const draft = useMemo(() => {
    const entities = (((values?.entities as any[]) || []) as any[]).filter(
      (e) => !deletedIndicesRef.current.has(e?._uid),
    );
    return mapFormToHeroFull({ ...(values as HeroSchema), entities }, mergedProducts);
    // deletedIndicesRef is stable; deletedVersion forces a recompute on soft-delete change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, deletedVersion, mergedProducts]);

  return (
    <>
      {tagBlocks.map((e) => (
        <TagProductsLoader
          key={e._uid}
          uid={e._uid}
          tag={e.featuredProductsTag.tag}
          onProducts={handleTagProducts}
        />
      ))}
      <HeroPreview hero={draft} onBlockClick={onBlockClick} />
    </>
  );
}
