import { cn } from 'lib/utility';
import type { CSSProperties, ReactNode } from 'react';

import { cutPiecesWord } from './composite';

/**
 * ═══ THE CROP DECK — A SHEET WITH ITS CUT PIECES FANNED OUT BEHIND IT (H-10, J-2) ═════════════
 *
 * Owner, verbatim (round 14): «мультивью и сплиты надо ка-то группировать что я вижу это так
 * карточка с мультивью за ней выглядывают кусочки заспличеные если нажимаешь то они в ленте
 * показываются карточками если нажимаешь на другой мультивью старый колапсится обратно».
 *
 * Owner, verbatim (round 15, J-2): «карточки должны не так компактно сгрупированы а так что бы
 * было видно 1/3 карточки так же что бы оно расколапсилось при клике на плитку даже мультивью
 * фото когда они уже разгрупировались надо что бы клик на карточку тамбнейл уже открывал зум а
 * первый клик анколапсил».
 *
 * Two sentences, two changes, and they are independent: the GEOMETRY (what a collapsed deck looks
 * like) and the CLICKS (what pressing it does).
 *
 * ═══ GEOMETRY: A FAN OF REAL PIECES, EACH A THIRD OF A CARD WIDE ══════════════════════════════
 *
 * Round 14 drew two BLANK white rectangles offset by 6px — the edge of a ream of paper. The owner
 * looked at it and said the group is packed too tight and a third of a card must show. Both halves
 * of that sentence reject the blank edge, and for the same reason: 6px of white says «there is
 * something behind this» and nothing more, so the only way to learn WHAT is behind it is to open
 * the deck. A third of a card says WHICH pieces.
 *
 *   ┌──────── W ────────┬─ W/3 ─┬─ W/3 ─┬─ W/3 ─┐
 *   │                   │       │       │       │
 *   │   the sheet       │ piece │ piece │ piece │   collapsed: 2 tracks of the grid
 *   │                   │   1   │   2   │   3   │
 *   └───────────────────┴───────┴───────┴───────┘
 *   ▸ 5 cut pieces
 *
 * Piece k is a FULL card of width `W` pushed right by `k·W/3` and painted BEHIND its predecessor,
 * so exactly `W/3` of each one stays uncovered and the fan ends at `2W`. Three peeks say «at least
 * three»; the exact number is the word on the door, which is the same rule as everywhere else in
 * this admin — state is never carried by a picture alone.
 *
 * ⚠ THREE PEEKS, WHETHER THERE ARE 3 PIECES OR 12, AND THE CAP IS THE GRID. The deck claims TWO
 * tracks of its host and no more: a fourth peek would need a third track, and a deck that grows
 * with its contents makes every row of the feed a different shape. `DECK_PEEK_MAX` is that cap in
 * one place, read by the hosts to size themselves.
 *
 * ⚠ NO SHADOW, AND THE STACK STILL READS AS A STACK. DESIGN.md allows a shadow on exactly three
 * things and none of them is in the document flow. The fan reads as depth because each piece
 * carries the same 1px `#ccc` outline the sheet does and each is filled white: the outlines stack
 * into parallel rules, which is what a pile of paper looks like from slightly above.
 *
 * ⚠ EVERY PIECE IS FILLED WHITE, AND SO IS THE GROUND UNDER THE SHEET. `PictureTile` draws a frame
 * with NO fill — a picture kept `contain` letterboxes — so without a white ground the pieces behind
 * would show through the sheet's own letterbox gaps as stray drawings across it.
 *
 * ═══ E-5: ТОТ БЕЛЫЙ ГРУНТ БЫЛ ВДВОЕ УЖЕ ЛИСТА, И ЭТО ЗАМЕРЕНО ═════════════════════════════════
 *
 * Владелец, дословно: «в GENERATION HISTORY заколапшеные карточки выглядят криво тк карточка
 * мультивью прозрачная и из за этого за ней видны карточки».
 *
 * Абзац выше обещал грунт и не врал — грунт рисовался. Врала его ШИРИНА, и ровно на одном из двух
 * экранов. `--deck-card` хранит СТРОКУ, а не длину: лента подставляет в него
 * `calc((100% - 8px) / 2)`, и `100%` в подставленном значении разрешается ОТ РОДИТЕЛЯ ТОГО, КТО
 * ЕГО ЧИТАЕТ, а не от того, кто его объявил. Веер и обёртка листа читают его, будучи детьми корня
 * колоды (две дорожки), и получают ровно одну дорожку `W`. А грунт лежал ВНУТРИ обёртки листа,
 * которая сама уже шириной `W`, — то есть получал `(W − 8px) / 2`, примерно ПОЛОВИНУ листа.
 * Правая половина кадра оставалась без заливки, и в её летербоксы просвечивал веер.
 *
 * Полоса рендеров того же дефекта не имела и жаловаться на него не могла: она подставляет
 * `132px`, длину без процентов, и та одинакова на любой глубине. Один и тот же грунт был верен
 * на одном экране и вдвое уже на другом — оттого и «криво» только в ленте.
 *
 * Лечится не арифметикой, а адресом: обёртка листа И ЕСТЬ коробка листа, поэтому грунт берёт
 * `100%` ОТ НЕЁ и не читает `--deck-card` вовсе. Читателей переменной снова ровно столько,
 * сколько у неё прямых детей корня.
 *
 * ═══ CLICKS: THE FIRST ONE OPENS THE DECK, THE SECOND ONE OPENS THE PICTURE ═══════════════════
 *
 * Round 14 gave the deck's whole verb to a worded button below the card, because the tile's own
 * surface belongs to the ZOOM (the corner law, `picture-tile.tsx`) and taking the zoom away from
 * some tiles and not others is the «везде по разному» the owner has objected to twice.
 *
 * J-2 overrules that for the COLLAPSED state only, and it is not the same trade. The zoom does not
 * disappear — it moves off the surface onto the corner button that already carried its name, its
 * focus and its announcement (the surface was `aria-hidden` and out of the tab order all along).
 * So keyboard and screen-reader behaviour is unchanged, and the mouse gets exactly the two-step the
 * owner asked for:
 *
 *   collapsed  · press the sheet or a peek → the deck opens
 *   open       · press any card            → the viewer opens on it
 *
 * ⚠ AND THE VERB IS HANDED TO THE PRIMITIVE, NOT PAINTED OVER IT. A transparent button laid on top
 * of the tile by this file would have to guess the tile's z-ladder — the zoom surface is z-10 and
 * the corner organs are z-20 — and would take `split`, `edit` and `✕` away from the sheet. See
 * `PictureTile.onOpen`.
 *
 * ═══ NO MOTION, DELIBERATELY ══════════════════════════════════════════════════════════════════
 *
 * The glyph flipping and the cards appearing IS the feedback, and it arrives in the same frame.
 * An orchestrated reflow of a twelve-column auto-fill grid is choreography this register rejects —
 * and animating grid layout is the one thing motion here must not do.
 *
 * ═══ ЗДЕСЬ СТОЯЛА МЕТКА «ЭТУ КОЛОДУ УЖЕ ОТКРЫВАЛИ» (E-4), И ВЛАДЕЛЕЦ ЕЁ ОТМЕНИЛ ══════════════
 *
 * Круг 16 прочитал «расколапшеные карточки + их мультивью после колапса должны как-то визуально
 * обводкой или фоном немножно помечены» как ОБВОДКУ ПОСЛЕ СКЛАДЫВАНИЯ: 1px ink вокруг листа с
 * веером, пока колода закрыта.
 *
 * Круг 17, дословно: «сплитнутые сейчас отображаются с обводкой один пиксель черной это убрать я
 * имел ввиду другое когда они расколапшены сделай так что бы под ними мульти вью и стороны был
 * немного затемнен бекграунд что бы когда оно анколапшено было понятно что это общие картинки».
 *
 * ТО ЕСТЬ ПЕРЕПУТАНЫ БЫЛИ ОБА ЧЛЕНА: и СОСТОЯНИЕ (не «после колапса», а РАСКРЫТАЯ группа), и
 * СРЕДСТВО (не линия по контуру, а грунт под группой). Обводка снята целиком — вместе с памятью
 * `seen`, которая существовала только ради неё.
 *
 * ⚠ И ГРУНТ РИСУЕТ НЕ ЭТОТ ФАЙЛ, ХОТЯ СОБЛАЗН ВЕЛИК. Раскрытая группа — это лист ПЛЮС его куски,
 * а куски рисует ХОЗЯИН, рядом с колодой и вне её (`{open && members.map(...)}` в обоих хостах).
 * Коробки, которая охватывала бы и лист, и куски, у колоды нет и быть не может: она кончается на
 * своём последнем пикселе. Поэтому подложку кладёт тот, кто держит обе половины, — см.
 * `data-deck-group` в `render/outputs.tsx`.
 */

/** How many pieces peek out from behind the sheet. The deck claims two tracks; three thirds fill
 *  the second one exactly. Read by the hosts so their own width formula cannot drift from this. */
export const DECK_PEEK_MAX = 3;

/** One piece drawn behind the sheet: its own thumbnail, not a blank rectangle. */
export interface DeckPeek {
  id: number;
  /** Address of the piece's thumbnail. Empty is legal — the frame then reads as an empty card. */
  url: string;
  alt: string;
}

export function CropDeck({
  rootId,
  count,
  peeks,
  sheetWidth,
  frameAspect,
  open,
  onToggle,
  hostDoor,
  className,
  style,
  children,
}: {
  /** The sheet these pieces were cut from. Also the deck's address for `openDeck` and for probes. */
  rootId: number;
  /** How many pieces, transitively. Never 0 — a root with nothing behind it gets no deck at all. */
  count: number;
  /**
   * The pieces to draw behind the sheet, in the row's own order. More than `DECK_PEEK_MAX` are
   * dropped HERE rather than by each host: two hosts trimming the same list by their own arithmetic
   * is how the fan and the width formula come apart.
   */
  peeks: readonly DeckPeek[];
  /**
   * The width of ONE card in this host, as a CSS length usable inside `calc()`.
   *
   * The feed's grid hands a percentage of the deck's own two-track box
   * (`calc((100% - 8px) / 2)` — two tracks and the 8px gutter between them); the render strip hands
   * a fixed `132px`. Everything else about the deck is derived from it, so a host cannot say one
   * width to the sheet and another to the fan.
   */
  sheetWidth: string;
  /** The aspect of the FRAME at the top of a card in this host — `4/5` in the feed, `132/148` in
   *  the strip. The peeks are frames only (no caption), and the white ground under the sheet is
   *  cut to the same box. */
  frameAspect: string;
  open: boolean;
  onToggle: () => void;
  /**
   * ═══ ДВЕРЬ КОЛОДЫ РИСУЕТ ХОЗЯИН, А НЕ КОЛОДА (F-9) ══════════════════════════════════════
   *
   * Владелец про полосу рендеров: «вот это еще "▸ 3 CUT PIECES" слишком много визуального
   * мусора». Мусором её делает СОСЕДСТВО: под тем же кадром уже стоит ряд дверей ячейки, и
   * «раскрыть колоду» оказывалось ВТОРЫМ органом того же кадра, на своей собственной строке.
   * В полосе рендеров этот глагол переехал в ряд дверей ячейки и слился там с `split ▸`,
   * который F-7 всё равно велел переименовать (`expand ▸` / `set`).
   *
   * ⚠ ПРОП, А НЕ ПРАВКА ПО МЕСТУ. Второй хозяин колоды — лента генераций — под карточкой ряда
   * дверей не имеет вовсе, и снятие двери там оставило бы колоду без единого объявленного
   * органа: только мышиная поверхность, ни `aria-expanded`, ни таб-стопа. Умолчание поэтому
   * «дверь моя», и лента не меняется ни на пиксель.
   *
   * ⚠ ХОЗЯИН, ГАСЯЩИЙ ДВЕРЬ, ОБЯЗАН ПОСТАВИТЬ СВОЮ — с `aria-expanded` и словом. Колода этого
   * проверить не может; ниже, в разметке, стоит напоминание на том же месте.
   */
  hostDoor?: boolean;
  /** How the root claims its space in ITS host: `span 2` in a grid, an explicit width in a strip. */
  className?: string;
  style?: CSSProperties;
  /** The root's own card, drawn exactly as any other card in the row. */
  children: ReactNode;
}) {
  const word = cutPiecesWord(count);
  const title = open
    ? `the pieces cut from this sheet are open in the row — press to fold them back behind it`
    : `the pieces cut from this sheet — press the sheet or a piece to open them as cards in the row; opening another sheet's pieces folds these back`;

  const shown = peeks.slice(0, DECK_PEEK_MAX);
  /** `W/3`, said once. The fan's offsets, the visible strip and the hosts' widths all read it. */
  const step = `calc(var(--deck-card) / ${DECK_PEEK_MAX})`;

  return (
    <div
      className={cn('relative flex h-full min-w-0 flex-col', className)}
      style={{ ...style, ['--deck-card' as string]: sheetWidth }}
      data-deck-root={rootId}
    >
      {/* ⚠ THE PEEKS COME FIRST IN THE DOM, AND THAT IS LOAD-BEARING. Positioned boxes paint in
          document order, and every box here is positioned, so «behind» is written rather than
          computed. They are also drawn in REVERSE — the furthest piece first — because each one
          must be covered by the piece in front of it, and the sheet covers them all.

          `aria-hidden` + `tabIndex={-1}`: the announced door is the worded button at the bottom,
          which carries the name, the `aria-expanded` and the tab stop. Two announced controls for
          one act would make a screen reader promise two decks. */}
      {!open &&
        shown
          .map((peek, k) => ({ peek, k }))
          .reverse()
          .map(({ peek, k }) => (
            <button
              key={peek.id}
              type='button'
              aria-hidden='true'
              tabIndex={-1}
              onClick={onToggle}
              data-deck-peek={peek.id}
              title={title}
              style={{
                left: `calc(${k + 1} * ${step})`,
                width: 'var(--deck-card)',
                aspectRatio: frameAspect,
              }}
              className='absolute top-0 cursor-pointer overflow-hidden border border-borderColor bg-bgColor p-0'
            >
              {peek.url ? (
                /* `contain`, never `cover`: these are drawings, and the visible third of a piece
                   must be the piece's own left third, not a re-framed crop of it. */
                <img
                  src={peek.url}
                  alt={peek.alt}
                  draggable={false}
                  className='h-full w-full object-contain'
                />
              ) : null}
            </button>
          ))}

      {/* THE SHEET. Collapsed, it is held to ONE card's width inside a box that is two cards wide —
          otherwise the card would stretch across the fan and there would be nothing to peek from
          behind. Open, the deck occupies a single track again and the card fills it, exactly as
          every other card in the row (B6.1: an open deck's sheet must measure like its members). */}
      {/* ⚠ `flex` НЕСУЩЕЕ, А НЕ УБОРКА, И ЭТО ЗАМЕРЕНО (F-9). Ячейка полосы прижимает свой ряд
          дверей к низу (`mt-auto`), и работает это ровно тогда, когда ячейка РАСТЯНУТА на всю
          высоту ряда. Обёртка была обычным блоком, поэтому лист колоды мерился по содержимому —
          209px против 226.5px у соседей, — и его двери стояли на 18px выше соседних. Это и есть
          «кнопки скачут» из претензии владельца: замерено `k17w1-measure.mjs` до правки. */}
      <div
        className='relative flex flex-1'
        style={open ? undefined : { width: 'var(--deck-card)' }}
      >
        {/* THE CARD'S OWN GROUND, cut to the FRAME's box rather than to the whole card: below the
            frame there is nothing behind the sheet to hide, and a white rectangle that tall would
            paint over the row's ground under the caption. */}
        {!open && (
          /* ⚠ `w-full`, А НЕ `var(--deck-card)` — E-5, разбор в шапке файла. Эта обёртка уже
             шириной в один лист, поэтому «сто процентов от неё» — это и есть лист, на любой
             глубине и при любом хосте. Чтение переменной здесь давало `(W − 8px) / 2` в ленте
             (её значение — процент) и `W` в полосе рендеров (её значение — пиксели), то есть
             один и тот же грунт был верен на одном экране и вдвое уже на другом. */
          <span
            data-deck-ground={rootId}
            className='pointer-events-none absolute left-0 top-0 w-full bg-bgColor'
            style={{ aspectRatio: frameAspect }}
          />
        )}
        {children}
      </div>

      {/* ⚠ ХОЗЯИН, ПОГАСИВШИЙ ЭТУ ДВЕРЬ (`hostDoor`), ОБЯЗАН ПОСТАВИТЬ СВОЮ — с `aria-expanded`,
          словом и таб-стопом. Веер выше объявленно немой (`aria-hidden`, `tabIndex={-1}`) именно
          потому, что объявленный орган здесь один; без него колода осталась бы мышиной. */}
      {!hostDoor && (
      <button
        type='button'
        onClick={onToggle}
        aria-expanded={open}
        data-deck={rootId}
        title={title}
        /* ⚠ `relative` НЕСУЩЕЕ, А НЕ УБОРКА, И ЭТО ЗАМЕРЕНО. Позиционированные потомки рисуются
           ПОСЛЕ содержимого в потоке, поэтому лист-край (он `absolute`) ложился поверх этой
           двери: слово пропадало под белой заливкой, а нажатие уходило в край. Дверь тоже обязана
           быть позиционированной и стоять В РАЗМЕТКЕ ПОСЛЕ краёв — тогда порядок рисования и
           порядок попаданий совпадают с тем, что человек видит. */
        className={
          'relative mt-1 w-full cursor-pointer text-left text-nano uppercase tracking-label ' +
          'text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 ' +
          'focus-visible:outline-offset-2 focus-visible:outline-textColor'
        }
      >
        {open ? '▾' : '▸'} {word}
      </button>
      )}
    </div>
  );
}
