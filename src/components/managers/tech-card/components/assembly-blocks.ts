import type { AssemblyResult, AssemblyStep } from './assembly-frontier';

// Группировка операций в БЛОКИ ПОДСБОРОК — проекция, а не источник истины.
//
// ГЛАВНОЕ, ЧТО НАДО ПОНЯТЬ ПРО ЭТОТ ФАЙЛ: линейная последовательность шагов первична, блоки
// выводятся из неё. Первая редакция плана предлагала обратное — «порядок компилируется из
// блоков», — и это выброшено по двум причинам. Во-первых, прототип, объявленный источником
// варианта C, делает ровно наоборот: `blocksC` перечисляет производящие операции в порядке
// массива, топологической сортировки там нет и не нужно — правило 5 уже даёт топологию.
// Во-вторых, компиляция порядка перенумеровывает шаги, а массового ремапа ссылок дефектов на
// номера шагов в клиенте НЕ СУЩЕСТВУЕТ: единственный путь через replace() ссылки обнуляет.
// Строить перенумерацию поверх несуществующей дорожки — гарантированный тихий отрыв претензий
// от шагов.
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
  /** Хвостовой псевдоблок: шаги, не достигающие ни одного узла. */
  loose: AssemblyBlock;
  /** Индекс шага → ключ его блока ('' для хвостового). */
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

  steps.forEach((s, i) => {
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

  return { blocks: order.map((k) => byKey.get(k)!), loose, blockOfStep };
}
