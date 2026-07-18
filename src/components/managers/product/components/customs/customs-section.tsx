import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import {
  CustomsForm,
  emptyCustoms,
  useProductCustoms,
  useSetProductCustoms,
} from './useProductCustoms';

// Imperative handle so the main colourway Save can flush a dirty customs block (its country of
// origin is entered once in Details and must not drift from the shipping-label customs record).
export type ProductCustomsHandle = {
  // Persist the customs block when it is dirty AND valid. Resolves on success or when there is
  // nothing to flush; REJECTS when SetColorwayCustoms fails so the caller can show a non-fatal
  // message without reverting the (already-succeeded) colourway save.
  flushIfDirty: () => Promise<void>;
};

// Self-contained customs editor for one product — loads and saves via its own RPCs,
// independent of the main product form's edit/save. HS code + country of origin are
// required for international (non-EU) shipping labels.
export function ProductCustomsSection({
  productId,
  canWrite,
  isLive = false,
  ref,
}: {
  productId: number;
  canWrite: boolean;
  // Whether the colourway is live on the storefront — an incomplete-customs warning is escalated for
  // a live product (its international labels will actually be rejected).
  isLive?: boolean;
  // Lets the parent (main colourway Save) flush this block imperatively — see ProductCustomsHandle.
  ref?: Ref<ProductCustomsHandle>;
}) {
  const { data, isLoading, isError, refetch } = useProductCustoms(productId);
  const save = useSetProductCustoms(productId);
  const { showMessage } = useSnackBarStore();

  // Country of origin is a single fact, shared with the product's merchandising country. It is entered
  // ONCE in Details (the country picker) and read from the shared form here, so customs and merch can
  // never silently disagree. It is still persisted through customs' own RPC (below), so both writes
  // carry the same value. Fall back to the stored customs value when merch has none, so an existing
  // customs-only country is never wiped.
  const merchCountry =
    (useWatch({ name: 'product.productBodyInsert.countryOfOrigin' }) as string) || '';

  const [form, setForm] = useState<CustomsForm>(emptyCustoms);
  const [baseline, setBaseline] = useState<CustomsForm | null>(null);

  const countryOfOrigin = merchCountry || form.countryOfOrigin;
  // What "save customs" sends: the locally-edited hs code / description plus the shared country.
  const outgoing: CustomsForm = { ...form, countryOfOrigin };

  const missingRequired = !form.hsCode.trim() || !countryOfOrigin.trim();

  // Seed once — a background refetch must not clobber in-progress edits.
  useEffect(() => {
    if (data && baseline === null) {
      setForm(data);
      setBaseline(data);
    }
  }, [data, baseline]);

  // Dirty when the hs code / description changed OR the shared country differs from what customs has
  // stored — the latter nudges the operator to reconcile a country that was changed in Details.
  const dirty = baseline ? JSON.stringify(outgoing) !== JSON.stringify(baseline) : false;

  function set<K extends keyof CustomsForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSave() {
    if (!dirty || save.isPending) return;
    save.mutate(outgoing, {
      onSuccess: () => {
        setBaseline(outgoing);
        showMessage('Customs data saved', 'success');
      },
      onError: (e) =>
        showMessage(e instanceof Error ? e.message : 'Failed to save customs', 'error'),
    });
  }

  // Flush path for the main colourway Save. Skip when there is nothing to persist, when required
  // fields are missing (the inline warning already nudges — don't fire a doomed write on every
  // save), or when a save is already running. Reuses `save` but WITHOUT its own toast so the caller
  // owns the message; rejects on failure so the caller can keep it non-fatal.
  useImperativeHandle(
    ref,
    () => ({
      async flushIfDirty() {
        if (!dirty || missingRequired || save.isPending) return;
        await save.mutateAsync(outgoing);
        setBaseline(outgoing);
      },
    }),
    [dirty, missingRequired, outgoing, save],
  );

  if (isLoading) {
    return (
      <Text variant='inactive' size='small' className='animate-pulse uppercase'>
        loading…
      </Text>
    );
  }

  if (isError) {
    return (
      <div className='flex flex-col items-start gap-2'>
        <Text variant='error' size='small'>
          Failed to load customs data.
        </Text>
        <Button variant='secondary' size='lg' onClick={() => refetch()}>
          retry
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='label' size='small'>
        Used to build international (non-EU) shipping labels. Without an HS code and country of
        origin the carrier rejects the customs declaration.
      </Text>

      {missingRequired && (
        <div
          role='alert'
          className={`border px-2 py-1 ${
            isLive ? 'border-error text-error' : 'border-textInactiveColor'
          }`}
        >
          <Text size='small' variant={isLive ? 'error' : 'label'} component='span'>
            {isLive
              ? 'This colourway is LIVE but customs is incomplete. International shipping labels will be rejected until it has an HS code (below) and a country of origin (set in Details).'
              : 'Customs is incomplete. An HS code (below) and country of origin (set in Details) are required before this ships internationally.'}
          </Text>
        </div>
      )}

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <label className='flex flex-col gap-1'>
          <Text variant='label' size='small' component='span'>
            HS code · required
          </Text>
          <Input
            name='customs-hs-code'
            placeholder='e.g. 6109100010'
            disabled={!canWrite}
            aria-required
            value={form.hsCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('hsCode', e.target.value)}
          />
        </label>
        {/* Country of origin is the SAME fact as the product's merchandising country — shown here
            read-only and edited once in Details, so the two can't drift. Saving customs still persists
            it (see `outgoing`), so both the colourway and customs writes carry the identical value. */}
        <div className='flex flex-col gap-1'>
          <Text variant='label' size='small' component='span'>
            country of origin (ISO-2) · required
          </Text>
          <Text size='small' className={countryOfOrigin ? undefined : 'text-textInactiveColor'}>
            {countryOfOrigin || 'set it in Details → country of origin'}
          </Text>
          <Text variant='label' size='small' component='span'>
            shared with the product’s country of origin; edit it in Details and it saves here too.
          </Text>
        </div>
      </div>

      <label className='flex flex-col gap-1'>
        <Text variant='label' size='small' component='span'>
          customs description
        </Text>
        <textarea
          name='customs-description'
          rows={2}
          maxLength={2000}
          disabled={!canWrite}
          placeholder='e.g. Men’s knitted cotton t-shirt'
          className='w-full resize-y rounded-none border border-textInactiveColor bg-bgColor p-2 text-textBaseSize transition-colors focus:border-textColor focus:outline-none disabled:opacity-60'
          value={form.customsDescription}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            set('customsDescription', e.target.value)
          }
        />
      </label>

      {canWrite && (
        <div className='flex justify-end'>
          <Button
            type='button'
            variant='main'
            size='lg'
            loading={save.isPending}
            disabled={!dirty || save.isPending}
            onClick={onSave}
          >
            save customs
          </Button>
        </div>
      )}
    </div>
  );
}
