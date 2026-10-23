// Что делать с шагами сборки, когда старые детали уходят с карточки.
//
// НИЧЕГО со структурой сборки: ни снятия входа, ни растворения/удаления join, ни подстановки его
// узла в следующие шаги. Каркас сборки принадлежит технологу и переписывается только явным Apply
// панели каркаса. Ссылка на ушедшую деталь остаётся видимой в том же месте и получает существующую
// метку `remapped`, которую оператор разбирает и снимает в рельсе сборки. `orphan` здесь неверен:
// он предназначен для живой детали-призрака и не снимается кнопкой review.
//
// Единственная допустимая правка входа — переданный вызывающим доказанный successor: один старый
// ключ становится одним новым ключом на той же позиции. Карта обязана быть 1:1; неоднозначная
// подстановка не применяется, ссылка остаётся как есть и получает `remapped`. Сверка ключей
// ПОБАЙТНАЯ, как у removePiece и
// classifyAssemblyInputs.

type OpRow = {
  inputKeys?: string[];
  outputUnitKey?: string;
  outputUnitName?: string;
  media?: { annotations?: { pieceLineKey?: string; pieceLineKeys?: string[] }[] }[];
  review?: string;
};

export type OldPieceOpsPlan<T extends OpRow> = {
  operations: T[];
  changed: boolean;
  marked: number;
  remapped: number;
};

export function planOldPieceOps<T extends OpRow>(
  operations: readonly T[],
  goneKeys: ReadonlySet<string>,
  successors: ReadonlyMap<string, string> = new Map(),
): OldPieceOpsPlan<T> {
  // Only a byte-exact, injective old → new map is safe. Two old pieces claiming one successor are
  // not a 1:1 identity remap, so both stay dangling for review.
  const targetCounts = new Map<string, number>();
  for (const [from, rawTo] of successors) {
    const to = rawTo.trim();
    if (!goneKeys.has(from) || !to || to === from) continue;
    targetCounts.set(to, (targetCounts.get(to) ?? 0) + 1);
  }
  const successorOf = (key: string): string | null => {
    const to = successors.get(key)?.trim() ?? '';
    return to && to !== key && targetCounts.get(to) === 1 ? to : null;
  };

  let changed = false;
  let marked = 0;
  let remapped = 0;
  const out = operations.map((operation) => {
    const before = operation.inputKeys ?? [];
    // An annotation is also a step → piece reference. It is left untouched (the only permitted
    // key rewrite is inside inputs), but it still raises the same review mark when its piece left.
    let dangling =
      operation.media?.some((media) =>
        media.annotations?.some(
          (annotation) =>
            (!!annotation.pieceLineKey && goneKeys.has(annotation.pieceLineKey.trim())) ||
            annotation.pieceLineKeys?.some((key) => goneKeys.has(key.trim())),
        ),
      ) ?? false;
    let mapped = false;
    const inputKeys = before.map((key) => {
      if (!goneKeys.has(key)) return key;
      const successor = successorOf(key);
      if (!successor) {
        dangling = true;
        return key;
      }
      mapped = true;
      remapped++;
      return successor;
    });
    if (!dangling && !mapped) return operation;

    // Preserve a stronger existing split/orphan mark; otherwise use the ordinary mark that the
    // sequence rail clears after the operator reviews this unchanged step.
    const previousReview = operation.review?.trim() ?? '';
    const review =
      previousReview === 'orphan' || previousReview === 'split' ? previousReview : 'remapped';
    const reviewChanged = operation.review !== review;
    if (reviewChanged) marked++;
    changed = changed || mapped || reviewChanged;
    return {
      ...operation,
      ...(mapped ? { inputKeys } : {}),
      ...(reviewChanged ? { review } : {}),
    };
  });

  return { operations: out, changed, marked, remapped };
}
