import { useRef, useState, type JSX } from 'react';
import { buttonVariants } from 'ui/components/button';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';

/**
 * ═══ ПИКЕР, КОТОРЫЙ ЗАДАЁТ ДВА ВОПРОСА ПО ОДНОМУ, А НЕ ОБА СРАЗУ ══════════════════════════════
 *
 * Владелец, живьём по бете: «в STEP 4 FABRIC RENDER → RENDERS OF THIS CARD очень кривой пикер на
 * mark ▸ относительно нашей новой логики: надо спросить колорвей сначала, потом уже сторону —
 * сейчас в пикере очень много всего и это не читается вообще».
 *
 * ЧТО ТАМ БЫЛО ЧИСЛОМ. Один Radix-селект с ПЛОСКИМ списком: шесть своих сторон, потом по шесть
 * сторон на каждый живой колорвей карточки, потом `+ colourway…`. При двух колорвеях это
 * девятнадцать пунктов вида `ROSSO › side left · replaces #31` в колонке 132 пикселя — то есть имя
 * столбца повторено шесть раз подряд, а сама сторона, ради которой список и открыли, стоит третьим
 * словом строки. Список отвечал на ДВА вопроса одновременно («в какой столбец» и «в какую
 * сторону») и потому не отвечал ни на один.
 *
 * ЧТО ЗДЕСЬ ВМЕСТО. Тот же ОДИН орган и то же одно нажатие на открытие, но вопросы разведены во
 * времени: шаг 1 — ветки (колорвеи), шаг 2 — листья выбранной ветки (стороны). Ветка ровно одна —
 * шага 1 не существует вовсе, и жест остаётся ровно таким, каким он был у плиты именованного
 * колорвея: открыл, выбрал сторону, закрыл.
 *
 * ⚠ ПОЧЕМУ ПОПОВЕР, А НЕ ВТОРОЙ СЕЛЕКТ И НЕ ВТОРАЯ КНОПКА В РЯДУ.
 *   · Два селекта («сначала колорвей, потом сторона») — это ДВА ОРГАНА на один жест, ровно то,
 *     чего владелец просил не делать, и ряд дверей плитки (F-9) держит одну живую дверь на ячейку;
 *   · вложить `Select` в `Select` нельзя вовсе: Radix отдаёт списку собственный слой закрытия, и
 *     два таких слоя спорят о том, кто верхний;
 *   · `@radix-ui/react-dropdown-menu` в этом приложении не стоит, а заводить пакет ради подменю —
 *     это второй словарь всплывающих списков рядом с уже существующим `ui/components/popover`.
 * Поповер приложения при этом уже умеет то, ради чего его и берут: он ПОРТАЛИТСЯ (полоса выходов
 * объявлена `overflow-x-auto`, и панель внутри неё была бы обрезана), несёт панель в 240px вместо
 * 132px колонки и держит `Escape` с возвратом фокуса на дверь.
 *
 * ⚠ КЛАВИАТУРА НАПИСАНА РУКОЙ, И ЭТО НЕ УКРАШЕНИЕ: поповер, в отличие от селекта, стрелок не
 * знает. Строки — настоящие `<button>` с `tabIndex={-1}` и переходом по ↑/↓/Home/End; ← и Backspace
 * возвращают на шаг 1 (тот же жест, что «назад» мышью). Совпадение с раскладкой не проверяется по
 * букве — только по служебным клавишам, у которых `e.key` одинаков в любой раскладке (память
 * `cyrillic-layout-kills-e-key`).
 *
 * ЧЕГО ЭТОТ ОРГАН НЕ ЗНАЕТ: провода, колорвеев, сторон и слова «render». Ветки и листья приходят
 * готовыми, выбор уезжает наружу парой «ветка, значение листа». Поэтому он и стоит в `core`.
 */

/** Лист — то, ЧТО в итоге выбирают. `note` — тихая правая приписка («replaces #31»). */
export type PickerLeaf = {
  value: string;
  label: string;
  note?: string;
  title?: string;
};

/** Ветка — то, У КОГО выбирают. `note` — тихая правая приписка («2/6»). */
export type PickerBranch = {
  id: number;
  label: string;
  note?: string;
  title?: string;
  leaves: PickerLeaf[];
};

/* Строка панели одной мерой на оба шага: 24px — та же клетка, что у пункта `ui/components/select`
   (`SelectItem`, `min-h-6 px-2.5`), и подсветка та же (`rgba(0,0,0,0.08)`). Второе написание
   всплывающего списка разошлось бы с первым на первой же правке скина.
   ⚠ `:focus`, А НЕ ТОЛЬКО `:focus-visible`: фокус сюда приводят СТРЕЛКИ, программным `focus()`, и
   браузер такой фокус законно считает не-клавиатурным — подсветки бы не было вовсе. */
const ROW =
  'flex min-h-6 w-full select-none items-center gap-2 px-2 text-left hover:bg-[rgba(0,0,0,0.08)] focus:bg-[rgba(0,0,0,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor';
/* Полем панели строка не ограничена: подсветка обязана доходить до кромки, иначе она читается
   плашкой внутри списка, а не выбранной строкой списка. Отбивку панели снимает обёртка. */
const BLEED = '-mx-2 -my-1.5';

export function TwoStepPicker({
  face,
  title,
  branches,
  onPick,
  create,
  disabled,
  triggerClassName,
  triggerTitle,
  branchNoun = 'branches',
  leafNoun = 'items',
}: {
  /** Лицо двери. Метрика ряда — снаружи, `triggerClassName` (F-9). */
  face: string;
  /** Шапка панели. Одна на оба шага: прыгающий заголовок читается как другая панель. */
  title: string;
  branches: PickerBranch[];
  onPick: (branchId: number, value: string) => void;
  /**
   * Последний пункт шага 1 — «завести ветку». `open` получает продолжение жеста: как только ветка
   * родилась, панель открывается СНОВА и сразу на её листьях. Пункт отвечает на вопрос ШАГА 1
   * («в какой столбец»), поэтому на шаге 2 его нет.
   */
  create?: { face: string; open: (then: (branchId: number) => void) => void };
  disabled?: boolean;
  triggerClassName?: string;
  triggerTitle?: string;
  /** Как назвать список шага 1 читалке («colourways»). */
  branchNoun?: string;
  /** Как назвать список шага 2 («sides») — имя ветки дописывается само. */
  leafNoun?: string;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  /** На чьих листьях стоит панель. `null` — на шаге 1. */
  const [branchId, setBranchId] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  /**
   * ⚠ ЗАКРЫТИЕ РАДИ ЧУЖОГО ОКНА НЕ ВОЗВРАЩАЕТ ФОКУС НА ДВЕРЬ. Пункт «завести ветку» закрывает эту
   * панель и открывает МОДАЛКУ рождения; Radix по умолчанию уводит фокус обратно на триггер, и он
   * успевает сделать это после того, как модалка забрала свой, — курсор оказывается под окном.
   */
  const handingOff = useRef(false);

  /**
   * ВЕТКА ОДНА — ШАГА 1 НЕ СУЩЕСТВУЕТ. Не «пропускается по флагу», а невыразим: выбирать не из
   * чего, и панель открывается сразу листьями. `create` эту единственность отменяет — с ним
   * выбор на шаге 1 есть всегда (эта ветка ЛИБО новая).
   */
  const only = branches.length === 1 && !create ? branches[0] : null;
  /**
   * ⚠ ВЕТКА ИЩЕТСЯ В СПИСКЕ, А НЕ ХРАНИТСЯ ЦЕЛИКОМ. Продолжение жеста после рождения приносит
   * ГОЛЫЙ id, и список к этому моменту уже пересобран (`onCreated` резолвится после
   * `invalidateQueries`). Ссылка на объект прежней сборки была бы снимком чужого круга; id, не
   * нашедшийся в списке, честно возвращает панель на шаг 1 вместо страницы с пустыми листьями.
   */
  const branch = only ?? branches.find((b) => b.id === branchId) ?? null;

  if (!branches.length && !create) return null;

  const close = () => {
    setOpen(false);
    setBranchId(null);
  };

  /** Строки панели в порядке документа — по ним и ходят стрелки. */
  /* `Array.from`, а не спред: `NodeListOf` под этим `lib`/`downlevelIteration` не итерируется, и
     спред здесь — ошибка типов, а не стиль. */
  const rows = (): HTMLElement[] =>
    Array.from(panel.current?.querySelectorAll<HTMLElement>('[data-picker-row]') ?? []).filter(
      (n) => !n.hasAttribute('disabled'),
    );

  const focusRow = (index: number) => {
    const list = rows();
    if (!list.length) return;
    const i = ((index % list.length) + list.length) % list.length;
    list[i]?.focus();
  };
  /**
   * ⚠ ФОКУС ПЕРЕЕЗЖАЕТ ВМЕСТЕ С ШАГОМ, И БЕЗ ЭТОГО ПАНЕЛЬ УМИРАЛА ДЛЯ КЛАВИАТУРЫ. Строка, которой
   * выбрали ветку, при переходе на шаг 2 РАЗМОНТИРУЕТСЯ — фокус падает на `body`, а вместе с ним
   * перестают работать и стрелки (обработчик висит на панели), и `Escape` (поповер не модальный и
   * фокуса не держит). Человек оказывается перед открытой панелью, которую нечем ни пройти, ни
   * закрыть.
   *
   * ВЕДЁМ НА ПЕРВЫЙ ВЫБОР, А НЕ НА ПЕРВУЮ СТРОКУ: строка «назад» стоит первой, и фокус на ней
   * означал бы, что Enter сразу после перехода откатывает переход. На шаге 1 первый выбор — первая
   * ветка, на шаге 2 — первая сторона, и правило одно на оба.
   */
  const focusChoice = () => {
    const list = rows();
    (list.find((n) => n.hasAttribute('data-picker-leaf') || n.hasAttribute('data-picker-branch')) ??
      list[0])?.focus();
  };
  /** Сменить шаг и увести за ним фокус — одним движением, чтобы второго написания не завелось. */
  const goTo = (id: number | null) => {
    setBranchId(id);
    window.requestAnimationFrame(focusChoice);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = rows();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(at < 0 ? 0 : at + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(at < 0 ? list.length - 1 : at - 1);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      focusRow(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      focusRow(list.length - 1);
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && branch && !only) {
      e.preventDefault();
      goTo(null);
    }
  };

  const openCreate = () => {
    if (!create) return;
    handingOff.current = true;
    close();
    create.open((id) => {
      setBranchId(id);
      setOpen(true);
    });
  };

  return (
    <GenericPopover
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : close())}
      title={title}
      /* ⚠ БЕЗ ХВОСТА, И ЭТО ПОЧИНКА, А НЕ ВКУС. Хвост поповера прибит к ВЕРХНЕЙ кромке панели
         (`-top-[5px]` в `ui/components/popover`), а панель — плавающая: у нижнего края экрана
         Radix законно переворачивает её НАД дверью, и хвост оказывается на дальней от двери
         стороне, тыча в пустоту. Ряд выходов стоит внизу блока, то есть переворот здесь не
         редкость, а обычный случай. Меню, открытое кнопкой, и без того читается прикреплённым:
         `noTail` заодно ставит `sideOffset: 0`, и панель садится вплотную к двери — ровно та
         грамматика, которую примитив и объявляет для списка под полем. */
      noTail
      triggerProps={{
        disabled,
        title: triggerTitle,
        /* Открытая дверь читается НАЖАТОЙ (ступень `chip-selected`): без этого панель, открытая с
           клавиатуры, висит над дверью, которая выглядит нетронутой, и связь между ними приходится
           додумывать. Ховер этого не заменяет — у клавиатуры его нет. */
        className: buttonVariants({
          variant: 'secondary',
          size: 'xs',
          className: `data-[state=open]:bg-textColor data-[state=open]:text-bgColor ${triggerClassName ?? ''}`,
        }),
      }}
      openElement={face}
      contentProps={{
        onOpenAutoFocus: (e: Event) => {
          /* Фокус ведём на первую строку сами: Radix оставил бы его на панели, и первая же ↓
             прыгнула бы через строку. */
          e.preventDefault();
          window.requestAnimationFrame(focusChoice);
        },
        onCloseAutoFocus: (e: Event) => {
          if (!handingOff.current) return;
          handingOff.current = false;
          e.preventDefault();
        },
      }}
    >
      <div ref={panel} className={BLEED} onKeyDown={onKeyDown} data-picker-step={branch ? 2 : 1}>
        {branch ? (
          <>
            {/* ═══ ГДЕ МЫ — СТРОКОЙ, И ЛИСТЬЯ НИКОГДА НЕ СТОЯТ БЕЗЫМЯННЫМИ ═══════════════════
                Уйти назад можно только оттуда, куда пришли: при единственной ветке шага 1 нет, и
                кнопка «назад» вела бы в несуществующее место. Имя ветки при этом обязано стоять в
                обоих случаях — «front / back / …» без имени столбца это список, не адрес, — и в
                неподвижном случае оно стоит подписью той же меры, что и кнопка. */}
            {only ? (
              <div
                className='flex min-h-6 items-center gap-2 border-b border-borderColor px-2'
                data-picker-here={branch.id}
              >
                <Text size='micro' variant='label' tracking='label' component='span' className='truncate uppercase'>
                  {branch.label}
                </Text>
              </div>
            ) : (
              <button
                type='button'
                data-picker-row=''
                data-picker-back=''
                tabIndex={-1}
                onClick={() => goTo(null)}
                title={`back to the ${branchNoun}`}
                className={`${ROW} border-b border-borderColor`}
              >
                <span aria-hidden className='shrink-0 text-labelColor'>
                  ‹
                </span>
                <Text size='micro' variant='label' tracking='label' component='span' className='min-w-0 truncate uppercase'>
                  {branch.label}
                </Text>
              </button>
            )}
            <div role='listbox' aria-label={`${leafNoun} of ${branch.label}`}>
              {branch.leaves.map((leaf) => (
                <button
                  key={leaf.value}
                  type='button'
                  role='option'
                  aria-selected={false}
                  data-picker-row=''
                  data-picker-leaf={leaf.value}
                  tabIndex={-1}
                  title={leaf.title}
                  onClick={() => {
                    close();
                    onPick(branch.id, leaf.value);
                  }}
                  className={ROW}
                >
                  <span className='min-w-0 flex-1 truncate'>{leaf.label}</span>
                  {leaf.note ? (
                    <Text size='micro' variant='label' component='span' className='shrink-0'>
                      {leaf.note}
                    </Text>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div role='listbox' aria-label={branchNoun}>
              {branches.map((b) => (
                <button
                  key={b.id}
                  type='button'
                  role='option'
                  aria-selected={false}
                  data-picker-row=''
                  data-picker-branch={b.id}
                  tabIndex={-1}
                  title={b.title}
                  onClick={() => goTo(b.id)}
                  className={ROW}
                >
                  <span className='min-w-0 flex-1 truncate uppercase'>{b.label}</span>
                  {b.note ? (
                    <Text size='micro' variant='label' component='span' className='shrink-0 tabular-nums'>
                      {b.note}
                    </Text>
                  ) : null}
                  <span aria-hidden className='shrink-0 text-labelColor'>
                    ▸
                  </span>
                </button>
              ))}
            </div>
            {create ? (
              /* ⚠ ВНЕ СПИСКА НАМЕРЕННО: это не «ещё одна ветка», а глагол — он не выбирает
                 существующее, а заводит новое, и `role="option"` над ним обещал бы читалке
                 значение, которого нет. Стрелками он всё равно достижим (`data-picker-row`). */
              <button
                type='button'
                data-picker-row=''
                data-picker-create=''
                tabIndex={-1}
                onClick={openCreate}
                className={`${ROW} border-t border-borderColor`}
              >
                <span className='min-w-0 flex-1 truncate'>{create.face}</span>
              </button>
            ) : null}
          </>
        )}
      </div>
    </GenericPopover>
  );
}
