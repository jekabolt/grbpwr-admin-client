import { zodResolver } from '@hookform/resolvers/zod';
import { FixedAsset, googletype_Decimal } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import { inputToDecimal, normalizeDecimalInput } from 'utils/decimal';
import { z } from 'zod';
import {
  useAccrueCorporationTax,
  useCreateFixedAsset,
  useFixedAssets,
  usePostDepreciation,
} from '../../utils/hooks';
import { BarRow, Callout, Note, Pill, RowLine, clampPct } from '../../components/kit';
import { formatBase } from '../../utils/format';
import { ReportState, toISODate } from './report-utils';

type Props = {
  // Reporting range from the shared search-params contract (`to` exclusive). Depreciation posts up to
  // the range's last day; the CT accrual is charged on the range's pre-tax profit.
  from: string;
  to: string;
};

// The exclusive upper bound `to` (1st of next month) minus one day — the last day actually inside the
// reporting range, which is the month depreciation should be posted up to.
function lastDayOfRange(to: string): string {
  const [y, m, d] = to.split('-').map(Number);
  if (!y || !m || !d) return to;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return toISODate(dt);
}

// ---- Display estimates for the asset cards (the register endpoint carries only cost / acquired /
// life, so monthly charge, depreciated-to-date and NBV are derived on screen: cost ÷ life × months
// held. Marked ≈ — the POSTED figures live in the ledger (Dr 6370 / Cr 1225), the sanctioned
// display-proportion exception, same as the kit's bar widths.) ----

function toNum(d?: googletype_Decimal): number | null {
  const n = parseFloat(d?.value ?? '');
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Whole calendar months between two YYYY-MM-DD dates (day-of-month ignored — straight-line charges
// post per month, so the month distance is the honest estimate of charges taken).
function monthsBetween(fromISO: string, toISO: string): number {
  const [y1, m1] = fromISO.split('-').map(Number);
  const [y2, m2] = toISO.split('-').map(Number);
  if (!y1 || !m1 || !y2 || !m2) return 0;
  return (y2 - y1) * 12 + (m2 - m1);
}

// Fixed-asset register + the two statutory-completeness actions (Post Depreciation, Accrue Corporation
// Tax) that close the FRS 105 draft caveats. Rendered under the FRS 105 statement. The register drives
// straight-line depreciation (Dr 6370 / Cr 1225); the CT accrual posts Dr 8010 / Cr 2050 on the
// period's pre-tax profit. All figures come from the backend — nothing here recomputes a posted amount.
export function FixedAssetsPanel({ from, to }: Props) {
  const { data, isLoading, isError, refetch } = useFixedAssets();
  const postDepreciation = usePostDepreciation();
  const [addOpen, setAddOpen] = useState(false);
  const [ctOpen, setCtOpen] = useState(false);

  const assets = data?.assets ?? [];

  return (
    <section className='flex flex-col gap-4 border-t border-textColor pt-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='uppercase' className='font-medium'>
          fixed assets &amp; tax
        </Text>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='secondary'
            size='lg'
            onClick={() => postDepreciation.mutate({ upTo: lastDayOfRange(to) })}
            disabled={postDepreciation.isPending}
          >
            {postDepreciation.isPending ? 'posting…' : 'post depreciation'}
          </Button>
          <Button variant='secondary' size='lg' onClick={() => setCtOpen(true)}>
            accrue corporation tax
          </Button>
          <Button variant='main' size='lg' onClick={() => setAddOpen(true)}>
            add asset
          </Button>
        </div>
      </div>

      <Note className='mt-0'>
        depreciation posts monthly straight-line charges up to {lastDayOfRange(to)}; corporation tax
        is accrued on the pre-tax profit of the selected range. Both are idempotent — re-running only
        fills gaps.
      </Note>

      <ReportState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={assets.length === 0}
        emptyHint='no fixed assets yet — add one to start depreciating'
      >
        <div className='flex flex-col gap-2'>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {assets.map((a) => (
              <FixedAssetCard key={a.id} asset={a} rangeEnd={lastDayOfRange(to)} />
            ))}
          </div>
          <Note>
            monthly charge, depreciated-to-date and net book value are on-screen estimates (cost ÷
            life × months held) — the posted figures live in the ledger (Dr 6370 / Cr 1225)
          </Note>
        </div>
      </ReportState>

      <AddFixedAssetModal open={addOpen} onOpenChange={setAddOpen} />
      <AccrueCorporationTaxModal open={ctOpen} onOpenChange={setCtOpen} from={from} to={to} />
    </section>
  );
}

// One asset as a card: cost, the derived straight-line monthly charge, a depreciation progress bar
// and the estimated net book value. A disposed asset measures up to its disposal date and gets a
// muted pill instead of the green "active" one.
function FixedAssetCard({ asset, rangeEnd }: { asset: FixedAsset; rangeEnd: string }) {
  const disposed = !!asset.disposedOn;
  const cost = toNum(asset.costBase);
  const life = asset.usefulLifeMonths ?? 0;
  const monthly = cost != null && life > 0 ? cost / life : null;
  const measuredTo = asset.disposedOn ?? rangeEnd;
  const monthsHeld = asset.acquiredOn
    ? Math.max(0, Math.min(life, monthsBetween(asset.acquiredOn, measuredTo)))
    : 0;
  const accumulated = monthly != null ? monthly * monthsHeld : null;
  const nbv = cost != null && accumulated != null ? cost - accumulated : null;
  const pct = cost != null && cost > 0 && accumulated != null ? (accumulated / cost) * 100 : 0;

  return (
    <Callout className='text-textColor'>
      <div className='mb-1 flex items-center justify-between gap-2'>
        <span className='truncate font-bold'>{asset.name}</span>
        <Pill tone={disposed ? 'muted' : 'ok'}>
          {disposed ? `disposed ${asset.disposedOn}` : 'active'}
        </Pill>
      </div>
      <RowLine
        label={
          <>
            Cost
            <span className='ml-1 text-[11px] text-labelColor'>(bought {asset.acquiredOn})</span>
          </>
        }
        value={formatBase(asset.costBase)}
      />
      <RowLine
        label={
          <>
            Monthly charge
            <span className='ml-1 text-[11px] text-labelColor'>(cost spread over its life)</span>
          </>
        }
        value={monthly != null ? `≈ ${fmtNum(monthly)} / mo over ${life} mo` : '—'}
      />
      <div className='border-b border-textInactiveColor'>
        <BarRow
          name='Depreciated'
          pct={clampPct(pct)}
          value={accumulated != null ? `≈ ${fmtNum(accumulated)}` : '—'}
        />
      </div>
      <RowLine
        label={
          <>
            Net book value
            <span className='ml-1 text-[11px] font-normal text-labelColor'>
              (what it&apos;s still worth on paper)
            </span>
          </>
        }
        value={nbv != null ? `≈ ${fmtNum(nbv)}` : '—'}
        total
      />
    </Callout>
  );
}

// ---- Add fixed asset ----

const assetSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(255),
  cost: z
    .string()
    .refine((v) => Number(normalizeDecimalInput(v)) > 0, 'cost must be greater than 0'),
  acquiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'acquisition date required'),
  usefulLifeMonths: z.number().int().positive('must be greater than 0'),
});

type AssetSchema = z.infer<typeof assetSchema>;

function AddFixedAssetModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { showMessage } = useSnackBarStore();
  const create = useCreateFixedAsset();

  const defaults = useMemo<AssetSchema>(
    () => ({ name: '', cost: '', acquiredOn: toISODate(new Date()), usefulLifeMonths: 36 }),
    [],
  );
  const form = useForm<AssetSchema>({ resolver: zodResolver(assetSchema), defaultValues: defaults });

  useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const onSubmit: SubmitHandler<AssetSchema> = (d) => {
    const costBase = inputToDecimal(d.cost);
    if (!costBase) {
      form.setError('cost', { message: 'cost must be greater than 0' });
      return;
    }
    create.mutate(
      {
        name: d.name,
        costBase,
        acquiredOn: d.acquiredOn,
        usefulLifeMonths: d.usefulLifeMonths,
      },
      {
        onSuccess: () => {
          showMessage('Fixed asset added', 'success');
          onOpenChange(false);
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to add asset', 'error'),
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={form.handleSubmit(onSubmit)}
      closeOnConfirm={false}
      title='New fixed asset'
      confirmLabel={create.isPending ? 'saving…' : 'add'}
      confirmDisabled={create.isPending}
    >
      <div className='min-w-[min(90vw,24rem)]'>
        <Form {...form}>
          <div className='flex flex-col gap-4'>
            <InputField name='name' label='name' placeholder='e.g. Sewing machine' autoFocus />
            <DecimalField name='cost' label='cost (base currency)' placeholder='0.00' maxDecimals={2} />
            <InputField name='acquiredOn' label='acquired on' type='date' />
            <InputField
              name='usefulLifeMonths'
              label='useful life (months)'
              inputMode='numeric'
              valueAsNumber
              keyboardRestriction={/[0-9]/}
              placeholder='36'
            />
          </div>
        </Form>
      </div>
    </ConfirmationModal>
  );
}

// ---- Accrue corporation tax ----

const ctSchema = z.object({
  ratePct: z
    .string()
    .refine((v) => Number(normalizeDecimalInput(v)) > 0, 'rate must be greater than 0'),
});
type CtSchema = z.infer<typeof ctSchema>;

// UK corporation tax: 19% small-profits rate (micro-entity default), 25% main rate. Editable.
const DEFAULT_CT_RATE = '19';

function AccrueCorporationTaxModal({
  open,
  onOpenChange,
  from,
  to,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: string;
  to: string;
}) {
  const { showMessage } = useSnackBarStore();
  const accrue = useAccrueCorporationTax();

  const form = useForm<CtSchema>({
    resolver: zodResolver(ctSchema),
    defaultValues: { ratePct: DEFAULT_CT_RATE },
  });
  useEffect(() => {
    if (open) form.reset({ ratePct: DEFAULT_CT_RATE });
  }, [open, form]);

  const onSubmit: SubmitHandler<CtSchema> = (d) => {
    const ratePct = inputToDecimal(d.ratePct);
    if (!ratePct) {
      form.setError('ratePct', { message: 'rate must be greater than 0' });
      return;
    }
    accrue.mutate(
      { from, to, ratePct },
      {
        onSuccess: (res) => {
          const amount = formatBase(res.corpTax);
          const posted = Number(res.corpTax?.value ?? '0');
          let msg: string;
          if (res.alreadyPosted) {
            msg = `Already accrued for this period: ${amount} (reverse the entry to re-accrue)`;
          } else if (posted <= 0) {
            msg = 'No taxable profit in this period — nothing accrued';
          } else {
            msg = `Accrued corporation tax: ${amount}`;
          }
          showMessage(msg, res.alreadyPosted ? 'error' : 'success');
          onOpenChange(false);
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to accrue corporation tax', 'error'),
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={form.handleSubmit(onSubmit)}
      closeOnConfirm={false}
      title='Accrue corporation tax'
      confirmLabel={accrue.isPending ? 'accruing…' : 'accrue'}
      confirmDisabled={accrue.isPending}
    >
      <div className='flex min-w-[min(90vw,24rem)] flex-col gap-4'>
        <Text size='small' variant='inactive'>
          Charges Dr 8010 / Cr 2050 on the pre-tax profit of {from} → {to} (exclusive). Idempotent —
          re-run after reversing the prior accrual to change it.
        </Text>
        <Form {...form}>
          <DecimalField name='ratePct' label='rate %' placeholder='19' maxDecimals={2} />
        </Form>
      </div>
    </ConfirmationModal>
  );
}
