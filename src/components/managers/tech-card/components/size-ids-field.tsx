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
import { Fragment, ReactNode, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Chip, ChipRow, ConfirmationModal, GroupLabel, Row, Text } from 'ui';
import { permittedSizeSystems } from 'utils/size-systems';
import { TechCardFormData } from './schema';

// OS (one size) by its dictionary name. Shared with the pieces dialog, which must not append a
// graded file's sizes onto a one-size card.
export function isOsSizeName(raw: string): boolean {
  const n = formatSizeName(raw)
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
  return n === 'os' || n === 'one size' || n === 'onesize';
}

// Size range / grade for the tech card (FK size ids). The primary system (the one holding the run,
// else the first permitted) is inline; every other system with a selected size is inline too, and
// the empty ones fold behind "more systems (N)". Inside the fold, the out-of-category picker
// carries what the category filtered out. OS and graded sizes exclude each other.
//
// Per-size patterns and the colourways' per-size consumption reference ids from this set. Removing
// a size prunes what this form owns (patterns) and is confirmed first, with the real counts,
// because that data is gone once it goes. The colourway norms are NOT this form's to prune — they
// are colourway-owned, saved by their own RPC — so they are counted and named, not silently
// promised. Nothing here counts order quantities any more: the typical calculation size run is
// gone from the card, and a run's plan lives on the run itself.
export function SizeIdsField({ colorways }: { colorways?: common_AdminColorwayRef[] }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
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
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);

  // Same filter the picker popover uses — one hook, so the inline grid and the overlay can never
  // offer different sets.
  const { permitted, other, narrowed } = useSizeSystems({
    gender,
    allowedSizeSystems,
    selectedIds: sizeIds,
  });
  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();

  const selected = new Set(sizeIds);
  const [expanded, setExpanded] = useState(false);

  // OS (one size) excludes every graded size and vice versa. Detected by the dictionary name;
  // an id the dictionary does not know is neither, so it blocks nothing.
  const isOs = (id: number) => {
    const raw = sizeById.get(id);
    return raw != null && isOsSizeName(raw);
  };
  const osSelected = sizeIds.some(isOs);
  const gradedSelected = sizeIds.some((id) => sizeById.has(id) && !isOs(id));
  // Toggle ON is blocked across the OS line; toggle OFF never is (legacy rows may carry both).
  const blockedReason = (id: number): string | null => {
    if (selected.has(id)) return null;
    if (isOs(id)) return gradedSelected ? "one size can't be combined with other sizes" : null;
    return osSelected ? 'clear one size first' : null;
  };

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
  // Куда перевесится DXF при снятии размера: наименьший оставшийся размер, а если размеров не
  // останется вовсе — 0, то есть БЕЗ РАЗМЕРА (0281: колонка NULLable, сервер такую строку принимает
  // на карточке с любым рядом, включая пустой). Раньше здесь не было цели вовсе, строка оставалась
  // на снятом размере, сервер её отвергал и роняла ВЕСЬ сейв карточки — а кнопка «перевесить» в
  // панели выкроек в этом самом состоянии не рисовалась. Теперь снятие последнего размера просто
  // возвращает лист в то состояние, в котором его сегодня можно и загрузить.
  const refileTarget = (id: number) => orderSizes(sizeIds.filter((x) => x !== id))[0] ?? 0;
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
  // DXF входят в «размер не свободен»: они не теряются, но их size_id меняется, форма грязнится,
  // а в случае последнего размера они вообще становятся сиротами. Молча — не годится.
  const attachedCount = (id: number) => patternCount(id) + dxfCount(id) + usageLineCount(id);

  const pruneAndRemove = (id: number) => {
    setValue(
      'sizeIds',
      sizeIds.filter((x) => x !== id),
      { shouldDirty: true },
    );
    if (patterns.some((p) => p.sizeId === id)) {
      // Куда перевесить DXF: наименьший оставшийся размер — то же правило, по которому их кладёт
      // загрузка, — либо 0 (без размера), если размеров не осталось вовсе. Удаляются только PDF: у
      // них лист действительно на размер, а градуированный чертёж несёт весь ряд и тихо исчезать
      // не должен.
      const fallback = refileTarget(id);
      setValue(
        'patterns',
        patterns
          .filter((p) => p.sizeId !== id || isDxf(p))
          .map((p) =>
            p.sizeId === id ? { ...p, sizeId: fallback } : p,
          ) as TechCardFormData['patterns'],
        { shouldDirty: true },
      );
    }
    // No order-qty pass either: the card no longer holds a size run to prune — the batch plan
    // lives on the production run, keyed by its own (product, size) lines.
    // No colourway pass. It used to walk the RHF `colorways` array and prune each usage's
    // sizeConsumptions — over a permanently empty array, so it pruned nothing while reading as if
    // it handled the case. Those norms belong to the colourway's own recipe write; the confirmation
    // says so instead of promising a deletion that never happened.
  };

  const toggle = (id: number) => {
    if (!selected.has(id)) {
      if (blockedReason(id)) return;
      setValue('sizeIds', [...sizeIds, id], { shouldDirty: true });
      return;
    }
    // removing — confirm first if it would discard patterns / per-size consumption
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

  // Primary system: the one holding the most selected sizes, else the first permitted. Every
  // system with a selected size stays inline; only empty ones fold behind the door.
  const selectedIn = (g: (typeof permitted)[number]) =>
    g.sizes.filter((sz) => selected.has(sz.id ?? 0)).length;
  const primary = permitted.reduce<(typeof permitted)[number] | undefined>(
    (best, g) => (!best || selectedIn(g) > selectedIn(best) ? g : best),
    undefined,
  );
  const pinned = permitted.filter((g) => g !== primary && selectedIn(g) > 0);
  const folded = permitted.filter((g) => g !== primary && selectedIn(g) === 0);
  // N = folded permitted systems + the out-of-category systems behind the picker.
  const moreCount = folded.length + (narrowed ? other.length : 0);

  const renderChip = (sz: (typeof permitted)[number]['sizes'][number]) => {
    const id = sz.id ?? 0;
    const on = selected.has(id);
    const attached = on ? attachedCount(id) : 0;
    const blocked = blockedReason(id);
    return (
      <Chip
        key={id}
        selected={on}
        pressed={on}
        disabled={!!blocked}
        onClick={() => toggle(id)}
        className='disabled:border-dashed disabled:text-borderColor disabled:hover:text-borderColor'
        title={
          blocked ??
          (attached
            ? `${formatSizeName(sz.name)} — carries ${attached} linked ${
                attached === 1 ? 'entry' : 'entries'
              }; removing it prunes them`
            : formatSizeName(sz.name))
        }
      >
        {formatSizeName(sz.name)}
        {/* a size carrying patterns / consumption is not a free deselect */}
        {attached > 0 && <span aria-hidden>•</span>}
      </Chip>
    );
  };

  const renderGroup = (group: (typeof permitted)[number], first: boolean, door?: ReactNode) => {
    const os = group.sizes.filter((sz) => isOs(sz.id ?? 0));
    const graded = group.sizes.filter((sz) => !isOs(sz.id ?? 0));
    return (
      <div key={group.key}>
        <GroupLabel className={first ? 'mt-0' : undefined}>{group.label}</GroupLabel>
        <div className='flex items-start gap-2'>
          <ChipRow className='flex-1'>
            {os.map(renderChip)}
            {os.length > 0 && graded.length > 0 && (
              <Text size='micro' variant='label' component='span' className='px-1'>
                or
              </Text>
            )}
            {graded.map(renderChip)}
          </ChipRow>
          {door}
        </div>
      </div>
    );
  };

  const door =
    moreCount > 0 ? (
      <Button
        variant='underline'
        size='xs'
        className='ml-auto shrink-0 text-labelColor hover:text-textColor'
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        more systems ({moreCount}) {expanded ? '▴' : '▾'}
      </Button>
    ) : undefined;

  return (
    // `data-field='sizeIds'`: the anchor revealField walks to — a failed save on the range and the
    // PATTERNS «open size range» door both land here on the SIZES tab.
    <div className='space-y-2' data-field='sizeIds'>
      {!primary ? (
        <Text size='micro' variant='label'>
          no sizes available for this category and target gender
        </Text>
      ) : (
        <Fragment>
          {renderGroup(primary, true, door)}
          {pinned.map((g) => renderGroup(g, false))}
          {expanded && (
            <Fragment>
              {folded.map((g) => renderGroup(g, false))}
              {narrowed && (
                <div className='pt-1'>
                  <SizePickerModal
                    selectedIds={sizeIds}
                    onToggle={toggle}
                    gender={gender}
                    allowedSizeSystems={allowedSizeSystems}
                    scope='other'
                    triggerLabel='out of category'
                    title='other size systems'
                  />
                </div>
              )}
            </Fragment>
          )}
        </Fragment>
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
        title={`delete size ${pendingName}?`}
        confirmLabel='delete size'
        hideCancel
      >
        {pendingRemove != null && patternCount(pendingRemove) > 0 && (
          <Row label='pattern PDFs' value={patternCount(pendingRemove)} />
        )}
        {pendingRemove != null && dxfCount(pendingRemove) > 0 && (
          <Row
            label={
              refileTarget(pendingRemove) > 0
                ? `DXF · moved to ${nameOf(refileTarget(pendingRemove))}`
                : 'DXF · kept without a size'
            }
            value={dxfCount(pendingRemove)}
          />
        )}
        <Row
          label='per-size consumption lines'
          value={pendingRemove != null ? usageLineCount(pendingRemove) : 0}
        />
      </ConfirmationModal>
    </div>
  );
}
