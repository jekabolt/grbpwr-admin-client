// Ф4.7 — ШАПКА ПЛОТТЕРНОГО ФАЙЛА. Мерная часть, собирается scripts/lay-header-probe.mjs.
//
// Зонд отвечает на два вопроса, и первый из них — регрессионный.
//
//   1. НЕ ИЗМЕНИЛСЯ ЛИ КАРТОЧНЫЙ ЭКСПОРТ. Шапку несёт только раскройный экспорт прогона; файл,
//      выгруженный из карточки, обязан остаться ПОБАЙТОВО прежним. Это не стилистика: маркер
//      карточки — норма расхода, его файлы уходят в цех и сравниваются между собой, и лишний
//      слой или сдвинутый $EXTMAX в них — это тихое изменение эталона. Доказательство —
//      замороженный эталон в scripts/fixtures/, снятый С ЧУЖОГО РЕНДЕРЕРА (git show HEAD),
//      а не с того, который проверяется.
//   2. УМЕЕТ ЛИ РЕНДЕРЕР ШАПКУ. Умеет — это ДВА вида сразу: комментарии 999 (машина) и видимый
//      TEXT на своём слое HEADER над полосой (человек). Одного мало: раскройщик читает лист.
//
// ЧИТАТЬ ФАЙЛ ГРЕПОМ ЗДЕСЬ НЕЛЬЗЯ. Строка «HEADER» стоит в файле как имя СЕКЦИИ (код 2) ещё до
// всякой шапки, и она же — имя СЛОЯ (код 2 внутри таблицы LAYER) и ссылка с сущности (код 8).
// Склеить их значит объявить пустой слой непустым, то есть пройти проверку ровно на том файле,
// который её обязан завалить. Поэтому всё ниже читает ПОТОК ПАР групповых кодов и различает
// секцию, таблицу и сущность по положению в потоке.
import { SEAM_LINE_LAYER } from '../src/lib/nesting/geom/seam-allowance';
import { renderLayoutDxf, type LayHeader } from '../src/lib/nesting/render/dxf';
import type { NestResult, PieceDTO, Pt } from '../src/lib/nesting/types';

// ── ФИКСТУРА ─────────────────────────────────────────────────────────────────────────────────
// Раскладка, в которой есть ВСЁ, что рендерер умеет писать: полоса, контуры кроя, зеркальное
// размещение, поворот, чертёж детали (INNER) и линия шва (SEAM), подписи. Эталон, снятый с
// бедной раскладки, не заметил бы регрессии в ветке, которой на ней не было.
const rect = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

export const FABRIC_WIDTH_CM = 150;

export function fixturePieces(): PieceDTO[] {
  return [
    {
      id: 1,
      name: 'полочка левая',
      blockName: 'FP_L',
      source: 'fixture.dxf',
      fileIndex: 0,
      poly: rect(30, 45),
      bboxW: 30,
      bboxH: 45,
      areaCm2: 1350,
      inner: [
        // Линия шва — на СВОЙ слой SEAM; всё остальное — INNER. Обе ветки должны попасть в эталон.
        { layer: SEAM_LINE_LAYER, closed: true, pts: rect(28, 43).map((p) => ({ x: p.x + 1, y: p.y + 1 })) },
        { layer: '7', closed: false, pts: [{ x: 15, y: 2 }, { x: 15, y: 43 }] },
      ],
    },
    {
      id: 2,
      name: 'спинка',
      blockName: 'BK',
      source: 'fixture.dxf',
      fileIndex: 0,
      poly: rect(34, 50),
      bboxW: 34,
      bboxH: 50,
      areaCm2: 1700,
    },
    {
      // Мелкая деталь — та, которой планировщик подписей выдаёт выноску (CIRCLE + линия).
      id: 3,
      name: 'подборт',
      blockName: 'FCG',
      source: 'fixture.dxf',
      fileIndex: 0,
      poly: rect(4, 6),
      bboxW: 4,
      bboxH: 6,
      areaCm2: 24,
    },
  ];
}

export function fixtureResult(): NestResult {
  return {
    placements: [
      { pieceId: 1, instance: 0, rot: 0, x: 2, y: 2 },
      { pieceId: 1, instance: 1, rot: 0, flipped: true, x: 40, y: 2 },
      { pieceId: 2, instance: 0, rot: 90, x: 80, y: 2 },
      { pieceId: 3, instance: 0, rot: 0, x: 2, y: 60 },
    ],
    usedLengthCm: 120,
    efficiency: 0.42,
    placedCount: 4,
    totalCount: 4,
    unplaced: [],
    generation: 7,
    elapsedMs: 1234,
    cancelled: false,
    warnings: [],
  };
}

// Единственная точка, где зонд зовёт рендерер. `header === undefined` — это карточный экспорт,
// то есть ровно тот вызов, который делает nesting-modal.tsx.
export function render(header?: LayHeader): string {
  const opts = header === undefined ? undefined : { header };
  return renderLayoutDxf(fixtureResult(), fixturePieces(), FABRIC_WIDTH_CM, opts);
}

// Карточный вызов в его втором виде: opts переданы, но шапки в них нет. Он тоже обязан дать
// прежние байты — иначе «регрессии нет» держалось бы на том, что вызывающий не пишет opts.
export function renderWithLabelsOpt(labels: boolean): string {
  return renderLayoutDxf(fixtureResult(), fixturePieces(), FABRIC_WIDTH_CM, { labels });
}

// ── ОБРАЗЦЫ ШАПОК ────────────────────────────────────────────────────────────────────────────
export const HEADER_FULL: LayHeader = {
  runId: 4217,
  layName: 'основная 40-42',
  colorway: 'чёрный',
  articleCode: 'ART-00931',
  materialName: 'габардин 240 г/м2',
  plies: 24,
  composition: [
    { size: '40', qty: 6 },
    { size: '42', qty: 8 },
    { size: '44', qty: 10 },
  ],
  lengthCm: 512.4,
  dateISO: '2026-08-07T11:04:09.482Z',
};

// Ловушка §14 п.15 в её ЗНАЧЕНИЙНОЙ половине: генерированные типы клиента отдают прото-нули и
// прото-пустышки за «не задано». Такая шапка обязана отрисовать ровно то, что в ней есть, и
// НИ ОДНОГО «PR0», «слоёв 0» или «undefined».
export const HEADER_PROTO_ZEROS: LayHeader = {
  runId: 0,
  layName: '',
  colorway: 'индиго',
  articleCode: '',
  materialName: undefined,
  plies: 0,
  composition: [
    { size: '38', qty: 0 },
    { size: '', qty: 4 },
    { size: '40', qty: 2 },
  ],
  lengthCm: 0,
  dateISO: '',
};

// Тот же вызов, что сделает экран прогона по ловушке §14 п.15: КАЖДОЕ поле передано явно, и
// каждое — undefined. Тип обязан такой объект принять, а рендерер — не отрисовать ничего.
export const HEADER_ALL_UNDEFINED: LayHeader = {
  runId: undefined,
  layName: undefined,
  colorway: undefined,
  articleCode: undefined,
  materialName: undefined,
  plies: undefined,
  composition: undefined,
  lengthCm: undefined,
  dateISO: undefined,
};

// Управляющие символы в свободном тексте: перевод строки внутри значения разорвал бы поток пар
// групповых кодов, то есть сломал бы файл, а не подпись.
export const HEADER_DIRTY: LayHeader = {
  runId: 12,
  layName: 'настил\r\nвторой\tстрокой',
  colorway: '  пробелы по краям  ',
  plies: 3.6,
  lengthCm: Number.NaN,
  dateISO: '2026-08-07',
};

// ── ЧТЕНИЕ ФАЙЛА КАК ПОТОКА ПАР ──────────────────────────────────────────────────────────────
export type DxfPair = { code: number; value: string };

export function dxfPairs(dxf: string): DxfPair[] {
  const lines = dxf.split('\r\n');
  const pairs: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push({ code: Number(lines[i].trim()), value: lines[i + 1] });
  }
  return pairs;
}

export type DxfEntity = { layer: string; type: string; pairs: DxfPair[] };

export type DxfScan = {
  // Слои, ОБЪЯВЛЕННЫЕ в таблице LAYER (код 2 записи 0/LAYER внутри TABLE LAYER).
  declaredLayers: string[];
  // Заявленное число слоёв (код 70 самой таблицы) — оно обязано сойтись с длиной списка выше.
  declaredCount: number;
  // Сущности секции ENTITIES с их слоями. Считаются ЗАПИСЯМИ (0/…), а не тегами: у POLYLINE
  // код 8 стоит и на каждой VERTEX, и на SEQEND, и подсчёт по тегам завысил бы всё подряд.
  entities: DxfEntity[];
  // Комментарии 999 с их положением в потоке пар.
  comments: { index: number; value: string }[];
  // Положение пары $ACADVER в потоке.
  acadverIndex: number;
  // Значения переменных HEADER-секции, которые зонду нужны численно.
  extMax: { x: number; y: number } | null;
  wellFormed: boolean;
  pairCount: number;
};

export function scanDxf(dxf: string): DxfScan {
  const lines = dxf.split('\r\n');
  // Файл кончается CRLF, поэтому последний элемент split — пустая строка: пар ровно (n-1)/2.
  const wellFormed =
    lines.length >= 3 && lines[lines.length - 1] === '' && (lines.length - 1) % 2 === 0;
  const pairs = dxfPairs(dxf);

  const declaredLayers: string[] = [];
  const comments: { index: number; value: string }[] = [];
  const entities: DxfEntity[] = [];
  let declaredCount = -1;
  let acadverIndex = -1;
  let extMaxX = Number.NaN;
  let extMaxY = Number.NaN;

  let section = '';
  let table = '';
  let record = '';
  // Что именно означает СЛЕДУЮЩИЙ код 2: имя секции, имя таблицы, имя слоя или ничего. Ровно эта
  // переменная и отличает слой HEADER от секции HEADER — грепу такое различие недоступно.
  let awaiting: '' | 'section' | 'table' | 'layer' = '';
  let variable = '';
  let openIndex = -1;

  for (let index = 0; index < pairs.length; index++) {
    const p = pairs[index];
    if (p.code === 999) {
      comments.push({ index, value: p.value });
      continue;
    }
    if (p.code === 0) {
      openIndex = -1;
      record = p.value;
      if (p.value === 'SECTION') awaiting = 'section';
      else if (p.value === 'TABLE') {
        awaiting = 'table';
        table = '';
      } else if (p.value === 'ENDTAB') {
        table = '';
        awaiting = '';
      } else if (p.value === 'ENDSEC') {
        section = '';
        awaiting = '';
      } else if (p.value === 'LAYER' && table === 'LAYER') awaiting = 'layer';
      else {
        awaiting = '';
        if (section === 'ENTITIES') {
          openIndex = entities.length;
          entities.push({ layer: '', type: p.value, pairs: [] });
        }
      }
      continue;
    }
    if (p.code === 2 && awaiting === 'section') {
      section = p.value;
      awaiting = '';
      continue;
    }
    if (p.code === 2 && awaiting === 'table') {
      table = p.value;
      awaiting = '';
      continue;
    }
    if (p.code === 2 && awaiting === 'layer') {
      declaredLayers.push(p.value);
      awaiting = '';
      continue;
    }
    if (p.code === 70 && record === 'TABLE' && table === 'LAYER' && declaredCount < 0) {
      declaredCount = Number(p.value);
      continue;
    }
    if (section === 'HEADER' && p.code === 9) {
      variable = p.value;
      continue;
    }
    if (section === 'HEADER' && variable === '$ACADVER' && p.code === 1) {
      acadverIndex = index;
      continue;
    }
    if (section === 'HEADER' && variable === '$EXTMAX') {
      if (p.code === 10) extMaxX = Number(p.value);
      if (p.code === 20) extMaxY = Number(p.value);
      continue;
    }
    if (openIndex >= 0) {
      const e = entities[openIndex];
      if (p.code === 8 && e.layer === '') e.layer = p.value;
      e.pairs.push(p);
    }
  }

  return {
    declaredLayers,
    declaredCount,
    entities,
    comments,
    acadverIndex,
    extMax: Number.isFinite(extMaxX) && Number.isFinite(extMaxY) ? { x: extMaxX, y: extMaxY } : null,
    wellFormed,
    pairCount: pairs.length,
  };
}

// Сколько СУЩНОСТЕЙ лежит на слое. Именно то число, которое отличает объявленный пустой слой от
// объявленного непустого.
export function entitiesOnLayer(scan: DxfScan, layer: string): DxfEntity[] {
  return scan.entities.filter((e) => e.layer === layer);
}

export type DxfText = { layer: string; x: number; y: number; capCm: number; text: string };

export function dxfTexts(scan: DxfScan): DxfText[] {
  return scan.entities
    .filter((e) => e.type === 'TEXT')
    .map((e) => {
      const at = (code: number) => e.pairs.find((p) => p.code === code)?.value;
      return {
        layer: e.layer,
        x: Number(at(10) ?? Number.NaN),
        y: Number(at(20) ?? Number.NaN),
        capCm: Number(at(40) ?? Number.NaN),
        text: at(1) ?? '',
      };
    });
}

// Поток сущностей БЕЗ указанного слоя, сериализованный обратно в пары. Так проверяется, что
// шапка не сдвинула и не переписала ни одной прежней сущности: сравнивать надо не длину файла,
// а сам поток.
export function entityStreamExcept(scan: DxfScan, layer: string): string {
  return scan.entities
    .filter((e) => e.layer !== layer)
    .map((e) => `${e.type} ${e.pairs.map((p) => `${p.code}=${p.value}`).join('')}`)
    .join('');
}

// ── ПРОВОДКА ШАПКИ ИЗ НАСТИЛА (Ф4.7) ────────────────────────────────────────────────────────
//
// Три решения, каждое из которых регрессировало бы МОЛЧА — файл собрался бы, лист напечатался бы,
// и неверным оказалось бы только его содержимое:
//   1. слои берутся у СЕКЦИИ, а не у настила: режут секцию, и под ножом её слои;
//   2. состав берётся из СНИМКА количеств настила, а не из состава раскладки — раскладка могла
//      быть снята под другой заказ и пережить его;
//   3. длина берётся у маркера СЕКЦИИ, и только при его отсутствии падает на длину настила.
export { layPlotterHeader } from 'components/managers/production-runs/components/lay-plotter';
