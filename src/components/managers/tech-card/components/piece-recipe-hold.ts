import { common_AdminColorwayRef } from 'api/proto-http/admin';

// Что держится на ОДНОЙ детали: в каких колорвеях есть её строки рецепта, сколько строк всего и
// сколько из них несут ЧИСЛО (норму), а не только назначение ткани.
export type PieceRecipeHold = { colorways: string[]; rows: number; withNorm: number };

// ЧТО УЕДЕТ ВМЕСТЕ С ДЕТАЛЬЮ — по ключу детали (lineKey в НИЖНЕМ регистре).
//
// Строка рецепта ссылается на деталь внешним ключом ON DELETE RESTRICT (fk_usage_piece), поэтому
// сервер удаляет такие строки ВМЕСТЕ с деталью, в той же транзакции. Иначе карточка запиралась
// насмерть: рецепт правится другим RPC, сохранение карточки его не трогает, а строка эта заводится
// самым обычным действием — «назначить детали ткань», — так что на разобранной карточке держатся
// ВСЕ детали разом. Заменил чертёж на файл с другими именами блоков — и каждое сохранение
// отказывает по одной детали за раз.
//
// ЭТО ЕДИНСТВЕННЫЙ СЧЁТ ПОТЕРЬ, КОТОРЫЙ МОЖНО ПОКАЗАТЬ ДО ТОГО, КАК ОНО СЛУЧИТСЯ. Назначение
// ткани без детали — утверждение без подлежащего, и терять его не жалко; вписанная норма — это
// число, которое кто-то считал, и о нём предупреждают отдельной строкой.
//
// ЖИВЁТ ОТДЕЛЬНЫМ МОДУЛЕМ, А НЕ КОПИЕЙ В КАЖДОМ ЭКРАНЕ: деталь удаляют из двух мест — панель детали
// на вкладке pieces и модалка «↔ детали кроя». Две копии правила разъедутся молча, а цена
// расхождения здесь — молча снесённые строки рецепта, которых оператору никто не показал.
//
// ПРОЕКЦИЯ НЕПОЛНАЯ: чтение карточки скрывает АРХИВНЫЕ колорвеи, а их строки держат деталь так же
// и так же уедут при её удалении. Поэтому подтверждение обязано говорить «и в архивных, если они
// есть», а не молчать, — здесь их просто неоткуда взять.
export function recipeHoldersByPiece(
  colorways: readonly common_AdminColorwayRef[] | undefined,
): Map<string, PieceRecipeHold> {
  const m = new Map<string, PieceRecipeHold>();
  const hasNorm = (u: {
    consumption?: { value?: string } | null;
    quantity?: { value?: string } | null;
    sizeConsumptions?: unknown[];
  }) =>
    !!u.consumption?.value?.trim() ||
    !!u.quantity?.value?.trim() ||
    (u.sizeConsumptions?.length ?? 0) > 0;
  for (const c of colorways ?? []) {
    const label = c.colorCode?.trim() || c.baseSku?.trim() || `#${c.colorwayId ?? ''}`;
    for (const u of c.usages ?? []) {
      const key = (u.pieceLineKey ?? '').trim().toLowerCase();
      if (!key) continue;
      const cur = m.get(key) ?? { colorways: [], rows: 0, withNorm: 0 };
      if (!cur.colorways.includes(label)) cur.colorways.push(label);
      cur.rows += 1;
      if (hasNorm(u)) cur.withNorm += 1;
      m.set(key, cur);
    }
  }
  return m;
}
