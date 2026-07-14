import { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput } from 'utils/decimal';
import { TechCardFormData } from './schema';

// Manual cost articles (Sheet «Калькуляция»). 1:1 — sent as unset when blank. The
// materials rollup + per-colourway costs are computed server-side from the BOM + colourway
// usages (output-only): shown read-only here from the last GetTechCard, never sent on write.
export function CostingField({ techCard }: { techCard?: common_TechCard }) {
  const { control } = useFormContext<TechCardFormData>();
  // Cost inputs are writable only with costing:write (the tab itself is hidden without
  // costing:read — see the editor's TABS). Backend enforces; this disables the UI.
  const { canWriteCosting } = usePermissions();
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    usages?: Array<{ consumption?: string; sizeConsumptions?: Array<{ consumption?: string }> }>;
  }>;

  // A usage costs at order-scale when it has per-size consumption; at per-garment scale when
  // it uses the single consumption. Mixing both in one card mixes scales in the total.
  const allUsages = colorways.flatMap((c) => c.usages ?? []);
  const hasPerSize = allUsages.some((u) =>
    (u.sizeConsumptions ?? []).some((sc) => sc.consumption?.trim()),
  );
  const hasPerGarment = allUsages.some(
    (u) =>
      !(u.sizeConsumptions ?? []).some((sc) => sc.consumption?.trim()) && u.consumption?.trim(),
  );
  const mixedScale = hasPerSize && hasPerGarment;

  const rollup = techCard?.techCard?.costing;
  const colorwayCosts = rollup?.colorwayCosts ?? [];
  const storedColorways = techCard?.techCard?.colorways ?? [];
  const colorwayLabel = (index?: number) => {
    const c = index != null ? storedColorways[index] : undefined;
    return c?.name || c?.code || `колорвей #${(index ?? 0) + 1}`;
  };

  const materialsTotal = rollup?.materialsTotal ?? [];
  const hasRollup =
    materialsTotal.length > 0 ||
    !!rollup?.materialsPerUnit?.value ||
    !!rollup?.unitCost?.value ||
    !!rollup?.orderCost?.value ||
    !!rollup?.totalSam?.value ||
    colorwayCosts.length > 0;

  return (
    <div className='space-y-3'>
      {mixedScale && (
        <div className='border border-warning p-3'>
          <Text size='small' className='block text-warning'>
            Внимание: часть материалов задана поразмерно (стоимость партии), часть — на изделие.
            Итог смешивает масштабы. По возможности задавайте расход всех измеряемых материалов
            одним способом.
          </Text>
        </div>
      )}
      <fieldset
        disabled={!canWriteCosting}
        className='grid grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-3'
      >
        <DecimalField name='costing.cmtCost' label='CMT cost / изделие' />
        <DecimalField name='costing.hardwareCost' label='hardware / изделие' />
        <DecimalField name='costing.packagingCost' label='packaging / изделие' />
        <DecimalField name='costing.logisticsCost' label='logistics / изделие' />
        <DecimalField name='costing.overheadCost' label='overhead / изделие' />
        <DecimalField name='costing.defectPercent' label='defect %' />
        <CurrencySelect name='costing.currency' label='currency' />
      </fieldset>
      <Text variant='inactive' size='small'>
        Все статьи — на 1 изделие, в одной валюте. Себестоимость считается на изделие, затем
        масштабируется на тираж (order qty). Ценообразование (наценка/опт/розница) живёт на
        опубликованном продукте, не здесь.
      </Text>
      <fieldset disabled={!canWriteCosting} className='border-0 p-0'>
        <TextareaField name='costing.notes' label='notes' rows={2} maxLength={2000} />
      </fieldset>

      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          materials rollup (computed server-side)
        </Text>
        {hasRollup ? (
          <>
            {/* per-colourway material cost */}
            {colorwayCosts.length > 0 && (
              <div className='space-y-1'>
                {colorwayCosts.map((cc, i) => (
                  <div key={i} className='border border-textInactiveColor p-2'>
                    <Text size='small' className='block'>
                      {colorwayLabel(cc.colorwayIndex)}
                      {cc.colorwayIndex === 0 ? ' (основной)' : ''}
                    </Text>
                    {(cc.materialsTotal ?? []).map((line, li) => (
                      <Text key={li} variant='inactive' size='small'>
                        материалы ({line.currency || 'no currency'}):{' '}
                        {decimalToInput(line.amount) || '—'}
                      </Text>
                    ))}
                    <Text variant='inactive' size='small'>
                      материалы/изделие: {decimalToInput(cc.materialsPerUnit) || '—'} ·
                      себестоимость/изделие: {decimalToInput(cc.unitCost) || '—'}
                    </Text>
                    <Text variant='inactive' size='small'>
                      тираж {cc.orderQty || 0} · на тираж: {decimalToInput(cc.orderCost) || '—'}
                    </Text>
                    {cc.hasUnconvertedCurrencies && (
                      <Text variant='inactive' size='small'>
                        ⚠ часть материалов в другой валюте — исключены из итога (без конвертации)
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className='space-y-1 border-t border-textInactiveColor pt-2'>
              <Text variant='inactive' size='small'>
                итог по основному колорвею:
              </Text>
              {materialsTotal.map((line, i) => (
                <Text key={i} variant='inactive' size='small'>
                  materials ({line.currency || 'no currency'}): {decimalToInput(line.amount) || '—'}
                </Text>
              ))}
              <Text variant='inactive' size='small'>
                материалы / изделие: {decimalToInput(rollup?.materialsPerUnit) || '—'}
              </Text>
              <Text variant='inactive' size='small'>
                себестоимость / изделие: {decimalToInput(rollup?.unitCost) || '—'}
              </Text>
              <Text variant='inactive' size='small'>
                тираж {rollup?.orderQty || 0} · себестоимость тиража:{' '}
                {decimalToInput(rollup?.orderCost) || '—'}
              </Text>
              <Text variant='inactive' size='small'>
                Σ SAM (информативно): {decimalToInput(rollup?.totalSam) || '—'} min
              </Text>
              {/* Base-currency rollup (folded via costing FX rates) — this is the figure that
                  seeds the product's cost_price. Absent when a currency has no FX rate. */}
              {
                rollup?.baseCurrency &&
                (rollup?.unitCostBase?.value || rollup?.orderCostBase?.value) ? (
                  <Text size='small' className='block'>
                    base ({rollup.baseCurrency}): / изделие{' '}
                    {decimalToInput(rollup?.unitCostBase) || '—'} · тираж{' '}
                    {decimalToInput(rollup?.orderCostBase) || '—'}{' '}
                    <Text variant='inactive' size='small'>
                      (seeds product cost)
                    </Text>
                  </Text>
                ) : rollup?.hasUnconvertedCurrencies ? null : rollup?.unitCost?.value ||
                  rollup?.orderCost?.value ? (
                  // There IS a cost, but no base figure — that's genuinely a missing FX rate.
                  <Text variant='inactive' size='small'>
                    base-currency cost unavailable — add a costing FX rate for every currency used
                  </Text>
                ) : null /* no cost entered yet (e.g. only SAM times) — nothing to convert */
              }
              {rollup?.hasUnconvertedCurrencies && (
                <div className='border border-warning p-2'>
                  <Text size='small' className='block text-warning'>
                    ⚠ some BOM lines are in another currency without an FX rate — they are excluded
                    from the total and no base-currency cost can be computed. Add a costing FX rate
                    (Tech cards → FX rates) so they fold into the base cost instead of silently
                    lowering it.
                  </Text>
                </div>
              )}
            </div>
          </>
        ) : (
          <Text variant='inactive' size='small'>
            computed from BOM on save — reload to refresh
          </Text>
        )}
      </div>
    </div>
  );
}
