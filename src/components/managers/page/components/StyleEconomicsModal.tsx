import type { StyleEconomics } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FC } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { useStyleEconomics } from '../useStyleEconomics';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface StyleEconomicsModalProps {
  techCardId: number | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DEV_KIND_LABEL: Record<string, string> = {
  sample: 'Samples',
  materials: 'Materials',
  labour: 'Labour',
  outsourcing: 'Outsourcing',
  other: 'Other',
};

const Row: FC<{ label: string; value: string; sub?: string; strong?: boolean }> = ({
  label,
  value,
  sub,
  strong,
}) => (
  <div className='flex items-baseline justify-between gap-3 py-1'>
    <Text size='small' className={strong ? 'font-bold' : undefined}>
      {label}
      {sub && <span className='text-textInactiveColor'> · {sub}</span>}
    </Text>
    <Text size='small' className={strong ? 'font-bold' : undefined}>
      {value}
    </Text>
  </div>
);

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className='border-t border-textInactiveColor pt-2'>
    <Text variant='uppercase' size='small' className='font-bold mb-1 block'>
      {title}
    </Text>
    {children}
  </div>
);

function Body({ economics }: { economics: StyleEconomics }) {
  const e = economics;
  const sales = e.sales;
  const costed = sales?.hasCost ?? false;
  const dev = e.devCost;
  const prod = e.production;

  return (
    <div className='flex min-w-[min(92vw,34rem)] flex-col gap-3'>
      <Section title='Sales'>
        <Row label='Revenue' value={formatCurrency(parseDecimal(sales?.revenue))} />
        <Row label='Units sold' value={formatNumber(sales?.unitsSold ?? 0)} />
        <Row label='Colorways' value={formatNumber(sales?.colorwayCount ?? 0)} />
        {costed ? (
          <>
            <Row label='Unit cost' value={formatCurrency(parseDecimal(sales?.unitCost))} />
            <Row
              label='COGS'
              value={formatCurrency(parseDecimal(sales?.revenueCost))}
              sub='cost of goods sold'
            />
            <Row
              label='Gross margin'
              value={`${formatCurrency(parseDecimal(sales?.grossMargin))} · ${(sales?.grossMarginPct ?? 0).toFixed(0)}%`}
            />
          </>
        ) : (
          <Text variant='inactive' size='small'>
            No unit cost set — margin unavailable for this style.
          </Text>
        )}
      </Section>

      <Section title='Development (R&D)'>
        <Row label='Fitting rounds' value={formatNumber(e.fittingRounds ?? 0)} />
        <Row
          label='Dev cost (total)'
          value={formatCurrency(parseDecimal(dev?.totalBase))}
          sub={dev?.hasUnconverted ? 'some lines unconverted' : undefined}
        />
        {(dev?.byKind ?? []).map((k) => (
          <Row
            key={k.kind}
            label={DEV_KIND_LABEL[k.kind ?? ''] ?? k.kind ?? '—'}
            value={formatCurrency(parseDecimal(k.amountBase))}
          />
        ))}
        {(e.samplesCount ?? 0) > 0 || parseDecimal(e.samplesCostBase) > 0 ? (
          <Row
            label='Physical samples'
            value={`${formatNumber(e.samplesCount ?? 0)} · ${formatCurrency(parseDecimal(e.samplesCostBase))}`}
            sub='informational — separate from the Samples dev cost above, not included in it'
          />
        ) : null}
        {dev?.unitCostWithDev?.value ? (
          <Row
            label='Unit cost + dev'
            value={formatCurrency(parseDecimal(dev.unitCostWithDev))}
            sub={`amortized over ${formatNumber(dev.orderQty ?? 0)} units · informational only, not part of net after dev`}
          />
        ) : null}
      </Section>

      {prod && (prod.runs ?? 0) > 0 && (
        <Section title='Production'>
          <Row label='Runs' value={formatNumber(prod.runs ?? 0)} />
          <Row
            label='Planned / received'
            value={`${formatNumber(prod.plannedQtyTotal ?? 0)} / ${formatNumber(prod.receivedQtyTotal ?? 0)}`}
          />
          {prod.hasActuals ? (
            <>
              <Row
                label='Planned cost'
                value={formatCurrency(parseDecimal(prod.plannedCostBase))}
              />
              <Row label='Actual cost' value={formatCurrency(parseDecimal(prod.actualCostBase))} />
              <Row label='Cost variance' value={formatCurrency(parseDecimal(prod.costVariance))} />
            </>
          ) : (
            <Text variant='inactive' size='small'>
              No received runs yet — actual cost pending.
            </Text>
          )}
        </Section>
      )}

      <Section title='Net after dev'>
        {e.netAfterDev?.value ? (
          <Row
            label='= gross margin − dev cost'
            value={formatCurrency(parseDecimal(e.netAfterDev))}
            strong
          />
        ) : (
          <Text variant='inactive' size='small'>
            Unavailable — needs a unit cost on the style.
          </Text>
        )}
        <Text variant='inactive' size='small' className='mt-1 block'>
          Contribution-style figure (development is a period R&D cost, not folded into unit COGS) —
          NOT net profit.
        </Text>
        {e.caveat && (
          <Text variant='inactive' size='small' className='mt-1 block'>
            {e.caveat}
          </Text>
        )}
      </Section>
    </div>
  );
}

// Drill-down reachable from the margin-by-style report and the tech card.
export const StyleEconomicsModal: FC<StyleEconomicsModalProps> = ({
  techCardId,
  open,
  onOpenChange,
}) => {
  const { data, isLoading, isError } = useStyleEconomics(techCardId, open);
  const economics = data?.economics;
  const { canReadCosting } = usePermissions();

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => onOpenChange(false)}
      title={
        economics
          ? `style economics · ${economics.styleNumber || economics.name || `TC-${techCardId}`}`
          : 'style economics'
      }
      confirmLabel='close'
    >
      <Text variant='inactive' size='small' className='mb-2 block'>
        Lifetime sales for this style, set against what it cost to develop and produce.
      </Text>
      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : isError || !economics ? (
        <Text variant='inactive' size='small'>
          {!canReadCosting
            ? 'Costing access is required to view economics for this style — ask an admin to grant it.'
            : isError
              ? 'Could not load economics for this style right now — try again shortly.'
              : 'This style has no recorded sales or development activity yet.'}
        </Text>
      ) : (
        <Body economics={economics} />
      )}
    </ConfirmationModal>
  );
};
