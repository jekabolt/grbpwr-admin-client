/**
 * ═══ РОЛЬ ВХОДА ПЕРЕЕЗЖАЕТ НА КРОП — ОДНО ПРАВИЛО НА ДВЕ ДВЕРИ (J-8; 03.10, gate FX2) ════════════
 *
 * Кроп во ВХОДЕ (`references-section.tsx`, `replaceReference`) и кроп плитки ДОСКИ, чей оригинал
 * стоит во входе (`mood-board.tsx`, `placeCropped`), переносят серверную роль одинаково: СНАЧАЛА
 * роль новому медиа, ПОТОМ снять со старого. Обратный порядок на отказе второй записи оставил бы
 * картинку без роли — то есть молча выкинул бы её из промпта; этот на отказе оставляет ДВЕ строки,
 * обе видимые. Записка и слот детали едут теми, что пришли С СЕРВЕРА. Удержание входа на время
 * записей (`holdFlatInput`) — у вызывающего.
 */

export type CarriedReference = { role: string; note: string; detailSlotId: number };

type WriteRole = (input: {
  mediaId: number;
  role: string;
  ordinal: number;
  note?: string;
  detailSlotId?: number;
}) => Promise<unknown>;

export async function carryReferenceRole(
  write: WriteRole,
  carried: CarriedReference,
  fromId: number,
  toId: number,
  ordinal: number,
): Promise<void> {
  await write({
    mediaId: toId,
    role: carried.role,
    ordinal,
    note: carried.note,
    detailSlotId: carried.detailSlotId > 0 ? carried.detailSlotId : undefined,
  });
  await write({ mediaId: fromId, role: '', ordinal: 0, note: '' });
}
