import { adminService } from 'api/api';
import { common_Variant } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { permittedSizeSystems } from 'utils/size-systems';
import { formatSizeName } from '../utility/sizes';

// R2: variants are first-class now (Create/Archive; archive-not-delete). A colourway's sellable sizes
// are managed here, decoupled from stock (UpdateVariantStock) and the style size chart. New variants
// start at zero stock; the SKU is minted server-side from the colourway base.
export function VariantsPanel({
  colorwayId,
  lockVersion,
  variants = [],
  onChanged,
}: {
  colorwayId: number;
  lockVersion?: number;
  variants?: common_Variant[];
  onChanged?: () => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const [busy, setBusy] = useState(false);
  const [sizeToAdd, setSizeToAdd] = useState<string>('');
  const [pendingArchive, setPendingArchive] = useState<common_Variant | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Style category (the colourway's own topCategory/subCategory/type ids, read from the form) — used
  // to restrict the "add variant" size list to sizes valid for this garment (M7). A bomber must never
  // offer shoe sizes.
  const topCategoryId = useWatch({ name: 'product.productBodyInsert.topCategoryId' }) as
    | string
    | undefined;
  const subCategoryId = useWatch({ name: 'product.productBodyInsert.subCategoryId' }) as
    | string
    | undefined;
  const typeId = useWatch({ name: 'product.productBodyInsert.typeId' }) as string | undefined;
  const categoryId =
    parseInt(typeId || '') || parseInt(subCategoryId || '') || parseInt(topCategoryId || '') || 0;

  const allowedSizeSystems = useMemo(
    () => permittedSizeSystems(dictionary?.categories, dictionary?.categorySizeSystems, categoryId),
    [dictionary?.categories, dictionary?.categorySizeSystems, categoryId],
  );

  const sizeName = (sizeId?: number) => {
    const raw = dictionary?.sizes?.find((s) => s.id === sizeId)?.name ?? String(sizeId ?? '');
    return formatSizeName(raw) || raw;
  };

  const activeVariants = variants.filter((v) => v.status !== 'VARIANT_LIFECYCLE_STATUS_ARCHIVED');
  const archivedVariants = variants.filter((v) => v.status === 'VARIANT_LIFECYCLE_STATUS_ARCHIVED');

  // Sizes not already attached as a variant AND permitted by the style's category (S10/WS5).
  // permittedSizeSystems returns undefined when the category maps to nothing — then show all sizes.
  const availableSizes = useMemo(() => {
    const taken = new Set(variants.map((v) => v.sizeId));
    const allow = allowedSizeSystems?.length ? new Set(allowedSizeSystems) : undefined;
    return (dictionary?.sizes ?? []).filter((s) => {
      if (s.id == null || taken.has(s.id)) return false;
      if (!allow) return true;
      return allow.has(s.skuSystem ?? 'SIZE_SKU_SYSTEM_UNKNOWN');
    });
  }, [dictionary?.sizes, variants, allowedSizeSystems]);

  async function addVariant() {
    const sizeId = sizeToAdd ? parseInt(sizeToAdd, 10) : NaN;
    if (!sizeId || Number.isNaN(sizeId)) {
      showMessage('Pick a size to add', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminService.CreateVariant({
        colorwayId,
        sizeId,
        expectedColorwayVersion: lockVersion,
      });
      showMessage('Variant added', 'success');
      setSizeToAdd('');
      onChanged?.();
    } catch (e) {
      const err = e as Error & { status?: number };
      showMessage(
        err?.status === 409
          ? 'This colourway changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to add variant',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveVariant(v: common_Variant) {
    if (v.variantId == null) return;
    setBusy(true);
    try {
      await adminService.ArchiveVariant({ variantId: v.variantId, expectedVersion: v.lockVersion });
      showMessage('Variant archived', 'success');
      onChanged?.();
    } catch (e) {
      const err = e as Error & { status?: number };
      showMessage(
        err?.status === 409
          ? 'This variant changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to archive variant',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  // Restore = flip the variant's lifecycle back to ACTIVE (no dedicated Unarchive RPC; UpdateVariant's
  // only mutable field is status).
  async function restoreVariant(v: common_Variant) {
    if (v.variantId == null) return;
    setBusy(true);
    try {
      await adminService.UpdateVariant({
        variantId: v.variantId,
        expectedVersion: v.lockVersion,
        patch: { status: 'VARIANT_LIFECYCLE_STATUS_ACTIVE' },
        updateMask: 'status',
      });
      showMessage('Variant restored', 'success');
      onChanged?.();
    } catch (e) {
      const err = e as Error & { status?: number };
      showMessage(
        err?.status === 409
          ? 'This variant changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to restore variant',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='space-y-2 border-t border-textInactiveColor pt-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          sellable sizes &amp; stock
        </Text>
        {archivedVariants.length > 0 && (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='uppercase'
            onClick={() => setShowArchived((s) => !s)}
          >
            {showArchived ? 'hide archived' : `show archived (${archivedVariants.length})`}
          </Button>
        )}
      </div>
      <Text variant='label' size='small'>
        This is where you manage this colourway’s sellable sizes and their stock. Each size is a
        variant with its own SKU and stock count. Add a size to make it sellable; archiving a size
        hides it from the storefront (you can restore it).
      </Text>
      {activeVariants.length === 0 ? (
        <Text variant='label' size='small'>
          no sizes yet — add one below to make this colourway sellable.
        </Text>
      ) : (
        <div className='flex flex-wrap gap-2'>
          {activeVariants.map((v) => (
            <span
              key={v.variantId}
              className='flex items-center gap-2 border border-textInactiveColor px-2 py-1'
            >
              <Text size='small' variant='uppercase'>
                {sizeName(v.sizeId)}
              </Text>
              <Text variant='label' size='small'>
                {v.variantSku || `#${v.variantId}`} · {v.quantity?.value ?? '0'} in stock
              </Text>
              <Button
                type='button'
                size='sm'
                variant='secondary'
                className='uppercase'
                disabled={busy}
                onClick={() => setPendingArchive(v)}
              >
                archive
              </Button>
            </span>
          ))}
        </div>
      )}

      {showArchived && archivedVariants.length > 0 && (
        <div className='flex flex-wrap gap-2 border-t border-textInactiveColor pt-2'>
          {archivedVariants.map((v) => (
            <span
              key={v.variantId}
              className='flex items-center gap-2 border border-dashed border-textInactiveColor px-2 py-1 opacity-70'
            >
              <Text size='small' variant='uppercase'>
                {sizeName(v.sizeId)}
              </Text>
              <Text variant='inactive' size='small'>
                archived
              </Text>
              <Button
                type='button'
                size='sm'
                variant='main'
                className='uppercase'
                disabled={busy}
                onClick={() => restoreVariant(v)}
              >
                restore
              </Button>
            </span>
          ))}
        </div>
      )}

      <div className='flex items-center gap-2'>
        <select
          value={sizeToAdd}
          onChange={(e) => setSizeToAdd(e.target.value)}
          disabled={busy || availableSizes.length === 0}
          className='border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize'
        >
          <option value=''>
            {availableSizes.length === 0 ? 'no sizes available' : 'add size…'}
          </option>
          {availableSizes.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {formatSizeName(s.name) || s.name}
            </option>
          ))}
        </select>
        <Button
          type='button'
          size='sm'
          variant='main'
          className='uppercase'
          disabled={busy || !sizeToAdd}
          onClick={addVariant}
        >
          add variant
        </Button>
      </div>

      <ConfirmationModal
        open={pendingArchive != null}
        onOpenChange={(o) => {
          if (!o) setPendingArchive(null);
        }}
        onConfirm={() => {
          const v = pendingArchive;
          setPendingArchive(null);
          if (v) archiveVariant(v);
        }}
        onCancel={() => setPendingArchive(null)}
      >
        <Text variant='uppercase' className='font-bold'>
          archive size {pendingArchive ? sizeName(pendingArchive.sizeId) : ''}? it will stop being
          sellable — you can restore it later.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
