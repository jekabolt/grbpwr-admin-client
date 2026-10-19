import {
  common_AdminColorwayRef,
  common_Material,
  common_TechCardBomKind,
  common_TechCardBomSection,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  formatCompositionCell,
  materialCompositionCode,
} from 'components/managers/materials/components/material-code';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import {
  MaterialHoverCard,
  MaterialPickerDialog,
  materialSwatchColour,
  useMaterialStockFacts,
} from 'components/managers/materials/components/material-picker';
import { materialImageUrl } from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { techCardBomSectionOptions, techCardFabricDirectionOptions } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  AddDoor,
  GroupLabel,
  HeaderWarnings,
  Close,
  Placeholder,
  ConfirmationModal,
  Text,
  Tooltip,
  ComboField,
  InputField,
  SelectField,
} from 'ui';
import { carriesGarmentComposition } from 'utils/care-label';
import { FIELD_REVEAL_EVENT, revealField, type FieldRevealDetail } from 'utils/field-errors';
import { sectionShort } from './bom-line-picker';
import { TrimPictogram, trimPictogramKind } from './design/pattern/trim-pictograms';
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
export function SlotIdentityFields({ index, stacked }: { index: number; stacked?: boolean }) {
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
      <div className={stacked ? 'grid grid-cols-2 items-start gap-3' : BOX_GRID}>
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

// A colourway whose recipe still cuts the article the operator is trying to delete. The server
// refuses that delete; this is what the refusal is turned into on the way in.
type BlockingUser = { colorwayId: number; sku: string };

// ПОЛЯ СЛОТА — тело модалки «роль слота» (владелец 17.10: старые примитивы, без ссылок и абзацев).
// Артикул меняется щелчком по плитке, подробности артикула — наведением на неё; здесь только
// равные коробки: направление ворса у полотна и личность слота. Состав артикула — одна тихая
// строка (якорь `#bom-composition-{index}`: вкладка labels ведёт сюда за пустым составом).
//
// Надбавки раскроя здесь НЕТ (она своя у каждого кроя и задаётся в раскладке), флага семпла тоже.
function BomLineEditor({ index, highlight }: { index: number; highlight?: boolean }) {
  const { control } = useFormContext<TechCardFormData>();
  const materialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as string | undefined;
  const rollGoods = isRollGoodsSection(rowSection);
  const composition = useWatch({ control, name: `bomItems.${index}.composition` }) as
    | string
    | undefined;
  return (
    <div className='flex min-w-0 flex-col gap-3'>
      {/* Состав СТРОКИ (снимок, который читает вкладка labels), всегда: якорь её двери. */}
      <Text
        size='micro'
        variant='label'
        id={`bom-composition-${index}`}
        className={cn(highlight && 'animate-pulse ring-2 ring-warning motion-reduce:animate-none')}
      >
        {formatCompositionCell(composition) ||
          (materialId > 0 ? 'composition not set' : 'no article')}
      </Text>
      {rollGoods && (
        <SelectField
          name={`bomItems.${index}.fabricDirection`}
          label='fabric direction'
          items={techCardFabricDirectionOptions}
        />
      )}
      <SlotIdentityFields index={index} stacked />
    </div>
  );
}

// ── СПИСОК: одна строка на слот, группы по секциям. Колорвеев здесь нет (владелец 16.10: у них
// своя вкладка); рецепты колорвеев видны только там, где они держат удаление строки. ──────────

// Плитка слота — тот же квадрат, что ячейка матрицы COLOURWAYS.
const TILE = 140;

// Пиктограмма пустой плитки: рулонные секции рисуются тканью, остальное — фурнитурой по словам
// строки (назначение, секция, имя) — тот же выбор, что у матрицы COLOURWAYS.
function slotPictogram(l: { section?: string; purpose?: string; name?: string }) {
  return trimPictogramKind({
    family: isRollGoodsSection(l.section) ? 'fabric' : 'hardware',
    kind: l.purpose ?? '',
    section: l.section ?? '',
    name: l.name ?? '',
  });
}

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
// Пикер каталога: новая строка в секции (`section`) или артикул для строки (`line`); `quiet` —
// смена с фото строки, панель слота после неё не открывается.
type PickTarget = { section: string; line?: number; quiet?: boolean };

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
  /** Слот в шапке секции: сюда порталятся HeaderWarnings (как у PATTERNS). */
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
  const [highlightActive, setHighlightActive] = useState(false);
  // Удаление слота спрашивает подтверждение (владелец 17.10: «remove без единого предупреждения»).
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  // Пикер каталога: новая строка в секции (`section`) или артикул для пустой строки (`line`).
  const [picking, setPicking] = useState<PickTarget | null>(null);
  // A door from another tab (patterns' empty block: «+ fabric slot») opens the picker on a section
  // once, then drops the param so a reload or back does not reopen it.
  const addSlot = params.get('addSlot');
  useEffect(() => {
    if (addSlot == null) return;
    const next = new URLSearchParams(params);
    next.delete('addSlot');
    setParams(next, { replace: true });
    if (canEdit) setPicking({ section: addSlot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSlot]);
  const [createOpen, setCreateOpen] = useState(false);
  const createTarget = useRef<PickTarget | null>(null);
  // Поле, которое надо сфокусировать, как только редактор строки смонтируется (дверь B7).
  const focusPath = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const fieldCount = useRef(fields.length);
  fieldCount.current = fields.length;

  // Артикул слота меняется на плитке, не в модалке полей: дверь к `materialId` открывает пикер.
  const openArticle = (index: number) =>
    setPicking({
      section: (getValues(`bomItems.${index}.section`) as string) || '',
      line: index,
      quiet: true,
    });

  const openLine = (index: number, field?: string) => {
    if (field === 'materialId') {
      openArticle(index);
      return;
    }
    setSelected(index);
    if (!field) return;
    const path = `bomItems.${index}.${field}`;
    focusPath.current = path;
    setFocusTick((t) => t + 1);
    requestAnimationFrame(() => revealField(path));
  };

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
      if (m[2] === 'materialId') {
        openArticle(index);
        return;
      }
      focusPath.current = path;
      setSelected(index);
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
    openRecipe(colorwayId);
    showMessage('remove this article from the colourway recipe and save it', 'success');
  };

  // Stable line_key (§2.3): downstream refs point at the article's key, not its position — so
  // removing an article NEVER renumbers anything. We only clear refs that pointed AT the removed
  // article (its key is gone); refs to other articles are untouched.
  // Колорвеи держат строку — отказ показывается сразу в редакторе; иначе сперва подтверждение.
  const askRemove = (bi: number) => {
    setConfirmRemove(bi);
  };

  const removeArticle = (bi: number) => {
    const removedKey = (getValues(`bomItems.${bi}.lineKey`) as string) || '';
    // Colourway recipes are the one referrer this form does not own, so they are the one thing
    // that can block — refused here, shown inline in the editor, not as a server wall of text.
    const users = colorwayUsers(removedKey, wireInt(getValues(`bomItems.${bi}.id`)));
    // Модалка удаления уже назвала эти колорвеи и не дала подтвердить; здесь — последний засов.
    if (users.length > 0) return;
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
  const commitPick = (m: common_Material, target: PickTarget | null) => {
    const materialId = wireInt(m.id);
    if (!materialId) return;
    if (target?.line !== undefined) {
      linkLine(target.line, m);
      // Смена артикула с фото строки панель не открывает: человек остался в списке.
      if (!target.quiet) setSelected(target.line);
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

  const header = (
    <>
      <HeaderWarnings items={warnings} />
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

  // ПЛИТКА СЛОТА — ТА ЖЕ ЯЧЕЙКА, ЧТО В МАТРИЦЕ COLOURWAYS (владелец 17.10: «не новые примитивы»):
  // квадрат 140, щелчок — пикер артикула, наведение — карточка артикула, `✕` в углу на наведении —
  // удаление с подтверждением. Под плиткой роль (дверь к полям слота) и одна строка: артикул · цена.
  const slotCell = (i: number) => {
    const l = lines[i];
    const materialId = wireInt(l.materialId);
    const m = materialById(materialId);
    const empty = !materialId;
    const error = tones.get(i) === 'error';
    const role = roleLabel(l, i);
    const extra = roleExtra(l, role);
    const url = m ? materialImageUrl(m) : '';
    const fill = m ? materialSwatchColour(m) : '';
    const facts = materialId ? stockFacts.get(materialId) : undefined;
    const onHand = facts ? Number(facts.onHand) : NaN;
    const price = resolveBomPrice(l, m);
    const tile = (
      <button
        type='button'
        disabled={!canEdit}
        onClick={() => setPicking({ section: l.section || '', line: i, quiet: true })}
        aria-label={empty ? `pick an article for ${role}` : `change the article of ${role}`}
        className={cn(
          'relative block shrink-0 overflow-hidden border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor enabled:cursor-pointer',
          empty
            ? 'flex flex-col items-center justify-center gap-1 border-dashed text-labelColor enabled:hover:border-textColor enabled:hover:text-textColor'
            : 'border-borderColor bg-pageBg enabled:hover:border-textColor',
          empty && (error ? 'border-error' : 'border-borderColor'),
        )}
        style={{
          width: TILE,
          height: TILE,
          backgroundColor: !empty && !url && fill ? fill : undefined,
        }}
      >
        {empty ? (
          <>
            <TrimPictogram kind={slotPictogram(l)} className='size-16 text-textColor opacity-20' />
            <span className='text-micro uppercase tracking-label'>+ material</span>
          </>
        ) : url ? (
          <img src={url} alt={m?.name || role} className='size-full object-cover' />
        ) : !m ? (
          <span className='text-micro uppercase tracking-label text-labelColor'>
            article #{materialId}
          </span>
        ) : null}
      </button>
    );
    return (
      <div
        key={fields[i]?.id ?? i}
        className='group/slot flex flex-col gap-1'
        style={{ width: TILE }}
        data-field={`bomItems.${i}.materialId`}
      >
        <div className='relative w-fit'>
          {empty || !m ? (
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
                m={m}
                url={url}
                colour={fill}
                stock={Number.isFinite(onHand) ? onHand : undefined}
                facts={facts}
              />
            </Tooltip>
          )}
          {canEdit && (
            <Close
              size='sm'
              aria-label={`remove slot ${role}`}
              onClick={() => askRemove(i)}
              className='absolute right-1 top-1 bg-bgColor opacity-0 focus-visible:opacity-100 group-hover/slot:opacity-100 group-focus-within/slot:opacity-100 [@media(hover:none)]:opacity-100'
            />
          )}
        </div>
        <span className='flex min-w-0 flex-col uppercase tracking-label'>
          <span
            role='button'
            tabIndex={0}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelected(i);
              }
            }}
            className={cn(
              'line-clamp-2 min-h-[1.5em] cursor-pointer text-control hover:underline',
              error && 'text-error',
            )}
          >
            {role}
            {l.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN' ? ' *' : ''}
            {extra ? <span className='text-labelColor'> · {extra}</span> : null}
          </span>
          <span className='mt-0.5 flex items-baseline justify-between gap-2 border-t border-hairline pt-0.5 text-micro'>
            {empty ? (
              <span className='text-error'>no article</span>
            ) : (
              <>
                <span className='min-w-0 truncate text-labelColor' title={m?.name || undefined}>
                  {m?.name?.trim() || `article #${materialId}`}
                </span>
                {canReadCosting && (
                  <span className='shrink-0 tabular-nums'>{price.label || 'no price'}</span>
                )}
              </>
            )}
          </span>
        </span>
      </div>
    );
  };

  const removeUsers =
    confirmRemove !== null && lines[confirmRemove]
      ? colorwayUsers(
          (lines[confirmRemove].lineKey as string) || '',
          wireInt(lines[confirmRemove].id),
        )
      : [];
  const addTile = (
    <AddDoor
      shape='tile'
      onClick={() => setPicking({ section: '' })}
      style={{ width: TILE, height: TILE }}
    >
      slot
    </AddDoor>
  );

  return (
    <div className='flex flex-col gap-3'>
      {headerEl ? (
        createPortal(header, headerEl)
      ) : (
        <div className='flex flex-wrap items-center gap-1.5'>{header}</div>
      )}

      {/* ГРУППЫ СЕКЦИЙ: подпись + ряд плиток (ряд ячеек матрицы COLOURWAYS). Добавление — пунктирная
          плитка того же размера в конце последнего ряда, на одной линии с остальными. */}
      <div className='flex flex-col'>
        {groups.map((g, gi) => (
          <div key={g.section} className='flex flex-col'>
            <GroupLabel flush={gi === 0}>{sectionShort(g.section) || 'other'}</GroupLabel>
            <div className='flex flex-wrap gap-3 py-2'>
              {g.indices.map((i) => slotCell(i))}
              {canEdit && gi === groups.length - 1 && addTile}
            </div>
          </div>
        ))}
        {canEdit && groups.length === 0 && <div className='flex py-2'>{addTile}</div>}
      </div>

      {/* ПОЛЯ СЛОТА — обычная модалка карточки: равные коробки, без ссылок и абзацев. */}
      <ConfirmationModal
        open={selected !== null && selected < fields.length}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        onConfirm={() => setSelected(null)}
        title={selected !== null && lines[selected] ? roleLabel(lines[selected], selected) : 'slot'}
        confirmLabel='done'
        hideCancel
      >
        {selected !== null && selected < fields.length && (
          // Модалка уходит порталом из <fieldset disabled> выпущенной карточки — свой засов здесь.
          <fieldset disabled={!canEdit} className='contents'>
            <BomLineEditor
              key={fields[selected]?.id ?? selected}
              index={selected}
              highlight={highlightActive}
            />
          </fieldset>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmRemove !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRemove(null);
        }}
        onConfirm={() => {
          if (confirmRemove !== null) removeArticle(confirmRemove);
          setConfirmRemove(null);
        }}
        title={
          confirmRemove !== null
            ? `remove slot ${lines[confirmRemove] ? roleLabel(lines[confirmRemove], confirmRemove) : ''}?`
            : undefined
        }
        confirmLabel='remove slot'
        confirmDisabled={removeUsers.length > 0}
        hideCancel
      >
        {removeUsers.length > 0 ? (
          <div className='flex flex-col'>
            <Text size='micro' variant='error'>
              used in colourway recipes
            </Text>
            {removeUsers.map((u) => (
              <button
                key={u.colorwayId}
                type='button'
                onClick={() => {
                  setConfirmRemove(null);
                  goToColorway(u.colorwayId);
                }}
                className='border-b border-hairline py-1 text-left text-micro underline-offset-2 last:border-b-0 hover:underline'
              >
                open {u.sku}
              </button>
            ))}
          </div>
        ) : (
          <Text size='micro' variant='label'>
            its links in operations, pieces and labels are cleared
          </Text>
        )}
      </ConfirmationModal>
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
