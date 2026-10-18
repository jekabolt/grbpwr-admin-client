import {
  common_AdminColorwayRef,
  common_Color,
  common_Material,
  common_TechCard,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import {
  MaterialHoverCard,
  MaterialPickerDialog,
  materialSwatchColour,
  useMaterialStockFacts,
  type MaterialStockFacts,
} from 'components/managers/materials/components/material-picker';
import { materialImageUrl } from 'components/managers/materials/components/material-thumb';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  AddDoor,
  Button,
  Chip,
  ChipRow,
  DataTable,
  EmptyCell,
  HeaderWarnings,
  type HeaderWarning,
  GenericPopover,
  Section,
  Text,
  Tooltip,
} from 'ui';
import { parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { ColorwayDeleteControl } from './colorway-delete';
import {
  fromRead,
  MANUAL_PROVENANCE,
  savableUsage,
  toWire,
  type UsageDraft,
} from './colorway-usage-wire';
import { readColorwayVersion } from './colorway-version';
import { paletteValueFromRead } from './colourway-palette';
import { proposePins } from './colourway-material-match';
import { ColourwayCreatePopover } from './design/colourway-create';
import { TrimPictogram, trimPictogramKind } from './design/pattern/trim-pictograms';
import { DxfApplyHint } from './dxf-apply';
import { KitMarkerHint } from './kit-marker';
import { MarkerApplyHint } from './marker-apply';
import { type MarkerColorway } from './nesting/colorway-widths';
import { bomUnitKind, cardMarkers, markersForLine, markersOfColorway } from './nesting/marker-io';
import { TechCardFormData, wireInt } from './schema';
import {
  applyPlanToUsages,
  canonicalUsage,
  hasValue,
  type SlotRows,
  EMPTY_PLAN,
  GARMENT_SECTIONS,
  groupRowsBySlot,
  measured,
  PIECE_SECTIONS,
  pinPatch,
  planAuto,
  patchSlotRows,
  resolveSlotArticle,
  slotDraft,
  type AutoPlan,
  type BomLine,
  type RecipePiece,
} from './use-colourway-auto';
import { columnWarnings, slotLabel } from './use-colourway-warnings';
import { recipeSaveErrorMessage, useUpdateColorwayRecipe } from './useColorwayRecipe';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// ═══ COLOURWAYS — ОДНА МАТРИЦА: РЯДЫ = СЛОТЫ BOM, КОЛОНКИ = КОЛОРВЕИ (COLOURWAYS-LITE D1) ══════
//
// Ячейка отвечает на один вопрос: какой материал стоит на этой части в этом цвете, и сколько его.
// Каждая колонка — свой черновик рецепта (хуки не крутятся в цикле, поэтому колонка — компонент), а
// ряды выравнивает subgrid: колонка занимает все ряды сетки и делит их с соседями.
//
// ПРОСМОТР НЕ ПИШЕТ НИЧЕГО. Авто-заполнение — только по кнопке `auto · N` или при рождении колорвея
// копией последнего (use-colourway-auto.ts).

const TILE = 140;

// Phase-02 field metrics: a full 1px box, 3px/7px padding, 22px min height — identical to <Input>.
const cell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

// Inside a DataTable cell the BORDER is the cell's, not the input's.
const gridInput =
  'block min-h-[22px] w-full appearance-none border-0 bg-transparent text-center text-textBaseSize outline-none focus:bg-bgSecondary disabled:text-labelColor';

// 10px uppercase grey: ряд-подпись, цвет под плиткой, подпись поля.
const LABEL = 'text-micro uppercase tracking-label text-labelColor';

type Focus = { cwId: number; kind: 'picker' | 'norm'; key: string } | null;
type RecipeSnapshot = { usages: UsageDraft[] };
type GradingCache = { scalar: string; perSize: { sizeId: number; consumption: string }[] };

// ── ИМЯ И ЦВЕТ КОЛОРВЕЯ ────────────────────────────────────────────────────────────────────────

// The operator's word for a colourway — never its numeric id.
export function colorwayTitle(cw: common_AdminColorwayRef): string {
  return cw.colorCode?.trim() || cw.baseSku?.trim() || `#${cw.colorwayId}`;
}

// ИМЯ КОЛОРВЕЯ — ТО, КАК ЕГО НАЗВАЛ ЧЕЛОВЕК (`development.name`), А НЕ КОД СЛОВАРЯ (D10). Фолбэк —
// `colorwayTitle`: колорвеи, заведённые до кастомных имён, называются кодом.
export function colourwayName(cw: common_AdminColorwayRef): string {
  return cw.devName?.trim() || colorwayTitle(cw);
}

// ЦВЕТ КОЛОРВЕЯ: ПАНТОН ПЕРВЫЙ, СЛОВАРЬ — ФОЛБЭК. Формат `dev_hex` не гарантирован (`#RRGGBB` или
// голые шесть цифр). Пустая строка нормализуется в undefined, чтобы рисовался плейсхолдер.
export function colourwaySwatchHex(
  cw: common_AdminColorwayRef,
  dictHex?: string,
): string | undefined {
  const dev = (cw.devHex ?? '').trim();
  if (/^#?[0-9a-f]{6}$/i.test(dev)) return dev.startsWith('#') ? dev : `#${dev}`;
  return dictHex || undefined;
}

// Число под плиткой: диапазон по размерам, иначе скаляр, иначе штуки. Пусто на измеряемом слоте —
// красное «no norm»; на счётном — прочерк, по нему всё равно открывается ввод.
function consumptionLabel(draft: UsageDraft, slot: BomLine): { text: string; missing: boolean } {
  const unit = slot.unit?.trim() || '';
  const withUnit = (v: string) => (unit ? `${v} ${unit}` : v);
  const sized = draft.sizeConsumptions
    .map((x) => parseDecimalNumber(x.consumption ?? ''))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (sized.length > 0) {
    const lo = Math.min(...sized);
    const hi = Math.max(...sized);
    const f = (n: number) => String(Math.round(n * 1000) / 1000);
    return { text: withUnit(lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`), missing: false };
  }
  if (draft.consumption.trim()) return { text: withUnit(draft.consumption.trim()), missing: false };
  if (draft.quantity.trim()) {
    return { text: `${draft.quantity.trim()} ${unit || 'pcs'}`, missing: false };
  }
  if (measured(slot.section)) return { text: 'no norm', missing: true };
  return { text: '', missing: false };
}

// The write is a FULL REPLACE, identity is the durable pair (piece_line_key || '', bom_line_key).
function usageKey(u: Pick<UsageDraft, 'pieceLineKey' | 'bomLineKey'>): string {
  return `${u.pieceLineKey || ''}\u0000${u.bomLineKey}`;
}

// ДУБЛИ СЧИТАЮТСЯ ПОШТУЧНО, А НЕ СХЛОПЫВАЮТСЯ В КЛЮЧ: сервер их СУММИРУЕТ, так что каждая влияет на
// деньги и обязана считаться отдельно. Сравнение внутри одного ключа — ПОЗИЦИОННОЕ.
function changedLines(base: UsageDraft[], next: UsageDraft[]): number {
  const group = (rows: UsageDraft[]) => {
    const m = new Map<string, string[]>();
    for (const u of rows) {
      const k = usageKey(u);
      const list = m.get(k) ?? [];
      list.push(JSON.stringify(toWire(u)));
      m.set(k, list);
    }
    return m;
  };
  const before = group(base);
  const after = group(next);
  let n = 0;
  for (const [k, list] of after) {
    const prev = before.get(k) ?? [];
    for (let i = 0; i < list.length; i += 1) if (prev[i] !== list[i]) n += 1;
    if (prev.length > list.length) n += prev.length - list.length;
  }
  for (const [k, prev] of before) if (!after.has(k)) n += prev.length;
  return n;
}

// ═══ ЧЕРНОВИК РЕЦЕПТА ОДНОГО КОЛОРВЕЯ ═════════════════════════════════════════════════════════
//
// CRITICAL (full-replace): the draft starts from the LIVE read (colorway.usages), never from empty,
// and the save sends EVERY savable row — строки деталей в матрице не видны, но живут в списке и
// уезжают на сервер как есть. Убирает строки только явный `clean up` из шапки.
function useColourwayRecipeDraft({
  colorway,
  bomItems,
  pieces,
  bomKeySet,
  lockVersion,
  techCardId,
  canEdit,
}: {
  colorway: common_AdminColorwayRef;
  bomItems: BomLine[];
  pieces: RecipePiece[];
  /** ВСЕ ключи строк BOM: строка рецепта на этикетке/упаковке — законные данные, не «без слота». */
  bomKeySet: ReadonlySet<string>;
  lockVersion: number;
  techCardId: number;
  canEdit: boolean;
}) {
  const save = useUpdateColorwayRecipe(techCardId);
  const staging = useTechCardStaging();
  const colorwayId = colorway.colorwayId ?? 0;
  const stagingKey = `recipe:${colorwayId}`;
  const title = colourwayName(colorway);
  const [dirty, setDirty] = useState(false);
  // Канон при чтении: пин на артикул самого слота = 0 (тот же канон уходит на провод).
  const slotByKey = useMemo(() => new Map(bomItems.map((b) => [b.lineKey ?? '', b])), [bomItems]);
  const baseline = useMemo(
    () =>
      (colorway.usages ?? []).map((u) => {
        const d = fromRead(u, bomItems, pieces);
        return canonicalUsage(d, slotByKey.get(d.bomLineKey));
      }),
    [colorway.usages, bomItems, pieces, slotByKey],
  );
  const [usages, setUsages] = useState<UsageDraft[]>(baseline);
  // Re-sync when the read changes (after a save's refetch) unless the user has uncommitted edits.
  useEffect(() => {
    if (dirty) return;
    setUsages(baseline);
  }, [baseline, dirty]);

  const pieceKeySet = useMemo(() => new Set(pieces.map((p) => p.lineKey)), [pieces]);
  const rowsBySlot = useMemo(() => groupRowsBySlot(usages, pieceKeySet), [usages, pieceKeySet]);
  // Сирота — строка детали, которой больше нет. Строка без слота — слот не назван или не ряд
  // матрицы (удалён на BOM, либо секция в рецепт не заводится).
  const isOrphan = useCallback(
    (u: UsageDraft) => !!u.pieceLineKey && !pieceKeySet.has(u.pieceLineKey),
    [pieceKeySet],
  );
  const isStray = useCallback(
    (u: UsageDraft) => !isOrphan(u) && (!u.bomLineKey || !bomKeySet.has(u.bomLineKey)),
    [isOrphan, bomKeySet],
  );
  // ЛЕГАСИ-НОРМА НА ДЕТАЛИ: строка детали со своим числом или пином. В матрице строк деталей не
  // видно, а сервер суммирует строки слота — такое число молча прибавляется к норме ткани.
  // Строка остаётся в рецепте как есть; шапка называет её и предлагает снять число.
  const isPieceNorm = useCallback(
    (u: UsageDraft) => !!u.pieceLineKey && !isOrphan(u) && (hasValue(u) || u.materialId > 0),
    [isOrphan],
  );
  const orphanCount = useMemo(() => usages.filter(isOrphan).length, [usages, isOrphan]);
  const strayCount = useMemo(() => usages.filter(isStray).length, [usages, isStray]);
  // Привязки «деталь → слот» из ЧЕРНОВИКА — вход расчёта «по выкройкам».
  const recipeLinks = useMemo(
    () => usages.map((u) => ({ pieceLineKey: u.pieceLineKey, bomLineKey: u.bomLineKey })),
    [usages],
  );

  // Что реально уедет на сервер — ОДНО правило (savableUsage), и оно же считает правки.
  const saveUsages = useMemo(
    () => usages.filter(savableUsage).map((u) => canonicalUsage(u, slotByKey.get(u.bomLineKey))),
    [usages, slotByKey],
  );
  // ДУБЛИ СТРОКИ ИЗДЕЛИЯ НА ОДНОМ СЛОТЕ: в матрице видна первая, а сервер суммирует все и полная
  // замена их отправляет. Пока они есть, запись отказывает; дверь в шапке оставляет первую.
  const duplicates = useMemo(() => {
    const out: { key: string; count: number }[] = [];
    for (const [key, e] of rowsBySlot) {
      // только ряды матрицы: строки этикетки/упаковки невидимы и сохраняются как есть
      const slot = slotByKey.get(key);
      if (!GARMENT_SECTIONS.has(slot?.section ?? '')) continue;
      // считаются только строки, которые РЕАЛЬНО уедут на сервер (канон + savableUsage)
      const count = e.garment.filter(({ draft: g }) =>
        savableUsage(canonicalUsage(g, slot)),
      ).length;
      if (count > 1) out.push({ key, count });
    }
    return out;
  }, [rowsBySlot, slotByKey]);
  // Остаётся ПЕРВАЯ СОХРАНЯЕМАЯ строка изделия слота; прочие строки изделия этого слота уходят.
  // Первая сырая могла быть пустой после канона (пин на артикул слота) — оставить её значило бы
  // удалить заполненную, а пустую потом выбросило бы сохранение.
  const keepFirst = (key: string) => {
    setDirty(true);
    setUsages((prev) => {
      const slot = slotByKey.get(key);
      const mine = (u: UsageDraft) => !u.pieceLineKey && u.bomLineKey === key;
      const keep = prev.findIndex((u) => mine(u) && savableUsage(canonicalUsage(u, slot)));
      return prev.filter(
        (u, i) => !mine(u) || i === keep || (keep < 0 && i === prev.findIndex(mine)),
      );
    });
  };
  // ЗАПАС РЕЖИМОВ НОРМЫ по слоту: прежний скаляр и прежние числа по размерам. Живёт в черновике
  // колонки, а не в поповере: поповер монтируется только открытым, и закрытие стирало бы запас.
  // Слот без строки изделия запас теряет — иначе удалённая норма воскресала бы при переключении.
  const gradingCache = useRef(new Map<string, GradingCache>());
  useEffect(() => {
    for (const key of [...gradingCache.current.keys()])
      if (!(rowsBySlot.get(key)?.garment.length ?? 0)) gradingCache.current.delete(key);
  }, [rowsBySlot]);
  const gradingFor = (key: string): GradingCache => {
    let c = gradingCache.current.get(key);
    if (!c) {
      c = { scalar: '', perSize: [] };
      gradingCache.current.set(key, c);
    }
    return c;
  };
  const lines = useMemo(
    () => changedLines(baseline.filter(savableUsage), saveUsages),
    [baseline, saveUsages],
  );
  const staged = dirty && lines > 0;
  const snapshot = useMemo<RecipeSnapshot>(() => ({ usages }), [usages]);

  const patchGarmentSlot = (bomLineKey: string, index: number, patch: Partial<UsageDraft>) => {
    if (!bomLineKey) return;
    setDirty(true);
    setUsages((prev) => patchSlotRows(prev, bomLineKey, index, patch));
  };
  const applyPlan = (plan: AutoPlan) => {
    if (plan.n === 0) return;
    setDirty(true);
    setUsages((prev) => applyPlanToUsages(prev, plan));
  };
  const cleanUp = (what: 'stray' | 'orphan') => {
    setDirty(true);
    setUsages((prev) => prev.filter((u) => !(what === 'orphan' ? isOrphan(u) : isStray(u))));
  };
  const clearPieceNorms = () => {
    setDirty(true);
    setUsages((prev) =>
      prev.map((u) =>
        isPieceNorm(u)
          ? {
              ...u,
              materialId: 0,
              consumption: '',
              quantity: '',
              sizeConsumptions: [],
              normMarkerId: 0,
              ...MANUAL_PROVENANCE,
            }
          : u,
      ),
    );
  };
  const seed = (next: UsageDraft[]) => {
    setDirty(true);
    setUsages(next);
  };
  // Живой черновик для `+` (копия последнего колорвея берётся с ЧЕРНОВИКА, а не с сервера).
  const usagesRef = useRef(usages);
  usagesRef.current = usages;

  // The panel's mutation, unwrapped: it THROWS, because the header's one save reports the outcome.
  async function commitRecipe() {
    if (!colorwayId) return;
    // ПОЛНАЯ ЗАМЕНА НЕ ОТПРАВЛЯЕТ СТРОК БЕЗ СЛОТА И СТРОК УДАЛЁННЫХ ДЕТАЛЕЙ (первые отправить нечем,
    // вторые сервер отвергнет), то есть сохранение удалило бы их молча. Пока они есть, запись
    // отказывает словами; дверь `clean up` в шапке вкладки.
    const blocked = strayCount + orphanCount + duplicates.reduce((n, d) => n + d.count - 1, 0);
    if (blocked > 0) {
      throw new Error(
        `colourway ${title}: ${blocked} recipe ${blocked === 1 ? 'line has' : 'lines have'} no slot, a removed piece or a duplicate on one part; fix it in the colourways header first`,
      );
    }
    try {
      const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);
      await save.mutateAsync({
        colorwayId,
        expectedColorwayVersion: expected,
        usages: saveUsages.map(toWire),
      });
    } catch (e) {
      throw new Error(recipeSaveErrorMessage(e), { cause: e });
    }
  }

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over
  // this render's rows; unstaged the moment the recipe matches the server again.
  useEffect(() => {
    if (!staging || !colorwayId || !canEdit) return;
    if (!staged) {
      staging.unstage(stagingKey);
      return;
    }
    staging.stage({
      key: stagingKey,
      label: `colourway ${title} · recipe, ${lines} ${lines === 1 ? 'line' : 'lines'}`,
      order: COMMIT_ORDER.recipe,
      commit: commitRecipe,
      settle: () => setDirty(false),
      snapshot,
    });
    // commitRecipe is redefined every render by design (it reads current state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    stagingKey,
    colorwayId,
    canEdit,
    staged,
    lines,
    usages,
    snapshot,
    title,
    lockVersion,
    techCardId,
  ]);

  // Колонка ушла насовсем (удаление, архив, смена карточки): ничего не должно остаться застейдженным
  // против колорвея, которого здесь больше нет (как samples-tab afterDelete).
  useEffect(
    () => () => {
      if (colorwayId) staging?.unstage(stagingKey);
    },
    [staging, stagingKey, colorwayId],
  );

  return {
    usages,
    rowsBySlot,
    recipeLinks,
    orphanCount,
    strayCount,
    patchGarmentSlot,
    applyPlan,
    cleanUp,
    clearPieceNorms,
    seed,
    usagesRef,
    pieceKeySet,
    duplicates,
    keepFirst,
    gradingFor,
  };
}

// ═══ РАСХОД ПО РАЗМЕРАМ (поповер числа) ════════════════════════════════════════════════════════
//
// Скалярная норма — одна колонка; «по размерам» — колонка на размер карточки плюс сохранённые
// размеры вне ряда (сервер по непустым size_consumptions игнорирует скаляр, такие числа прятать
// нельзя). Любая ручная правка числа снимает марочный провенанс (MANUAL_PROVENANCE).
function UsagePerSizeLocal({
  draft,
  sizeIds,
  unit,
  canEdit,
  cache,
  sizeNameById,
  onChange,
}: {
  draft: UsageDraft;
  sizeIds: number[];
  // ЕДИНИЦА НОРМЫ — единица строки BOM, и только она (сервер хранит норму в единице слота).
  unit: string;
  canEdit: boolean;
  /** Запас режимов этого слота — из черновика колонки (переживает закрытие поповера). */
  cache: GradingCache;
  sizeNameById: Map<number, string>;
  onChange: (patch: Partial<UsageDraft>) => void;
}) {
  const perSize = draft.sizeConsumptions.length > 0;
  // СКАЛЯР И РАЗМЕРЫ НА ПРОВОДЕ ВЗАИМОИСКЛЮЧАЮЩИ: «по размерам» снимает скаляр, прежний помнится
  // только в запасе — чтобы вернуть его при переключении обратно. Очистка всех ячеек его не оживляет.

  const consumptionBySize = new Map<number, string>();
  for (const e of draft.sizeConsumptions)
    if (e.sizeId != null) consumptionBySize.set(e.sizeId, e.consumption ?? '');

  const manual = <T extends Partial<UsageDraft>>(patch: T) => ({ ...patch, ...MANUAL_PROVENANCE });

  const enablePerSize = () => {
    if (perSize) return;
    const prior = new Map(cache.perSize.map((e) => [e.sizeId, e.consumption]));
    cache.scalar = draft.consumption;
    onChange(
      manual({
        consumption: '',
        sizeConsumptions: sizeIds.map((id) => ({
          sizeId: id,
          consumption: prior.get(id) ?? draft.consumption ?? '',
        })),
      }),
    );
  };
  const disablePerSize = () => {
    if (!perSize) return;
    cache.perSize = draft.sizeConsumptions.map((e) => ({
      sizeId: e.sizeId ?? 0,
      consumption: e.consumption ?? '',
    }));
    onChange(manual({ sizeConsumptions: [], consumption: cache.scalar }));
  };
  const setSizeCell = (sizeId: number, value: string) => {
    const clean = sanitizeDecimal(value);
    const next = [...draft.sizeConsumptions];
    const i = next.findIndex((x) => x.sizeId === sizeId);
    if (i >= 0) next[i] = { sizeId, consumption: clean };
    else next.push({ sizeId, consumption: clean });
    onChange(manual({ sizeConsumptions: next, consumption: '' }));
  };

  const extraSizes = draft.sizeConsumptions
    .map((x) => x.sizeId ?? 0)
    .filter((id) => id > 0 && !sizeIds.includes(id));
  const colSizes = perSize ? [...sizeIds, ...[...new Set(extraSizes)]] : [];

  return (
    <div className='flex flex-col gap-1.5'>
      {sizeIds.length > 0 && canEdit && (
        <ChipRow>
          <Chip selected={!perSize} pressed={!perSize} onClick={disablePerSize}>
            one per unit
          </Chip>
          <Chip selected={perSize} pressed={perSize} onClick={enablePerSize}>
            per size
          </Chip>
        </ChipRow>
      )}
      <DataTable>
        <thead>
          <tr>
            {!perSize ? (
              <th>per unit{unit ? `, ${unit}` : ''}</th>
            ) : (
              colSizes.map((id) => (
                <th key={id} className={sizeIds.includes(id) ? undefined : 'text-warning'}>
                  {formatSizeName(sizeNameById.get(id) ?? `#${id}`)}
                  {sizeIds.includes(id) ? '' : ' *'}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            {!perSize ? (
              <td className='p-0'>
                <input
                  className={cn(gridInput, 'bg-bgZebra')}
                  inputMode='decimal'
                  disabled={!canEdit}
                  placeholder='0.000'
                  aria-label={`per-unit consumption${unit ? ` (${unit})` : ''}`}
                  value={draft.consumption}
                  onChange={(e) =>
                    onChange(manual({ consumption: sanitizeDecimal(e.target.value) }))
                  }
                />
              </td>
            ) : (
              colSizes.map((id) => (
                <td key={id} className='p-0'>
                  {canEdit ? (
                    <input
                      className={cn(gridInput, 'bg-bgZebra')}
                      inputMode='decimal'
                      placeholder='0.000'
                      aria-label={`consumption ${formatSizeName(sizeNameById.get(id) ?? `#${id}`)}`}
                      value={consumptionBySize.get(id) ?? ''}
                      onChange={(e) => setSizeCell(id, e.target.value)}
                    />
                  ) : (
                    (consumptionBySize.get(id) ?? '').trim() || <EmptyCell />
                  )}
                </td>
              ))
            )}
          </tr>
        </tbody>
      </DataTable>
      {extraSizes.length > 0 && (
        <Text
          size='nano'
          variant='label'
          component='p'
          title='these numbers are still saved and used: remove them or put the size back in the range'
        >
          * not in the card&apos;s range
        </Text>
      )}
    </div>
  );
}

// Тело поповера числа: ввод руками (он всегда побеждает) и «другой источник» за раскрывашкой —
// существующие диалоги раскладки, выкроек и раскладки комплекта. Монтируется только открытым:
// подсказки держат подписки на массивы формы.
function ConsumptionEditor({
  slot,
  draft,
  cache,
  materials,
  markers,
  allCardMarkers,
  recipeLinks,
  colorwayId,
  colorwayPins,
  techCardId,
  sizeIds,
  sizeNameById,
  canEdit,
  frozen,
  onChange,
}: {
  slot: BomLine;
  draft: UsageDraft;
  cache: GradingCache;
  materials: common_Material[];
  markers: common_TechCardMarkerSummary[];
  allCardMarkers: common_TechCardMarkerSummary[];
  recipeLinks: readonly { pieceLineKey: string; bomLineKey: string }[];
  colorwayId: number;
  colorwayPins: readonly MarkerColorway[];
  techCardId: number;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  frozen: boolean;
  onChange: (patch: Partial<UsageDraft>) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { articleWidth, weightBasis } = resolveSlotArticle(draft, slot, materials);
  const unit = slot.unit?.trim() || '';
  const rollGoods = PIECE_SECTIONS.has(slot.section ?? '');
  // СЧЁТНАЯ ЛЕГАСИ-СТРОКА измеряемого слота живёт штуками: инструменты записали бы consumption, не
  // тронув quantity, и строка расколола бы деньги и потребность.
  const countedLegacy =
    measured(slot.section) &&
    !!draft.quantity.trim() &&
    !draft.consumption.trim() &&
    draft.sizeConsumptions.length === 0;
  const isMeasured = measured(slot.section) && !countedLegacy;
  const lineMarkers = markersForLine(markers, draft.bomLineKey).length;
  const stampedId = draft.consumptionSource === 'marker' ? draft.normMarkerId ?? 0 : 0;
  const stampedMarker = stampedId ? markers.find((m) => (m.id ?? 0) === stampedId) : undefined;
  const tools = isMeasured && (lineMarkers > 0 || rollGoods);

  return (
    <div className='flex flex-col gap-2'>
      {isMeasured ? (
        <UsagePerSizeLocal
          draft={draft}
          sizeIds={sizeIds}
          unit={unit}
          canEdit={canEdit}
          cache={cache}
          sizeNameById={sizeNameById}
          onChange={onChange}
        />
      ) : (
        <label className='flex flex-col gap-1'>
          <span className={LABEL}>per unit{unit ? `, ${unit}` : ''}</span>
          <input
            className={cell}
            inputMode='decimal'
            disabled={!canEdit}
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: sanitizeDecimal(e.target.value) })}
          />
        </label>
      )}
      {tools && (
        <details className='group border-t border-hairline pt-1.5'>
          <summary
            className={cn(
              LABEL,
              'cursor-pointer list-none hover:text-textColor [&::-webkit-details-marker]:hidden',
            )}
          >
            other source
          </summary>
          <div className='flex flex-col items-start gap-1.5 pt-1.5'>
            {lineMarkers > 0 && (
              <MarkerApplyHint
                markers={markers}
                colorwayId={colorwayId}
                lineKey={draft.bomLineKey}
                unit={unit}
                wastagePercent={slot.wastagePercent ?? ''}
                articleWidth={articleWidth}
                weightBasis={weightBasis}
                sizeIds={sizeIds}
                sizeNameById={sizeNameById}
                canEdit={canEdit}
                compact
                onApply={onChange}
              />
            )}
            {rollGoods && (
              <DxfApplyHint
                control={control}
                lineKey={draft.bomLineKey}
                unit={unit}
                wastagePercent={slot.wastagePercent ?? ''}
                articleWidth={articleWidth}
                weightBasis={weightBasis}
                sizeIds={sizeIds}
                sizeNameById={sizeNameById}
                canEdit={canEdit}
                compact
                explainWhenIdle
                recipeLinks={recipeLinks}
                techCardId={techCardId}
                onApply={onChange}
              />
            )}
            {rollGoods && (
              <KitMarkerHint
                control={control}
                techCardId={techCardId}
                lineKey={draft.bomLineKey}
                colorwayId={colorwayId}
                colorwayPins={colorwayPins}
                unit={unit}
                articleWidth={articleWidth}
                weightBasis={weightBasis}
                sizeNameById={sizeNameById}
                cardMarkersAllColorways={allCardMarkers}
                stampedMarker={stampedMarker}
                canEdit={canEdit}
                frozen={frozen}
                onApply={onChange}
              />
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ═══ ЯЧЕЙКИ ════════════════════════════════════════════════════════════════════════════════════

// Ряд матрицы: верхняя линейка — внутренняя (hairline), правый отступ ячейки держит зазор колонок,
// чтобы линейка шла через всю строку без разрывов.
const ROW_CELL = 'border-t border-hairline py-2 pr-3';

// ЗАПАСНОЙ ПУТЬ БЕЗ SUBGRID (Chrome < 117, Safari < 16): колонки становятся обычными стопками, а
// ряды выравнивают общие явные высоты — плитка 140 + имя ровно в две строки + строка цвета/числа.
const FB_COL = 'cwm-col';
const FB_HEAD = 'cwm-head';
const FB_AUTO = 'cwm-auto';
const FB_SLOT = 'cwm-slot';
const SUBGRID_FALLBACK = `@supports not (grid-template-rows: subgrid) {
  .cwm-col { display: flex !important; flex-direction: column; }
  .cwm-col > * { flex: none; overflow: hidden; }
  .cwm-head { height: 190px; }
  .cwm-auto { height: 36px; }
  .cwm-slot { height: 220px; }
}`;

// Пиктограмма слота для пустой плитки: рулонные секции рисуются тканью, остальное — фурнитурой по
// словам строки BOM (назначение, секция, имя).
function slotPictogram(slot: BomLine) {
  return trimPictogramKind({
    family: PIECE_SECTIONS.has(slot.section ?? '') ? 'fabric' : 'hardware',
    kind: slot.purpose ?? '',
    section: slot.section ?? '',
    name: slot.name ?? '',
  });
}

function MaterialCell({
  cw,
  slot,
  draft: d,
  materials,
  stockFacts,
  canEdit,
  normOpen,
  onOpenPicker,
  onNormOpenChange,
  onNoNorm,
  editor,
}: {
  cw: common_AdminColorwayRef;
  slot: BomLine;
  draft: UsageDraft;
  materials: common_Material[];
  stockFacts: ReadonlyMap<number, MaterialStockFacts>;
  canEdit: boolean;
  normOpen: boolean;
  onOpenPicker: () => void;
  onNormOpenChange: (open: boolean) => void;
  /** `no norm` ведёт на раскладку слота во вкладке PATTERNS (авто-режим), а не в поповер. */
  onNoNorm: () => void;
  editor: React.ReactNode;
}) {
  const { material, materialId, pinnedDifferent } = resolveSlotArticle(d, slot, materials);
  const url = materialImageUrl(material);
  const fill = material ? materialSwatchColour(material) : '';
  const name = material?.name?.trim() || (materialId ? `article #${materialId}` : '');
  const colour = [material?.color?.trim(), material?.pantone?.trim()].filter(Boolean).join(' ');
  const amount = consumptionLabel(d, slot);
  const empty = materialId === 0;
  const where = `${colourwayName(cw)} · ${slotLabel(slot)}`;
  const facts = materialId ? stockFacts.get(materialId) : undefined;
  const onHand = facts ? Number(facts.onHand) : NaN;
  const amountClass = cn(
    'min-h-[1.5em] min-w-6 shrink-0 uppercase tracking-label tabular-nums enabled:cursor-pointer enabled:hover:underline',
    amount.missing ? 'text-error' : 'text-textColor',
  );

  const tile = (
    <button
      type='button'
      disabled={!canEdit}
      onClick={onOpenPicker}
      aria-label={empty ? `pick a material for ${where}` : `change the material of ${where}`}
      className={cn(
        'group relative block shrink-0 overflow-hidden border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor enabled:cursor-pointer',
        empty
          ? 'flex flex-col items-center justify-center gap-1 border-dashed border-borderColor text-labelColor enabled:hover:border-textColor enabled:hover:text-textColor'
          : 'border-borderColor bg-bgZebra enabled:hover:border-textColor',
      )}
      style={{
        width: TILE,
        height: TILE,
        backgroundColor: !empty && !url && fill ? fill : undefined,
      }}
    >
      {empty ? (
        <>
          <TrimPictogram kind={slotPictogram(slot)} className='size-16 text-textColor opacity-20' />
          <span className='text-micro uppercase tracking-label'>+ material</span>
        </>
      ) : url ? (
        <img src={url} alt={name} className='size-full object-cover' />
      ) : null}
    </button>
  );

  return (
    <div className={cn(ROW_CELL, 'flex flex-col gap-1', FB_SLOT)} style={{ width: TILE + 12 }}>
      {empty || !material ? (
        tile
      ) : (
        // Обёртка, а не сама кнопка: у выключенной кнопки нет событий наведения.
        <Tooltip
          side='right'
          align='start'
          delayDuration={450}
          className='w-[260px] p-0'
          trigger={<div className='w-fit'>{tile}</div>}
        >
          <MaterialHoverCard
            m={material}
            url={url}
            colour={fill}
            stock={Number.isFinite(onHand) ? onHand : undefined}
            facts={facts}
          />
        </Tooltip>
      )}
      <span className='flex min-w-0 flex-col uppercase tracking-label'>
        {!empty && (
          <span
            className={cn(
              'line-clamp-2 min-h-[1.5em] text-control',
              pinnedDifferent ? 'text-textColor' : 'text-labelColor',
            )}
          >
            {name}
          </span>
        )}
        <span className='mt-0.5 flex items-baseline justify-between gap-2 border-t border-hairline pt-0.5 text-micro'>
          {empty ? (
            <span className='text-error'>no material</span>
          ) : (
            <>
              <span className='min-w-0 truncate text-labelColor' title={colour || undefined}>
                {colour || ' '}
              </span>
              {amount.missing ? (
                <button
                  type='button'
                  aria-label={`norm of ${where}: open the marker`}
                  className={amountClass}
                  onClick={onNoNorm}
                >
                  {amount.text}
                </button>
              ) : (
                <GenericPopover
                  open={normOpen}
                  onOpenChange={onNormOpenChange}
                  noTail
                  title={`${slotLabel(slot)} · consumption`}
                  className='w-[320px]'
                  triggerProps={{
                    disabled: !canEdit,
                    'aria-label': `consumption of ${where}`,
                    className: amountClass,
                  }}
                  openElement={amount.text}
                >
                  {editor}
                </GenericPopover>
              )}
            </>
          )}
        </span>
      </span>
    </div>
  );
}

// ═══ КОЛОНКА КОЛОРВЕЯ ═════════════════════════════════════════════════════════════════════════

type ColumnProps = {
  colorway: common_AdminColorwayRef;
  /** Карточка как прочитана — вход матчера артикулов (сохранённые рецепты и строки BOM). */
  techCard?: common_TechCard;
  column: number;
  techCardId: number;
  bomItems: BomLine[];
  cardSlots: BomLine[];
  bomKeySet: ReadonlySet<string>;
  materials: common_Material[];
  stockFacts: ReadonlyMap<number, MaterialStockFacts>;
  markers?: common_TechCardMarkerSummary[];
  pieces: RecipePiece[];
  colorwayPins: readonly MarkerColorway[];
  otherColorways: readonly common_AdminColorwayRef[];
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  colours?: readonly common_Color[];
  swatchHex?: string;
  frontUrl?: string;
  lockVersion: number;
  canEdit: boolean;
  frozen: boolean;
  canDeleteProduct: boolean;
  isLastColorway: boolean;
  highlighted: boolean;
  onHighlightDone: () => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
  /** Сохранённый статус лабдипа (предупреждение шапки). */
  labDipStatus: string;
  /** Строка этого колорвея в блоке LAB DIP под матрицей. */
  onGoToLabDip: (colorwayId: number) => void;
  /** PATTERNS → раскладка слота, авто-режим. */
  onGoToMarker: (bomLineKey: string, colorwayId?: number) => void;
  seed?: UsageDraft[];
  onSeedUsed: (colorwayId: number) => void;
  registerLive: (colorwayId: number, ref: { current: UsageDraft[] } | null) => void;
  onWarnings: (colorwayId: number, items: HeaderWarning[]) => void;
  onDeleted: (colorwayId: number) => void;
};

function ColourwayColumn({
  colorway,
  techCard,
  column,
  techCardId,
  bomItems,
  cardSlots,
  bomKeySet,
  materials,
  stockFacts,
  markers,
  pieces,
  colorwayPins,
  otherColorways,
  sizeIds,
  sizeNameById,
  colours,
  swatchHex,
  frontUrl,
  lockVersion,
  canEdit,
  frozen,
  canDeleteProduct,
  isLastColorway,
  highlighted,
  onHighlightDone,
  focus,
  setFocus,
  labDipStatus,
  onGoToLabDip,
  onGoToMarker,
  seed,
  onSeedUsed,
  registerLive,
  onWarnings,
  onDeleted,
}: ColumnProps) {
  const colorwayId = colorway.colorwayId ?? 0;
  const name = colourwayName(colorway);
  const draft = useColourwayRecipeDraft({
    colorway,
    bomItems,
    pieces,
    bomKeySet,
    lockVersion,
    techCardId,
    canEdit,
  });
  // Раскладки ЭТОГО колорвея (плюс общие; прогонные однодневки отсеяны) — длина, снятая на артикуле
  // другого колорвея, выглядела бы совершенно нормально и была бы неверной.
  const cwMarkers = useMemo(() => markersOfColorway(markers, colorwayId), [markers, colorwayId]);
  const allCardMarkers = useMemo(() => cardMarkers(markers), [markers]);

  // МАТЧЕР АРТИКУЛОВ (чистый): предложения под цвет колорвея. Сам ничего не пишет — план решает,
  // что из них пинится (точное + то же семейство), остальное уходит в `pick one of N`.
  const stockOnHand = useMemo(() => {
    if (stockFacts.size === 0) return undefined;
    const out = new Map<number, number>();
    for (const [id, f] of stockFacts) {
      const n = Number(f.onHand);
      if (Number.isFinite(n)) out.set(id, n);
    }
    return out;
  }, [stockFacts]);
  const proposals = useMemo(
    () =>
      canEdit && techCard && colorwayId
        ? proposePins({ techCard, colorwayId, catalog: materials, colours, stock: stockOnHand })
        : [],
    [canEdit, techCard, colorwayId, materials, colours, stockOnHand],
  );

  // Аргументы плана — переменной, а не литералом в вызове: планировщик живёт в соседнем файле, и
  // поле, которое он перестал читать, не должно ронять сборку матрицы.
  const planInput = (rowsBySlot: Map<string, SlotRows>) => {
    const input = {
      colorway,
      cardSlots,
      rowsBySlot,
      materials,
      markers,
      otherColorways,
      bomItems,
      pieces,
      colours,
      proposals,
    };
    return input;
  };
  const plan = useMemo(
    () => (canEdit ? planAuto(planInput(draft.rowsBySlot)) : EMPTY_PLAN),
    // planInput собирает ровно эти значения
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      canEdit,
      colorway,
      cardSlots,
      draft.rowsBySlot,
      materials,
      markers,
      otherColorways,
      bomItems,
      pieces,
      colours,
      proposals,
    ],
  );

  // РОЖДЕНИЕ КОПИЕЙ (D7): живые строки колонки-источника без её пинов (нормы кг-слотов, у которых
  // сменился эффективный артикул, уже сняты матрицей) — пины выводятся заново этим же планом.
  // Идемпотентно по объекту семени: колонка может смонтироваться и до, и после его прихода, а
  // матрица снимает семя только после квитанции этой колонки.
  const adoptedSeed = useRef<UsageDraft[] | null>(null);
  useEffect(() => {
    if (!seed || adoptedSeed.current === seed) return;
    adoptedSeed.current = seed;
    const seedPlan = planAuto(planInput(groupRowsBySlot(seed, draft.pieceKeySet)));
    draft.seed(applyPlanToUsages(seed, seedPlan));
    onSeedUsed(colorwayId);
    // один раз на объект семени; остальное читается на этот момент
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, colorwayId]);

  // Живой черновик — матрице, для `+` (копия последнего колорвея).
  useEffect(() => {
    registerLive(colorwayId, draft.usagesRef);
    return () => registerLive(colorwayId, null);
  }, [colorwayId, draft.usagesRef, registerLive]);

  // Двери предупреждений вызывают свежие функции черновика через ref — список в шапке хранится,
  // пока не сменится его текст, и замкнутый старый черновик снёс бы не те строки.
  const cleanUpRef = useRef(draft.cleanUp);
  cleanUpRef.current = draft.cleanUp;
  const clearPieceNormsRef = useRef(draft.clearPieceNorms);
  clearPieceNormsRef.current = draft.clearPieceNorms;
  const keepFirstRef = useRef(draft.keepFirst);
  keepFirstRef.current = draft.keepFirst;
  const warnings = useMemo<HeaderWarning[]>(
    () => [
      ...columnWarnings({
        name,
        cardSlots,
        rowsBySlot: draft.rowsBySlot,
        materials,
        markers: cwMarkers,
        plan,
        labDipStatus,
        strayCount: draft.strayCount,
        orphanCount: draft.orphanCount,
        openPicker: (key) => setFocus({ cwId: colorwayId, kind: 'picker', key }),
        // `no norm` уводит на раскладку; есть число (например, раскладка сдвинулась) — поповер.
        openNorm: (key) => {
          const slot = cardSlots.find((s) => s.lineKey === key);
          const missing =
            !!slot && consumptionLabel(slotDraft(draft.rowsBySlot.get(key), key), slot).missing;
          if (missing) onGoToMarker(key, colorwayId);
          else setFocus({ cwId: colorwayId, kind: 'norm', key });
        },
        openLabDip: () => onGoToLabDip(colorwayId),
        cleanUp: (what) => cleanUpRef.current(what),
        clearPieceNorms: () => clearPieceNormsRef.current(),
        canEdit,
      }),
      ...draft.duplicates.flatMap(({ key, count }) => {
        const slot = cardSlots.find((s) => s.lineKey === key);
        if (!slot) return [];
        return [
          {
            text: `${name} · ${slotLabel(slot)}: ${count} lines on one part · keep first`,
            error: true,
            action: {
              label: 'keep the first line',
              onClick: () => keepFirstRef.current(key),
              disabled: !canEdit,
            },
          },
        ];
      }),
    ],
    [
      name,
      cardSlots,
      draft.rowsBySlot,
      materials,
      cwMarkers,
      plan,
      labDipStatus,
      onGoToLabDip,
      onGoToMarker,
      draft.strayCount,
      draft.orphanCount,
      draft.duplicates,
      setFocus,
      colorwayId,
      canEdit,
    ],
  );
  useEffect(() => {
    onWarnings(colorwayId, warnings);
  }, [colorwayId, warnings, onWarnings]);
  useEffect(() => () => onWarnings(colorwayId, []), [colorwayId, onWarnings]);

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlighted) return;
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // подсветка гаснет, чтобы повторная ссылка на тот же колорвей прокрутила снова
    const t = window.setTimeout(onHighlightDone, 1500);
    return () => window.clearTimeout(t);
  }, [highlighted, onHighlightDone]);

  const pickerKey = focus?.cwId === colorwayId && focus.kind === 'picker' ? focus.key : '';
  const pickerSlot = pickerKey ? cardSlots.find((s) => s.lineKey === pickerKey) : undefined;
  const pickerDraft = pickerSlot
    ? slotDraft(draft.rowsBySlot.get(pickerKey), pickerKey)
    : undefined;
  const pickerPreferred = pickerKey
    ? plan.ambiguous.find((a) => a.key === pickerKey)?.candidates
    : undefined;

  const pin = (slot: BomLine, materialId: number) => {
    const key = slot.lineKey ?? '';
    const rows = draft.rowsBySlot.get(key);
    const d = slotDraft(rows, key);
    draft.patchGarmentSlot(key, rows?.garment[0]?.index ?? -1, pinPatch(d, slot, materialId));
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'row-span-full grid grid-rows-subgrid',
        FB_COL,
        highlighted && 'outline outline-1 outline-offset-2 outline-textColor',
      )}
      style={{ gridColumn: column }}
      data-cw-column={colorwayId}
    >
      {/* ШАПКА: плитка 140×140 (рендер спереди, иначе цвет колорвея) + имя. Удаление — ✕ в углу
          плитки, виден на наведении/фокусе. Это триггер ColorwayDeleteControl: span role=button,
          `<fieldset disabled>` выпущенной карточки его не глушит (удаление не зависит от выпуска). */}
      <div className={cn('group/head flex flex-col gap-1 pb-1.5 pr-3', FB_HEAD)}>
        <div
          className='relative shrink-0 overflow-hidden border border-borderColor bg-bgZebra'
          style={{ width: TILE, height: TILE, backgroundColor: !frontUrl ? swatchHex : undefined }}
        >
          {frontUrl && <img src={frontUrl} alt='' className='size-full object-cover' />}
          {canDeleteProduct && (
            <ColorwayDeleteControl
              colorwayId={colorwayId}
              code={name}
              techCardId={techCardId}
              lockVersion={colorway.lockVersion ?? lockVersion}
              isLastColorway={isLastColorway}
              onDeleted={() => onDeleted(colorwayId)}
              triggerClassName='absolute right-1 top-1 flex size-[18px] cursor-pointer items-center justify-center border border-borderColor bg-bgColor text-[11px] leading-none text-labelColor opacity-0 hover:border-error hover:text-error focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor group-hover/head:opacity-100 group-focus-within/head:opacity-100 [@media(hover:none)]:size-6 [@media(hover:none)]:opacity-100'
              trigger='✕'
            />
          )}
        </div>
        <span
          className='line-clamp-2 text-control uppercase tracking-label'
          style={{ width: TILE }}
        >
          {name}
        </span>
      </div>
      <div className={cn('pb-2 pr-3', FB_AUTO)}>
        <Button
          type='button'
          variant={plan.n > 0 ? 'main' : 'secondary'}
          size='sm'
          disabled={!canEdit}
          style={{ width: TILE }}
          title='fill empty materials and norms from the catalog, markers and other colourways'
          onClick={() => draft.applyPlan(plan)}
        >
          {plan.n > 0 ? `auto · ${plan.n}` : 'auto'}
        </Button>
      </div>
      {cardSlots.map((slot) => {
        const key = slot.lineKey ?? '';
        const rows = draft.rowsBySlot.get(key);
        const d = slotDraft(rows, key);
        const normOpen = focus?.cwId === colorwayId && focus.kind === 'norm' && focus.key === key;
        return (
          <MaterialCell
            key={key}
            cw={colorway}
            slot={slot}
            draft={d}
            materials={materials}
            stockFacts={stockFacts}
            canEdit={canEdit}
            normOpen={normOpen}
            onOpenPicker={() => setFocus({ cwId: colorwayId, kind: 'picker', key })}
            onNormOpenChange={(o) => setFocus(o ? { cwId: colorwayId, kind: 'norm', key } : null)}
            onNoNorm={() => onGoToMarker(key, colorwayId)}
            editor={
              normOpen ? (
                <ConsumptionEditor
                  slot={slot}
                  draft={d}
                  cache={draft.gradingFor(key)}
                  materials={materials}
                  markers={cwMarkers}
                  allCardMarkers={allCardMarkers}
                  recipeLinks={draft.recipeLinks}
                  colorwayId={colorwayId}
                  colorwayPins={colorwayPins}
                  techCardId={techCardId}
                  sizeIds={sizeIds}
                  sizeNameById={sizeNameById}
                  canEdit={canEdit}
                  frozen={frozen}
                  onChange={(patch) =>
                    draft.patchGarmentSlot(key, rows?.garment[0]?.index ?? -1, patch)
                  }
                />
              ) : null
            }
          />
        );
      })}
      {/* Каталог грузится только открытым диалогом; секция слота — жёсткий фильтр. Выбор артикула
          самого слота = «пина нет» (pinPatch). */}
      <MaterialPickerDialog
        open={!!pickerSlot && canEdit}
        section={pickerSlot?.section ?? ''}
        value={pickerSlot && pickerDraft ? pickerDraft.materialId || pickerSlot.materialId || 0 : 0}
        title={pickerSlot ? `${name} · ${slotLabel(pickerSlot)}` : undefined}
        preferredIds={pickerPreferred}
        onPick={(m) => {
          if (pickerSlot) pin(pickerSlot, m ? wireInt(m.id) : 0);
          setFocus(null);
        }}
        onClose={() => setFocus(null)}
      />
    </div>
  );
}

// ═══ МАТРИЦА ══════════════════════════════════════════════════════════════════════════════════

export function ColourwaysMatrix({
  techCardId,
  techCard,
  colorways,
  bomItems,
  materials,
  markers,
  pieces,
  colorwayPins,
  sizeIds,
  sizeNameById,
  hexByCode,
  colours,
  frontUrlById,
  lockVersion,
  canEdit,
  frozen,
  canDeleteProduct,
  highlightId,
  onHighlightDone,
  onDeleted,
}: {
  techCardId: number;
  /** Карточка как прочитана — вход матчера артикулов. */
  techCard?: common_TechCard;
  /** Живые колорвеи (архивные и удалённые уже отсеяны). */
  colorways: common_AdminColorwayRef[];
  bomItems: BomLine[];
  materials: common_Material[];
  markers?: common_TechCardMarkerSummary[];
  pieces: RecipePiece[];
  colorwayPins: readonly MarkerColorway[];
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  hexByCode: Map<string, string>;
  colours?: readonly common_Color[];
  frontUrlById: ReadonlyMap<number, string>;
  lockVersion: number;
  canEdit: boolean;
  frozen: boolean;
  canDeleteProduct: boolean;
  highlightId: number | null;
  onHighlightDone: () => void;
  onDeleted: (colorwayId: number) => void;
}) {
  // РЯДЫ — слоты BOM тех секций, что заводятся в рецепт, в порядке BOM. Строка рецепта на слоте вне
  // этого набора — «строка без слота» в шапке, с дверью `clean up`.
  const cardSlots = useMemo(
    () => bomItems.filter((b) => !!b.lineKey && GARMENT_SECTIONS.has(b.section ?? '')),
    [bomItems],
  );
  const bomKeySet = useMemo(
    () => new Set(bomItems.map((b) => b.lineKey ?? '').filter(Boolean)),
    [bomItems],
  );
  const [focus, setFocus] = useState<Focus>(null);
  const [creating, setCreating] = useState(false);
  const stockFacts = useMaterialStockFacts();
  // `no norm` → PATTERNS, раскладка этого слота, авто-режим. Остальные параметры URL сохраняются.
  const [, setSearchParams] = useSearchParams();
  const goToMarker = useCallback(
    (bomLineKey: string, colorwayId?: number) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'patterns');
        next.set('marker', bomLineKey);
        if (colorwayId) next.set('markerColorway', String(colorwayId));
        else next.delete('markerColorway');
        next.set('auto', '1');
        return next;
      }),
    [setSearchParams],
  );
  // `lab dip waiting` → строка этого колорвея в блоке LAB DIP под матрицей (lab-dip-tab.tsx).
  const goToLabDip = useCallback((colorwayId: number) => {
    document
      .querySelector(`[data-lab-dip-row="${colorwayId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);
  const [seed, setSeed] = useState<{ colorwayId: number; usages: UsageDraft[] } | null>(null);

  // Остальные колорвеи для ступени «соседний колорвей» — стабильной ссылкой, иначе план каждой
  // колонки пересчитывался бы на каждый рендер матрицы.
  const othersById = useMemo(
    () => new Map(colorways.map((cw) => [cw.colorwayId ?? 0, colorways.filter((c) => c !== cw)])),
    [colorways],
  );
  const [warningsById, setWarningsById] = useState<Record<number, HeaderWarning[]>>({});
  const onWarnings = useCallback((id: number, items: HeaderWarning[]) => {
    setWarningsById((prev) => {
      const sig = (xs?: HeaderWarning[]) =>
        JSON.stringify((xs ?? []).map((w) => (typeof w === 'string' ? w : [w.text, !!w.error])));
      if (sig(prev[id]) === sig(items)) return prev;
      if (items.length === 0) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: items };
    });
  }, []);
  const warnings = useMemo(
    () => colorways.flatMap((cw) => warningsById[cw.colorwayId ?? 0] ?? []),
    [colorways, warningsById],
  );

  const last = colorways[colorways.length - 1];
  // `+` = копия последнего: его палитра и семейство в окне рождения, имя пустое (занятое имя окно
  // отвергает). Рецепт копируется после создания (семя колонки).
  const createSeed = useMemo(
    () =>
      last
        ? paletteValueFromRead({
            name: '',
            colours: last.colours,
            colorCode: last.colorCode,
            nameI18n: {},
          })
        : undefined,
    [last],
  );
  // ЖИВЫЕ ЧЕРНОВИКИ КОЛОНОК: `+` копирует то, что сейчас на экране у последнего колорвея (вместе с
  // несохранёнными правками), а не его серверную копию. Снимок берётся в момент открытия окна.
  const liveRef = useRef(new Map<number, { current: UsageDraft[] }>());
  const registerLive = useCallback((id: number, ref: { current: UsageDraft[] } | null) => {
    if (ref) liveRef.current.set(id, ref);
    else liveRef.current.delete(id);
  }, []);
  const sourceRef = useRef<UsageDraft[] | null>(null);
  const openCreate = (open: boolean) => {
    if (open && last) {
      sourceRef.current =
        liveRef.current.get(last.colorwayId ?? 0)?.current ??
        (last.usages ?? []).map((u) => fromRead(u, bomItems, pieces));
    }
    setCreating(open);
  };
  // Пины источника снимаются (их заново выведет план колонки по цвету). Кг-норма закодировала основу
  // веса артикула (pinPatch): где эффективный артикул при этом меняется, число уходит вместе с
  // провенансом, а не переезжает на чужую ткань.
  const onCreated = (id: number) => {
    const source = sourceRef.current ?? [];
    sourceRef.current = null;
    const slotByKey = new Map(bomItems.map((b) => [b.lineKey ?? '', b]));
    const usages = source.map((u) => {
      const slot = slotByKey.get(u.bomLineKey);
      const next: UsageDraft = { ...u, materialId: 0, lineTotal: '' };
      const before = u.materialId || slot?.materialId || 0;
      const after = slot?.materialId || 0;
      if (bomUnitKind(slot?.unit?.trim() || '') === 'kg' && before !== after) {
        return {
          ...next,
          consumption: '',
          sizeConsumptions: [],
          normMarkerId: 0,
          ...MANUAL_PROVENANCE,
        };
      }
      return next;
    });
    setSeed({ colorwayId: id, usages });
  };
  // Семя снимается только квитанцией СВОЕЙ колонки: колонка может смонтироваться позже рефетча.
  const onSeedUsed = useCallback(
    (id: number) => setSeed((cur) => (cur?.colorwayId === id ? null : cur)),
    [],
  );

  const rowCount = 2 + cardSlots.length;
  const plusColumn = colorways.length + 2;

  return (
    <>
      <Section title='colourways' action={<HeaderWarnings items={warnings} />}>
        <style>{SUBGRID_FALLBACK}</style>
        <div className='overflow-x-auto pb-1'>
          <div
            className='grid w-max'
            style={{
              gridTemplateColumns: `max-content repeat(${colorways.length}, max-content) max-content`,
              gridTemplateRows: `repeat(${rowCount}, auto)`,
            }}
          >
            {/* подписи рядов */}
            <div
              className={cn('row-span-full grid grid-rows-subgrid', FB_COL)}
              style={{ gridColumn: 1 }}
            >
              <div className={FB_HEAD} />
              <div className={FB_AUTO} />
              {cardSlots.map((slot) => (
                <div
                  key={slot.lineKey}
                  className={cn(ROW_CELL, LABEL, 'self-stretch pr-8', FB_SLOT)}
                >
                  {slotLabel(slot)}
                </div>
              ))}
            </div>

            {colorways.map((cw, i) => {
              const id = cw.colorwayId ?? 0;
              return (
                <ColourwayColumn
                  key={id}
                  colorway={cw}
                  techCard={techCard}
                  column={i + 2}
                  techCardId={techCardId}
                  bomItems={bomItems}
                  cardSlots={cardSlots}
                  bomKeySet={bomKeySet}
                  materials={materials}
                  stockFacts={stockFacts}
                  markers={markers}
                  pieces={pieces}
                  colorwayPins={colorwayPins}
                  otherColorways={othersById.get(id) ?? EMPTY_COLORWAYS}
                  sizeIds={sizeIds}
                  sizeNameById={sizeNameById}
                  colours={colours}
                  swatchHex={colourwaySwatchHex(cw, hexByCode.get(cw.colorCode ?? ''))}
                  frontUrl={frontUrlById.get(id)}
                  lockVersion={lockVersion}
                  canEdit={canEdit}
                  frozen={frozen}
                  canDeleteProduct={canDeleteProduct}
                  isLastColorway={colorways.length === 1}
                  highlighted={highlightId === id}
                  onHighlightDone={onHighlightDone}
                  focus={focus}
                  setFocus={setFocus}
                  labDipStatus={cw.labDipStatus ?? ''}
                  onGoToLabDip={goToLabDip}
                  onGoToMarker={goToMarker}
                  seed={seed?.colorwayId === id ? seed.usages : undefined}
                  onSeedUsed={onSeedUsed}
                  registerLive={registerLive}
                  onWarnings={onWarnings}
                  onDeleted={onDeleted}
                />
              );
            })}

            {/* `+` — новый колорвей копией последнего; линейки рядов продолжаются под ним */}
            <div
              className={cn('row-span-full grid grid-rows-subgrid', FB_COL)}
              style={{ gridColumn: plusColumn }}
            >
              <div className={cn('pb-1.5', FB_HEAD)}>
                {canEdit && (
                  <ColourwayCreatePopover
                    techCardId={techCardId}
                    open={creating}
                    onOpenChange={openCreate}
                    onCreated={onCreated}
                    seed={createSeed}
                    anchor={
                      <AddDoor
                        shape='tile'
                        aria-label='new colourway'
                        style={{ width: TILE, height: TILE }}
                      >
                        colourway
                      </AddDoor>
                    }
                  />
                )}
              </div>
              <div className={FB_AUTO} />
              {cardSlots.map((slot) => (
                <div key={slot.lineKey} className={cn(ROW_CELL, FB_SLOT)} style={{ width: TILE }} />
              ))}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

const EMPTY_COLORWAYS: readonly common_AdminColorwayRef[] = [];
