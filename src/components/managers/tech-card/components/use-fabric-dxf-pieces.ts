// КОМПЛЕКТ ДЕТАЛЕЙ ТКАНИ ОДНОЙ СТРОКИ РЕЦЕПТА — из формы карточки, одной реализацией на всех.
//
// Этим хуком пользуются диалог применения «по выкройкам» (dxf-apply.tsx) и пересчёт dxf-нормы по
// текущим данным (dxf-recheck.tsx). Комплект — это ВХОД расчёта площади, и собери его два места
// по-разному (другим фильтром, другим скоупом), «расхождение нормы» оказалось бы разницей двух
// наших же выборок, а не входных данных.
//
// ⚠ Хук держит подписки на ТРИ массива формы (BOM, детали кроя, связи блоков) — вызывающий обязан
// монтироваться только тогда, когда ответ действительно нужен (кнопка на редактируемой строке,
// открытая раскрывашка): редакторы ВСЕХ колорвеев смонтированы одновременно, и правка любой строки
// BOM будила бы каждую лишнюю подписку.
import { useMemo } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { fabricScopes, isRollGoodsSection } from './bom-purpose';
import type { DxfNormPiece } from './nesting/dxf-consumption';
import type { TechCardFormData } from './schema';

type PieceRow = {
  lineKey?: string;
  name?: string;
  piecesPerGarment?: number;
  materials?: { bomLineKey?: string; fusingBomLineKey?: string }[];
};
type AliasRow = {
  pieceLineKey?: string;
  blockName?: string;
  bomLineKey?: string;
  fabricPurpose?: string;
};
type BomRow = { lineKey?: string; section?: string; purpose?: string; name?: string };

/**
 * Привязка «деталь → ткань», ЗАЯВЛЕННАЯ В РЕЦЕПТЕ КОЛОРВЕЯ: строка рецепта с ссылкой на деталь и на
 * слот. Второй, равноправный источник комплекта — и на практике ОСНОВНОЙ.
 *
 * Изначально комплект собирался только по `pieces[].materials[].bomLineKey` (вкладка деталей кроя,
 * таблица tech_card_piece_material), и рассуждение было правильным по форме: ткань детали заявлена
 * на самой детали. Но поток, которым пользуются, — другой: «+ добавить материал к детали» на вкладке
 * колорвеев пишет СТРОКУ РЕЦЕПТА (tech_card_colorway_usage с piece_id), а не материал детали. На
 * бете это видно в лоб: по всей базе в tech_card_piece_material девять строк на три карточки, и лишь
 * одна из них вообще называет ткань, — тогда как рецепты с привязкой к детали заполнены. Комплект,
 * собранный по одному первому источнику, оставался пустым, кнопка «по выкройкам» не появлялась, и
 * оператор, честно назначивший ткань каждой детали, видел пустую строку без объяснений.
 *
 * Поэтому источника ДВА, и они объединяются. Пересечение безопасно: деталь, названная обоими,
 * входит в комплект один раз (дедуп по ключу детали).
 */
export type RecipePieceLink = { pieceLineKey?: string; bomLineKey?: string };

export function useFabricDxfPieces(
  control: Control<TechCardFormData>,
  lineKey: string,
  recipeLinks: readonly RecipePieceLink[] = [],
): { pieces: DxfNormPiece[]; unaliasedPieces: string[] } {
  const bomRows = (useWatch({ control, name: 'bomItems' }) ?? []) as BomRow[];
  const pieceRows = (useWatch({ control, name: 'pieces' }) ?? []) as PieceRow[];
  const aliasRows = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as AliasRow[];

  // Скоупы ткани считаются ОДИН раз на строку: с 0267 и лист выкройки, и связь блок→деталь
  // привязаны к НАЗНАЧЕНИЮ, а не к строке BOM, поэтому фильтр по одному lineKey теряет листы
  // «основного материала» и отвечает «выкроек нет» там, где они загружены.
  const scopes = useMemo(
    () =>
      fabricScopes(
        bomRows
          .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
          .map((b) => ({ lineKey: b.lineKey as string, purpose: b.purpose, name: b.name })),
      ),
    [bomRows],
  );
  const scopeKey = useMemo(
    () => scopes.find((s) => s.lines.some((l) => l.lineKey === lineKey))?.key ?? '',
    [scopes, lineKey],
  );

  // КОМПЛЕКТ ДЕТАЛЕЙ СЧИТАЕТСЯ ПО ПРИВЯЗКЕ «ДЕТАЛЬ → ТКАНЬ», А НЕ ПО АЛИАСАМ, и это главное решение
  // этого файла. Ткань детали заявлена на самой детали (`pieces[].materials[].bomLineKey`); связь с
  // блоком чертежа (алиас) — отдельный факт, которого может не быть. Собери комплект по алиасам, и
  // деталь этой же ткани, которую просто забыли связать, молча выпадет из площади — площадь станет
  // меньше, норма меньше, а обнаружится это на складе. Поэтому непривязанные детали не
  // выбрасываются, а НАЗЫВАЮТСЯ и расчёт на них отказывает (см. dxfNormAreas).
  //
  // Количество на изделие — тоже из карточки. Сколько экземпляров блока лежит в файле, не
  // спрашиваем принципиально: две ревизии одного листа читались бы как «деталь идёт по две».
  return useMemo(() => {
    if (!scopeKey) return { pieces: [] as DxfNormPiece[], unaliasedPieces: [] as string[] };
    const byPiece = new Map<string, { block: string; scopeKey: string }[]>();
    for (const a of aliasRows) {
      const key = (a.pieceLineKey ?? '').trim().toLowerCase();
      const block = (a.blockName ?? '').trim();
      if (!key || !block) continue;
      const purpose = (a.fabricPurpose ?? '').trim();
      const own = purpose
        ? scopes.find((s) => s.byPurpose && s.key === purpose)
        : scopes.find((s) => s.lines.some((l) => l.lineKey === (a.bomLineKey ?? '').trim()));
      if ((own?.key ?? '') !== scopeKey) continue;
      const list = byPiece.get(key) ?? [];
      if (!list.some((r) => r.block === block)) list.push({ block, scopeKey });
      byPiece.set(key, list);
    }
    // Детали, назначенные этой ткани СТРОКАМИ РЕЦЕПТА (второй источник, см. RecipePieceLink).
    // Ключи деталей нормализуются так же, как всюду здесь: trim + lower.
    const byRecipe = new Set<string>();
    for (const r of recipeLinks) {
      const key = (r.pieceLineKey ?? '').trim().toLowerCase();
      const line = (r.bomLineKey ?? '').trim();
      if (!key || !line) continue;
      if ((scopes.find((s) => s.lines.some((l) => l.lineKey === line))?.key ?? '') === scopeKey) {
        byRecipe.add(key);
      }
    }

    const out: DxfNormPiece[] = [];
    const missing: string[] = [];
    for (const p of pieceRows) {
      const key = (p.lineKey ?? '').trim().toLowerCase();
      if (!key) continue;
      // Деталь принадлежит ЭТОЙ ткани, если её называет ЛИБО строка материалов самой детали, ЛИБО
      // строка рецепта колорвея (второй источник — на практике основной). Дублирование
      // (`fusingBomLineKey`) сюда НЕ входит ни в одном из источников: клеевая — другая ткань, у неё
      // свой слот и своя норма.
      const ownsScope =
        byRecipe.has(key) ||
        (p.materials ?? []).some((m) => {
          const line = (m.bomLineKey ?? '').trim();
          if (!line) return false;
          return (
            (scopes.find((s) => s.lines.some((l) => l.lineKey === line))?.key ?? '') === scopeKey
          );
        });
      if (!ownsScope) continue;
      const refs = byPiece.get(key);
      const name = p.name?.trim() || key;
      if (!refs || refs.length === 0) {
        missing.push(name);
        continue;
      }
      out.push({
        name,
        // line_key — адрес детали на сервере (0297). Пустой ключ означает деталь, которую ещё не
        // сохраняли: площадь такой детали публиковать некуда, и публикация её просто не увидит.
        lineKey: (p.lineKey ?? '').trim(),
        perGarment: Math.max(1, Math.round(Number(p.piecesPerGarment ?? 1) || 1)),
        refs,
      });
    }
    return { pieces: out, unaliasedPieces: missing };
  }, [aliasRows, pieceRows, scopes, scopeKey, recipeLinks]);
}
