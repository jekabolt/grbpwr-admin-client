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
} from 'components/managers/materials/components/material-code';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import {
  MaterialPickerDialog,
  useMaterialStockFacts,
} from 'components/managers/materials/components/material-picker';
import { MaterialThumb } from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { techCardBomSectionOptions, techCardFabricDirectionOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { HeaderWarnings } from 'ui/components/header-warnings';
import { Placeholder } from 'ui/components/placeholder';
import { HeaderNote } from 'ui/components/section-header';
import Text from 'ui/components/text';
import Tooltip from 'ui/components/tooltip';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { carriesGarmentComposition } from 'utils/care-label';
import { FIELD_REVEAL_EVENT, revealField, type FieldRevealDetail } from 'utils/field-errors';
import { sectionShort } from './bom-line-picker';
import {
  KIND_HOME_SECTION,
  UNSET_KIND,
  isKindEligibleSection,
  kindLabel,
  kindOptionsForSection,
  kindsForSection,
} from './bom-kind';
import {
  UNSET_PURPOSE,
  bomPurposeLabel,
  defaultRoleForPurpose,
  isOtherPurpose,
  isRollGoodsSection,
  purposeEditorOptions,
} from './bom-purpose';
import { resolveBomPrice } from './bom-price';
import { ResidueStrip, type ResidueErrorRow, type ResidueRow } from './residue-strip';
import { defaultRoleFor, normalizeRole, roleCollision, roleSuggestions } from './bom-roles';
import { bornBomLine, emptyBomItem } from './form-writers';
import {
  LABEL_PART_NAME,
  LABEL_PART_UNSPECIFIED,
  SELECTABLE_LABEL_PARTS,
  defaultLabelPart,
  labelPartFromWire,
  labelPartToWire,
} from '../care-labels/label-parts';
import { materialFabricWeight, materialFabricWidth } from './nesting/fabric-weight';
import { TechCardFormData, wireInt } from './schema';
import { useBomWarnings, type BomLineTone } from './use-bom-warnings';

// БОЛВАНКА НОВОЙ СТРОКИ ПЕРЕЕХАЛА В `form-writers.ts` (`emptyBomItem` + `bornBomLine`), И ЭТО
// ПЕРЕНОС, А НЕ ВТОРОЙ АДРЕС. У строки BOM появилось второе место рождения — принятое
// предложение черновика construction, — а BOM пишется upsert'ом полной заменой по `line_key`:
// ключ, который есть в одной болванке и забыт в другой, уезжает на сервер zod-дефолтом, то есть
// командой «очисти это». Здесь остался только вызов; `section` ниже по-прежнему читает её же.

// Fabric width/weight read from the typed CTI attrs, falling back to the legacy flat fields —
// shared by the link-time snapshot, the linked-line catalog plate AND the length→kg weight basis
// (nesting/fabric-weight.ts, where the pair now lives) so the three never drift apart.

// The catalog facts a BOM line snapshots off the article it links (S23: the line stays
// self-contained). ONE helper, so creating a line FROM the picker and linking an article onto an
// existing line can never disagree about what a linked line ends up carrying.
function materialLineFields(m: common_Material) {
  return {
    // NO `name` here — the line's name is the slot ROLE («main zipper»), owned by the operator
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

// АВТОЗАПОЛНЕНИЕ ПРИ ПРИВЯЗКЕ (tabs-lite AUTO #1): то, что артикул уже знает о себе, строка берёт
// сама, но ТОЛЬКО в пустые поля — значение, которое поставил человек, не перетирается никогда.
//   · направление ворса: у артикула поле другой оси (долевая: lengthwise / crosswise / any), и
//     про ворс говорит только `any` — «кладётся как угодно», то есть ANY строки. Остальные значения
//     о ворсе молчат и не переносятся;
//   · цвет и пантон артикула;
//   · семпл НЕ выводится (владелец 16.10: семплы — это колорвеи-семплы, не флаг строки BOM);
//   · вид (нерулонные секции): по словам имени артикула против подписей видов этой секции.
// Кромка (selvedgeCm) и коэффициент раскроя на строку не пишутся: первое — read-only обогащение
// чтения, второго у строки нет вовсе (сервер берёт его с артикула).
function materialAutoFields(m: common_Material, section: string) {
  const grain = (m.fabricAttrs?.fabricDirection ?? '').trim().toLowerCase();
  const name = (m.name ?? '').toLowerCase();
  const words = new Set(name.split(/[^a-z0-9]+/).filter(Boolean));
  // Самая длинная подпись вида, целиком встречающаяся в имени («cord stopper» сильнее «cord»).
  const kind = kindsForSection(section)
    .filter((k) => k !== 'TECH_CARD_BOM_KIND_OTHER')
    .map((k) => ({ k, label: (kindLabel(k) ?? '').toLowerCase() }))
    .filter(({ label }) => {
      const parts = label.split(/[^a-z0-9]+/).filter(Boolean);
      return parts.length > 0 && parts.every((w) => words.has(w) || words.has(`${w}s`));
    })
    .sort((a, b) => b.label.length - a.label.length)[0]?.k;
  return {
    fabricDirection:
      isRollGoodsSection(section) && grain === 'any' ? 'TECH_CARD_FABRIC_DIRECTION_ANY' : '',
    color: m.color?.trim() ?? '',
    pantone: m.pantone?.trim() ?? '',
    kind: kind ?? '',
  };
}

// Значения, которые на СУЩЕСТВУЮЩЕЙ строке значат «не задано». Флаг семпла (`isSample`) каталог
// больше не пишет вовсе: значение на строке лежит как лежало, экран BOM его не показывает.
const EMPTY_AUTO: Record<string, unknown> = {
  fabricDirection: 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN',
  kind: UNSET_KIND,
};

/** Кладёт автозаполнение в строку `index`, не трогая полей, где уже есть значение. */
function fillAutoFields(
  getValues: (path: never) => unknown,
  setValue: (path: never, value: never, opts: { shouldDirty: boolean }) => void,
  index: number,
  m: common_Material,
) {
  const section = (getValues(`bomItems.${index}.section` as never) as string) || m.section || '';
  Object.entries(materialAutoFields(m, section)).forEach(([field, val]) => {
    if (!val) return;
    const path = `bomItems.${index}.${field}` as never;
    const current = getValues(path);
    const empty =
      current === undefined ||
      current === null ||
      current === '' ||
      (field in EMPTY_AUTO && current === EMPTY_AUTO[field]);
    if (empty) setValue(path, val as never, { shouldDirty: true });
  });
}

// A price-less article zeroes the whole costing chain downstream (BOM estimate → style cost →
// COGS), so it is worth saying out loud — but it no longer REFUSES the link. Refusing left the line
// unlinked and unnamed, and a nameless line blocks the entire card's save with the offending field
// rendered nowhere. Warn, link, and let the BOM header's «no price» warning carry it from there. Only warnable when this user can SEE prices: latest_price is costing-gated,
// so for a non-costing account every article would look price-less.
function useNoPriceWarning() {
  const { canReadCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  return (m: common_Material) => {
    if (!canReadCosting || m.latestPrice?.price?.value) return;
    showMessage(`${m.name || 'this material'}: no purchase price, costing counts 0`, 'error');
  };
}

const join = (...parts: Array<string | undefined>) => parts.filter((p) => !!p?.trim()).join(' · ');
const widthLabel = (v?: string) => (v?.trim() ? `${v.trim()} cm` : '');
const weightLabel = (v?: string) => (v?.trim() ? `${v.trim()} g/m²` : '');

// ЧЕТЫРЕ ПОЛЯ ЛИЧНОСТИ СТРОКИ — ОДНА ТАБЛИЦА СОСТОЯНИЙ, ДВА ЧИТАТЕЛЯ.
//
// Строка таблицы отвечает сразу на два вопроса: рисовать ли контрол и стоять ли значению в полосе
// остатков. Второй ответ — ИНВЕРСИЯ первого, а не вторая таблица рядом с первой: две таблицы
// разъезжаются молча, и разъехавшись, дают ровно ту дыру, ради которой полоса и строится —
// заполненное, которого не видно нигде.
type BomIdentityField = {
  field: 'purpose' | 'purposeNote' | 'kind' | 'kindNote';
  // Подпись — ТА ЖЕ, что у контрола этого поля в его собственном блоке ниже.
  label: string;
  shown: boolean;
  filled: boolean;
  // Значение как его читает человек: токен уже разложен подписью своего словаря.
  text: string;
  // Чем стирает [clear]: у словарной оси — её собственный UNSET, у примечания — пустая строка.
  none: string;
};

// The slot's identity — its ROLE in the garment and its section — editable on EVERY line, linked
// or not. The role is the one field a linked line used to render nowhere, which made a wrong or
// article-borrowed role permanently uncorrectable. Section is editable on a linked line too: the
// article keeps its own catalog section on the plate, and a deliberate divergence (a jersey
// article serving a LINING slot) must be expressible.
export function SlotIdentityFields({ index }: { index: number }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as string | undefined;
  const rowPurpose = useWatch({ control, name: `bomItems.${index}.purpose` }) as string | undefined;
  const rowKind = useWatch({ control, name: `bomItems.${index}.kind` }) as string | undefined;
  const rowPurposeNote = useWatch({ control, name: `bomItems.${index}.purposeNote` }) as
    | string
    | undefined;
  const rowKindNote = useWatch({ control, name: `bomItems.${index}.kindNote` }) as
    | string
    | undefined;
  const rowLabelPart = useWatch({ control, name: `bomItems.${index}.labelPart` }) as
    | string
    | undefined;
  const rollGoods = isRollGoodsSection(rowSection);
  const kindEligible = isKindEligibleSection(rowSection);
  const kindItems = useMemo(() => kindOptionsForSection(rowSection), [rowSection]);

  // ЗДЕСЬ СТОЯЛИ ЧЕТЫРЕ ЭФФЕКТА ОЧИСТКИ, И ИХ БОЛЬШЕ НЕТ.
  //
  // Два писали UNSET в назначение и в вид с `shouldDirty: true`, ещё два — пустую строку в их
  // примечания с `shouldDirty: false`. Все четыре срабатывали на МОНТИРОВАНИИ: строка, ставшая
  // неконсистентной ПОСЛЕ сохранения (правила ужесточились, дом вида переехал новой волной, писал
  // чужой или старый бандл), теряла значение от одного открытия карточки — раньше, чем кто-нибудь
  // успевал его прочитать. Довод у них был верный («сервер отвергает такое напрямую»), а лечение
  // обратное: вместо того чтобы ПОКАЗАТЬ значение, они его СТИРАЛИ.
  //
  // ПАРА С `shouldDirty: false` БЫЛА ХУЖЕ ОСТАЛЬНЫХ ДВУХ. Форма не пачкалась, «unsaved changes» не
  // загоралось, предупреждения об уходе со страницы не было — а пустота уезжала со СЛЕДУЮЩИМ
  // сохранением по любому другому поводу. BOM пишется upsert'ом по `line_key`, то есть это был
  // UPDATE поверх сохранённого примечания, а не пропущенная вставка.
  //
  // ЧЕМ ЗАМЕНЕНО: предикаты остались (они и рисуют контролы), стирание переехало к человеку в
  // полосу остатков, а несовместимую пару называет по имени zod (`bomItemSchema.superRefine`) —
  // теми же словами, что и сервер, и ДО отправки. Тот же приём, которым фаза «перестать терять»
  // сняла четыре mount-эффекта на шаге операции.
  const purposeSet = !!rowPurpose && rowPurpose !== UNSET_PURPOSE;
  const kindSet = !!rowKind && rowKind !== UNSET_KIND;
  const purposeOwnsNote = isOtherPurpose(rowPurpose);
  const kindOwnsNote = rowKind === 'TECH_CARD_BOM_KIND_OTHER';
  const kindHome = kindSet ? KIND_HOME_SECTION[rowKind as common_TechCardBomKind] : undefined;

  const identityFields: BomIdentityField[] = [
    {
      field: 'purpose',
      label: 'purpose',
      shown: rollGoods,
      filled: purposeSet,
      text: bomPurposeLabel(rowPurpose),
      none: UNSET_PURPOSE,
    },
    {
      field: 'purposeNote',
      label: 'purpose note',
      shown: rollGoods && purposeOwnsNote,
      filled: !!rowPurposeNote?.trim(),
      text: rowPurposeNote?.trim() ?? '',
      none: '',
    },
    {
      field: 'kind',
      label: 'kind',
      shown: kindEligible,
      filled: kindSet,
      text: kindLabel(rowKind) ?? '',
      none: UNSET_KIND,
    },
    {
      field: 'kindNote',
      label: 'kind note',
      shown: kindEligible && kindOwnsNote,
      filled: !!rowKindNote?.trim(),
      text: rowKindNote?.trim() ?? '',
      none: '',
    },
  ];

  const { errors } = useFormState({ control, name: `bomItems.${index}` });
  const rowErrors = (errors.bomItems as FieldErrors[] | undefined)?.[index] as
    | Record<string, { message?: unknown }>
    | undefined;
  const errorAt = (field: string): string | undefined => {
    const message = rowErrors?.[field]?.message;
    return typeof message === 'string' ? message : rowErrors?.[field] ? '' : undefined;
  };

  const residueRows: ResidueRow[] = identityFields
    .filter((f) => f.filled && !f.shown)
    .map((f) => ({
      field: f.field,
      path: `bomItems.${index}.${f.field}`,
      label: f.label,
      value: f.text,
      error: errorAt(f.field),
    }));

  // ВТОРОЙ РОД СТРОК — ОТКАЗ БЕЗ ЗНАЧЕНИЯ И БЕЗ КОНТРОЛА. Сегодня ни одно из четырёх правил не
  // стреляет по пустому полю, так что строк этого рода на строке BOM пока не бывает. Они стоят
  // здесь не про запас, а потому что дыра, которую они закрывают, ОДНА И ТА ЖЕ: отказ на пути,
  // чей контрол не смонтирован, невидим — и карточка перестаёт сохраняться молча. Первое же
  // серверное правило, которое потребует ответа на пустом поле (как потребовал режим отстрочки на
  // шаге), окажется видимым без правки этого файла.
  const residueErrorRows: ResidueErrorRow[] = identityFields
    .filter((f) => !f.shown && errorAt(f.field) !== undefined)
    .filter((f) => !residueRows.some((r) => r.field === f.field))
    .map((f) => ({
      field: f.field,
      path: `bomItems.${index}.${f.field}`,
      label: f.label,
      error: errorAt(f.field) || 'this field was refused',
    }));

  // [CLEAR] — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ФОРМА СТИРАЕТ ЛИЧНОСТЬ СТРОКИ, и жест здесь человеческий.
  // Одна правка на нажатие: [clear] по назначению НЕ уносит с собой примечание — оно стоит
  // соседней строкой полосы и снимается своим собственным нажатием.
  const clearIdentityField = (field: string) => {
    const row = identityFields.find((f) => f.field === field);
    if (!row) return;
    setValue(`bomItems.${index}.${row.field}`, row.none, { shouldDirty: true });
  };

  // ЧУЖОЙ ВИД НА ЗАКОННОЙ СЕКЦИИ — случай, которого полоса НЕ ловит: контрол на экране есть,
  // а значения в его списке нет (вид живёт в одной домашней секции, список секции — только её
  // виды). Radix рисует над непустым значением ПУСТОЙ триггер: экран говорит «не задано» там, где
  // форма держит `zipper`, и первый же выбор молча затирает его. Значение дописывается в список
  // ОТКЛЮЧЁННЫМ пунктом: триггер называет его вслух, выбрать заново нельзя, а отказ zod ложится
  // тут же под селектом. В полосу такая строка не попадает — иначе значение стояло бы в двух
  // местах, и одно из них врало бы.
  const foreignKind = kindSet && kindEligible && !kindItems.some((i) => i.value === rowKind);
  // Пункт чужого вида говорит ПРАВДУ О ПРИЧИНЕ, и причин две, а не одна. Дом известен → «belongs
  // to …» (строку перевезли через секции). Дом НЕизвестен → токен новее этой сборки (писал более
  // новый бандл), и «belongs to another section» здесь было бы враньём: вид, возможно, живёт ровно
  // в ЭТОЙ секции, просто словарь бандла его ещё не знает. Разные причины — разные действия
  // человека (вернуть секцию vs обновить вкладку), поэтому подпись обязана их различать.
  const foreignKindReason = kindHome
    ? `belongs to ${sectionShort(kindHome) || 'another section'}`
    : 'unknown to this app version';
  // ТА ЖЕ ЛОЖЬ ЭКРАНА НА ОСИ НАЗНАЧЕНИЯ. У назначения нет домашней секции (любое законно на любой
  // рулонной), поэтому «чужим» оно бывает единственным способом — токеном новее этой сборки. Без
  // этого пункта Radix рисует над непустым значением пустой триггер, и первый же выбор молча
  // затирает то, что записал более новый бандл.
  const foreignPurpose =
    purposeSet && rollGoods && !purposeEditorOptions.some((o) => o.value === rowPurpose);

  // ЧАСТЬ СОСТАВНИКА (care labels, план §3.4/§5.2). «Авто» — не пустота, а ответ: пункт называет
  // ту часть, которую напечатает лента, считая ТЕМ ЖЕ `defaultLabelPart`, что и резолвер. Секция и
  // назначение читаются здесь же через useWatch, так что смена назначения переписывает подпись
  // сразу, без сохранения. Контрол на любой секции: часть — свойство ленты, а не геометрии, и
  // кожаная отделка (TRIM) ставится на ленту только явным выбором.
  const autoLabelPart = `auto → ${LABEL_PART_NAME[defaultLabelPart(rowSection, rowPurpose)]}`;
  // Токен новее этой сборки: Radix нарисовал бы над ним пустой триггер, и первый выбор затёр бы
  // то, что записал более новый бандл, — тот же приём, что у назначения и вида выше.
  const foreignLabelPart =
    !!rowLabelPart &&
    rowLabelPart !== LABEL_PART_UNSPECIFIED &&
    labelPartFromWire(rowLabelPart) === undefined;

  // ОДИН РЯД РАВНЫХ КОРОБОК (владелец: ряд полей ввода = один размер плиток). Сетка переносит
  // коробки по ширине панели, но каждая ячейка одна и та же: селект, комбо и примечание одного
  // роста и одной ширины. Направление ворса стоит не здесь, а в редакторе строки: это решение
  // человека, а не автозаполненная личность слота.
  return (
    <div className='flex flex-col gap-3'>
      <div className={BOX_GRID}>
        <ComboField
          name={`bomItems.${index}.name`}
          label='role'
          options={roleSuggestions(rowSection)}
          placeholder={defaultRoleFor(rowSection) || 'role'}
        />
        <SelectField
          name={`bomItems.${index}.section`}
          label='section'
          items={techCardBomSectionOptions}
        />
        {rollGoods && (
          <SelectField
            name={`bomItems.${index}.purpose`}
            label='purpose'
            items={[
              ...purposeEditorOptions,
              ...(foreignPurpose
                ? [
                    {
                      value: rowPurpose as string,
                      label: `${bomPurposeLabel(rowPurpose)} (unknown to this app version)`,
                      disabled: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
        {rollGoods && purposeOwnsNote && (
          <InputField name={`bomItems.${index}.purposeNote`} label='purpose note' maxLength={255} />
        )}
        {kindEligible && (
          <SelectField
            name={`bomItems.${index}.kind`}
            label='kind'
            items={[
              { value: UNSET_KIND, label: 'unset' },
              ...kindItems,
              ...(foreignKind
                ? [
                    {
                      value: rowKind as string,
                      label: `${kindLabel(rowKind) ?? rowKind} (${foreignKindReason})`,
                      disabled: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
        {kindEligible && kindOwnsNote && (
          <InputField name={`bomItems.${index}.kindNote`} label='kind note' maxLength={255} />
        )}
        <SelectField
          name={`bomItems.${index}.labelPart`}
          label='care label part'
          // Строка без ключа (черновик старого бандла, новая строка) — то же «авто», словами.
          placeholder={autoLabelPart}
          items={[
            { value: LABEL_PART_UNSPECIFIED, label: autoLabelPart },
            ...SELECTABLE_LABEL_PARTS.map((p) => ({
              value: labelPartToWire(p),
              label: LABEL_PART_NAME[p],
            })),
            ...(foreignLabelPart
              ? [
                  {
                    value: rowLabelPart as string,
                    label: `${rowLabelPart} (unknown to this app version)`,
                    disabled: true,
                  },
                ]
              : []),
          ]}
        />
      </div>
      {/* ПОЛОСА ОСТАТКОВ — сразу под рядом: значение, у которого на этой секции нет контрола. */}
      <ResidueStrip
        rows={residueRows}
        errorRows={residueErrorRows}
        caption='saved, no control here'
        onClear={clearIdentityField}
      />
    </div>
  );
}

// Сетка равных коробок редактора: шесть в ряд на широком экране, ширина ячейки одна.
const BOX_GRID = 'grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-6';

// Поля личности строки: дверь к любому из них раскрывает коробки вместо тихой строки.
const IDENTITY_FIELDS = new Set([
  'name',
  'section',
  'purpose',
  'purposeNote',
  'kind',
  'kindNote',
  'labelPart',
]);

/**
 * Личность слота одной тихой строкой: роль · секция · назначение (или вид) · часть составника.
 * Всё это заполняется само; правят по `edit`, который ставит на место строки равные коробки.
 */
function IdentitySummary({ index }: { index: number }) {
  const { control } = useFormContext<TechCardFormData>();
  const line = (useWatch({ control, name: `bomItems.${index}` }) ?? {}) as {
    name?: string;
    section?: string;
    purpose?: string;
    purposeNote?: string;
    kind?: string;
    kindNote?: string;
    labelPart?: string;
  };
  const roll = isRollGoodsSection(line.section);
  const purposeSet = !!line.purpose && line.purpose !== UNSET_PURPOSE;
  const kindSet = !!line.kind && line.kind !== UNSET_KIND;
  const part =
    line.labelPart && line.labelPart !== LABEL_PART_UNSPECIFIED
      ? (() => {
          const p = labelPartFromWire(line.labelPart);
          return p ? LABEL_PART_NAME[p] : line.labelPart;
        })()
      : LABEL_PART_NAME[defaultLabelPart(line.section, line.purpose)];
  const text = join(
    line.name?.trim() || 'no role',
    sectionShort(line.section) || 'other',
    roll ? (purposeSet ? bomPurposeLabel(line.purpose) : 'no purpose') : undefined,
    roll ? line.purposeNote : undefined,
    !roll && kindSet ? kindLabel(line.kind) : undefined,
    !roll ? line.kindNote : undefined,
    part,
  );
  return (
    <Text component='span' size='micro' variant='label' className='min-w-0 truncate'>
      {text}
    </Text>
  );
}

// A colourway whose recipe still cuts the article the operator is trying to delete. The server
// refuses that delete; this is what the refusal is turned into on the way in.
type BlockingUser = { colorwayId: number; sku: string };

// Дверь-ссылка: подчёркнутое слово, а не кнопка в рамке (owner: «underline doors»).
const DOOR =
  'text-micro text-labelColor underline underline-offset-2 hover:text-textColor disabled:no-underline disabled:text-textInactiveColor';

/**
 * Дверь, которая только СМОТРИТ (открыть строку, рецепт, закрыть разворот): span role=button, а не
 * <button> — на выпущенной карточке всё лежит в <fieldset disabled>, а смотреть надо и там.
 * Двери, которые ПИШУТ (change, unlink, remove, + секция), остаются настоящими <button>: fieldset
 * гасит их сам — так замороженная карточка и устроена.
 */
function ViewDoor({
  onActivate,
  className,
  children,
  label,
  expanded,
}: {
  onActivate: () => void;
  className?: string;
  children?: ReactNode;
  label?: string;
  expanded?: boolean;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      aria-label={label}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onActivate();
        }
      }}
      className={cn('cursor-pointer', className)}
    >
      {children}
    </span>
  );
}

// РЕДАКТОР СТРОКИ — РАЗВОРОТ ПОД ЕЁ СТРОКОЙ (BOM-LITE, владелец 16.10 «complicated af»). Только то,
// что решает человек: артикул (`change` `unlink` `open`), направление ворса у полотна, комментарий
// одной растущей строкой. Автозаполненная личность слота — одна тихая строка с `edit`. Ни модалки,
// ни вложенных коробок; поля пишут прямо в форму карточки, сохраняет её общая кнопка.
//
// Надбавки раскроя здесь НЕТ (владелец: она своя у каждого кроя и задаётся в раскладке). Значение
// на строке не трогается: форма отправляет то, что лежало, просто без контрола. Так же и флаг
// семпла: семплы — колорвеи-семплы, строка BOM его не показывает и не пишет.
function BomLineEditor({
  index,
  highlight,
  blockedBy,
  identityOpen,
  onToggleIdentity,
  onClose,
  onRemove,
  onGoToColorway,
}: {
  index: number;
  highlight?: boolean;
  /** Колорвеи, чьи рецепты держат эту строку: удаление отказано, список стоит прямо здесь. */
  blockedBy?: BlockingUser[];
  /** Коробки личности вместо тихой строки (`edit`, или дверь пришла к полю личности). */
  identityOpen: boolean;
  onToggleIdentity: () => void;
  onClose: () => void;
  onRemove: () => void;
  onGoToColorway: (colorwayId: number) => void;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const warnNoPrice = useNoPriceWarning();
  const { canReadCosting } = usePermissions();
  const materialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as
    | common_TechCardBomSection
    | undefined;
  // Подписка на всю строку: строка артикула читает её поля через getValues.
  useWatch({ control, name: `bomItems.${index}` });
  const [createOpen, setCreateOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);

  // Отказ схемы по полю личности держит коробки открытыми: тихая строка спрятала бы его контрол.
  const { errors } = useFormState({ control, name: `bomItems.${index}` });
  const rowErrors = (errors.bomItems as FieldErrors[] | undefined)?.[index] as
    | Record<string, unknown>
    | undefined;
  const identityError = !!rowErrors && Object.keys(rowErrors).some((f) => IDENTITY_FIELDS.has(f));
  const showBoxes = identityOpen || identityError;

  const linked = materialId > 0;
  const rollGoods = isRollGoodsSection(rowSection);
  // ВКЛЮЧАЯ АРХИВНЫЕ — по списку ищут УЖЕ привязанный артикул (иначе архивный терял цену).
  const { data } = useMaterials('', true);
  const material = linked
    ? (data?.materials ?? []).find((m) => wireInt(m.id) === materialId)
    : undefined;

  // Snapshot a catalog material's meta onto this line (S23: the line stays self-contained).
  const snapshotFrom = (m: common_Material) => {
    // Material.id is int64 -> arrives as a STRING from grpc-gateway; z.number() would refuse it.
    setValue(`bomItems.${index}.materialId`, wireInt(m.id), { shouldDirty: true });
    Object.entries(materialLineFields(m)).forEach(([field, val]) => {
      // Only non-empty values are written: linking never CLEARS what the line already holds.
      if (!val) return;
      setValue(`bomItems.${index}.${field}` as never, val as never, { shouldDirty: true });
    });
    fillAutoFields(getValues as never, setValue as never, index, m);
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

  // Цена — та ступень лестницы (bom-price.ts), по которой строка реально считается, и её источник.
  const linePrice = resolveBomPrice(
    { unitPrice: rowValue('unitPrice'), currency: rowValue('currency'), unit: rowValue('unit') },
    material,
  );

  // Якорь `#bom-composition-{index}`: вкладка labels ведёт сюда за пустым составом.
  const composition = (
    <span
      id={`bom-composition-${index}`}
      className={cn(
        'min-w-0 truncate',
        highlight && 'animate-pulse ring-2 ring-warning motion-reduce:animate-none',
      )}
    >
      {(material ? materialCompositionText(material) : '') || 'composition not set'}
    </span>
  );

  // Имя, плотность, ширина и склад уже стоят в строке над разворотом — здесь только то, чего там
  // нет: код артикула, состав и откуда взята цена.
  const code = material ? composeArticleFromMaterial(material, true) : `article #${materialId}`;
  // Непривязанная строка старого образца: то, что на ней набрали руками, одной серой строкой (B5).
  const legacyLine = linked
    ? ''
    : join(
        rowValue('supplier'),
        rowValue('supplierRef'),
        rowValue('color'),
        rowValue('spec'),
        widthLabel(rowValue('fabricWidth')),
        weightLabel(rowValue('fabricWeightGsm')),
        rowValue('unit'),
        canReadCosting ? linePrice.label : '',
      );

  return (
    <div className='flex min-w-0 flex-col gap-3 py-3'>
      {/* (личность) тихая строка ↔ равные коробки, на одном и том же месте */}
      <div className='flex min-w-0 items-start gap-3'>
        <div className='flex min-w-0 flex-1 items-center'>
          {showBoxes ? <SlotIdentityFields index={index} /> : <IdentitySummary index={index} />}
        </div>
        {!identityError && (
          <ViewDoor onActivate={onToggleIdentity} className={DOOR}>
            {showBoxes ? 'done' : 'edit'}
          </ViewDoor>
        )}
        <ViewDoor onActivate={onClose} label='close' className='px-1 text-micro text-textColor'>
          ✕
        </ViewDoor>
      </div>

      {/* (a) артикул */}
      <div
        data-field={`bomItems.${index}.materialId`}
        className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-micro'
      >
        {linked ? (
          <>
            <Text component='span' size='micro' className='min-w-0 truncate'>
              {code}
            </Text>
            <Text component='span' size='micro' variant='label' className='flex min-w-0'>
              {composition}
            </Text>
            {canReadCosting && linePrice.label ? (
              <Text component='span' size='micro' variant='label'>
                {linePrice.source === 'line' ? 'card price' : 'catalog price'}
              </Text>
            ) : null}
            <span className='flex items-center gap-3'>
              <Link to={`${ROUTES.materials}?tab=catalog&material=${materialId}`} className={DOOR}>
                open
              </Link>
              <button type='button' className={DOOR} onClick={() => setChangeOpen(true)}>
                change
              </button>
              <button type='button' className={DOOR} onClick={() => pick(0)}>
                unlink
              </button>
            </span>
          </>
        ) : (
          <>
            <button type='button' className={DOOR} onClick={() => setChangeOpen(true)}>
              link article
            </button>
            {legacyLine ? (
              <Text component='span' size='micro' variant='label' className='min-w-0 truncate'>
                {legacyLine}
              </Text>
            ) : null}
          </>
        )}
      </div>

      {/* (b) направление ворса — только у полотна. Комментария строки здесь нет (владелец 16.10:
          «no comment needed»): значение на строке не трогается, форма отправляет то, что лежало. */}
      {rollGoods && (
        <div className={BOX_GRID}>
          <SelectField
            name={`bomItems.${index}.fabricDirection`}
            label='fabric direction'
            items={techCardFabricDirectionOptions}
          />
        </div>
      )}

      <div className='flex flex-col gap-1'>
        <button type='button' className={cn(DOOR, 'self-start')} onClick={onRemove}>
          remove
        </button>
        {/* Удаление отказано: рецепты колорвеев держат строку. Каждая строка — дверь в рецепт. */}
        {blockedBy && blockedBy.length > 0 && (
          <div className='flex max-w-[420px] flex-col'>
            <Text size='micro' variant='error'>
              used in colourway recipes
            </Text>
            {blockedBy.map((u) => (
              <button
                key={u.colorwayId}
                type='button'
                onClick={() => onGoToColorway(u.colorwayId)}
                className='flex items-center gap-2 border-b border-hairline py-1 text-left last:border-b-0 hover:bg-bgZebra'
              >
                <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                  open {u.sku}
                </Text>
                <Text size='micro' variant='label' component='span' className='shrink-0 underline'>
                  → colorways
                </Text>
              </button>
            ))}
          </div>
        )}
      </div>

      {changeOpen && (
        <MaterialPickerDialog
          open
          initialSection={rowSection ?? ''}
          value={materialId}
          clearable={false}
          title={linked ? 'change article' : 'link article'}
          confirmLabel='link'
          onPick={(m) => {
            if (m && wireInt(m.id)) pick(wireInt(m.id), m);
            setChangeOpen(false);
          }}
          onClose={() => setChangeOpen(false)}
          onCreate={() => {
            setChangeOpen(false);
            setCreateOpen(true);
          }}
        />
      )}
      {/* Inline create — prefill the section from this line; auto-link on create (Q9a). */}
      <MaterialModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultSection={rowSection}
        onCreated={(_id, m) => snapshotFrom(m)}
      />
    </div>
  );
}

// ── СПИСОК: одна строка на слот, группы по секциям. Колорвеев здесь нет (владелец 16.10: у них
// своя вкладка); рецепты колорвеев видны только там, где они держат удаление строки. ──────────

// Столбцы строки: свотч · роль · артикул · плотность · ширина · цена · склад.
const LEAD_COLS = 7;

type MatrixLine = {
  id?: number | string;
  lineKey?: string;
  name?: string;
  section?: string;
  purpose?: string;
  kind?: string;
  materialId?: number;
  composition?: string;
  unitPrice?: string;
  currency?: string;
  unit?: string;
  fabricWidth?: string;
  fabricWeightGsm?: string;
};

// Порядок секций — порядок селекта секции, «other» и незнакомые — в хвосте.
const SECTION_ORDER = techCardBomSectionOptions.map((o) => o.value as string);

function groupBySection(lines: MatrixLine[]): Array<{ section: string; indices: number[] }> {
  const by = new Map<string, number[]>();
  lines.forEach((l, i) => {
    const s = l.section || 'TECH_CARD_BOM_SECTION_OTHER';
    by.set(s, [...(by.get(s) ?? []), i]);
  });
  const keys = [
    ...SECTION_ORDER.filter((s) => by.has(s)),
    ...[...by.keys()].filter((s) => !SECTION_ORDER.includes(s)).sort(),
  ];
  return keys.map((section) => ({ section, indices: by.get(section)! }));
}

// Назначение новой рулонной строки: первая ткань = основная (владелец), у подкладочных секций их
// естественное назначение; остальное ждёт ответа в редакторе.
function defaultPurposeFor(section: string, hasMain: boolean): string {
  switch (section) {
    case 'TECH_CARD_BOM_SECTION_FABRIC':
      return hasMain ? UNSET_PURPOSE : 'TECH_CARD_BOM_PURPOSE_MAIN';
    case 'TECH_CARD_BOM_SECTION_LINING':
      return 'TECH_CARD_BOM_PURPOSE_LINING';
    case 'TECH_CARD_BOM_SECTION_INTERLINING':
      return 'TECH_CARD_BOM_PURPOSE_INTERFACING';
    case 'TECH_CARD_BOM_SECTION_INSULATION':
      return 'TECH_CARD_BOM_PURPOSE_INSULATION';
    default:
      return UNSET_PURPOSE;
  }
}

// Роль без повтора: «lining», затем «lining 2», «lining 3» — одинаковые роли неразличимы в
// рецептах и в плане закупки.
function uniqueRole(base: string, lines: Array<{ name?: string }>): string {
  if (!base) return '';
  if (roleCollision(lines, base) < 0) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} ${n}`;
    if (roleCollision(lines, candidate) < 0) return candidate;
  }
  return '';
}

// Назначение (или вид) рядом с ролью — только когда оно что-то добавляет: «main fabric» уже
// говорит «main material», «lining 2» уже говорит «lining».
function extraOfRole(role: string, extra: string): string {
  const e = normalizeRole(extra);
  if (!e) return '';
  const r = normalizeRole(role);
  const words = new Set(r.split(/\s+/));
  if (r.includes(e) || e.split(/\s+/).every((w) => words.has(w))) return '';
  if (e.split(/\s+/).some((w) => w.length > 3 && r.includes(w))) return '';
  return extra;
}

// Bill of materials = catalog of all material articles used by this style, read as a list of
// slots grouped by section. The recipe itself (which article on which part, consumption) is edited
// per colourway on the colorways tab; this list links there only from a refused remove.
export function BomField({
  highlightComposition = 0,
  colorways,
  markers,
  headerEl,
  canEdit = true,
}: {
  highlightComposition?: number;
  /**
   * The style's colourways as READ (techCard.colorways) — NOT the RHF `colorways` array, which is
   * permanently empty since colourways stopped being style-owned. Their recipes are the one class
   * of reference to a BOM article this form cannot clear on its own (the refused-remove block).
   */
  colorways?: common_AdminColorwayRef[];
  /** Карточные раскладки как READ — «норма не снята с раскладки» в шапке. */
  markers?: common_TechCardMarkerSummary[];
  /** Слот в шапке секции: сюда порталятся HeaderNote и HeaderWarnings (как у PATTERNS). */
  headerEl?: HTMLElement | null;
  /**
   * Не используется: дверь `+ colourway` ушла из BOM вместе со столбцами колорвеев. Проп оставлен,
   * чтобы не трогать вызывающий экран (index.tsx) в этой правке.
   */
  techCardId?: number;
  /** Карточка не выпущена и право есть: двери `+ section`, `link article`. */
  canEdit?: boolean;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const warnNoPrice = useNoPriceWarning();
  const { canReadCosting } = usePermissions();
  const [params, setParams] = useSearchParams();
  const { fields, append, remove } = useFieldArray({ control, name: 'bomItems' });
  const bomWatch = (useWatch({ control, name: 'bomItems' }) ?? []) as MatrixLine[];
  // Positions, never reordered rows: every cell, editor and delete addresses a line by its index in
  // the field array. Length comes from `fields` — the watch settles a render later after append.
  const lines = fields.map((_, i) => bomWatch[i] ?? {});
  const groups = groupBySection(lines);
  const { data: materialsData } = useMaterials('', true);
  const materials = useMemo(() => materialsData?.materials ?? [], [materialsData]);
  const materialById = (id: number) =>
    id > 0 ? materials.find((m) => wireInt(m.id) === id) : undefined;
  const stockFacts = useMaterialStockFacts(fields.length > 0);

  // The line whose editor is open under its row. ONE editor for the whole list, keyed by index.
  const [selected, setSelected] = useState<number | null>(null);
  // Строка, у которой личность раскрыта коробками (`edit` или дверь к полю личности).
  const [identityFor, setIdentityFor] = useState<number | null>(null);
  const [highlightActive, setHighlightActive] = useState(false);
  const [blocked, setBlocked] = useState<{ index: number; users: BlockingUser[] } | null>(null);
  // Пикер каталога: новая строка в секции (`section`) или артикул для пустой строки (`line`).
  const [picking, setPicking] = useState<{ section: string; line?: number } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const createTarget = useRef<{ section: string; line?: number } | null>(null);
  // Поле, которое надо сфокусировать, как только редактор строки смонтируется (дверь B7).
  const focusPath = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const fieldCount = useRef(fields.length);
  fieldCount.current = fields.length;

  const openLine = (index: number, field?: string) => {
    setSelected(index);
    if (!field) return;
    if (IDENTITY_FIELDS.has(field)) setIdentityFor(index);
    const path = `bomItems.${index}.${field}`;
    focusPath.current = path;
    setFocusTick((t) => t + 1);
    requestAnimationFrame(() => revealField(path));
  };

  // Отказ удаления и раскрытая личность относятся к ОДНОЙ строке: уход с неё их снимает.
  useEffect(() => {
    setBlocked((b) => (b && b.index !== selected ? null : b));
    setIdentityFor((f) => (f !== null && f !== selected ? null : f));
  }, [selected]);

  // ДВЕРЬ К ПОЛЮ СТРОКИ (B7). Поля строки живут только в развороте выбранной строки, так что
  // `revealField('bomItems.N.x')` без этого слушателя не находил ничего. Просьбу забираем
  // (`preventDefault` = «я покажу»), открываем строку N (и её коробки, если поле — личность),
  // фокус ставит эффект ниже. Слушатель на document: якоря нет в DOM вовсе, и событие идёт туда.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const path = (e as CustomEvent<FieldRevealDetail>).detail?.path ?? '';
      const m = /^bomItems\.(\d+)\.(.+)$/.exec(path);
      if (!m) return;
      const index = Number(m[1]);
      if (index >= fieldCount.current) return;
      e.preventDefault();
      focusPath.current = path;
      setSelected(index);
      if (IDENTITY_FIELDS.has(m[2].split('.')[0])) setIdentityFor(index);
      setFocusTick((t) => t + 1);
    };
    document.addEventListener(FIELD_REVEAL_EVENT, onAsk);
    return () => document.removeEventListener(FIELD_REVEAL_EVENT, onAsk);
  }, []);

  // Кадры, а не миллисекунды: ждём коммита разворота (и смены вкладки, если дверь пришла из
  // маркера). Radix-селект фокусируется своим триггером — это button внутри data-field.
  useEffect(() => {
    if (!focusPath.current) return undefined;
    let left = 90;
    let raf = 0;
    const tick = () => {
      const path = focusPath.current;
      if (!path) return;
      const host = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(path)}"]`);
      if (host && host.getClientRects().length > 0) {
        focusPath.current = null;
        const target = host.matches('input,textarea,button,select')
          ? host
          : host.querySelector<HTMLElement>(
              'input:not([type=hidden]),textarea,button,select,[tabindex]',
            );
        target?.focus({ preventScroll: true });
        return;
      }
      if (--left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focusTick]);

  // When the labels tab asks for composition (care-gen with empty composition), jump here: open the
  // first GARMENT article missing composition (D-44 / D-50) and pulse it; never a blind row 0.
  useEffect(() => {
    if (!highlightComposition || !bomWatch.length) return;
    const garment = bomWatch.flatMap((b, i) => (carriesGarmentComposition(b) ? [i] : []));
    const target = garment.find((i) => !bomWatch[i].composition?.trim()) ?? garment[0];
    if (target === undefined) return;
    setSelected(target);
    setHighlightActive(true);
    const t = setTimeout(() => setHighlightActive(false), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightComposition]);

  // ?bom=<line_key> selects ONE line on arrival (the направление-ткани worklist, run readiness).
  // Gated on ?tab=bom (panels stay mounted behind the active tab), consumed rather than kept, and
  // waits for the field array to be seeded.
  const deepLinkedLine = params.get('bom');
  const onBomTab = params.get('tab') === 'bom';
  useEffect(() => {
    if (!deepLinkedLine || !onBomTab || fields.length === 0) return;
    const key = deepLinkedLine.trim();
    const index = fields.findIndex(
      (_, i) => ((getValues(`bomItems.${i}.lineKey`) as string) ?? '').trim() === key,
    );
    if (index >= 0) setSelected(index);
    const next = new URLSearchParams(params);
    next.delete('bom');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedLine, onBomTab, fields.length]);

  useEffect(() => {
    if (!highlightActive || selected === null) return;
    const t = setTimeout(() => {
      document
        .getElementById(`bom-composition-${selected}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => clearTimeout(t);
  }, [highlightActive, selected]);

  // Which colourways cut a given article — matched on bom_item_id, line_key only as a fallback (the
  // read does not emit bom_line_key on a usage). A never-saved article has id 0.
  const usagesOf = (c: common_AdminColorwayRef, line: MatrixLine) => {
    const id = wireInt(line.id);
    return (c.usages ?? []).filter(
      (u) =>
        (id > 0 && wireInt(u.bomItemId) === id) ||
        (!!line.lineKey && u.bomLineKey === line.lineKey),
    );
  };
  const colorwayUsers = (lineKey: string, bomItemId: number): BlockingUser[] =>
    (colorways ?? [])
      .filter((c) => usagesOf(c, { id: bomItemId, lineKey }).length > 0)
      .map((c) => ({
        colorwayId: c.colorwayId ?? 0,
        sku: c.baseSku?.trim() || c.colorCode?.trim() || `#${c.colorwayId ?? 0}`,
      }));

  // Рецепт колорвея — на вкладке колорвеев; ?colorway= выбирает его карточку. Форма не теряется:
  // вкладки живут внутри одной формы, меняется только параметр в URL.
  const openRecipe = (colorwayId?: number) => {
    const next = new URLSearchParams(params);
    next.set('tab', 'colorways');
    if (colorwayId) next.set('colorway', String(colorwayId));
    setParams(next, { replace: true });
  };

  const goToColorway = (colorwayId: number) => {
    setBlocked(null);
    openRecipe(colorwayId);
    showMessage('remove this article from the colourway recipe and save it', 'success');
  };

  // Stable line_key (§2.3): downstream refs point at the article's key, not its position — so
  // removing an article NEVER renumbers anything. We only clear refs that pointed AT the removed
  // article (its key is gone); refs to other articles are untouched.
  const removeArticle = (bi: number) => {
    const removedKey = (getValues(`bomItems.${bi}.lineKey`) as string) || '';
    // Colourway recipes are the one referrer this form does not own, so they are the one thing
    // that can block — refused here, shown inline in the editor, not as a server wall of text.
    const users = colorwayUsers(removedKey, wireInt(getValues(`bomItems.${bi}.id`)));
    if (users.length > 0) {
      setBlocked({ index: bi, users });
      return;
    }
    if (removedKey) {
      const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
      (operations ?? []).forEach((o, oi) => {
        // The LIST is the reference: `operations.N.bomLineKey` is vestigial (the write derives it
        // back from bomLineKeys[0]), so clearing only the singular shipped the removed key anyway.
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
      // Labels reference a BOM line by resolved ID, and no screen renders that link: an invisible
      // referrer has to be released here, or the save fails with a bare FK error.
      const removedId = wireInt(getValues(`bomItems.${bi}.id`));
      if (removedId > 0) {
        const labels = (getValues('labels') ?? []) as Array<{ bomItemId?: number }>;
        labels.forEach((l, li) => {
          if (wireInt(l.bomItemId) === removedId) {
            setValue(`labels.${li}.bomItemId`, 0, { shouldDirty: true });
          }
        });
      }
    }
    // Indices shift under an open editor once a row above it is gone; close it rather than let it
    // repoint at whatever slid into that slot.
    setSelected(null);
    setBlocked(null);
    remove(bi);
  };

  // Привязать артикул к УЖЕ существующей строке (дверь `link article`).
  const linkLine = (index: number, m: common_Material) => {
    setValue(`bomItems.${index}.materialId`, wireInt(m.id), { shouldDirty: true });
    Object.entries(materialLineFields(m)).forEach(([field, val]) => {
      if (!val) return;
      setValue(`bomItems.${index}.${field}` as never, val as never, { shouldDirty: true });
    });
    fillAutoFields(getValues as never, setValue as never, index, m);
    warnNoPrice(m);
  };

  // ДОБАВЛЕНИЕ = ОДИН ВЫБОР (B3, уроки L3/L4/L5). Дверь `+ section` уже знает секцию, пикер
  // отфильтрован по ней; выбор артикула сразу рождает строку и открывает её редактор. Роль и
  // назначение выводятся сами (первая ткань = основная, роль из назначения или секции, с номером
  // при совпадении) и правятся в редакторе; ни одного промежуточного окна.
  const commitPick = (m: common_Material, target: { section: string; line?: number } | null) => {
    const materialId = wireInt(m.id);
    if (!materialId) return;
    if (target?.line !== undefined) {
      linkLine(target.line, m);
      setSelected(target.line);
      return;
    }
    const section = m.section || target?.section || emptyBomItem.section;
    const roll = isRollGoodsSection(section);
    const hasMain = bomWatch.some((b) => b.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN');
    const purpose = roll ? defaultPurposeFor(section, hasMain) : UNSET_PURPOSE;
    const base =
      (roll && purpose !== UNSET_PURPOSE ? defaultRoleForPurpose(purpose) : '') ||
      defaultRoleFor(section);
    const auto = materialAutoFields(m, section);
    const next = fields.length;
    // `bornBomLine` — тот же конструктор, которым рождается строка из черновика construction.
    // Флаг семпла не передаётся: строка рождается с болванкой, каталог его не решает.
    append(
      bornBomLine({
        ...materialLineFields(m),
        name: uniqueRole(base, bomWatch),
        purpose,
        purposeNote: '',
        kind: auto.kind || UNSET_KIND,
        color: auto.color,
        pantone: auto.pantone,
        fabricDirection: auto.fabricDirection || emptyBomItem.fabricDirection,
        materialId,
      }) as never,
    );
    warnNoPrice(m);
    setSelected(next);
  };

  const { items: warnings, tones } = useBomWarnings({
    colorways,
    markers,
    canEdit,
    onOpenLine: openLine,
    onOpenColorways: () => openRecipe(),
  });

  const presentSections = new Set(lines.map((l) => l.section));
  const emptySections = techCardBomSectionOptions.filter((o) => !presentSections.has(o.value));
  const spanAll = { gridColumn: '1 / -1' };

  const header = (
    <>
      {fields.length > 0 && <HeaderNote>articles {fields.length}</HeaderNote>}
      <HeaderWarnings items={warnings} />
      {/* ГЛАВНАЯ ДВЕРЬ ДОБАВЛЕНИЯ (владелец 16.10: «forgot a button for creating a slot»). Пикер со
          ВСЕМИ секциями, без пресета: строка рождается в секции артикула, роль и назначение — как у
          `+ секция`. На пустом BOM — главная кнопка, на полном — вторичная. Выпущенная карточка и
          нет права — кнопки нет. */}
      {canEdit && (
        <Button
          type='button'
          variant={fields.length === 0 ? 'main' : 'secondary'}
          size='sm'
          className='ml-auto shrink-0'
          onClick={() => setPicking({ section: '' })}
        >
          + slot
        </Button>
      )}
    </>
  );

  const roleLabel = (l: MatrixLine, i: number) => {
    const m = materialById(wireInt(l.materialId));
    return l.name?.trim() || m?.name?.trim() || `line ${i + 1}`;
  };
  // Назначение у полотна, вид у остального — рядом с ролью, только если оно новое.
  const roleExtra = (l: MatrixLine, role: string) => {
    if (isRollGoodsSection(l.section)) {
      return l.purpose && l.purpose !== UNSET_PURPOSE
        ? extraOfRole(role, bomPurposeLabel(l.purpose))
        : '';
    }
    return extraOfRole(role, kindLabel(l.kind) ?? '');
  };

  const toggle = (i: number) => setSelected(selected === i ? null : i);

  const factText = (v: string) => (
    <Text component='span' size='micro' variant='label' className='whitespace-nowrap tabular-nums'>
      {v}
    </Text>
  );

  const slotRow = (i: number, first: boolean) => {
    const l = lines[i];
    const materialId = wireInt(l.materialId);
    const linked = materialId > 0;
    const m = materialById(materialId);
    const isSelected = selected === i;
    const error = tones.get(i) === 'error';
    const role = roleLabel(l, i);
    const extra = roleExtra(l, role);
    const roll = isRollGoodsSection(l.section);
    const articleName = m?.name?.trim() || `article #${materialId}`;
    const price = resolveBomPrice(l, m);
    const stock = stockFacts.get(materialId);
    const gsm = roll ? weightLabel(materialFabricWeight(m) || l.fabricWeightGsm) : '';
    const width = roll ? widthLabel(materialFabricWidth(m) || l.fabricWidth) : '';
    return (
      <div key={fields[i]?.id ?? i} className='grid grid-cols-subgrid' style={spanAll}>
        <div
          className={cn(
            'relative grid grid-cols-subgrid items-center',
            !first && 'border-t border-hairline',
          )}
          style={spanAll}
        >
          {/* Ошибка строки — тонкая красная черта слева и `!` у роли; СЛОВА — в шапке блока. */}
          {error && <span aria-hidden className='absolute inset-y-0 -left-2 w-px bg-error' />}
          <span
            role='button'
            tabIndex={0}
            aria-expanded={isSelected}
            onClick={() => toggle(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle(i);
              }
            }}
            className={cn(
              'grid min-h-11 cursor-pointer grid-cols-subgrid items-center py-1.5 hover:bg-bgZebra',
              isSelected && 'bg-bgZebra',
            )}
            style={{ gridColumn: `span ${LEAD_COLS} / span ${LEAD_COLS}` }}
          >
            {linked ? (
              <MaterialThumb material={m} size='sm' />
            ) : (
              <span className='size-8 border border-hairline' />
            )}
            <Tooltip
              trigger={
                <span className='block min-w-0 max-w-[220px]'>
                  <Text
                    component='span'
                    size='micro'
                    className={cn(
                      'block truncate',
                      isSelected && 'underline underline-offset-2',
                      error && 'text-error',
                    )}
                  >
                    {error ? '! ' : ''}
                    {role}
                    {l.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN' ? (
                      <span className='font-bold'> *</span>
                    ) : null}
                    {extra ? <span className='text-labelColor'> · {extra}</span> : null}
                  </Text>
                </span>
              }
            >
              {join(role, extra || undefined, sectionShort(l.section))}
            </Tooltip>
            {linked ? (
              <>
                <Tooltip
                  trigger={
                    <span className='block min-w-0'>
                      <Text component='span' size='micro' className='block truncate'>
                        {articleName}
                      </Text>
                    </span>
                  }
                >
                  {join(
                    articleName,
                    m ? composeArticleFromMaterial(m, true) : undefined,
                    m ? materialCompositionText(m) : undefined,
                  )}
                </Tooltip>
                {factText(gsm)}
                {factText(width)}
                {factText(canReadCosting ? price.label || 'no price' : '')}
                {factText(
                  stock?.onHand ? `stock ${stock.onHand}${stock.unit ? ` ${stock.unit}` : ''}` : '',
                )}
              </>
            ) : (
              <span className='min-w-0' style={{ gridColumn: 'span 5 / span 5' }}>
                {canEdit ? (
                  <button
                    type='button'
                    className={cn(DOOR, error && 'text-error hover:text-error')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPicking({ section: l.section || '', line: i });
                    }}
                  >
                    link article
                  </button>
                ) : (
                  factText('no article')
                )}
              </span>
            )}
          </span>
        </div>
        {isSelected && (
          <div className='sticky left-0 border-t border-hairline' style={spanAll}>
            <BomLineEditor
              key={fields[i]?.id ?? i}
              index={i}
              highlight={highlightActive}
              blockedBy={blocked?.index === i ? blocked.users : undefined}
              identityOpen={identityFor === i}
              onToggleIdentity={() => setIdentityFor((f) => (f === i ? null : i))}
              onClose={() => setSelected(null)}
              onRemove={() => removeArticle(i)}
              onGoToColorway={goToColorway}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className='flex flex-col gap-3'>
      {headerEl ? (
        createPortal(header, headerEl)
      ) : (
        <div className='flex flex-wrap items-center gap-1.5'>{header}</div>
      )}

      {/* ⚠ СПИСОК СКРОЛЛИТСЯ ВНУТРИ СВОЕЙ КОРОБКИ, А НЕ УВОЗИТ СТРАНИЦУ ВБОК (DESIGN.md). Отступ
          слева — место под красную черту строки с ошибкой. */}
      {fields.length > 0 && (
        <div className='overflow-x-auto pl-2'>
          <div
            className='grid items-center gap-x-4'
            style={{
              gridTemplateColumns: [
                '32px',
                'minmax(80px, max-content)',
                'minmax(140px, 1fr)',
                'max-content',
                'max-content',
                'max-content',
                'max-content',
              ].join(' '),
            }}
          >
            {groups.map((g, gi) => (
              <div key={g.section} className='grid grid-cols-subgrid' style={spanAll}>
                {/* ОДНА черта под подписью секции — своя у GroupLabel; первая строка группы своей
                    верхней черты не рисует (владелец: «double underline»). */}
                <div style={spanAll}>
                  <GroupLabel flush={gi === 0}>{sectionShort(g.section) || 'other'}</GroupLabel>
                </div>
                {g.indices.map((i, k) => slotRow(i, k === 0))}
                {canEdit && (
                  <div className='pb-1 pt-2' style={spanAll}>
                    <button
                      type='button'
                      className={DOOR}
                      onClick={() => setPicking({ section: g.section })}
                    >
                      + {sectionShort(g.section) || 'article'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Пустые секции — одна тихая строка ссылок; пустая вкладка — только она. */}
      {canEdit && emptySections.length > 0 && (
        <div className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'>
          {emptySections.map((o, i) => (
            <span key={o.value} className='flex items-center gap-1.5'>
              {i > 0 && (
                <Text component='span' size='micro' variant='label'>
                  ·
                </Text>
              )}
              <button
                type='button'
                onClick={() => setPicking({ section: o.value })}
                className='text-micro text-labelColor underline-offset-2 hover:text-textColor hover:underline'
              >
                + {o.label}
              </button>
            </span>
          ))}
        </div>
      )}
      {fields.length === 0 && !canEdit && <Placeholder label='no articles' className='h-16' />}

      <MaterialPickerDialog
        open={picking !== null}
        // Мягкий фильтр: секция заглушки выбрана чипом, каталог можно расширить не закрывая окна.
        initialSection={picking?.section ?? ''}
        title={
          picking
            ? picking.line !== undefined
              ? 'link article'
              : picking.section
                ? `add ${sectionShort(picking.section) || 'article'}`
                : 'add slot'
            : undefined
        }
        confirmLabel={picking?.line !== undefined ? 'link' : 'add'}
        onPick={(m) => {
          if (m) commitPick(m, picking);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
        onCreate={() => {
          createTarget.current = picking;
          setPicking(null);
          setCreateOpen(true);
        }}
      />
      <MaterialModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultSection={createTarget.current?.section as common_TechCardBomSection | undefined}
        onCreated={(_id, m) => commitPick(m, createTarget.current)}
      />
    </div>
  );
}
