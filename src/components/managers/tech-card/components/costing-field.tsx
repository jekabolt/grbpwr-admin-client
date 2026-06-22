import { common_TechCard } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput } from 'utils/decimal';

// Manual cost articles (Sheet «Калькуляция»). 1:1 — sent as unset when blank. The
// materials rollup + totals are computed server-side from the BOM (output-only): shown
// read-only here from the last GetTechCard, never sent on write.
export function CostingField({ techCard }: { techCard?: common_TechCard }) {
  const rollup = techCard?.techCard?.costing;
  const materialsTotal = rollup?.materialsTotal ?? [];
  const hasRollup =
    materialsTotal.length > 0 ||
    !!rollup?.materialsCost?.value ||
    !!rollup?.totalCost?.value ||
    !!rollup?.totalSam?.value ||
    !!rollup?.labourCost?.value;

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
        <InputField name='costing.cmtCost' label='CMT cost' />
        <InputField name='costing.hardwareCost' label='hardware cost' />
        <InputField name='costing.packagingCost' label='packaging cost' />
        <InputField name='costing.logisticsCost' label='logistics cost' />
        <InputField name='costing.overheadCost' label='overhead cost' />
        <InputField name='costing.defectPercent' label='defect %' />
        <InputField name='costing.markupMultiplier' label='markup ×' />
        <InputField name='costing.wholesalePrice' label='wholesale price' />
        <InputField name='costing.retailPrice' label='retail price' />
        <InputField name='costing.currency' label='currency' placeholder='EUR' />
      </div>
      <TextareaField name='costing.notes' label='notes' rows={2} maxLength={2000} />

      <div className='space-y-1 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          materials rollup (computed server-side)
        </Text>
        {hasRollup ? (
          <>
            {materialsTotal.map((line, i) => (
              <Text key={i} variant='inactive' size='small'>
                materials ({line.currency || 'no currency'}): {decimalToInput(line.amount) || '—'}
              </Text>
            ))}
            <Text variant='inactive' size='small'>
              materials cost: {decimalToInput(rollup?.materialsCost) || '—'}
            </Text>
            <Text variant='inactive' size='small'>
              labour: Σ SAM {decimalToInput(rollup?.totalSam) || '—'} min →{' '}
              {decimalToInput(rollup?.labourCost) || '—'}
            </Text>
            <Text variant='inactive' size='small'>
              total cost: {decimalToInput(rollup?.totalCost) || '—'}
            </Text>
            {rollup?.hasUnconvertedCurrencies && (
              <Text variant='inactive' size='small'>
                ⚠ some BOM/labour lines are in another currency — excluded from total (no FX)
              </Text>
            )}
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
