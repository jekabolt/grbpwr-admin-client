import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import {
  ensurePantoneLibrary,
  findPantone,
  normalizePantone,
  PANTONE_SHADES,
  pantoneCount,
  pantoneLibraryState,
  pantoneVersion,
  searchPantone,
  subscribePantone,
  type PantoneFamily,
  type PantoneShade,
  type PantoneSwatch,
} from './pantone-swatches';

/**
 * A Pantone reference picked by searching — «Search Pantone code or colour» (owner, C-8 snapshot).
 *
 * THE PRIMITIVE HOLDS NO VALUE AND KNOWS NO SCHEMA. What the picked code is written to is the
 * caller's decision, and the caller says so next to the trigger.
 *
 * `label` IS WHERE AN INHERITED VALUE GOES. The trigger renders `value` in ink and `label` in the
 * grey label variant, so a caller with a senior fallback (the linked article's own pantone) passes
 * it as `label`: the row then reads «shown, but not mine» without a second control and without this
 * file learning what a BOM line is.
 *
 * TYPED CODES ARE ACCEPTED AS TYPED, AND A FULL LIBRARY DOES NOT CHANGE THAT — the dyehouse's own
 * number is in no book, so the query itself stays offered as the first row whenever it reads as a
 * reference. What counts as a reference and what spelling is stored are ONE answer,
 * `normalizePantone`; this file never re-decides either.
 *
 * ═══ КРУПНЫЕ СВОТЧИ И ДВЕ СЕМЬИ (владелец, r3 пп.13 и 25) ══════════════════════════════════════
 *
 * Дословно: «COLOUR: один бедный пикер, выглядит не очень; очень мало цветов в пантоне» и
 * «пантон-пикер: крупнее свотчи».
 *
 * ЧТО БЫЛО ЗАМЕРЕНО. Список — 120 записей, все текстильные; `searchPantone` отдавал ПЕРВЫЕ 24, то
 * есть открывший пикер видел пятую часть набора и ни одного solid-кода; каждая запись — строка
 * высотой 22px со свотчем 12 × 12. Цвет по свотчу 12 пикселей не выбирают — по нему сверяют, что
 * не ошиблись строкой. Отсюда «бедный»: орган был СПИСКОМ, а вопрос к нему — «какой из этих».
 *
 * ЧТО СТАЛО. Сетка свотчей 60px (потолок п.25 — 56–64) с кодом ПОД свотчем, две семьи двумя
 * секциями одного скроллера, и ни одной новой кнопки: переключателя семей нет НАРОЧНО — владелец
 * в этом же круге просит «не пихай кучу кнопок в одном месте», а секция, которую поиск опустошил,
 * просто не рисуется. Ряд «use “…” as typed» стоит там же, где стоял.
 *
 * ⚠ LISTBOX — ЭТО СЕТКА СЕМЬИ, А НЕ СКРОЛЛЕР, И РАЗМЕТКА ЗДЕСЬ НЕСУЩАЯ: заголовок семьи и её
 * «show more» лежат СНАРУЖИ списка, потому что детьми listbox'а могут быть только опции — иначе
 * читалка объявила бы и заголовок, и кнопку выбираемыми пунктами.
 *
 * ═══ ВСЯ БИБЛИОТЕКА, НО НЕ ВСЯ СРАЗУ (круг 4) ═════════════════════════════════════════════════
 *
 * Владелец повторил: «почему в пантоне так мало цветов». Их было 274 из ~4 700.
 *
 * ТРИ ПРАВКИ, И КАЖДАЯ ЗАКРЫВАЕТ СВОЮ ПОЛОВИНУ ЖАЛОБЫ:
 *
 *   · НАБОР. `ensurePantoneLibrary()` при первом ОТКРЫТИИ тянет полную библиотеку отдельным
 *     чанком; до этого и при отказе сетка живёт отобранными 274. Подписка — `useSyncExternalStore`
 *     на версию набора: чанк приезжает в чужом такте, и без подписки сетка осталась бы прежней до
 *     следующего нажатия клавиши.
 *   · СЕТКА. 4 700 кнопок в поповере — это секунды на раскладку, поэтому семья рисует ПЕРВЫЕ 120,
 *     а дальше по кнопке. Не бесконечная лента: «show more» видно, оно попадает под клавиатуру и
 *     говорит, сколько осталось. Поиск при этом идёт по ВСЕМУ набору, а не по нарисованному.
 *   · ПОДВАЛ. Он больше не извиняется («suggestions, not the full library») — он НАЗЫВАЕТ ЧИСЛО.
 *     Ровно на этот вопрос владелец и жаловался, и ответ на него — цифра, а не оговорка.
 *
 * ⚠ ПОТОЛОК СТОИТ У КОРНЯ ПИКЕРА, А НЕ У СЕТКИ. У поповера свой скролл; если бы высоту брала
 * сетка, поле поиска уезжало бы вместе с ней, и после первого же прокрута набирать было бы негде.
 * Поэтому потолок — на корне (число берётся у поповера, `--popover-body-max`), а `min-h-0 flex-1`
 * отдаёт сетке ОСТАТОК: поиск и подвал стоят, листается только сетка. `overscroll-contain` не
 * пускает докрученное колесо дальше — иначе на упоре уезжала бы страница под модалкой.
 *
 * ═══ ОТТЕНКИ И «FROM THIS CARD» (шаг 3 выкроек, B5) ═══════════════════════════════════════════
 *
 * Владелец: «юзер должен иметь возможность выбрать цвет из пантон пикера удобным интерфейсом с
 * поиском по подцветам» — и в том же сообщении: «не усложняй дизайн … не пихай кучу кнопок … дай
 * больше спейсинга».
 *
 * ПОЛОСА ОТТЕНКОВ — ДВЕНАДЦАТЬ КВАДРАТОВ 16px, А НЕ ДВЕНАДЦАТЬ СЛОВ. Ряд текстовых чипов
 * («all · red · orange · …») занял бы 634px и лёг бы в окне 420px двумя строками — та самая «куча
 * кнопок». Квадрат, залитый образцом оттенка, опознаётся быстрее слова и укладывает все двенадцать
 * в одну строку. Слово при этом не пропало, оно живёт в двух местах: в подсказке (`title`,
 * `aria-label`) и в ПОИСКЕ — «green», «grey»/«gray», «navy», «olive», «beige», «ivory», «cream»
 * сужают выдачу по оттенку так же, как щелчок по квадрату (`searchPantone`). Ведущее «all»
 * снимает фильтр; повторный щелчок по выбранному квадрату — тоже.
 *
 * ⚠ ОТТЕНОК ПОСЧИТАН ИЗ ЭКРАННОГО ПРИБЛИЖЕНИЯ (`hex`, см. шапку `pantone-swatches.ts`), ПОЭТОМУ ОН
 * — СПОСОБ НАЙТИ КОД И НИКОГДА НЕ УТВЕРЖДЕНИЕ О СТАНДАРТЕ. «Этот код лежит в teal» значит «на
 * экране он бирюзовый, ищи его там», и ничего больше: в карточку по-прежнему уезжает один код, а
 * цвет на границе двух оттенков лежит в одном из них и находится во втором по имени.
 *
 * ФИЛЬТР СУЖАЕТ ОБЕ СЕМЬИ, И ЧИСЛО В ЗАГОЛОВКЕ СЕМЬИ СЧИТАЕТ УЖЕ ОТФИЛЬТРОВАННОЕ. Внутри оттенка
 * сетка идёт от светлого к тёмному — градиентом, где соседа ищут глазом. Выбранный квадрат обведён
 * 2px чернилом, а СЛОВО оттенка печатается ещё и в заголовке каждой семьи: какой фильтр включён,
 * не должно держаться на одном цвете квадрата (DESIGN.md, Monochrome Rule). Фокус при открытии —
 * по-прежнему поле поиска; квадраты стоят после него в порядке таба.
 *
 * «FROM THIS CARD». Вызывающий передаёт `suggested` — пантон колорвея, рецепт слота, — и пока
 * запрос пуст, они стоят первой секцией: ради них пикер открывают чаще всего, и листать к ним
 * через 4 700 кодов незачем. Дубли схлопываются (подписи — через « · »); код, которого нет в
 * наборе, рисуется пунктирным квадратом и выбирается так же — это тот же «use as typed», только
 * набранный раньше и в другом месте карточки.
 *
 * Ширина осталась 420px, и ни одной новой кнопки-глагола: «clear», «show more», «use as typed» —
 * прежние. Отступы — токенами системы: 10px между полем, полосой и выдачей, 16px между секциями
 * выдачи (было 8 и 10).
 */

/** Сколько свотчей семья рисует сразу и сколько добавляет «show more». */
const PAGE = 120;
const FIRST_PAGE: Record<PantoneFamily, number> = { textile: PAGE, solid: PAGE };

/** Предложение «from this card», уже сведённое с набором: `hex` нет — кода нет в наборе. */
type Suggestion = { code: string; hex?: string; name?: string; note: string };

/**
 * Сводит `suggested` с набором. Код ищется так же, как его ищет триггер (`findPantone`, после
 * `normalizePantone`, чтобы «407c» нашёл «407 C»), но ⚠ ПРЕФИКСНЫЙ ХВОСТ `findPantone` ЗДЕСЬ НЕ
 * ПРИНИМАЕТСЯ: огрызок «19-40» он отдал бы первым попавшимся «19-4007 TCX», и предложение молча
 * подменило бы код карточки чужим. Принимается только сам код или он же с хвостом семьи.
 */
function resolveSuggestions(suggested: { code: string; label: string }[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const { code: raw, label } of suggested) {
    const typed = raw.trim();
    if (!typed) continue;
    const want = (normalizePantone(typed) || typed).toLowerCase();
    const hit = findPantone(want);
    const found = hit?.code.toLowerCase();
    const swatch = found === want || found?.startsWith(`${want} `) ? hit : undefined;
    const code = swatch?.code ?? typed;
    const twin = out.find((o) => o.code.toLowerCase() === code.toLowerCase());
    if (twin) {
      if (label && !twin.note.split(' · ').includes(label)) {
        twin.note = twin.note ? `${twin.note} · ${label}` : label;
      }
      continue;
    }
    out.push({ code, hex: swatch?.hex, name: swatch?.name, note: label });
  }
  return out;
}

/**
 * Одна ячейка сетки — общая для семей и для «from this card». Без `hex` квадрат пунктирный: так
 * же, как у строки «use as typed», пунктир значит «код есть, образца нет».
 */
function SwatchOption({
  code,
  hex,
  note,
  title,
  on,
  onPick,
}: {
  code: string;
  hex?: string;
  /** Вторая строка под кодом — откуда предложение («colourway», «recipe»). */
  note?: string;
  title: string;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type='button'
      role='option'
      aria-selected={on}
      data-pantone-option={code}
      title={title}
      onClick={onPick}
      className={`flex min-w-0 flex-col gap-0.5 p-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ${
        on ? 'bg-textColor' : 'hover:bg-bgZebra'
      }`}
    >
      <span
        aria-hidden
        className={`block w-full border border-borderColor ${hex ? '' : 'border-dashed'}`}
        style={{ background: hex, aspectRatio: '1/1' }}
      />
      {/* Код ПОД свотчем (п.25). Имя не печатается: в ячейку 60px оно легло бы тремя строками —
          оно живёт в `title` и в поиске. */}
      <span
        className={`block min-w-0 truncate text-nano uppercase tracking-label ${
          on ? '!text-bgColor' : ''
        }`}
      >
        {code}
      </span>
      {note && (
        <span
          className={`block min-w-0 truncate text-nano uppercase tracking-label ${
            on ? '!text-bgColor' : 'text-labelColor'
          }`}
        >
          {note}
        </span>
      )}
    </button>
  );
}

export function PantonePicker({
  value,
  onPick,
  disabled,
  label = 'pick',
  name,
  suggested,
}: {
  value?: string;
  /** '' clears. */
  onPick: (code: string) => void;
  disabled?: boolean;
  /** Trigger text when nothing is picked yet. */
  label?: string;
  /** Anchor for probes and labels — one per row. */
  name: string;
  /**
   * Codes this card already speaks — the colourway's pantone, the slot's recipe pantone. Shown as
   * the first section «from this card» while the query is empty; `label` says where each is from.
   */
  suggested?: { code: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [shade, setShade] = useState<PantoneShade | undefined>(undefined);
  const [page, setPage] = useState<Record<PantoneFamily, number>>(FIRST_PAGE);

  // Набор растёт в чужом такте — этим снимком рендер узнаёт, что он вырос.
  const version = useSyncExternalStore(subscribePantone, pantoneVersion, pantoneVersion);
  useEffect(() => {
    if (open) void ensurePantoneLibrary();
  }, [open]);

  const textile = useMemo(
    () => searchPantone(query, { family: 'textile', shade }),
    [query, shade, version],
  );
  const solid = useMemo(
    () => searchPantone(query, { family: 'solid', shade }),
    [query, shade, version],
  );
  // Библиотека дописывается в набор — код, который до её приезда был «не из набора», после
  // приезда находит свой образец, поэтому `version` здесь тоже зависимость.
  const fromCard = useMemo(() => resolveSuggestions(suggested ?? []), [suggested, version]);

  const typed = query.trim();
  /**
   * НАБРАННОЕ, ПРИВЕДЁННОЕ К ХРАНИМОМУ НАПИСАНИЮ — и одновременно ответ на вопрос «ссылка ли это»
   * (пусто = не ссылка). Строка предлагает РОВНО ТО, что и положит: человек набирает «407c», в
   * кнопке стоит «407 C», в поле уезжает «407 C».
   */
  const typedCode = normalizePantone(typed);
  const current = findPantone(value);
  /** «From this card» — только пока запрос пуст: набравший уже знает, чего ищет. */
  const showCard = !typed && fromCard.length > 0;

  const reset = () => {
    setQuery('');
    setShade(undefined);
    setPage(FIRST_PAGE);
  };

  const choose = (code: string) => {
    onPick(code.trim());
    reset();
    setOpen(false);
  };

  const search = (next: string) => {
    setQuery(next);
    // Новый запрос — новая выдача: досмотренные страницы прежней к ней отношения не имеют.
    setPage(FIRST_PAGE);
  };

  const pickShade = (next: PantoneShade | undefined) => {
    setShade(next);
    // Та же причина, что у `search`: другой оттенок — другая выдача.
    setPage(FIRST_PAGE);
  };

  /** Две секции одного списка. Пустая не рисуется — поиск сам решает, какие семьи остались. */
  const families: { family: PantoneFamily; head: string; rows: PantoneSwatch[] }[] = [
    { family: 'textile', head: 'textile · tcx', rows: textile },
    { family: 'solid', head: 'solid coated · c', rows: solid },
  ];
  /** Enter без кода в запросе берёт ПЕРВЫЙ ВИДИМЫЙ свотч — при пустом запросе это «from this card». */
  const firstCode =
    (showCard ? fromCard[0]?.code : undefined) ?? textile[0]?.code ?? solid[0]?.code;

  const libraryState = pantoneLibraryState();
  const total = pantoneCount();

  return (
    <GenericPopover
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        setOpen(o);
        if (!o) reset();
      }}
      title='pantone'
      noTail
      contentProps={{ align: 'start' }}
      // The probe anchor rides on the trigger as a data attribute; Radix's prop type lists no
      // `data-*`, so it goes in through a spread rather than a literal key the checker can refuse.
      triggerProps={{
        className: 'flex items-center',
        disabled,
        ...({ 'data-pantone-picker': name } as Record<string, string>),
      }}
      className='w-[420px] max-w-[calc(100vw-1.5rem)]'
      openElement={
        <span
          className={`inline-flex min-h-[22px] items-center gap-1.5 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left ${
            disabled ? 'text-textInactiveColor' : 'hover:border-textColor'
          }`}
        >
          {current && (
            <span
              aria-hidden
              className='size-3 shrink-0 border border-borderColor'
              style={{ background: current.hex }}
            />
          )}
          <Text
            component='span'
            size='micro'
            variant={value ? 'default' : 'label'}
            className='uppercase'
          >
            {value?.trim() || label}
          </Text>
          <Text size='micro' variant='label' component='span' aria-hidden>
            ▾
          </Text>
        </span>
      }
    >
      {/* ПОТОЛОК БЕРЁТСЯ У ПОПОВЕРА, А НЕ НАЗНАЧАЕТСЯ ЗАНОВО. `--popover-body-max` — то самое
          число, которым тело поповера уже ограничило себя (`ui/components/popover.tsx`); минус
          12px его собственных полей. Своё «50vh» здесь разошлось бы с ним при первой же правке
          там, и разошлось бы молча.
          ⚠ ПОДЧЁРКИВАНИЯ В `calc` — НЕ ОПЕЧАТКА: в произвольном значении Tailwind пробел пишется
          как `_`, а без пробелов вокруг минуса `calc` невалиден и потолок молча не применяется.
          Первый заход именно так и промахнулся: сетка выросла на 5 326px и не листалась вовсе. */}
      <div className='flex max-h-[calc(var(--popover-body-max)_-_12px)] min-h-0 flex-col gap-2.5'>
        <Input
          name={`pantone-search-${name}`}
          value={query}
          autoFocus
          placeholder='Search Pantone code or colour'
          data-pantone-search={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => search(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            // Enter takes the typed reference when it reads as one, else the first hit. Compared
            // with the key NAME, never a letter — letters die on a Cyrillic layout.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (typedCode) choose(typedCode);
            else if (firstCode) choose(firstCode);
          }}
        />

        {/* ПОЛОСА ОТТЕНКОВ — см. шапку. Кнопки с `aria-pressed`, а не радиогруппа: радиогруппа
            обещает стрелки, а здесь обычный таб, и обещание, которое не выполняется, хуже
            отсутствующего. Нажата ровно одна из тринадцати: «all» или квадрат. */}
        <div
          role='group'
          aria-label='shade'
          data-pantone-shades={name}
          className='flex shrink-0 flex-wrap items-center gap-1.5'
        >
          <button
            type='button'
            aria-pressed={!shade}
            data-pantone-shade='all'
            onClick={() => pickShade(undefined)}
            className={`text-nano uppercase tracking-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ${
              shade ? 'text-labelColor hover:text-textColor' : 'font-bold text-textColor'
            }`}
          >
            all
          </button>
          {PANTONE_SHADES.map((s) => {
            const on = shade === s.id;
            return (
              <button
                key={s.id}
                type='button'
                aria-pressed={on}
                aria-label={s.label}
                title={s.label}
                data-pantone-shade={s.id}
                onClick={() => pickShade(on ? undefined : s.id)}
                style={{ background: s.hex }}
                className={`size-4 shrink-0 border border-borderColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ${
                  on
                    ? 'outline outline-2 outline-offset-1 outline-textColor'
                    : 'hover:border-textColor'
                }`}
              />
            );
          })}
        </div>

        {typedCode && (
          <button
            type='button'
            data-pantone-typed={name}
            onClick={() => choose(typedCode)}
            className='flex w-full shrink-0 items-center gap-2 border border-borderColor bg-bgColor px-1.5 py-1 text-left hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            <span aria-hidden className='size-4 shrink-0 border border-dashed border-borderColor' />
            <Text component='span' size='micro' className='uppercase'>
              use “{typedCode}” as typed
            </Text>
          </button>
        )}

        {/* ⚠ СКРОЛЛЕР — НЕ LISTBOX, И ЭТО ПРАВКА ЭТОГО КРУГА. Раньше `role='listbox'` стоял здесь,
            на скроллере, а семьи лежали внутри как `role='group'`. С кнопкой «show more» такая
            разметка стала неверной: у listbox'а детьми могут быть только опции и группы, а кнопка
            — ни то, ни другое, и читалка объявила бы её пунктом списка. Поэтому listbox теперь
            СЕТКА каждой семьи, а заголовок и «show more» лежат снаружи неё. */}
        <div
          className='min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain'
          data-pantone-scroll={name}
        >
          {/* «From this card» — та же раскладка, что у семьи: заголовок снаружи listbox'а. */}
          {showCard && (
            <div data-pantone-suggested={name}>
              <div className='mb-1.5 flex items-baseline gap-2 border-b border-borderColor pb-0.5'>
                <Text
                  size='nano'
                  variant='uppercase'
                  tracking='group'
                  component='span'
                  className='text-labelColor'
                >
                  from this card
                </Text>
                <Text size='nano' variant='label' component='span' className='ml-auto'>
                  {fromCard.length}
                </Text>
              </div>
              <div
                role='listbox'
                aria-label='from this card'
                className='grid gap-1.5'
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))' }}
              >
                {fromCard.map((s) => (
                  <SwatchOption
                    key={s.code}
                    code={s.code}
                    hex={s.hex}
                    note={s.note}
                    title={[s.code, s.name, s.note].filter(Boolean).join(' · ')}
                    on={s.code === value}
                    onPick={() => choose(s.code)}
                  />
                ))}
              </div>
            </div>
          )}
          {textile.length === 0 && solid.length === 0 && !typedCode && (
            <Text size='micro' variant='label' className='py-1' data-pantone-empty={name}>
              {typed ? `nothing matches “${typed}”` : 'nothing'}
              {shade ? ` in ${shade}` : ''} — type the reference itself, e.g. 19-4005 TCX or 407 C
            </Text>
          )}
          {families.map((group) => {
            if (group.rows.length === 0) return null;
            const shown = Math.min(page[group.family], group.rows.length);
            const left = group.rows.length - shown;
            // Слово оттенка — в заголовке семьи, чтобы фильтр читался словом, а не только обводкой.
            const head = shade ? `${group.head} · ${shade}` : group.head;
            return (
              /* Семья — заголовок плюс список. `div`, а не `section`: секция без
                 доступного имени всё равно остаётся обычным узлом, только выглядит обещанием. */
              <div key={group.family} data-pantone-family={group.family}>
                <div className='mb-1.5 flex items-baseline gap-2 border-b border-borderColor pb-0.5'>
                  <Text
                    size='nano'
                    variant='uppercase'
                    tracking='group'
                    component='span'
                    className='text-labelColor'
                  >
                    {head}
                  </Text>
                  {/* Сколько семья нашла — иначе «показано 120» и «нашлось 120» неотличимы. С
                      оттенком — сколько нашлось В НЁМ. */}
                  <Text size='nano' variant='label' component='span' className='ml-auto'>
                    {group.rows.length.toLocaleString('en-US')}
                  </Text>
                </div>
                {/* 60px — потолок п.25 (56–64). Колонок столько, сколько влезет: ширина окна
                    фиксирована, а сетка не обязана знать их число. */}
                <div
                  role='listbox'
                  aria-label={head}
                  className='grid gap-1.5'
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))' }}
                >
                  {group.rows.slice(0, shown).map((s) => (
                    <SwatchOption
                      key={s.code}
                      code={s.code}
                      hex={s.hex}
                      title={s.name ? `${s.code} · ${s.name}` : s.code}
                      on={s.code === value}
                      onPick={() => choose(s.code)}
                    />
                  ))}
                </div>
                {left > 0 && (
                  <button
                    type='button'
                    data-pantone-more={group.family}
                    onClick={() =>
                      setPage((p) => ({ ...p, [group.family]: p[group.family] + PAGE }))
                    }
                    className='mt-1.5 w-full border border-borderColor bg-bgColor px-1.5 py-1 text-center hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  >
                    <Text component='span' size='nano' variant='uppercase' tracking='label'>
                      show more · {left.toLocaleString('en-US')} left
                    </Text>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className='flex shrink-0 items-center justify-between gap-2 border-t border-borderColor pt-1.5'>
          {/* ЧИСЛО, А НЕ ОГОВОРКА. Прежняя строка извинялась («suggestions, not the full library»)
              — ровно за то, на что владелец и жаловался. Теперь она называет размер набора, и
              вторым фактом остаётся то, что от него не зависит: свотч на экране — приближение, в
              спецификацию едет КОД. */}
          <Text
            size='nano'
            variant='label'
            component='span'
            className='normal-case'
            data-pantone-total={name}
          >
            {libraryState === 'loading' &&
              `${total.toLocaleString('en-US')} references, loading the rest…`}
            {libraryState === 'ready' &&
              `${total.toLocaleString('en-US')} references · swatches are approximate · any code can be typed`}
            {libraryState === 'failed' &&
              `${total.toLocaleString('en-US')} references — the full library did not load · any code can be typed`}
            {libraryState === 'idle' &&
              `${total.toLocaleString('en-US')} references · swatches are approximate · any code can be typed`}
          </Text>
          {value?.trim() && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              data-pantone-clear={name}
              onClick={() => choose('')}
            >
              clear
            </Button>
          )}
        </div>
      </div>
    </GenericPopover>
  );
}
