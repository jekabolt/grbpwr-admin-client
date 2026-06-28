import { common_TechCard } from 'api/proto-http/admin';
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
    !!rollup?.materialsCost?.value ||
    !!rollup?.totalCost?.value ||
    !!rollup?.totalSam?.value ||
    colorwayCosts.length > 0;

  return (
    <div className='space-y-3'>
      {mixedScale && (
        <div className='border border-amber-600 p-3'>
          <Text size='small' className='block text-amber-600'>
            Внимание: часть материалов задана поразмерно (стоимость партии), часть — на изделие.
            Итог смешивает масштабы. По возможности задавайте расход всех измеряемых материалов
            одним способом.
          </Text>
        </div>
      )}
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
        <DecimalField name='costing.cmtCost' label='CMT cost' />
        <DecimalField name='costing.hardwareCost' label='hardware cost' />
        <DecimalField name='costing.packagingCost' label='packaging cost' />
        <DecimalField name='costing.logisticsCost' label='logistics cost' />
        <DecimalField name='costing.overheadCost' label='overhead cost' />
        <DecimalField name='costing.defectPercent' label='defect %' />
        <DecimalField name='costing.markupMultiplier' label='markup ×' />
        <DecimalField name='costing.wholesalePrice' label='wholesale price' />
        <DecimalField name='costing.retailPrice' label='retail price' />
        <CurrencySelect name='costing.currency' label='currency' />
      </div>
      <Text variant='inactive' size='small'>
        Цены оптовая/розничная и валюта едины для всех колорвеев (политика бренда).
      </Text>
      <TextareaField name='costing.notes' label='notes' rows={2} maxLength={2000} />

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
                      на изделие: {decimalToInput(cc.materialsCost) || '—'} · на тираж:{' '}
                      {decimalToInput(cc.sizeRunTotal) || '—'}
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
                materials cost: {decimalToInput(rollup?.materialsCost) || '—'}
              </Text>
              <Text variant='inactive' size='small'>
                Σ SAM (информативно): {decimalToInput(rollup?.totalSam) || '—'} min
              </Text>
              <Text variant='inactive' size='small'>
                total cost: {decimalToInput(rollup?.totalCost) || '—'}
              </Text>
              {rollup?.hasUnconvertedCurrencies && (
                <Text variant='inactive' size='small'>
                  ⚠ some BOM lines are in another currency — excluded from total (no FX)
                </Text>
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
