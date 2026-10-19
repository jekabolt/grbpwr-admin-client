import { adminService } from 'api/api';
import { ColorwayCostInfo } from 'api/proto-http/admin';
import { generatePath, Link } from 'react-router-dom';
import { useFormContext } from 'react-hook-form';
import { useState } from 'react';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES } from 'constants/routes';
import { notify } from 'lib/stores/store';
import { currencySymbols } from 'constants/constants';
import { Button, Text, InputField, EmptyCell, useDoneFlash } from 'ui';
import { ProductMarginPanel } from './margin-panel';

// Internal per-unit COGS + its provenance. Field-shaping (🔒 costing): the whole
// block is hidden unless the account has costing:read or costing:write — never
// rendered as a fake €0.00. cost_price is write-only (costing:write); cost_info
// (source / linked tech card / updated_at) is read-only provenance (costing:read).
export function ProductCostSection({
  editMode,
  costInfo,
  productId,
  lockVersion,
  isAddingProduct,
  onCostSynced,
}: {
  editMode: boolean;
  costInfo?: ColorwayCostInfo;
  productId?: string;
  // Shared tech_card.lock_version of the colourway — the optimistic-lock token the cost sync echoes.
  lockVersion?: number;
  isAddingProduct: boolean;
  onCostSynced?: () => void;
}) {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { setValue } = useFormContext();
  const synced = useDoneFlash();
  const [syncing, setSyncing] = useState(false);

  // Absent costing access → hide the block entirely (do not reserve space).
  if (!canReadCosting && !canWriteCosting) return null;

  const eur = currencySymbols['EUR'] ?? 'EUR';
  const source = costInfo?.costPriceSource;
  const sourceTcId = costInfo?.costSourceTechCardId;
  // R4: cost provenance is an enum now. STYLE/PRODUCTION_RUN are the derived sources (linked to a tech
  // card); MANUAL is an operator-entered cost.
  const isDerived =
    source === 'COLORWAY_COST_SOURCE_STYLE' || source === 'COLORWAY_COST_SOURCE_PRODUCTION_RUN';
  const isManual = source === 'COLORWAY_COST_SOURCE_MANUAL';
  const primaryTcId = costInfo?.primaryTechCardId ?? 0;
  const updatedAt = costInfo?.costPriceUpdatedAt;
  const hasProvenance = Boolean(source || costInfo?.costPrice?.value);
  const canSync = canWriteCosting && !isAddingProduct && Boolean(productId);

  async function syncFromTechCard() {
    if (!productId) return;
    setSyncing(true);
    try {
      const res = await adminService.SyncColorwayCostFromOwningStyle({
        colorwayId: Number(productId),
        // Echo the shared tech_card.lock_version; 0 falls back to an unconditional sync.
        expectedVersion: lockVersion ?? 0,
      });
      if (res.costPrice?.value) setValue('product.costPrice', res.costPrice.value);
      // The cost field and provenance line show the new value.
      synced.flash();
      onCostSynced?.();
    } catch (error) {
      // Cost path: feedback only, no retry.
      notify({
        sev: 'error',
        subject: `PRODUCT ${productId}`,
        text: 'cost not synced',
        bad: 'refused',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='inactive' size='small'>
        Per-unit cost of goods for margin analytics — internal, never shown to shoppers.
      </Text>

      {canWriteCosting && (
        <div className='flex flex-col gap-1'>
          <Text>cost {eur} · internal</Text>
          <InputField
            name='product.costPrice'
            type='number'
            step='0.01'
            min='0'
            placeholder='per-unit COGS'
            readOnly={!editMode}
            className='w-full sm:w-1/3'
          />
          {editMode && (
            <Text variant='inactive' size='small'>
              Leave empty to keep the current cost.
            </Text>
          )}
        </div>
      )}

      {canReadCosting && hasProvenance && (
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borderColor pt-3'>
          {costInfo?.costPrice?.value && (
            <Text size='small'>
              current cost: {eur}
              {costInfo.costPrice.value}
            </Text>
          )}
          <Text variant='inactive' size='small'>
            source
          </Text>
          {isDerived ? (
            <Text size='small'>
              from tech card{' '}
              {sourceTcId ? (
                <Link
                  className='underline'
                  to={generatePath(ROUTES.singleTechCard, { id: `${sourceTcId}` })}
                >
                  TC-{sourceTcId}
                </Link>
              ) : null}
            </Text>
          ) : isManual ? (
            <Text size='small'>set manually</Text>
          ) : (
            <Text size='small'>
              <EmptyCell />
            </Text>
          )}
          {updatedAt && (
            <Text variant='inactive' size='small'>
              updated {new Date(updatedAt).toLocaleDateString('en-US')}
            </Text>
          )}
        </div>
      )}

      {canSync && (
        <div className='flex items-center gap-3'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            disabled={syncing || !primaryTcId}
            done={synced.on && 'synced'}
            onClick={syncFromTechCard}
          >
            {syncing ? 'syncing…' : '↻ sync cost from tech card'}
          </Button>
          {!primaryTcId && (
            <Text variant='inactive' size='small'>
              no primary tech card linked
            </Text>
          )}
        </div>
      )}

      {/* Full margin: (discounted) selling price − COGS, per selling currency, + the style-economics
          drill-down. Gated to costing:read inside the panel. */}
      <ProductMarginPanel costInfo={costInfo} />
    </div>
  );
}
