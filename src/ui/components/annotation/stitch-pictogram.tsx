import {
  GAUGE_REF,
  STITCHES,
  strokeAcross,
  strokeGeometry,
  type StitchKey,
} from 'components/managers/tech-card/components/design/modals/vector-strokes';

import { parseSpec } from './purpose';

// ПИКТОГРАММА СТЕЖКА (волна callout kinds, T17). Владелец: «в стич колауте должно быть не только
// исо но и пиктограмка как этот шов выглядит».
//
// СВОЕГО НАБОРА РИСУНКОВ ЗДЕСЬ НЕТ, и это решение. Вид шва сверху уже нарисован один раз — кистями
// векторного слоя (`vector-strokes`: `STITCHES` + `strokeGeometry`), которыми флэт и чертят.
// Второй набор разошёлся бы с ними первой же правкой, и на одной карточке 504 на флэте и 504 на
// плашке выглядели бы по-разному. Поэтому пиктограмма — тот же `strokeGeometry` на коротком
// отрезке; номер ISO сводится к кисти здесь, одной таблицей.
//
// ДОСТУП ТОТАЛЕН: незнакомый номер — `null`, пиктограммы нет, номер остаётся словами.

/** Номера из самих кистей: «301» → lock, «301 ×2» → double, «504» → overlock … */
const FROM_BRUSHES: [string, StitchKey][] = STITCHES.filter((s) => /^\d/.test(s.iso)).map((s) => [
  s.iso,
  s.key,
]);

/**
 * Номера, у которых своей кисти нет, но вид сверху совпадает с соседом: 407 — тот же каверстич
 * с тремя иглами, 602/605 — каверстич с верхним застилом, 512 — четырёхниточный оверлок.
 * 401 (цепной) сюда НЕ входит: кисти с петлями цепочки нет, а нарисовать его прямой строчкой
 * значило бы показать другую машину.
 */
const ALIASES: [string, StitchKey][] = [
  ['407', 'cover'],
  ['602', 'cover'],
  ['605', 'cover'],
  ['512', 'overlock4'],
];

const BY_ISO = new Map<string, StitchKey>([...ALIASES, ...FROM_BRUSHES]);

/** Номер ISO 4915 → кисть, которой он рисуется. Незнакомое — `null`. */
export function stitchBrushOf(iso: string | null | undefined): StitchKey | null {
  const k = (iso ?? '').trim();
  return (k && BY_ISO.get(k)) || null;
}

/** Номер ISO указания-шва из провода; всё остальное — пусто. */
export function stitchIsoOf(raw: string | null | undefined): string {
  const spec = parseSpec(raw);
  return spec?.t === 'stitch' ? spec.iso ?? '' : '';
}

/** Юниты платы: нить и стежок, при которых признаки шва читаются в 12 пикселях высоты (подобрано
 * на стенде среди 3/4/6: на 6 строчка — пять штрихов, на 3 признаки уходят под пиксель). */
const GAUGE = 4;
const STEP = 4;
const LEN = 120;
/** ОДНА высота на все виды: разные высоты читались бы как разный вес шва. */
const BOX_H = Math.max(
  ...STITCHES.map((s) => {
    const a = strokeAcross(s.key, GAUGE);
    return a.up + a.down + 2 * GAUGE;
  }),
);

/** Показанный размер, px. Ширина — по пропорции бокса. */
const SHOW_H = 12;

export function StitchPictogram({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  const brush = stitchBrushOf(iso);
  if (!brush) return null;
  const a = strokeAcross(brush, GAUGE);
  const fig = a.up + a.down + GAUGE;
  const y = (BOX_H - fig) / 2 + a.up + GAUGE / 2;
  const g = strokeGeometry(
    {
      tool: 'line',
      brush,
      weight: 'thin',
      gauge: GAUGE,
      step: STEP,
      dashed: false,
      pts: [
        [0.04, y / BOX_H],
        [0.96, y / BOX_H],
      ],
    },
    LEN,
    BOX_H,
    // Юнит бокса = юнит платы: `GAUGE` и `STEP` выше — те же числа, что у штриха на флэте.
    GAUGE_REF,
  );
  return (
    <svg
      width={Math.round((SHOW_H * LEN) / BOX_H)}
      height={SHOW_H}
      viewBox={`0 0 ${LEN} ${BOX_H}`}
      aria-hidden
      data-stitch-pictogram={brush}
      className={className ?? 'inline-block shrink-0 align-middle'}
    >
      {g.offsets.map((dy, k) => (
        <path
          key={k}
          d={g.d}
          transform={`translate(0 ${dy})`}
          fill='none'
          stroke='currentColor'
          strokeWidth={g.strokeWidth}
          strokeDasharray={g.dash || undefined}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      ))}
    </svg>
  );
}
