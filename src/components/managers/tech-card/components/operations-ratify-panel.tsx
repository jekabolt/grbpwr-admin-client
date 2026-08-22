import * as Dialog from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { Combobox, type ComboboxGroup } from 'ui/components/combobox';
import Text from 'ui/components/text';

import { KIND_BY_WORK_TOKEN } from './operation-kinds';
import type { OperationFormStringField } from './operation-options';
import { ratifyCard, type RatifyProposal, type RatifyRow, type RatifyStep } from './operation-ratify';
import {
  groupWorks,
  searchWorks,
  workApplication,
  workNaming,
  type ParkMachineRow,
  type ParkPressRow,
  type StepSnapshot,
  type WorkCatalog,
} from './operation-work';
import type { TechCardFormData } from './schema';

// ПАНЕЛЬ РАТИФИКАЦИИ — ЭКРАН, КОТОРЫЙ НЕ СПРАШИВАЕТ «ЧТО ЭТО».
//
// ЗАЧЕМ ОНА ЕСТЬ. На проде 126 операций, работа названа у 15. Сто одиннадцать строк неотличимы
// друг от друга — но НЕМЫХ среди них нет: карточка печатает имя каждой уже сегодня, выводя его из
// пары (глагол, машинка). Вопрос, значит, не «какая это работа», а «правда ли то, что мы уже
// печатаем», — и панель задаёт ровно его, строку за строкой, в порядке операций.
//
// ЧТО ОНА ЕСТЬ. ПРЕДСТАВЛЕНИЕ И ДВА ЖЕСТА, и больше в ней нет ничего:
//   * ЯРУС И ПРЕДЛОЖЕНИЯ СЧИТАЕТ ЧУЖОЙ ОРГАН — чистый классификатор `operation-ratify.ts`. Здесь
//     не решается, что предложить: здесь решается, как это НАРИСОВАТЬ;
//   * ЧТО ЗАПИСАТЬ, РЕШАЕТ ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ — `workApplication` (`operation-work.ts`), и
//     панель его ВТОРОЙ вызыватель; первый — строка шага. Ради этого писателя и выносили: вторая
//     редакция тех же правил разошлась бы с первой молча, ровно как расходились два списка
//     дискриминаторов и два словаря поиска.
//
// ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ:
//   * НИ ОДНОГО СВОЕГО ПУТИ ЗАПИСИ В СЕТЬ. Панель пишет в ТУ ЖЕ ФОРМУ, что и открытый шаг;
//     сохраняет карточку обычная «Save» в шапке, полоса остатков и аудит присутствия работают как
//     всегда. Своё сохранение здесь было бы вторым концом провода у одной карточки;
//   * НИ ОДНОГО СВОЕГО ПИКЕРА ВХОДОВ И ПРИЁМА ВТО. Недостающий вход и незаписанный приём панель
//     ПОКАЗЫВАЕТ и АДРЕСУЕТ к их собственным контролам на шаге («open the step»). Правила «что шаг
//     имеет право взять» живут в общем с сервером порте `assembly-frontier.ts`, и второй их
//     читатель разошёлся бы молча; ВТО-приём живёт на своём контроле, где его и заполняют. Это
//     граница панели, и её стережёт мутация `--mutate-press-picker`;
//   * НИ ОДНОГО ДЕФОЛТА. Подстановка (последний такой же шаг карточки > глобальный дефолт работы)
//     — ОТДЕЛЬНЫЙ жест с отдельной меткой «подставлено», и живёт он у строки шага, потому что
//     читает соседние строки. Панель подтверждает ИМЯ, а не заполняет шаг: нажатие меняет РОВНО
//     `work` (и класс шва у второй кнопки яруса A) — стережёт `--mutate-prefill`;
//   * НИКАКОГО «ПРИМЕНИТЬ ВСЁ». Сто одиннадцать строк, разложенных на десять форм, — это сто
//     одиннадцать РЕШЕНИЙ; кнопка, делающая их все разом, превратила бы ратификацию в подпись не
//     глядя, то есть в ровно ту разновидность ложной зелени, от которой лечится вся волна.
//
// СМЕНА ПОДПИСИ ПОСЛЕ НАЖАТИЯ НАЗЫВАЕТСЯ ВСЛУХ, И ЭТО РЕШЕНИЕ, А НЕ УКРАШЕНИЕ. Строка без работы
// зовётся ярлыком ПУНКТА («Join — lockstitch»), записанная работа покажется ярлыком КАТАЛОГА
// («Join / seam», переименование 0331). Это одно и то же, но человек увидит смену слова сразу
// после того, как «подтвердил напечатанное», — и без единого слова прочтёт это как «я нажал не то».
// Поэтому строка, у которой имя ПОМЕНЯЛОСЬ, печатает след: чем она звалась до нажатия. И ровно
// поэтому след УСЛОВНЫЙ: у ратификации отстрочки (`Topstitch` → `Topstitch`) имя не меняется ни на
// букву, и след там был бы шумом, объявляющим событие, которого не было. Стережёт
// `--mutate-quiet-rename`.

/** Строка формы, суженная до читаемого. Ключи — имена полей строки шага, как их держит RHF. */
type OperationRow = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(str) : []);

/**
 * НОМЕР ОПЕРАЦИИ — ПОЗИЦИОННЫЙ, И СЧИТАЕТСЯ ОН ТАМ ЖЕ, ГДЕ РИСУЕТСЯ. Маппер перештамповывает
 * `(i+1)*10` на каждом сохранении, рельс печатает то же самое; классификатор отдаёт ИНДЕКС и о
 * представлении не знает ничего.
 */
const opNumber = (index: number): number => (index + 1) * 10;

/**
 * ЧТО ПАНЕЛЬ ЧИТАЕТ У СТРОКИ ФОРМЫ ДЛЯ КЛАССИФИКАТОРА.
 *
 * Виды BOM приходят КЛЮЧАМИ строк, а резолву нужны их РОДЫ: четыре пункта опознаются именно ими
 * (кнопку от хольнитена отличает `kind` привязанной строки BOM). Собирается тем же выражением, что
 * и в открытом шаге, — и по той же карте, потому что второй способ спросить у BOM его род развёл
 * бы панель с редактором на первой же кнопке.
 */
const toRatifyStep = (o: OperationRow, bomKindByKey: ReadonlyMap<string, string>): RatifyStep => ({
  operationType: str(o.operationType),
  machineType: str(o.machineType),
  seamClass: str(o.seamClass),
  attachMethod: str(o.attachMethod),
  coverageMode: str(o.coverageMode),
  labelAttachStitch: str(o.labelAttachStitch),
  pressAction: str(o.pressAction),
  bomKinds: list(o.bomLineKeys)
    .map((k) => bomKindByKey.get(k) ?? '')
    .filter(Boolean),
  work: str(o.work),
  inputKeys: list(o.inputKeys),
  outputUnitKey: str(o.outputUnitKey),
  zone: str(o.zone),
  note: str(o.note),
});

/** Снимок шага для писателя — закрытым списком имён и в его написании. */
const toSnapshot = (o: OperationRow): StepSnapshot => ({
  operationType: str(o.operationType),
  machineType: str(o.machineType),
  pressEquipment: str(o.pressEquipment),
  seamClass: str(o.seamClass),
  attachMethod: str(o.attachMethod),
  coverageMode: str(o.coverageMode),
  labelAttachStitch: str(o.labelAttachStitch),
  pressAction: str(o.pressAction),
  bomKinds: [],
  machineProfileKey: str(o.machineProfileKey),
  pressProfileKey: str(o.pressProfileKey),
});

/**
 * ФРАЗА ЯРУСА — ЧТО ПАНЕЛЬ ГОВОРИТ ТАМ, ГДЕ ПРЕДЛОЖИТЬ НЕЧЕГО.
 *
 * МОЛЧАНИЕ БЕЗ СЛОВА ЧИТАЕТСЯ КАК ПОЛОМКА. Строка без кнопок, ничем не отличающаяся от строки с
 * кнопками, кроме их отсутствия, отправляет человека искать, почему «здесь не работает»; поэтому
 * каждый молчащий ярус называет ПРИЧИНУ молчания и, где она есть, — место, где недостающее
 * заполняют. Ярусы с предложениями фразы не несут вовсе: за них говорят сами кнопки.
 */
const TIER_WORD: Readonly<Record<RatifyRow['tier'], string>> = {
  join: '',
  'ratify-derived': '',
  named: '',
  'catalog-gap': 'the record says more than the catalogue has a job for — nothing to suggest',
  contradiction: 'the printed name says «join», the record says one input — open the step',
  'press-action-missing': 'the press action is not recorded — open the step',
  'no-inputs': 'nothing is recorded on the step to go by',
};

export type RatifyPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Каталог работ. Подписан КОРНЕМ поля — второй подписки на тот же ключ панель не заводит. */
  catalog: WorkCatalog;
  /**
   * Пустые значения строки шага (`emptyOperation`). Приезжают пропом, а не импортом: панель —
   * ребёнок `operations-field.tsx`, и обратный импорт замкнул бы модули в цикл.
   */
  blanks: Readonly<Record<string, unknown>>;
  /** Открыть шаг в редакторе и закрыть панель — жест «иди, где это заполняют». */
  onOpenStep: (index: number) => void;
};

export function OperationsRatifyPanel(props: RatifyPanelProps) {
  // ТЕЛО МОНТИРУЕТСЯ ТОЛЬКО ОТКРЫТЫМ. Панель подписана на ВЕСЬ массив операций; висеть этой
  // подпиской над закрытым экраном значило бы перерисовывать её на каждое нажатие клавиши в шаге.
  if (!props.open) return null;
  return <RatifyPanelBody {...props} />;
}

function RatifyPanelBody({ onClose, catalog, blanks, onOpenStep }: RatifyPanelProps) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as OperationRow[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    lineKey?: string;
    kind?: string;
  }>;
  const parkMachines = (useWatch({
    control,
    name: 'construction.equipmentDefaults.machines',
  }) ?? []) as ParkMachineRow[];
  const parkPresses = (useWatch({
    control,
    name: 'construction.equipmentDefaults.presses',
  }) ?? []) as ParkPressRow[];

  const bomKindByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bomItems) if (b?.lineKey) m.set(b.lineKey, b.kind ?? '');
    return m;
  }, [bomItems]);

  // ВСЯ КАРТОЧКА, В ПОРЯДКЕ ОПЕРАЦИЙ И ЦЕЛИКОМ. Панель, показывающая только неназванные, показывала
  // бы дырявую карточку и лишала бы человека контекста «а как названы соседи»; ярус `named` для
  // того и заведён, чтобы такую строку было чем приглушить.
  const rows = useMemo(
    () => ratifyCard(operations.map((o) => toRatifyStep(o, bomKindByKey)), catalog),
    [operations, bomKindByKey, catalog],
  );

  /**
   * ЧЕМ СТРОКА ЗВАЛАСЬ ДО НАЖАТИЯ — и только там, где нажатие ИМЯ ПОМЕНЯЛО.
   *
   * Держится один сеанс панели и никуда не пишется: это не факт карточки, а объяснение того, что
   * человек только что увидел своими глазами. Закрыл панель — объяснять больше нечего.
   */
  const [renamedFrom, setRenamedFrom] = useState<ReadonlyMap<number, string>>(new Map());

  const rowRefs = useRef(new Map<number, HTMLDivElement | null>());
  const focusRow = useCallback((index: number) => {
    rowRefs.current.get(index)?.focus();
  }, []);

  /**
   * ФОКУС НА ПЕРВОЙ СТРОКЕ, КОТОРОЙ ЕСТЬ ЧТО ПРЕДЛОЖИТЬ, — И ЭТО ОБМЕН, НАЗВАННЫЙ ВСЛУХ.
   *
   * Панель — инструмент ПРОХОДА: её клавиатурный договор это «Enter, Enter, Enter», и экран,
   * требующий клика прежде, чем заработает клавиатура, делает этот договор враньём. Цена — Enter,
   * нажатый рефлекторно сразу после открытия, запишет первое предложение. Он не молчалив: строка
   * под фокусом обведена, её первая кнопка подписана словами каталога, а подвал называет, что
   * делает Enter. И запись эта — РАТИФИКАЦИЯ уже напечатанного, самое неудивительное из всего, что
   * панель умеет; снимается она соседним комбобоксом («— no kind —») и не уходит на сервер до
   * «Save».
   *
   * `useLayoutEffect` — потому что фокус ставится ПОСЛЕ того, как Radix поставил свой: диалог
   * фокусирует содержимое сам, и наш фокус обязан быть последним, а не первым.
   */
  const firstActionable = rows.find((r) => r.proposals.length > 0)?.index ?? rows[0]?.index ?? -1;
  const focusedOnce = useRef(false);
  useLayoutEffect(() => {
    if (focusedOnce.current || firstActionable < 0) return;
    focusedOnce.current = true;
    focusRow(firstActionable);
  }, [firstActionable, focusRow]);

  /**
   * СТРОКИ ПИКЕРА — ТЕ ЖЕ ОРГАНЫ, ЧТО У ШАГА: `searchWorks` + `groupWorks`. Третий вызыватель этой
   * пары (после строки шага и диалога создания), и общее у всех троих — сами органы, а не их
   * оформление: каждый вызыватель решает про свою первую строку сам.
   *
   * «Снять вид» стоит первой строкой и только там, где снимать есть что: на строке с записанной
   * работой пустая работа — человеческий жест, исполняемый буквально.
   */
  const filterFor = useCallback(
    (work: string) =>
      (query: string): ComboboxGroup[] => {
        const groups = groupWorks(searchWorks(catalog, query)).map((g) => ({
          key: g.key,
          label: g.label,
          options: g.items.map((w) => ({ value: w.token, label: w.label })),
        }));
        if (work && !query.trim()) {
          return [
            { key: '__unset__', label: 'this step', options: [{ value: '', label: '— no kind —' }] },
            ...groups,
          ];
        }
        return groups;
      },
    [catalog],
  );

  /**
   * ЗАПИСЬ РАБОТЫ В СТРОКУ — ЖЕСТЫ ФОРМЫ И НИ ОДНОГО ПРАВИЛА.
   *
   * Что именно записать, решает `workApplication`; здесь остаётся то же, что и у строки шага: что
   * положить и В КАКОМ ПОРЯДКЕ. Порядок несущий:
   *   1. `work` — ПЕРВОЙ И ВСЕГДА: это идентичность шага, и она едет даже тогда, когда пункта у
   *      работы нет вовсе;
   *   2. `writes` — личность работы (глагол, машинка, класс шва отстрочки, под-глагол ВТО);
   *   3. `clears` — якорь ЧУЖОГО пункта; снятие считается по УЖЕ применённому набору;
   *   4. `links` — связь с профилем парка, КЛЮЧОМ и только в пустой ключ;
   *   5. `extra` — ВТОРОЙ ФАКТ, выбранный человеком (класс шва «внакрой» у притачивания). ПОСЛЕ
   *      снятия, а не до: снятие вычислено по шагу без него и снять его не могло бы законно, но
   *      порядок «ответ человека последним» здесь ровно тот же, что и везде в этом файле.
   *
   * Имя, которого строка формы не знает, пропускается МОЛЧА — тот же щит, что у строки шага
   * (`press_action` дождался своего контракта, не написав ни разу и не сломав ни одного шага).
   */
  const apply = useCallback(
    (row: RatifyRow, p: RatifyProposal) => {
      const index = row.index;
      const path = `operations.${index}` as const;

      // «СНЯТЬ ВИД» — ОДНА ЗАПИСЬ И БОЛЬШЕ НИЧЕГО, слово в слово как у строки шага: ни глагол, ни
      // машинка, ни одно свойство не трогаются. Человек сказал «эта работа названа неправильно», а
      // не «этот шаг стал другим»; строка немедленно возвращается на прежнюю деривацию.
      if (!p.token) {
        setValue(`${path}.work`, '', { shouldDirty: true });
        setRenamedFrom((m) => {
          if (!m.has(index)) return m;
          const next = new Map(m);
          next.delete(index);
          return next;
        });
        return;
      }

      const item = catalog.byToken.get(p.token);
      if (!item) return;
      const current = toSnapshot(
        ((getValues('operations') ?? [])[index] ?? {}) as unknown as OperationRow,
      );

      setValue(`${path}.work`, p.token, { shouldDirty: true });

      const { writes, clears, links } = workApplication({
        item,
        kind: KIND_BY_WORK_TOKEN.get(p.token),
        current,
        park: { machines: parkMachines, presses: parkPresses },
      });
      for (const [field, value] of Object.entries(writes) as Array<
        [OperationFormStringField, string]
      >) {
        if (!(field in blanks)) continue;
        setValue(`${path}.${field}`, value, { shouldDirty: true });
      }
      for (const [field, value] of Object.entries(clears) as Array<
        [OperationFormStringField, string]
      >) {
        if (!(field in blanks)) continue;
        setValue(`${path}.${field}`, value, { shouldDirty: true });
      }
      if (links.machineProfileKey !== undefined) {
        setValue(`${path}.machineProfileKey`, links.machineProfileKey, { shouldDirty: true });
      }
      if (links.pressProfileKey !== undefined) {
        setValue(`${path}.pressProfileKey`, links.pressProfileKey, { shouldDirty: true });
      }
      if (p.extra && p.extra.field in blanks) {
        setValue(`${path}.${p.extra.field}`, p.extra.value, { shouldDirty: true });
      }

      // СЛЕД СМЕНЫ ПОДПИСИ. Имя ПОСЛЕ спрашивается у того же двоекодья, что и имя ДО, — у
      // `workNaming`; собрать его здесь ярлыком кнопки было бы неверно вдвойне: вторая кнопка
      // яруса A подписана ярлыком работы ПЛЮС классом шва, а записанная строка покажется одним
      // ярлыком работы.
      const naming = workNaming(catalog, p.token);
      const after = naming.kind === 'derived' ? '' : naming.text;
      setRenamedFrom((m) => {
        const next = new Map(m);
        if (row.printedNow && after && after !== row.printedNow) next.set(index, row.printedNow);
        else next.delete(index);
        return next;
      });
    },
    [blanks, catalog, getValues, parkMachines, parkPresses, setValue],
  );

  /**
   * КЛАВИАТУРА СТРОКИ: `Enter` — ЗАПИСАТЬ ПЕРВОЕ ПРЕДЛОЖЕНИЕ И ИДТИ ДАЛЬШЕ.
   *
   * СРАВНЕНИЕ ПО `e.code`, А НЕ ПО `e.key`. На кириллической раскладке сравнение с БУКВОЙ мертво;
   * Enter и Escape буквами не являются, но правило в этом файле одно на все клавиши — иначе
   * следующая добавленная сюда клавиша окажется буквой, и умрёт она молча. `NumpadEnter` — та же
   * клавиша другим кодом, и на цеховой клавиатуре жмут обычно её.
   *
   * ДЕЙСТВУЕТ, ТОЛЬКО КОГДА ФОКУС НА САМОЙ СТРОКЕ (`e.target !== e.currentTarget` → выход). Внутри
   * строки живут настоящие кнопки и комбобокс, у которых Enter СВОЙ: перехватив его здесь, панель
   * записала бы ПЕРВОЕ предложение вместо той кнопки, на которой стоит фокус, — то есть исполнила
   * бы не тот жест, который сделал человек.
   *
   * НА СТРОКЕ БЕЗ ПРЕДЛОЖЕНИЙ НЕ ПИШЕТСЯ НИЧЕГО, и фокус всё равно уходит дальше: пропускать такие
   * строки значило бы не давать на них остановиться вовсе — а именно на них человек и обязан
   * задержаться, потому что там панель молчит и адресует.
   */
  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, row: RatifyRow) => {
    if (e.target !== e.currentTarget) return;
    if (e.defaultPrevented || e.repeat) return;
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    e.preventDefault();
    const first = row.proposals[0];
    if (first) apply(row, first);
    // Последняя строка держит фокус на себе: уводить его в пустоту значило бы потерять клавиатуру
    // ровно там, где человек дошёл до конца прохода.
    if (row.index + 1 < rows.length) focusRow(row.index + 1);
  };

  const unnamed = rows.filter((r) => r.tier !== 'named').length;

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal container={document.body}>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <Dialog.Content
          data-ratify-panel='1'
          // ГРАММАТИКА ОБОЛОЧКИ — ТА ЖЕ, ЧТО У `ConfirmationModal`: белая панель, чернильная рамка,
          // полоса шапки, скроллящееся тело, руленный подвал. Своим `Dialog` панель собрана по той
          // же причине, по какой им собран фулскрин сборки: у неё СВОЙ роутер клавиш и свой
          // начальный фокус, а оба этих пропа общая оболочка наружу не отдаёт.
          className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col border border-textColor bg-bgColor text-textColor shadow-[var(--shadow-modal)] focus:outline-none lg:inset-x-auto lg:left-1/2 lg:w-full lg:max-w-5xl lg:-translate-x-1/2'
          onOpenAutoFocus={(e) => {
            // Фокус ставит ПАНЕЛЬ, а не диалог: дефолт Radix взял бы первый фокусируемый узел, то
            // есть ✕ в шапке, и первый же Enter закрыл бы экран вместо того, чтобы записать строку.
            e.preventDefault();
          }}
          onEscapeKeyDown={() => {
            // ESC ЗАКРЫВАЕТ ПАНЕЛЬ, И ЗАКРЫВАЕТ ЕЁ ОДИН ОРГАН — слой отмены самого диалога (он же
            // закрывает по клику мимо). Свой второй обработчик Escape здесь был бы ВТОРЫМ
            // писателем одного жеста: разойтись им негде сегодня и есть где завтра, когда у панели
            // появится своя внутренняя ступень (открытый комбобокс уже гасит Escape сам, до сюда
            // он не доходит). Обработчик стоит пустым НАМЕРЕННО: он существует, чтобы решение
            // «панель Escape не перехватывает» было записано в коде, а не в чьей-то памяти.
          }}
        >
          <div className='flex shrink-0 items-center gap-2 border-b border-borderColor bg-bgSecondary px-2.5 py-1.5'>
            <Dialog.Title asChild>
              <Text
                size='micro'
                variant='uppercase'
                tracking='group'
                component='span'
                className='font-bold'
              >
                ratify the kinds
              </Text>
            </Dialog.Title>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='tabular-nums'
              data-ratify-count={unnamed}
            >
              {unnamed} of {rows.length} {rows.length === 1 ? 'step' : 'steps'} not named yet
            </Text>
            <Dialog.Close asChild>
              <button type='button' aria-label='close' className='ml-auto text-labelColor'>
                ✕
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className='sr-only'>
            every step of the card with the name it prints today and what the record says about it
          </Dialog.Description>

          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>
            {/* ДЕГРАДАЦИЯ КАТАЛОГА НАЗЫВАЕТСЯ ВСЛУХ — тем же словом, что и под пикером шага.
                Молчаливый фолбэк здесь хуже, чем где-либо: человек видит кнопки, собранные из
                снимка бандла, и не знает, что список работ мог отстать от сервера. */}
            {catalog.source !== 'server' && (
              <Text
                size='micro'
                variant='label'
                component='p'
                className='mb-1.5'
                data-ratify-fallback='1'
              >
                offline list — the catalogue did not load, so most jobs search by English name only
              </Text>
            )}
            {rows.length === 0 && (
              <Text size='micro' variant='label' component='p' data-ratify-empty='1'>
                the card has no operations yet
              </Text>
            )}
            <div className='flex flex-col gap-px'>
              {rows.map((row) => (
                <RatifyLine
                  key={row.index}
                  row={row}
                  work={str(operations[row.index]?.work)}
                  note={str(operations[row.index]?.note)}
                  renamedFrom={renamedFrom.get(row.index) ?? ''}
                  filter={filterFor(str(operations[row.index]?.work))}
                  onApply={apply}
                  onOpenStep={onOpenStep}
                  onKeyDown={onRowKeyDown}
                  bindRef={(el) => rowRefs.current.set(row.index, el)}
                />
              ))}
            </div>
          </div>

          <div className='flex shrink-0 items-center gap-2 border-t border-borderColor px-2.5 py-1.5'>
            <Text size='micro' variant='label' component='span' data-ratify-hint='1'>
              enter — record the first suggestion and move on · esc — close · nothing is saved until
              you press save
            </Text>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * ОДНА СТРОКА: `№ · имя-сегодня · факты записи · [кнопка] [кнопка] · комбобокс · note`.
 *
 * КОМБОБОКС СТОИТ НА КАЖДОЙ СТРОКЕ, ВКЛЮЧАЯ ЯРУСЫ БЕЗ ПРЕДЛОЖЕНИЙ. Кнопка — КОРОТКИЙ путь (то, что
 * запись подтверждает сама), комбобокс — ПОЛНЫЙ (все работы каталога, с поиском по русскому слову),
 * и полный обязан быть всегда: экран, у которого на строке нет ни одной кнопки И нет способа
 * назвать работу вручную, — это экран, который ничего не вернул.
 */
function RatifyLine({
  row,
  work,
  note,
  renamedFrom,
  filter,
  onApply,
  onOpenStep,
  onKeyDown,
  bindRef,
}: {
  row: RatifyRow;
  work: string;
  note: string;
  renamedFrom: string;
  filter: (query: string) => ComboboxGroup[];
  onApply: (row: RatifyRow, p: RatifyProposal) => void;
  onOpenStep: (index: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, row: RatifyRow) => void;
  bindRef: (el: HTMLDivElement | null) => void;
}) {
  const muted = row.tier === 'named';
  const tierWord = TIER_WORD[row.tier];
  return (
    <div
      ref={bindRef}
      tabIndex={0}
      data-ratify-row={row.index}
      data-ratify-tier={row.tier}
      // ПРИГЛУШЕНИЕ — ФАКТ, А НЕ СТИЛЬ, и потому оно объявлено атрибутом рядом с классом: строка с
      // уже записанной работой стоит здесь ради контекста «а как названы соседи», и отличать её от
      // строки, ждущей ответа, обязан не только глаз.
      data-ratify-muted={muted ? '1' : undefined}
      onKeyDown={(e) => onKeyDown(e, row)}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 border border-transparent px-1 py-1',
        'focus:border-textColor focus:outline-none',
        muted ? 'text-labelColor' : 'bg-bgColor',
      )}
    >
      <Text
        size='control'
        component='span'
        className='w-6 shrink-0 font-bold tabular-nums'
        data-ratify-number={row.index}
      >
        {opNumber(row.index)}
      </Text>
      <Text
        size='control'
        component='span'
        className='min-w-[9rem] shrink-0'
        data-ratify-printed={row.index}
      >
        {/* ПУСТОЕ ИМЯ — ЗАКОННЫЙ ОТВЕТ, И ОН ЗНАЧИТ «ЗАПИСЬ НЕ ОТВЕЧАЕТ», а не «не загрузилось».
            Ни одна из 111 прод-строк сюда не попадает: резолв называет их все. */}
        {row.printedNow || 'no name — neither the work nor the two axes answer'}
      </Text>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='min-w-0 flex-1'
        data-ratify-evidence={row.index}
      >
        {row.evidence.join(' · ')}
      </Text>

      {row.proposals.map((p, i) => (
        <Button
          key={`${p.token}:${p.extra?.value ?? ''}`}
          type='button'
          variant={i === 0 ? 'main' : 'secondary'}
          size='xs'
          data-ratify-proposal={`${row.index}.${i}`}
          onClick={() => onApply(row, p)}
        >
          {p.label}
        </Button>
      ))}

      <div className='w-[190px] shrink-0'>
        <Combobox
          name={`ratifyWork-${row.index}`}
          placeholder='pick any kind'
          searchPlaceholder='type the work — Russian or English'
          valueLabel={row.tier === 'named' ? row.printedNow : ''}
          filter={filter}
          // ПОЛНЫЙ ПУТЬ ВЕДЁТ В ТОГО ЖЕ ПИСАТЕЛЯ, ЧТО И КОРОТКИЙ. Работа, выбранная в комбобоксе,
          // записывается ровно тем же `workApplication` — иначе у панели было бы два разных ответа
          // на один вопрос «что пишет выбор работы», и разошлись бы они молча.
          onSelect={(token) => onApply(row, { token, label: '' })}
        />
      </div>

      {/* АДРЕСАЦИЯ, А НЕ КОПИЯ КОНТРОЛА. Недостающий вход, незаписанный приём ВТО, класс шва без
          работы — всё это заполняется на СВОИХ контролах открытого шага, и панель ведёт туда.
          Кнопка стоит на КАЖДОЙ строке, а не только на молчащих: «посмотреть, что там на самом
          деле» — законный вопрос к любой строке, включая ту, что панель предлагает подтвердить. */}
      <Chip dashed onClick={() => onOpenStep(row.index)} data-ratify-open={row.index}>
        open the step
      </Chip>

      {tierWord && (
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-full'
          data-ratify-word={row.index}
        >
          {tierWord}
        </Text>
      )}
      {/* ПРЕДУПРЕЖДЕНИЕ КНОПКИ ЖИВЁТ ВОЗЛЕ КНОПКИ И ДО НАЖАТИЯ. Обмётанная прорезь требует длины
          прорези, и узнать об этом ПОСЛЕ нажатия значит узнать об этом на «Save», через три экрана
          от кнопки. Отдельным узлом, а не внутри кнопки: подпись кнопки — цитата каталога. */}
      {row.proposals.map((p, i) =>
        p.warn ? (
          <Text
            key={`warn-${p.token}-${i}`}
            size='micro'
            variant='label'
            component='span'
            className='w-full'
            data-ratify-warn={`${row.index}.${i}`}
          >
            {p.label} — {p.warn}
          </Text>
        ) : null,
      )}
      {renamedFrom && (
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-full'
          data-ratify-renamed={row.index}
        >
          the card printed it as “{renamedFrom}” until now — same job, the catalogue words it
          differently
        </Text>
      )}
      {note && (
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-full'
          data-ratify-note={row.index}
        >
          note: {note.trim().split('\n')[0]}
        </Text>
      )}
    </div>
  );
}

export default OperationsRatifyPanel;
