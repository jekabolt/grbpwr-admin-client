/**
 * THE STUDIO CORE — the organs every band screen shares. One import surface, no state, no wire.
 */
export { AskModal } from './ask';
export {
  Counter,
  EMPTY_WORD,
  EmptyState,
  GROUP_GAP,
  GROUP_SEAM,
  Money,
  PRICED_LATER,
} from './organs';
export { Reason } from './reason';
/* ЭТА ПОВЕРХНОСТЬ ОТДАЁТ ТО, ЧТО ЧИТАЮТ СНАРУЖИ, И НИЧЕГО СВЕРХ (r3c). `DrawHalf`, `SLOT_HALVES`,
   `PenGlyph` и `drawTitle` отсюда сняты: за пределами `two-half-slot.tsx` их не читает никто —
   плитку собрали в один орган (`PlaceOrDrawCell`), и половины перестали быть чужой сборкой.
   Внутри файла они живут по-прежнему; экспортированное имя без потребителя — это обещание
   стабильности, за которое никто не платит и о котором забывают при первой же правке. */
export { HALF_FACE, PlaceOrDrawCell } from './two-half-slot';
export {
  CopyWords,
  InventoryLine,
  NotSent,
  WmgGroup,
  WmgShell,
  WordsAsSent,
  copyText,
  latestRunOfKind,
} from './wmg';
export type { NotSentItem, Say, WmgDoor, WmgOrigin } from './wmg';
