import { adminService } from 'api/api';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { ProductFormData } from '../utility/schema';
import { getFilteredSizes } from '../utility/sizes';
import { buildStylePatch, MODEL_WEARS_UPDATE_MASK } from './utils';

// UpdateStyle is the SOLE writer of a style's catalogue facts. Most of them (brand, season,
// collection, gender, fit, composition, care, categories) are now edited on the tech card and shown
// read-only in <BodyFields/> above; the colourway card keeps only model-wears (the per-colourway
// photo-shoot note). The two model-wears inputs live HERE — not in <BodyFields/> — precisely so there
// is no false impression that the main colourway Save (UpdateColorway) persists them: this section's
// own button is the only thing that saves them, under the field mask below, so saving here never
// touches a fact owned by the tech card. This section is only mounted for an already-created colourway
// (see index.tsx), so add-mode never renders it — see the hint in <BodyFields/> for that gap.
export function StyleSection({
  styleId,
  lockVersion,
  canWrite,
  editMode,
  onChanged,
}: {
  styleId: number;
  lockVersion?: number;
  canWrite: boolean;
  editMode: boolean;
  onChanged?: () => void;
}) {
  const { dictionary } = useDictionary();
  const { getValues, watch } = useFormContext<ProductFormData>();
  const { showMessage } = useSnackBarStore();
  const [saving, setSaving] = useState(false);

  // Same category -> size filtering <BodyFields/> uses for every other size picker on this form;
  // topCategoryId is read-only here (style-owned, edited on the tech card) but still watched in case
  // the tech card edit lands while this page is open.
  watch('product.productBodyInsert.topCategoryId');
  const topCategoryRaw = getValues('product.productBodyInsert.topCategoryId');
  const topCategoryId =
    typeof topCategoryRaw === 'string' ? parseInt(topCategoryRaw) : topCategoryRaw || 0;
  const filteredSizes = useMemo(
    () => getFilteredSizes(dictionary, topCategoryId || 0),
    [dictionary, topCategoryId],
  );

  // canWrite alone used to gate the button because this section only ever mounted in editMode; now it
  // also mounts in view mode (so the values stay visible without entering edit), so both the inputs'
  // readOnly and the button need editMode in the mix too.
  const canEdit = editMode && canWrite;

  async function saveStyle() {
    setSaving(true);
    try {
      await adminService.UpdateStyle({
        styleId,
        patch: buildStylePatch(getValues()),
        expectedLockVersion: lockVersion,
        updateMask: MODEL_WEARS_UPDATE_MASK,
      });
      showMessage('Model-wears updated', 'success');
      onChanged?.();
    } catch (e) {
      const err = e as Error & { status?: number };
      // ABORTED (stale lock) -> 409; FAILED_PRECONDITION (e.g. a season change blocked by SKU-frozen
      // siblings — use clone-for-season instead) -> 400, whose server message names the cause.
      const message =
        err?.status === 409
          ? 'This style changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to update style';
      showMessage(message, 'error');
      console.error('UpdateStyle error', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className='space-y-3 border border-textInactiveColor p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='uppercase' size='large'>
          model presentation
        </Text>
        <Text variant='inactive' size='small'>
          style #{styleId}
        </Text>
      </div>
      <Text variant='inactive' size='small'>
        Model-wears height and size describe this colourway’s photo shoot. They save with the “save
        model-wears” button below — not with the colourway’s main Save. The other style facts
        (brand, season, collection, gender, fit, category, composition, care) are shared across all
        colourways and are edited on the tech card.
      </Text>
      <InputField
        name='product.productBodyInsert.modelWearsHeightCm'
        label='model wears height'
        readOnly={!canEdit}
      />
      <SelectField
        fullWidth
        name='product.productBodyInsert.modelWearsSizeId'
        label='model wears size'
        items={filteredSizes.map((size) => ({
          label: size.name || '',
          value: size.id?.toString() || '',
        }))}
        readOnly={!canEdit}
      />
      {canEdit && (
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          disabled={saving}
          onClick={saveStyle}
        >
          {saving ? 'saving…' : 'save model-wears'}
        </Button>
      )}
    </section>
  );
}
