import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';

// Раскладка схемы сборки: где на полотне стоит каждая подсборка и каждая деталь.
//
// ПОРТ `schemCanvasC` ИЗ ПРОТОТИПА, А НЕ `api.layout`. Последний выглядит как готовая раскладка
// и написан подробнее — но он МЁРТВЫЙ КОД, оставшийся от удалённых вариантов B и D: в
// прототипе его никто не вызывает. План велел портировать именно его, и порт по букве плана дал
// бы неработающий модуль. Живая раскладка варианта C — schemCanvasC, и портирована она.
//
// Три прохода, в порядке:
//   1. КОЛОНКИ ПО ГЛУБИНЕ. Узел, собранный только из деталей, — колонка 0; узел, берущий узлы, —
//      на единицу правее самого глубокого своего входа. Так провода идут слева направо и время
//      читается как ось.
//   2. ДВА ПРОХОДА БАРИЦЕНТРА. Внутри колонки узлы сортируются по среднему положению своих
//      входов в предыдущих колонках. Два, а не один: после первой сортировки положения входов
//      меняются, и второй проход снимает большую часть пересечений. Третий уже почти ничего не
//      даёт — прототип на этом и остановился.
//   3. КУРСОР-АНТИНАЕЗД. Узел тянется к середине своих входов, но не выше нижней границы
//      предыдущего в колонке. Без курсора притяжение к середине укладывает узлы друг на друга.
//
// Ф7 добавила поверх этого два поля, не тронув ни одного из трёх проходов:
//
//   • `tiles` — КАЖДАЯ деталь карточки как адресуемая нода, ровно одна на деталь. До Ф7 деталь
//     рисовалась то плиткой у бокса, то чипом в колонке свободных, а иногда И ТАМ И ТАМ — и у
//     такой плитки не было ключа, за который её можно взять рукой. Место плитки определяет
//     СОСТОЯНИЕ: съедена — стоит у бокса съевшего узла, свободна — в колонке у левого края.
//   • `tail` — хвостовой бокс шагов вне узлов. До Ф7 такой шаг не имел на полотне НИКАКОГО
//     представления (`real` фильтрует псевдоблок с пустым ключом), то есть на неразмеченной
//     карточке схема показывала пустоту вместо существующего маршрута.
//
// Т9 добавила третье поле — и тоже не тронув ни одного из трёх проходов:
//
//   • `TileLayout.processing` — ОБРАБОТКИ ДЕТАЛИ на её собственной плитке. До Т9 у такого шага
//     было ровно одно место, и оно зависело от того, размечена ли уже сборка: пока деталь
//     свободна — хвостовой бокс, как только её съели — строка блока (атрибуция в
//     `assembly-blocks.ts` транзитивная и остаётся такой). Владелец видел это как кучу:
//     «создаётся блок вне узла и туда падают все такие операции». Теперь у обработки есть
//     ПРЕДМЕТ, и представление стабильно: строка появляется у своей детали в момент создания и
//     больше никуда не прыгает, а переезд «хвост → блок» перестаёт быть единственным местом,
//     где шаг вообще виден.
//
// ЦЕНА, ЗАЯВЛЕННАЯ, А НЕ СПРЯТАННАЯ. Плитка с обработками выше голой, поэтому следующая за ней
// плитка — в колонке или в стопке у бокса — едет вниз ровно на этот рост. Плитка без обработок не
// меняется ни на число, пока над ней ничего не выросло. Зарезервированное место стопки (`stackH`
// третьего прохода) при этом НЕ пересчитывается: пересчёт сдвинул бы боксы, а их обещано не
// двигать. Значит, длинная стопка обработок вправе уйти ниже своего бокса — полотно её вмещает
// высотой, но соседства с чужой стопкой это не гарантирует.
//
// Модуль ЧИСТЫЙ: ни React, ни SVG, ни DOM. Раскладку можно проверить пробой, картинку — нет;
// проба-характеризация `scripts/assembly-layout-probe.mjs` держит числа этого файла.

export type BoxLayout = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Колонка (глубина по узловым входам). */
  col: number;
  /** Верх стопки плиток деталей-входов слева от блока. */
  stackTop: number;
  /**
   * Ключи деталей, входящих в блок напрямую.
   *
   * ГЕОМЕТРИЧЕСКОЕ, А НЕ СОДЕРЖАТЕЛЬНОЕ ПОЛЕ: именно оно задаёт вертикальную протяжённость
   * бокса, и считается оно как до Ф7 — по всем шагам блока, включая свободные детали. Список
   * НАРИСОВАННЫХ у этого бокса плиток — не он, а `tiles` со `state: 'eaten'` и `into === key`
   * (свободная деталь ушла в колонку у левого края, но место под неё в стопке осталось
   * зарезервированным). Расхождение намеренное: пересчёт стопок сдвинул бы все боксы, а Ф7
   * обещала не двигать ни одного.
   */
  pieceInputs: string[];
};

/** Деталь как нода полотна: ровно одна на каждую деталь карточки. */
export type TileLayout = {
  /** `lineKey` детали — он же ключ ручной позиции. */
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Лежит на столе или уже вошла в узел. Место плитки следует из этого. */
  state: 'free' | 'eaten';
  /** Узел, съевший деталь; пусто у свободной. */
  into: string;
  /** Индексы ВСЕХ шагов, берущих деталь входом, — включая обработки, которые её не съедают. */
  consumers: number[];
  /**
   * Обработки ЭТОЙ детали, в авторском порядке: шаг с пустым выходным ключом, все входы которого
   * — она одна. Подмножество `consumers`, и высота плитки посчитана под эти строки.
   *
   * Обработки на УЗЛЕ здесь нет по построению, обработки на двух и более различных входах — по
   * правилу: у неё нет одного предмета, и приписать её одному значило бы соврать; она остаётся
   * там, где была. Строка живёт тут С МОМЕНТА СОЗДАНИЯ И НАВСЕГДА — съедена деталь или нет.
   *
   * Двойное представление намеренно: тот же шаг остаётся строкой своего блока, если блок у него
   * есть. Блок отвечает «какая работа скатывается в узел», плитка — «в каком состоянии деталь».
   */
  processing: number[];
};

export type SchematicLayout = {
  boxes: BoxLayout[];
  byKey: Map<string, BoxLayout>;
  /**
   * Хвостовой бокс шагов вне узлов; отсутствует, когда таких шагов нет.
   *
   * НЕ ВХОДИТ в `boxes` и `byKey` намеренно: `boxes` — это узлы, а хвост узлом не является
   * (его ключ пуст, и пустой ключ узла невалиден по контракту). Держать его отдельным полем
   * дешевле, чем учить каждого читателя `boxes` отфильтровывать самозванца.
   *
   * Высота посчитана по `tailSteps`, а не по `loose.steps` — см. поле.
   */
  tail?: BoxLayout;
  /**
   * Строки, которые хвостовой бокс рисует: `loose.steps` МИНУС обработки, уехавшие на плитки
   * своих деталей. В хвосте они были только потому, что им больше негде было быть.
   *
   * Поле существует, чтобы разметка не считала этот список второй раз: высоту бокса задаёт
   * раскладка, а строки рисует вьюшка, и разойдись они — бокс молча обрежет последнюю строку
   * или оставит под ней дыру. Пусто ⇔ `tail` отсутствует.
   */
  tailSteps: number[];
  width: number;
  height: number;
  /**
   * Свободные детали в порядке фронта — ЛЕГАСИ-ПОЛЕ, оставленное как было до Ф7.
   *
   * Рендер схемы его больше не читает (читает `tiles`), и выводить `tiles` из него нельзя:
   * на карточке без единого блока оно пустое, хотя детали есть. Поле держит проба-характеризация
   * и, возможно, будущая печать.
   */
  unassigned: string[];
  /** Все детали карточки как ноды. Ровно одна плитка на деталь при любом графе. */
  tiles: TileLayout[];
  tileByKey: Map<string, TileLayout>;
};

// Размеры взяты из прототипа: 180×15px строки под шапкой 21px, зазоры 96×18, плитка 48.
const W = 180;
const LINE_H = 15;
// ШАПКА В ДВЕ СТРОКИ (вариант «паспорт»): ключ отдельной строкой, под ним имя узла и его состояние
// СЛОВОМ. В одну строку эти три вещи не помещались: ключ теснил имя, имя теснило состояние, и всё
// вместе — 180 пикселей ширины.
const HEAD_H = 32;
/** Подвал: состав узла и Σ SMV. Постоянный, а не по наведению — на планшете наведения нет. */
const FOOT_H = 15;
const GAP_X = 96;
const GAP_Y = 18;
const TILE = 48;
const TILE_GAP = 8;
// Плитка в колонке свободных шире плитки у бокса — так было до Ф7, и так осталось.
const FREE_TILE_W = 64;
const FREE_TILE_X = 8;
const STACK_TILE_W = 52;
/** Смещение стопки влево от левого края бокса. */
const STACK_DX = -60;
/**
 * Строка обработки под головой плитки.
 *
 * Ниже строки бокса (15) намеренно: стопка отвечает не «какая работа скатывается в узел», а «в
 * каком состоянии деталь», и строка в рост блочной читалась бы как второй список работ на том же
 * полотне. Разделительная линия входит В строку (рисуется её верхней границей), поэтому число
 * здесь ОДНО: вторая пара чисел на стороне разметки означала бы, что раскладка и картинка
 * однажды разойдутся, а разойдутся они молча.
 */
const PROC_ROW_H = 12;

export function assemblyLayout(
  blocks: AssemblyBlock[],
  steps: AssemblyStep[],
  res: AssemblyResult,
  collapsed: Set<string> = new Set(),
): SchematicLayout {
  const real = blocks.filter((b) => b.key !== '');
  const loose = blocks.find((b) => b.key === '');

  // Все детали карточки в авторском порядке. `frontierBefore[0]` — это фронт ДО первого шага,
  // то есть ровно список деталей: узлов тогда ещё нет. Когда шагов нет вовсе, фронт и есть
  // список деталей. Брать состав деталей из `pieceInputs` блоков нельзя — деталь, не взятую
  // ни одним шагом, там не найти, а нода ей нужна: с неё начинается сборка.
  const allPieces = res.frontierBefore[0] ?? res.frontier.filter((k) => !res.units.has(k));

  // Кто съел деталь и на каких шагах она вообще упоминается.
  const intoOf = new Map<string, string>();
  res.consumedBy.forEach((stepIdx, key) => {
    if (res.units.has(key)) return; // это узел, не деталь
    const into = steps[stepIdx]?.outputUnitKey ?? '';
    if (into) intoOf.set(key, into);
  });
  const consumersOf = new Map<string, number[]>();
  steps.forEach((s, i) => {
    for (const input of s.inputs) {
      if (input.kind !== 'piece') continue;
      const acc = consumersOf.get(input.key);
      if (acc) acc.push(i);
      else consumersOf.set(input.key, [i]);
    }
  });
  const stateOf = (key: string): 'free' | 'eaten' => (intoOf.has(key) ? 'eaten' : 'free');

  // Обработки, принадлежащие плитке детали. Считается ИЗ `consumersOf`, а не вторым обходом
  // шагов: два обхода одного и того же однажды разойдутся, и разойдутся молча — на плитке
  // появится строка, которой нет ни у одного провода.
  //
  // Условие ровно два: шаг ничего не собирает (`!outputUnitKey`) и среди его входов нет ключа,
  // отличного от этой детали. Второе и означает «ровно один различный вход, и он — деталь»:
  // обработка на узле сюда не дойдёт вовсе (её ключа нет среди деталей), а обработка на двух
  // предметах отсеется — одного предмета у неё нет, и приписать её одному значило бы соврать.
  //
  // СРАВНЕНИЕ ПО КЛЮЧУ, А НЕ ПО ПАРЕ «ключ + род», ДЕРЖИТСЯ НА ОДНОМ ФАКТЕ: род входа есть чистая
  // функция ключа (`classifyAssemblyInputs` — `pieceKeys.has(key) ? 'piece' : 'unit'`), поэтому
  // два входа с одним ключом одного рода ВСЕГДА. Сравни здесь ещё и род — и на карточке, где узел
  // назван именем детали (правило 6, `key-is-piece`), раскладка разошлась бы с движком: он такой
  // вход уже посчитал деталью. Шаг с ПУСТЫМ списком входов сюда не приходит по построению — его
  // индекса нет ни в одном списке `consumersOf`, а перебор идёт по ним.
  const processingOf = new Map<string, number[]>();
  consumersOf.forEach((indexes, key) => {
    const own = indexes.filter((i, n) => {
      // Индекс приходит дважды, когда шаг взял одну деталь входом дважды: это нарушение правила
      // 7, карточка невалидна, а рисовать её всё равно надо. Две одинаковые строки на плитке
      // соврали бы о числе обработок и вдобавок вырастили бы её на лишнюю строку.
      if (indexes[n - 1] === i) return false;
      const s = steps[i];
      return !s.outputUnitKey && !s.inputs.some((input) => input.key !== key);
    });
    if (own.length) processingOf.set(key, own);
  });
  /** Высота плитки: голова детали плюс её строки обработки. Без обработок — ровно голова. */
  const tileH = (key: string) => TILE + (processingOf.get(key)?.length ?? 0) * PROC_ROW_H;

  // Хвост — шаги, не принадлежащие вообще ничему. Обработка, получившая свою плитку, из него
  // уходит: держать её в обоих местах значило бы вернуть ту самую кучу, из-за которой всё и
  // затевалось. Остальное в хвосте остаётся как было.
  const onTile = new Set<number>();
  processingOf.forEach((indexes) => indexes.forEach((i) => onTile.add(i)));
  const tailSteps = (loose?.steps ?? []).filter((i) => !onTile.has(i));

  /** Собрать плитки по готовым координатам. Порядок массива — авторский порядок деталей. */
  const buildTiles = (place: Map<string, { x: number; y: number; w: number; h: number }>) => {
    const tiles: TileLayout[] = [];
    const tileByKey = new Map<string, TileLayout>();
    for (const key of allPieces) {
      const p = place.get(key);
      if (!p) continue;
      const tile: TileLayout = {
        key,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        state: stateOf(key),
        into: intoOf.get(key) ?? '',
        consumers: consumersOf.get(key) ?? [],
        processing: processingOf.get(key) ?? [],
      };
      tiles.push(tile);
      tileByKey.set(key, tile);
    }
    return { tiles, tileByKey };
  };

  /** Хвостовой бокс: геометрия строк та же, что у боксов узлов. */
  const tailBox = (col: number, x: number): BoxLayout | undefined => {
    if (tailSteps.length === 0) return undefined;
    return {
      key: '',
      x,
      y: 16,
      w: W,
      // Хвост считается по той же формуле, что и узлы: одна геометрия на все боксы полотна
      // дешевле двух, а подвал у него не пустой — Σ SMV шагов вне узлов такой же вопрос.
      h: HEAD_H + 2 + tailSteps.length * LINE_H + 4 + FOOT_H,
      col,
      stackTop: 16,
      pieceInputs: [],
    };
  };

  if (real.length === 0) {
    // Ни одного узла — но полотно есть. До Ф7 здесь возвращалась пустота 0×0, и схема на
    // неразмеченной карточке выглядела поломкой; между тем именно с этого экрана сборку и
    // начинают.
    const place = new Map<string, { x: number; y: number; w: number; h: number }>();
    // Курсор вместо шага по индексу: без него плитка с обработками легла бы строками на голову
    // следующей. На карточке без обработок курсор даёт ровно прежний шаг 48+8.
    let cursor = 16;
    for (const key of allPieces) {
      const h = tileH(key);
      place.set(key, { x: FREE_TILE_X, y: cursor, w: FREE_TILE_W, h });
      cursor += h + TILE_GAP;
    }
    const { tiles, tileByKey } = buildTiles(place);
    const x0 = (tiles.length ? 76 : 0) + 104;
    const tail = tailBox(0, x0);
    const tilesH = tiles.length ? cursor : 0;
    const height = Math.max(tilesH, tail ? tail.y + tail.h : 0);
    // Правый отступ тот же, что закладывает `applyOverrides`: разойдись они — «пустой набор
    // оверрайдов даёт точное тождество» перестало бы быть правдой в этой ветке.
    const width = tail ? x0 + W + 24 : tiles.length ? FREE_TILE_X + FREE_TILE_W + 24 : 0;
    return {
      boxes: [],
      byKey: new Map(),
      tail,
      width,
      height: height ? height + 30 : 0,
      // Легаси-поле: до Ф7 эта ветка возвращала пустой список, и проба это фиксирует. Правду о
      // деталях говорит `tiles`.
      unassigned: [],
      tiles,
      tileByKey,
      tailSteps,
    };
  }

  // --- 1. глубина -------------------------------------------------------------------------------
  // Узловые входы узла собираются по ВСЕМ его шагам — производящему и поглощающим: узел,
  // вобравший другой узел позже, стоит правее него, иначе провод пошёл бы назад.
  const unitInputsOf = new Map<string, string[]>();
  for (const b of real) {
    const acc: string[] = [];
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (input.kind === 'unit' && input.key !== b.key && res.units.has(input.key)) acc.push(input.key);
      }
    }
    unitInputsOf.set(b.key, acc);
  }
  const depth = new Map<string, number>();
  const depthOf = (key: string, guard: Set<string> = new Set()): number => {
    const known = depth.get(key);
    if (known !== undefined) return known;
    // Цикл невозможен при живых правилах (вход обязан существовать раньше), но раскладка
    // рисует и НЕВАЛИДНУЮ карточку — иначе автор не увидел бы, что именно сломал.
    if (guard.has(key)) return 0;
    guard.add(key);
    const ins = unitInputsOf.get(key) ?? [];
    const d = ins.length === 0 ? 0 : 1 + Math.max(...ins.map((k) => depthOf(k, guard)));
    depth.set(key, d);
    return d;
  };
  real.forEach((b) => depthOf(b.key));
  const maxCol = Math.max(...real.map((b) => depth.get(b.key) ?? 0));

  const cols: AssemblyBlock[][] = [];
  for (let c = 0; c <= maxCol; c++) cols[c] = real.filter((b) => (depth.get(b.key) ?? 0) === c);

  // --- 2. барицентр, два прохода ----------------------------------------------------------------
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c <= maxCol; c++) {
      const rank = new Map<string, number>();
      for (let cc = 0; cc < c; cc++) cols[cc].forEach((b, i) => rank.set(b.key, i));
      cols[c].sort((a, b) => bary(a, rank, unitInputsOf) - bary(b, rank, unitInputsOf));
    }
  }

  // --- детали-входы блока: вертикальная протяжённость -------------------------------------------
  const pieceInputsOf = new Map<string, string[]>();
  for (const b of real) {
    const seen = new Set<string>();
    const acc: string[] = [];
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (input.kind !== 'piece' || seen.has(input.key)) continue;
        seen.add(input.key);
        acc.push(input.key);
      }
    }
    pieceInputsOf.set(b.key, acc);
  }

  // Детали, не вошедшие никуда: отдельная колонка у левого края, чтобы «ещё не пришито» было
  // видно как состояние, а не как отсутствие.
  const unassigned = res.frontier.filter((k) => !res.units.has(k));
  const x0 = (unassigned.length ? 76 : 0) + 104;

  // --- 3. вертикаль: притяжение к середине входов, курсор против наездов ------------------------
  const boxes: BoxLayout[] = [];
  const byKey = new Map<string, BoxLayout>();
  let height = 0;

  for (let c = 0; c <= maxCol; c++) {
    let cursor = 16;
    for (const b of cols[c]) {
      const isCollapsed = collapsed.has(b.key);
      const boxH = isCollapsed ? HEAD_H : HEAD_H + 2 + b.steps.length * LINE_H + 4 + FOOT_H;
      const pieces = pieceInputsOf.get(b.key) ?? [];
      const stackH = pieces.length ? pieces.length * TILE + (pieces.length - 1) * TILE_GAP : 0;
      const effH = Math.max(boxH, stackH);

      let want: number | null = null;
      if (c > 0) {
        let sum = 0;
        let n = 0;
        for (const key of unitInputsOf.get(b.key) ?? []) {
          const q = byKey.get(key);
          if (q) {
            sum += q.y + q.h / 2;
            n++;
          }
        }
        if (n) want = sum / n - effH / 2;
      }
      const y = Math.max(cursor, want ?? cursor);
      const box: BoxLayout = {
        key: b.key,
        x: x0 + c * (W + GAP_X),
        y: y + (effH - boxH) / 2,
        w: W,
        h: boxH,
        col: c,
        stackTop: y + (effH - stackH) / 2,
        pieceInputs: pieces,
      };
      boxes.push(box);
      byKey.set(b.key, box);
      cursor = y + effH + GAP_Y;
      if (y + effH > height) height = y + effH;
    }
  }

  // --- плитки деталей: место следует из состояния -----------------------------------------------
  // Съеденная стоит у бокса съевшего её узла — на своём месте в стопке, посчитанном по
  // `pieceInputs` (индекс тот же, что до Ф7, поэтому съеденные плитки не сдвинулись). Свободная
  // стоит в колонке у левого края, даже если её берёт входом чья-то обработка: до Ф7 такая
  // деталь рисовалась ДВАЖДЫ — и у бокса, и в колонке, — и это был самый частый вид дубля.
  const place = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const box of boxes) {
    // Рост плиток с обработками копится ВНУТРИ стопки: слот зарезервирован под голую плитку, и
    // без сдвига следующая деталь легла бы на строки предыдущей. Слот, оставшийся пустым
    // (свободная деталь ушла в колонку), роста не даёт — как и не давал места.
    let grown = 0;
    box.pieceInputs.forEach((key, i) => {
      if (place.has(key) || stateOf(key) !== 'eaten' || intoOf.get(key) !== box.key) return;
      const h = tileH(key);
      place.set(key, {
        x: box.x + STACK_DX,
        y: box.stackTop + i * (TILE + TILE_GAP) + grown,
        w: STACK_TILE_W,
        h,
      });
      grown += h - TILE;
    });
  }
  // Колонка у левого края: свободные в порядке фронта, следом — детали, которым не нашлось
  // места у бокса. Второе возможно только на битом графе (съевший узел не родился), но нода
  // нужна и там: «одна деталь — ровно одна плитка» не должно зависеть от валидности карточки.
  const columnKeys = [...unassigned, ...allPieces.filter((k) => !place.has(k) && !unassigned.includes(k))];
  let cursor = 16;
  for (const key of columnKeys) {
    const h = tileH(key);
    place.set(key, { x: FREE_TILE_X, y: cursor, w: FREE_TILE_W, h });
    cursor += h + TILE_GAP;
  }
  const { tiles, tileByKey } = buildTiles(place);

  const tail = tailBox(maxCol + 1, x0 + (maxCol + 1) * (W + GAP_X));
  if (tail && tail.y + tail.h > height) height = tail.y + tail.h;

  const tilesH = cursor;
  if (tilesH > height) height = tilesH;
  // Стопка с обработками вправе оказаться ниже своего бокса (её место в третьем проходе
  // считается по голым плиткам). Полотно обязано её вместить: иначе строки уедут за край
  // прокрутки, а `overflow: auto` вниз за границу контента не листает.
  for (const t of tiles) if (t.y + t.h > height) height = t.y + t.h;

  return {
    boxes,
    byKey,
    tail,
    width: (tail ? tail.x : x0 + maxCol * (W + GAP_X)) + W + 24,
    height: height + 30,
    unassigned,
    tiles,
    tileByKey,
    tailSteps,
  };
}

function bary(b: AssemblyBlock, rank: Map<string, number>, ins: Map<string, string[]>): number {
  const keys = (ins.get(b.key) ?? []).filter((k) => rank.has(k));
  if (keys.length === 0) return Number.MAX_SAFE_INTEGER; // без входов — в конец колонки
  return keys.reduce((s, k) => s + (rank.get(k) ?? 0), 0) / keys.length;
}

// Числа для разметки. `TILE` — это ГОЛОВА плитки, а не её высота: высота растёт под строки
// обработки и приходит в `TileLayout.h`. Кто нарисует силуэт по `h`, растянет деталь на её же
// строки, а кто отсчитает строки не от `TILE` — положит первую поверх силуэта.
export const SCHEMATIC_METRICS = { W, LINE_H, HEAD_H, FOOT_H, TILE, TILE_GAP, PROC_ROW_H };
