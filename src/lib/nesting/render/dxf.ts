// NestResult → plotter-ready ASCII DXF (R12). Hand-written on purpose: the writer is a
// few group-code loops, while any DXF lib would drag a dependency into the bundle for
// features cutters do not read. R12 + classic POLYLINE/VERTEX/SEQEND (not LWPOLYLINE,
// which is R13+) is the lowest common denominator every cutter/plotter driver accepts.
//
// Layers: CUT (color 7) — every placed piece contour, the only layer a cutter needs;
// STRIP (color 1) — the fabric boundary rectangle, for aligning the marker on the table;
// LABELS (color 3) — piece-name TEXT at each piece's center, ignored by plotters, read
// by humans; INNER (color 8) — чертёж детали: линия шва, надсечки, свёрла, вытачки. INNER
// намеренно НЕ CUT: резак режет по CUT, и линия шва с вытачками там разрезала бы деталь
// пополам. Отдельным слоем цех их видит и решает сам, что надрезать. Coordinates are cm
// (declared via $INSUNITS=5), y-up exactly as the source pattern DXF was authored.
//
// ЗЕРКАЛЬНОСТЬ — ЧАСТЬ РАЗМЕЩЕНИЯ, А НЕ ОФОРМЛЕНИЯ. Прежняя редакция этой шапки обещала
// «chirality is preserved, nothing is mirrored for display», и до Ф1.2 это была правда: движок
// умел только поворачивать. Теперь Placement.flipped значит «контур отражён» (types.ts), и файл
// обязан отразить его ровно так же, как экран: деталь, зеркальная на картинке и не зеркальная
// в DXF (или наоборот), даёт крой, из которого изделие не собрать — две левые полочки. Никакого
// зеркала «для вида» здесь по-прежнему нет: отражается только то, что размещение назвало
// отражённым, и тем же преобразованием, что в SVG.
//
// Contours are the TRUE tessellated piece outlines (the same `poly` the SVG export
// draws), not the RDP-simplified placement geometry.
import type { NestResult, PieceDTO, Pt } from '../types';
import { placedPoly } from '../types';
import { SEAM_LINE_LAYER } from '../geom/seam-allowance';
import { DXF_CAP_PER_EM, labelBoxSize, planLayoutLabels } from './label-fit';

// Fixed 4-decimal formatting keeps the file deterministic and well under every driver's
// precision; -0.0000 is normalized so re-exports are byte-identical.
function num(v: number): string {
  const s = v.toFixed(4);
  return s === '-0.0000' ? '0.0000' : s;
}

// DXF TEXT value: control characters would corrupt the pair stream; the value itself is
// free text otherwise. Non-ASCII survives as UTF-8 — modern readers accept it, plotters
// never read LABELS.
function textValue(s: string): string {
  return s.replace(/[\r\n\t]/g, ' ');
}

type Tag = [code: number, value: string];

function polylineTags(layer: string, pts: readonly Pt[], closed = true): Tag[] {
  const tags: Tag[] = [
    [0, 'POLYLINE'],
    [8, layer],
    [66, '1'], // vertices follow
    // Надсечка и базовая линия — НЕЗАМКНУТЫЕ. Пометить их закрытыми значило бы дорисовать
    // отрезок обратно и заставить резак пройти по ткани лишний раз.
    [70, closed ? '1' : '0'],
  ];
  for (const p of pts) {
    tags.push([0, 'VERTEX'], [8, layer], [10, num(p.x)], [20, num(p.y)], [30, '0.0']);
  }
  tags.push([0, 'SEQEND'], [8, layer]);
  return tags;
}

// ── ШАПКА ПЛОТТЕРНОГО ФАЙЛА (Ф4.7) ───────────────────────────────────────────────────────────
//
// Файл раскройного настила обязан НАЗЫВАТЬ СЕБЯ: какой прогон, какой цвет, какой артикул,
// сколько слоёв, какой состав, какая длина, когда снят. Иначе распечатанный лист неотличим от
// такого же листа соседней партии, а раскроить не тот настил стоит рулона.
//
// ДВА ВИДА, И ОБА ОБЯЗАТЕЛЬНЫ. Комментарии 999 — машинная провенанс-метка (любой плоттер их
// игнорирует, скрипт разбирает key=value). ВИДИМЫЙ ТЕКСТ — TEXT на своём слое HEADER над
// полосой: раскройщик читает ЛИСТ, а не байты файла, и одной метки в комментариях ему не видно.
//
// КАРТОЧНЫЙ ЭКСПОРТ ШАПКИ НЕ НЕСЁТ, и это регрессионный инвариант, а не пожелание: без
// `opts.header` файл обязан остаться ПОБАЙТОВО прежним — ни слоя HEADER, ни блока 999, ни
// сдвинутого $EXTMAX. Поэтому каждая добавка ниже стоит под условием «шапка есть И в ней есть
// хоть одно заполненное поле», а ветка «нет» переиспользует ровно те же выражения, что и раньше.
export type LayHeader = {
  runId?: number | undefined;
  layName?: string | undefined;
  colorway?: string | undefined;
  articleCode?: string | undefined;
  materialName?: string | undefined;
  plies?: number | undefined;
  // Состав настила: размер (как его ЧИТАЮТ, а не id) × количество.
  composition?: readonly { size?: string | undefined; qty?: number | undefined }[] | undefined;
  lengthCm?: number | undefined;
  dateISO?: string | undefined;
};

// КАЖДОЕ ПОЛЕ — `?: T | undefined`, И ЭТО НЕ СТИЛЬ. Шапку собирает экран прогона из
// ГЕНЕРИРОВАННЫХ типов клиента, а те не опциональны: вызывающий передаёт все поля явно, включая
// `undefined` (detail-page.tsx:918-935). Объявление `runId?: number` такой вызов принимает
// сегодня, но сломается ровно в тот день, когда в tsconfig появится exactOptionalPropertyTypes.
//
// Вторая половина той же ловушки — ЗНАЧЕНИЯ. Прото-нули и прото-пустышки означают «не задано»:
// `runId: 0` — это отсутствие прогона, а не прогон номер ноль, `plies: 0` — отсутствие числа
// слоёв. Напечатать «PR0» или «слоёв 0» значит соврать в шапке, по которой кроят. Поэтому
// нормализаторы ниже одинаково выбрасывают undefined, '', 0, отрицательное и NaN.
function headerStr(v: string | undefined): string {
  return typeof v === 'string' ? textValue(v).trim() : '';
}

function headerCount(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

function headerCm(v: number | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v.toFixed(2) : '';
}

// Дата печатается КАЛЕНДАРНЫМ ДНЁМ. Полный ISO-момент с временем и зоной на листе раскроя не
// значит ничего, а место занимает; при этом принять его надо — вызывающий отдаёт то, что лежит
// в прото-Timestamp.
function headerDate(v: string | undefined): string {
  const s = headerStr(v);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s;
}

type HeaderField = { key: string; machine: string; human: string; row: number };

// Пунктуация шапки — ЧИСТЫЙ ASCII ('|', 'x'), хотя слова русские. Слова неизбежны (LABELS уже
// печатает «деталь N»), а вот типографские кавычки и знак умножения — свободный выбор, и
// штриховые шрифты раскройных CAD (txt.shx) знают ASCII заведомо.
function headerComposition(rows: LayHeader['composition']): { human: string; machine: string } {
  if (!Array.isArray(rows)) return { human: '', machine: '' };
  const kept: string[] = [];
  for (const r of rows) {
    if (!r) continue;
    const qty = headerCount(r.qty);
    if (!qty) continue;
    // Размер без имени печатается как '?', а строка НЕ выбрасывается: потерять количество молча
    // хуже, чем показать неназванный размер — сумма по составу обязана сходиться с числом слоёв.
    const size = headerStr(r.size) || '?';
    kept.push(`${size}x${qty}`);
  }
  return kept.length === 0
    ? { human: '', machine: '' }
    : { human: `размеры ${kept.join(' ')}`, machine: kept.join(';') };
}

function headerFields(h: LayHeader): HeaderField[] {
  const out: HeaderField[] = [];
  const push = (key: string, machine: string, human: string, row: number) => {
    if (machine !== '') out.push({ key, machine, human, row });
  };
  // Ряд 0 — «чей это лист»; ряд 1 — «из чего кроим»; ряд 2 — «сколько и когда».
  const runId = headerCount(h.runId);
  // Тот же токен, что в имени файла раскройного экспорта (PR<runId>_…): лист и файл на столе
  // должны называть прогон одинаково, иначе их не сопоставить.
  push('run', runId ? String(runId) : '', `PR${runId}`, 0);
  push('lay', headerStr(h.layName), `настил ${headerStr(h.layName)}`, 0);
  push('colorway', headerStr(h.colorway), `цвет ${headerStr(h.colorway)}`, 0);
  push('article', headerStr(h.articleCode), `арт. ${headerStr(h.articleCode)}`, 1);
  push('material', headerStr(h.materialName), headerStr(h.materialName), 1);
  const plies = headerCount(h.plies);
  push('plies', plies ? String(plies) : '', `слоёв ${plies}`, 1);
  const comp = headerComposition(h.composition);
  push('composition', comp.machine, comp.human, 2);
  const len = headerCm(h.lengthCm);
  push('length_cm', len, `длина ${len} см`, 2);
  push('date', headerDate(h.dateISO), headerDate(h.dateISO), 2);
  return out;
}

function headerLinesOf(fields: readonly HeaderField[]): string[] {
  const rows = [0, 1, 2].map((r) =>
    fields
      .filter((f) => f.row === r)
      .map((f) => f.human)
      .join(' | '),
  );
  return rows.filter((s) => s !== '');
}

// Кегль шапки фиксирован и НЕ зависит от ширины полосы (в отличие от подписей деталей, которым
// надо влезть внутрь контура): шапке влезать некуда, она стоит на пустом месте над полосой.
const HEADER_FONT_CM = 2.2;
// Просвет от полосы до НИЖНЕЙ строки шапки — то самое `y = fabricWidthCm + 4` из §10. Строки
// стопкой ВВЕРХ: тогда читаются они сверху вниз в том порядке, в каком собраны, а расстояние до
// полосы остаётся ровно 4 см независимо от того, сколько строк заполнено.
const HEADER_GAP_CM = 4;
const HEADER_LINE_CM = HEADER_FONT_CM * 1.6;

export function renderLayoutDxf(
  result: NestResult,
  pieces: readonly PieceDTO[],
  fabricWidthCm: number,
  opts?: { labels?: boolean; header?: LayHeader },
): string {
  const labels = opts?.labels ?? true;
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const W = fabricWidthCm;
  const L = result.usedLengthCm;

  const entities: Tag[] = [];

  // Strip boundary first — the alignment reference.
  entities.push(
    ...polylineTags('STRIP', [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: W },
      { x: 0, y: W },
    ]),
  );

  for (const pl of result.placements) {
    const dto = byId.get(pl.pieceId);
    if (!dto) continue;
    // ТО ЖЕ преобразование, что в render/svg.ts, из одного места (types.ts).
    entities.push(...polylineTags('CUT', placedPoly(dto.poly, pl)));

    // Внутренняя геометрия детали — на СВОЙ слой INNER, не на CUT. Резак режет по CUT, и
    // отправить туда линию шва с вытачками значило бы разрезать деталь пополам. Отдельным слоем
    // цех их видит и решает сам: надсечки надрезать, линию шва пробить или проигнорировать.
    for (const c of dto.inner ?? []) {
      if (c.pts.length < 2) continue;
      const ip = placedPoly(c.pts, pl);
      entities.push(...polylineTags(c.layer === SEAM_LINE_LAYER ? 'SEAM' : 'INNER', ip, c.closed));
    }
  }

  // Подписи считаются ТЕМ ЖЕ планировщиком, что и в SVG (render/label-fit.ts), на тех же
  // истинных контурах: имя ложится внутрь СВОЕЙ детали — повёрнутым по долевой/длинной оси,
  // при нужде уменьшенным и усечённым, а совсем мелкой детали достаётся выноска. Разойдись
  // здесь реализация с экранной — раскройщик получил бы маркер, где имя стоит на соседней
  // детали, а на экране всё выглядело правильно.
  if (labels) {
    for (const lab of planLayoutLabels(result, pieces, fabricWidthCm)) {
      const { plan } = lab;
      if (plan.leader) {
        // Выноска: точка на детали + линия до рамки. Обе на LABELS — резак этот слой не режет.
        entities.push(
          [0, 'CIRCLE'],
          [8, 'LABELS'],
          [10, num(plan.leader.dotX)],
          [20, num(plan.leader.dotY)],
          [30, '0.0'],
          [40, num(plan.fontCm * 0.22)],
        );
        entities.push(
          ...polylineTags(
            'LABELS',
            [
              { x: plan.leader.dotX, y: plan.leader.dotY },
              { x: plan.leader.toX, y: plan.leader.toY },
            ],
            false,
          ),
        );
      }
      entities.push(
        [0, 'TEXT'],
        [8, 'LABELS'],
        [10, num(plan.x)],
        [20, num(plan.y)],
        [30, '0.0'],
        // Группа 40 — высота ПРОПИСНОЙ, а не кегль: связь задана одной константой на оба
        // формата, иначе буквы на плоттере были бы не того размера, что на экране.
        [40, num(plan.fontCm * DXF_CAP_PER_EM)],
        [1, textValue(plan.text)],
        // Ссылка на объявленный STYLE: без неё читатель берёт свой шрифт, а бронь места считалась
        // под конкретную метрику.
        [7, 'GRBPWR'],
        // Угол строки, CCW — в DXF Y смотрит вверх, так что знак тот же, что в плане.
        [50, num(plan.angleDeg)],
        // 72/73 = выравнивание по центру и по середине; при ненулевых 72/73 точкой отсчёта
        // становится 11/21, а не 10/20. Порядок групп канонический для R12 (73 идёт ПОСЛЕ
        // 11/21/31) — строгие драйверы читают поток последовательно.
        [72, '1'],
        [11, num(plan.x)],
        [21, num(plan.y)],
        [31, '0.0'],
        [73, '2'],
      );
    }
  }

  // Шапка — ПОСЛЕДНЕЙ в потоке сущностей. Порядок энтити на отрисовку не влияет, а дописывание
  // в конец оставляет весь прежний поток (STRIP, CUT, INNER/SEAM, LABELS) нетронутым байт в байт
  // — то есть делает регрессию «карточный экспорт не изменился» проверяемой, а не обещанной.
  const fields = opts?.header ? headerFields(opts.header) : [];
  const headerLines = headerLinesOf(fields);
  // Шапка, в которой не заполнено НИ ОДНО поле, не рисуется вовсе — ни слоя, ни комментариев.
  // Это то же правило, по которому INNER и SEAM объявляются только непустыми: объявленный пустой
  // слой врёт ровно тому, кто его включил и ничего не увидел.
  const hasHeader = headerLines.length > 0;
  const headerCapCm = HEADER_FONT_CM * DXF_CAP_PER_EM;
  // Верх шапки и её правый край нужны для $EXTMAX: текст ЗА объявленными границами чертежа
  // читатель обрезает по «показать всё», и видимая шапка оказывается невидимой.
  let headerTopCm = W;
  let headerRightCm = 0;
  if (hasHeader) {
    headerLines.forEach((line, i) => {
      const y = W + HEADER_GAP_CM + (headerLines.length - 1 - i) * HEADER_LINE_CM;
      headerTopCm = Math.max(headerTopCm, y + headerCapCm);
      headerRightCm = Math.max(headerRightCm, labelBoxSize(line, HEADER_FONT_CM).w);
      entities.push(
        [0, 'TEXT'],
        [8, 'HEADER'],
        [10, num(0)],
        [20, num(y)],
        [30, '0.0'],
        // Как и у подписей деталей: группа 40 — высота ПРОПИСНОЙ, не кегль.
        [40, num(headerCapCm)],
        [1, textValue(line)],
        // Без 72/73 точка отсчёта — 10/20, выключка влево по базовой линии: шапка встаёт по
        // левому краю полосы, а не по её середине.
        [7, 'GRBPWR'],
      );
    });
  }

  // Машинная провенанс-метка. Плоттеры 999 пропускают, разбор — тривиальный key=value.
  const headerComments: Tag[] = hasHeader
    ? [
        [999, 'GRBPWR-LAY-HEADER'],
        ...fields.map((f): Tag => [999, `${f.key}=${f.machine}`]),
      ]
    : [];

  const layerTags = (name: string, color: number): Tag[] => [
    [0, 'LAYER'],
    [2, name],
    [70, '0'],
    [62, String(color)],
    [6, 'CONTINUOUS'],
  ];

  // Слои INNER и SEAM объявляются ТОЛЬКО когда в файле есть что на них положить.
  //
  // Это не аккуратность, а починка лжи. Чертёж детали (линия шва, надсечки, свёрла) живёт в
  // `PieceDTO.inner`, а СОХРАНЁННЫЙ маркер его не хранит: блоб держит контуры и размещения, и
  // деталь, восстановленная из блоба, приходит без inner вовсе. Экспорт из переоткрытого маркера
  // при этом объявлял оба слоя в таблице — файл выглядел полным, слои в CAD были, и пустыми они
  // оказывались только у того, кто их включил и ничего не увидел. Отличить «в этой детали
  // надсечек нет» от «чертёж не сохранился» было нечем.
  //
  // Теперь отсутствие слоя — это и есть ответ. Пересборка чертежа при экспорте (по скачанным
  // выкройкам) — работа Ф3; до неё честнее не обещать.
  const hasInner = entities.some((t) => t[0] === 8 && t[1] === 'INNER');
  const hasSeam = entities.some((t) => t[0] === 8 && t[1] === 'SEAM');

  // Границы чертежа растут ТОЛЬКО под шапку и ТОЛЬКО когда она есть: без неё оба выражения
  // сводятся к прежним `L` и `W` — тем же числам, а значит тем же байтам.
  const extMaxX = hasHeader ? Math.max(L, headerRightCm) : L;
  const extMaxY = hasHeader ? headerTopCm : W;

  const tags: Tag[] = [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'],
    // Комментарии шапки — СРАЗУ за $ACADVER: первое, что видит человек, открывший файл
    // текстом, и первое, что находит скрипт, которому нужна провенанс-метка.
    ...headerComments,
    // Not an R12 variable strictly speaking, but universally read and the only portable
    // way to declare «these numbers are centimeters».
    [9, '$INSUNITS'],
    [70, '5'],
    [9, '$EXTMIN'],
    [10, num(0)],
    [20, num(0)],
    [30, '0.0'],
    [9, '$EXTMAX'],
    [10, num(extMaxX)],
    [20, num(extMaxY)],
    [30, '0.0'],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'TABLES'],
    [0, 'TABLE'],
    [2, 'LAYER'],
    [70, String(3 + (hasHeader ? 1 : 0) + (hasInner ? 1 : 0) + (hasSeam ? 1 : 0))],
    ...layerTags('CUT', 7),
    ...layerTags('STRIP', 1),
    ...layerTags('LABELS', 3),
    // HEADER — шапка настила: единственный слой, чьи сущности стоят ЗА полосой. Объявляется
    // только когда на нём что-то есть (см. hasHeader). Имя совпадает с именем СЕКЦИИ HEADER
    // файла — это разные пространства имён DXF и читателю они не мешают, но проверять слой
    // грепом по строке после этого нельзя: читать надо поток пар, различая код 2 в таблице
    // слоёв и код 8 на сущности.
    ...(hasHeader ? layerTags('HEADER', 5) : []),
    // INNER — чертёж детали (линия шва, надсечки, свёрла, вытачки). Отдельным слоем, чтобы
    // резак по нему НЕ резал, а цех мог включить и увидеть.
    ...(hasInner ? layerTags('INNER', 8) : []),
    // SEAM — ТОЛЬКО линия шва, отдельно от остального чертежа. Иначе она неотличима от цепочек
    // со слоя 1 файла, а тот не градуируется: у XS его линия отстоит от контура на 0.03–2.03 см
    // и местами его пересекает. Раскройщик, проверяющий припуск по зазору между линиями, обязан
    // иметь возможность выключить всё лишнее и увидеть ровно одну пару.
    ...(hasSeam ? layerTags('SEAM', 4) : []),
    [0, 'ENDTAB'],
    // ШРИФТ ОБЪЯВЛЕН ЯВНО. Без таблицы STYLE и ссылки на неё из TEXT (группа 7) читатель
    // подставляет любой свой, а планировщик подписей бронирует место по конкретной метрике: у
    // Courier New отношение advance/высота прописной 1.05, у Arial по прописным 1.01, на букве W —
    // 1.32, и строка вылезает на соседнюю деталь ровно на файле, по которому режут. txt.shx —
    // штриховой шрифт любого раскройного CAD; width factor 1.0 фиксируется группой 41.
    [0, 'TABLE'],
    [2, 'STYLE'],
    [70, '1'],
    [0, 'STYLE'],
    [2, 'GRBPWR'],
    [70, '0'],
    [40, '0.0'],
    [41, '1.0'],
    [50, '0.0'],
    [71, '0'],
    [42, '0.2'],
    [3, 'txt'],
    [4, ''],
    [0, 'ENDTAB'],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'ENTITIES'],
    ...entities,
    [0, 'ENDSEC'],
    [0, 'EOF'],
  ];

  // Group-code pair stream, CRLF — the classic DXF wire format.
  return tags.map(([code, value]) => `${code}\r\n${value}`).join('\r\n') + '\r\n';
}
