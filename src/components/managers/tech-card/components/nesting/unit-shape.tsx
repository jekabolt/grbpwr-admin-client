// ПИКТОГРАММА УЗЛА — детали узла, состыкованные по сшиваемым кромкам (полоса C, C2).
//
// Сосед `PieceShape` и рисует ТЕМ ЖЕ языком, а не своим: каждая деталь — три слоя по одним точкам
// (заливка штриховкой ткани, белая обкладка 3px, чернильный контур 1px, оба штриха
// non-scaling), штриховка — `clothPatternDefs` с `u`, посчитанным из бокса рисования так же, как у
// плитки детали. Нового здесь три знака, и все три из 00-FEASIBILITY §F/§G:
//   «×n»  — одинаковые слои (верх/низ воротника, кокетка и её подкладка) одной формой;
//   «~»   — деталь подвешена на 3D-шов (окат в пройму, воротник на горловину): пунктирный контур и
//           тильда на середине кромки, на которой она висит;
//   поверх — накладные детали рисуются последними, своей штриховкой.
//
// Под каждой деталью — НЕПРОЗРАЧНАЯ подложка цвета плитки. Штриховка прозрачна между линиями, и без
// подложки контур нижней детали просвечивал бы сквозь верхнюю там, где кромки ложатся внахлёст
// (посадка), — пиктограмма читалась бы как наложение, а не как шов.
//
// КООРДИНАТЫ НАРУЖУ НЕ ОТДАЮТСЯ: компонент — только SVG. Пиктограмма не чертёж и не раскладка
// (01-PLAN §5), её числа нельзя использовать как место детали на ткани.
import type { UnionPicture } from 'lib/assembly-skeleton/union';
import { Fragment, memo, useId, type ReactElement } from 'react';
import { clothPatternDefs, hatchId } from '../cloth-hatch';
import type { PieceClothState } from '../piece-cloth';

const BOX_FALLBACK = { w: 48, h: 38 };
// Знаки «×n» и «~» — в CSS-пикселях, как `text-nano` (9px) системы: в плитке 56px они обязаны
// читаться, а шрифт в user units уехал бы вместе с габаритом узла.
const BADGE_PX = 9;
const MARK_PX = 13;

const ptsAttr = (pts: readonly [number, number][]) => pts.map((p) => `${p[0]},${p[1]}`).join(' ');

/** Рамка, в которую деталь штрихуется: `unbound`/нет ткани — без знака, серой подложкой. */
const isHatch = (c: string | null): c is PieceClothState => !!c && c !== 'unbound';

export const UnitShape = memo(function UnitShape({
  picture,
  className,
  hatchW,
  hatchH,
  label,
  plain,
}: {
  picture: UnionPicture;
  /**
   * Глиф при имени (рельс, шапка бокса, полка): 16–28px, где штриховка и знаки — шум. Только
   * формы серой заливкой, как `PieceSilhouette` у детали.
   */
  plain?: boolean;
  className?: string;
  /** БОКС РИСОВАНИЯ в CSS-пикселях (паддинги обёртки уже вычтены) — из него считается `u`. */
  hatchW?: number;
  hatchH?: number;
  /** Подпись для чтеца экрана; видимой подписи у пиктограммы нет — её несёт плитка. */
  label?: string;
}) {
  const uid = useId();
  const hatchable = (c: string | null): c is PieceClothState => !plain && isHatch(c);
  const pad = Math.max(picture.w, picture.h, 1) * 0.06;
  const box = { x: -pad, y: -pad, w: picture.w + 2 * pad, h: picture.h + 2 * pad };
  const px = Math.min(
    (hatchW && hatchW > 0 ? hatchW : BOX_FALLBACK.w) / box.w,
    (hatchH && hatchH > 0 ? hatchH : BOX_FALLBACK.h) / box.h,
  );
  const u = 1 / (px || 1);

  // Один паттерн на ткань на инстанс: id обязан быть уникален в документе (см. PieceShape).
  const states = [...new Set(picture.shapes.map((s) => s.cloth).filter(hatchable))];
  const idOf = (s: PieceClothState) => hatchId(`unit-${s}`, uid);

  const halo = { stroke: '#fff', strokeWidth: 3 * u, paintOrder: 'stroke' as const };

  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className={className ?? 'block h-full w-full'}
      role='img'
      aria-label={label ?? `unit pictogram, ${picture.pieceCount} pieces`}
    >
      {states.length > 0 && (
        <defs>
          {states.map((s) => (
            <Fragment key={s}>{clothPatternDefs(idOf(s), s, u)}</Fragment>
          ))}
        </defs>
      )}
      {picture.shapes.map((s) => {
        const points = ptsAttr(s.pts);
        const dash = s.hung ? { strokeDasharray: '3 2' } : null;
        return (
          <g key={s.pieceKey}>
            {/* Инлайновые style, не атрибуты: поверхности кроют потомков SILHOUETTE_INK, а CSS
                бьёт presentation-атрибуты (та же причина, что в PieceShape). */}
            <polygon
              points={points}
              style={{ fill: hatchable(s.cloth) ? '#fafafa' : '#dedede', stroke: 'none' }}
            />
            {hatchable(s.cloth) && (
              <polygon points={points} style={{ fill: `url(#${idOf(s.cloth)})`, stroke: 'none' }} />
            )}
            <polygon
              points={points}
              style={{ fill: 'none', stroke: '#fff', strokeWidth: 3 }}
              vectorEffect='non-scaling-stroke'
              strokeLinejoin='round'
            />
            <polygon
              points={points}
              style={{ fill: 'none', stroke: '#000', strokeWidth: 1, ...dash }}
              vectorEffect='non-scaling-stroke'
              strokeLinejoin='round'
            />
          </g>
        );
      })}
      {picture.shapes.map((s) => {
        const out: ReactElement[] = [];
        if (plain) return out;
        if (s.count > 1) {
          let x1 = -Infinity;
          let y0 = Infinity;
          for (const [x, y] of s.pts) {
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
          }
          out.push(
            <text
              key={`${s.pieceKey}-n`}
              x={Math.min(x1, picture.w)}
              y={Math.max(y0, 0) + BADGE_PX * u}
              textAnchor='end'
              style={{ fontSize: BADGE_PX * u, fontWeight: 700, fill: '#000', ...halo }}
            >
              ×{s.count}
            </text>,
          );
        }
        if (s.hung && s.mark)
          out.push(
            <text
              key={`${s.pieceKey}-h`}
              x={s.mark[0]}
              y={s.mark[1] + 0.35 * MARK_PX * u}
              textAnchor='middle'
              style={{ fontSize: MARK_PX * u, fontWeight: 700, fill: '#000', ...halo }}
            >
              ~
            </text>,
          );
        return out;
      })}
    </svg>
  );
});
