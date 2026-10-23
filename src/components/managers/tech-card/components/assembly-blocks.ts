import type { AssemblyResult, AssemblyStep } from './assembly-frontier';

// Группировка операций в БЛОКИ ПОДСБОРОК — проекция, а не источник истины.
//
// ГЛАВНОЕ, ЧТО НАДО ПОНЯТЬ ПРО ЭТОТ ФАЙЛ: линейная последовательность шагов первична, блоки
// выводятся из неё. Редактор не держит вторую копию порядка в блоках: `assemblyBlocks` остаётся
// чистой проекцией текущего массива. Единственное обратное преобразование живёт ниже —
// `compactAssemblyBlockOrder` собирает индексы для ЗАПИСИ, где ссылка дефекта на номер операции
// ремапится тем же преобразованием. Так экран не получает второго источника истины, а сохранённый
// маршрут не оставляет операции одного узла разбросанными между чужими блоками.
//
// АТРИБУЦИЯ ТРАНЗИТИВНАЯ, и это не украшение. Прототип приписывает шаг блоку, только если среди
// его входов есть УЗЕЛ. Чисто детальные заготовительные шаги — обметать, подогнуть, приутюжить,
// а это треть реального маршрута — уходят тогда в хвост «вне узлов»: досье показывает «SHELL:
// 4 шага» и свалку из пятнадцати. Технолог на это отвечает предсказуемо — приклеивает фиктивный
// второй вход, чтобы родить узел и получить блок. То есть модель начинает заставлять врать
// ровно там, где обещала перестать.
//
// Поэтому: шаг над деталью D принадлежит блоку узла, который D В ИТОГЕ съест.

export type AssemblyBlock = {
  /** Код узла; пустой у хвостового псевдоблока. */
  key: string;
  name: string;
  /** Индекс шага, впервые произведшего узел; -1 у хвостового. */
  producedAt: number;
  /** Индексы операций этого блока, в порядке последовательности. */
  steps: number[];
  /** Замыкание узла по деталям. */
  leaves: string[];
  /** Узел жив в конце (кандидат в терминалы) — или уже съеден другим. */
  live: boolean;
  /** Узел, в который этот в итоге ушёл; пусто, если остался на столе. */
  absorbedInto: string;
};

export type AssemblyBlocks = {
  blocks: AssemblyBlock[];
  /** Stored outside-block steps, in sequence order. They are not part of the loose tail. */
  standalone: number[];
  /** Хвостовой псевдоблок: шаги, не достигающие ни одного узла. */
  loose: AssemblyBlock;
  /** Индекс шага → ключ его блока ('' для хвостового; detached отсутствует). */
  blockOfStep: Map<number, string>;
};

const TAIL_KEY = '';

export function assemblyBlocks(steps: AssemblyStep[], res: AssemblyResult): AssemblyBlocks {
  const byKey = new Map<string, AssemblyBlock>();
  const order: string[] = [];

  for (const [key, unit] of res.units) {
    byKey.set(key, {
      key,
      name: unit.name,
      producedAt: unit.producedAt,
      steps: [],
      leaves: unit.leaves,
      live: res.frontier.includes(key),
      absorbedInto: '',
    });
    order.push(key);
  }
  // Порядок блоков — порядок их ПРОИЗВОДЯЩИХ ШАГОВ в последовательности. Не топологический:
  // топологию уже гарантировало правило 5, а вторая сортировка поверх неё только разошлась бы с
  // тем, что технолог видит в рельсе.
  order.sort((a, b) => (byKey.get(a)?.producedAt ?? 0) - (byKey.get(b)?.producedAt ?? 0));

  // Куда узел ушёл: ключ узла → ключ съевшего его узла. Нужен футеру блока («· уходит в ▣ W»),
  // чтобы съеденная подсборка не выглядела потерянной.
  res.consumedBy.forEach((stepIdx, key) => {
    const into = steps[stepIdx]?.outputUnitKey;
    const block = byKey.get(key);
    if (block && into && into !== key) block.absorbedInto = into;
  });

  // Деталь → узел, который её съел НЕПОСРЕДСТВЕННО. Это и есть транзитивная атрибуция для
  // заготовительных шагов: шаг над деталью принадлежит блоку узла, куда деталь ушла.
  const unitOfPiece = new Map<string, string>();
  res.consumedBy.forEach((stepIdx, key) => {
    if (byKey.has(key)) return; // это узел, не деталь
    const into = steps[stepIdx]?.outputUnitKey;
    if (into) unitOfPiece.set(key, into);
  });

  const loose: AssemblyBlock = {
    key: TAIL_KEY,
    name: '',
    producedAt: -1,
    steps: [],
    leaves: [],
    live: false,
    absorbedInto: '',
  };
  const blockOfStep = new Map<number, string>();
  const standalone: number[] = [];

  steps.forEach((s, i) => {
    if (s.assemblyBlockDetached) {
      standalone.push(i);
      return;
    }
    // Производящий шаг принадлежит своему узлу — включая поглощающий: он дособирает ТОТ ЖЕ узел,
    // и его место в его блоке.
    if (s.outputUnitKey && byKey.has(s.outputUnitKey)) {
      byKey.get(s.outputUnitKey)!.steps.push(i);
      blockOfStep.set(i, s.outputUnitKey);
      return;
    }
    // Обработка: блок определяется по входам. Первый вход, ведущий к узлу, и решает — порядок
    // входов авторский, и брать «какой-нибудь» значило бы отдать группировку случайности.
    for (const input of s.inputs) {
      const target = input.kind === 'unit' ? input.key : unitOfPiece.get(input.key);
      if (target && byKey.has(target)) {
        byKey.get(target)!.steps.push(i);
        blockOfStep.set(i, target);
        return;
      }
    }
    loose.steps.push(i);
    blockOfStep.set(i, TAIL_KEY);
  });

  return { blocks: order.map((k) => byKey.get(k)!), standalone, loose, blockOfStep };
}

/**
 * ПОРЯДОК ЗАПИСИ, В КОТОРОМ КАЖДЫЙ УЗЕЛ — ОДИН НЕПРЕРЫВНЫЙ БЛОК.
 *
 * `assemblyBlocks` намеренно хранит ГЛОБАЛЬНЫЕ индексы: поэтому `[12, 24, 59]` на экране раньше
 * уезжало на сервер как 130, 250, 600. Сервер не знает о блоках и честно перенумеровывает входной
 * массив `(position + 1) * 10`; значит собрать блоки обязан клиент до записи.
 *
 * Блок атомарен, но порядок блоков не берётся слепо по первой строке. Если узел A поглощается B,
 * весь A обязан стоять раньше всего B — иначе ранняя заготовительная строка B могла бы вытащить
 * его перед производителем A и сломать фронтир. Среди уже допустимых блоков побеждает самый ранний
 * исходный индекс: независимые узлы сохраняют авторский порядок. Отделённые и хвостовые строки —
 * самостоятельные группы; они остаются вне узлов, но больше не разрывают узел посередине.
 *
 * Возвращаются СТАРЫЕ индексы в новом порядке. Это важно: писатель тем же массивом строит обратную
 * карту и перевозит `issues[].operationNumber` вместе с операцией, а не оставляет претензию на
 * прежнем числе.
 */
export function compactAssemblyBlockOrder(grouped: AssemblyBlocks, stepCount: number): number[] {
  const identity = Array.from({ length: stepCount }, (_, index) => index);
  if (stepCount < 2 || grouped.blocks.length === 0) return identity;

  type Group = { id: string; steps: number[]; first: number; needs: Set<string> };
  const groups: Group[] = [];
  const groupByUnit = new Map<string, Group>();
  const claimed = new Set<number>();

  for (const block of grouped.blocks) {
    if (block.steps.length === 0) continue;
    const own = [...block.steps].sort((a, b) => a - b);
    // Повреждённая проекция не получает «починку», которая сама теряет или дублирует строку.
    if (own.some((index) => index < 0 || index >= stepCount || claimed.has(index))) return identity;
    own.forEach((index) => claimed.add(index));
    const group: Group = {
      id: `unit:${block.key}`,
      steps: own,
      first: own[0],
      needs: new Set(),
    };
    groups.push(group);
    groupByUnit.set(block.key, group);
  }

  // Всё, что проекция не отнесла к узлу (включая explicit detached), остаётся отдельной строкой.
  for (const index of identity) {
    if (claimed.has(index)) continue;
    groups.push({ id: `step:${index}`, steps: [index], first: index, needs: new Set() });
  }

  // Поглощение — единственная межблочная зависимость: дочерний узел должен быть готов раньше
  // родительского блока целиком. Внутри блока исходный порядок строк уже сохранён массивом `steps`.
  for (const block of grouped.blocks) {
    if (!block.absorbedInto || block.absorbedInto === block.key) continue;
    const child = groupByUnit.get(block.key);
    const parent = groupByUnit.get(block.absorbedInto);
    if (child && parent) parent.needs.add(child.id);
  }

  const done = new Set<string>();
  const ordered: number[] = [];
  while (done.size < groups.length) {
    const next = groups
      .filter((group) => !done.has(group.id) && [...group.needs].every((id) => done.has(id)))
      .sort((a, b) => a.first - b.first || a.id.localeCompare(b.id))[0];
    // Цикл невозможен в валидном сборочном графе. Если проекция всё же повреждена, порядок не
    // угадываем: исходный массив безопаснее частичной перестановки.
    if (!next) return identity;
    ordered.push(...next.steps);
    done.add(next.id);
  }

  return ordered.length === stepCount && new Set(ordered).size === stepCount ? ordered : identity;
}
