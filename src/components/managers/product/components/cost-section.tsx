import { adminService } from 'api/api';
import { ProductCostInfo } from 'api/proto-http/admin';
import { generatePath, Link } from 'react-router-dom';
import { useFormContext } from 'react-hook-form';
import { useState } from 'react';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { currencySymbols } from 'constants/constants';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';

// Internal per-unit COGS + its provenance. Field-shaping (🔒 costing): the whole
// block is hidden unless the account has costing:read or costing:write — never
// rendered as a fake €0.00. cost_price is write-only (costing:write); cost_info
// (source / linked tech card / updated_at) is read-only provenance (costing:read).
export function ProductCostSection({
  editMode,
  costInfo,
  productId,
  isAddingProduct,
  onCostSynced,
}: {
  editMode: boolean;
  costInfo?: ProductCostInfo;
  productId?: string;
  isAddingProduct: boolean;
  onCostSynced?: () => void;
}) {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { setValue } = useFormContext();
  const { showMessage } = useSnackBarStore();
  const [syncing, setSyncing] = useState(false);

  // Absent costing access → hide the block entirely (do not reserve space).
  if (!canReadCosting && !canWriteCosting) return null;

  const eur = currencySymbols['EUR'] ?? 'EUR';
  const source = costInfo?.costPriceSource;
  const sourceTcId = costInfo?.costPriceTechCardId;
  const primaryTcId = costInfo?.primaryTechCardId ?? 0;
  const updatedAt = costInfo?.costPriceUpdatedAt;
  const hasProvenance = Boolean(source || costInfo?.costPrice?.value);
  const canSync = canWriteCosting && !isAddingProduct && Boolean(productId);

  async function syncFromTechCard() {
    if (!productId) return;
    setSyncing(true);
    try {
      const res = await adminService.SyncProductCostFromTechCard({
        productId: Number(productId),
        techCardId: 0, // use the product's existing primary card
      });
      if (res.costPrice?.value) setValue('product.costPrice', res.costPrice.value);
      showMessage(
        `Cost synced from TC-${res.techCardId ?? '?'}: ${eur}${res.costPrice?.value ?? '—'}`,
        'success',
      );
      onCostSynced?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to sync cost from tech card';
      showMessage(msg, 'error');
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
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-textInactiveColor pt-3'>
          {costInfo?.costPrice?.value && (
            <Text size='small'>
              current cost: {eur}
              {costInfo.costPrice.value}
            </Text>
          )}
          <Text variant='inactive' size='small'>
            source
          </Text>
          {source === 'tech_card' ? (
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
          ) : source === 'manual' ? (
            <Text size='small'>set manually</Text>
          ) : (
            <Text size='small'>—</Text>
          )}
          {updatedAt && (
            <Text variant='inactive' size='small'>
              updated {new Date(updatedAt).toLocaleDateString()}
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
    </div>
  );
}
