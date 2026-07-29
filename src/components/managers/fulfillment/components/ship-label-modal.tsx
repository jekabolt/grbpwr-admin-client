import { riskTone } from 'components/managers/order/components/stripe-details';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { emptyParcel, GeneratedLabel, ShippingOptionVM, ShippingParcel } from '../api/types';
import {
  useFulfillmentCard,
  useGenerateShippingLabel,
  useShipFulfillmentOrder,
  useShippingLabelPrep,
  useShippingOptions,
  useVoidShippingLabel,
} from '../hooks/useFulfillment';

// ffShip v2 — one modal (the shared ConfirmationModal shell) that ships an order in
// two explicit steps: parcel (dims / weight) → carrier (service pick). It adapts to
// context:
//   • labels enabled, no label yet → parcel step → carrier step → GenerateShippingLabel.
//   • a label already exists         → print / copy tracking / void (ffLabel v1, unchanged).
//   • labels NOT enabled             → the manual tracking-code fallback.
//
// ffRisk v3 — before any ship path, if Stripe Radar flagged the order as elevated /
// highest risk, a warning gate (CalloutBox) must be acknowledged first. The board
// card carries no risk field (ff-card-summary), so the modal reads it from the order
// itself via GetFulfillmentCard — a single on-demand fetch when the modal opens (and
// a cache hit when opened from the detail page, which already loaded the order), NOT
// a per-card board fetch.
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
  const card = useFulfillmentCard(open ? orderUuid : null);
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
  const [step, setStep] = useState<'parcel' | 'carrier'>('parcel');
  const [riskAck, setRiskAck] = useState(false);

  // Reset per-order state whenever the modal closes.
  useEffect(() => {
    if (open) return;
    setDirty(false);
    setManualTracking('');
    setRates(null);
    setSelectedCode('');
    setGenerated(null);
    setConfirmVoid(false);
    setStep('parcel');
    setRiskAck(false);
  }, [open]);

  // Seed the parcel from the backend default once per open — but never clobber the
  // operator's overrides on a background refetch.
  useEffect(() => {
    if (open && prep.data && !dirty) setParcel(prep.data.parcel);
  }, [open, prep.data, dirty]);

  const d = prep.data;
  const risk = riskTone(card.data?.stripeDetails?.riskLevel);

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

  const view = prep.isLoading
    ? 'loading'
    : prep.isError
      ? 'error'
      : hasLabel
        ? 'ready'
        : risk && !riskAck
          ? 'risk'
          : d && !d.labelsEnabled
            ? 'manual'
            : step;

  const hideActions = view === 'loading' || view === 'error' || view === 'ready';

  // ConfirmationModal drives a single confirm button; label + handler per step.
  let confirmLabel = 'confirm';
  let onConfirm = () => {};
  let confirmDisabled = false;
  if (view === 'risk') {
    confirmLabel = 'reviewed — continue';
    onConfirm = () => setRiskAck(true);
  } else if (view === 'manual') {
    confirmLabel = 'ship';
    onConfirm = doManualShip;
    confirmDisabled = !manualTracking.trim() || manualShip.isPending;
  } else if (view === 'parcel') {
    confirmLabel = 'next: carrier';
    onConfirm = () => {
      if (parcel.weightGrams > 0) setStep('carrier');
    };
    confirmDisabled = parcel.weightGrams <= 0;
  } else if (view === 'carrier') {
    confirmLabel = 'generate label';
    onConfirm = doGenerate;
    confirmDisabled = parcel.weightGrams <= 0 || generate.isPending;
  }

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={`ship order ${orderLabel}`}
      confirmLabel={confirmLabel}
      confirmDisabled={confirmDisabled}
      hideActions={hideActions}
      closeOnConfirm={false}
      width='md'
    >
      {view === 'loading' && (
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          preparing label…
        </Text>
      )}

      {view === 'error' && (
        <div className='flex flex-wrap items-center gap-3'>
          <Text size='micro' variant='error' tracking='label' component='span'>
            {prep.error instanceof Error ? prep.error.message : 'failed to prepare the label'}
          </Text>
          <Button variant='underline' size='xs' onClick={() => prep.refetch()}>
            retry
          </Button>
        </div>
      )}

      {view === 'risk' && (
        <div className='flex flex-col gap-2.5'>
          <CalloutBox tone={risk === 'highest' ? 'error' : 'warning'}>
            <Text size='micro' component='span' className='uppercase tracking-label'>
              <b>Stripe Radar: {risk} risk.</b> Review this order before shipping — shipping emails
              the customer and is irreversible except via void.
            </Text>
          </CalloutBox>
        </div>
      )}

      {view === 'manual' && (
        <div className='flex flex-col gap-2.5'>
          <Text size='micro' variant='label' component='span'>
            Sendcloud isn’t configured — enter the carrier’s tracking code manually. This records
            the code, moves the order to shipped and emails the customer.
          </Text>
          <Field label='tracking code'>
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
          </Field>
        </div>
      )}

      {view === 'parcel' && (
        <div className='flex flex-col gap-2.5'>
          <StepHeader step={1} label='parcel' carrierName={carrierName} />
          {d && !d.complete && (
            <CalloutBox tone='warning'>
              <Text size='micro' component='span' className='uppercase tracking-label'>
                Some products have no packaging weight in their tech card — review the parcel before
                generating.
                {d.missingProductIds.length > 0 &&
                  ` (product${d.missingProductIds.length > 1 ? 's' : ''} ${d.missingProductIds.join(', ')})`}
              </Text>
            </CalloutBox>
          )}
          <div className='grid grid-cols-2 gap-2'>
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
        </div>
      )}

      {view === 'carrier' && (
        <div className='flex flex-col gap-2.5'>
          <StepHeader step={2} label='carrier' carrierName={carrierName} />
          <div className='flex items-center justify-between gap-2'>
            <Button variant='underline' size='xs' onClick={() => setStep('parcel')}>
              ← back to parcel
            </Button>
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
                <Text size='micro' variant='label' component='span'>
                  No options returned for this parcel.
                </Text>
              )}
            </div>
          ) : (
            <Text size='micro' variant='label' component='span'>
              Optional — leave blank to let Sendcloud shipping rules choose the carrier, or fetch
              live rates to pick a specific service.
            </Text>
          )}
        </div>
      )}

      {view === 'ready' && (
        <div className='flex flex-col gap-2.5'>
          <Text size='micro' component='span' className='uppercase tracking-label'>
            Label ready. The order is <b>shipped</b> and the customer has been emailed.
          </Text>
          <div className='flex flex-col gap-1 border border-borderColor px-2.5 py-2'>
            {carrierName && (
              <div className='flex items-center gap-2'>
                <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                  carrier
                </Text>
                <Text size='micro' component='span'>
                  {carrierName}
                </Text>
              </div>
            )}
            <div className='flex items-center gap-2'>
              <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                tracking
              </Text>
              {trackingCode ? <CopyToClipboard text={trackingCode} /> : <Pill tone='mut'>none</Pill>}
            </div>
          </div>

          <Button asChild variant='main' size='sm'>
            <a href={labelUrl} target='_blank' rel='noopener noreferrer'>
              print / download sticker (PDF)
            </a>
          </Button>

          {!confirmVoid ? (
            <Button variant='secondary' size='sm' onClick={() => setConfirmVoid(true)}>
              void label
            </Button>
          ) : (
            <CalloutBox tone='error' className='flex flex-col gap-2'>
              <Text size='micro' component='span' className='uppercase tracking-label'>
                Cancel the carrier label and revert the order to confirmed? You can regenerate
                afterwards.
              </Text>
              <div className='flex justify-end gap-1.5'>
                <Button variant='secondary' size='sm' onClick={() => setConfirmVoid(false)}>
                  keep
                </Button>
                <Button
                  variant='main'
                  size='sm'
                  loading={voidLabel.isPending}
                  disabled={voidLabel.isPending}
                  onClick={doVoid}
                >
                  void
                </Button>
              </div>
            </CalloutBox>
          )}

          <div className='flex justify-end'>
            <Button variant='secondary' size='sm' onClick={() => onOpenChange(false)}>
              done
            </Button>
          </div>
        </div>
      )}
    </ConfirmationModal>
  );
}

function StepHeader({
  step,
  label,
  carrierName,
}: {
  step: number;
  label: string;
  carrierName?: string;
}) {
  return (
    <div className='flex items-baseline justify-between gap-2'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label} · step {step} of 2
      </Text>
      {carrierName && (
        <Text size='micro' variant='label' component='span'>
          default carrier · {carrierName}
        </Text>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-1'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </label>
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
    <Field label={label}>
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
    </Field>
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
    <Field label={label}>
      <Input
        name={label}
        value={value}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </Field>
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
      className={
        'flex items-center justify-between gap-2 border px-2.5 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor ' +
        (selected
          ? 'border-textColor bg-textColor text-bgColor'
          : 'border-borderColor hover:border-textColor')
      }
    >
      <Text size='micro' component='span' className='min-w-0 truncate'>
        {label}
      </Text>
      {meta && (
        <Text size='nano' component='span' className='shrink-0 uppercase tracking-pill'>
          {meta}
        </Text>
      )}
    </button>
  );
}
