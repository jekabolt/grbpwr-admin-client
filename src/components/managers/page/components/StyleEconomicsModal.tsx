import type { StyleEconomics } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FC } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
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

const EconomicsRow: FC<{ label: string; value: string; sub?: string; strong?: boolean }> = ({
  label,
  value,
  sub,
  strong,
}) => (
  <Row
    emphasis={strong}
    label={
      <Text size='small' className={strong ? 'font-bold' : undefined}>
        {label}
        {sub && <span className='text-labelColor'> · {sub}</span>}
      </Text>
    }
    value={
      <Text size='small' className={strong ? 'font-bold' : undefined}>
        {value}
      </Text>
    }
  />
);

function Body({ economics }: { economics: StyleEconomics }) {
  const e = economics;
  const sales = e.sales;
  const costed = sales?.hasCost ?? false;
  const dev = e.devCost;
  const prod = e.production;

  return (
    <div className='flex w-full min-w-0 flex-col gap-3 lg:w-[34rem]'>
      <div>
        <GroupLabel flush>Sales</GroupLabel>
        <EconomicsRow label='Revenue' value={formatCurrency(parseDecimal(sales?.revenue))} />
        <EconomicsRow label='Units sold' value={formatNumber(sales?.unitsSold ?? 0)} />
        <EconomicsRow label='Colorways' value={formatNumber(sales?.colorwayCount ?? 0)} />
        {costed ? (
          <>
            <EconomicsRow label='Unit cost' value={formatCurrency(parseDecimal(sales?.unitCost))} />
            <EconomicsRow
              label='COGS'
              value={formatCurrency(parseDecimal(sales?.revenueCost))}
              sub='cost of goods sold'
            />
            <EconomicsRow
              label='Gross margin'
              value={`${formatCurrency(parseDecimal(sales?.grossMargin))} · ${(sales?.grossMarginPct ?? 0).toFixed(0)}%`}
            />
          </>
        ) : (
          <Text variant='inactive' size='small'>
            No unit cost set — margin unavailable for this style.
          </Text>
        )}
      </div>

      <div>
        <GroupLabel flush>Development (R&amp;D)</GroupLabel>
        <EconomicsRow label='Fitting rounds' value={formatNumber(e.fittingRounds ?? 0)} />
        <EconomicsRow
          label='Dev cost (total)'
          value={formatCurrency(parseDecimal(dev?.totalBase))}
          sub={dev?.hasUnconverted ? 'some lines unconverted' : undefined}
        />
        {(dev?.byKind ?? []).map((k) => (
          <EconomicsRow
            key={k.kind}
            label={DEV_KIND_LABEL[k.kind ?? ''] ?? k.kind ?? '—'}
            value={formatCurrency(parseDecimal(k.amountBase))}
          />
        ))}
        {(e.samplesCount ?? 0) > 0 || parseDecimal(e.samplesCostBase) > 0 ? (
          <EconomicsRow
            label='Physical samples'
            value={`${formatNumber(e.samplesCount ?? 0)} · ${formatCurrency(parseDecimal(e.samplesCostBase))}`}
            sub='informational — separate from the Samples dev cost above, not included in it'
          />
        ) : null}
        {dev?.unitCostWithDev?.value ? (
          <EconomicsRow
            label='Unit cost + dev'
            value={formatCurrency(parseDecimal(dev.unitCostWithDev))}
            sub={`amortized over ${formatNumber(dev.orderQty ?? 0)} units · informational only, not part of net after dev`}
          />
        ) : null}
      </div>

      {prod && (prod.runs ?? 0) > 0 && (
        <div>
          <GroupLabel flush>Production</GroupLabel>
          <EconomicsRow label='Runs' value={formatNumber(prod.runs ?? 0)} />
          <EconomicsRow
            label='Planned / received'
            value={`${formatNumber(prod.plannedQtyTotal ?? 0)} / ${formatNumber(prod.receivedQtyTotal ?? 0)}`}
          />
          {prod.hasActuals ? (
            <>
              <EconomicsRow
                label='Planned cost'
                value={formatCurrency(parseDecimal(prod.plannedCostBase))}
              />
              <EconomicsRow
                label='Actual cost'
                value={formatCurrency(parseDecimal(prod.actualCostBase))}
              />
              {(() => {
                // Planned is the FULL planned spend (planned_qty). On an in-progress run actual is
                // only partially accrued, so actual < planned is NOT a saving — only call it
                // under/over plan once everything planned has been received.
                const planned = parseDecimal(prod.plannedCostBase);
                const actual = parseDecimal(prod.actualCostBase);
                const variance = actual - planned;
                const complete =
                  (prod.plannedQtyTotal ?? 0) > 0 &&
                  (prod.receivedQtyTotal ?? 0) >= (prod.plannedQtyTotal ?? 0);
                return (
                  <EconomicsRow
                    label='Cost variance'
                    value={
                      !complete
                        ? 'run in progress — actual still partial'
                        : Math.abs(variance) < 0.005
                          ? 'on plan'
                          : `${formatCurrency(Math.abs(variance))} ${variance < 0 ? 'under' : 'over'} plan`
                    }
                    sub={
                      !complete
                        ? 'planned = full run; actual accrues as units are received'
                        : undefined
                    }
                  />
                );
              })()}
            </>
          ) : (
            <Text variant='inactive' size='small'>
              No received runs yet — actual cost pending.
            </Text>
          )}
        </div>
      )}

      <div>
        <GroupLabel flush>Net after dev</GroupLabel>
        {e.netAfterDev?.value ? (
          <EconomicsRow
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
      </div>
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
