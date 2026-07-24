import { common_Material } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { useAddMaterialPrice, useMaterialPrices } from './useMaterials';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// Price history timeline (🔒 costing) + AddMaterialPrice. New prices are `manual`;
// `production_run`-sourced entries are written by receiving a production run.
export function MaterialPricesModal({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material?: common_Material;
}) {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const materialId = material?.id ?? 0;
  const { data, isLoading } = useMaterialPrices(
    materialId,
    open && canReadCosting && materialId > 0,
  );
  const add = useAddMaterialPrice();

  // valid_from is REQUIRED by the server (dto/material.go, parseMaterialPrice) but reads as
  // optional in this grid, so a blank date produced a rejection pointing at an unlabelled box.
  // Default it to today: "this is the price from now on" is what adding a price almost always
  // means, and an explicit date is still one click away.
  const [form, setForm] = useState({
    price: '',
    currency: 'EUR',
    validFrom: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const prices = data?.prices ?? [];

  // The catalog price must be NET (ex-VAT): it feeds BOM costing and, at receive time, the net
  // goes to stock (1110) while the VAT goes to 2080 VAT Input separately. An invoice usually
  // quotes GROSS, so give a one-step converter instead of trusting mental arithmetic — entering
  // gross here quietly inflates every downstream cost by the VAT rate.
  const [gross, setGross] = useState({ amount: '', ratePct: '23' });
  const grossToNet = () => {
    const g = parseFloat(gross.amount.replace(/,/g, '.'));
    const r = parseFloat(gross.ratePct.replace(/,/g, '.'));
    if (!Number.isFinite(g) || g <= 0 || !Number.isFinite(r) || r < 0) {
      showMessage('Enter the gross amount and a VAT rate', 'error');
      return;
    }
    const net = g / (1 + r / 100);
    setForm((f) => ({ ...f, price: net.toFixed(4) }));
  };

  const submit = () => {
    if (!form.price.trim()) {
      showMessage('Price is required', 'error');
      return;
    }
    if (!form.validFrom) {
      showMessage('Valid-from date is required', 'error');
      return;
    }
    add.mutate(
      {
        materialId,
        price: { value: form.price.trim() },
        currency: form.currency,
        validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : undefined,
        source: 'manual',
        note: form.note.trim(),
      },
      {
        onSuccess: () => {
          setForm({ price: '', currency: 'EUR', validFrom: '', note: '' });
          showMessage('Price added', 'success');
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to add price', 'error'),
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      // Stay open: "add price" is a multi-add flow (onSuccess resets the row for the next
      // entry), and a validation error must not dismiss the dialog.
      closeOnConfirm={false}
      title={`prices · ${material?.name ?? ''}`}
      confirmLabel={add.isPending ? 'adding…' : 'add price'}
      confirmDisabled={!canWriteCosting || add.isPending}
    >
      <div className='flex min-w-[min(92vw,32rem)] flex-col gap-3'>
        {!canReadCosting ? (
          <Text variant='inactive' size='small'>
            prices are hidden (requires costing access)
          </Text>
        ) : (
          <>
            <div className='flex flex-col gap-1'>
              <Text variant='uppercase' size='small'>
                history
              </Text>
              {isLoading ? (
                <Text size='small'>loading…</Text>
              ) : prices.length === 0 ? (
                <Text variant='inactive' size='small'>
                  no prices yet
                </Text>
              ) : (
                prices.map((p, i) => (
                  <div key={i} className='flex justify-between border border-textInactiveColor p-2'>
                    <Text size='small'>
                      {decimalToInput(p.price)} {p.currency}
                    </Text>
                    <Text variant='inactive' size='small'>
                      {p.validFrom ? p.validFrom.slice(0, 10) : '—'} · {p.source || 'manual'}
                      {p.note ? ` · ${p.note}` : ''}
                    </Text>
                  </div>
                ))
              )}
            </div>

            {canWriteCosting && (
              <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
                <Text variant='uppercase' size='small'>
                  add price — NET, ex-VAT
                </Text>
                <Text variant='inactive' size='small'>
                  enter the price WITHOUT VAT: net goes to stock and costing; the VAT itself is
                  recorded on the receipt (input VAT → 2080). typing the gross here inflates every
                  BOM estimate and COGS by the VAT rate.
                </Text>
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  <input
                    className={cell}
                    type='number'
                    step='0.0001'
                    min='0'
                    placeholder='price (net, ex-VAT)'
                    title='net unit price, ex-VAT'
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  />
                  <select
                    className={cell}
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  >
                    {EXPENSE_CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.value}
                      </option>
                    ))}
                  </select>
                  <input
                    className={cell}
                    type='date'
                    title='valid from (required)'
                    aria-label='valid from'
                    value={form.validFrom}
                    onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                  />
                  <input
                    className={cell}
                    placeholder='note'
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </div>
                {/* Invoice-quotes-gross helper: gross ÷ (1 + rate/100) → the net field above. */}
                <div className='flex flex-wrap items-center gap-2'>
                  <Text variant='inactive' size='small'>
                    invoice shows gross?
                  </Text>
                  <input
                    className={`${cell} w-28`}
                    type='number'
                    step='0.0001'
                    min='0'
                    placeholder='gross'
                    aria-label='gross amount'
                    value={gross.amount}
                    onChange={(e) => setGross((g) => ({ ...g, amount: e.target.value }))}
                  />
                  <input
                    className={`${cell} w-16`}
                    type='number'
                    step='0.1'
                    min='0'
                    placeholder='VAT %'
                    aria-label='VAT rate percent'
                    value={gross.ratePct}
                    onChange={(e) => setGross((g) => ({ ...g, ratePct: e.target.value }))}
                  />
                  <button
                    type='button'
                    onClick={grossToNet}
                    className='underline underline-offset-2 hover:opacity-70'
                  >
                    <Text size='small'>→ fill net</Text>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ConfirmationModal>
  );
}
