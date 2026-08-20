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
// ДВА ЭКЗЕМПЛЯРА В ОДНОМ СНИМКЕ — вынужденно и намеренно. Слово состояния узла (`stateWord`)
// имеет три ветки, и три в одном графе не встречаются никогда: «✓ garment» требует РОВНО ОДНОГО
// живого узла (правило 4), а «✕ break» — двух и более. Поэтому снимок несёт два полотна: сошедшийся
// граф (терминал + поглощённые) и разорванный (два живых узла). Побочная выгода — снимок заодно
// фиксирует, что два полотна на одной странице не путают свои генерируемые id.
import { renderToStaticMarkup } from 'react-dom/server';

import { AssemblySchematic } from '../src/components/managers/tech-card/components/assembly-schematic';
import { assemblyBlocks } from '../src/components/managers/tech-card/components/assembly-blocks';
import { SCHEMATIC_METRICS } from '../src/components/managers/tech-card/components/assembly-layout';
import {
  buildWires,
  compositionOf,
  directInputsOf,
  makeRowY,
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

const converged = buildCase(CONVERGED_PIECES, CONVERGED_STEPS);
const broken = buildCase(BROKEN_PIECES, BROKEN_STEPS);

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
  compositionOf,
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
};
