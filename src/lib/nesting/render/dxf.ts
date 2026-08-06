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
// пополам. Отдельным слоем цех их видит и решает сам, что надрезать. Coordinates are cm (declared via $INSUNITS=5), y-up exactly as the source
// pattern DXF was authored — chirality is preserved, nothing is mirrored for display.
//
// Contours are the TRUE tessellated piece outlines (the same `poly` the SVG export
// draws), not the RDP-simplified placement geometry.
import type { NestResult, PieceDTO, Pt, RotationDeg } from '../types';
import { SEAM_LINE_LAYER } from '../geom/seam-allowance';
import { DXF_CAP_PER_EM, planLayoutLabels } from './label-fit';

function rotPt(p: Pt, rot: RotationDeg): Pt {
  switch (rot) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

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

export function renderLayoutDxf(
  result: NestResult,
  pieces: readonly PieceDTO[],
  fabricWidthCm: number,
  opts?: { labels?: boolean },
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
    const placed = dto.poly.map((p) => {
      const r = rotPt(p, pl.rot);
      return { x: r.x + pl.x, y: r.y + pl.y };
    });
    entities.push(...polylineTags('CUT', placed));

    // Внутренняя геометрия детали — на СВОЙ слой INNER, не на CUT. Резак режет по CUT, и
    // отправить туда линию шва с вытачками значило бы разрезать деталь пополам. Отдельным слоем
    // цех их видит и решает сам: надсечки надрезать, линию шва пробить или проигнорировать.
    for (const c of dto.inner ?? []) {
      if (c.pts.length < 2) continue;
      const ip = c.pts.map((p) => {
        const r = rotPt(p, pl.rot);
        return { x: r.x + pl.x, y: r.y + pl.y };
      });
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

  const tags: Tag[] = [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'],
    // Not an R12 variable strictly speaking, but universally read and the only portable
    // way to declare «these numbers are centimeters».
    [9, '$INSUNITS'],
    [70, '5'],
    [9, '$EXTMIN'],
    [10, num(0)],
    [20, num(0)],
    [30, '0.0'],
    [9, '$EXTMAX'],
    [10, num(L)],
    [20, num(W)],
    [30, '0.0'],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'TABLES'],
    [0, 'TABLE'],
    [2, 'LAYER'],
    [70, String(3 + (hasInner ? 1 : 0) + (hasSeam ? 1 : 0))],
    ...layerTags('CUT', 7),
    ...layerTags('STRIP', 1),
    ...layerTags('LABELS', 3),
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
