import { Control, useWatch } from 'react-hook-form';
import { useMemo } from 'react';
import { HeroPreview } from './hero-preview';
import { mapFormToHeroFull } from './map-form-to-hero-full';
import { HeroSchema } from './schema';

interface HeroPreviewPanelProps {
  control: Control<HeroSchema>;
  /** Live uid-keyed product cache (lifted to Hero) so product edits show in the preview. */
  products: Record<string, any[]>;
  deletedIndicesRef: React.MutableRefObject<Set<string>>;
  /** Bumped when the soft-deleted set changes, so the draft re-excludes/re-includes blocks. */
  deletedVersion: number;
  onBlockClick: (index: number) => void;
}

/**
 * Owns the per-keystroke useWatch so only this subtree re-renders on form edits
 * (the canvas stays put; the iframe stays mounted and the push is debounced).
 * Builds the hydrated draft from live form values, dropping soft-deleted blocks
 * so the preview and its block-click indices match what will actually be saved.
 */
export function HeroPreviewPanel({
  control,
  products,
  deletedIndicesRef,
  deletedVersion,
  onBlockClick,
}: HeroPreviewPanelProps) {
  const values = useWatch({ control });

  const draft = useMemo(() => {
    const entities = (((values?.entities as any[]) || []) as any[]).filter(
      (e) => !deletedIndicesRef.current.has(e?._uid),
    );
    return mapFormToHeroFull({ ...(values as HeroSchema), entities }, products);
    // deletedIndicesRef is stable; deletedVersion forces a recompute on soft-delete change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, deletedVersion, products]);

  return <HeroPreview hero={draft} onBlockClick={onBlockClick} />;
}
