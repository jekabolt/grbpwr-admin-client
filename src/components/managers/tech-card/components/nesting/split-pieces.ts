// Чистая половина use-block-sizes: разбиение разобранного DXF по размерам и свёртка алиасов.
//
// Вынесено из use-block-sizes.ts БЕЗ ИЗМЕНЕНИЙ ради публичного вьюера выкроек (/p/:token):
// ему нужен splitPiecesBySize, но use-block-sizes тянет хуки словаря (useSizeNames →
// DictionaryProvider → adminService), а публичная страница обязана жить без авторизации.
// Токены размеров там строятся из манифеста, поэтому функции достаточно любого {has(token)}.
// Авторизованные потребители продолжают импортировать из use-block-sizes — он реэкспортирует.
import type { PieceDTO } from 'lib/nesting/types';
import {
  deriveBlockSizes,
  normBlock,
  splitBlockSize,
  uniBaseOf,
  uniOf,
  type BlockCode,
} from './block-code';

export type SizeGroup = {
  // Размер, как он написан в файле; '' — блоки без размерного хвоста.
  size: string;
  pieces: PieceDTO[];
};

export type BlockSplit = {
  // Разбор имени по каждой детали, по её id.
  codeById: Map<number, BlockCode>;
  groups: SizeGroup[];
  // Порядок размеров, общий для всех потребителей: селектор, столбец «размеры», список групп.
  // Считается по СРЕДНЕЙ ПЛОЩАДИ деталей размера, а не по ряду карточки: градация монотонна,
  // XS мельче XL, — значит порядок выводится из тех же данных, что и всё остальное, и работает
  // для размеров, которых в карточке ещё нет.
  orderOfSize: Map<string, number>;
  // Токены, которые в ЭТОМ файле оказались размерами (очищенные). Ими сворачиваются к
  // идентичности старые алиасы, где размер записан прямо в имени: иначе читающая и пишущая
  // стороны разошлись бы, и «снять связь» удаляла бы не тот ключ.
  sizeTokenSet: Set<string>;
  // Идентичности, которые файл вообще знает (ci). Ими проверяется, что сохранённый алиас УЖЕ
  // свёрнут: «FP_L» — это имя детали целиком, и резать у неё нечего.
  identities: Set<string>;
  // Имя блока, как оно написано В ФАЙЛЕ (ci) → его идентичность в написании файла. Только для
  // имён с размерным хвостом: ими сворачиваются старые алиасы вида «BP_1_XS», и сворачиваются
  // по вердикту для ЭТОГО блока, а не по форме имени.
  identityByBlock: Map<string, string>;
};

// Разбирает имена и раскладывает детали по размерам. Группы идут в порядке градации; группа ''
// (блоки без размерного хвоста) — последней: это остаток, а не размер.
export function splitPiecesBySize(
  pieces: readonly PieceDTO[],
  // Токены, которые ВООБЩЕ бывают размерами (весь словарь). Не ряд карточки: у карточки может
  // быть заведено M и L, а в файле лежать XS…XL — и тогда BP_S, BP_XS, BP_XL перестали бы быть
  // размерами и превратились в отдельные детали кроя вместо одной BP. Виды деталей обязаны
  // доставаться из ФАЙЛА, независимо от того, что успели завести в карточке.
  // Достаточно уметь отвечать «бывает ли такой токен размером» — подходит и Set, и Map словаря.
  dictTokens: { has(token: string): boolean },
): BlockSplit {
  // Что именно резать, решает структура файла, а не список токенов: см. deriveBlockSizes —
  // хвост обязан быть размером из словаря И меняться у своей основы, иначе «FP_L» слилась бы
  // с «FP_R» в одну деталь.
  const verdict = deriveBlockSizes(
    pieces.map((p) => p.blockName ?? ''),
    (t) => dictTokens.has(t),
  );

  const codeById = new Map<number, BlockCode>();
  const bySize = new Map<string, PieceDTO[]>();
  const identities = new Set<string>();
  const identityByBlock = new Map<string, string>();
  for (const p of pieces) {
    const raw = (p.blockName ?? '').trim();
    const size = verdict.get(raw) ?? '';
    // Признак и ключ считаются ТЕМИ ЖЕ функциями, что внутри вердикта, и на обеих ветках: ветка
    // «размер опознан» у uni-имени сегодня недостижима (deriveBlockSizes их пропускает), но
    // построена она не на этом факте, а на общем правиле — иначе первое же ослабление пропуска
    // тихо вернуло бы uni-блоку размер.
    const uni = uniOf(raw);
    const uniBase = uniBaseOf(raw, (t) => dictTokens.has(t));
    const code: BlockCode = size
      ? { raw, identity: raw.slice(0, raw.length - size.length - 1), size, uni, uniBase }
      : { raw, identity: raw, size: '', uni, uniBase };
    codeById.set(p.id, code);
    const ident = normBlock(code.identity);
    if (ident) {
      identities.add(ident.toLowerCase());
      if (code.size) identityByBlock.set(normBlock(raw).toLowerCase(), ident);
    }
    const list = bySize.get(code.size) ?? [];
    list.push(p);
    bySize.set(code.size, list);
  }

  // Порядок — по средней площади деталей размера. Ряд карточки для этого не годится: размеров
  // из файла в нём может не быть вовсе, а градация монотонна, так что площадь упорядочивает их
  // сама и без справочников.
  const meanArea = (ps: PieceDTO[]) =>
    ps.length === 0 ? 0 : ps.reduce((s, p) => s + p.areaCm2, 0) / ps.length;
  const groups = [...bySize.entries()]
    .map(([size, ps]) => ({ size, pieces: ps }))
    .sort((a, b) =>
      a.size === '' ? 1 : b.size === '' ? -1 : meanArea(a.pieces) - meanArea(b.pieces),
    );
  const orderOfSize = new Map(groups.map((g, i) => [g.size, g.size === '' ? 1e6 : i]));
  const sizeTokenSet = new Set(
    [...verdict.values()].map((raw) => raw.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()),
  );
  return { codeById, groups, orderOfSize, sizeTokenSet, identities, identityByBlock };
}

// Сохранённый алиас → идентичность детали кроя, СВЕРЕННАЯ С ФАЙЛОМ.
//
// Алиас пишется под идентичностью («FP_L»), но встречаются и старые записи, где размер остался в
// имени («BP_1_XS»), поэтому читающая сторона обязана уметь свернуть и их. Одним правилом «если
// последний токен похож на размер — отрезать» этого делать НЕЛЬЗЯ: в файле с рядом XS…XL оно
// срезает «L» у левой полочки, и «FP_L» ищется под несуществующей основой «FP». Ровно это и
// значило «блока «FP_L» в разобранных файлах нет» на детали, у которой связь была на месте:
// ломались ТОЛЬКО детали, чей модификатор совпал с размером (FP_L, SL_L), а FP_R и BP_1 жили.
//
// Поэтому спрашиваем ФАЙЛ, а не форму имени:
//   1. имя уже есть среди идентичностей файла — это она и есть, резать нечего;
//   2. имя есть среди имён блоков файла — отрезаем ровно тот хвост, который вердикт признал
//      размером у ЭТОГО блока;
//   3. имени в файле нет вовсе (лист перезалили, блок переименовали) — остаётся эвристика по
//      форме имени, но её ответ принимается, ТОЛЬКО если файл такую деталь знает: так
//      сворачивается «BP_1_XS» на листе, где из градации остался один BP_1_M, и не сворачивается
//      ничего другого.
//
// Последнее условие — не придирка. Эта же свёртка переносит на запись алиасы ЧУЖИХ тканей, чьи
// чертежи диалог даже не открывал: без него сохранение раскладки подкладки переименовывало
// «FP_L» верха в «FP» — по размерному ряду чужого файла, — и связь пропадала насовсем. Догадка,
// которой файл не поддакнул, обязана оставить имя как есть.
export function aliasIdentity(block: string, split: BlockSplit): string {
  const raw = normBlock(block);
  if (!raw) return '';
  const ci = raw.toLowerCase();
  if (split.identities.has(ci)) return raw;
  const known = split.identityByBlock.get(ci);
  if (known) return known;
  const guess = normBlock(splitBlockSize(raw, split.sizeTokenSet).identity);
  return guess !== raw && split.identities.has(guess.toLowerCase()) ? guess : raw;
}
