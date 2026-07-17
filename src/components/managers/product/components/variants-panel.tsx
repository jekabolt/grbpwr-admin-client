import { adminService } from 'api/api';
import { common_Variant } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
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

  const sizeName = (sizeId?: number) => {
    const raw = dictionary?.sizes?.find((s) => s.id === sizeId)?.name ?? String(sizeId ?? '');
    return formatSizeName(raw) || raw;
  };

  const activeVariants = variants.filter(
    (v) => v.status !== 'VARIANT_LIFECYCLE_STATUS_ARCHIVED',
  );

  // Sizes not already attached as a variant — candidates for CreateVariant.
  const availableSizes = useMemo(() => {
    const taken = new Set(variants.map((v) => v.sizeId));
    return (dictionary?.sizes ?? []).filter((s) => s.id != null && !taken.has(s.id));
  }, [dictionary?.sizes, variants]);

  async function addVariant() {
    const sizeId = sizeToAdd ? parseInt(sizeToAdd, 10) : NaN;
    if (!sizeId || Number.isNaN(sizeId)) {
      showMessage('Pick a size to add', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminService.CreateVariant({ colorwayId, sizeId, expectedColorwayVersion: lockVersion });
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

  return (
    <div className='space-y-2 border-t border-textInactiveColor pt-3'>
      <Text variant='uppercase' size='small'>
        variants
      </Text>
      {activeVariants.length === 0 ? (
        <Text variant='inactive' size='small'>
          no variants yet — add a size below to make this colourway sellable.
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
              <Text variant='inactive' size='small'>
                {v.variantSku || `#${v.variantId}`} · {v.quantity?.value ?? '0'}
              </Text>
              <Button
                type='button'
                size='sm'
                variant='secondary'
                className='uppercase'
                disabled={busy}
                onClick={() => archiveVariant(v)}
              >
                archive
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
          <option value=''>add size…</option>
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
    </div>
  );
}
