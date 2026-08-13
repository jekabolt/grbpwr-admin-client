import {
  common_AdminColorwayRef,
  common_Material,
  common_TechCardBomKind,
  common_TechCardBomSection,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  composeArticleFromMaterial,
  materialCompositionCode,
  materialCompositionText,
  materialSpec,
} from 'components/managers/materials/components/material-code';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import {
  MaterialPicker,
  MaterialPickerDialog,
  useMaterialStockFacts,
} from 'components/managers/materials/components/material-picker';
import {
  MaterialThumb,
  materialImageUrl,
} from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { CompositionPicker } from 'components/managers/product/components/composition/composition-picker';
import { techCardBomSectionOptions, techCardFabricDirectionOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { stampWhen } from 'components/managers/production-runs/components/useLays';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Select from 'ui/components/select';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import CheckboxField from 'ui/form/fields/checkbox-field';
import ComboField from 'ui/form/fields/combo-field';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { flattenFieldErrors } from 'utils/field-errors';
import { ulid } from 'utils/ulid';
import { sectionShort } from './bom-line-picker';
import { BomWastageSuggestion, laysProvenancePhrase } from './bom-wastage-suggestion';
import {
  KIND_HOME_SECTION,
  UNSET_KIND,
  isKindEligibleSection,
  kindOptionsForSection,
} from './bom-kind';
import {
  UNSET_PURPOSE,
  defaultRoleForPurpose,
  groupBomLines,
  isOtherPurpose,
  isRollGoodsSection,
  purposeEditorOptions,
  techCardBomPurposeOptions,
} from './bom-purpose';
import { formatBomMoney, resolveBomPrice } from './bom-price';
import {
  defaultRoleFor,
  looksLikeArticleName,
  normalizeRole,
  roleCollision,
  roleSuggestions,
} from './bom-roles';
import { materialFabricWeight, materialFabricWidth } from './nesting/fabric-weight';
import { bomUnitKind, markersForLine } from './nesting/marker-io';
import { TechCardFormData, wireInt } from './schema';
import { unitOptions } from './tech-card-options';

// A new catalog article — meta + price only. Colour, placement and consumption are chosen
// per colourway on the colorways tab.
const emptyBomItem = {
  section: 'TECH_CARD_BOM_SECTION_FABRIC',
  // НАЗНАЧЕНИЕ (0265): unset until someone answers for it. The add flow asks on every roll-goods
  // line, so a new fabric never actually reaches the grid unsorted — but the default has to be the
  // honest one, because this template is also what a non-roll-goods line is built from.
  purpose: UNSET_PURPOSE,
  purposeNote: '',
  // ЧТО ЭТО ЗА ПОЗИЦИЯ (0278): same honest default on the other axis — unset until answered.
  kind: UNSET_KIND,
  kindNote: '',
  isSample: false,
  name: '',
  supplier: '',
  supplierRef: '',
  color: '',
  composition: '',
  spec: '',
  unit: '',
  unitPrice: '',
  currency: '',
  comment: '',
  fabricWidth: '',
  fabricWeightGsm: '',
  fabricDirection: 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN',
  wastagePercent: '',
  materialId: 0,
  id: 0,
  lineKey: '', // minted on append (see BomField) so downstream refs are stable from creation
};

// Fabric width/weight read from the typed CTI attrs, falling back to the legacy flat fields —
// shared by the link-time snapshot, the linked-line catalog plate AND the length→kg weight basis
// (nesting/fabric-weight.ts, where the pair now lives) so the three never drift apart.

// The catalog facts a BOM line snapshots off the article it links (S23: the line stays
// self-contained). ONE helper, so creating a line FROM the picker and linking an article onto an
// existing line can never disagree about what a linked line ends up carrying.
function materialLineFields(m: common_Material) {
  return {
    // NO `name` here — the line's name is the slot ROLE («основная молния»), owned by the operator
    // and never derived from the article. Stamping the article name in was the regression that made
    // duplicate-looking slots and printed «YKK → YKK» in the production material plan (SlotName vs
    // MaterialName). An empty role is legal: the server falls back to the article name on read.
    section: m.section || emptyBomItem.section,
    supplier: m.supplier || '',
    supplierRef: m.supplierRef || '',
    // The blend as the parseable JSON the CompositionPicker + care generator read — derived from the
    // material's STRUCTURED fibre entries when it has no legacy free-text `composition`, so a line
    // linked to a structurally-composed material carries a composition that generates the care label.
    composition: materialCompositionCode(m),
    spec: m.spec || '',
    unit: m.unit || '',
    fabricWidth: materialFabricWidth(m) || '',
    fabricWeightGsm: materialFabricWeight(m) || '',
    // latest_price is costing-gated (absent without access) — seeds price only when present.
    unitPrice: m.latestPrice?.price?.value || '',
    currency: m.latestPrice?.currency || '',
  };
}

// A price-less article zeroes the whole costing chain downstream (BOM estimate → style cost →
// COGS), so it is worth saying out loud — but it no longer REFUSES the link. Refusing left the line
// unlinked and unnamed, and a nameless line blocks the entire card's save with the offending field
// rendered nowhere. Warn, link, and let the "no price" markers on the tile and the catalog plate
// carry it from there. Only warnable when this user can SEE prices: latest_price is costing-gated,
// so for a non-costing account every article would look price-less.
function useNoPriceWarning() {
  const { canReadCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  return (m: common_Material) => {
    if (!canReadCosting || m.latestPrice?.price?.value) return;
    showMessage(
      `${m.name || 'этот материал'} без закупочной цены — костинг будет считать 0, пока цену не добавят в materials → prices`,
      'error',
    );
  };
}

// Выпущенная карта заморожена целиком — вместе с кнопкой «обновить цены из каталога» на костинге.
const RELEASED_STATE = 'TECH_CARD_APPROVAL_STATE_RELEASED';

const join = (...parts: Array<string | undefined>) => parts.filter((p) => !!p?.trim()).join(' · ');
const widthLabel = (v?: string) => (v?.trim() ? `${v.trim()} cm` : '');
const weightLabel = (v?: string) => (v?.trim() ? `${v.trim()} g/m²` : '');

// The material's class as a short lowercase tag (fabric / hardware / thread / packaging) — the
// "тип" pill beside the section on a linked article tile.
const classShort = (c?: string) =>
  c && c !== 'MATERIAL_CLASS_UNKNOWN' ? c.replace('MATERIAL_CLASS_', '').toLowerCase() : '';

// The slot's identity — its ROLE in the garment and its section — editable on EVERY line, linked
// or not. The role is the one field a linked line used to render nowhere, which made a wrong or
// article-borrowed role permanently uncorrectable. Section is editable on a linked line too: the
// article keeps its own catalog section on the plate, and a deliberate divergence (a jersey
// article serving a LINING slot) must be expressible.
function SlotIdentityFields({ index }: { index: number }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as string | undefined;
  const rowPurpose = useWatch({ control, name: `bomItems.${index}.purpose` }) as string | undefined;
  const rowKind = useWatch({ control, name: `bomItems.${index}.kind` }) as string | undefined;
  const rollGoods = isRollGoodsSection(rowSection);
  const kindEligible = isKindEligibleSection(rowSection);
  const kindItems = useMemo(() => kindOptionsForSection(rowSection), [rowSection]);

  // Moving a line off roll goods takes its purpose with it — a назначение on a thread or a button
  // is data no screen renders and the server refuses outright. This fires only on an actual section
  // change (both branches are no-ops once the line is already consistent), so it cannot dirty a card
  // merely by being opened. Same for the note when the purpose leaves «другое»: it explains a
  // purpose that is no longer there.
  useEffect(() => {
    if (!rollGoods && rowPurpose && rowPurpose !== UNSET_PURPOSE) {
      setValue(`bomItems.${index}.purpose`, UNSET_PURPOSE, { shouldDirty: true });
    }
  }, [rollGoods, rowPurpose, index, setValue]);
  useEffect(() => {
    if (!isOtherPurpose(rowPurpose)) {
      setValue(`bomItems.${index}.purposeNote`, '', { shouldDirty: false });
    }
    // Deliberately keyed on the purpose alone: re-running on every keystroke in the note would
    // fight the operator for the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowPurpose, index]);

  // The same two rules for the kind axis, and the first one is STRICTER than purpose's: a kind is
  // not merely section-family-scoped, it is homed on ONE section. Moving a line from hardware to
  // trim leaves `zipper` on a trim line — legal-looking, refused by the store, and reported against
  // a field the operator did not touch. Both branches are no-ops on an already-consistent line.
  useEffect(() => {
    if (!rowKind || rowKind === UNSET_KIND) return;
    const home = KIND_HOME_SECTION[rowKind as common_TechCardBomKind];
    if (!kindEligible || (home && home !== rowSection)) {
      setValue(`bomItems.${index}.kind`, UNSET_KIND, { shouldDirty: true });
    }
  }, [kindEligible, rowKind, rowSection, index, setValue]);
  useEffect(() => {
    if (rowKind !== 'TECH_CARD_BOM_KIND_OTHER') {
      setValue(`bomItems.${index}.kindNote`, '', { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKind, index]);

  return (
    <div className='space-y-2'>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <ComboField
          name={`bomItems.${index}.name`}
          label='роль в изделии *'
          options={roleSuggestions(rowSection)}
          placeholder='основная ткань / подкладка / молния…'
        />
        <SelectField
          name={`bomItems.${index}.section`}
          label='секция *'
          items={techCardBomSectionOptions}
        />
      </div>
      {/* Roll goods only — назначение exists where cloth does. Not shown at all elsewhere rather
          than shown-and-disabled: a control that can never be used is a question the operator has
          to re-answer on every line. */}
      {rollGoods && (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <SelectField
            name={`bomItems.${index}.purpose`}
            label='назначение'
            items={purposeEditorOptions}
          />
          <div className='flex items-end pb-1'>
            <CheckboxField name={`bomItems.${index}.isSample`} label='семпловая' />
          </div>
          {isOtherPurpose(rowPurpose) && (
            <div className='sm:col-span-2'>
              <InputField
                name={`bomItems.${index}.purposeNote`}
                label='что это за назначение'
                maxLength={255}
              />
            </div>
          )}
        </div>
      )}
      {/* ЧТО ЭТО ЗА ПОЗИЦИЯ — the mirror axis, shown exactly where назначение is not. The role
          above stays free text and stays the slot's identity: «основная молния» and «молния
          кармана» are both ZIPPER, and the card has to keep telling them apart. This says which
          of those two questions the line answers, so a picker can group and a step can suggest. */}
      {kindEligible && (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <SelectField
            name={`bomItems.${index}.kind`}
            label='вид'
            items={[{ value: UNSET_KIND, label: '— не задан —' }, ...kindItems]}
          />
          {rowKind === 'TECH_CARD_BOM_KIND_OTHER' && (
            <InputField
              name={`bomItems.${index}.kindNote`}
              label='что это за вид'
              maxLength={255}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Мерная нерулонная секция, у которой процент остаётся ручным (резинка, тесьма, стропа, велкро).
const TRIM_SECTION = 'TECH_CARD_BOM_SECTION_TRIM';

/** Строка рецепта, несущая НОРМУ этого слота (не привязку материала к детали), с её провенансом. */
type SlotNormRow = { sku: string; marker: boolean; measured: boolean };

// КТО СЕГОДНЯ КРОИТ ЭТОТ СЛОТ И КАК ПОЛУЧЕНА ЕГО НОРМА. Читается из ЧТЕНИЯ карточки
// (techCard.colorways[].usages), а не из формы: рецепт колорвея живёт своим RPC и в состоянии этой
// формы не лежит вовсе. Сохранение рецепта инвалидирует чтение карточки (useUpdateColorwayRecipe),
// поэтому только что снятая раскладка комплекта здесь уже видна.
//
// ЗАЧЕМ ЭТО ЛЕСТНИЦЕ. «У слота есть раскладка» и «норма слота измерена» — РАЗНЫЕ утверждения, и
// путать их дорого: процент не начисляется не тогда, когда раскладка снята, а тогда, когда строка
// рецепта несёт consumption_source='marker' (серверный wastageApplies). Раскладка, с которой норму
// ещё не сняли, ничего не отменяет — процент всё ещё умножает закупку.
//
// СОПОСТАВЛЕНИЕ ПО bom_item_id: чтение не эмитит bom_line_key на строке рецепта вовсе
// (ConvertRecipeUsagesToPb), ключ оставлен запасным на случай, когда однажды начнёт. Строка,
// привязанная к ДЕТАЛИ, отбрасывается — это назначение материала, а не норма (T8): расхода у неё
// нет, и гросс-апу нечего умножать.
function slotNormRows(
  colorways: common_AdminColorwayRef[] | undefined,
  bomItemId: number,
  lineKey: string,
): SlotNormRow[] {
  const rows: SlotNormRow[] = [];
  for (const c of colorways ?? []) {
    for (const u of c.usages ?? []) {
      const mine =
        (bomItemId > 0 && wireInt(u.bomItemId) === bomItemId) ||
        (!!lineKey && !!u.bomLineKey && u.bomLineKey === lineKey);
      if (!mine) continue;
      if ((u.pieceLineKey ?? '').trim() || wireInt(u.pieceId) > 0) continue;
      rows.push({
        sku: c.baseSku?.trim() || c.colorCode?.trim() || `#${c.colorwayId ?? 0}`,
        marker: (u.consumptionSource ?? '').trim() === 'marker',
        // МЕРНАЯ строка рецепта — та, у которой есть расход (а не количество штук). Именно по
        // этому признаку сервер решает, начислять ли гросс-ап вообще: счётную строку отсекает
        // ранний возврат LineTotal («4 пуговицы остаются 4 пуговицами»).
        measured: !!u.consumption?.value?.trim() || (u.sizeConsumptions?.length ?? 0) > 0,
      });
    }
  }
  return rows;
}

/** Список SKU колорвеев коротко: три и «ещё N» — строка рецепта не должна распирать колонку. */
const skuList = (rows: SlotNormRow[]): string => {
  const names = rows.map((r) => r.sku);
  return names.length <= 3
    ? names.join(', ')
    : `${names.slice(0, 3).join(', ')} и ещё ${names.length - 3}`;
};

// Процент как читаемая величина: «+22%» вместо «22.00». Хвостовые нули — артефакт колонки
// DECIMAL, а не точность оценки; само сохранённое значение не трогается.
const pctLabel = (raw: string): string => {
  const n = parseDecimalNumber(raw);
  return Number.isFinite(n) ? `+${Number(n)}%` : '';
};

// This style's use of the article — the ONLY controls a linked line owns. Everything else on a
// linked line is a catalog fact, rendered as a plate (below) rather than as disabled inputs.
// No top padding: the GroupLabel's own top margin is the box's inner top space.
//
// ПОЛЯ «est. cutting wastage %» ЗДЕСЬ БОЛЬШЕ НЕТ (W2), и это не запрет расчёта. Величина, которую
// оно изображало, есть функция тройки: набор деталей слота × раскройная ширина артикула, который
// пинует колорвей × размерный состав настила. Ни одна из трёх не является свойством строки BOM и
// ни одна не известна в момент, когда форма спрашивает число, — оператор вводил не оценку, а
// привычку. Поэтому процент стал ПОКАЗАТЕЛЕМ: величина, её происхождение и то, чем её заменить.
// Арифметика не тронута — сервер применяет сохранённое значение ровно как применял
// (entity.grossNorm: процент × коэффициент артикула), — убран ВВОД, а не расчёт.
//
// ЛЕСТНИЦА, СВЕРХУ ВНИЗ, РОВНО ОДНА АКТИВНАЯ СТУПЕНЬ (см. CuttingAllowance):
//   1. норма снята с раскладки → процент не начисляется ВОВСЕ, и сказать это важнее, чем показать
//      число: умножать ему нечего;
//   2. раскладки нет, но по фактам настилов есть медиана → подставить её кнопкой (панель);
//   3. ни того ни другого: число есть, но введено руками и никем не подтверждено → путь наверх
//      называется вслух («раскладка комплекта…» в рецепте колорвея);
//   4. числа нет вовсе → netto-норма уйдёт в закупку БЕЗ надбавки, то есть заниженной.
//
// НЕРУЛОННЫЕ СТРОКИ. Направление ткани на молнии бессмысленно, раскройной лестницы у фурнитуры нет
// вовсе — обе не монтируются. Но гросс-ап сервер решает НЕ по секции: счётную строку отсекает
// ранний возврат, а МЕРНАЯ (резинка, тесьма, стропа, нитка в метрах) гроссится ровно как ткань.
// Поэтому мерная нерулонная строка процент СОХРАНЯЕТ, и он остаётся ручным: ни выкроек, ни
// раскладок, ни фактов настилов у неё нет, и притворяться, что мы это считаем, нечестно. Зовётся
// он там своим именем — обрезки и стыки, а не раскрой.
function ThisStyleFields({
  index,
  material,
  markers,
  colorways,
  onOpenColorways,
}: {
  index: number;
  /** Привязанный артикул строки — ради его коэффициента раскроя (второй множитель нормы). */
  material?: common_Material;
  /** Карточные раскладки (techCard.markers) — есть ли раскладка ЭТОГО слота. */
  markers?: common_TechCardMarkerSummary[];
  /** Колорвеи как READ — их рецепты говорят, измерена ли норма слота (см. slotNormRows). */
  colorways?: common_AdminColorwayRef[];
  /** Закрыть редактор и уйти на вкладку колорвеев — туда, где живёт «раскладка комплекта…». */
  onOpenColorways?: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as string | undefined;
  const lineKey = (useWatch({ control, name: `bomItems.${index}.lineKey` }) as string) ?? '';
  const bomItemId = wireInt(useWatch({ control, name: `bomItems.${index}.id` }));
  const unit = (useWatch({ control, name: `bomItems.${index}.unit` }) as string) ?? '';
  const rollGoods = isRollGoodsSection(rowSection);
  const normRows = useMemo(
    () => slotNormRows(colorways, bomItemId, lineKey),
    [colorways, bomItemId, lineKey],
  );
  // МЕРНАЯ ЛИ ЭТА НЕРУЛОННАЯ СТРОКА — три независимых свидетеля, любого достаточно. Единица
  // строки (метры/см/кг — тот же словарь, которым норма пишется в рецепт), секция trim (бейка,
  // резинка, стропа — мерные по определению) и живой рецепт, где у слота стоит РАСХОД, а не
  // количество. Ошибиться в сторону «показать» дешевле: спрятанный процент на строке, которую
  // сервер гроссит, — это молчаливо заниженная закупка, а лишнее поле на счётной резинке — шум.
  const measuredLine =
    bomUnitKind(unit) != null || rowSection === TRIM_SECTION || normRows.some((r) => r.measured);

  return (
    <div className='border border-borderColor px-2 pb-2'>
      <GroupLabel>how this style uses it</GroupLabel>
      {rollGoods ? (
        <CuttingAllowance
          index={index}
          material={material}
          markers={markers}
          normRows={normRows}
          onOpenColorways={onOpenColorways}
        />
      ) : measuredLine ? (
        <TrimAllowance index={index} />
      ) : (
        <CountedNote index={index} />
      )}
      <div className='mt-2'>
        <TextareaField
          name={`bomItems.${index}.comment`}
          label='comment'
          rows={2}
          maxLength={1000}
        />
      </div>
    </div>
  );
}

// СЧЁТНАЯ СТРОКА. Ни направления ткани, ни процента: первое бессмысленно на молнии, второго ни
// один расчёт не берёт — в костинге счётная строка выходит раньше любого гросс-апа.
//
// НО ЕСЛИ ПРОЦЕНТ НА НЕЙ УЖЕ ЛЕЖИТ — сказать это и дать его убрать. Спрятать инпут над непустым
// значением и не оставить выхода значит завести данные, которых в админке больше не видно: число
// продолжает ездить туда-обратно при каждом сохранении и печатается на бумаге тех-пака в строке
// «fabric». Инертное в расчёте, оно всё ещё врёт глазу на фабрике.
function CountedNote({ index }: { index: number }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const stale = (
    (useWatch({ control, name: `bomItems.${index}.wastagePercent` }) as string) ?? ''
  ).trim();
  return (
    <div className='mt-1 space-y-1'>
      <Text variant='label' size='micro'>
        Счётная строка: расход задаётся штуками в рецепте колорвея, надбавок на раскрой у неё нет —
        четыре пуговицы остаются четырьмя пуговицами.
      </Text>
      {stale !== '' && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Pill tone='mut'>{pctLabel(stale) || `${stale}%`}</Pill>
          <Text size='nano' variant='label' component='span'>
            процент остался на строке с прежних времён — ни один расчёт его не берёт, но он
            печатается в тех-паке
          </Text>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            onClick={() => {
              setValue(`bomItems.${index}.wastagePercent`, '', { shouldDirty: true });
              // Провенанс уходит вместе с числом: «медиана по N раскроям» без числа — подпись под
              // прочерком, а сервер про пару (источник, счётчик) судит по значению.
              setValue(`bomItems.${index}.wastageSource`, 'manual', { shouldDirty: true });
              setValue(`bomItems.${index}.wastageLayCount`, 0, { shouldDirty: true });
            }}
          >
            убрать
          </Button>
        </div>
      )}
    </div>
  );
}

// МЕРНАЯ НЕРУЛОННАЯ СТРОКА: процент остаётся, но это НЕ раскрой. У резинки и тесьмы нет ни
// выкроек, ни раскладок, ни настилов — измерить эту величину нечем и подтвердить нечем, поэтому
// лестницы у неё не бывает и поле честно остаётся ручным. Меняется только имя: то, что здесь
// оплачивается, — обрезки при отрезании и стыки в рулоне.
function TrimAllowance({ index }: { index: number }) {
  return (
    <div className='mt-1 space-y-1'>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <DecimalField
          name={`bomItems.${index}.wastagePercent`}
          label='запас на обрезки и стыки, %'
        />
      </div>
      <Text variant='label' size='micro'>
        Множитель на мерную норму строки: в закупку и в себестоимость идёт норма × (1 + %/100).
        Раскладок и выкроек у мерной фурнитуры нет, поэтому число здесь ставится руками — и означает
        оно обрезки при отрезании и стыки в рулоне, а не раскрой полотна.
      </Text>
    </div>
  );
}

// РУЛОННАЯ СТРОКА: направление полотна и ЛЕСТНИЦА надбавки. Все хуки процента живут здесь — на
// нерулонной строке этот компонент не монтируется вовсе, так что ни эффекта провенанса, ни запроса
// предложения там не бывает.
function CuttingAllowance({
  index,
  material,
  markers,
  normRows,
  onOpenColorways,
}: {
  index: number;
  material?: common_Material;
  markers?: common_TechCardMarkerSummary[];
  normRows: SlotNormRow[];
  onOpenColorways?: () => void;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const lineKey = (useWatch({ control, name: `bomItems.${index}.lineKey` }) as string) ?? '';
  // Артикул слота — ИЗ ФОРМЫ, а не из пропа material: тот резолвится по загруженному списку
  // каталога и на холодном старте ещё пуст, а панель предложения не должна секунду утверждать
  // «строка не привязана» про привязанную строку.
  const rowMaterialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const wastageValue = (
    (useWatch({ control, name: `bomItems.${index}.wastagePercent` }) as string) ?? ''
  ).trim();
  // Провенанс процента (0296): 'lays' — применено из предложения, всё прочее — руками.
  const wastageSource = useWatch({ control, name: `bomItems.${index}.wastageSource` }) as
    | string
    | undefined;
  const wastageLayCount =
    (useWatch({ control, name: `bomItems.${index}.wastageLayCount` }) as number | undefined) ?? 0;
  const wastageAppliedAt = useWatch({ control, name: `bomItems.${index}.wastageAppliedAt` }) as
    | string
    | undefined;
  // Выпущенная карта заморожена целиком: кнопка внутри <fieldset disabled> мертва, и вместо неё
  // честнее написать словами, куда идти.
  const frozen = useWatch({ control, name: 'approvalState' }) === RELEASED_STATE;

  // РУЧНАЯ ПРАВКА ЗНАЧЕНИЯ ГАСИТ ПРОВЕНАНС «lays» СРАЗУ, НЕ ДОЖИДАЯСЬ СЕРВЕРА — та же дисциплина,
  // что у ручной правки нормы в рецепте (colorway-recipe: правка числа пишет source=''). Сервер
  // сделал бы то же самое при сохранении (смена значения → 'manual', что бы клиент ни прислал),
  // но до сохранения бейдж «медиана по N раскроям» стоял бы рядом с числом, которое человек
  // только что выдумал, — то есть врал бы ровно в момент, когда провенанс важнее всего.
  //
  // Якорь — значение, ПРИ КОТОРОМ источник стал 'lays' (загрузка карточки или нажатие
  // «подставить»); сравнение числовое, чтобы «22.00» и «22» не читались как правка. Ссылку
  // обновляет и applySuggestion ниже — иначе повторное применение уехавшей медианы выглядело бы
  // для этого эффекта как ручная правка и само же гасило бы только что поставленный источник.
  const laysAnchor = useRef<string | null>(null);
  useEffect(() => {
    if (wastageSource !== 'lays') {
      laysAnchor.current = null;
      return;
    }
    if (laysAnchor.current === null) {
      laysAnchor.current = wastageValue;
      return;
    }
    const a = parseDecimalNumber(laysAnchor.current);
    const v = parseDecimalNumber(wastageValue);
    const same =
      Number.isFinite(a) && Number.isFinite(v) ? a === v : laysAnchor.current === wastageValue;
    if (!same) {
      setValue(`bomItems.${index}.wastageSource`, 'manual', { shouldDirty: true });
      setValue(`bomItems.${index}.wastageLayCount`, 0, { shouldDirty: true });
    }
  }, [wastageSource, wastageValue, index, setValue]);

  // Применение предложения: ПАРА (процент, счётчик) кладётся вместе — по её совпадению с текущей
  // медианой сервер отличает применение от ручного ввода. Процент — строкой ответа КАК ЕСТЬ, без
  // переформатирования: любая косметика здесь рискует разминуться с медианой при серверной
  // сверке. Штамп применения ставит сервер; здешний след старого штампа чистится, чтобы бейдж не
  // датировал новое применение старой датой.
  const applySuggestion = (percent: string, layCount: number) => {
    laysAnchor.current = percent;
    setValue(`bomItems.${index}.wastagePercent`, percent, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`bomItems.${index}.wastageSource`, 'lays', { shouldDirty: true });
    setValue(`bomItems.${index}.wastageLayCount`, layCount, { shouldDirty: true });
    setValue(`bomItems.${index}.wastageAppliedAt`, '', { shouldDirty: false });
  };

  // Прогонные однодневки отсеивает markersForLine (cardMarkers внутри) — совет «снимите норму с
  // раскладки» на основании раскладки чужого заказа был бы советом взять число, которого нормой
  // быть не может.
  const slotMarkers = markersForLine(markers, lineKey);
  // «Задан» — по правилу сервера: всё меньше единицы EffectiveCuttingCoefficient читает как «не
  // задано», и говорить о числе, которое ни один расчёт не берёт, значило бы пугать пустотой.
  const coefRaw = decimalToInput(material?.cuttingCoefficient);
  const coefSet = Number.isFinite(Number(coefRaw)) && Number(coefRaw) >= 1;

  const measuredRows = normRows.filter((r) => r.marker);
  // Строки рецепта, которые процент ВСЁ ЕЩЁ гроссит: мерные и не марочные. Счётные сюда не
  // попадают — их сервер отсекает раньше любого гросс-апа.
  const grossedRows = normRows.filter((r) => !r.marker && r.measured);
  const pct = pctLabel(wastageValue);

  // РОВНО ОДНА АКТИВНАЯ СТУПЕНЬ. Порядок — сила утверждения: измеренная норма сильнее любой
  // калибровки, снятая раскладка сильнее оценки, оценка сильнее пустоты.
  const rung: 'measured' | 'markerIdle' | 'lays' | 'manual' | 'none' =
    measuredRows.length > 0
      ? 'measured'
      : slotMarkers.length > 0
        ? 'markerIdle'
        : wastageValue === ''
          ? 'none'
          : wastageSource === 'lays'
            ? 'lays'
            : 'manual';

  // Величина и её происхождение — ОДНОЙ плиткой, потому что порознь они не значат ничего: «22%»
  // без провенанса неотличимо от привычки, а «введено руками» без числа не говорит о закупке.
  const appliesNowhere = rung === 'measured' && grossedRows.length === 0;
  const statValue = appliesNowhere ? 'не начисляется' : pct || '—';
  const statSub = appliesNowhere
    ? 'норма измерена раскладкой'
    : rung === 'lays'
      ? `${laysProvenancePhrase(wastageLayCount, stampWhen(wastageAppliedAt))}${
          stampWhen(wastageAppliedAt) ? '' : ' — применится при сохранении'
        }`
      : wastageValue !== ''
        ? 'введено руками — ничем не подтверждено'
        : 'значения нет';

  // Путь наверх называется вслух и одинаково на всех нижних ступенях: измеренная длина — это то,
  // что закрывает вопрос совсем, а не ещё одна оценка получше.
  const kitMarkerRoute = frozen ? (
    <Text size='nano' variant='label'>
      Выше по лестнице — измеренная длина: «раскладка комплекта…» в рецепте колорвея. На выпущенной
      карточке её не снять — сначала верните карточку в draft.
    </Text>
  ) : (
    <div className='flex flex-wrap items-center gap-1.5'>
      {onOpenColorways && (
        <Button type='button' variant='secondary' size='xs' onClick={onOpenColorways}>
          → к рецепту колорвея
        </Button>
      )}
      <Text size='nano' variant='label' component='span'>
        выше по лестнице — измеренная длина: «раскладка комплекта…» разложит детали ЭТОГО слота на
        ширине пина колорвея, и процент перестанет применяться вовсе
      </Text>
    </div>
  );

  return (
    <div className='mt-1 space-y-1.5'>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <SelectField
          name={`bomItems.${index}.fabricDirection`}
          label='fabric direction'
          items={techCardFabricDirectionOptions}
        />
      </div>

      <StatGrid min={170}>
        <Stat label='надбавка на раскрой' value={statValue} sub={statSub} />
      </StatGrid>

      {/* ЧТО ЭТО ЗА ЧИСЛО — ОДИН РАЗ НА ЭКРАН, и оба множителя названы вместе: порознь они и
          разъезжаются. Процент = геометрия настила, коэффициент = реальность рулона. */}
      <Text variant='label' size='micro'>
        Процент платит ровно за ГЕОМЕТРИЮ настила: межлекальные выпады и концы. Кромка в него не
        входит — она оплачена делением площади на раскройную ширину. Усадку, обход пороков и
        сращивание платит другой множитель — коэффициент раскроя артикула
        {coefSet ? ` (${coefRaw})` : ' (у этого артикула не задан)'}: он начисляется ВСЕГДА, включая
        измеренную норму, потому что ни одна раскладка этого увидеть не может.
      </Text>

      {rung === 'measured' ? (
        // СТУПЕНЬ 1. Не «раскладка есть», а «норма измерена»: процент не начисляется по правилу
        // сервера (wastageApplies), и умножать ему нечего.
        <CalloutBox tone='note'>
          <Text size='micro'>
            Норма снята с раскладки в рецептах: {skuList(measuredRows)}. Там надбавка не начисляется
            — измеренная длина уже содержит межлекальные выпады и концы настила.
            {grossedRows.length > 0
              ? ` В остальных (${skuList(grossedRows)}) норма не измерена — там всё ещё начисляется ${pct || 'ноль: значения нет'}.`
              : ''}
          </Text>
        </CalloutBox>
      ) : rung === 'markerIdle' ? (
        // СТУПЕНЬ 1, НЕ ДОЙДЕННАЯ: раскладка снята, но норму с неё не взяли — процент ЖИВ. Панель
        // предложения при живой раскладке не монтируется и RPC не уходит: калибровать оценку,
        // которой осталось жить до одного нажатия, значит звать человека настраивать то, что пора
        // выключить.
        <>
          <CalloutBox tone='warning'>
            <Text size='micro'>
              У карточки есть раскладка этого слота, но норма с неё не снята — пока начисляется{' '}
              {pct || 'ноль: значения нет'}. Снимите расход с раскладки в рецепте колорвея, и
              надбавка перестанет применяться вовсе.
            </Text>
          </CalloutBox>
          {kitMarkerRoute}
        </>
      ) : (
        <>
          {/* СТУПЕНЬ 2. Живая панель: она сама говорит и «фактов n из 3, вот что сделать», и «вне
              диапазона», и «готово, по N раскроям из M», и кладёт медиану в форму по нажатию —
              вместе со счётчиком настилов, по которому сервер признаёт применение. Ленивость по
              построению: компонент живёт только в открытом редакторе ОДНОЙ строки. */}
          <BomWastageSuggestion
            materialId={rowMaterialId}
            currentPercent={wastageValue}
            currentSource={wastageSource}
            onApply={applySuggestion}
          />
          {/* СТУПЕНЬ 4. Не пустота, а названный риск: без надбавки netto уходит в закупку как
              есть. Гейт готовности прогона останавливает прогон ровно на паре «норма по выкройкам
              + процент не задан» — то есть это состояние однажды остановит цех, а не просто
              «немного занизит». */}
          {rung === 'none' && (
            <CalloutBox tone='warning'>
              <Text size='micro'>
                Надбавки нет. Netto-норма уйдёт в закупку и в себестоимость КАК ЕСТЬ — без
                межлекальных выпадов и концов настила, то есть заниженной. Гейт готовности прогона
                на паре «норма по выкройкам + процент не задан» прогон не выпустит.
              </Text>
            </CalloutBox>
          )}
          {kitMarkerRoute}
        </>
      )}

      {/* ЕДИНСТВЕННЫЙ ЯВНЫЙ ВЫХОД. Ручной ввод не запрещён — без него первый же странный DXF
          останавливает закупку, — но он перестал быть умолчанием: это действие, а не поле, которое
          стоит открытым и приглашает. <details>, а не кнопка: на выпущенной карточке вкладка лежит
          внутри <fieldset disabled>, и раскрывашка на <button> там умерла бы молча. */}
      <details className='border border-hairline px-2 py-1'>
        <summary className='cursor-pointer text-micro uppercase tracking-label text-labelColor'>
          вписать своё
        </summary>
        <div className='flex flex-col gap-1 pt-1.5'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            <DecimalField name={`bomItems.${index}.wastagePercent`} label='процент раскроя, %' />
          </div>
          <Text size='nano' variant='label'>
            Число станет «введено руками»: подтвердить его нечем, пока у слота нет ни раскладки, ни
            трёх замеренных настилов. На прогоне его можно переопределить фактическим процентом цеха
            — тот тоже остаётся геометрией настила.
          </Text>
          {coefSet && (
            // Ошибка, ради которой предупреждение и живёт ИМЕННО ЗДЕСЬ: единственное место, где
            // коэффициент артикула ещё можно вписать не туда. У него ДРУГАЯ база — измеренная
            // длина, выпады уже внутри, — и его 2–6% на месте нужных 15–30% занижают закупку на
            // все межлекальные выпады, линейно и незаметно.
            <CalloutBox tone='warning'>
              <Text size='nano'>
                Не вписывайте сюда коэффициент раскроя артикула ({coefRaw}): у него ДРУГАЯ база —
                измеренная длина, выпады уже внутри, — и он начисляется отдельно и поверх. Здесь
                ждут выпады настила: обычно 15–30%, а не 2–6%.
              </Text>
            </CalloutBox>
          )}
        </div>
      </details>
    </div>
  );
}

// One catalog article (Sheet «Спецификация»). The BOM is a pure material-article catalog:
// identity + supplier + price + fabric data. Which article goes on which part, in what colour and
// at what consumption is the colourway's recipe (colorways tab → usages).
//
// A LINKED line splits in two (11.2): the catalog article on the left as a read-only PLATE — not a
// column of greyed-out inputs, which is what made "which of these 12 fields is mine?" unanswerable —
// and, on the right, the three fields that genuinely belong to this style. An UNLINKED line keeps
// the full manual form, because with no catalog article behind it those fields really are the
// operator's.
function BomItemRow({
  index,
  highlight,
  markers,
  colorways,
  onOpenColorways,
}: {
  index: number;
  highlight?: boolean;
  markers?: common_TechCardMarkerSummary[];
  /** Рецепты колорвеев как READ — лестница надбавки читает по ним, измерена ли норма слота. */
  colorways?: common_AdminColorwayRef[];
  onOpenColorways?: () => void;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const warnNoPrice = useNoPriceWarning();
  // Деньги строки видит и правит только costing:write: сервер вырезает их на чтении без
  // costing:read, а сейв без costing:write их вовсе не отправляет (schema.ts, verbatim-протокол) —
  // инпут без права был бы полем, которое молча выбрасывает ввод.
  const { canWriteCosting } = usePermissions();
  const materialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as
    | common_TechCardBomSection
    | undefined;
  const [createOpen, setCreateOpen] = useState(false);
  // Состояние выпуска читается ИЗ ФОРМЫ, а не приходит пропом: BOM целиком лежит внутри общего
  // `<fieldset disabled={frozen}>` вкладки и своего гейта не имеет, а подсказка про цену обязана
  // называть действие, которое на этой карте вообще существует.
  const frozen = useWatch({ control, name: 'approvalState' }) === RELEASED_STATE;

  const linked = materialId > 0;
  // ВКЛЮЧАЯ АРХИВНЫЕ — здесь список не предлагают, по нему ищут УЖЕ привязанный артикул. Без
  // архивных строка с заархивированным материалом теряла его latestPrice и снова показывала
  // «no price», хотя печатный tech-pack на тех же данных цену печатал (он всегда грузил список
  // вместе с архивом). Предлагает к привязке MaterialPicker — у него свой вызов useMaterials со
  // своим тумблером архива, так что архивные по-прежнему не всплывают в выборе. Лишнего запроса
  // это не добавляет: ('', true) уже держат в кеше соседние вкладки тех-карты.
  const { data } = useMaterials('', true);
  const linkedMaterial = linked
    ? (data?.materials ?? []).find((m) => wireInt(m.id) === materialId)
    : undefined;
  // Warehouse facts for the plate's «склад: 41.6 m · средняя ≈ 1.05 EUR / m». Only fetched once a
  // line is actually linked AND being edited (this row only mounts inside the open editor dialog).
  const stockFacts = useMaterialStockFacts(linked);

  // Snapshot a catalog material's meta onto this line (S23: the line stays self-contained). Fabric
  // dims read from the typed CTI attrs, falling back to the legacy flat fields.
  const snapshotFrom = (m: common_Material) => {
    // Material.id is int64 -> arrives as a STRING from grpc-gateway despite the generated type
    // saying `number`. Writing it raw put a string into the form, which z.number() then rejected
    // as "Invalid input" on bomItems.N.materialId — an unsavable card, right after linking.
    setValue(`bomItems.${index}.materialId`, wireInt(m.id), { shouldDirty: true });
    // The role (`name`) is deliberately NOT in materialLineFields: linking an article describes
    // the slot's default material, it does not rename the slot.
    Object.entries(materialLineFields(m)).forEach(([field, val]) => {
      // Only non-empty values are written: linking must never CLEAR a supplier / width / price the
      // operator typed on the line while it was still free-text.
      if (!val) return;
      setValue(`bomItems.${index}.${field}` as never, val as never, { shouldDirty: true });
    });
  };

  const pick = (id: number, m?: common_Material) => {
    setValue(`bomItems.${index}.materialId`, wireInt(id), { shouldDirty: true });
    if (id && m) {
      snapshotFrom(m);
      warnNoPrice(m);
    }
  };

  const rowValue = (field: string): string =>
    (getValues(`bomItems.${index}.${field}` as never) as string) ?? '';

  // Prefer the live catalog value; fall back to whatever this line already holds (the linked
  // material is archived/deleted, or the catalog list hasn't loaded yet) so the plate never
  // flashes blank while linked.
  const mirror = (catalogValue: string | undefined, field: string): string | undefined =>
    catalogValue?.trim() ? catalogValue : rowValue(field);

  // #3: the unit price, its currency and the unit fold into a single read-only "8.00 EUR / m".
  // WHICH price that is comes from the shared ladder (bom-price.ts) — the line's own frozen
  // snapshot first, the article's current catalog price second — the very ladder the server costs
  // by. The plate used to read the catalog number straight off `latestPrice`, so a line whose
  // snapshot had drifted showed one figure here and another on the tile; the ladder now lives in
  // ONE place and both surfaces print the number this line is actually costed at, with the catalog
  // figure named beside it when the two disagree.
  const linePrice = resolveBomPrice(
    { unitPrice: rowValue('unitPrice'), currency: rowValue('currency'), unit: rowValue('unit') },
    linkedMaterial,
  );
  // СКЛАД — не третья ступень лестницы цены, а отдельный факт о материале, поэтому он и не живёт в
  // resolveBomPrice: по средней строка не считается и себестоимостью она не становится. Обе
  // величины берутся из ОДНОЙ строки ledger'а и меряны в единице МАТЕРИАЛА, которая может не
  // совпадать с единицей строки, — подпись едет со своим числом, ступени не смешиваются.
  const stock = stockFacts.get(materialId);
  const stockUnit = stock?.unit ?? '';
  const onHandLabel = stock?.onHand ? `${stock.onHand}${stockUnit ? ` ${stockUnit}` : ''}` : '';
  // Валюта средней подписывается ВСЕГДА, даже когда совпадает с валютой строки: это база (склад
  // усредняет закупки в разных валютах, приводя каждую к базовой), и без подписи два числа рядом
  // прочтутся как одни и те же деньги. Знак ≈ говорит, что это оценка того, что уже лежит, а не
  // котировка следующей закупки. Никаких конвертаций и процентов расхождения на клиенте: валюты
  // разные, вычитать их нельзя.
  const avgLabel = stock?.avgUnitCostBase
    ? `средняя ≈ ${stock.avgUnitCostBase} ${stock.baseCurrency}${stockUnit ? ` / ${stockUnit}` : ''}`
    : '';
  const stockLine = join(onHandLabel, avgLabel);

  // Куда идти с этой ценой. «Заведите в справочнике» — правда ровно в одном случае из трёх, а
  // перенести каталожную цену на карту умеет только кнопка reprice на вкладке costing — которой на
  // ВЫПУЩЕННОЙ карте нет (costing-field прячет её на released: карта заморожена целиком). Совет,
  // который некуда выполнить, — та же ложь, что «set it in materials» на проценённом артикуле,
  // только этажом выше, поэтому действие называется по состоянию карты.
  const priceAction = frozen
    ? 'Перенести её на карту можно только после возврата в draft: на выпущенной карте цены заморожены вместе с остальной спецификацией.'
    : 'Перенести: «обновить цены из каталога» на вкладке costing.';
  const priceHint =
    linePrice.source === 'catalog'
      ? `Цена взята из справочника и на этой карте не зафиксирована — артикул проценили уже после привязки. ${priceAction}`
      : linePrice.drift
        ? `На карте зафиксировано ${linePrice.label}, в справочнике сейчас ${formatBomMoney(linePrice.drift.value, linePrice.drift.currency, linePrice.drift.unit)}. ${priceAction}`
        : '';

  // The composition cell carries the deep-link anchor + pulse the labels tab uses to point an
  // operator at a missing composition (care-gen). Read-only line on the catalog plate when linked,
  // editable picker when not — kept in one place so both states keep the `#bom-composition-{index}`
  // anchor phase 15's care generator scrolls to and pulses.
  const compositionAnchor = (children: React.ReactNode) => (
    <div
      id={`bom-composition-${index}`}
      className={cn(
        highlight && 'animate-pulse p-1 ring-2 ring-warning motion-reduce:animate-none',
      )}
    >
      {children}
    </div>
  );

  const createModal = (
    // Inline create — prefill the section from this BOM line; auto-select on create (Q9a).
    <MaterialModal
      open={createOpen}
      onOpenChange={setCreateOpen}
      defaultSection={rowSection}
      onCreated={(_id, m) => snapshotFrom(m)}
    />
  );

  const colorwayHint = (
    <Text variant='label' size='micro'>
      Цвет, размещение и расход этого артикула задаются на вкладке colorways (в карточке колорвея).
    </Text>
  );

  if (linked) {
    return (
      <div className='space-y-2.5'>
        <SlotIdentityFields index={index} />
        <div className='grid grid-cols-1 gap-2.5 lg:grid-cols-2'>
          {/* CATALOG ARTICLE — a plate, not fields. Zebra ground + no input chrome, so nothing on
              this half can be mistaken for something editable here. */}
          <div className='border border-borderColor bg-bgZebra px-2 pb-2'>
            <GroupLabel
              action={
                // Straight to THIS article's card, not the bare catalog: ?material= is what opens
                // it on the catalog tab, so the link survives a cold load. Lives inside the linked
                // branch only — an unlinked line has no article to open.
                <Link
                  to={`${ROUTES.materials}?tab=catalog&material=${materialId}`}
                  className='underline underline-offset-2'
                >
                  <Text component='span' variant='label' size='micro'>
                    open →
                  </Text>
                </Link>
              }
            >
              catalog article
            </GroupLabel>
            <div className='flex items-start gap-2'>
              <MaterialThumb material={linkedMaterial} size='md' />
              <div className='min-w-0 flex-1 space-y-0.5'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Pill tone='mut'>{sectionShort(linkedMaterial?.section) || 'section?'}</Pill>
                  {/* The ARTICLE's catalog name — under a "catalog article" header the role would
                      be a lie (the role names the slot, this plate names its default material). */}
                  <Text component='span' className='min-w-0 truncate font-bold'>
                    {linkedMaterial?.name?.trim() || `артикул #${materialId}`}
                  </Text>
                </div>
                <Text variant='label' size='micro' className='truncate'>
                  {join(
                    mirror(linkedMaterial?.supplier, 'supplier'),
                    mirror(linkedMaterial?.supplierRef, 'supplierRef'),
                    mirror(linkedMaterial?.color, 'color'),
                  ) || 'no supplier'}
                </Text>
                <Text variant='label' size='micro' className='truncate'>
                  {join(
                    widthLabel(mirror(materialFabricWidth(linkedMaterial), 'fabricWidth')),
                    weightLabel(mirror(materialFabricWeight(linkedMaterial), 'fabricWeightGsm')),
                    mirror(linkedMaterial?.spec, 'spec'),
                  ) || '—'}
                </Text>
                {/* The material's fibre composition — the readable projection of its STRUCTURED
                    entries (#37), falling back to the legacy free-text `composition`. Read off the
                    linked material itself so it shows even for a line whose composition string was
                    snapshotted before the structured blend existed. */}
                {compositionAnchor(
                  <Text variant='label' size='micro' className='truncate'>
                    {(linkedMaterial ? materialCompositionText(linkedMaterial) : '') ||
                      'composition not set'}
                  </Text>,
                )}
                {/* ЦЕНА — та ступень лестницы, по которой строка реально считается. */}
                <Text variant='label' size='micro' className='truncate'>
                  {linePrice.label || 'no price'}
                </Text>
                {/* СКЛАД — своей строкой, а не хвостом через «·» к цене. Котировка говорит, во что
                    обойдётся СЛЕДУЮЩАЯ закупка, средняя — во что обошлось то, что уже лежит и что
                    будет израсходовано; это разные величины в разных валютах, и поставленные
                    подряд через точку они читаются как «было → стало». Расхождение между ними —
                    информация, но увидеть её владелец должен как два подписанных числа, а не как
                    разницу, которой не существует. */}
                {stockLine ? (
                  <Text variant='label' size='micro' className='truncate'>
                    склад: {stockLine}
                  </Text>
                ) : null}
              </div>
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-1.5'>
              <Button type='button' size='xs' variant='secondary' onClick={() => pick(0)}>
                unlink
              </Button>
              {/* Цена строки, названная своим именем. Раньше здесь стояла одна плашка
                  «no price — set it in materials» на все случаи: она загоралась и тогда, когда цена
                  в справочнике УЖЕ была, и отправляла владельца ровно туда, где он её только что
                  завёл. Строка без цены нигде по-прежнему молча обнуляет оценку и COGS — и только
                  она теперь и зовёт в справочник. */}
              {linePrice.source === 'none' ? (
                <Pill tone='attention'>no price — set it in materials</Pill>
              ) : linePrice.source === 'catalog' ? (
                <Pill tone='attention'>цена из каталога</Pill>
              ) : linePrice.drift ? (
                <Pill tone='attention'>каталог {linePrice.drift.label}</Pill>
              ) : null}
            </div>
            {priceHint && (
              <Text variant='label' size='micro' className='mt-1'>
                {priceHint}
              </Text>
            )}
          </div>

          <ThisStyleFields
            index={index}
            material={linkedMaterial}
            markers={markers}
            colorways={colorways}
            onOpenColorways={onOpenColorways}
          />
        </div>
        {colorwayHint}
        {createModal}
      </div>
    );
  }

  return (
    <div className='space-y-2.5'>
      {/* Role + section come FIRST: they are the slot's identity, and the section also scopes the
          picker below to the right family — hardware for пуговицы / молнии / кнопки, trim, thread…
          not only fabric. */}
      <SlotIdentityFields index={index} />
      <div>
        <Text variant='label' size='micro' tracking='label' className='uppercase'>
          catalog material *
        </Text>
        <div className='mt-1 flex items-start gap-1.5'>
          <div className='min-w-0 flex-1'>
            {/* 11.3: the BOM links through the SWATCH dialog — choosing a fabric is a visual
                decision. The fast combobox stays the default everywhere else. */}
            <MaterialPicker
              variant='grid'
              value={materialId}
              section={rowSection ?? ''}
              onChange={(id, m) => pick(id, m)}
              onCreate={() => setCreateOpen(true)}
            />
          </div>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='shrink-0 whitespace-nowrap'
            onClick={() => setCreateOpen(true)}
          >
            + create
          </Button>
        </div>
      </div>
      <CalloutBox tone='error'>
        <Text size='micro'>
          Привяжите артикул из справочника материалов — <b>an unlinked line blocks the release</b>.
        </Text>
      </CalloutBox>

      {/* Legacy free-text line: everything editable until it is linked to a catalog material —
          with no catalog article behind it, these fields genuinely ARE the operator's. */}
      <div>
        <GroupLabel>material details</GroupLabel>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          <ComboField
            name={`bomItems.${index}.unit`}
            label='unit'
            options={unitOptions}
            placeholder='м / pcs'
          />
          <InputField name={`bomItems.${index}.supplier`} label='supplier' />
          <InputField name={`bomItems.${index}.supplierRef`} label='supplier ref' />
          <InputField name={`bomItems.${index}.color`} label='base color (ref)' />
          {/* `spec` lives ONLY on this unlinked branch. It was dropped entirely once as a duplicate
              of the structured width + weight below — true for a fabric, false for everything else:
              a zip, a thread or a button has no width and no gsm, and spec is the only descriptor
              it gets ("YKK 5CN, 18 cm"). The value round-trips either way, renders on a linked
              line's catalog plate and prints into the frozen release snapshot (releases-field), so
              with no input a free-text line held a spec no one in this admin could author or
              correct. A LINKED line still has none: there the article's catalog spec is the truth,
              mirrored read-only on the plate. */}
          <InputField name={`bomItems.${index}.spec`} label='spec (free text)' />
          <DecimalField name={`bomItems.${index}.fabricWidth`} label='width (cm)' />
          <DecimalField name={`bomItems.${index}.fabricWeightGsm`} label='weight (g/m²)' />
          {canWriteCosting && (
            <>
              <DecimalField name={`bomItems.${index}.unitPrice`} label='unit price' />
              <CurrencySelect name={`bomItems.${index}.currency`} label='currency' />
            </>
          )}
        </div>
        <div className='mt-2'>
          {compositionAnchor(<CompositionPicker name={`bomItems.${index}.composition`} />)}
        </div>
      </div>

      {/* Непривязанная строка: артикула нет, поэтому коэффициент назвать нечем — но лестница
          надбавки работает и здесь, раскладка привязана к слоту, а не к артикулу. */}
      <ThisStyleFields
        index={index}
        markers={markers}
        colorways={colorways}
        onOpenColorways={onOpenColorways}
      />
      {colorwayHint}
      {createModal}
    </div>
  );
}

// #33: one BOM article as a square, photo-forward TILE — a square material photo over section/тип
// pills, the article name, its self-describing code, spec line and price. Clicking it opens the
// editor in the app's modal shell: the editor is a two-column form, and unfolding that inside the
// tile grid pushed every following article a screen down and left the operator scrolling to find
// where the row they opened had gone.
function BomTile({
  index,
  roleDuplicate,
  onRemove,
  onOpen,
}: {
  index: number;
  // Another slot on this card carries the same normalized role — computed by the parent (a tile
  // only watches its own row). Advisory: duplicates stay savable, they are just indistinguishable
  // in every slot select and in the production material plan, so the tile says so.
  roleDuplicate?: boolean;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const row = (useWatch({ control, name: `bomItems.${index}` }) ?? {}) as {
    name?: string;
    section?: string;
    supplier?: string;
    unit?: string;
    unitPrice?: string;
    currency?: string;
    materialId?: number;
    purpose?: string;
    purposeNote?: string;
    isSample?: boolean;
    fabricDirection?: string;
  };

  const linked = (row.materialId ?? 0) > 0;
  // Архивные включены по той же причине, что и в редакторе строки: плитка ИЩЕТ привязанный
  // артикул, а не предлагает его. Список общий с редактором и с печатным tech-pack — один кеш,
  // одна цена, одна картинка.
  const { data } = useMaterials('', true);
  const material = linked
    ? (data?.materials ?? []).find((m) => wireInt(m.id) === row.materialId)
    : undefined;

  // A red underline inside the editor is invisible while the editor is a closed modal, so the tile
  // itself has to carry the error — otherwise a blocked save points at a row the operator can't see
  // is broken. The tile names the offending fields; clicking it opens them.
  const { errors } = useFormState({ control, name: `bomItems.${index}` });
  const rowErrors = flattenFieldErrors(
    (errors.bomItems as FieldErrors[] | undefined)?.[index] as FieldErrors | undefined,
  );
  const hasError = rowErrors.length > 0;

  // Цена, по которой строка реально считается: снапшот карты → иначе текущая каталожная цена
  // привязанного артикула (bom-price.ts — та же лестница, что у сервера и у панели редактора).
  // Плитка читала ТОЛЬКО снапшот, поэтому любая строка, чей артикул проценили после привязки,
  // горела «no price» при живой цене в справочнике.
  const price = resolveBomPrice(row, material);
  const imageUrl = materialImageUrl(material);
  const section = sectionShort(row.section);
  const cls = classShort(material?.materialClass);
  // грамматура · ширина · мат/сатин/блеск · состав · цвет — the identifying spec line, with the
  // colour appended. Empty on an unlinked line, which has no catalog material behind it yet.
  const specLine = material ? join(materialSpec(material), material.color) : '';

  // Только рулонные строки: направление — свойство ПОЛОТНА, и спрашивать его у нитки или у
  // фурнитуры было бы данными, которые ни один экран не читает.
  const needsDirection =
    isRollGoodsSection(row.section) &&
    (!row.fabricDirection || row.fabricDirection === 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN');

  // #64: an unlinked line is the release blocker, so it reads as the blocker marker; a linked line
  // shows the price it is costed at and says which of the two rungs that price came from — only
  // the snapshot is fixed on this card. Плашки НЕ раскрывашки и не тултипы: на RELEASED карте вся
  // плитка лежит внутри `<fieldset disabled>` и сама является `<button>`, так что любой текст,
  // спрятанный за наведением или кликом, там мёртв — источник цены и дрейф написаны словами.
  const priceStatus = !linked ? (
    <Pill tone='warn'>! link a material</Pill>
  ) : price.source === 'none' ? (
    <Pill tone='attention'>no price</Pill>
  ) : (
    <>
      <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
        {price.label}
      </Text>
      {price.source === 'catalog' ? (
        <Pill tone='attention'>из каталога</Pill>
      ) : price.drift ? (
        // Расхождение видно на строке, а не всплывает на костинге через две вкладки: ради этого
        // случая ручная кнопка «обновить цены из каталога» и остаётся.
        // `min-w-0 truncate` обязательны: у Pill свой `whitespace-nowrap`, и длинное значение
        // («каталог 1250.00 USD / kg») распирало бы 160-пиксельную колонку плиточной сетки —
        // соседний Text усекается, а плашка тянула бы трек за собой.
        <Pill tone='attention' className='min-w-0 truncate'>
          каталог {price.drift.label}
        </Pill>
      ) : null}
    </>
  );

  return (
    // relative so the remove ✕ can sit at the card's top-right OUTSIDE the open button — inside
    // it, the ✕ would grow the square tile and steal clicks meant for the editor.
    <div
      className={cn(
        'relative border bg-bgColor',
        linked && !hasError ? 'border-borderColor' : 'border-error',
      )}
    >
      <Button
        type='button'
        size='xs'
        variant='secondary'
        aria-label='remove BOM article'
        onClick={onRemove}
        className='absolute right-1 top-1 z-10'
      >
        ✕
      </Button>

      <button
        type='button'
        onClick={onOpen}
        className='flex w-full flex-col gap-1 p-1.5 text-left'
        aria-haspopup='dialog'
      >
        {/* The square material photo, full-bleed across the tile. */}
        {imageUrl ? (
          <span className='relative block aspect-square w-full overflow-hidden border border-borderColor'>
            <Media
              src={imageUrl}
              alt={row.name?.trim() || 'material'}
              aspectRatio='1/1'
              fit='cover'
            />
          </span>
        ) : (
          <Placeholder aspect='square' label='no photo' className='w-full' />
        )}

        {/* секция / тип. The class pill is dropped when it just repeats the section — the enums
            overlap word-for-word (fabric/hardware/thread/packaging), so a fabric article read
            «fabric fabric». It earns its place only when the two differ (lining + fabric). */}
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='mut'>{section || 'section?'}</Pill>
          {cls && cls !== section ? <Pill tone='mut'>{cls}</Pill> : null}
          {/* Семпловая rides INSIDE its purpose group as a badge, never as a group of its own: a
              sample is a sample MAIN plus a sample LINING, and a «семплы» heading would put those
              two in one bucket and throw away the roles that make them useful. */}
          {row.isSample ? <Pill tone='ink'>семпл</Pill> : null}
        </div>

        {/* The ROLE, bold — the slot's identity. The article is the line below it. */}
        <Text component='span' size='micro' className='min-w-0 truncate font-bold uppercase'>
          {row.name?.trim() || `слот ${index + 1}`}
        </Text>

        {/* the default article: catalog name + self-describing code, once a material is linked */}
        {linked && material ? (
          <>
            <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
              {material.name?.trim() || `#${row.materialId}`}
            </Text>
            <Text
              component='span'
              variant='label'
              size='micro'
              className='min-w-0 truncate font-mono tabular-nums'
            >
              {composeArticleFromMaterial(material, true)}
            </Text>
          </>
        ) : null}

        {specLine ? (
          <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
            {specLine}
          </Text>
        ) : null}

        {/* The OTHER note, on the tile: its group heading reads «другое», which says only that the
            operator looked and none of the seven fitted. The note is the part that means something. */}
        {isOtherPurpose(row.purpose) && row.purposeNote?.trim() ? (
          <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
            назначение: {row.purposeNote.trim()}
          </Text>
        ) : null}

        <div className='mt-0.5 flex min-w-0 flex-wrap items-center gap-1'>
          {priceStatus}
          {/* Advisory role health: a blank role reads as the article name everywhere (the server
              falls back on read), and a role that IS the article name is the tell of the fixed
              picker bug — both mean nobody has named the slot's place in the garment yet. */}
          {!row.name?.trim() || (linked && looksLikeArticleName(row.name, material?.name)) ? (
            <Pill tone='attention'>роль не задана</Pill>
          ) : null}
          {roleDuplicate ? <Pill tone='attention'>дубль роли</Pill> : null}
          {/* НАПРАВЛЕНИЕ ТКАНИ, не проставленное на рулонной строке (Ф1). Поле есть с 0073 и
              обязательным никогда не было, поэтому пустое оно почти везде — а с Ф1 оно решает,
              можно ли переворачивать деталь на раскладке, и сервер не примет норму, пока ответа
              нет. Плашка стоит ЗДЕСЬ, потому что чинится это здесь: отказ приходит в модалке
              раскладки, за две вкладки отсюда, и без метки его пришлось бы искать перебором. */}
          {needsDirection ? <Pill tone='attention'>направление ткани?</Pill> : null}
        </div>
      </button>

      {/* Same idea as the "! link a material" marker, for anything BLOCKING the save: name the
          offending fields on the tile so a row whose editor is closed is diagnosable at a glance. */}
      {hasError && (
        <div className='border-t border-hairline px-2 py-1'>
          <Text size='micro' variant='error' className='truncate'>
            {rowErrors.map((e) => `! ${e.path}: ${e.message}`).join(' · ')}
          </Text>
        </div>
      )}
    </div>
  );
}

// A colourway whose recipe still cuts the article the operator is trying to delete. The server
// refuses that delete; this is what the refusal is turned into on the way in.
type BlockingUser = { colorwayId: number; sku: string };

// Bill of materials = catalog of all material articles used by this style. Recipe (which
// article on which part, colour, consumption) lives per colourway on the colorways tab.
export function BomField({
  highlightComposition = 0,
  colorways,
  markers,
}: {
  highlightComposition?: number;
  /**
   * The style's colourways as READ (techCard.colorways) — NOT the RHF `colorways` array, which is
   * permanently empty since colourways stopped being style-owned. Their recipes are the one class
   * of reference to a BOM article this form cannot clear on its own, so they are the one thing
   * that has to be checked before a delete rather than fixed up after it.
   */
  colorways?: common_AdminColorwayRef[];
  /**
   * Карточные раскладки как READ (techCard.markers) — для лестницы у поля «est. cutting
   * wastage %»: раскладка слота делает процент ненужным, и об этом надо говорить там, где
   * процент вводят. Форма о раскладках не знает ничего — они приходят только с чтением карточки.
   */
  markers?: common_TechCardMarkerSummary[];
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const warnNoPrice = useNoPriceWarning();
  const [params, setParams] = useSearchParams();
  const [blocked, setBlocked] = useState<{ name: string; users: BlockingUser[] } | null>(null);
  // "add BOM article" is TWO steps in two stacked dialogs: the catalog picker first, then — on its
  // "add" — a small role modal OVER it. The article answers "what is it", the role answers "what is
  // it FOR» («основная ткань», «подкладка»…), and the line is created linked AND role-named, never
  // named after the article (see materialLineFields). Cancelling the role modal falls back to the
  // still-open picker with the selection intact — half a decision is never silently committed.
  const [adding, setAdding] = useState(false);
  // The picked article awaiting its role — the role modal is open exactly while this is set.
  const [addMaterial, setAddMaterial] = useState<common_Material | undefined>(undefined);
  const [addRole, setAddRole] = useState('');
  // НАЗНАЧЕНИЕ, asked in the same breath as the role and REQUIRED when the article is cloth. This is
  // the moment the answer is cheapest — the operator has just picked the fabric and knows why. Ask
  // later and it becomes an audit of twenty tiles, which is exactly the backlog the unsorted group
  // exists to work off, not something to keep growing.
  const [addPurpose, setAddPurpose] = useState<string>(UNSET_PURPOSE);
  const [addKind, setAddKind] = useState<string>(UNSET_KIND);
  const [addPurposeNote, setAddPurposeNote] = useState('');
  const [addSample, setAddSample] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { fields, append, remove } = useFieldArray({ control, name: 'bomItems' });
  const bomWatch = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    composition?: string;
    name?: string;
    section?: string;
    materialId?: number;
    purpose?: string;
  }>;
  // Positions, never reordered rows: every tile, editor and delete addresses a line by its index in
  // the field array, so grouping has to hand back where each line IS, not a rearranged copy. Length
  // comes from `fields` rather than from the watch — the two are the same list, but they settle a
  // render apart after an append, and a group built off the longer one would briefly index a tile
  // that has no field behind it.
  const bomGroups = groupBomLines(fields.map((_, i) => bomWatch[i] ?? {}));
  // Duplicate-role detection for the tiles (advisory, never a save rule): normalized role → count.
  const roleCounts = new Map<string, number>();
  bomWatch.forEach((b) => {
    const n = normalizeRole(b.name);
    if (n) roleCounts.set(n, (roleCounts.get(n) ?? 0) + 1);
  });
  // The article whose editor is open. ONE dialog for the whole grid, keyed by index — a modal per
  // tile would mean twenty dialog roots mounted to show at most one.
  const [editing, setEditing] = useState<number | null>(null);
  const [highlightActive, setHighlightActive] = useState(false);

  // When the labels tab asks for composition (care-gen with empty composition), jump here: open the
  // first article missing composition and pulse its empty field.
  useEffect(() => {
    if (!highlightComposition || !bomWatch.length) return;
    const firstEmpty = bomWatch.findIndex((b) => !b.composition?.trim());
    setEditing(firstEmpty >= 0 ? firstEmpty : 0);
    setHighlightActive(true);
    const t = setTimeout(() => setHighlightActive(false), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightComposition]);

  // ?bom=<line_key> opens ONE article's editor on arrival — the same hand-off shape this tab uses
  // in the other direction with ?colorway=<id>. Sent by the направление-ткани worklist (Ф1.8),
  // whose rows each name a line by its stable key: landing on the tab alone would drop the operator
  // in front of twenty tiles with nothing saying which one they came for.
  //
  // Gated on ?tab=bom because tab panels stay MOUNTED behind the active one — without it, any URL
  // carrying the param would pop this dialog over whatever tab is actually open. Consumed, not
  // kept: a param left standing would re-open the dialog on every return to the tab. Waits for the
  // field array to be seeded, so a deep link that arrives before the card's read lands is resolved
  // rather than discarded.
  const deepLinkedLine = params.get('bom');
  const onBomTab = params.get('tab') === 'bom';
  useEffect(() => {
    if (!deepLinkedLine || !onBomTab || fields.length === 0) return;
    const key = deepLinkedLine.trim();
    const index = fields.findIndex(
      (_, i) => ((getValues(`bomItems.${i}.lineKey`) as string) ?? '').trim() === key,
    );
    // A key that matches nothing still clears the param: the line was deleted or renamed since the
    // report was read, and leaving it in the URL would make the tab feel haunted.
    if (index >= 0) setEditing(index);
    const next = new URLSearchParams(params);
    next.delete('bom');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedLine, onBomTab, fields.length]);

  // The pulsed field lives inside the dialog, so it can only be scrolled to once that content has
  // mounted into its portal — a frame after `editing` is set, not in the effect above.
  useEffect(() => {
    if (!highlightActive || editing === null) return;
    const t = setTimeout(() => {
      document
        .getElementById(`bom-composition-${editing}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => clearTimeout(t);
  }, [highlightActive, editing]);

  // Which colourways cut a given article. Their recipes are colourway-owned — saved by their own
  // RPC, one write per colourway — so this form can neither see them in its own state nor clear
  // them as part of its save.
  //
  // Matched on bom_item_id, with line_key only as a fallback — not the other way round. The read
  // does not emit bom_line_key on a usage at all (ConvertRecipeUsagesToPb sets piece_line_key and
  // the resolved bom_item_id, and nothing else), which is also how the recipe editor resolves a
  // usage back to its BOM line: by id, then to that line's key. It is the same FK the server's
  // RESTRICT fires on. A never-saved article has id 0 and no colourway can reference it yet.
  const colorwayUsers = (lineKey: string, bomItemId: number): BlockingUser[] =>
    (colorways ?? [])
      .filter((c) =>
        (c.usages ?? []).some(
          (u) =>
            (bomItemId > 0 && wireInt(u.bomItemId) === bomItemId) ||
            (!!lineKey && u.bomLineKey === lineKey),
        ),
      )
      .map((c) => ({
        colorwayId: c.colorwayId ?? 0,
        sku: c.baseSku?.trim() || c.colorCode?.trim() || `#${c.colorwayId ?? 0}`,
      }));

  // Step 1 → step 2: the picker's "add" stages the article and opens the role modal over it. The
  // picker stays open underneath (it does not close itself on confirm), so cancelling the role
  // question returns to the swatch grid with the selection still armed. Prefill answers the easy
  // case only: the section's natural first role when this card has no slot in that section yet. A
  // second fabric gets an empty required field — naming the new role IS the deliberate answer, and
  // the exact moment «добавить ту же ткань ещё раз» turns into either «ткань капюшона» or a pin on
  // the colorways tab.
  const stageAdd = (m?: common_Material) => {
    if (!m || !wireInt(m.id)) {
      setAdding(false);
      return;
    }
    const sectionHasSlots = bomWatch.some((b) => b.section === m.section);
    setAddRole(sectionHasSlots ? '' : defaultRoleFor(m.section));
    // No prefill for the purpose, on purpose. The one guess available here — «первая ткань на
    // карточке значит основная» — is wrong precisely on the cards that need the field: a карманка or
    // a контраст picked first would be stamped MAIN and never looked at again.
    setAddPurpose(UNSET_PURPOSE);
    setAddPurposeNote('');
    setAddKind(UNSET_KIND);
    setAddSample(false);
    setAddMaterial(m);
  };

  // The article's own catalog section is what the new line is created with (materialLineFields), so
  // it is what decides whether a purpose is asked for.
  const addSection = addMaterial?.section || emptyBomItem.section;
  const addNeedsPurpose = isRollGoodsSection(addSection);
  const addPurposeAnswered = !addNeedsPurpose || addPurpose !== UNSET_PURPOSE;
  // ЧТО ЭТО ЗА ПОЗИЦИЯ is asked in the same breath, wherever назначение is not — this IS the moment
  // the operator has the answer in front of them. ASKED, NOT REQUIRED, unlike purpose: the role name
  // falls back to a purpose, so a missing purpose leaves the line nameless, whereas nothing depends
  // on the kind being present and unset is a legal state in the form, the store and the DB alike.
  const addKindEligible = isKindEligibleSection(addSection);
  const addKindItems = kindOptionsForSection(addSection);

  // Step 2 commit: one new slot — the answered role, the picked article as its default.
  // Роль обязательна только там, где назначение её не заменяет. У рулонной ткани назначение уже
  // сказано, и пустая роль подставится из него.
  const roleAnswered = !!addRole.trim() || (addNeedsPurpose && addPurposeAnswered);

  const commitAdd = () => {
    const m = addMaterial;
    const materialId = wireInt(m?.id);
    if (!m || !materialId || !roleAnswered || !addPurposeAnswered) return;
    append({
      ...emptyBomItem,
      ...materialLineFields(m),
      // Роль СПРАШИВАЕТСЯ ТОЛЬКО ТАМ, ГДЕ НАЗНАЧЕНИЕ НЕ ОТВЕЧАЕТ.
      //
      // У рулонной ткани назначение говорит то же самое, и требовать вдобавок «роль в изделии»
      // значит спрашивать одно дважды. Пустая роль подставляется из назначения — это единственное
      // место, где угадывать можно: оператор ТОЛЬКО ЧТО его выбрал, это не догадка по секции.
      //
      // Но само поле остаётся, и не из осторожности. Во-первых, у ниток, фурнитуры и отделки
      // назначения нет вовсе, и «основная молния» против «молния кармана» — единственное, чем они
      // различаются. Во-вторых, модель прямо допускает НЕСКОЛЬКО строк на одно назначение (в этом
      // и смысл «сабсета тканей»), и две «основной материал» — полочка и капюшон — без роли стали
      // бы неразличимы в раскладке, cut list и плане материалов.
      name: addRole.trim() || defaultRoleForPurpose(addPurpose),
      // A non-roll-goods article never reaches the purpose question, so it lands unset — the same
      // state the server and the DB CHECK both require of it.
      purpose: addNeedsPurpose ? addPurpose : UNSET_PURPOSE,
      purposeNote: addNeedsPurpose && isOtherPurpose(addPurpose) ? addPurposeNote.trim() : '',
      kind: addKindEligible ? addKind : UNSET_KIND,
      isSample: addSample,
      materialId,
      lineKey: ulid(),
    });
    warnNoPrice(m);
    setAddMaterial(undefined);
    setAdding(false);
  };

  // Both advisory — they explain, they never block. The commit is gated only on an empty role.
  const addCollision = roleCollision(bomWatch, addRole);
  const addExistingSlotIdx = addMaterial
    ? bomWatch.findIndex((b) => (b.materialId ?? 0) > 0 && b.materialId === wireInt(addMaterial.id))
    : -1;

  // ВЕРХНЯЯ СТУПЕНЬ ЛЕСТНИЦЫ НАДБАВКИ ЖИВЁТ НА ДРУГОЙ ВКЛАДКЕ. «Раскладка комплекта…» стоит на
  // строке рецепта колорвея (kit-marker), потому что мерить длину можно только на КОНКРЕТНОЙ
  // ширине — то есть на артикуле, который пинует колорвей. Со строки BOM туда нужен переход, и
  // редактор обязан закрыться первым: иначе модалка осталась бы висеть над вкладкой, которую
  // человек только что открыл. Форма при этом не теряется — вкладки живут внутри одной формы,
  // переключение меняет только параметр в URL.
  const openColorways = () => {
    setEditing(null);
    const next = new URLSearchParams(params);
    next.set('tab', 'colorways');
    setParams(next, { replace: true });
  };

  // Land on the offending recipe itself, not merely on the colorways tab: ?colorway= selects the
  // swatch, so the usage to remove is on screen instead of two clicks away.
  const goToColorway = (colorwayId: number) => {
    setBlocked(null);
    const next = new URLSearchParams(params);
    next.set('tab', 'colorways');
    if (colorwayId) next.set('colorway', String(colorwayId));
    setParams(next, { replace: true });
    showMessage('уберите этот артикул из рецепта колорвея и сохраните его', 'success');
  };

  // Stable line_key (§2.3): downstream refs point at the article's key, not its position — so
  // removing an article NEVER renumbers anything. We only clear refs that pointed AT the removed
  // article (its key is gone); refs to other articles are untouched. Kills the S2/S3 renumbering.
  const removeArticle = (bi: number) => {
    const removedKey = (getValues(`bomItems.${bi}.lineKey`) as string) || '';
    // Refuse here rather than let the save carry it to a server that answers with a wall of
    // uppercase naming a line_key the operator has never seen. Operation and piece references are
    // cleared below and go out with the same save; colourway recipes are the one thing this form
    // does not own, so they are the one thing that can block.
    const users = colorwayUsers(removedKey, wireInt(getValues(`bomItems.${bi}.id`)));
    if (users.length > 0) {
      setBlocked({
        name: (getValues(`bomItems.${bi}.name`) as string)?.trim() || `артикул ${bi + 1}`,
        users,
      });
      return;
    }
    if (removedKey) {
      const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
      (operations ?? []).forEach((o, oi) => {
        // The LIST is the reference. `operations.N.bomLineKey` is vestigial in the form — the read
        // folds it into bomLineKeys (mergeLegacyBomKey) and the write derives it back from
        // bomLineKeys[0] — so clearing only the singular, as this did, was overwritten by the very
        // next save and the removed key shipped anyway. The server deletes operations before it
        // drops the BOM line, so the delete succeeded and resolveBomRef then failed the whole
        // transaction on a key that no longer exists: a card nothing in the UI could rescue, since
        // the operation's chip row only offers BOM lines that still exist.
        const keys = (o.bomLineKeys ?? []).filter(Boolean);
        if (keys.includes(removedKey)) {
          setValue(
            `operations.${oi}.bomLineKeys`,
            keys.filter((k) => k !== removedKey),
            { shouldDirty: true },
          );
        }
      });
      const pieces = (getValues('pieces') ?? []) as TechCardFormData['pieces'];
      (pieces ?? []).forEach((p, pi) => {
        (p.materials ?? []).forEach((m, mi) => {
          if (m.bomLineKey === removedKey) {
            setValue(`pieces.${pi}.materials.${mi}.bomLineKey`, '', { shouldDirty: true });
          }
          if (m.fusingBomLineKey === removedKey) {
            setValue(`pieces.${pi}.materials.${mi}.fusingBomLineKey`, '', { shouldDirty: true });
          }
        });
      });
      // Labels reference a BOM line by resolved ID, not by key, and no screen renders that link —
      // the card reads it, carries it, and sends it back untouched (§2.8 label ↔ physical label
      // material). Nothing sets it today, so this is a landmine rather than a live bug: the moment
      // something does, deleting that article fails the save with a bare FK error, because the
      // server re-inserts the labels AFTER the BOM upsert has dropped the line. An invisible
      // referrer is exactly the kind that has to be released here — there is no other screen to do
      // it on.
      const removedId = wireInt(getValues(`bomItems.${bi}.id`));
      if (removedId > 0) {
        const labels = (getValues('labels') ?? []) as Array<{ bomItemId?: number }>;
        labels.forEach((l, li) => {
          if (wireInt(l.bomItemId) === removedId) {
            setValue(`labels.${li}.bomItemId`, 0, { shouldDirty: true });
          }
        });
      }
      // No colourway pass here. The RHF `colorways` array has been permanently empty since
      // colourways became products (mapTechCardToForm maps over []), so the loop that used to sit
      // here cleared nothing while reading as if it handled the case — which is exactly how a
      // referenced article reached the server and came back as an error about a line_key. The
      // guard above is what actually handles it.
    }
    // Indices shift under an open editor once a row above it is gone; close it rather than let it
    // repoint at whatever slid into that slot.
    setEditing(null);
    remove(bi);
  };

  return (
    <div className='space-y-2.5'>
      <Text variant='label' size='micro'>
        Справочник артикулов: внесите каждый материал один раз. На вкладке colorways вы выбираете,
        какой артикул идёт на какую часть, в каком цвете и с каким расходом.
      </Text>

      {fields.length === 0 ? (
        <Placeholder label='no BOM articles yet' className='h-16' />
      ) : (
        // Grouped the way the catalog tab groups materials: a heading with a count, tiles under it,
        // the gutter between groups doing the dividing. Cloth groups by НАЗНАЧЕНИЕ (several sections
        // legitimately share one purpose — the tile keeps its own section pill), everything else
        // keeps its section. Tiles stay the same auto-filling grid (min=160): fixed column counts
        // made a BOM article a quarter of a desktop wide, so four articles filled a screen.
        <div className='flex flex-col gap-5'>
          {bomGroups.map((g) => (
            <div key={g.key} className='flex flex-col gap-2'>
              <GroupLabel
                flush
                action={
                  <Text size='micro' variant='label'>
                    {g.indices.length}
                  </Text>
                }
              >
                {g.label}
              </GroupLabel>
              {/* The unsorted pile is the one group that has to explain itself: it is a backlog,
                  not a category, and nothing filled it in automatically on purpose. */}
              {g.unsorted && (
                <Text variant='label' size='micro'>
                  У этих тканей назначение не задано. Автоматически оно не проставляется: «основная
                  / карманка / контраст» отличаются только тем, зачем они в изделии, и угадать это
                  по секции нельзя. Откройте карточку и выберите назначение.
                </Text>
              )}
              <Tiles min={160}>
                {g.indices.map((index) => (
                  <BomTile
                    key={fields[index]?.id ?? index}
                    index={index}
                    roleDuplicate={(roleCounts.get(normalizeRole(bomWatch[index]?.name)) ?? 0) > 1}
                    onRemove={() => removeArticle(index)}
                    onOpen={() => setEditing(index)}
                  />
                ))}
              </Tiles>
            </div>
          ))}
        </div>
      )}

      {/* The editor, in the app's one modal shell. No footer: nothing here is committed separately —
          the fields write straight into the card's form state, and the card's own save button is
          what persists them. Closing is ✕ / Esc / the overlay. */}
      {editing !== null && (
        <ConfirmationModal
          open
          onOpenChange={(v) => !v && setEditing(null)}
          onConfirm={() => setEditing(null)}
          width='lg'
          hideActions
          title={join(
            bomWatch[editing]?.name?.trim() || `слот ${editing + 1}`,
            sectionShort(bomWatch[editing]?.section),
          )}
        >
          <BomItemRow
            index={editing}
            highlight={highlightActive}
            markers={markers}
            colorways={colorways}
            onOpenColorways={openColorways}
          />
        </ConfirmationModal>
      )}

      {/* Why the delete did not happen, named in the operator's terms: not a line_key, but the
          colourways that still cut this article, each one a link to the recipe that releases it. */}
      {blocked && (
        <ConfirmationModal
          open
          onOpenChange={(v) => !v && setBlocked(null)}
          width='sm'
          title='артикул ещё используется'
          cancelLabel='close'
          confirmLabel={blocked.users[0] ? `открыть ${blocked.users[0].sku} →` : 'close'}
          closeOnConfirm={false}
          onConfirm={() =>
            blocked.users[0] ? goToColorway(blocked.users[0].colorwayId) : setBlocked(null)
          }
        >
          <div className='flex flex-col gap-2'>
            <Text size='micro'>
              «{blocked.name}» стоит в рецептах этих колорвеев. Уберите его оттуда — тогда артикул
              можно будет удалить.
            </Text>
            <div className='flex flex-col'>
              {blocked.users.map((u) => (
                <button
                  key={u.colorwayId}
                  type='button'
                  onClick={() => goToColorway(u.colorwayId)}
                  className='flex items-center gap-2 border-b border-hairline py-1 text-left last:border-b-0 hover:bg-bgZebra'
                >
                  <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                    {u.sku}
                  </Text>
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='shrink-0 underline'
                  >
                    → colorways
                  </Text>
                </button>
              ))}
            </div>
            <Text size='micro' variant='label'>
              Рецепт колорвея сохраняется отдельно от карточки, поэтому его нельзя почистить этим же
              сохранением.
            </Text>
          </div>
        </ConfirmationModal>
      )}

      <Button
        type='button'
        variant='main'
        size='sm'
        onClick={() => {
          // Fresh flow every time — a role typed for the previous slot must not leak into this one.
          setAddRole('');
          setAddMaterial(undefined);
          setAdding(true);
        }}
      >
        add BOM article
      </Button>

      {/* Step 1: the catalog as swatches. Its "add" stages the pick and opens the role modal on
          top (stageAdd). "+ create" hands off to the material form and re-enters the same staged
          flow, so an article made on the spot gets asked for its role too. */}
      <MaterialPickerDialog
        open={adding}
        title='add BOM article'
        confirmLabel='add'
        onPick={stageAdd}
        onClose={() => setAdding(false)}
        onCreate={() => {
          setAdding(false);
          setCreateOpen(true);
        }}
      />
      <MaterialModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(_id, m) => stageAdd(m)}
      />

      {/* Step 2: the role question, stacked over the still-open picker (both portal to body; the
          later dialog renders above). Cancel falls back to the picker with the selection intact. */}
      {addMaterial && (
        <ConfirmationModal
          open
          onOpenChange={(v) => !v && setAddMaterial(undefined)}
          width='sm'
          title={addNeedsPurpose ? 'назначение ткани' : 'роль в изделии'}
          confirmLabel='add'
          confirmDisabled={!roleAnswered || !addPurposeAnswered}
          closeOnConfirm={false}
          onConfirm={commitAdd}
        >
          <div className='flex flex-col gap-2'>
            {/* What was just picked, so the question reads in context. */}
            <div className='flex items-center gap-2'>
              <MaterialThumb material={addMaterial} size='md' />
              <div className='min-w-0 flex-1'>
                <Text size='micro' className='truncate font-bold'>
                  {addMaterial.name?.trim() || `#${wireInt(addMaterial.id)}`}
                </Text>
                <Text variant='label' size='micro' className='truncate'>
                  {sectionShort(addMaterial.section) || '—'}
                </Text>
              </div>
            </div>
            <div>
              <Text variant='label' size='micro' tracking='label' className='uppercase'>
                {addNeedsPurpose ? 'роль в изделии' : 'роль в изделии *'}
              </Text>
              <div className='mt-1'>
                <Input
                  name='bom-add-role'
                  value={addRole}
                  autoComplete='off'
                  autoFocus
                  list='bom-add-role-suggestions'
                  placeholder={
                    addNeedsPurpose
                      ? defaultRoleForPurpose(addPurpose) ||
                        'необязательно — подставится назначение'
                      : 'основная молния / нитки верха / бейка…'
                  }
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddRole(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    // Same gate as the confirm button — on a fabric, Enter after the role is only
                    // half the answer, and committing on it would create exactly the unsorted line
                    // this modal exists to prevent.
                    if (e.key === 'Enter' && roleAnswered && addPurposeAnswered) {
                      e.preventDefault();
                      commitAdd();
                    }
                  }}
                />
                <datalist id='bom-add-role-suggestions'>
                  {roleSuggestions(addMaterial.section).map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Назначение — asked only for cloth, and required there. The role names this slot;
                the purpose names the SUBSET of the fabrics it belongs to, which is what makes
                «карманка», «контраст» and «сетка» tellable apart from «основная» at all — today
                they are all section=fabric and the free-text role is the only difference. */}
            {addKindEligible && (
              <div>
                <Text variant='label' size='micro' tracking='label' className='uppercase'>
                  вид
                </Text>
                <div className='mt-1'>
                  <Select
                    name='bom-add-kind'
                    items={addKindItems}
                    value={addKind === UNSET_KIND ? undefined : addKind}
                    placeholder='молния / кнопка / резинка…'
                    fullWidth
                    onValueChange={(v: string) => setAddKind(v)}
                  />
                </div>
              </div>
            )}
            {addNeedsPurpose && (
              <>
                <div>
                  <Text variant='label' size='micro' tracking='label' className='uppercase'>
                    назначение *
                  </Text>
                  <div className='mt-1'>
                    <Select
                      name='bom-add-purpose'
                      items={techCardBomPurposeOptions}
                      value={addPurpose === UNSET_PURPOSE ? undefined : addPurpose}
                      placeholder='выберите назначение'
                      fullWidth
                      onValueChange={(v: string) => setAddPurpose(v)}
                    />
                  </div>
                </div>
                {isOtherPurpose(addPurpose) && (
                  <div>
                    <Text variant='label' size='micro' tracking='label' className='uppercase'>
                      что это за назначение
                    </Text>
                    <div className='mt-1'>
                      <Input
                        name='bom-add-purpose-note'
                        value={addPurposeNote}
                        autoComplete='off'
                        maxLength={255}
                        placeholder='опишите роль этой ткани'
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setAddPurposeNote(e.target.value)
                        }
                      />
                    </div>
                  </div>
                )}
                <label className='flex cursor-pointer items-center gap-2'>
                  <CheckboxCommon
                    name='bom-add-sample'
                    checked={addSample}
                    onChange={(v: boolean) => setAddSample(v)}
                  />
                  <Text component='span' size='micro'>
                    семпловая — из этого метража шьётся семпл
                  </Text>
                </label>
              </>
            )}
            {addExistingSlotIdx >= 0 && (
              <Text variant='label' size='micro'>
                этот артикул уже стоит в слоте «
                {bomWatch[addExistingSlotIdx]?.name?.trim() || `слот ${addExistingSlotIdx + 1}`}» —
                новый слот нужен только для другой роли. Другой цвет/артикул в колорвее задаётся
                пином на вкладке colorways, не вторым слотом.
              </Text>
            )}
            {addCollision >= 0 && (
              <Text size='micro' variant='error'>
                роль «{addRole.trim()}» уже есть на этой карточке — одинаковые роли неразличимы в
                рецептах колорвеев и в плане закупки
              </Text>
            )}
          </div>
        </ConfirmationModal>
      )}
    </div>
  );
}
