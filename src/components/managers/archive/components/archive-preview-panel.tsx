import { useMemo } from 'react';
import { Control, useWatch } from 'react-hook-form';
import { ArchivePreview } from './archive-preview';
import { mapFormToArchiveFull } from './map-form-to-full';
import { ArchiveFormData } from './schema';

interface ArchivePreviewPanelProps {
  control: Control<ArchiveFormData>;
  /** Live uid-keyed product cache (lifted to ArchiveForm) so product edits show in the preview. */
  products: Record<string, any[]>;
  deletedIndicesRef: React.MutableRefObject<Set<string>>;
  /** Bumped when the soft-deleted set changes, so the draft re-excludes/re-includes blocks. */
  deletedVersion: number;
  onBlockClick: (index: number) => void;
}

/**
 * Owns the per-keystroke useWatch so only this subtree re-renders on form edits
 * (the iframe stays mounted, the push is debounced). Builds the hydrated draft
 * from live form values, dropping soft-deleted blocks so the preview and its
 * block-click indices match what will actually be saved. Mirrors HeroPreviewPanel.
 */
export function ArchivePreviewPanel({
  control,
  products,
  deletedIndicesRef,
  deletedVersion,
  onBlockClick,
}: ArchivePreviewPanelProps) {
  const values = useWatch({ control });

  const draft = useMemo(() => {
    const items = (((values?.items as any[]) || []) as any[]).filter(
      (e) => !deletedIndicesRef.current.has(e?._uid),
    );
    return mapFormToArchiveFull({ ...(values as ArchiveFormData), items }, products);
    // deletedIndicesRef is stable; deletedVersion forces a recompute on soft-delete change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, deletedVersion, products]);

  return <ArchivePreview archive={draft} onBlockClick={onBlockClick} />;
}
