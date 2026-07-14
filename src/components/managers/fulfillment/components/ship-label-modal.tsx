import * as Dialog from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { emptyParcel, GeneratedLabel, ShippingOptionVM, ShippingParcel } from '../api/types';
import {
  useGenerateShippingLabel,
  useShipFulfillmentOrder,
  useShippingLabelPrep,
  useShippingOptions,
  useVoidShippingLabel,
} from '../hooks/useFulfillment';

// Shipping the order. A single modal that adapts to whether Sendcloud labels are
// configured:
//   • labels enabled, no label yet  → parcel form (pre-filled from tech cards,
//     editable) + optional carrier-rate pick → GenerateShippingLabel (announces
//     the parcel, gets the carrier label + tracking, does the shipped transition).
//   • a label already exists (just generated, or reopened on a shipped order)
//     → print/download the PDF, copy the tracking, or void it (reverts to
//     confirmed so it can be regenerated).
//   • labels NOT enabled → the manual tracking-code fallback (unchanged behaviour).
// All ship paths email the customer and are irreversible except via void.
export function ShipLabelModal({
  open,
  onOpenChange,
  orderUuid,
  orderLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderUuid: string | null;
  orderLabel: string;
}) {
  const prep = useShippingLabelPrep(orderUuid, open);
  const manualShip = useShipFulfillmentOrder();
  const options = useShippingOptions();
  const generate = useGenerateShippingLabel();
  const voidLabel = useVoidShippingLabel();

  const [parcel, setParcel] = useState<ShippingParcel>(emptyParcel());
  const [dirty, setDirty] = useState(false); // operator touched the parcel
  const [manualTracking, setManualTracking] = useState('');
  const [rates, setRates] = useState<ShippingOptionVM[] | null>(null);
  const [selectedCode, setSelectedCode] = useState(''); // '' = let Sendcloud rules pick
  const [generated, setGenerated] = useState<GeneratedLabel | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);

  // Reset per-order state whenever the modal closes.
  useEffect(() => {
    if (open) return;
    setDirty(false);
    setManualTracking('');
    setRates(null);
    setSelectedCode('');
    setGenerated(null);
    setConfirmVoid(false);
  }, [open]);

  // Seed the parcel from the backend default once per open — but never clobber the
  // operator's overrides on a background refetch (see notes-baseline pattern).
  useEffect(() => {
    if (open && prep.data && !dirty) setParcel(prep.data.parcel);
  }, [open, prep.data, dirty]);

  const d = prep.data;

  function editParcel(patch: Partial<ShippingParcel>) {
    setDirty(true);
    setRates(null); // parcel changed → prior quotes are stale
    setSelectedCode('');
    setParcel((p) => ({ ...p, ...patch }));
  }

  function doManualShip() {
    if (!orderUuid || !manualTracking.trim()) return;
    manualShip.mutate(
      { orderUuid, trackingCode: manualTracking.trim() },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function fetchRates() {
    if (!orderUuid || parcel.weightGrams <= 0) return;
    options.mutate({ orderUuid, parcel }, { onSuccess: (r) => setRates(r) });
  }

  function doGenerate() {
    if (!orderUuid || parcel.weightGrams <= 0) return;
    generate.mutate(
      { orderUuid, parcel, shippingOptionCode: selectedCode || undefined },
      { onSuccess: (r) => setGenerated(r) },
    );
  }

  function doVoid() {
    if (!orderUuid) return;
    voidLabel.mutate(orderUuid, {
      onSuccess: () => {
        setGenerated(null);
        setConfirmVoid(false);
        prep.refetch();
      },
    });
  }

  // The label we currently have to show (freshly generated OR a pre-existing one).
  const labelUrl = generated?.labelUrl || (d?.alreadyGenerated ? d.labelUrl : '');
  const trackingCode = generated?.trackingCode || (d?.alreadyGenerated ? d.trackingCode : '');
  const carrierName = generated?.carrierName || d?.carrierName || '';
  const hasLabel = !!labelUrl;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          aria-describedby={undefined}
          className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col gap-4 overflow-y-auto border border-textInactiveColor bg-bgColor p-4 text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[30rem] lg:-translate-x-1/2'
        >
          <div className='flex items-center justify-between gap-2 border-b border-textInactiveColor pb-2'>
            <Dialog.Title className='text-lg uppercase'>ship order {orderLabel}</Dialog.Title>
            <Dialog.Close asChild>
              <Button type='button' aria-label='close'>
                [x]
              </Button>
            </Dialog.Close>
          </div>

          {prep.isLoading ? (
            <Text variant='inactive' className='animate-pulse py-6 text-center uppercase'>
              preparing label…
            </Text>
          ) : prep.isError ? (
            <div className='flex flex-col items-start gap-2'>
              <Text variant='error' size='small'>
                {prep.error instanceof Error ? prep.error.message : 'Failed to prepare the label'}
              </Text>
              <Button variant='secondary' size='lg' onClick={() => prep.refetch()}>
                retry
              </Button>
            </div>
          ) : hasLabel ? (
            /* ---------- Label ready (just generated, or reopened) ---------- */
            <div className='flex flex-col gap-3'>
              <Text size='small'>
                Label ready. The order is <span className='uppercase'>shipped</span> and the
                customer has been emailed.
              </Text>
              <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
                {carrierName && (
                  <Text variant='label' size='small'>
                    carrier · {carrierName}
                  </Text>
                )}
                <div className='flex items-center gap-2'>
                  <Text variant='label' size='small'>
                    tracking
                  </Text>
                  {trackingCode ? (
                    <CopyToClipboard text={trackingCode} />
                  ) : (
                    <Text size='small'>—</Text>
                  )}
                </div>
              </div>

              <Button asChild variant='main' size='lg'>
                <a href={labelUrl} target='_blank' rel='noopener noreferrer'>
                  print / download sticker (PDF)
                </a>
              </Button>

              {!confirmVoid ? (
                <Button variant='secondary' size='lg' onClick={() => setConfirmVoid(true)}>
                  void label
                </Button>
              ) : (
                <div className='flex flex-col gap-2 border border-textInactiveColor p-3'>
                  <Text variant='error' size='small'>
                    Cancel the carrier label and revert the order to confirmed? You can regenerate
                    afterwards.
                  </Text>
                  <div className='flex justify-end gap-2'>
                    <Button variant='secondary' size='lg' onClick={() => setConfirmVoid(false)}>
                      keep
                    </Button>
                    <Button
                      variant='main'
                      size='lg'
                      loading={voidLabel.isPending}
                      disabled={voidLabel.isPending}
                      onClick={doVoid}
                    >
                      void
                    </Button>
                  </div>
                </div>
              )}

              <div className='flex justify-end'>
                <Button variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
                  done
                </Button>
              </div>
            </div>
          ) : d && !d.labelsEnabled ? (
            /* ---------- Manual tracking-code fallback ---------- */
            <div className='flex flex-col gap-4'>
              <Text variant='label' size='small'>
                Sendcloud isn’t configured — enter the carrier’s tracking code manually.
              </Text>
              <label className='flex flex-col gap-1'>
                <Text variant='label' size='small' component='span'>
                  tracking code
                </Text>
                <Input
                  name='tracking-code'
                  autoFocus
                  placeholder='e.g. 1Z999AA10123456784'
                  value={manualTracking}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setManualTracking(e.target.value)
                  }
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      doManualShip();
                    }
                  }}
                />
              </label>
              <Text variant='label' size='small'>
                Records the tracking code, moves the order to shipped and emails the customer.
              </Text>
              <div className='flex justify-end gap-2'>
                <Button variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
                  cancel
                </Button>
                <Button
                  variant='main'
                  size='lg'
                  loading={manualShip.isPending}
                  disabled={!manualTracking.trim() || manualShip.isPending}
                  onClick={doManualShip}
                >
                  ship
                </Button>
              </div>
            </div>
          ) : (
            /* ---------- Label form (Sendcloud enabled) ---------- */
            <div className='flex flex-col gap-4'>
              {carrierName && (
                <Text variant='label' size='small'>
                  default carrier · {carrierName}
                </Text>
              )}
              {d && !d.complete && (
                <div className='border border-textInactiveColor p-3'>
                  <Text variant='error' size='small'>
                    Some products have no packaging weight in their tech card — review the parcel
                    before generating.
                    {d.missingProductIds.length > 0 &&
                      ` (product${d.missingProductIds.length > 1 ? 's' : ''} ${d.missingProductIds.join(', ')})`}
                  </Text>
                </div>
              )}

              <div className='grid grid-cols-2 gap-3'>
                <NumField
                  label='weight (g)'
                  value={parcel.weightGrams}
                  onChange={(n) => editParcel({ weightGrams: n })}
                />
                <TextField
                  label='box type'
                  value={parcel.boxType}
                  placeholder='custom'
                  onChange={(v) => editParcel({ boxType: v })}
                />
                <NumField
                  label='length (cm)'
                  value={parcel.lengthCm}
                  onChange={(n) => editParcel({ lengthCm: n })}
                />
                <NumField
                  label='width (cm)'
                  value={parcel.widthCm}
                  onChange={(n) => editParcel({ widthCm: n })}
                />
                <NumField
                  label='height (cm)'
                  value={parcel.heightCm}
                  onChange={(n) => editParcel({ heightCm: n })}
                />
              </div>

              {/* Carrier service — optional; blank lets Sendcloud rules choose. */}
              <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
                <div className='flex items-center justify-between gap-2'>
                  <Text variant='label' size='small'>
                    carrier service
                  </Text>
                  <Button
                    variant='secondary'
                    size='sm'
                    loading={options.isPending}
                    disabled={options.isPending || parcel.weightGrams <= 0}
                    onClick={fetchRates}
                  >
                    {rates ? 'refresh rates' : 'get rates'}
                  </Button>
                </div>
                {rates ? (
                  <div className='flex flex-col gap-1'>
                    <OptionRow
                      selected={selectedCode === ''}
                      onSelect={() => setSelectedCode('')}
                      label='Sendcloud rules pick the carrier'
                    />
                    {rates.map((o) => (
                      <OptionRow
                        key={o.code}
                        selected={selectedCode === o.code}
                        onSelect={() => setSelectedCode(o.code)}
                        label={`${o.carrierName}${o.productName ? ` · ${o.productName}` : ''}`}
                        meta={[
                          o.totalCharge ? `${o.totalCharge} ${o.currency}`.trim() : '',
                          o.transitDays ? `${o.transitDays}d` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                    ))}
                    {rates.length === 0 && (
                      <Text variant='label' size='small'>
                        No options returned for this parcel.
                      </Text>
                    )}
                  </div>
                ) : (
                  <Text variant='label' size='small'>
                    Optional — leave blank to let Sendcloud shipping rules choose the carrier.
                  </Text>
                )}
              </div>

              <div className='flex justify-end gap-2 border-t border-textInactiveColor pt-3'>
                <Button variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
                  cancel
                </Button>
                <Button
                  variant='main'
                  size='lg'
                  loading={generate.isPending}
                  disabled={parcel.weightGrams <= 0 || generate.isPending}
                  onClick={doGenerate}
                >
                  generate label
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <Text variant='label' size='small' component='span'>
        {label}
      </Text>
      <Input
        name={label}
        type='number'
        inputMode='numeric'
        min={0}
        value={value === 0 ? '' : String(value)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))
        }
      />
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <Text variant='label' size='small' component='span'>
        {label}
      </Text>
      <Input
        name={label}
        value={value}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </label>
  );
}

function OptionRow({
  selected,
  onSelect,
  label,
  meta,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  meta?: string;
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex items-center justify-between gap-2 border px-3 py-2 text-left text-textBaseSize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        selected
          ? 'border-textColor bg-textColor text-bgColor'
          : 'border-textInactiveColor hover:border-textColor',
      )}
    >
      <span className='min-w-0 truncate'>{label}</span>
      {meta && <span className='shrink-0 text-[10px] uppercase opacity-80'>{meta}</span>}
    </button>
  );
}
