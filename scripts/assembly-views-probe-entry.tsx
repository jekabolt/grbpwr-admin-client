// Точка входа пробы схемы сборки: рендерит ПОЛНЫЙ `AssemblySchematic` в статическую разметку.
//
// Лежит В РЕПОЗИТОРИИ, а не во временном файле: esbuild разрешает `react-dom/server` и
// `react/jsx-runtime` относительно расположения ФАЙЛА, и энтри во временной папке их не находит
// (тот же прецедент, что у `annotation-shape-probe-entry.tsx`).
//
// РЕНДЕРИТСЯ ВЕСЬ КОМПОНЕНТ, А НЕ ИЗВЛЕЧЁННЫЕ ВЬЮШКИ. Смысл golden-снимка ровно в том, чтобы
// рефакторинг доказывал себя разметкой ТОГО ЖЕ экрана, а не разметкой новых функций: перенос,
// изменивший класс, title, порядок узлов, координату style, глиф или роль органа, обязан упасть
// сравнением. Проверять при этом вьюшки поимённо значило бы сверять новое с новым.
//
// ТРИ ЭКЗЕМПЛЯРА В ОДНОМ СНИМКЕ — вынужденно и намеренно, и у каждого своя причина.
//
//   1. СОШЕДШИЙСЯ ГРАФ и 2. РАЗОРВАННЫЙ — потому что слово состояния узла (`stateWord`) имеет три
//      ветки, а три в одном графе не встречаются никогда: «✓ garment» требует РОВНО ОДНОГО живого
//      узла (правило 4), а «✕ break» — двух и более.
//   3. ХВОСТ — потому что после Т9 хвостового бокса в первых двух НЕТ НИ В ОДНОМ: обработка одной
//      детали уехала на её плитку, а пустого хвоста не бывает вовсе. Вид хвоста Т9б переписала
//      целиком («◌ waiting for a unit», рамка 1px, подсказка про будущее), и без третьего полотна
//      золото не проверяло бы его ни байтом. Хвост выживает ровно там, где шаг не приписывается
//      НИ УЗЛУ, НИ ПЛИТКЕ: обработка над ДВУМЯ разными деталями и ни одного джойна на карточке
//      (`assembly-blocks.ts` — ветка `loose`; `assembly-layout.ts` — `processingOf` требует
//      единственного различного входа). Замерено на этом самом графе, а не выведено из чтения.
//
// Побочная выгода — снимок заодно фиксирует, что полотна на одной странице не путают свои
// генерируемые id, а третье вдобавок закрывает ветку раскладки «узлов нет вовсе» (`real.length
// === 0`), которой в золоте тоже не было.
import { renderToStaticMarkup } from 'react-dom/server';

import { AssemblySchematic } from '../src/components/managers/tech-card/components/assembly-schematic';
import { assemblyBlocks } from '../src/components/managers/tech-card/components/assembly-blocks';
import {
  assemblyLayout,
  drawnTailSteps,
  SCHEMATIC_METRICS,
} from '../src/components/managers/tech-card/components/assembly-layout';
import {
  buildWires,
  compositionOf,
  compositionParts,
  directInputsOf,
  makeRowY,
  partsText,
  stateParts,
  stateWord,
  stepGlyph,
} from '../src/components/managers/tech-card/components/assembly-node-views';
import {
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyPiece,
  type AssemblyStep,
} from '../src/components/managers/tech-card/components/assembly-frontier';
import { pieceRefKey } from '../src/components/managers/tech-card/components/piece-block-refs';
import type {
  PieceCloth,
  PieceClothState,
} from '../src/components/managers/tech-card/components/piece-cloth';
import type { PosOverrides } from '../src/components/managers/tech-card/components/assembly-positions';
import type { FoundPiece } from '../src/components/managers/tech-card/components/nesting/dxf-geometry';
import type { PieceShapeMap } from '../src/components/managers/tech-card/components/use-piece-shapes';

type RawStep = { in?: string[]; out?: string; name?: string };

/** Тот же конвейер, которым карточку собирает вкладка: классификация → проход → блоки. */
function buildCase(pieces: AssemblyPiece[], raw: RawStep[]) {
  const keys = new Set(pieces.map((p) => p.lineKey));
  const steps: AssemblyStep[] = raw.map((s) => ({
    inputs: classifyAssemblyInputs(keys, s.in ?? []),
    outputUnitKey: s.out ?? '',
    outputUnitName: s.name ?? '',
  }));
  const res = assemblySweep(pieces, steps);
  const grouped = assemblyBlocks(steps, res);
  // Ровно то, что кладёт в проп вкладка: узлы плюс хвостовой псевдоблок последним.
  return { blocks: [...grouped.blocks, grouped.loose], steps, res };
}

const pt = (x: number, y: number) => ({ x, y });

/**
 * Синтетический контур: прямоугольник со срезанным углом, чтобы силуэт был отличим от рамки.
 * Габариты нарочно разъезжаются на порядок (полочка 60×70 см против манжеты 6×4 см): `u`
 * штриховки считается из viewBox КОНКРЕТНОЙ детали, и снимок обязан ловить его подмену.
 */
function shape(id: number, block: string, w: number, h: number, sizes: string[]): FoundPiece {
  return {
    piece: {
      id,
      name: block,
      blockName: block,
      layer: 'CUT',
      source: 'fixture.dxf',
      fileIndex: 0,
      poly: [pt(0, 0), pt(w, 0), pt(w, h - h / 4), pt(w - w / 3, h), pt(0, h)],
      // Внутренняя геометрия здесь ради доказательства обратного: плитка рисует контур
      // `outlineOnly`, и в снимке этих точек не должно быть ни одной.
      inner: [{ layer: 'SEAM', closed: true, pts: [pt(1, 1), pt(w - 1, 1), pt(w - 1, h - 1)] }],
      bboxW: w,
      bboxH: h,
      areaCm2: w * h,
      originX: 0,
      originY: 0,
    },
    block,
    size: sizes[Math.floor((sizes.length - 1) / 2)],
    instances: 1,
    layer: 'CUT',
    sizes,
  };
}

const cloth = (state: PieceClothState, article?: PieceCloth['article']): PieceCloth =>
  article ? { state, article } : { state };

// --- сошедшийся граф: терминал, два поглощённых узла, хвост, свободные детали ------------------
const CONVERGED_PIECES: AssemblyPiece[] = [
  { lineKey: 'FR', name: 'front' },
  { lineKey: 'BK', name: 'back' },
  { lineKey: 'SL', name: 'sleeve' },
  { lineKey: 'HD', name: 'hood outer' },
  { lineKey: 'LN', name: 'hood lining' },
  { lineKey: 'CUF', name: 'cuff' },
  { lineKey: 'FLAP', name: 'pocket flap' },
];

// Шаги подобраны так, чтобы в снимок попали все три глифа: `·` (обработка), `▣` (рождение узла),
// `+▣` (поглощение), — и обе разновидности провода: полный от съеденной детали и бледный от
// детали, которую шаг только обработал.
const CONVERGED_STEPS: RawStep[] = [
  { in: ['FR'] },
  { in: ['FR', 'BK'], out: 'SHELL', name: 'shell' },
  { in: ['SHELL', 'SL'], out: 'SHELL' },
  // Узел без имени: вторая строка шапки обязана остаться без спана имени вовсе.
  { in: ['HD', 'LN'], out: 'HOOD' },
  { in: ['SHELL', 'HOOD'], out: 'GARMENT', name: 'garment' },
  { in: ['FLAP'] },
];

const CONVERGED_LABELS = [
  'overlock the front',
  'join front and back',
  'set the sleeve',
  'assemble the hood',
  'set the hood into the garment',
  'press the pocket flap',
];

const CONVERGED_CLOTH = new Map<string, PieceCloth>([
  ['FR', cloth('main', { id: 41, code: 'WV-220', name: 'wool twill' })],
  ['BK', cloth('lining')],
  ['SL', cloth('unsorted')],
  ['HD', cloth('interfacing', { id: 77, code: 'FS-40', name: '' })],
  // Явный `unbound` в карте — не то же, что отсутствие ключа: у плитки нет знака, но подпись
  // про ткань есть.
  ['LN', cloth('unbound')],
  ['FLAP', cloth('mesh')],
  // CUF в карте отсутствует вовсе: вопрос про эту деталь рецепт не закрыл.
]);

const CONVERGED_SHAPES: PieceShapeMap = new Map<string, FoundPiece | null>([
  [pieceRefKey('FR'), shape(1, 'FP_1', 60, 70, ['S', 'M', 'L'])],
  [pieceRefKey('BK'), shape(2, 'BP_1', 58, 70, ['S', 'M', 'L'])],
  [pieceRefKey('SL'), shape(3, 'SL_1', 25.5, 62, ['M'])],
  [pieceRefKey('HD'), shape(4, 'HD_1', 30, 28.5, ['S', 'M'])],
  [pieceRefKey('CUF'), shape(5, 'CF_1', 6, 4, ['M'])],
  // Свободная деталь с контуром: её штриховка (сетка — единственная РВАНАЯ линия словаря) иначе
  // не попала бы в снимок вовсе.
  [pieceRefKey('FLAP'), shape(6, 'FL_1', 18, 12, ['M'])],
  // Ключ есть, контура нет: плитка обязана нарисоваться пустым квадратом с именем.
  [pieceRefKey('LN'), null],
  // CUF в карте ткани отсутствует — контур есть, знака ткани нет.
]);

const CONVERGED_SMV = new Map<string, string>([
  ['SHELL', '8.4'],
  ['HOOD', '3.2'],
  ['GARMENT', '21.75'],
  ['', '1.5'],
]);

/** Ровно один ручной оверрайд: строка «layout: manual · 1» и уехавшая вместе с боксом стопка. */
const CONVERGED_POSITIONS: PosOverrides = { HOOD: { x: 24, y: 320 } };

// --- разорванный граф: два живых узла, ни одного терминала -------------------------------------
const BROKEN_PIECES: AssemblyPiece[] = [
  { lineKey: 'P1', name: 'left top' },
  { lineKey: 'P2', name: 'left bottom' },
  { lineKey: 'P3', name: 'right top' },
  { lineKey: 'P4', name: 'right bottom' },
];

const BROKEN_STEPS: RawStep[] = [
  { in: ['P1', 'P2'], out: 'LEFT', name: 'left half' },
  { in: ['P3', 'P4'], out: 'RIGHT', name: 'right half' },
];

const BROKEN_LABELS = ['join the left half', 'join the right half'];

// Σ есть у одного блока и пуст у другого: подвал обязан различать эти два случая.
const BROKEN_SMV = new Map<string, string>([
  ['LEFT', '12.5'],
  ['RIGHT', ''],
]);

// --- граф с ЖИВЫМ ХВОСТОМ: ни одного узла, обработки над парами деталей ------------------------
//
// Отделочная мелочёвка, которую ещё ни к чему не пришили, — состояние, в котором карточка живёт
// первые полчаса своей жизни. Шаг 10 берёт ОДНУ деталь и потому уезжает строкой НА ЕЁ ПЛИТКУ;
// шаги 20 и 30 берут по ДВЕ разные и приписаться не могут никуда — они и есть хвост. Обе строки
// в одном снимке нужны вместе: строка плитки и строка хвоста намеренно разной грамматики, и
// разъехаться они могут только молча.
const TAIL_PIECES: AssemblyPiece[] = [
  { lineKey: 'TAPE', name: 'binding tape' },
  { lineKey: 'TRIM', name: 'edge trim' },
  { lineKey: 'LBL', name: 'care label' },
];

const TAIL_STEPS: RawStep[] = [
  { in: ['TAPE'] },
  { in: ['TAPE', 'TRIM'] },
  { in: ['TRIM', 'LBL'] },
];

const TAIL_LABELS = [
  'fuse the binding tape',
  'press the tape onto the trim',
  'stitch the label to the trim',
];

/**
 * SMV КАЖДОГО ШАГА ХВОСТОВОЙ ФИКСТУРЫ — данные, а не число подвала.
 *
 * До этого здесь стояла ЗАГЛУШКА `2.4`, взятая с потолка, и золото было слепо к дефекту ПО
 * ПОСТРОЕНИЮ: подвал печатал то, что ему подали, каким бы множеством оно ни считалось. Теперь
 * число выводится — и подмена множества меняет снимок.
 *
 * Числа подобраны так, что два ответа РАЗЛИЧИМЫ: по нарисованным строкам (шаги 20 и 30) выходит
 * 2.4, по всему хвостовому блоку (плюс уехавший на плитку шаг 10) — 3.1. Проба держит оба и
 * требует, чтобы в разметку попало первое, а второго в ней не было; поэтому 3.1, а не 3.2 —
 * «Σ 3.2» в этом же снимке печатает блок SHELL первого полотна, и проверка «чужого числа нет»
 * ловила бы его.
 */
const TAIL_STEP_SMV = ['0.7', '1.1', '1.3'];

/** Та же арифметика, что у `useRailGrouping.sumSmv`: сумма, округлённая до сотых, пусто — «нет». */
const sumSmv = (idx: number[]) => {
  let total = 0;
  let any = false;
  for (const i of idx) {
    const n = Number((TAIL_STEP_SMV[i] ?? '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) {
      total += n;
      any = true;
    }
  }
  return any ? String(Math.round(total * 100) / 100) : '';
};

// Карта ткани СУЩЕСТВУЕТ, но знает лишь про одну деталь: остальные две — «рецепт промолчал», а
// это не то же, что «вопрос не задавался» (у разорванного графа карты нет вовсе).
const TAIL_CLOTH = new Map<string, PieceCloth>([
  ['TAPE', cloth('interfacing', { id: 12, code: 'TP-08', name: 'fusible tape' })],
]);

const TAIL_SHAPES: PieceShapeMap = new Map<string, FoundPiece | null>([
  [pieceRefKey('TRIM'), shape(7, 'TR_1', 4, 90, ['M'])],
]);

const converged = buildCase(CONVERGED_PIECES, CONVERGED_STEPS);
const broken = buildCase(BROKEN_PIECES, BROKEN_STEPS);
const tailed = buildCase(TAIL_PIECES, TAIL_STEPS);

// Хвостовой блок против НАРИСОВАННЫХ строк: два множества, два числа, и в подвал коробки идёт
// второе. Считает его та же `drawnTailSteps`, которой раскладка отмеряет коробке высоту.
const TAIL_LOOSE_STEPS = tailed.blocks.find((b) => b.key === '')?.steps ?? [];
const TAIL_DRAWN_STEPS = drawnTailSteps(TAIL_LOOSE_STEPS, tailed.steps);
const TAIL_SMV = sumSmv(TAIL_DRAWN_STEPS);
const TAIL_SMV_LOOSE = sumSmv(TAIL_LOOSE_STEPS);

const nameOf = (pieces: AssemblyPiece[]) => (key: string) =>
  pieces.find((p) => p.lineKey === key)?.name ?? key;
const labelFrom = (labels: string[]) => (i: number) => labels[i] ?? 'step';
const noop = () => {};

/** Разметка обоих полотен при заданной заморозке. */
export function renderSchematic(frozen: boolean): string {
  return renderToStaticMarkup(
    <>
      <AssemblySchematic
        blocks={converged.blocks}
        steps={converged.steps}
        res={converged.res}
        labelOf={labelFrom(CONVERGED_LABELS)}
        pieceNameOf={nameOf(CONVERGED_PIECES)}
        onPickStep={noop}
        onCreate={noop}
        onDissolve={noop}
        pieceShapes={CONVERGED_SHAPES}
        cloth={CONVERGED_CLOTH}
        smvOfBlock={CONVERGED_SMV}
        tailSmv=''
        positions={CONVERGED_POSITIONS}
        onMove={noop}
        onResetPositions={noop}
        renamedUnit={null}
        frozen={frozen}
      />
      <AssemblySchematic
        blocks={broken.blocks}
        steps={broken.steps}
        res={broken.res}
        labelOf={labelFrom(BROKEN_LABELS)}
        pieceNameOf={nameOf(BROKEN_PIECES)}
        onPickStep={noop}
        onCreate={noop}
        onDissolve={noop}
        // Карты нет вовсе: у карточки без колорвея вопрос про ткань не задавался, и разметка
        // обязана отличаться от «ключа в карте нет».
        pieceShapes={new Map<string, FoundPiece | null>()}
        cloth={null}
        smvOfBlock={BROKEN_SMV}
        tailSmv=''
        positions={{}}
        onMove={noop}
        onResetPositions={noop}
        renamedUnit={null}
        frozen={frozen}
      />
      {/* ТРЕТЬЕ ПОЛОТНО — РАДИ ХВОСТА. Единственное, где хвостовой бокс вообще существует: в
          первых двух все обработки уехали на плитки своих деталей, а пустого хвоста не бывает.
          Ручных позиций нет — строка «layout: manual» тоже обязана отсутствовать. */}
      <AssemblySchematic
        blocks={tailed.blocks}
        steps={tailed.steps}
        res={tailed.res}
        labelOf={labelFrom(TAIL_LABELS)}
        pieceNameOf={nameOf(TAIL_PIECES)}
        onPickStep={noop}
        onCreate={noop}
        onDissolve={noop}
        pieceShapes={TAIL_SHAPES}
        cloth={TAIL_CLOTH}
        smvOfBlock={new Map<string, string>()}
        tailSmv={TAIL_SMV}
        positions={{}}
        onMove={noop}
        onResetPositions={noop}
        renamedUnit={null}
        frozen={frozen}
      />
    </>,
  );
}

/**
 * Чистые функции извлечённого модуля — вторая половина пробы.
 *
 * Отдаются одним объектом, а не россыпью экспортов: пока модуля не существовало, `views` не было
 * вовсе, и проба этим отличала «golden сняли до рефакторинга» от «рефакторинг сделан».
 */
export const views = {
  stepGlyph,
  stateWord,
  stateParts,
  compositionOf,
  compositionParts,
  partsText,
  directInputsOf,
  buildWires,
  makeRowY,
  METRICS: SCHEMATIC_METRICS,
};

/** Состав фикстуры — чтобы проба могла проверить, что снимает то, что обещала. */
export const fixtureFacts = {
  convergedBlockKeys: converged.blocks.map((b) => b.key),
  convergedLiveUnits: converged.res.frontier.filter((k) => converged.res.units.has(k)),
  convergedViolations: converged.res.violations.map((v) => v.detail),
  brokenLiveUnits: broken.res.frontier.filter((k) => broken.res.units.has(k)),
  brokenViolations: broken.res.violations.map((v) => v.detail),
  // Хвост существует только пока шаг не приписался ни узлу, ни плитке. Выродись фикстура — и
  // третье полотно молча перестало бы что-либо характеризовать, оставшись зелёным.
  //
  // ДВА СПИСКА, И РАЗНИЦА МЕЖДУ НИМИ И ЕСТЬ ПРАВИЛО Т9а. Атрибуция (`loose.steps`) держит ВСЕ три
  // шага, включая обработку одной детали; раскладка (`tailSteps`) отдаёт под строки только те
  // два, которым не досталось плитки. Совпади эти списки — либо обработка перестала уезжать на
  // плитку, либо хвост рисует больше строк, чем ему отмерено высоты.
  tailBlockKeys: tailed.blocks.map((b) => b.key),
  tailLooseSteps: tailed.blocks.find((b) => b.key === '')?.steps ?? [],
  tailDrawnSteps: assemblyLayout(tailed.blocks, tailed.steps, tailed.res).tailSteps,
  // ДВА ЧИСЛА, И В ПОДВАЛ ИДЁТ ПЕРВОЕ. Пока Σ бралась заглушкой, снимок был слеп к тому, каким
  // множеством она посчитана: подвал печатал что подали. Совпади эти два — фикстура перестала бы
  // различать множества, и проба обязана падать раньше, чем это случится молча.
  tailDrawnSmv: TAIL_SMV,
  tailLooseSmv: TAIL_SMV_LOOSE,
  tailLiveUnits: tailed.res.frontier.filter((k) => tailed.res.units.has(k)),
  tailViolations: tailed.res.violations.map((v) => v.detail),
};
