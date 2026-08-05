import { adminService } from 'api/api';
import { SecondsVariant } from 'api/proto-http/admin';
import { SELLING_CURRENCIES, currencySymbols } from 'constants/constants';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { formatSizeName } from '../utility/sizes';

// B-grade seconds surface (0251). B variants are factory seconds of this SAME colourway
// (product_size.grade='B', '-B'-suffixed SKU, own stock) minted only by the production receive /
// refund (disposition = seconds) paths — this panel is a pure price editor + read view, never
// create/archive. A row is sellable only once it carries a price; SetVariantPrice is a full
// replace, so an empty save intentionally clears prices and un-sells the row again.
export function SecondsPanel({ colorwayId }: { colorwayId: number }) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const [rows, setRows] = useState<SecondsVariant[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    if (!colorwayId) return;
    adminService
      .ListVariantSeconds({ colorwayId })
      .then((res) => {
        const seconds = res.seconds ?? [];
        setRows(seconds);
        setDrafts((prev) => {
          const next: Record<number, Record<string, string>> = {};
          for (const row of seconds) {
            const variantId = row.variant?.variantId;
            if (variantId == null) continue;
            const byCurrency: Record<string, string> = {};
            for (const c of SELLING_CURRENCIES) {
              const existing = row.prices?.find((p) => p.currency === c.value);
              byCurrency[c.value] = existing?.price?.value ?? prev[variantId]?.[c.value] ?? '';
            }
            next[variantId] = byCurrency;
          }
          return next;
        });
      })
      .catch(() => {
        // no B-grade variants for this colourway yet — the panel renders nothing
        setRows([]);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorwayId]);

  const sizeName = (sizeId?: number) => {
    const raw = dictionary?.sizes?.find((s) => s.id === sizeId)?.name ?? String(sizeId ?? '');
    return formatSizeName(raw) || raw;
  };

  const setDraft = (variantId: number, currency: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [variantId]: { ...prev[variantId], [currency]: value },
    }));
  };

  async function savePrice(row: SecondsVariant) {
    const variantId = row.variant?.variantId;
    if (variantId == null) return;
    const byCurrency = drafts[variantId] ?? {};
    const filled = SELLING_CURRENCIES.filter((c) => (byCurrency[c.value] ?? '').trim() !== '');

    // EUR is the base currency — the server rejects a non-empty price set without it. Catch it here
    // so the operator doesn't round-trip on a 400.
    if (filled.length > 0 && !filled.some((c) => c.value === 'EUR')) {
      showMessage('EUR price is required whenever any price is set', 'error');
      return;
    }

    const prices = filled.map((c) => ({
      currency: c.value,
      price: { value: byCurrency[c.value] },
    }));

    setBusyId(variantId);
    try {
      await adminService.SetVariantPrice({ variantId, prices });
      showMessage(
        prices.length > 0
          ? 'Seconds price saved'
          : 'Prices cleared — variant is no longer sellable',
        'success',
      );
      load();
    } catch (e) {
      const err = e as Error;
      showMessage(err instanceof Error ? err.message : 'Failed to save price', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className='space-y-2 border-t border-textInactiveColor pt-3'>
      <Text variant='uppercase' size='small'>
        seconds (b-grade)
      </Text>
      <Text variant='label' size='small'>
        Factory seconds of this colourway — own stock and SKU, minted by production receipts. A row
        is sellable only once priced; clearing all prices makes it unsellable again.
      </Text>
      <div className='space-y-3'>
        {rows.map((row) => {
          const v = row.variant;
          const variantId = v?.variantId;
          if (variantId == null) return null;
          const isSellable = (row.prices?.length ?? 0) > 0;
          const byCurrency = drafts[variantId] ?? {};
          const busy = busyId === variantId;

          return (
            <div key={variantId} className='space-y-2 border border-textInactiveColor p-2'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Text size='small' variant='uppercase'>
                    {sizeName(v?.sizeId)}
                  </Text>
                  <Text variant='label' size='small'>
                    {v?.variantSku || `#${variantId}`} · {v?.quantity?.value ?? '0'} in stock ·{' '}
                    {(v?.status || 'VARIANT_LIFECYCLE_STATUS_UNKNOWN')
                      .replace('VARIANT_LIFECYCLE_STATUS_', '')
                      .toLowerCase()}
                  </Text>
                </div>
                {!isSellable && (
                  <Text variant='error' size='small'>
                    not sellable — no price
                  </Text>
                )}
              </div>

              <div className='grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4'>
                {SELLING_CURRENCIES.map((c) => {
                  const isIntegerCurrency = c.value === 'JPY' || c.value === 'KRW';
                  return (
                    <div key={c.value} className='flex flex-col gap-1'>
                      <Text variant='inactive' size='small'>
                        {c.value} {currencySymbols[c.value] ?? ''}
                        {c.value === 'EUR' ? ' *' : ''}
                      </Text>
                      <Input
                        type='number'
                        step={isIntegerCurrency ? '1' : '0.01'}
                        min='0'
                        placeholder={isIntegerCurrency ? '0' : '0.00'}
                        disabled={busy}
                        value={byCurrency[c.value] ?? ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setDraft(variantId, c.value, e.target.value)
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className='flex justify-end'>
                <Button
                  type='button'
                  size='sm'
                  variant='main'
                  className='uppercase'
                  disabled={busy}
                  onClick={() => savePrice(row)}
                >
                  save price
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
