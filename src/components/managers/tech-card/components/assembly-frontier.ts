// Сборочный граф тех-карты на клиенте: что лежит на столе перед шагом k.
//
// ЭТО ПОРТ, А НЕ ВТОРАЯ РЕАЛИЗАЦИЯ. Оригинал — `internal/entity/techcard_assembly.go` в
// grbpwr-products-manager; расхождение с ним есть дефект по определению, потому что пикер обязан
// предлагать РОВНО то, что примет запись. Разъехаться две реализации могут только через
// расхождение с общим набором кейсов, и он тут же, рядом: `assembly_cases.json` — побайтная копия
// `internal/entity/testdata/assembly_cases.json`.
//
//   Прогон:  node scripts/assembly-cases-probe.mjs
//   Сверка копии с бэкендной:
//     shasum -a 256 src/components/managers/tech-card/components/assembly_cases.json \
//                   ../grbpwr-wt-assembly/internal/entity/testdata/assembly_cases.json
//
// Прототип интерфейса (`operations-configurator.html`, функция derive()) эталоном НЕ является:
// он не реализует правило 4, считает арность джойна по длине списка входов и на коллизии «ключ
// узла = ключ детали» молча съедает второй вход. Кейсы взяты из движка, а не из него.
//
// Словарь. УЗЕЛ — именованный результат сборочного шага (SHELL, FRONT-L). ДЖОЙН — шаг с непустым
// выходным ключом: съедает свои входы, рождает узел. ПОГЛОЩЕНИЕ — джойн, чей выходной ключ
// совпадает с одним из входов-УЗЛОВ (GARMENT + HEM → GARMENT). ОБРАБОТКА — шаг с пустым выходным
// ключом: ничего не собирает, его входы остаются доступными следующим шагам.

export type AssemblyInputKind = 'piece' | 'unit';

export type OperationInput = {
  kind: AssemblyInputKind;
  key: string;
};

export type AssemblyPiece = {
  lineKey: string;
  name: string;
};

export type AssemblyStep = {
  inputs: OperationInput[];
  outputUnitKey: string;
  outputUnitName: string;
};

/** Номер нарушенного правила. Совпадает с сервером — по нему считают отказы в логах. */
export const AssemblyRule = {
  hygiene: 0,
  frontier: 1,
  singleUse: 2,
  joinArity: 3,
  converges: 4,
  namespace: 6,
  duplicateInput: 7,
} as const;

/**
 * Машинный код ВЕТКИ нарушения.
 *
 * Существует ради общих кейсов: две ветки правила 1 — «такого входа нет» и «он появится только
 * на шаге k» — дают одинаковые координаты, поэтому кейс, сверяющий только их, проходит
 * независимо от того, реализована вторая ветка или нет. В прототипе она мертва.
 */
export type AssemblyDetail =
  | 'shadow-name'
  | 'duplicate-input'
  | 'unknown-key'
  | 'produced-later'
  | 'self-reference'
  | 'consumed-earlier'
  | 'off-frontier'
  | 'key-is-piece'
  | 'too-few-inputs'
  | 'second-producer'
  | 'no-terminal'
  | 'many-terminals'
  | 'unreached-pieces';

export type AssemblyViolation = {
  rule: number;
  detail: AssemblyDetail;
  /** индекс шага; -1 для нарушения уровня карточки */
  step: number;
  /** индекс внутри входов шага; -1 если нарушение не про конкретный вход */
  input: number;
  key: string;
  message: string;
};

export type AssemblyUnit = {
  key: string;
  name: string;
  /** шаг, ПЕРВЫМ произведший узел; поглощающие его не меняют */
  producedAt: number;
  absorbedAt: number[];
  /** замыкание по строкам деталей, в порядке объявления деталей */
  leaves: string[];
};

export type AssemblyResult = {
  /** что осталось на столе после последнего шага, в порядке появления */
  frontier: string[];
  units: Map<string, AssemblyUnit>;
  consumedBy: Map<string, number>;
  /** frontierBefore[i] — что пикер шага i имеет право предлагать */
  frontierBefore: string[][];
  violations: AssemblyViolation[];
};

/**
 * Классификация сырого ключа. Ключ, не совпавший ни с одной деталью, есть ссылка на узел —
 * возможно висячая, её ловит правило 1, а не классификация.
 *
 * Сравнение ПОБАЙТНОЕ: никаких toLowerCase и trim. «SHELL» и «Shell» — два разных узла, ровно
 * как в колонке с utf8mb4_bin.
 */
export function classifyAssemblyInputs(pieceKeys: Set<string>, rawKeys: string[]): OperationInput[] {
  return rawKeys.map((key) => ({ kind: pieceKeys.has(key) ? 'piece' : 'unit', key }));
}

const humanStep = (i: number) => String(i + 1);

/**
 * Один проход живым множеством: правила 1, 2, 5 (фронтир) плюс локальные 3, 6, 7.
 *
 * Порядок шагов — порядок массива; проход НЕ сортирует сам, иначе правило 5 стало бы
 * непроверяемым («порядок неверен» превратилось бы в «порядок исправлен»).
 */
export function assemblySweep(pieces: AssemblyPiece[], steps: AssemblyStep[]): AssemblyResult {
  const res: AssemblyResult = {
    frontier: [],
    units: new Map(),
    consumedBy: new Map(),
    frontierBefore: [],
    violations: [],
  };

  const pieceOrder = new Map<string, number>();
  const pieceName = new Map<string, string>();
  const order: string[] = [];
  const live = new Map<string, boolean>();
  const leaves = new Map<string, string[]>();

  pieces.forEach((p, i) => {
    if (!p.lineKey || pieceOrder.has(p.lineKey)) return;
    pieceOrder.set(p.lineKey, i);
    pieceName.set(p.lineKey, p.name);
    order.push(p.lineKey);
    live.set(p.lineKey, true);
    leaves.set(p.lineKey, [p.lineKey]);
  });
  const isPiece = (key: string) => pieceOrder.has(key);

  // Заполняется ДО прохода, чтобы ветка «появится позже» была достижима. Без неё шаг,
  // ссылающийся вперёд, получал бы «такого входа не существует» — диагностику, которая уводит
  // искать опечатку там, где переставлены шаги.
  const firstProducer = new Map<string, number>();
  steps.forEach((s, i) => {
    if (s.outputUnitKey && !firstProducer.has(s.outputUnitKey)) firstProducer.set(s.outputUnitKey, i);
  });

  const known = (key: string) => isPiece(key) || res.units.has(key);
  const filterLive = () => order.filter((k) => live.get(k));

  steps.forEach((s, i) => {
    res.frontierBefore.push(filterLive());

    if (!s.outputUnitKey && s.outputUnitName) {
      res.violations.push({
        rule: AssemblyRule.hygiene,
        detail: 'shadow-name',
        step: i,
        input: -1,
        key: '',
        message: `the unit name “${s.outputUnitName}” is typed in, but there is no key: the step assembles nothing`,
      });
    }

    const seen = new Map<string, number>();
    // usable — РАЗЛИЧНЫЕ СУЩЕСТВУЮЩИЕ живые входы; на них считается арность джойна.
    const usable = new Set<string>();
    s.inputs.forEach((input, j) => {
      const first = seen.get(input.key);
      if (first !== undefined) {
        res.violations.push({
          rule: AssemblyRule.duplicateInput,
          detail: 'duplicate-input',
          step: i,
          input: j,
          key: input.key,
          message: `this input repeats within the same step (first seen at input ${first + 1})`,
        });
        return;
      }
      seen.set(input.key, j);

      if (!known(input.key)) {
        const at = firstProducer.get(input.key);
        if (at !== undefined && at >= i) {
          res.violations.push(
            at === i
              ? {
                  rule: AssemblyRule.frontier,
                  detail: 'self-reference',
                  step: i,
                  input: j,
                  key: input.key,
                  message: `“${input.key}” is this step's own output: a unit appears after the step, not before it`,
                }
              : {
                  rule: AssemblyRule.frontier,
                  detail: 'produced-later',
                  step: i,
                  input: j,
                  key: input.key,
                  message: `unit “${input.key}” appears only at step ${humanStep(at)} — it can't be an input any earlier`,
                },
          );
          return;
        }
        res.violations.push({
          rule: AssemblyRule.frontier,
          detail: 'unknown-key',
          step: i,
          input: j,
          key: input.key,
          message: `input “${input.key}” doesn't exist: there is no such piece and no such unit`,
        });
        return;
      }

      if (!live.get(input.key)) {
        const eater = res.consumedBy.get(input.key);
        if (eater === undefined) {
          // Недостижимо при целом состоянии; ветка оставлена, чтобы будущая правка прохода не
          // потеряла отказ молча.
          res.violations.push({
            rule: AssemblyRule.frontier,
            detail: 'off-frontier',
            step: i,
            input: j,
            key: input.key,
            message: `input “${input.key}” is no longer on the table`,
          });
          return;
        }
        const eaterUnit = steps[eater]?.outputUnitKey || '?';
        res.violations.push({
          rule: AssemblyRule.singleUse,
          detail: 'consumed-earlier',
          step: i,
          input: j,
          key: input.key,
          message: `“${input.key}” is already consumed by step ${humanStep(eater)} and sits inside unit ${eaterUnit}`,
        });
        return;
      }

      usable.add(input.key);
    });

    if (!s.outputUnitKey) return; // обработка: входы остаются на столе

    const out = s.outputUnitKey;

    if (isPiece(out)) {
      // НЕ поглощение: поглощать можно только узел. В прототипе этот случай считается
      // поглощением, деталь получает чужие листья, а второй вход исчезает без сообщения.
      const shown = pieceName.get(out) || out;
      res.violations.push({
        rule: AssemblyRule.namespace,
        detail: 'key-is-piece',
        step: i,
        input: -1,
        key: out,
        message: `the unit key “${out}” is taken by piece “${shown}”: pieces and units share one namespace`,
      });
      return;
    }

    if (usable.size < 2) {
      res.violations.push({
        rule: AssemblyRule.joinArity,
        detail: 'too-few-inputs',
        step: i,
        input: -1,
        key: out,
        message: 'a unit made of a single input is processing, not a unit: a join needs at least two different inputs',
      });
      return;
    }

    const prev = res.units.get(out);
    const absorb = prev !== undefined && usable.has(out);

    if (prev !== undefined && !absorb) {
      let advice = ': to add to it, take it as an input of this step as well';
      const eaten = res.consumedBy.get(out);
      if (eaten !== undefined) {
        advice = ` and is already consumed by step ${humanStep(eaten)}: it can't be added to any more`;
      } else if (!live.get(out)) {
        advice = '';
      }
      res.violations.push({
        rule: AssemblyRule.singleUse,
        detail: 'second-producer',
        step: i,
        input: -1,
        key: out,
        message: `unit “${out}” is already produced by step ${humanStep(prev.producedAt)}${advice}`,
      });
      // Узел НЕ переписывается: сохранённое замыкание остаётся честным.
      return;
    }

    let acc: string[] = absorb && prev ? [...prev.leaves] : [];
    s.inputs.forEach((input) => {
      if (!usable.has(input.key)) return;
      live.set(input.key, false);
      if (input.key === out) return; // узел не ест сам себя
      res.consumedBy.set(input.key, i);
      acc = acc.concat(leaves.get(input.key) ?? []);
    });
    acc = dedupPieceKeys(acc, pieceOrder);

    if (absorb && prev) {
      prev.absorbedAt.push(i);
      prev.leaves = acc;
      if (!prev.name) prev.name = s.outputUnitName;
      res.units.set(out, prev);
    } else {
      res.units.set(out, { key: out, name: s.outputUnitName, producedAt: i, absorbedAt: [], leaves: acc });
      order.push(out);
    }
    leaves.set(out, acc);
    live.set(out, true);
  });

  res.frontier = filterLive();
  return res;
}

/**
 * Правило 4 — сходимость сборки. Отдельно от прохода: на черновике полуразмеченная карточка
 * законна и живёт сколько угодно.
 *
 * Условие включения — карточка несёт хотя бы один ПРОИЗВОДЯЩИЙ ШАГ, а не хотя бы один
 * состоявшийся узел: иначе карточка, где единственный джойн отвергнут, тихо проваливалась бы
 * мимо проверки как «неразмеченная».
 */
export function assemblyReleaseCheck(
  pieces: AssemblyPiece[],
  steps: AssemblyStep[],
  res: AssemblyResult,
): AssemblyViolation[] {
  if (!steps.some((s) => !!s.outputUnitKey)) return [];

  const out: AssemblyViolation[] = [];
  const terminals = res.frontier.filter((k) => res.units.has(k));

  if (terminals.length === 0) {
    out.push({
      rule: AssemblyRule.converges,
      detail: 'no-terminal',
      step: -1,
      input: -1,
      key: '',
      message: 'the assembly doesn\'t converge: not a single finished unit at the end',
    });
  } else if (terminals.length > 1) {
    out.push({
      rule: AssemblyRule.converges,
      detail: 'many-terminals',
      step: -1,
      input: -1,
      key: '',
      message: `there must be exactly one terminal unit, and there are ${terminals.length}: ${terminals.join(', ')}`,
    });
  }

  // Сироты перечисляются ТОЛЬКО при одном терминале: при двух ни одна деталь формально не
  // достигает изделия, и список из сорока имён утопил бы настоящую причину.
  if (terminals.length !== 1) return out;

  const reached = new Set(res.units.get(terminals[0])?.leaves ?? []);
  const orphans = pieces.filter((p) => p.lineKey && !reached.has(p.lineKey)).map((p) => p.name || p.lineKey);
  if (orphans.length > 0) {
    out.push({
      rule: AssemblyRule.converges,
      detail: 'unreached-pieces',
      step: -1,
      input: -1,
      key: '',
      message: `these never reach the finished garment: ${orphans.join(', ')}`,
    });
  }
  return out;
}

/**
 * Приводит замыкание к порядку объявления деталей; дедуп чисто защитный. При живом правиле 2
 * повторов не бывает по построению — замыкания живых сущностей дизъюнктны.
 */
function dedupPieceKeys(keys: string[], pieceOrder: Map<string, number>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.sort((a, b) => (pieceOrder.get(a) ?? 0) - (pieceOrder.get(b) ?? 0));
}
