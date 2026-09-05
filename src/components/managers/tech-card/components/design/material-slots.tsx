import { useEffect, useMemo, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { common_TechCardBomKind } from 'api/proto-http/admin';
import { formatCompositionCell } from 'components/managers/materials/components/material-code';
import { CompositionPicker } from 'components/managers/product/components/composition/composition-picker';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';

import {
  KIND_HOME_SECTION,
  kindLabel,
  kindOptionsForSection,
  isKindEligibleSection,
  UNSET_KIND,
} from '../bom-kind';
import { sectionShort } from '../bom-line-picker';
import {
  bomPurposeLabel,
  defaultRoleForPurpose,
  isRollGoodsSection,
  purposeEditorOptions,
  UNSET_PURPOSE,
} from '../bom-purpose';
import { defaultRoleFor, roleCollision } from '../bom-roles';
import { bornBomLine } from '../form-writers';
import { unitOptions } from '../tech-card-options';
import { wireInt, type TechCardFormData } from '../schema';

/**
 * ═══ MATERIAL SLOTS — СЛОТЫ МАТЕРИАЛОВ ВМЕСТО СПЕЦИФИКАЦИИ (B-16 / B-19 / B-20 круга 20) ═══════
 *
 * Владелец дословно: «в место BILL OF MATERIALS оно должно распозновать сколько видов тканей и
 * какие у нас слоты могут быть и потом эти слоты будут наследоваться в уже во вкладке бом их можно
 * добавлять и тут и в бом вкладке» (B-16); «оно должно предлагать и нитки и фурнитуру если она
 * есть и колонки SUPPLIER там не должно быть — выбор уже реальной ткани пер колорвей будет в
 * других вкладках» (B-19); «колонки COLOR и PANTONE … убрать тоже и как то его нормально назвать»
 * (B-20).
 *
 * ─── 1. СЛОТ — ЭТО СТРОКА BOM. ВИД НАД `bomItems[]`, А НЕ НОВАЯ СУЩНОСТЬ ────────────────────────
 *
 * Второго списка «видов тканей» здесь нет и не заводится. Строка BOM УЖЕ есть роль-без-артикула:
 * она называется слотом в коде вкладки BOM (`SlotIdentityFields`), уже рождается черновиком
 * construction, уже группируется по назначению у всех потребителей (раскладки, привязки выкроек,
 * псевдонимы деталей, кат-лист). Отдельная сущность «слот» дала бы ровно то, что владелец называет
 * проблемой, — ВТОРОЕ место, откуда потом «наследовать» в BOM, — и потребовала бы кода
 * наследования, разрешения конфликтов и миграции существующих карточек. Вид над тем же массивом
 * наследует БЕСПЛАТНО: строка, рождённая здесь, стоит на вкладке BOM плиткой в своей группе сразу,
 * без сохранения и без единого дополнительного вызова.
 *
 * ─── 2. ЗАКОН ЗАПИСИ: `setValue`, И НИКОГДА `useFieldArray` ─────────────────────────────────────
 *
 * Во всём дереве ровно ОДИН `useFieldArray` над `bomItems` — редактор вкладки BOM. Два массива
 * полей на одно имя в этом RHF не синхронизируются (память `rhf-fieldarray-mutations-dont-broadcast`),
 * и второй молча терял бы строки первого. Поэтому здесь: чтение — `useWatch`, правка ячейки —
 * обычный лист формы по пути (`bomItems.3.name`), добавление и удаление — `setValue` по КОРНЮ
 * массива: только запись на имя массива переизлучает `_subjects.array` и пересинхронизирует
 * владельца. Владелец при этом смонтирован всегда — вкладки тех-карты СКРЫТЫ атрибутом `hidden`,
 * а не размонтированы (`components/index.tsx`). Сломать это может ровно одно: сделать вкладку BOM
 * условно-рендерящейся.
 *
 * ─── 3. ТАБЛИЦА БЕСЦВЕТНА И БЕЗАРТИКУЛЬНА — ЭТО РЕШЕНИЕ, А НЕ ЭКОНОМИЯ ──────────────────────────
 *
 * B-16 просил колонку PANTONE с подсказкой, B-20 — убрать COLOR и PANTONE. Противоречие разрешено
 * в пользу бесцветности, и не по хронологии сообщения, а по модели данных: цвет — факт КОЛОРВЕЯ
 * (`common_TechCardColorwayUsage` несёт `color`/`pantone` по строке рецепта), поэтому один слот в
 * трёх колорвеях имеет ТРИ пантона, а в ячейку влезает один. Сам B-19 говорит это прямым текстом:
 * «выбор уже реальной ткани пер колорвей будет в других вкладках».
 *
 * ⚠ ЧТО ИМЕННО СТАЛО С ПАНТОНОМ СТРОКИ — СКАЗАНО ЗДЕСЬ ПРЯМО, ПОТОМУ ЧТО РАНЬШЕ ЗДЕСЬ СТОЯЛА
 * НЕПРАВДА. Подпись обещала, что «`pantone-picker.tsx` цел», а соседняя (`studio-tab.tsx`) — что
 * «новая таблица берёт их себе»; таблица их не взяла, и пикер остался БЕЗ ЕДИНОГО ВЫЗЫВАЮЩЕГО во
 * всём `src/`. Файлы сняты вместе с блоком, который их звал (`construction-bom-table.tsx`), — по
 * тому же правилу, по которому сняты B-11 и B-12: спрятанный орган возвращается следующим
 * вызывающим, а мёртвый файл под обещанием «его возьмут» живёт кругами.
 *
 * ПОЛЕ ПРИ ЭТОМ ЖИВО И НИЧЕГО НЕ ТЕРЯЕТ: колонка `tech_card_bom_item.pantone` (0363) на месте,
 * `bomItems[].pantone` возится схемой и мапперами ПРОТИВ ПОТЕРИ (см. довод у самого поля в
 * `schema.ts`), и ПИШЕТ его сегодня ровно один автор — черновик construction
 * (`head/construction-draft-model.ts`), то есть модель. РУЧНОГО редактора у него в этом клиенте
 * нет ни на одной вкладке, и это осознанно: цвет — факт КОЛОРВЕЯ, и выбирают его там.
 *
 * Артикул, поставщик и цена не показываются по той же причине: слот — это РОЛЬ в изделии, а не
 * покупка. Дверь `›` ведёт в редактор ЭТОЙ строки на вкладке BOM, где артикул и выбирают вместе со
 * снимком его каталожных полей (писатель один — пикер здесь оставил бы на строке цену прошлого
 * артикула, и по ней побежал бы костинг).
 */

type Line = NonNullable<TechCardFormData['bomItems']>[number];

/**
 * ТРИ СЕМЕЙСТВА — ОДНА ТАБЛИЦА (B-19: «должно предлагать и нитки и фурнитуру если она есть»).
 * Три отдельных блока превратили бы секцию в лестницу из шести коробок, а «блок никогда не
 * содержит блок» запрещает вложить три таблицы-блока в одну. Заголовок-строка внутри таблицы —
 * ровно та ступень лестницы правил, которую DESIGN.md отводит под-группе.
 */
type Family = 'cloth' | 'thread' | 'hardware';

const FAMILY_ORDER: Family[] = ['cloth', 'thread', 'hardware'];

const FAMILY_TITLE: Record<Family, string> = {
  cloth: 'cloth',
  thread: 'thread',
  hardware: 'hardware & trims',
};

/** Секция, которой рождается строка по нажатию чипа своего семейства. */
const FAMILY_SEED_SECTION: Record<Family, string> = {
  cloth: 'TECH_CARD_BOM_SECTION_FABRIC',
  thread: 'TECH_CARD_BOM_SECTION_THREAD',
  hardware: 'TECH_CARD_BOM_SECTION_HARDWARE',
};

/**
 * ЕДИНИЦА, В КОТОРОЙ СЕМЕЙСТВО СЧИТАЕТСЯ ПО УМОЛЧАНИЮ — ПОДСКАЗКА В ПУСТОМ ПОЛЕ, А НЕ ЗНАЧЕНИЕ.
 * Ткань и нитку меряют метрами, фурнитуру считают штуками; напечатать это серым дешевле, чем
 * заставлять руку выбирать очевидное. Записать за человека — нельзя: `unit` входит в подписываемый
 * дайджест MATERIALS (см. блок над таблицей).
 */
const FAMILY_UNIT_HINT: Record<Family, string> = { cloth: 'm', thread: 'm', hardware: 'pcs' };

function familyOf(section?: string): Family {
  // Рулонный товар — те же четыре секции, что раскладываются и несут назначение.
  if (isRollGoodsSection(section)) return 'cloth';
  if (section === 'TECH_CARD_BOM_SECTION_THREAD') return 'thread';
  // Всё остальное — фурнитура, отделка, лейблы, упаковка, прочее: одна пара глаз на них хватает.
  return 'hardware';
}

/** Кто из колорвеев режет эту строку — держит ✕ и называет причину. */
type Blocker = { sku: string };

export function MaterialSlots({
  techCardId,
  readOnly,
  onGoTab,
}: {
  techCardId?: number;
  readOnly?: boolean;
  /** Дверь на вкладку BOM: `?tab=bom&bom=<line_key>` — существующий диплинк редактора строки. */
  onGoTab?: (tab: string, extra?: Record<string, string>) => void;
}) {
  const { control, getValues, setValue, setFocus } = useFormContext<TechCardFormData>();
  const lines = (useWatch({ control, name: 'bomItems' }) ?? []) as Line[];

  // Единственное, ради чего читается карточка: рецепты колорвеев пишутся СВОИМ RPC, эта форма их
  // не видит в своём состоянии и не может очистить своим сохранением — значит и удалять строку,
  // на которую они смотрят, отсюда нельзя. Ключ запроса тот же, что у редактора карточки, поэтому
  // это попадание в кэш, а не второй сетевой вызов.
  const { data: card } = useTechCard(techCardId);
  const colorways = card?.colorways;

  // Сверка по `bom_item_id`, а `line_key` только запасным путём — ровно так же, как это делает
  // вкладка BOM: чтение не отдаёт `bom_line_key` на usage вовсе, и это тот же FK, на котором
  // сервер отвечает RESTRICT. Ни разу не сохранённая строка имеет id 0, и сослаться на неё некому.
  const blockersOf = (line: Line): Blocker[] => {
    const key = line.lineKey?.trim() ?? '';
    const bomItemId = wireInt(line.id);
    return (colorways ?? [])
      .filter((c) =>
        (c.usages ?? []).some(
          (u) =>
            (bomItemId > 0 && wireInt(u.bomItemId) === bomItemId) ||
            (!!key && u.bomLineKey === key),
        ),
      )
      .map((c) => ({
        sku: c.baseSku?.trim() || c.colorCode?.trim() || `#${c.colorwayId ?? 0}`,
      }));
  };

  /**
   * ПОРЯДОК ТАБЛИЦЫ = ПОРЯДОК МАССИВА. Строки не фильтруются и не пересортировываются: индекс
   * строки таблицы — это НАСТОЯЩИЙ индекс формы, и по нему же пишутся ячейки. Семейства собираются
   * ПОЗИЦИЯМИ, а не копиями строк, — копия развела бы экран с формой на первой же правке.
   */
  const families = useMemo(() => {
    const buckets: Record<Family, number[]> = { cloth: [], thread: [], hardware: [] };
    lines.forEach((l, i) => buckets[familyOf(l.section)].push(i));
    return FAMILY_ORDER.map((key) => ({ key, rows: buckets[key] })).filter(
      (f) => f.rows.length > 0,
    );
  }, [lines]);

  // ФОКУС ЕДЕТ ЗА РОЖДЁННОЙ СТРОКОЙ, И ТОЛЬКО ЗА НЕЙ. Ключ запоминается в ref, а не в состоянии:
  // это не то, что рисуется, а разовое намерение — и оно обязано пережить ровно один рендер.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const i = lines.findIndex((l) => l.lineKey === key);
    if (i < 0) return;
    pendingFocus.current = null;
    setFocus(`bomItems.${i}.name` as never);
  }, [lines, setFocus]);

  const addSlot = (family: Family) => {
    const cur = (getValues('bomItems') ?? []) as unknown[];
    // Роль пустая НАМЕРЕННО: назвать слот — это и есть тот единственный ответ, ради которого чип
    // нажимают. Пустая роль у непривязанной строки — видимый долг (zod встаёт на этой же ячейке),
    // а не мусор, и молча она не исчезает.
    const line = bornBomLine({ section: FAMILY_SEED_SECTION[family], name: '' });
    pendingFocus.current = line.lineKey as string;
    setValue('bomItems', [...cur, line] as never, { shouldDirty: true });
  };

  const removeSlot = (index: number) => {
    const cur = (getValues('bomItems') ?? []) as unknown[];
    setValue('bomItems', cur.filter((_, j) => j !== index) as never, { shouldDirty: true });
  };

  const goToLine = (line: Line) =>
    onGoTab?.('bom', line.lineKey?.trim() ? { bom: line.lineKey.trim() } : {});

  return (
    <Section
      title='material slots'
      question='— the cloths, threads and hardware this style needs, before any article is chosen'
      action={
        readOnly ? undefined : (
          <ChipRow>
            {FAMILY_ORDER.map((family) => (
              <Chip key={family} dashed data-b16-add={family} onClick={() => addSlot(family)}>
                + {FAMILY_TITLE[family]}
              </Chip>
            ))}
          </ChipRow>
        )
      }
    >
      <div data-b16-slots=''>
        {lines.length === 0 ? (
          <Text size='micro' variant='label' data-b16-empty=''>
            no slots yet — draft the construction on the moodboard above, or add one by hand
          </Text>
        ) : (
          /**
           * ═══ EST USAGE — ЕДИНСТВЕННОЕ «СКОЛЬКО», КОТОРОЕ У СЛОТА ЕСТЬ, И ОНО СОВЕЩАТЕЛЬНОЕ ═════
           *
           * Владелец тем же дыханием, что и сам блок: «EST USAGE тоже апроксимация аи» (B-16), и
           * рядом — «так же можно менять руками все поля». Оба слова взяты дословно: колонку
           * заполняет черновик construction, а ячейка при этом остаётся живой рукой.
           *
           * ПОЧЕМУ СВОЁ ПОЛЕ (0365), А НЕ `qty_per_garment` И НЕ РЕЦЕПТ КОЛОРВЕЯ. У мерной строки
           * на стадии замысла нет ни одного адреса «сколько»: норма живёт в рецепте колорвея,
           * которого ещё нет. У счётной адрес есть — `qty_per_garment`, — но это ПОДПИСАННАЯ норма
           * закупки: она входит в себестоимость, в потребность цеха и в проекцию подписи MATERIALS,
           * и приближение модели там означало бы, что кнопка черновика правит деньги и протухает
           * утверждённые подписи. Два поля — «оценка тканям» и «qty фурнитуре» — были бы ложным
           * расщеплением одного вопроса. Поэтому одно поле на любой секции, всегда советующее и
           * никогда не деньги: его не читают ни костинг, ни план материалов, ни кат-лист.
           *
           * ⚠ ОТСУТСТВИЕ ОСТАЁТСЯ ОТСУТСТВИЕМ, И ЭТО НЕ ФИГУРА РЕЧИ. У `google.type.Decimal` нет
           * `optional`, поэтому сервер знает ровно два способа услышать пустоту: ключа НЕТ — «не
           * трогай сохранённое», `{value:''}` — «очисти». Форма держит это различие своим третьим
           * состоянием (`undefined` против `''`, довод у `estUsageOut` в `schema.ts`), а экран
           * обязан ему соответствовать: у строки без оценки ячейка ПУСТА, и сохранение из неё не
           * говорит про оценку ничего. Ровно так эта строка кода перестаёт быть тем, чем в этом
           * репозитории уже был пантон, — командой «очисти», выехавшей из дефолта схемы.
           *
           * ЕДИНИЦА — СУЩЕСТВУЮЩЕЕ ПОЛЕ СТРОКИ (`unit`), И ПИСАТЕЛЬ У НЕГО ТОТ ЖЕ, ЧТО НА ВКЛАДКЕ
           * BOM: открытый список-подсказка (`ComboField` + `unitOptions`), а не закрытый. Radix
           * Select над чужим написанием («yd» от модели) нарисовал бы ПУСТОЙ триггер и стёр бы его
           * первым же выбором — та же ловушка, ради которой ниже дописываются отключённые пункты
           * назначения и вида. Умолчание семейства («m» ткани и нитке, «pcs» фурнитуре) стоит
           * ПЛЕЙСХОЛДЕРОМ и НИКОГДА не записывается за человека: `unit` входит в подписываемый
           * дайджест MATERIALS, и запись туда как побочный эффект набора совещательного числа
           * протухила бы подпись — ту самую, которую эта колонка обязана не трогать.
           */
          <DataTable className='[&_td[data-b16-family]]:border-borderColor [&_td[data-b16-family]]:pt-3'>
            <thead>
              <tr>
                <th data-align='left'>component</th>
                <th data-align='left'>fiber</th>
                <th className='w-[150px]'>est usage</th>
                <th className='w-[120px]'>
                  <span className='sr-only'>row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {families.map((family) => (
                <SlotFamily
                  key={family.key}
                  family={family.key}
                  rows={family.rows}
                  lines={lines}
                  readOnly={!!readOnly}
                  onGo={onGoTab ? goToLine : undefined}
                  onRemove={removeSlot}
                  blockersOf={blockersOf}
                />
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </Section>
  );
}

/** Заголовок семейства плюс его строки. Фрагмент, а не таблица: у семейства нет своей рамки. */
function SlotFamily({
  family,
  rows,
  lines,
  readOnly,
  onGo,
  onRemove,
  blockersOf,
}: {
  family: Family;
  rows: number[];
  lines: Line[];
  readOnly: boolean;
  onGo?: (line: Line) => void;
  onRemove: (index: number) => void;
  blockersOf: (line: Line) => Blocker[];
}) {
  return (
    <>
      <tr>
        <td colSpan={4} data-align='left' data-b16-family={family}>
          <Text
            size='micro'
            variant='label'
            tracking='group'
            component='span'
            className='font-bold uppercase'
          >
            {FAMILY_TITLE[family]}
          </Text>
        </td>
      </tr>
      {rows.map((index) => (
        <SlotRow
          key={lines[index].lineKey || `row-${index}`}
          index={index}
          lines={lines}
          readOnly={readOnly}
          onGo={onGo}
          onRemove={onRemove}
          blockersOf={blockersOf}
        />
      ))}
    </>
  );
}

function SlotRow({
  index,
  lines,
  readOnly,
  onGo,
  onRemove,
  blockersOf,
}: {
  index: number;
  lines: Line[];
  readOnly: boolean;
  onGo?: (line: Line) => void;
  onRemove: (index: number) => void;
  blockersOf: (line: Line) => Blocker[];
}) {
  const line = lines[index];
  const section = line.section;
  const rollGoods = isRollGoodsSection(section);
  const kindEligible = isKindEligibleSection(section);
  const kindItems = kindOptionsForSection(section);

  const purposeSet = !!line.purpose && line.purpose !== UNSET_PURPOSE;
  const kindSet = !!line.kind && line.kind !== UNSET_KIND;

  /**
   * ЧУЖОЙ ТОКЕН ДОПИСЫВАЕТСЯ В СПИСОК ОТКЛЮЧЁННЫМ ПУНКТОМ — тем же приёмом, что на вкладке BOM.
   * Radix рисует над значением, которого нет среди пунктов, ПУСТОЙ триггер: экран говорит «не
   * задано» там, где форма держит `zipper`, и первый же выбор молча затирает его. Причина у вида
   * бывает двух родов (вид живёт в одной домашней секции — строку перевезли; либо токен новее
   * этой сборки), у назначения — только вторая, и подписи обязаны их различать.
   */
  const foreignPurpose =
    purposeSet && rollGoods && !purposeEditorOptions.some((o) => o.value === line.purpose);
  const foreignKind = kindSet && kindEligible && !kindItems.some((i) => i.value === line.kind);
  const kindHome = kindSet
    ? KIND_HOME_SECTION[line.kind as common_TechCardBomKind]
    : undefined;

  // Роль по умолчанию как ПОДСКАЗКА в пустом поле, а не как значение: назначение уже сказано, и
  // повторять его руками незачем — но и присваивать за человека нечего.
  const rolePlaceholder =
    (rollGoods ? defaultRoleForPurpose(line.purpose) : kindLabel(line.kind)) ||
    defaultRoleFor(section) ||
    'name this slot';

  // Совещательно, никогда не блокирует: две строки на одну роль законны (полочка и капюшон), но
  // роль печатается без квалификатора секции всюду, где её читают, поэтому дубль стоит назвать.
  const duplicate = roleCollision(lines, line.name, index) >= 0;

  const rawFiber = (line.composition ?? '').trim();
  /**
   * ═══ СОСТАВ ПРИВЯЗАННОЙ СТРОКИ — СНИМОК КАТАЛОГА, И ПИСАТЬ ЕГО ЗДЕСЬ НЕЛЬЗЯ ═══════════════════
   *
   * У строки, привязанной к артикулу, `composition` — это НЕ то, что человек про эту роль думает, а
   * СНИМОК каталожного артикула, который кладёт туда `materialLineFields`
   * (`materials/components/material-code.ts` — `materialCompositionCode`). У структурно заведённого
   * материала снимок — JSON: `{"fibre":[{"code":"Cotton","percent":60},…]}`.
   *
   * ⚠ ЗДЕСЬ СТОЯЛ СВОБОДНЫЙ ТЕКСТОВЫЙ ПИСАТЕЛЬ НА КАЖДОЙ СТРОКЕ, И ОН ТИХО ПОРТИЛ ДАННЫЕ. Оператор
   * видел в ячейке фигурные скобки, «прибирал» их или ронял одну — и снимок заменялся. Экран при
   * этом не краснел НИГДЕ: вкладка BOM у привязанной строки читает состав с САМОГО МАТЕРИАЛА
   * (`bom-field.tsx` — плита каталога), а не со строки, поэтому там всё выглядело правильно; а
   * `parseCompositionCode` на испорченной строке возвращает ноль долей, и ярлык ухода молча терял
   * волокна. Отказ ячейки — единственное место, где эту потерю видно ВОВРЕМЯ.
   *
   * Поэтому правило ровно то же, что на вкладке BOM (`bom-field.tsx:1110-1113`): привязана — только
   * читаем, и сказано почему; не привязана — поля ЕЁ, и пишет их тот же орган, что там же.
   */
  const linked = wireInt(line.materialId) > 0;
  /**
   * ЧИТАЕМАЯ ПРОЕКЦИЯ СНИМКА. Сырой JSON человеку нечитаем, а показать его сырым — ровно тот
   * дефект, ради которого `formatCompositionCell` и написана (она же стоит на бумаге). Пусто в
   * ответ на неразборный JSON — намеренно, поэтому падение назад на `rawFiber` ниже: строка,
   * которую разобрать нечем, всё равно обязана быть видна, иначе «состав пуст» соврёт.
   */
  const readableFiber = formatCompositionCell(rawFiber);

  /**
   * ОЦЕНКА ЧИТАЕТСЯ БЕЗ ЕДИНОГО ДЕФОЛТА. `estUsage` у строки без оценки — `undefined`, и оно
   * ОБЯЗАНО таким остаться до самого провода: `?? ''` здесь — местная переменная для рендера, а не
   * запись в форму. Стоит подставить пустоту в форму — и сохранение начнёт говорить «очисти» за
   * каждую строку, которой оценку никто не давал.
   */
  const est = (line.estUsage ?? '').trim();
  const unit = (line.unit ?? '').trim();
  const unitHint = FAMILY_UNIT_HINT[familyOf(section)];

  const blockers = blockersOf(line);
  const blocked = blockers.length > 0;

  return (
    <tr data-b16-row={index}>
      <td data-align='left' className='min-w-[180px] align-top'>
        {readOnly ? (
          <Text component='span' className='font-bold' data-b16-name={index}>
            {line.name?.trim() || 'unnamed'}
          </Text>
        ) : (
          <InputField
            name={`bomItems.${index}.name`}
            label='role in the garment'
            srLabel
            placeholder={rolePlaceholder}
            data-b16-name={index}
          />
        )}
        {/* ВТОРАЯ СТРОКА ЯЧЕЙКИ — ТА ОСЬ, КОТОРАЯ У СЕКЦИИ ЕСТЬ, И РОВНО ОДНА ИЗ ДВУХ. Назначение
            законно только на рулонной строке, вид — только вне рулонных и вне лейблов; сервер
            отвергает пару вроде «hardware + purpose=main» напрямую, поэтому контрол, которому
            здесь не место, не рисуется вовсе, а не рисуется отключённым. */}
        {rollGoods &&
          (readOnly ? (
            <Text size='micro' variant='label' component='p' data-b16-axis={index}>
              {bomPurposeLabel(line.purpose)}
            </Text>
          ) : (
            <div className='mt-0.5' data-b16-axis={index}>
              <SelectField
                name={`bomItems.${index}.purpose`}
                label='purpose'
                items={[
                  ...purposeEditorOptions,
                  ...(foreignPurpose
                    ? [
                        {
                          value: line.purpose as string,
                          label: `${bomPurposeLabel(line.purpose)} — unknown to this app version`,
                          disabled: true,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          ))}
        {kindEligible &&
          (readOnly ? (
            <Text size='micro' variant='label' component='p' data-b16-axis={index}>
              {kindLabel(line.kind) ?? sectionShort(section)}
            </Text>
          ) : (
            <div className='mt-0.5' data-b16-axis={index}>
              <SelectField
                name={`bomItems.${index}.kind`}
                label='kind'
                items={[
                  { value: UNSET_KIND, label: '— unset —' },
                  ...kindItems,
                  ...(foreignKind
                    ? [
                        {
                          value: line.kind as string,
                          label: `${kindLabel(line.kind) ?? line.kind} — ${
                            kindHome
                              ? `belongs to ${sectionShort(kindHome) || 'another section'}`
                              : 'unknown to this app version'
                          }`,
                          disabled: true,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          ))}
        {duplicate && (
          <div className='mt-0.5'>
            <Pill tone='mut' data-b16-dup={index}>
              same role
            </Pill>
          </div>
        )}
      </td>
      <td data-align='left' className='min-w-[180px] align-top' data-b16-fiber-cell={index}>
        {readOnly || linked ? (
          <Text
            component='span'
            data-b16-fiber={index}
            data-b16-fiber-locked={linked ? '' : undefined}
          >
            {readableFiber || rawFiber || <EmptyCell />}
          </Text>
        ) : (
          /* ПИКЕР, А НЕ ТЕКСТОВОЕ ПОЛЕ — ТОТ ЖЕ, ЧТО У НЕПРИВЯЗАННОЙ СТРОКИ НА ВКЛАДКЕ BOM
             (`bom-field.tsx:1243`). Состав — не свободная строка: его формы ждут ОБА парсера
             (`parseCompositionCode` и генератор care-лейбла), и набранное мимо формы даёт им ноль
             долей, то есть молча выпадает из ярлыка ухода. Два писателя РАЗНОЙ ФОРМЫ над одним
             полем — это способ получить карточку, состав которой читается на одной вкладке и не
             читается на другой; писатель поэтому один, и он общий. */
          <CompositionPicker name={`bomItems.${index}.composition`} label='fibre content' />
        )}
        {linked && !readOnly && (
          /* ПРИЧИНА ОТКАЗА СТОИТ РЯДОМ С ОТКАЗОМ, А НЕ В ДОКУМЕНТАЦИИ. Ячейка, которая просто не
             принимает набор, читается как поломка; она обязана назвать, ЧЕЙ это состав и где его
             меняют. Дверь туда уже стоит в этой же строке — `›`. */
          <Text size='micro' variant='label' component='p' data-b16-fiber-why={index}>
            from the linked article — change it on the BOM tab
          </Text>
        )}
      </td>
      <td className='w-[150px] align-top' data-b16-est-cell={index}>
        {readOnly ? (
          est ? (
            <Text component='span' data-b16-est={index}>
              {est} {unit || <EmptyCell>{unitHint}</EmptyCell>}
            </Text>
          ) : (
            /* ПУСТО — ЭТО ОТВЕТ, А НЕ ПРОБЕЛ. Ноль здесь означал бы «модель посчитала и вышел
               ноль», а прочерк — «оценки нет»; это разные утверждения, и таблица обязана
               произносить второе. */
            <EmptyCell />
          )
        ) : (
          <div className='flex items-start justify-end gap-1'>
            <div className='w-16'>
              <DecimalField
                name={`bomItems.${index}.estUsage`}
                label='est usage'
                srLabel
                data-b16-est={index}
              />
            </div>
            <div className='w-14'>
              {linked ? (
                /* ЕДИНИЦА ПРИВЯЗАННОЙ СТРОКИ — СНИМОК КАТАЛОГА, ровно как её состав слева:
                   `materialLineFields` кладёт сюда `material.unit` при привязке, и вкладка BOM
                   своего писателя на этой ветке тоже не рисует. Причина названа один раз на
                   строку — в ячейке состава; вторая копия той же фразы была бы прозой, которую
                   B-17 снял. */
                <Text
                  component='span'
                  data-b16-unit={index}
                  data-b16-unit-locked=''
                  /* Высота поля, а не высота буквы: рядом стоит настоящий контрол, и текст,
                     прижатый к верху ячейки, читался бы как съехавший, а не как запертый. */
                  className='flex min-h-[22px] items-center'
                >
                  {unit || <EmptyCell>{unitHint}</EmptyCell>}
                </Text>
              ) : (
                <ComboField
                  name={`bomItems.${index}.unit`}
                  label='unit'
                  srLabel
                  options={unitOptions}
                  placeholder={unitHint}
                />
              )}
            </div>
          </div>
        )}
      </td>
      <td className='w-[120px] align-top'>
        <div className='flex items-start justify-end gap-1'>
          {onGo && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              data-b16-go={index}
              onClick={() => onGo(line)}
            >
              ›
            </Button>
          )}
          {/* ✕ ИНЕРТЕН, А НЕ СПРЯТАН, КОГДА СТРОКУ РЕЖЕТ КОЛОРВЕЙ. Диалог со списком колорвеев уже
              есть на вкладке BOM; здесь достаточно НАЗВАТЬ причину и оставить `›` — переход это не
              запись, и он ведёт ровно туда, где отказ разрешается. */}
          {!readOnly && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={blocked}
              data-b16-remove={index}
              data-inert={blocked ? `used by colourway ${blockers.map((b) => b.sku).join(', ')}` : undefined}
              title={
                blocked
                  ? `cut by colourway ${blockers.map((b) => b.sku).join(', ')} — remove it on the BOM tab`
                  : 'remove this slot'
              }
              onClick={() => onRemove(index)}
            >
              ✕
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
