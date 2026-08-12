// UNI: «деталь не градуируется» как ЗАЯВЛЕНИЕ автора, а не как молчание разбора.
//
// Всё, что пробнику нужно из живого кода, — здесь, чистыми импортами. Компоненты не рендерим:
// проверяемые правила живут в чистых функциях, и вход у них — имена блоков и контуры.
import {
  deriveBlockSizes,
  normBlock,
  splitBlockSize,
  uniBaseOf,
  uniOf,
} from 'components/managers/tech-card/components/nesting/block-code';
import {
  dedupeUniPieces,
  markerUnits,
  selectMarkerPieces,
  uniConflictReason,
  unitsOfPieces,
} from 'components/managers/tech-card/components/nesting/piece-selection';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/split-pieces';
import type { PieceDTO } from 'lib/nesting/types';

export {
  dedupeUniPieces,
  deriveBlockSizes,
  markerUnits,
  normBlock,
  selectMarkerPieces,
  splitBlockSize,
  splitPiecesBySize,
  uniBaseOf,
  uniConflictReason,
  uniOf,
  unitsOfPieces,
};

// Словарь размеров ЦЕЛИКОМ (как его отдаёт useDictionarySizeTokens), а не ряд карточки: разбор
// обязан узнавать размер, которого в карточке ещё нет.
export const DICT = new Set(['xs', 's', 'm', 'l', 'xl', 'xxl', '44', '46', '48', '50']);
export const isSizeToken = (t: string) => DICT.has(t);

// Площадь растёт с размером — так же, как в жизни: по ней splitPiecesBySize упорядочивает группы.
const AREA_OF: Record<string, number> = { xs: 100, s: 110, m: 120, l: 130, xl: 140 };
const areaFor = (name: string): number => {
  const tail = name.split('_').pop() ?? '';
  return AREA_OF[tail.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()] ?? 90;
};

export function piece(
  id: number,
  blockName: string,
  over: Partial<PieceDTO> = {},
): PieceDTO {
  const areaCm2 = over.areaCm2 ?? areaFor(blockName);
  return {
    id,
    name: blockName,
    blockName,
    layer: '1',
    source: 'probe.dxf',
    fileIndex: 0,
    poly: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: areaCm2 / 10 },
      { x: 0, y: areaCm2 / 10 },
    ],
    bboxW: 10,
    bboxH: areaCm2 / 10,
    areaCm2,
    ...over,
  };
}

/** Детали из списка имён, id по порядку с 1. */
export function piecesOf(names: readonly string[], over: Partial<PieceDTO> = {}): PieceDTO[] {
  return names.map((n, i) => piece(i + 1, n, over));
}

// ── ИМЕНА ИЗ НАСТОЯЩЕГО ФАЙЛА ────────────────────────────────────────────────────────────────
//
// Четыре кармана — дословно из `POCKETS (2).dxf`: токен UNI стоит перед базовым размером, а не
// вместо него. Именно эта форма и делала их «безразмерными по недоразумению».
export const PCK_UNI = ['PCK_L_UNI_M', 'PCK_L_#_UNI_M', 'PCK_R_UNI_M', 'PCK_R_#_UNI_M'];

// Градуированный основной файл. ДВЕ полные основы, а не одна, и это не украшение: порог
// deriveBlockSizes (`need = max(2, max/2)`) требует, чтобы размерный токен встретился не меньше
// чем у двух основ, — файл с единственной градуированной основой не даёт вердикта вовсе (см.
// секцию T1, случай a0: это СЕГОДНЯШНЕЕ поведение, к UNI отношения не имеющее).
export const GRADED = [
  'BP_XS',
  'BP_S',
  'BP_M',
  'BP_L',
  'BP_XL',
  'SL_R_XS',
  'SL_R_S',
  'SL_R_M',
  'SL_R_L',
  'SL_R_XL',
];
