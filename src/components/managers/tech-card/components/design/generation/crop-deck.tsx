import { cn } from 'lib/utility';
import type { ReactNode } from 'react';

import { cutPiecesWord } from './composite';

/**
 * ═══ THE CROP DECK — A SHEET WITH ITS CUT PIECES BEHIND IT (H-10) ══════════════════════════════
 *
 * Owner, verbatim: «мультивью и сплиты надо ка-то группировать что я вижу это так карточка с
 * мультивью за ней выглядывают кусочки заспличеные если нажимаешь то они в ленте показываются
 * карточками если нажимаешь на другой мультивью старый колапсится обратно».
 *
 * So: one card, two edges peeking out from behind it, a press opens the pieces AS CARDS IN THE ROW
 * — not in a drawer, not in a modal — and a second deck folds the first one back.
 *
 * ═══ WHY EDGES OF PAPER AND NOT A SHADOW ══════════════════════════════════════════════════════
 *
 * The system layers TONALLY: ground → block → panel → zebra, plus 1px outlines, and nothing in the
 * document flow is allowed a shadow (three things ever float: a modal, a popover, a dragged board
 * card). A stack of paper is therefore drawn with the material the system already has — two more
 * white rectangles with the same #ccc outer outline, offset up and to the right, zero radius, zero
 * blur. The result reads as three parallel hairlines above the frame and three down its right
 * side: sheets on a desk, seen from slightly above.
 *
 * ⚠ EXACTLY TWO EDGES, WHETHER THERE ARE 2 PIECES OR 12. A ream is not countable by its edge, and a
 * twelve-layer fan would eat the grid's 8px gutter and start colliding with the neighbouring tile.
 * The NUMBER is carried by the word on the door, which is the same rule as everywhere else in this
 * admin: state is never carried by a picture alone.
 *
 * ═══ WHY THE DOOR IS A WORD UNDER THE CARD AND NOT THE CARD ITSELF ═════════════════════════════
 *
 * The corner law (`picture-tile.tsx`) gives the tile's own surface to the ZOOM, and the four
 * corners to badge / zoom / split / edit. A deck that stole the surface would take the zoom away
 * from exactly the pictures a person most wants to look at closely, and it would take it away only
 * on some tiles — which is the «везде по разному» the owner has already objected to twice. So the
 * deck owns the margin around the card and a worded button below it, and touches no corner.
 *
 * The peeking edges are pressable too, because they are the thing the owner described pressing.
 * They are a SECOND door onto the same act: `aria-hidden` and unreachable by keyboard, since the
 * worded button beneath carries the name, the `aria-expanded` and the tab stop. Two doors, one
 * verb, one announcement.
 *
 * ═══ NO MOTION, DELIBERATELY ══════════════════════════════════════════════════════════════════
 *
 * The glyph flipping and the cards appearing IS the feedback, and it arrives in the same frame.
 * An orchestrated reflow of a twelve-column auto-fill grid is choreography this register rejects —
 * and animating grid layout is the one thing motion here must not do.
 */
export function CropDeck({
  rootId,
  count,
  open,
  onToggle,
  children,
}: {
  /** The sheet these pieces were cut from. Also the deck's address for `openDeck` and for probes. */
  rootId: number;
  /** How many pieces, transitively. Never 0 — a root with nothing behind it gets no deck at all. */
  count: number;
  open: boolean;
  onToggle: () => void;
  /** The root's own tile, drawn exactly as any other tile in the row. */
  children: ReactNode;
}) {
  const word = cutPiecesWord(count);
  const title = open
    ? `the pieces cut from this sheet are open in the row — press to fold them back behind it`
    : `the pieces cut from this sheet — open them as cards in the row; opening another sheet's pieces folds these back`;

  return (
    /* The 6px of padding IS the peek: it is reserved on the card's own track rather than taken out
       of the grid gutter, so a deck never leans on its neighbour.
 
       ⚠ AND IT IS RESERVED ONLY WHILE THERE IS SOMETHING TO PEEK. Held unconditionally, an OPEN
       deck kept 6px of empty margin behind nothing — its sheet drew 144px wide and 6px lower than
       the 150px pieces standing beside it in the same row, so the one card that owns the group was
       the one card visibly out of line with it. The no-jump argument does not survive the measure
       either: opening a deck reflows the row by six whole cards, and 6px of width inside that is
       not a jump anybody can see. */
    <div
      className={cn('relative flex h-full min-w-0 flex-col', !open && 'pr-1.5 pt-1.5')}
      data-deck-root={rootId}
    >
      {/* ⚠ FIRST IN THE DOM, AND THAT IS LOAD-BEARING. Positioned boxes paint in document order,
          so the edges must be written before the card if they are to sit behind it. `aria-hidden`
          + `tabIndex={-1}`: the accessible door is the worded button at the bottom, and a second
          announced control for one act would make a screen reader promise two decks. */}
      {!open && (
        <button
          type='button'
          aria-hidden='true'
          tabIndex={-1}
          onClick={onToggle}
          /* `absolute inset-0 p-0` — out of flow, so the edges cost the column no height, and with
             the UA padding zeroed the button's own box is the deck's box, which is what the two
             offsets below are measured from. Transparent to the pointer as a whole; only the two
             edges take a press, and only where the card does not already cover them. */
          className='pointer-events-none absolute inset-0 cursor-pointer p-0'
        >
          <span className='pointer-events-auto absolute bottom-1.5 left-1.5 right-0 top-0 border border-borderColor bg-bgColor' />
          <span className='pointer-events-auto absolute inset-[3px] border border-borderColor bg-bgColor' />
        </button>
      )}
      {/* THE CARD'S OWN GROUND. `PictureTile` draws a frame with no fill — a picture kept `contain`
          letterboxes, and without this the sheets' INNER edges (their left and bottom borders, which
          run under the card) would show through the gaps as stray lines across the drawing. It is
          transparent to the pointer so the card and the edges keep their own hit areas. */}
      {!open && (
        <span className='pointer-events-none absolute bottom-0 left-0 right-1.5 top-1.5 bg-bgColor' />
      )}
      <div className='relative flex-1'>{children}</div>
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
    </div>
  );
}
