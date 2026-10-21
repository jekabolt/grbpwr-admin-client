// Что делать с шагами сборки, когда старые детали уходят с карточки.
//
// Раньше применение просто снимало ключ детали со входов: шов «P_old + MP_old» оставался без
// входов, движок сборки отвечал join-arity, и карточка переставала сохраняться — по шагу, которого
// оператор не трогал. Теперь шов, который задело удаление и у которого осталось меньше двух входов:
//   · один вход   → растворяется: становится обработкой этого входа (время, машина, SMV живут),
//                   а следующие шаги вместо узла берут этот самый вход — он и был узлом;
//   · ноль входов → удаляется, а ключ его узла снимается со следующих шагов.
// Обработки (шаг без узла) не удаляются: обработка без детали — допустимый общий шаг.
// Узел появляется раньше своих потребителей, поэтому хватает одного прохода по порядку.
// Сверка ключей ПОБАЙТНАЯ, как у removePiece и classifyAssemblyInputs.

type OpRow = {
  inputKeys?: string[];
  outputUnitKey?: string;
  outputUnitName?: string;
};

export type OldPieceOpsPlan<T extends OpRow> = {
  operations: T[];
  changed: boolean;
  removed: number;
  dissolved: number;
};

export function planOldPieceOps<T extends OpRow>(
  operations: T[],
  goneKeys: Set<string>,
): OldPieceOpsPlan<T> {
  // ключ → чем его заменить ('' = снять)
  const subst = new Map<string, string>();
  for (const k of goneKeys) subst.set(k, '');
  const out: T[] = [];
  let changed = false;
  let removed = 0;
  let dissolved = 0;

  for (const o of operations) {
    const before = (o.inputKeys ?? []).filter(Boolean);
    const after: string[] = [];
    for (const k of before) {
      const v = subst.has(k) ? subst.get(k)! : k;
      if (v && !after.includes(v)) after.push(v);
    }
    const hit = after.length !== before.length || after.some((k, i) => k !== before[i]);
    if (!hit) {
      out.push(o);
      continue;
    }
    changed = true;
    const unit = (o.outputUnitKey ?? '').trim();
    const own = after.filter((k) => k !== unit);
    if (!unit || own.length >= 2) {
      out.push({ ...o, inputKeys: after });
    } else if (own.length === 1) {
      subst.set(unit, own[0]);
      dissolved++;
      out.push({ ...o, inputKeys: own, outputUnitKey: '', outputUnitName: '' });
    } else {
      subst.set(unit, '');
      removed++;
    }
  }
  return { operations: out, changed, removed, dissolved };
}
