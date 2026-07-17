import { SizePickerModal } from 'components/managers/model/components/size-picker-modal';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { permittedSizeSystems } from 'utils/size-systems';
import { TechCardFormData } from './schema';

// Size range / grade for the tech card (FK size ids). Sizes are picked via the
// shared category modal, filtered by the card's target gender. Per-size patterns,
// per-size usage consumption (in colourways) and the size run all reference ids from this
// set — so removing a size prunes its patterns / consumption / order qty (confirmed first,
// since that data is lost).
export function SizeIdsField() {
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();

  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const gender = useWatch({ control, name: 'targetGender' }) as string | undefined;
  // Restrict the offered sizes to the style category's permitted SKU systems (S10/WS5).
  const categoryId = useWatch({ control, name: 'categoryId' }) as number | undefined;
  const allowedSizeSystems = useMemo(
    () => permittedSizeSystems(dictionary?.categories, dictionary?.categorySizeSystems, categoryId),
    [dictionary?.categories, dictionary?.categorySizeSystems, categoryId],
  );
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as Array<{ sizeId?: number }>;
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    usages?: Array<{ sizeConsumptions?: Array<{ sizeId?: number }> }>;
  }>;

  const [pendingRemove, setPendingRemove] = useState<number | null>(null);

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const patternCount = (id: number) => patterns.filter((p) => p.sizeId === id).length;
  // number of colourway usages that grade this size's consumption
  const usageLineCount = (id: number) =>
    colorways.reduce(
      (n, c) =>
        n +
        (c.usages ?? []).filter((u) => (u.sizeConsumptions ?? []).some((sc) => sc.sizeId === id))
          .length,
      0,
    );

  const pruneAndRemove = (id: number) => {
    setValue(
      'sizeIds',
      sizeIds.filter((x) => x !== id),
      { shouldDirty: true },
    );
    if (patterns.some((p) => p.sizeId === id)) {
      setValue(
        'patterns',
        patterns.filter((p) => p.sizeId !== id) as TechCardFormData['patterns'],
        { shouldDirty: true },
      );
    }
    // prune the size's order qty
    const quantities = (getValues('sizeQuantities') ?? []) as Array<{ sizeId?: number }>;
    if (quantities.some((q) => q.sizeId === id)) {
      setValue(
        'sizeQuantities',
        quantities.filter((q) => q.sizeId !== id) as TechCardFormData['sizeQuantities'],
        { shouldDirty: true },
      );
    }
    // prune the size's per-size consumption from every colourway usage
    const cws = (getValues('colorways') ?? []) as TechCardFormData['colorways'];
    (cws ?? []).forEach((c, ci) => {
      (c.usages ?? []).forEach((u, ui) => {
        const sc = u.sizeConsumptions ?? [];
        if (sc.some((x) => x.sizeId === id)) {
          setValue(
            `colorways.${ci}.usages.${ui}.sizeConsumptions`,
            sc.filter((x) => x.sizeId !== id) as NonNullable<
              NonNullable<TechCardFormData['colorways']>[number]['usages']
            >[number]['sizeConsumptions'],
            { shouldDirty: true },
          );
        }
      });
    });
  };

  const toggle = (id: number) => {
    if (!sizeIds.includes(id)) {
      setValue('sizeIds', [...sizeIds, id], { shouldDirty: true });
      return;
    }
    // removing — confirm first if it would discard per-size patterns / consumption
    if (patternCount(id) > 0 || usageLineCount(id) > 0) {
      setPendingRemove(id);
      return;
    }
    pruneAndRemove(id);
  };

  const pendingName =
    pendingRemove != null ? formatSizeName(sizeById.get(pendingRemove) ?? `#${pendingRemove}`) : '';

  return (
    <div className='space-y-3'>
      <SizePickerModal
        selectedIds={sizeIds}
        onToggle={toggle}
        gender={gender}
        allowedSizeSystems={allowedSizeSystems}
        triggerLabel='select sizes'
        title='size range'
      />

      {sizeIds.length === 0 ? (
        <Text variant='inactive' size='small'>
          no sizes selected
        </Text>
      ) : (
        <div className='flex flex-wrap gap-2'>
          {sizeIds.map((id) => (
            <div
              key={id}
              className='flex items-center gap-2 border border-textInactiveColor px-2 py-1'
            >
              <Text variant='uppercase' size='small'>
                {formatSizeName(sizeById.get(id) ?? `#${id}`)}
              </Text>
              <Button
                type='button'
                aria-label='remove size'
                className='leading-none'
                onClick={() => toggle(id)}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmationModal
        open={pendingRemove != null}
        onOpenChange={(o) => {
          if (!o) setPendingRemove(null);
        }}
        onConfirm={() => {
          if (pendingRemove != null) pruneAndRemove(pendingRemove);
          setPendingRemove(null);
        }}
        title='удалить размер?'
        confirmLabel='удалить размер и данные'
        cancelLabel='отмена'
      >
        <Text size='small'>
          Размер {pendingName} используется: выкройки —{' '}
          {pendingRemove != null ? patternCount(pendingRemove) : 0}, строки расхода по размерам (в
          колорвеях) — {pendingRemove != null ? usageLineCount(pendingRemove) : 0}. Удаление размера
          удалит эти данные.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
