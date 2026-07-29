import { SizePickerModal } from 'components/managers/model/components/size-picker-modal';
import {
  useSizeNames,
  useSizeSystems,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { permittedSizeSystems } from 'utils/size-systems';
import { TechCardFormData } from './schema';

// Size range / grade for the tech card (FK size ids). The permitted systems are rendered INLINE —
// every size the category allows is on the page as a chip, selected or not, so the run reads at a
// glance and the common case needs no overlay at all. The popover behind "more systems" only
// carries what the category filtered out.
//
// Per-size patterns, per-size usage consumption (in colourways) and the size run all reference ids
// from this set — so removing a size prunes its patterns / consumption / order qty. That is
// confirmed first, with the real counts, because the data is gone once it goes.
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
  const sizeQuantities = (useWatch({ control, name: 'sizeQuantities' }) ?? []) as Array<{
    sizeId?: number;
  }>;
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    usages?: Array<{ sizeConsumptions?: Array<{ sizeId?: number }> }>;
  }>;

  const [pendingRemove, setPendingRemove] = useState<number | null>(null);

  // Same filter the picker popover uses — one hook, so the inline grid and the overlay can never
  // offer different sets.
  const { permitted, narrowed } = useSizeSystems({
    gender,
    allowedSizeSystems,
    selectedIds: sizeIds,
  });
  const sizeById = useSizeNames();

  const selected = new Set(sizeIds);

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
  const quantityCount = (id: number) => sizeQuantities.filter((q) => q.sizeId === id).length;
  const attachedCount = (id: number) => patternCount(id) + usageLineCount(id) + quantityCount(id);

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
    if (!selected.has(id)) {
      setValue('sizeIds', [...sizeIds, id], { shouldDirty: true });
      return;
    }
    // removing — confirm first if it would discard patterns / per-size consumption / order qty
    if (attachedCount(id) > 0) {
      setPendingRemove(id);
      return;
    }
    pruneAndRemove(id);
  };

  const pendingName =
    pendingRemove != null ? formatSizeName(sizeById.get(pendingRemove) ?? `#${pendingRemove}`) : '';

  // An id in the range that the dictionary does not know about renders nowhere in the grid. It is
  // still in the payload, so it gets its own row rather than becoming invisible-but-saved.
  const rendered = new Set(permitted.flatMap((g) => g.sizes.map((s) => s.id ?? 0)));
  const unknown = sizeIds.filter((id) => !rendered.has(id));

  return (
    <div className='space-y-2'>
      {permitted.length === 0 ? (
        <Text size='micro' variant='label'>
          no sizes available for this category and target gender
        </Text>
      ) : (
        permitted.map((group, gi) => (
          <div key={group.key}>
            <GroupLabel className={gi === 0 ? 'mt-0' : undefined}>{group.label}</GroupLabel>
            <ChipRow>
              {group.sizes.map((s) => {
                const id = s.id ?? 0;
                const on = selected.has(id);
                const attached = on ? attachedCount(id) : 0;
                return (
                  <Chip
                    key={id}
                    selected={on}
                    pressed={on}
                    onClick={() => toggle(id)}
                    title={
                      attached
                        ? `${formatSizeName(s.name)} — carries ${attached} linked ${
                            attached === 1 ? 'entry' : 'entries'
                          }; removing it prunes them`
                        : formatSizeName(s.name)
                    }
                  >
                    {formatSizeName(s.name)}
                    {/* a size carrying patterns / consumption / order qty is not a free deselect */}
                    {attached > 0 && <span aria-hidden>•</span>}
                  </Chip>
                );
              })}
            </ChipRow>
          </div>
        ))
      )}

      {unknown.length > 0 && (
        <div>
          <GroupLabel>not in the dictionary</GroupLabel>
          <ChipRow>
            {unknown.map((id) => (
              <Chip key={id} selected pressed tone='error' onClick={() => toggle(id)}>
                #{id}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}

      <div className='flex flex-wrap items-center gap-2 pt-1'>
        <Text size='micro' variant='label'>
          {sizeIds.length} in the run{sizeIds.length === 0 ? ' — pick the sizes above' : ''}
        </Text>
        {narrowed && (
          <SizePickerModal
            selectedIds={sizeIds}
            onToggle={toggle}
            gender={gender}
            allowedSizeSystems={allowedSizeSystems}
            scope='other'
            triggerLabel='more systems'
            title='other size systems'
          />
        )}
      </div>

      <ConfirmationModal
        open={pendingRemove != null}
        width='sm'
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
        <Text size='micro' variant='label' className='mb-2'>
          Размер {pendingName} используется. Удаление размера удалит:
        </Text>
        <Row
          label='выкройки (PDF)'
          value={pendingRemove != null ? patternCount(pendingRemove) : 0}
        />
        <Row
          label='строки расхода по размерам (колорвеи)'
          value={pendingRemove != null ? usageLineCount(pendingRemove) : 0}
        />
        <Row
          label='заказ по размеру (size run)'
          value={pendingRemove != null ? quantityCount(pendingRemove) : 0}
        />
      </ConfirmationModal>
    </div>
  );
}
