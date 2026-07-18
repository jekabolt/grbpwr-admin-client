import { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput } from 'utils/decimal';
import { StatCell } from './cost-estimate-field';
import { TechCardFormData } from './schema';

// Manual cost articles (Sheet «Калькуляция»). 1:1 — sent as unset when blank. The
// materials rollup + per-colourway costs are computed server-side from the BOM + colourway
// usages (output-only): shown read-only here from the last GetTechCard, never sent on write.
export function CostingField({ techCard }: { techCard?: common_TechCard }) {
  const { control } = useFormContext<TechCardFormData>();
  // Cost inputs are writable only with costing:write (the tab itself is hidden without
  // costing:read — see the editor's TABS). Backend enforces; this disables the UI.
  const { canWriteCosting } = usePermissions();
  const { dictionary } = useDictionary();
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
  // colorway_cost rows are keyed by the real colorwayId (0 = the card's primary/base costing,
  // not tied to one colourway) — resolve labels from the live techCard.colorways
  // (AdminColorwayRef[], R1: a colourway is a product) + dictionary.colors, same pattern as
  // construction-tab.tsx.
  const storedColorways = techCard?.colorways ?? [];
  const colorwayLabel = (id?: number) => {
    const cw = id ? storedColorways.find((c) => c.colorwayId === id) : undefined;
    const dc = cw ? dictionary?.colors?.find((c) => c.code === cw.colorCode) : undefined;
    return dc?.name || cw?.colorCode || (id ? `колорвей #${id}` : 'колорвей');
  };

  const materialsTotal = rollup?.materialsTotal ?? [];
  const hasRollup =
    materialsTotal.length > 0 ||
    !!rollup?.materialsPerUnit?.value ||
    !!rollup?.unitCost?.value ||
    !!rollup?.orderCost?.value ||
    colorwayCosts.length > 0;

  return (
    <div className='space-y-3'>
      <Text variant='label' size='small'>
        Manual per-garment cost articles + the server-computed materials rollup. The transparent,
        per-colourway plan-vs-actual estimate lives in the “cost estimate” tab.
      </Text>
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
      <Text variant='label' size='small'>
        Все статьи — на 1 изделие, в одной валюте. Себестоимость считается на изделие, затем
        масштабируется на тираж (order qty). Ценообразование (наценка/опт/розница) живёт на
        опубликованном продукте, не здесь.
      </Text>
      <fieldset disabled={!canWriteCosting} className='border-0 p-0'>
        <TextareaField name='costing.notes' label='notes' rows={2} maxLength={2000} />
      </fieldset>

      <div className='space-y-3 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          materials rollup (computed server-side)
        </Text>
        {hasRollup ? (
          <>
            {/* Summary-first: headline per-unit / per-order figures as tiles, before the
                per-currency detail and per-colourway breakdown. */}
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <StatCell
                label='себест. / изделие'
                value={decimalToInput(rollup?.unitCost) || '—'}
                highlight
              />
              <StatCell
                label='на тираж'
                value={decimalToInput(rollup?.orderCost) || '—'}
                sub={`тираж ${rollup?.orderQty || 0}`}
              />
              <StatCell
                label='материалы / изделие'
                value={decimalToInput(rollup?.materialsPerUnit) || '—'}
              />
              <StatCell
                label={`base${rollup?.baseCurrency ? ` · ${rollup.baseCurrency}` : ''}`}
                value={decimalToInput(rollup?.unitCostBase) || '—'}
                sub='seeds product cost'
              />
            </div>

            {/* per-colourway material cost */}
            {colorwayCosts.length > 0 && (
              <div className='space-y-1'>
                {colorwayCosts.map((cc, i) => (
                  <div key={i} className='border border-textInactiveColor p-2'>
                    <Text size='small' className='block'>
                      {colorwayLabel(cc.colorwayId)}
                      {cc.colorwayId === 0 ? ' (основной)' : ''}
                    </Text>
                    {(cc.materialsTotal ?? []).map((line, li) => (
                      <Text key={li} variant='label' size='small'>
                        материалы ({line.currency || 'no currency'}):{' '}
                        {decimalToInput(line.amount) || '—'}
                      </Text>
                    ))}
                    <Text variant='label' size='small'>
                      материалы/изделие: {decimalToInput(cc.materialsPerUnit) || '—'} ·
                      себестоимость/изделие: {decimalToInput(cc.unitCost) || '—'}
                    </Text>
                    <Text variant='label' size='small'>
                      тираж {cc.orderQty || 0} · на тираж: {decimalToInput(cc.orderCost) || '—'}
                    </Text>
                    {cc.hasUnconvertedCurrencies && (
                      <Text variant='label' size='small'>
                        ⚠ часть материалов в другой валюте — исключены из итога (без конвертации)
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* per-currency material totals for the primary colourway (detail under the tiles) */}
            <div className='space-y-1 border-t border-textInactiveColor pt-2'>
              <Text variant='label' size='small'>
                итог по основному колорвею:
              </Text>
              {materialsTotal.map((line, i) => (
                <Text key={i} variant='label' size='small'>
                  materials ({line.currency || 'no currency'}): {decimalToInput(line.amount) || '—'}
                </Text>
              ))}
            </div>

            {/* Costing FX rates are global (shared across all cards) and now live in Settings —
                here we only note the fold + link out, keeping the hard "unconverted" warning. */}
            <div className='space-y-2 border-t border-textInactiveColor pt-3'>
              <Text variant='label' size='small'>
                Multi-currency BOM lines fold into the base currency
                {rollup?.baseCurrency ? ` (${rollup.baseCurrency})` : ''} via the global costing FX
                rates, which also seed the product’s cost price.{' '}
                <Link to={ROUTES.settings} className='underline hover:text-textColor'>
                  Manage FX rates in Settings
                </Link>
                .
              </Text>
              {rollup?.hasUnconvertedCurrencies && (
                <div className='border border-warning p-2'>
                  <Text size='small' className='block text-warning'>
                    ⚠ some BOM lines are in another currency with no FX rate, so they’re excluded
                    from the total and no base-currency cost can be computed. Add a costing FX rate
                    in Settings so they fold into the base cost instead of silently lowering it.
                  </Text>
                </div>
              )}
            </div>
          </>
        ) : (
          <Text variant='label' size='small'>
            computed from BOM on save; reload to refresh
          </Text>
        )}
      </div>
    </div>
  );
}
