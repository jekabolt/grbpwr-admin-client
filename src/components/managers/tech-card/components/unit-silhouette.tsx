// ПИКТОГРАММА УЗЛА ПРИ ЕГО ИМЕНИ — плитка и глиф, близнецы `PieceTile` / `PieceSilhouette`.
//
// Данные приезжают СВЕРХУ одним контекстом: карта «ключ узла → UnionPicture», которую соберёт
// каркас (полоса B) из графа швов (полоса A). Сегодня её не поставляет никто, `useUnitPicture`
// отдаёт null, и каждая поверхность, куда врезан глиф (шапка бокса узла, полка по узлам, шапка
// узла в рельсе), рисуется байт-в-байт как раньше. Контекст, а не проп, потому что эти поверхности
// живут в трёх разных деревьях (полотно, полка, рельс) и пропу пришлось бы пройти пять слоёв ради
// данных, которых пока нет.
import { levelFill, type UnionPicture } from 'lib/assembly-skeleton/union';
import { cn } from 'lib/utility';
import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import { fmtCm } from './nesting/dxf-geometry';
import { UnitShape } from './nesting/unit-shape';
import { TILE_BOX } from './piece-silhouette';

const UnitPicturesContext = createContext<ReadonlyMap<string, UnionPicture> | null>(null);

/** Карта пиктограмм узлов по ключу узла. Без провайдера — ни одной пиктограммы. */
export function UnitPicturesProvider({
  pictures,
  children,
}: {
  pictures: ReadonlyMap<string, UnionPicture> | null;
  children: ReactNode;
}) {
  return <UnitPicturesContext.Provider value={pictures}>{children}</UnitPicturesContext.Provider>;
}

/** Вся карта целиком — для печати, где пиктограммы ищут по ключу вне React-дерева листа. */
export function useUnitPictures(): ReadonlyMap<string, UnionPicture> | null {
  return useContext(UnitPicturesContext);
}

const UnitPieceNamesContext = createContext<ReadonlyMap<string, string> | null>(null);

/** Коды деталей карточки для подсказки глифа: глиф стоит глубже всех, кто их знает. */
export function UnitPieceNamesProvider({
  names,
  children,
}: {
  names: ReadonlyMap<string, string> | null;
  children: ReactNode;
}) {
  return <UnitPieceNamesContext.Provider value={names}>{children}</UnitPieceNamesContext.Provider>;
}

export function useUnitPicture(unitKey: string | null | undefined): UnionPicture | null {
  const map = useContext(UnitPicturesContext);
  if (!map || !unitKey) return null;
  const p = map.get(unitKey);
  return p && p.shapes.length > 0 ? p : null;
}

// Паддинги обёртки — те же, что у PieceTile (`p-1 pb-3.5`): 4+4 и 4+14.
const TILE_PAD_X = 8;
const TILE_PAD_Y = 18;
const TWIN_BADGE_PX = 10;

const shapePoints = (points: readonly [number, number][]) =>
  points.map(([x, y]) => `${x},${y}`).join(' ');

const insideRing = ([x, y]: readonly [number, number], ring: readonly [number, number][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** A shape-relative lower-right point; the label itself remains in a pixel-coordinate SVG. */
const twinLabelSpot = (ring: readonly [number, number][]) => {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  const candidates = Array.from({ length: 9 }, (_, yi) =>
    Array.from(
      { length: 9 },
      (_, xi) => [x0 + w * (0.9 - xi * 0.1), y0 + h * (0.9 - yi * 0.1)] as const,
    ),
  ).flat();
  return candidates.find((point) => insideRing(point, ring)) ?? ring[0] ?? ([x0, y0] as const);
};

/** Owner-result graph drawing. Legacy unit pictures continue through UnitShape unchanged. */
function LowerLayerUnitShape({
  picture,
  className,
  label,
  plain,
}: ComponentProps<typeof UnitShape>) {
  const lower = useMemo(() => new Set(picture.lowerLayers ?? []), [picture.lowerLayers]);
  const pad = Math.max(picture.w, picture.h, 1) * 0.06;
  const box = { x: -pad, y: -pad, w: picture.w + 2 * pad, h: picture.h + 2 * pad };
  const bases = useMemo(
    () => picture.shapes.filter((shape) => lower.has(shape.pieceKey)),
    [lower, picture.shapes],
  );
  const twinLabels = bases
    .flatMap((shape) => {
      const number = picture.twinLabels?.[shape.pieceKey];
      return number ? [{ number, at: twinLabelSpot(shape.pts) }] : [];
    })
    .sort((left, right) => left.number - right.number);
  const lastTwin = twinLabels.at(-1)?.number ?? 0;
  const levelOf = (shape: { pieceKey: string }) => picture.levels?.[shape.pieceKey] ?? 0;

  return (
    <span
      className={cn('relative block h-full w-full', className)}
      role='img'
      aria-label={label ?? `unit pictogram, ${picture.pieceCount} pieces`}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className='block h-full w-full'
        aria-hidden='true'
      >
        {picture.shapes.map((shape) => (
          <polygon
            key={shape.pieceKey}
            points={shapePoints(shape.pts)}
            fill={levelFill(levelOf(shape))}
            stroke='none'
            data-piece-level={levelOf(shape) || undefined}
            data-lower-layer-base={lower.has(shape.pieceKey) ? shape.pieceKey : undefined}
          />
        ))}
        <g
          fill='none'
          stroke='var(--color-textColor)'
          strokeWidth={1}
          strokeLinejoin='round'
          pointerEvents='none'
        >
          {picture.shapes.map((shape) => {
            const runs = picture.lowerLayerRuns?.[shape.pieceKey];
            return (
              <g key={shape.pieceKey}>
                {runs ? (
                  <>
                    {runs.visible.map((run, index) => (
                      <polyline
                        key={index}
                        points={shapePoints(run)}
                        vectorEffect='non-scaling-stroke'
                        data-lower-layer-outline={shape.pieceKey}
                      />
                    ))}
                    {runs.hidden.map((run, index) => (
                      <polyline
                        key={index}
                        points={shapePoints(run)}
                        strokeDasharray='3 2'
                        vectorEffect='non-scaling-stroke'
                        data-lower-layer-hidden={shape.pieceKey}
                      />
                    ))}
                  </>
                ) : (
                  <polygon points={shapePoints(shape.pts)} vectorEffect='non-scaling-stroke' />
                )}
                {!plain &&
                  (runs?.lines ?? shape.lines).map((line, index) => (
                    <polyline
                      key={index}
                      points={shapePoints(line)}
                      strokeWidth={0.6}
                      vectorEffect='non-scaling-stroke'
                    />
                  ))}
              </g>
            );
          })}
        </g>
      </svg>
      {twinLabels.length > 0 && (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='100%'
          height='100%'
          className='pointer-events-none absolute inset-0 block overflow-visible'
          aria-hidden='true'
        >
          {twinLabels.map(({ number, at }) => (
            <text
              key={number}
              x={`${((at[0] - box.x) / box.w) * 100}%`}
              y={`${((at[1] - box.y) / box.h) * 100}%`}
              dx={-2 - (lastTwin - number) * 3}
              dy={-2 - (lastTwin - number) * 3}
              textAnchor='end'
              fill='var(--color-textColor)'
              stroke='var(--color-bgColor)'
              strokeWidth={3}
              paintOrder='stroke'
              fontSize={TWIN_BADGE_PX}
              fontWeight={700}
              data-twin-number={number}
            >
              {number}
            </text>
          ))}
        </svg>
      )}
    </span>
  );
}

function UnitPictureShape(props: ComponentProps<typeof UnitShape>) {
  return props.picture.lowerLayerRuns || Object.keys(props.picture.twinLabels ?? {}).length ? (
    <LowerLayerUnitShape {...props} />
  ) : (
    <UnitShape {...props} />
  );
}

// The key is an internal id: a piece without a name is said in words, never by its key.
const pieceWord = (k: string, nameOf?: (k: string) => string) => nameOf?.(k) || 'unnamed piece';

const names = (keys: readonly string[], nameOf?: (k: string) => string) =>
  keys.map((k) => pieceWord(k, nameOf)).join(' + ');

/**
 * Подпись пиктограммы: узел · число деталей · габарит, и словами всё, что знаки только намечают —
 * какие слои сложены в «×n», что висит на «~», что показано отдельно и что продублировано.
 */
export function unitShapeTitle(
  name: string,
  p: UnionPicture,
  nameOf?: (pieceKey: string) => string,
): string {
  const n = p.pieceCount;
  const lines = [
    `${name} · ${n} ${n === 1 ? 'piece' : 'pieces'} · ${fmtCm(p.w / 10)}×${fmtCm(p.h / 10)} cm`,
  ];
  for (const s of p.shapes)
    if (s.count > 1)
      lines.push(`×${s.count} layers drawn as one: ${pieceWord(s.pieceKey, nameOf)}`);
  const hung = p.shapes.filter((s) => s.hung).map((s) => s.pieceKey);
  if (hung.length) lines.push(`~ hung on a 3D seam, drawn beside it: ${names(hung, nameOf)}`);
  const top = p.shapes.filter((s) => s.surface).map((s) => s.pieceKey);
  if (top.length) lines.push(`sewn on top: ${names(top, nameOf)}`);
  if (p.overflow.length) lines.push(`not drawn, would overlap: ${names(p.overflow, nameOf)}`);
  if (p.underlay.length) lines.push(`fused underneath: ${names(p.underlay, nameOf)}`);
  return lines.join('\n');
}

/**
 * ПЛИТКА УЗЛА — квадрат 56px по образцу `PieceTile`: детали узла, состыкованные по швам, со
 * штриховкой своих тканей, и имя полосой по низу. Детали, которые не легли без наложения, не
 * рисуются — их число стоит в углу («+2»), имена в подсказке.
 */
export function UnitTile({
  picture,
  name,
  className,
  nameOf,
  pxBox = TILE_BOX,
}: {
  picture: UnionPicture;
  name: string;
  className?: string;
  nameOf?: (pieceKey: string) => string;
  /** ВНЕШНИЙ бокс плитки в CSS-пикселях; паддинги вычитаются здесь, как у PieceTile. */
  pxBox?: { w: number; h: number };
}) {
  const title = unitShapeTitle(name, picture, nameOf);
  return (
    <span
      title={title}
      className={cn(
        'relative flex size-14 shrink-0 items-center justify-center overflow-hidden bg-pageBg',
        className,
      )}
    >
      <span className='flex size-full items-center justify-center p-1 pb-3.5'>
        <UnitPictureShape
          picture={picture}
          hatchW={Math.max(1, pxBox.w - TILE_PAD_X)}
          hatchH={Math.max(1, pxBox.h - TILE_PAD_Y)}
          label={title}
        />
      </span>
      {picture.overflow.length > 0 && (
        <span className='absolute top-0 right-0 bg-bgColor/80 px-0.5 text-nano leading-[1.35] tracking-pill text-labelColor tabular-nums'>
          +{picture.overflow.length}
        </span>
      )}
      <span className='absolute inset-x-0 bottom-0 truncate bg-bgColor/80 px-0.5 text-center text-nano leading-[1.35] tracking-pill uppercase'>
        {name}
      </span>
    </span>
  );
}

/**
 * ГЛИФ УЗЛА при его ключе — шапка бокса, полка, рельс. Только формы, без штриховки и знаков (на
 * 16–28px они шум); подсказка — та же, что у плитки. Нет пиктограммы — нет и спана.
 */
export function UnitGlyph({
  picture,
  name,
  boxClassName,
}: {
  picture: UnionPicture | null;
  name: string;
  boxClassName?: string;
}) {
  const pieceNames = useContext(UnitPieceNamesContext);
  if (!picture) return null;
  const title = unitShapeTitle(name, picture, (k) => pieceNames?.get(k) ?? '');
  return (
    <span title={title} className={cn('mr-1.5 inline-flex h-7 w-10 shrink-0', boxClassName)}>
      <UnitPictureShape picture={picture} plain label={title} />
    </span>
  );
}
