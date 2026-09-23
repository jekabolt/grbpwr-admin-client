// СИЛУЭТ ДЕТАЛИ НА БУМАГЕ — контур из DXF, который ПРОПЕЧАТАЕТСЯ на лазере и струйнике.
//
// Экранный `PieceShape` рисует штрих в координатах чертежа (`box.w / 120`) либо в экранных
// пикселях (`non-scaling-stroke` у SILHOUETTE_INK); ни то ни другое не описывает линию в
// миллиметрах на бумаге, а именно она решает, будет ли контур виден: 0,18 мм рассыпается в растр,
// 0,5 мм — читается при любом размере плитки. Поэтому здесь ТРИ правила и ничего кроме них:
//   1. только ВНЕШНИЙ контур — ни надсечек, ни линии шва, ни долевой, ни штриховки ткани: это и
//      было тем «мелким, что не пропечатается»;
//   2. толщина линии задаётся в мм БУМАГИ и переводится в юниты чертежа через масштаб
//      вписывания — плитка 9 мм и плитка 36 мм печатаются одной и той же линией;
//   3. только 100 % K, без заливки: серая заливка ушла бы в халфтон и съела бы контур.
// Контур упрощается до допуска 0,25 мм на бумаге: дуги DXF расплющены в сотни точек, а плиток на
// листе десятки — PDF не должен весить как маркер.
import type { PieceDTO, Pt } from 'lib/nesting/types';

/** Дуглас–Пекер: точки, отклонившиеся от хорды меньше `tol`, выбрасываются. */
function simplify(pts: readonly Pt[], tol: number): Pt[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      // Расстояние до хорды; у вырожденной хорды (замкнутый контур, первая точка = последняя) —
      // до самой точки, иначе весь контур схлопнулся бы в отрезок.
      const d =
        len > 1e-9 && (dx !== 0 || dy !== 0)
          ? Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len
          : Math.hypot(P.x - A.x, P.y - A.y);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

export function PaperShape({
  piece,
  boxW,
  boxH,
  lineMm,
}: {
  piece: PieceDTO;
  /** Бокс плитки, мм. */
  boxW: number;
  boxH: number;
  /** Толщина контура на бумаге, мм. */
  lineMm: number;
}) {
  const w = Math.max(piece.bboxW, 1e-3);
  const h = Math.max(piece.bboxH, 1e-3);
  // Поле под штрих: половина линии выходит за габарит, без поля она обрезалась бы по viewBox.
  const scale0 = Math.min(boxW / w, boxH / h);
  const pad = lineMm / scale0;
  const vw = w + 2 * pad;
  const vh = h + 2 * pad;
  const scale = Math.min(boxW / vw, boxH / vh);
  const sw = lineMm / scale;
  const pts = simplify(piece.poly, 0.25 / scale);
  // DXF считает Y вверх, SVG — вниз: инвертируем в числах, как и остальные читатели чертежа.
  const points = pts.map((p) => `${p.x},${-p.y}`).join(' ');
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      className='ap-shape'
      style={{ width: `${boxW}mm`, height: `${boxH}mm` }}
      viewBox={`${-pad} ${-h - pad} ${vw} ${vh}`}
      preserveAspectRatio='xMidYMid meet'
      role='img'
      aria-label={`piece contour ${piece.blockName || piece.name}`}
    >
      <polygon
        points={points}
        fill='none'
        stroke='#000'
        strokeWidth={sw}
        strokeLinejoin='round'
        strokeLinecap='round'
      />
    </svg>
  );
}
