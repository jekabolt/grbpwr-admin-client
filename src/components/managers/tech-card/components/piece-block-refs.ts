// СВЯЗИ «ДЕТАЛЬ КРОЯ → БЛОКИ DXF» — одна сборка на всех читателей.
//
// Эту карту строят два экрана: вкладка деталей кроя (плитки и панель) и рецепт колорвея (силуэт
// при имени детали). Оба рисуют контур через findPiece, и findPiece берёт ПЕРВУЮ живую привязку —
// то есть сам ключ карты, порядок refs и резолв скоупа входят в контракт показа. Две рукописные
// копии этой арифметики разошлись бы молча: одна и та же деталь рисовалась бы на плитке одним
// контуром, а в рецепте другим, и никто бы этого не заметил — ровно тот сорт «почти одинакового»,
// от которого заведён card-dxf-pack.ts.
import {
  fabricScopes,
  isRollGoodsSection,
  scopeKeyOfBinding,
  type FabricScope,
  type RollGoodsLine,
} from './bom-purpose';
import type { PieceBlockRef } from './nesting/dxf-geometry';

/** Строка `pieceDxfAliases` формы — ровно те поля, по которым резолвится связь. */
export type PieceAliasRow = {
  bomLineKey?: string;
  fabricPurpose?: string;
  blockName?: string;
  pieceLineKey?: string;
};

/** Строка BOM формы — те поля, из которых складываются скоупы тканей. */
type BomScopeRow = { lineKey?: string; section?: string; purpose?: string; name?: string };

/**
 * Ключ карты привязок: lineKey детали, свёрнутый так же, как при сборке (trim + нижний регистр —
 * так же фолдят ключ диалог сопоставления и сервер). Читатели обязаны искать этим же правилом.
 */
export const pieceRefKey = (lineKey: string): string => lineKey.trim().toLowerCase();

/**
 * Скоупы тканей карточки из сырых строк BOM: rollgoods со стабильным lineKey, свёрнутые в
 * назначения по правилу fabricScopes. Отдельной функцией, потому что фильтр «rollgoods и с
 * lineKey» — тоже часть контракта: пропусти его один читатель, и привязка зарезолвится у него в
 * скоуп, которого у соседа нет.
 */
export function rollGoodsScopes(rows: readonly BomScopeRow[]): FabricScope<RollGoodsLine>[] {
  return fabricScopes(
    rows
      .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
      .map((b) => ({
        lineKey: b.lineKey!,
        purpose: b.purpose,
        name: b.name,
        section: b.section,
      })),
  );
}

/**
 * Какими блоками DXF нарисована каждая деталь, по pieceRefKey.
 *
 * Скоуп резолвится СЕГОДНЯШНИМ BOM (scopeKeyOfBinding), а не берётся сырым полем: связь,
 * записанная на строку до того, как её разложили в назначение, принадлежит теперь этому
 * назначению — ровно как у листов выкроек. Скоуп едет вместе с именем, потому что без него
 * связь — просто строка, а строка «полочка» есть и на верхе, и на подкладе.
 */
export function pieceBlockRefs(
  aliases: readonly PieceAliasRow[],
  scopes: FabricScope<RollGoodsLine>[],
): Map<string, PieceBlockRef[]> {
  const m = new Map<string, PieceBlockRef[]>();
  for (const a of aliases) {
    const key = pieceRefKey(a.pieceLineKey ?? '');
    const block = (a.blockName ?? '').trim();
    if (!key || !block) continue;
    const scopeKey = scopeKeyOfBinding(a.fabricPurpose, a.bomLineKey, scopes);
    const list = m.get(key) ?? [];
    if (!list.some((r) => r.scopeKey === scopeKey && r.block === block)) {
      list.push({ scopeKey, block });
    }
    m.set(key, list);
  }
  return m;
}
