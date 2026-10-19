// Силуэт фигуры за деталями — только ориентир масштаба, 170 см, вид спереди, руки чуть в стороны.
//
// Строится из опорных точек правой половины (x ≥ 0, Y вниз, см от макушки), зеркалится и
// сглаживается замкнутым сплайном Катмулла-Рома в кубические Безье: одна чистая линия без
// «рисованных» изломов. Путь считается один раз на модуль.

// Правая половина: от подбородка вниз по руке, по боку, по ноге — до шага.
const RIGHT: [number, number][] = [
  [5, 21],
  [5.5, 26],
  [10, 29],
  [17, 31],
  [21, 34],
  [23, 42],
  [26, 58],
  [30, 74],
  [34, 88],
  [36, 95],
  [39, 102],
  [39.5, 108],
  [37, 112],
  [33.5, 109],
  [32, 101],
  [29, 93],
  [24, 77],
  [20, 60],
  [17, 47],
  [15.5, 58],
  [13.5, 70],
  [15.5, 82],
  [17.5, 92],
  [17, 105],
  [14.5, 122],
  [13, 132],
  [12, 145],
  [9.5, 160],
  [10.5, 166],
  [12, 169.5],
  [7, 170],
  [4, 168],
  [4.5, 160],
  [5, 145],
  [4, 132],
  [4.5, 122],
  [4, 108],
  [1.5, 100],
];
// Голова справа: от подбородка вверх к макушке (макушка — общая точка).
const HEAD_RIGHT: [number, number][] = [
  [6.5, 17],
  [7.5, 10],
  [5.5, 3],
];

export const SILHOUETTE_HEIGHT_CM = 170;

const LOOP: [number, number][] = (() => {
  const left = (pts: [number, number][]) => pts.map(([x, y]) => [-x, y] as [number, number]);
  return [
    [0, 0],
    ...[...HEAD_RIGHT].reverse(),
    ...RIGHT,
    [0, 98],
    ...left(RIGHT).reverse(),
    ...left(HEAD_RIGHT),
  ];
})();

const f = (v: number) => Math.round(v * 100) / 100;

const PATH = (() => {
  const p = LOOP;
  const n = p.length;
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${p2[0]},${p2[1]}`;
  }
  return `${d}Z`;
})();

// cx/cy — центр фигуры в координатах листа (экранных, Y вниз).
export function BodySilhouette({ cx, cy }: { cx: number; cy: number }) {
  return (
    <path
      d={PATH}
      transform={`translate(${cx} ${cy - SILHOUETTE_HEIGHT_CM / 2})`}
      fill='#cfcfcf'
      fillOpacity={0.12}
      stroke='#cfcfcf'
      strokeWidth={1}
      vectorEffect='non-scaling-stroke'
      strokeLinejoin='round'
      pointerEvents='none'
    />
  );
}
