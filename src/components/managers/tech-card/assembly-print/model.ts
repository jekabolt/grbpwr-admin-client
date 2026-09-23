// МОДЕЛЬ ПЕЧАТНОЙ СХЕМЫ СБОРКИ — поверх настоящего движка (assembly-frontier + assembly-blocks).
//
// Правило 2 движка («однократность»): каждый ключ съедается ровно один раз ⇒ у узла не больше
// одного родителя ⇒ граф потребления — ЛЕС. Из этого следуют обе печатные формы без единого
// пересечения проводов:
//   • ROUTE — строки операций по порядку, узлы — вертикальные полосы («ветки метро») справа.
//     Полосы поддерева занимают непрерывный интервал (pre-order DFS), дети — в порядке съевших
//     шагов; коллектор шага проходит только по МЁРТВЫМ полосам, потому что всё поддерево ребёнка
//     съедено до самого ребёнка.
//   • MAP — карточки узлов в колонках по ВЫСОТЕ поддерева, полосы поддеревьев непрерывны и
//     упорядочены по наименьшему номеру операции; провод из щели в щель монотонен.
//
// СТРОКА ПЕЧАТАЕТ ТО, ЧТО ДВИЖОК ПРИНЯЛ, а не то, что шаг объявил. Шаг, объявивший узел из одного
// входа, узла не произвёл (правило 3) — на бумаге он «NOT APPLIED», а не «MAKES»; вход, съеденный
// раньше или неизвестный, не входит в TAKES. Рисовать объявление значило бы печатать сборку,
// которой по правилам нет, — и цех шил бы по ней. Все отказы движка перечислены в исключениях.
//
// На бумаге НЕТ КЛЮЧЕЙ: узел зовётся именем (outputUnitName) либо «UNIT FROM STEP N»; деталь —
// именем (lineKey непрозрачен, человек его не читает). Дубли имён различаются явно — иначе две
// полосы или два кроя стояли бы под одной подписью. Модуль чистый: ни DOM, ни миллиметров.
import { assemblyBlocks } from '../components/assembly-blocks';
import {
  assemblyReleaseCheck,
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyStep,
  type AssemblyViolation,
} from '../components/assembly-frontier';

export type PrintPiece = { lineKey: string; name: string };

/** Шаг, как его ЧИТАЕТ печать: имя уже собрано композитором заголовка, зона — отдельно. */
export type PrintStep = {
  number: number;
  verb: string;
  zone: string;
  inputKeys: string[];
  outputUnitKey: string;
  outputUnitName: string;
};

export type PrintCardInput = { pieces: PrintPiece[]; steps: PrintStep[] };

export type RowKind = 'makes' | 'adds' | 'process';

export type PrintRow = {
  index: number;
  number: number;
  verb: string;
  zone: string;
  /** Что шаг СДЕЛАЛ по движку: произвёл узел, дополнил его или обработал (ничего не съел). */
  kind: RowKind;
  /** Шаг объявил узел, а движок объявление отверг (нарушение в `violations`). */
  rejected: boolean;
  /** Ключ блока (узла), к которому шаг относится; '' у хвостового шага. */
  block: string;
  /** ПРИНЯТЫЕ входы-узлы (без собственного узла у makes/adds) и входы-детали, без дублей. */
  unitInputs: string[];
  unitInputNames: string[];
  pieceInputs: string[];
  pieceInputNames: string[];
  /** Узел, который шаг произвёл или дополнил; null у обработки и у отвергнутого шага. */
  workpiece: { key: string; name: string } | null;
};

export type PrintUnit = {
  key: string;
  name: string;
  producedAt: number;
  bornNumber: number;
  lastNumber: number;
  steps: number[];
  rows: PrintRow[];
  parent: { key: string; step: number } | null;
  children: string[];
  /** Высота поддерева: узел из одних деталей — 0. */
  height: number;
  /** Наименьший индекс шага во всём поддереве. */
  minStep: number;
  consumedAt: number | null;
  terminal: boolean;
  open: boolean;
  pieces: { key: string; name: string }[];
};

export type PrintViolation = {
  /** Номер шага на бумаге; null — нарушение уровня карточки. */
  stepNumber: number | null;
  message: string;
};

export type PrintModel = {
  rows: PrintRow[];
  units: PrintUnit[];
  unitByKey: Map<string, PrintUnit>;
  roots: string[];
  maxHeight: number;
  /** Порядок полос ROUTE: pre-order DFS по лесу. */
  lanes: string[];
  laneOf: Map<string, number>;
  freePieces: { key: string; name: string }[];
  cutList: { key: string; name: string; step: number | null }[];
  tailRows: PrintRow[];
  openUnits: PrintUnit[];
  /** Ни один шаг не объявляет узла — сборка на карточке не размечена вовсе. */
  configured: boolean;
  complete: boolean;
  garment: PrintUnit | null;
  /** Отказы движка (проход + проверка сходимости), в порядке шагов. */
  violations: PrintViolation[];
  stats: { units: number; steps: number; pieces: number };
};

const upper = (s: string) => s.trim().toUpperCase();
const dedupe = (keys: string[]) => [...new Set(keys)];

export function assemblyPrintModel(input: PrintCardInput): PrintModel {
  // Дубль ключа детали движок схлопывает к первому вхождению — печать обязана видеть тот же
  // список, иначе кат-лист печатает одну деталь дважды под двумя именами.
  const seenPiece = new Set<string>();
  const card: PrintCardInput = {
    steps: input.steps,
    pieces: input.pieces.filter((p) => {
      if (seenPiece.has(p.lineKey)) return false;
      seenPiece.add(p.lineKey);
      return true;
    }),
  };
  const pieceKeys = new Set(card.pieces.map((p) => p.lineKey));
  const sweepPieces = card.pieces.map((p) => ({ lineKey: p.lineKey, name: p.name }));
  const steps: AssemblyStep[] = card.steps.map((s) => ({
    inputs: classifyAssemblyInputs(pieceKeys, s.inputKeys),
    outputUnitKey: s.outputUnitKey,
    outputUnitName: s.outputUnitName,
  }));
  const res = assemblySweep(sweepPieces, steps);
  const releaseViolations = assemblyReleaseCheck(sweepPieces, steps, res);
  const B = assemblyBlocks(steps, res);
  const blocks = B.blocks;
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  const numberOf = (i: number): number | null => card.steps[i]?.number ?? null;

  // Имя узла на бумаге. Дубли имён различаются шагом рождения — иначе две полосы неотличимы.
  const nameCount = new Map<string, number>();
  for (const b of blocks) {
    const n = upper(b.name);
    if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }
  const displayName = (key: string): string => {
    const b = byKey.get(key);
    // Ключ узла, которого движок не произвёл, на бумагу не попадает — такой шаг печатается как
    // NOT APPLIED, а сюда не доходит; ветка оставлена ради полноты, без ключа.
    if (!b) return 'UNIT NOT MADE';
    const n = upper(b.name);
    const born = numberOf(b.producedAt) ?? b.producedAt + 1;
    if (!n) return `UNIT FROM STEP ${born}`;
    return (nameCount.get(n) ?? 0) > 1 ? `${n} · FROM STEP ${born}` : n;
  };
  // Имя детали на бумаге. `lineKey` непрозрачен (ULID) и не печатается — безымянная деталь
  // зовётся порядковым номером; два разных кроя с одним именем различаются номером, иначе на
  // листе две детали под одной подписью.
  let unnamed = 0;
  const baseName = new Map<string, string>();
  for (const p of card.pieces) {
    const n = upper(p.name);
    baseName.set(p.lineKey, n || `UNNAMED PIECE ${++unnamed}`);
  }
  const pieceNameCount = new Map<string, number>();
  for (const n of baseName.values()) pieceNameCount.set(n, (pieceNameCount.get(n) ?? 0) + 1);
  const pieceOrdinal = new Map<string, number>();
  const pieceLabel = new Map<string, string>();
  for (const p of card.pieces) {
    const n = baseName.get(p.lineKey)!;
    if ((pieceNameCount.get(n) ?? 0) > 1) {
      const k = (pieceOrdinal.get(n) ?? 0) + 1;
      pieceOrdinal.set(n, k);
      pieceLabel.set(p.lineKey, `${n} · ${k}`);
    } else pieceLabel.set(p.lineKey, n);
  }
  const pieceName = (key: string): string => pieceLabel.get(key) ?? 'UNNAMED PIECE';

  const parentOf = new Map<string, { key: string; step: number }>();
  for (const b of blocks) {
    const idx = res.consumedBy.get(b.key);
    if (idx === undefined) continue;
    const into = B.blockOfStep.get(idx);
    if (into && into !== b.key && byKey.has(into)) parentOf.set(b.key, { key: into, step: idx });
  }
  const childrenOf = new Map<string, string[]>(blocks.map((b) => [b.key, []]));
  for (const [k, p] of parentOf) childrenOf.get(p.key)!.push(k);
  // Дети по съевшему шагу, внутри шага — авторский порядок входов. Это порядок ПОЛОС в ROUTE.
  for (const [, kids] of childrenOf) {
    kids.sort((a, b) => {
      const pa = parentOf.get(a)!;
      const pb = parentOf.get(b)!;
      if (pa.step !== pb.step) return pa.step - pb.step;
      const ins = steps[pa.step].inputs.map((i) => i.key);
      return ins.indexOf(a) - ins.indexOf(b);
    });
  }
  const roots = blocks
    .filter((b) => !parentOf.has(b.key))
    .map((b) => b.key)
    .sort((a, b) => byKey.get(a)!.producedAt - byKey.get(b)!.producedAt);

  // Высота поддерева и наименьший шаг поддерева: MAP кладёт колонки по первому, полосы по
  // второму — так лист читается по возрастанию номеров.
  const height = new Map<string, number>();
  const minStep = new Map<string, number>();
  const measure = (k: string): number => {
    const b = byKey.get(k)!;
    let h = 0;
    let m = Math.min(...b.steps);
    for (const c of childrenOf.get(k) ?? []) {
      h = Math.max(h, measure(c) + 1);
      m = Math.min(m, minStep.get(c)!);
    }
    height.set(k, h);
    minStep.set(k, m);
    return h;
  };
  roots.forEach(measure);
  const maxHeight = height.size ? Math.max(...height.values()) : 0;

  const configured = steps.some((s) => !!s.outputUnitKey);
  const frontierUnits = res.frontier.filter((k) => res.units.has(k));
  // Отказы движка — СВОИМИ словами: сообщение движка адресовано редактору и называет шаги
  // позицией в массиве, а узлы и детали — ключами; на бумаге шаг — это его номер, а ключей нет.
  const nameOfKey = (k: string) =>
    pieceKeys.has(k) ? pieceName(k) : res.units.has(k) ? displayName(k) : `“${k}”`;
  const stepNo = (i: number | undefined) => (i == null ? '?' : String(numberOf(i) ?? i + 1));
  const paperMessage = (v: AssemblyViolation): string => {
    switch (v.detail) {
      case 'shadow-name':
        return 'a unit name is typed in but there is no unit key — the step assembles nothing';
      case 'duplicate-input':
        return `${nameOfKey(v.key)} is listed twice in the same step`;
      case 'unknown-key':
        return `input ${nameOfKey(v.key)} does not exist — no such piece and no such unit`;
      case 'produced-later':
        return `${nameOfKey(v.key)} appears only at step ${stepNo(res.units.get(v.key)?.producedAt)} — it cannot be an input earlier`;
      case 'self-reference':
        return 'the step lists its own unit as an input';
      case 'consumed-earlier': {
        const eater = res.consumedBy.get(v.key);
        const into = eater == null ? '' : steps[eater].outputUnitKey;
        return `${nameOfKey(v.key)} is already consumed by step ${stepNo(eater)}${into ? ` (inside ${displayName(into)})` : ''}`;
      }
      case 'off-frontier':
        return `${nameOfKey(v.key)} is no longer on the table`;
      case 'key-is-piece':
        return `the unit key is taken by piece ${nameOfKey(v.key)}`;
      case 'too-few-inputs':
        return 'a join needs at least two different inputs — nothing was made';
      case 'second-producer':
        return `${nameOfKey(v.key)} is already made by step ${stepNo(res.units.get(v.key)?.producedAt)} — to add to it, take it as an input of this step too`;
      case 'no-terminal':
        return 'the assembly does not converge: no finished unit at the end';
      case 'many-terminals':
        return `there must be exactly one finished unit, and there are ${frontierUnits.length}: ${frontierUnits.map(displayName).join(', ')}`;
      case 'unreached-pieces': {
        const leaves = new Set(
          frontierUnits.length === 1 ? res.units.get(frontierUnits[0])?.leaves ?? [] : [],
        );
        const orphans = card.pieces.filter((p) => !leaves.has(p.lineKey));
        return `these never reach the finished garment: ${orphans.map((p) => pieceName(p.lineKey)).join(', ')}`;
      }
      default:
        return v.message;
    }
  };
  const violations: PrintViolation[] = [...res.violations, ...releaseViolations].map((v) => ({
    stepNumber: v.step >= 0 ? numberOf(v.step) : null,
    message: paperMessage(v),
  }));
  const freePieces = card.pieces.filter((p) => !res.consumedBy.has(p.lineKey));
  const tailSteps = B.loose.steps;
  const complete =
    configured &&
    violations.length === 0 &&
    frontierUnits.length === 1 &&
    freePieces.length === 0 &&
    roots.length === 1 &&
    tailSteps.length === 0;

  const rows: PrintRow[] = card.steps.map((src, i) => {
    const s = steps[i];
    const own = s.outputUnitKey;
    const unit = own ? res.units.get(own) : undefined;
    // Принято движком: узел рождён этим шагом или дополнен им. Всё остальное с объявленным
    // выходом — отказ (правила 1–3), и такой шаг ничего не съел.
    const applied = !!unit && (unit.producedAt === i || unit.absorbedAt.includes(i));
    const kind: RowKind = !own || !applied ? 'process' : unit.producedAt === i ? 'makes' : 'adds';
    const rejected = !!own && !applied;
    // Принятые входы: у makes/adds — то, что этот шаг съел (consumedBy), у обработки — то, что
    // лежало на столе перед ней (frontierBefore); дубли схлопнуты.
    const before = new Set(res.frontierBefore[i] ?? []);
    const accepted = rejected
      ? []
      : dedupe(s.inputs.map((x) => x.key)).filter((k) =>
          k === own ? false : own ? res.consumedBy.get(k) === i : before.has(k),
        );
    const unitInputs = accepted.filter((k) => res.units.has(k));
    const pieceInputs = accepted.filter((k) => pieceKeys.has(k));
    return {
      index: i,
      number: src.number,
      verb: src.verb,
      zone: src.zone,
      kind,
      rejected,
      block: B.blockOfStep.get(i) ?? '',
      unitInputs,
      unitInputNames: unitInputs.map(displayName),
      pieceInputs,
      pieceInputNames: pieceInputs.map(pieceName),
      workpiece: own && applied ? { key: own, name: displayName(own) } : null,
    };
  });

  const units: PrintUnit[] = blocks.map((b) => {
    const seen = new Set<string>();
    const pieces: { key: string; name: string }[] = [];
    for (const i of b.steps) {
      if (rows[i].kind === 'process') continue; // обработка деталь не съедает
      for (const k of rows[i].pieceInputs) {
        if (seen.has(k)) continue;
        seen.add(k);
        pieces.push({ key: k, name: pieceName(k) });
      }
    }
    // Терминал — единственный узел, оставшийся на столе по ПРИНЯТЫМ переходам: он и есть изделие,
    // даже если карточка ещё несёт отказы (о них говорит шапка). Два узла на столе — терминала нет.
    const isGarment = frontierUnits.length === 1 && frontierUnits[0] === b.key;
    return {
      key: b.key,
      name: displayName(b.key),
      producedAt: b.producedAt,
      bornNumber: numberOf(b.producedAt) ?? 0,
      lastNumber: numberOf(Math.max(...b.steps)) ?? 0,
      steps: b.steps,
      rows: b.steps.map((i) => rows[i]),
      parent: parentOf.get(b.key) ?? null,
      children: childrenOf.get(b.key) ?? [],
      height: height.get(b.key) ?? 0,
      minStep: minStep.get(b.key) ?? b.producedAt,
      consumedAt: res.consumedBy.get(b.key) ?? null,
      terminal: isGarment,
      open: !parentOf.has(b.key) && !isGarment,
      pieces,
    };
  });
  const unitByKey = new Map(units.map((u) => [u.key, u]));

  const lanes: string[] = [];
  const visit = (k: string) => {
    lanes.push(k);
    for (const c of childrenOf.get(k) ?? []) visit(c);
  };
  roots.forEach(visit);
  const laneOf = new Map(lanes.map((k, i) => [k, i]));

  return {
    rows,
    units,
    unitByKey,
    roots,
    maxHeight,
    lanes,
    laneOf,
    freePieces: freePieces.map((p) => ({ key: p.lineKey, name: pieceName(p.lineKey) })),
    cutList: card.pieces.map((p) => {
      const at = res.consumedBy.get(p.lineKey);
      return {
        key: p.lineKey,
        name: pieceName(p.lineKey),
        step: at === undefined ? null : numberOf(at),
      };
    }),
    tailRows: tailSteps.map((i) => rows[i]),
    openUnits: units.filter((u) => u.open),
    configured,
    complete,
    garment: frontierUnits.length === 1 ? unitByKey.get(frontierUnits[0]) ?? null : null,
    violations,
    stats: { units: units.length, steps: card.steps.length, pieces: card.pieces.length },
  };
}
