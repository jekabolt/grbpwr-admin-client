// РОЛЬ СЛОЯ ДЕТАЛИ КРОЯ (T4) — ручное зеркало серверного правила entity.DerivePieceLayerRole
// (internal/entity/piece_layer_role.go), как весь словарь назначений.
//
// Решение владельца: одна деталь кроя может ссылаться на несколько материалов в одном колорвее,
// ЕСЛИ ЭТО СЛОИ (основной / подклад / дублерин); две ОСНОВНЫЕ ткани на одной цельной детали —
// ошибка данных. Роль слоя НИГДЕ НЕ ХРАНИТСЯ: она выводится из строки BOM, на которую ссылается
// детальная строка рецепта, — рулонные секции несут её назначением (purpose, ось скоупов выкроек с
// 0267), у lining/interlining/insulation роль однозначна из самой секции, и только fabric без
// назначения остаётся «не разложено» (0265 сознательно не гадал: под fabric прячутся карманка,
// контраст и сетка).
//
// Файл нарочно зависит только от bom-purpose-labels.ts (та же причина, по которой словарь
// назначений вынесен туда: публичные вьюеры не тянут schema/zod).

import { PURPOSE_LABEL, UNSET_PURPOSE, bomPurposeLabel } from './bom-purpose-labels';

// Четыре рулонные секции — копия ROLL_GOODS_SECTIONS из bom-purpose.ts, повторённая здесь ТОЛЬКО
// чтобы не тащить bom-purpose.ts (→ schema → zod) в публичные бандлы. Обе копии зеркалят один
// backend-список (entity.RollGoodsSectionList).
const ROLL_SECTIONS = new Set<string>([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';

// Фолбэк роли по секции, когда назначение не задано; fabric отсутствует намеренно (см. шапку).
const SECTION_FALLBACK_ROLE: Record<string, string> = {
  TECH_CARD_BOM_SECTION_LINING: 'TECH_CARD_BOM_PURPOSE_LINING',
  TECH_CARD_BOM_SECTION_INTERLINING: 'TECH_CARD_BOM_PURPOSE_INTERFACING',
  TECH_CARD_BOM_SECTION_INSULATION: 'TECH_CARD_BOM_PURPOSE_INSULATION',
};

export type PieceLayerRole = {
  /** Роль слоя как значение назначения; null = «не разложено» (fabric без назначения). */
  role: string | null;
  /** false — секция не рулонная: у связи нет роли слоя, правила целостности к ней не применяются. */
  rollGoods: boolean;
};

/** Зеркало entity.DerivePieceLayerRole: purpose, если задан и известен словарю, иначе фолбэк секции. */
export function derivePieceLayerRole(section?: string, purpose?: string): PieceLayerRole {
  if (!section || !ROLL_SECTIONS.has(section)) return { role: null, rollGoods: false };
  if (purpose && purpose !== UNSET_PURPOSE && PURPOSE_LABEL[purpose]) {
    return { role: purpose, rollGoods: true };
  }
  return { role: SECTION_FALLBACK_ROLE[section] ?? null, rollGoods: true };
}

export const isMainLayerRole = (r: PieceLayerRole): boolean => r.rollGoods && r.role === MAIN;
export const isUnsortedLayerRole = (r: PieceLayerRole): boolean => r.rollGoods && r.role === null;

/**
 * Подпись роли для бейджа/печати. «Не разложено» — своими словами, а не шрифтом роли: это не роль,
 * а её отсутствие, и полкарточки живых строк начинает ровно отсюда (0265 не бэкфилился).
 */
export function pieceLayerRoleLabel(r: PieceLayerRole): string {
  if (!r.rollGoods) return '';
  if (r.role === null) return 'unsorted';
  return bomPurposeLabel(r.role);
}
