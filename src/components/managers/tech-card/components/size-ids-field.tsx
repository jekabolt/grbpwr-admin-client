import { common_AdminColorwayRef } from 'api/proto-http/admin';
import { SizePickerModal } from 'components/managers/model/components/size-picker-modal';
import {
  useSizeNames,
  useSizeOrdering,
  useSizeSystems,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { isDxfUrl } from 'utils/pattern';
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
// Per-size patterns, the size run and the colourways' per-size consumption all reference ids from
// this set. Removing a size prunes what this form owns (patterns, order qty) and is confirmed first,
// with the real counts, because that data is gone once it goes. The colourway norms are NOT this
// form's to prune — they are colourway-owned, saved by their own RPC — so they are counted and
// named, not silently promised.
export function SizeIdsField({ colorways }: { colorways?: common_AdminColorwayRef[] }) {
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
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as Array<{
    sizeId?: number;
    url?: string;
  }>;
  const sizeQuantities = (useWatch({ control, name: 'sizeQuantities' }) ?? []) as Array<{
    sizeId?: number;
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
  const orderSizes = useSizeOrdering();

  const selected = new Set(sizeIds);

  // Выкройки, которые снятие размера ДЕЙСТВИТЕЛЬНО потеряет.
  //
  // Размерный слот у DXF — артефакт хранения: size_id в таблице NOT NULL, а градуированный файл
  // несёт весь ряд, поэтому загрузка кладёт его в наименьший размер ряда, и никакой смысл в этом
  // не заложен. Считать такие строки «потерями размера» и удалять их значило бы: снял XS —
  // предложено удалить ВСЕ выкройки карточки. Поэтому DXF не удаляются, а перевешиваются на
  // оставшийся наименьший размер; теряются только PDF, у которых лист действительно на размер.
  const isDxf = (p: { url?: string }) => isDxfUrl(p.url);
  const patternCount = (id: number) => patterns.filter((p) => p.sizeId === id && !isDxf(p)).length;
  const dxfCount = (id: number) => patterns.filter((p) => p.sizeId === id && isDxf(p)).length;
  // Куда перевесится DXF при снятии размера. undefined = размеров не останется вовсе, и
  // перевешивать НЕКУДА: строки станут сиротами вне ряда, а такую строку сервер отвергает и
  // роняет весь сейв карточки. Обещать в диалоге перевешивание в этом случае нельзя.
  const refileTarget = (id: number) => orderSizes(sizeIds.filter((x) => x !== id))[0];
  // Number of colourway usages that grade this size's consumption, read from the colourways AS READ.
  // It used to reduce over the RHF `colorways` array, which has been permanently empty since
  // colourways became products: the count was always 0, so a size graded only by recipe norms was
  // removed with no confirmation at all.
  const usageLineCount = (id: number) =>
    (colorways ?? []).reduce(
      (n, c) =>
        n +
        (c.usages ?? []).filter((u) => (u.sizeConsumptions ?? []).some((sc) => sc.sizeId === id))
          .length,
      0,
    );
  const quantityCount = (id: number) => sizeQuantities.filter((q) => q.sizeId === id).length;
  // DXF входят в «размер не свободен»: они не теряются, но их size_id меняется, форма грязнится,
  // а в случае последнего размера они вообще становятся сиротами. Молча — не годится.
  const attachedCount = (id: number) =>
    patternCount(id) + dxfCount(id) + usageLineCount(id) + quantityCount(id);

  const pruneAndRemove = (id: number) => {
    setValue(
      'sizeIds',
      sizeIds.filter((x) => x !== id),
      { shouldDirty: true },
    );
    if (patterns.some((p) => p.sizeId === id)) {
      // Куда перевесить DXF: наименьший оставшийся размер — то же правило, по которому их кладёт
      // загрузка. Если размеров не осталось вовсе, перевешивать некуда и строка остаётся сиротой —
      // панель выкроек метит такие строки и даёт «перевесить», что честнее тихого удаления
      // чертежа, который несёт весь ряд.
      const fallback = refileTarget(id);
      setValue(
        'patterns',
        patterns
          .filter((p) => p.sizeId !== id || isDxf(p))
          .map((p) =>
            p.sizeId === id && fallback != null ? { ...p, sizeId: fallback } : p,
          ) as TechCardFormData['patterns'],
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
    // No colourway pass. It used to walk the RHF `colorways` array and prune each usage's
    // sizeConsumptions — over a permanently empty array, so it pruned nothing while reading as if
    // it handled the case. Those norms belong to the colourway's own recipe write; the confirmation
    // says so instead of promising a deletion that never happened.
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

  const nameOf = (id: number) => formatSizeName(sizeById.get(id) ?? `#${id}`);
  const pendingName = pendingRemove != null ? nameOf(pendingRemove) : '';

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
        confirmLabel='удалить размер'
        cancelLabel='отмена'
      >
        <Text size='micro' variant='label' className='mb-2'>
          Размер {pendingName} используется. Что произойдёт:
        </Text>
        {pendingRemove != null && patternCount(pendingRemove) > 0 && (
          <Row label='выкройки PDF' value={patternCount(pendingRemove)} />
        )}
        {pendingRemove != null && dxfCount(pendingRemove) > 0 && (
          <Row
            label={
              refileTarget(pendingRemove) != null
                ? `DXF — не удалятся, перевесятся на ${nameOf(refileTarget(pendingRemove)!)}`
                : 'DXF — перевесить будет НЕКУДА: размеров не останется, и до ручного перевешивания карточка не сохранится'
            }
            value={dxfCount(pendingRemove)}
          />
        )}
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
