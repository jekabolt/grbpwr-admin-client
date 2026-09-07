import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { common_TechCardBomKind } from 'api/proto-http/admin';
import { formatCompositionCell } from 'components/managers/materials/components/material-code';
import { parseComposition } from 'components/managers/product/components/composition/composition-picker';
import { CompositionModal } from 'components/managers/product/components/composition/composition-modal/composition-modal';
import { compositionToValue } from 'components/managers/product/components/composition/composition-modal/utils';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { EmptyState, GROUP_SEAM } from './core';
import {
  BoardMovedPill,
  ProvenancePill,
  useProvenance,
  type Provenance,
} from './head/mood-organs';
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

/** Слово семейства — в плейсхолдере рождения внизу таблицы и на пилюле строки (макет: `CLOTH`
 *  ink, `THREAD` / `HARDWARE` обычная). Одно слово, как в макете: «& trims» — не семейство. */
const FAMILY_TITLE: Record<Family, string> = {
  cloth: 'cloth',
  thread: 'thread',
  hardware: 'hardware',
};

/** Секция, которой рождается строка по выбору своего семейства в плейсхолдере. */
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

  // ПРОИСХОЖДЕНИЕ СТРОКИ — ИЗ ЖУРНАЛА ЧЕРНОВИКА (`head/mood-organs.tsx`): рождённая черновиком
  // строка носит `drafted`, пока стоит на карточке; набранная рукой пилюли не носит вовсе.
  const prov = useProvenance(techCardId ?? 0);
  const provOf = (line: Line): Provenance =>
    line.lineKey?.trim() ? prov({ kind: 'slot', lineKey: line.lineKey.trim() }) : null;

  /**
   * ОДНА ДВЕРЬ РОЖДЕНИЯ, И ОНА ВНИЗУ СПИСКА (п. 13 владельца, дословно: «вместо + CLOTH + THREAD
   * + HARDWARE сверху — снизу просто плейсхолдер, где выбираешь пункт»).
   *
   * Три чипа в шапке были ТРЕМЯ кнопками на один жест, да ещё и в противоположном от списка
   * углу: рука выбирала семейство наверху, а строка появлялась внизу. Теперь орган один и стоит
   * там, где появится результат, — селект в последней строке таблицы; выбор семейства И ЕСТЬ
   * нажатие, поэтому второй кнопки «добавить» рядом нет. Селект возвращается в исходную подпись
   * сразу после рождения: он не хранит состояние, он его СОВЕРШАЕТ.
   */
  const addPlaceholder = readOnly ? null : (
    <select
      data-b16-family-select=''
      aria-label='add a material slot'
      value=''
      onChange={(e) => {
        const family = e.target.value as Family | '';
        if (family) addSlot(family);
      }}
      className='min-h-[26px] w-full cursor-pointer appearance-none border border-dashed border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize text-labelColor hover:text-textColor focus:border-solid focus:border-textColor focus:outline-none'
    >
      <option value=''>+ add a slot ▾</option>
      {FAMILY_ORDER.map((family) => (
        <option key={family} value={family}>
          {FAMILY_TITLE[family]}
        </option>
      ))}
    </select>
  );

  return (
    <Section
      title='material slots'
      question='— what this is made of'
      /* ⚠ ШАПКА ПУСТА, КРОМЕ ПРЕДУПРЕЖДЕНИЯ, И ЭТО РЕШЕНИЕ ВЛАДЕЛЬЦА (п. 12): «FROM THE MOODBOARD
         · 4 OF 6 DRAFTED SLOTS — не нужно, убрать». Пилюля происхождения и счётчик черновика
         ушли; провенанс отдельной строки по-прежнему стоит в её собственной колонке `from`, где
         он относится к чему-то конкретному. `moodboard moved on` остаётся: это не украшение
         счёта, а предупреждение, что доска ушла вперёд написанного. */
      action={<BoardMovedPill techCardId={techCardId ?? 0} />}
      /* ШОВ ОДИН НА ВЕСЬ ШАГ MOOD (r3b, M-1) — `GROUP_SEAM`, 20px, как у соседних блоков шага. */
      className={GROUP_SEAM}
    >
      <div data-b16-slots=''>
        {lines.length === 0 ? (
          <EmptyState action={addPlaceholder ? <div className='w-40'>{addPlaceholder}</div> : undefined}>
            <span className='uppercase text-textColor'>no material slots yet</span>
            {readOnly ? '' : ' · draft the construction above, or add one by hand'}
          </EmptyState>
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
          /* ⚠ `py-2.5` ВМЕСТО ШТАТНЫХ `py-1` — ПРОСЬБА ВЛАДЕЛЬЦА (п. 14: «между рядами сделай
             больше гэп»), и она не про вкус: в строке теперь три составных органа (имя+пилюля,
             состав, число+единица), и на четырёх пикселях они читались одной кашей. Волосяная
             линия остаётся — разделяет по-прежнему она, воздух её только даёт разглядеть. */
          <DataTable className='[&_td]:py-2.5'>
            <thead>
              <tr>
                <th data-align='left'>component</th>
                {/* ОДНА КОЛОНКА НА ДВЕ ВЗАИМОИСКЛЮЧАЮЩИЕ ОСИ: назначение бывает только у
                    рулонного товара, вид — только вне его (и не у лейблов), поэтому в ячейке
                    всегда ровно один контрол или прочерк, и двух тут не бывает по построению. */}
                <th data-align='left' className='w-[150px]'>
                  purpose / kind
                </th>
                <th data-align='left'>composition</th>
                <th className='w-[150px]'>est usage</th>
                <th data-align='left' className='w-[90px]'>
                  from
                </th>
                <th className='w-[110px]'>
                  <span className='sr-only'>row actions</span>
                </th>
              </tr>
            </thead>
            {/* ПЛОСКИЙ СПИСОК, ПИЛЮЛЯ СЕМЕЙСТВА В КАЖДОЙ СТРОКЕ — как в макете; заголовков
                семейств нет. Порядок — семействами (ткань, нитки, фурнитура), позициями формы. */}
            <tbody>
              {families.flatMap((family) =>
                family.rows.map((index) => (
                  <SlotRow
                    key={lines[index].lineKey || `row-${index}`}
                    index={index}
                    family={family.key}
                    prov={provOf(lines[index])}
                    lines={lines}
                    readOnly={!!readOnly}
                    onGo={onGoTab ? goToLine : undefined}
                    onRemove={removeSlot}
                    blockersOf={blockersOf}
                  />
                )),
              )}
              {addPlaceholder && (
                <tr data-b16-add-row=''>
                  {/* Строка без волосяной линии снизу: это не запись, а место, где она появится. */}
                  <td colSpan={6} data-align='left' className='border-b-0'>
                    <div className='max-w-[280px]'>{addPlaceholder}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        )}
      </div>
    </Section>
  );
}

function SlotRow({
  index,
  family,
  prov,
  lines,
  readOnly,
  onGo,
  onRemove,
  blockersOf,
}: {
  index: number;
  family: Family;
  prov: Provenance;
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
      {/**
       * ═══ ОДНА СТРОКА — ОДНО ПОЛЕ И ОДНА ПИЛЮЛЯ (п. 9 владельца) ════════════════════════════
       *
       * Дословно: «три прямоугольника, два кликабельных один под другим (CLOTH), расстояния
       * разные, слишком близко, неорганично». Стопка была не «плотной», а РАЗНОРОДНОЙ: поле
       * имени, читаемая пилюля и чужой по смыслу селект оси стояли одной колонкой с тремя
       * разными зазорами, и глаз читал их как три равных органа.
       *
       * Теперь: имя — единственный контрол ячейки, пилюля семейства стоит СПРАВА от него на той
       * же линии (она read-only и по типу — `Pill`, а не `Chip`, то есть нажать её нельзя по
       * построению), ось назначения/вида уехала в СВОЮ колонку. Зазор в строке ровно один.
       */}
      <td data-align='left' className='min-w-[200px] align-top'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <div className='min-w-[110px] flex-1'>
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
          </div>
          {/* СЕМЕЙСТВО — ПИЛЮЛЕЙ (макет: `CLOTH` ink, `THREAD`/`HARDWARE` обычная), вместо
              заголовков семейств над группами строк. */}
          <Pill tone={family === 'cloth' ? 'ink' : 'mut'} data-b16-kind={family}>
            {FAMILY_TITLE[family]}
          </Pill>
          {/* Совещательное предупреждение живёт на той же линии, а не четвёртым этажом. */}
          {duplicate && (
            <Pill tone='mut' data-b16-dup={index}>
              same role
            </Pill>
          )}
        </div>
      </td>
      {/* ОСЬ СТРОКИ — СВОЯ КОЛОНКА, И В НЕЙ РОВНО ОДНА ИЗ ДВУХ. Назначение законно только на
          рулонной строке, вид — только вне рулонных и вне лейблов; сервер отвергает пару вроде
          «hardware + purpose=main» напрямую, поэтому контрол, которому здесь не место, не
          рисуется вовсе, а не рисуется отключённым, — и у лейбла ячейка честно пуста. */}
      <td data-align='left' className='w-[150px] align-top' data-b16-axis-cell={index}>
        {rollGoods &&
          (readOnly ? (
            <Text size='micro' variant='label' component='p' data-b16-axis={index}>
              {bomPurposeLabel(line.purpose)}
            </Text>
          ) : (
            /* ПОДПИСЬ КОНТРОЛА — В ЗАГОЛОВКЕ КОЛОНКИ, А НЕ НАД КАЖДОЙ ЯЧЕЙКОЙ. `SelectField`
               рисует `FormLabel` всегда и `srLabel` не знает (общий примитив, чужой файл),
               поэтому она глушится здесь — экранному читателю она по-прежнему слышна, а
               глаз получает ряд контролов на одной линии вместо лесенки из подписей. */
            <div data-b16-axis={index} className='[&_label]:sr-only'>
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
            <div data-b16-axis={index} className='[&_label]:sr-only'>
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
        {!rollGoods && !kindEligible && <EmptyCell />}
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
          <FibreField index={index} raw={rawFiber} readable={readableFiber} />
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
          /**
           * ЧИСЛО И ЕДИНИЦА — ОДНА КОРОБКА (п. 11 владельца: «два тупо белых прямоугольника»).
           *
           * Два поля рядом были ДВУМЯ утверждениями об одном ответе: «1.45» и «m» — это одна
           * величина, и рамка вокруг каждой половины предлагала читать их порознь. Рамку теперь
           * рисует коробка, половинки — нет (`border-none`), делит их волосяная линия; фокус
           * подсвечивает коробку целиком (`focus-within`), поэтому орган ведёт себя как ОДНО
           * поле, оставаясь двумя настоящими контролами формы (число — десятичное, единица —
           * открытый список: закрытый Radix стёр бы чужое написание, довод выше).
           */
          <div
            data-b16-est-box={index}
            className='flex min-h-[26px] items-stretch border border-borderColor bg-bgColor focus-within:border-textColor'
          >
            <div className='min-w-0 flex-1'>
              <DecimalField
                name={`bomItems.${index}.estUsage`}
                label='est usage'
                srLabel
                data-b16-est={index}
                className='min-h-[24px] border-none bg-transparent text-right focus:border-none'
              />
            </div>
            <div className='w-[52px] shrink-0 border-l border-hairline' data-b16-unit={index}>
              {linked ? (
                /* ЕДИНИЦА ПРИВЯЗАННОЙ СТРОКИ — СНИМОК КАТАЛОГА, ровно как её состав слева:
                   `materialLineFields` кладёт сюда `material.unit` при привязке, и вкладка BOM
                   своего писателя на этой ветке тоже не рисует. Причина названа один раз на
                   строку — в ячейке состава; вторая копия той же фразы была бы прозой, которую
                   B-17 снял. */
                <Text
                  component='span'
                  data-b16-unit-locked=''
                  className='flex min-h-[24px] items-center px-[7px]'
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
                  className='min-h-[24px] border-none bg-transparent text-labelColor focus:border-none'
                />
              )}
            </div>
          </div>
        )}
      </td>
      <td data-align='left' className='w-[90px] align-top' data-b16-from={index}>
        {/* ОТКУДА СТРОКА — пилюля из журнала черновика; пусто, когда журнал о ней не знает. */}
        <ProvenancePill state={prov} />
      </td>
      <td className='w-[110px] align-top'>
        <div className='flex items-start justify-end gap-1'>
          {onGo && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              data-b16-go={index}
              onClick={() => onGo(line)}
            >
              bom ›
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

/**
 * ═══ СОСТАВ — ОДИН ОРГАН, ОДНА ВЫСОТА, ОДИН КЕГЛЬ (п. 10 владельца) ════════════════════════════
 *
 * Дословно: «FIBRE CONTENT и кнопки CLEAR и SELECT разного размера». Так и было: общий пикер
 * (`CompositionPicker`) рисует ПОДПИСЬ поля, плиту значения и рядом ДВЕ кнопки разных размеров
 * (`xs` у clear, `sm` у select) — в форме продукта, где у поля есть своя строка, это читается, а в
 * ячейке таблицы, где подпись уже дал заголовок колонки, распадается на три разнокалиберных
 * прямоугольника.
 *
 * ЗДЕСЬ — ТА ЖЕ САМАЯ ДВЕРЬ, ДРУГАЯ ОПРАВА. Редактор состава остаётся ровно один на весь
 * репозиторий — `CompositionModal`, и пишет он тем же `compositionToValue`, что и пикер: второго
 * ПИСАТЕЛЯ этой строки не заводится (свободный текст над этим полем уже однажды молча портил
 * снимок каталога — довод в ячейке выше). Меняется только оправа: значение, ✕ и `select ▸` стоят
 * в ОДНОЙ рамке, одной высоты и одного кегля, а подпись поля живёт в заголовке колонки.
 *
 * Плита НЕ кнопка: ✕ и дверь — настоящие кнопки, и класть их внутрь третьей было бы невалидной
 * разметкой, которую браузер чинит на свой вкус.
 */
function FibreField({
  index,
  raw,
  readable,
}: {
  index: number;
  raw: string;
  readable: string;
}) {
  const { setValue } = useFormContext<TechCardFormData>();
  const [open, setOpen] = useState(false);
  const name = `bomItems.${index}.composition`;
  const write = (value: string) =>
    setValue(name as never, value as never, { shouldDirty: true, shouldValidate: true });

  return (
    <>
      <div
        data-b16-fiber-box={index}
        className='flex min-h-[26px] items-stretch border border-borderColor bg-bgColor focus-within:border-textColor'
      >
        <Text
          component='span'
          data-b16-fiber={index}
          className={cn(
            'flex min-w-0 flex-1 items-center truncate px-[7px] py-[3px]',
            !readable && !raw && 'text-textInactiveColor',
          )}
        >
          {readable || raw || 'not stated'}
        </Text>
        {!!raw && (
          <button
            type='button'
            data-b16-fiber-clear={index}
            title='clear the composition'
            aria-label='clear the composition'
            onClick={() => write('')}
            className='flex shrink-0 items-center px-2 text-textBaseSize text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
          >
            ✕
          </button>
        )}
        <button
          type='button'
          data-b16-fiber-door={index}
          onClick={() => setOpen(true)}
          className='flex shrink-0 items-center border-l border-hairline px-[7px] text-textBaseSize hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
        >
          select ▸
        </button>
      </div>
      <CompositionModal
        isOpen={open}
        selectedComposition={parseComposition(raw)}
        selectComposition={(c) => write(compositionToValue(c))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
