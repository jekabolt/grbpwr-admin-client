import type { GetDesignBandResponse } from 'api/proto-http/admin';

import { cn } from 'lib/utility';
import { type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import Tooltip, { TooltipProvider } from 'ui/components/tooltip';

import { pictureRepresentation, type DesignKind } from './bench-kinds';
import { fabricRenderGate } from './render';
import { countThreedResults } from './threed/media';

/**
 * СОЮЗ ПЕРЕЕХАЛ В `./bench-kinds` И ВОЗВРАЩАЕТСЯ ОТСЮДА ТЕМ ЖЕ ИМЕНЕМ (G-1) — импортёры
 * (`studio-tab`, `history-recall`) не заметили ничего. Он объявлен там же, где живёт
 * классификатор, читающий тот же словарь: два объявления одного союза разошлись бы молча, а
 * поймать это было бы нечем — оба компилируются.
 */
export type { DesignKind };

/**
 * THE STRIP OF REPRESENTATIONS — the four ways this card's design can exist as a picture.
 *
 * ═══ ПЯТОЙ ЯЧЕЙКИ, «prompt profile», ЗДЕСЬ БОЛЬШЕ НЕТ (K-18) ═══════════════════════════════════
 *
 * Владелец: «вкладки PROMPT PROFILE не должно быть». Проверено перед сносом — она не была
 * единственным входом НИ ВО ЧТО: она не выбиралась (`DesignKind` её не содержит и никогда не
 * содержал), ничего не открывала и ничего не показывала, кроме одной фразы про серверную
 * настройку. Ту же фразу — и подробнее — говорит `render/what-model-gets.tsx`, у самой формы
 * запуска, где вопрос «из чего собран промпт» и возникает. Снос ничего не осиротил.
 *
 * И довод «мёртвое остаётся с причиной» (ниже) на неё не распространялся: он про ПРЕДСТАВЛЕНИЯ —
 * технолог, не увидевший «fabric render», решит, что рендеров в админке нет. Профиль
 * представлением не был; он был единственной ячейкой полосы, стоявшей на отшибе (`ml-auto`),
 * то есть сам себя объявлял чужим этому ряду.
 *
 * It is a POLOSA, not a block: the strip is its own surface (border + white fill, ruled internally
 * with hairlines), so it is never wrapped in a `Section` — see DESIGN.md → «tiles, boards and
 * strips are already their own surfaces».
 *
 * WHY THREE OF THE FOUR ARE DEAD, AND WHY THEY ARE STILL ON SCREEN.
 * The generative machine is CUT in this wave — not postponed behind a flag, cut for measured
 * reasons: the backend has no parsing of pictures out of a model's answer at all, there is no 3D
 * provider, and the 4 MiB answer ceiling is smaller than a single base64 PNG. A control that
 * cannot work has exactly two honest shapes: absent, or present WITH ITS REASON. Absent was
 * rejected because the four representations are the vocabulary of the band — a technologist who
 * cannot see «fabric render» on the strip does not conclude «not yet», he concludes «this admin
 * does not have renders», and then goes looking for them in the wrong place.
 *
 * So the reason is a first-class value here, carried on `data-inert` and spoken twice: on hover as
 * a footnote, and on click as a note that STAYS until it is dismissed. This strip is the only
 * carrier of `data-inert` in the wave, which is precisely why it could not be dropped from it.
 *
 * THE REASONS ARE WRITTEN FOR A TECHNOLOGIST. Not «no image parser in the gateway» — that is our
 * problem, not his. Each one says what cannot be done here and what he can do INSTEAD, because a
 * dead end with a way round it is a working screen and a dead end without one is a bug report.
 */

/* ─── МЁРТВЫХ ПРЕДСТАВЛЕНИЙ В ЭТОМ РЯДУ БОЛЬШЕ НЕТ ────────────────────────────────────────────
   Здесь стоял `INERT_REASON` с единственным членом — «on-model pictures are not made on this
   card» — и весь механизм вокруг него: `InertKey`, состояние последнего заданного вопроса и
   записка под полосой. Волна K-17 сделала это представление ЖИВЫМ (перекрас по фотографии
   модели), и объяснение, почему его нельзя сделать, стало ложью на экране.

   Механизм снят целиком, а не оставлен пустым: словарь без членов — это приглашение завести
   второе мёртвое представление вместо того, чтобы его построить. Появится настоящая причина —
   вернётся вместе со своей причиной. Проп `inert`/`onInert` у `RepCell` жив: он про ячейку, а
   не про этот ряд. */

/**
 * The cell metrics, shared so the live cell and the dead one sit on exactly one baseline. NOTE
 * that this carries NO flex sizing: the four representations share the strip (`SHARE`), and mixing
 * sizing into this string would leave twMerge to pick a winner between the two.
 */
const CELL = 'flex min-w-0 flex-col gap-0.5 px-2.5 py-2 text-left';
/**
 * `flex-1` — grow, shrink AND a zero basis — is load-bearing, and BOTH halves of it are.
 *
 * Without `min-w-0` a `<button>` in a flex strip is measured by its own content, so the cell with
 * the longest sub-line pushes past its share and lies over its neighbour. But a zero basis WITHOUT
 * grow is the same bug mirrored: the cell collapses to nothing and its label wraps one letter per
 * line, which is what this strip actually did until a screenshot showed it. Neither failure is
 * visible to a check that reads text — `innerText` returns the same string at every width.
 */
const SHARE = 'flex-1';
function RepCell({
  name,
  sub,
  active,
  inert,
  onInert,
  onSelect,
  dimmed,
  className,
}: {
  name: string;
  sub: string;
  active?: boolean;
  inert?: string;
  onInert?: () => void;
  /** Представление, которое МОЖНО открыть. Активное его не получает: там уже находятся. */
  onSelect?: () => void;
  /**
   * ПРЕДСТАВЛЕНИЕ, ДО КОТОРОГО КАРТОЧКА ЕЩЁ НЕ ДОШЛА — причина, а не булево.
   *
   * Отличается от `inert` ровно тем, чем «рано» отличается от «здесь не делается»: приглушённая
   * ячейка ОТКРЫВАЕТСЯ (там стоит собственная полоса «чего не хватает» с выходами), но перестаёт
   * читаться как равноправная соседка. Настоящий запрет живёт на сервере — `StartDesignRun`
   * отказывает `threed` без непрятанного fabric render, — и подменять его клиентской блокировкой
   * нельзя: обходится перезагрузкой вкладки, а платит владелец.
   */
  dimmed?: string;
  className?: string;
}) {
  const body = (
    <>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className={cn(
          'font-bold',
          active ? 'text-bgColor' : dimmed ? 'text-labelColor' : 'text-textColor',
        )}
      >
        {name}
      </Text>
      <Text
        size='micro'
        component='span'
        className={cn('break-words', active ? 'text-bgColor' : 'text-labelColor')}
      >
        {sub}
      </Text>
    </>
  );

  // The live, current representation is NOT a control: it is where you already are. A button that
  // does nothing when pressed is the very thing this strip exists to avoid.
  if (!inert) {
    // ТЕКУЩЕЕ представление — не контрол: здесь уже находятся, и кнопка, ничего не делающая по
    // нажатию, — ровно то, ради чего эта полоса и написана.
    if (active || !onSelect) {
      return (
        <div
          aria-current={active ? 'true' : undefined}
          className={cn(CELL, active && 'bg-textColor', className)}
        >
          {body}
        </div>
      );
    }
    if (dimmed) {
      // ПРИЧИНА — ЗНАЧЕНИЕ, А НЕ ОФОРМЛЕНИЕ. Она читается человеком через подсказку и пробой через
      // атрибут: приглушённый цвет сам по себе ничего не доказывает и на монохромной печати
      // исчезает вовсе, поэтому рядом с ним всегда стоит слово (`sub` несёт «locked»).
      return (
        <Tooltip
          side='bottom'
          align='start'
          className='max-w-[320px] normal-case'
          trigger={
            <button
              type='button'
              data-locked={dimmed}
              onClick={onSelect}
              className={cn(CELL, 'hover:bg-bgSecondary', className)}
            >
              {body}
            </button>
          }
        >
          {dimmed}
        </Tooltip>
      );
    }
    return (
      <button
        type='button'
        onClick={onSelect}
        className={cn(CELL, 'hover:bg-bgSecondary', className)}
      >
        {body}
      </button>
    );
  }

  return (
    <Tooltip
      side='bottom'
      align='start'
      className='max-w-[320px] normal-case'
      trigger={
        <button
          type='button'
          // THE CARRIER OF THE REASON. Read by a human through the tooltip and the note below, and
          // by a probe through the attribute — a dead control that cannot be told apart from a
          // live one is how «it does nothing» ships unnoticed.
          data-inert={inert}
          // NO `aria-disabled` EITHER, and that is not an oversight. `aria-disabled` announces
          // «unavailable», which is only half of what is true here: the representation cannot be
          // made, but the CONTROL is live and answers when pressed. Marking it disabled tells a
          // screen-reader user not to press the one thing that would explain the situation to
          // him — and it makes every automated driver skip it as unactionable, so a probe can no
          // longer prove the reason arrives.
          onClick={onInert}
          className={cn(
            CELL,
            // NOT `disabled`: a disabled button takes no hover, no focus and no click, so the
            // reason would have no way to reach anybody. It stays reachable and answers instead.
            'cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            className,
          )}
        >
          {body}
        </button>
      }
    >
      {inert}
    </Tooltip>
  );
}

export function KindsStrip({
  band,
  kind = 'flat',
  onKindChange,
  action,
}: {
  band: GetDesignBandResponse;
  /** Какое представление на экране. Прототип держит это в `state.kind`. */
  kind?: DesignKind;
  onKindChange?: (kind: DesignKind) => void;
  /**
   * ═══ ПРАВЫЙ КРАЙ РЯДА — ОДИН ФИЛЬТР, ЕГО ПОДАЁТ КОМПОЗИТОР (круг 19, C1) ═══════════════════
   *
   * Сюда встаёт `ColorwaySelect` — «чей это рендер», — и встаёт он ИМЕННО ЗДЕСЬ по трём доводам,
   * ни один из которых не про место на экране:
   *   · это ЕДИНСТВЕННЫЙ ряд, переживающий смену вида. Глаз возвращается сюда, чтобы сменить
   *     представление, а «в каком цвете» — вопрос того же класса, что «в каком виде»;
   *   · верстак рендеров и ворота 3D ключуются одним числом, значит и называться оно обязано в
   *     одном месте, а не по разу на каждом из трёх экранов;
   *   · на самом верстаке (`FabricRenderSlots`) — нельзя: он ПОСЛЕДНИЙ блок экрана рендера
   *     (J-25), а колорвей должен быть известен раньше, чем наверху засеется рецепт.
   *
   * ПОЧЕМУ СЛОТ, А НЕ ИМПОРТ ПИКЕРА СЮДА. Полоса ничего не решает про студию: она рисует ряд и
   * сообщает нажатие. Импортируй она `useColorwayChoice` — и у оси стало бы ДВА владельца, ровно
   * тот дефект, от которого круг 16 избавлялся сносом. Слот принимает готовый узел и не знает,
   * что в нём; чем он пуст на FLAT и на PATTERN, решает композитор.
   *
   * `shrink-0` — несущий: ячейки представлений `flex-1`, и без него ряд отдал бы фильтру долю
   * ширины, отняв её у пятой ячейки. Разделительная линия — та же `hairline`, что между ячейками.
   */
  action?: JSX.Element | null;
}): JSX.Element {
  const form = useFormContext();
  // ЧИСЛО УКАЗАНИЙ — ЖИВОЕ. Читается прямо из формы, поэтому меняется в тот же миг, что и лист.
  // (Здесь же читалась ВЕРСИЯ листа — «v3» перед числом выносок. Версии снесены целиком, вместе
  // с бэкендом, и подпись осталась при том единственном, что у неё было живого: указания на
  // листе. Число выносок и раньше бралось из формы, а не из замороженной копии, — ровно затем,
  // чтобы полоса не называла прежнее число после того, как технолог добавил выноску.)
  const calloutCount = ((useWatch({ control: form.control, name: 'callouts' }) as unknown[]) ?? [])
    .length;
  // Прототип (`repsStripHtml`) подписывает представление ЧИСЛОМ его картинок, а не словами
  // «не делается здесь»: полоса отвечает на вопрос «сколько их уже есть».
  const pictures = (band.runs ?? []).flatMap((r) => r.pictures ?? []);
  /**
   * ═══ ВСЕ ЧЕТЫРЕ ЧИСЛА СЧИТАЮТСЯ ОДНИМ КЛАССИФИКАТОРОМ (G-1) ══════════════════════════════════
   *
   * До этой волны ряд считал тремя разными способами сразу: рендеры и плитки — по роду КАРТИНКИ,
   * 3D — по роду картинки с правилом склейки из `threed/media`, а перекрасы — по роду ПРОГОНА, и
   * из рендеров они потом ВЫЧИТАЛИСЬ, потому что вывод рекола объявляет себя `kind: "render"`.
   * Вычитание давало верное число и было при этом вторым написанием правила: третье такое же
   * жило в `render/model.ts`, четвёртое — в `artifacts-panel`. Теперь правило одно, и «сколько
   * их есть» на полосе, «что показывает фильтр истории» и «что считает панель артефактов»
   * отвечают одним словарём по построению, а не по совпадению.
   *
   * ⚠ СКРЫТЫЕ КАДРЫ ОТСЕИВАЮТСЯ ОТДЕЛЬНО, И ЭТО НЕ ЗАБЫТАЯ ЧАСТЬ КЛАССИФИКАТОРА. Невидимость —
   * свой регистр (`visibility.ts`), и представление о нём мнения не имеет: спрятанный рендер
   * остаётся рендером, его просто не считают.
   */
  const shown = pictures.filter((p) => !p.hiddenAt);
  const repOf = (p: (typeof shown)[number]) => pictureRepresentation(band, p);
  const fabricRenders = shown.filter((p) => repOf(p) === 'render').length;
  /**
   * ⚠ ПРОГОН 3D ЗАВОДИТ ДВЕ КАРТИНКИ НА ОДИН РЕЗУЛЬТАТ — модель `.glb` и её растровую миниатюру, —
   * и обе с `kind = threed` (`Produces()` у обоих маршрутов, origin/beta). Счёт по роду картинки
   * поэтому показывал «2 turntables» там, где сделана ОДНА модель. Правило склейки живёт одно на
   * всех в `threed/media.ts`; второе, написанное здесь по месту, разошлось бы с ним первой же
   * правкой маршрута.
   */
  const turns = countThreedResults(shown.filter((p) => repOf(p) === 'threed'));
  const recolours = shown.filter((p) => repOf(p) === 'onmodel').length;
  const renderSub = fabricRenders
    ? `${fabricRenders} render${fabricRenders === 1 ? '' : 's'}`
    : 'none yet';
  const onModelSub = recolours ? `${recolours} recoloured` : 'none yet';
  const tiles = shown.filter((p) => repOf(p) === 'pattern').length;
  const patternSub = tiles ? `${tiles} tile${tiles === 1 ? '' : 's'}` : 'none yet';
  /**
   * ═══ ПОСЛЕДОВАТЕЛЬНОСТЬ ФЛЭТЫ → РЕНДЕР → 3D, ВИДНАЯ НА ПОЛОСЕ (W-13) ════════════════════════
   *
   * Ворота работали и раньше — дословно, в самой студии 3D: пустая сторона рисует ячейку «required
   * · blocks 3D», под полосой стоит бар «чего не хватает» с двумя выходами, а GENERATE — мёртвая
   * дверь с причиной. Чего не было — СИГНАЛА В ПОЛОСЕ: три представления читались как три
   * равноправные вкладки, и «3d · none yet» ничем не отличалось от «fabric render · none yet»,
   * хотя одно из них означает «ещё не просили», а второе — «нельзя просить».
   *
   * ПРИЧИНА БЕРЁТСЯ ИЗ ОТВЕТА ПОЛОСЫ, А НЕ ВЫЧИСЛЯЕТСЯ ЗАНОВО. `has_fabric_render` — зеркало ровно
   * того гейта, которым отказывает `StartDesignRun`; клиент, пересчитавший правило по выданной ему
   * СТРАНИЦЕ ленты, ошибся бы ровно на те рендеры, которых на странице нет, — а это обычный случай
   * для карточки с историей. Тогда дверь нарисовалась бы открытой, а прогон получил бы отказ.
   *
   * ЭТО ПОДСКАЗКА, А НЕ ЗАЩИТА, и путать их нельзя. Ячейка остаётся ОТКРЫВАЕМОЙ: за ней стоит
   * экран, который подробно объясняет, чего не хватает, и предлагает выходы, — закрыть его значило
   * бы спрятать единственное место, где это написано. Настоящий отказ живёт и будет жить на
   * сервере. Клиентская блокировка обходится перезагрузкой вкладки, а платит за прогон владелец.
   */
  const gate = fabricRenderGate(band);
  const threedLocked = gate.ok ? null : gate.reason;
  /* «turntable» — слово, которого на этих экранах больше нет: K-10/K-11 переименовали весь 3D в
     «3D models», и полоса осталась единственным местом со старым существительным. */
  const threedSub = turns
    ? `${turns} 3D model${turns === 1 ? '' : 's'}`
    : threedLocked
      ? 'locked — renders first'
      : 'none yet';
  // Подпись листа держит тот же строй, что у двух соседних ячеек: СКОЛЬКО ИХ УЖЕ ЕСТЬ, а не в
  // каком состоянии находится лист. «v3 · 5 callouts» / «draft — no version yet» стояло здесь,
  // пока версии существовали; версия ушла, а счёт указаний — единственное живое, что было в той
  // строке, — остался. Пустая подпись сделала бы одну ячейку из трёх немой, и это читалось бы как
  // поломка, а не как «версий больше нет».
  const sheetSub = calloutCount
    ? `${calloutCount} callout${calloutCount === 1 ? '' : 's'}`
    : 'none yet';

  return (
    <div>
      <TooltipProvider>
        <div className='flex items-stretch border border-borderColor bg-bgColor'>
          {/* ТРИ ПРЕДСТАВЛЕНИЯ ТЕПЕРЬ ПЕРЕКЛЮЧАЮТСЯ, и это не косметика: за «fabric render» и «3d»
              появились настоящие экраны, а до них полоса честно говорила «не делается здесь». Та
              причина протухла в тот момент, когда экраны приехали, и оставить её значило бы врать
              ровно тем текстом, который был написан, чтобы не врать. */}
          <RepCell
            name='flat — sheet'
            sub={sheetSub}
            active={kind === 'flat'}
            onSelect={onKindChange && (() => onKindChange('flat'))}
            className={SHARE}
          />
          {/* PATTERN СТОИТ МЕЖДУ ЛИСТОМ И РЕНДЕРОМ, И ЭТО МЕСТО НАЗВАЛ ВЛАДЕЛЕЦ (K-13): «между
              вкладкой FLAT — SHEET и FABRIC RENDER». Порядок ряда — порядок работы: чертёж, потом
              ткань, которой его покроют, потом покрытый рендер, потом поворот. */}
          <RepCell
            name='pattern'
            sub={patternSub}
            active={kind === 'pattern'}
            onSelect={onKindChange && (() => onKindChange('pattern'))}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='fabric render'
            sub={renderSub}
            active={kind === 'render'}
            onSelect={onKindChange && (() => onKindChange('render'))}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='3d'
            sub={threedSub}
            active={kind === 'threed'}
            dimmed={threedLocked ?? undefined}
            onSelect={onKindChange && (() => onKindChange('threed'))}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='on model'
            sub={onModelSub}
            active={kind === 'onmodel'}
            onSelect={onKindChange && (() => onKindChange('onmodel'))}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          {/* «prompt profile» СНЯТА (K-18) — довод в шапке файла. Ряд из пяти делит ширину ровно,
              без ячейки на отшибе. То, что стоит справа СЕЙЧАС, — не шестая ячейка и не
              представление: это ФИЛЬТР («чей это рендер»), и он объявлен слотом, а не членом
              словаря `DesignKind`. Довод целиком — у пропа `action`. */}
          {action && (
            <div className='flex shrink-0 items-center border-l border-hairline px-2.5 py-2'>
              {action}
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
