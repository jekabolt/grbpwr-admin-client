import { zodResolver } from '@hookform/resolvers/zod';
import { FixedAsset } from 'api/proto-http/admin';
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

      <Text variant='inactive' size='small'>
        depreciation posts monthly straight-line charges up to {lastDayOfRange(to)}; corporation tax is
        accrued on the pre-tax profit of the selected range. Both are idempotent — re-running only fills
        gaps.
      </Text>

      <ReportState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={assets.length === 0}
        emptyHint='no fixed assets yet — add one to start depreciating'
      >
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead className='border-b border-textColor'>
              <tr>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>asset</th>
                <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>cost</th>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>acquired</th>
                <th className='min-w-24 px-2 py-2 text-right text-textBaseSize uppercase'>
                  life (mo)
                </th>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <FixedAssetRow key={a.id} asset={a} />
              ))}
            </tbody>
          </table>
        </div>
      </ReportState>

      <AddFixedAssetModal open={addOpen} onOpenChange={setAddOpen} />
      <AccrueCorporationTaxModal open={ctOpen} onOpenChange={setCtOpen} from={from} to={to} />
    </section>
  );
}

function FixedAssetRow({ asset }: { asset: FixedAsset }) {
  const disposed = !!asset.disposedOn;
  return (
    <tr className='border-b border-textInactiveColor'>
      <td className='whitespace-nowrap px-2 py-1'>{asset.name}</td>
      <td className='w-32 min-w-32 whitespace-nowrap px-2 py-1 text-right tabular-nums'>
        {formatBase(asset.costBase)}
      </td>
      <td className='whitespace-nowrap px-2 py-1 tabular-nums'>{asset.acquiredOn}</td>
      <td className='w-24 min-w-24 whitespace-nowrap px-2 py-1 text-right tabular-nums'>
        {asset.usefulLifeMonths}
      </td>
      <td className='whitespace-nowrap px-2 py-1'>
        {disposed ? (
          <Text component='span' size='small' variant='inactive'>
            disposed {asset.disposedOn}
          </Text>
        ) : (
          <Text component='span' size='small'>
            active
          </Text>
        )}
      </td>
    </tr>
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
