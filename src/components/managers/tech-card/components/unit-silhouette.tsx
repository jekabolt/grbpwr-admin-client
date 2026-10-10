// ПИКТОГРАММА УЗЛА ПРИ ЕГО ИМЕНИ — плитка и глиф, близнецы `PieceTile` / `PieceSilhouette`.
//
// Данные приезжают СВЕРХУ одним контекстом: карта «ключ узла → UnionPicture», которую соберёт
// каркас (полоса B) из графа швов (полоса A). Сегодня её не поставляет никто, `useUnitPicture`
// отдаёт null, и каждая поверхность, куда врезан глиф (шапка бокса узла, полка по узлам, шапка
// узла в рельсе), рисуется байт-в-байт как раньше. Контекст, а не проп, потому что эти поверхности
// живут в трёх разных деревьях (полотно, полка, рельс) и пропу пришлось бы пройти пять слоёв ради
// данных, которых пока нет.
import type { UnionPicture } from 'lib/assembly-skeleton/union';
import { cn } from 'lib/utility';
import { createContext, useContext, type ReactNode } from 'react';
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

export function useUnitPicture(unitKey: string | null | undefined): UnionPicture | null {
  const map = useContext(UnitPicturesContext);
  if (!map || !unitKey) return null;
  const p = map.get(unitKey);
  return p && p.shapes.length > 0 ? p : null;
}

// Паддинги обёртки — те же, что у PieceTile (`p-1 pb-3.5`): 4+4 и 4+14.
const TILE_PAD_X = 8;
const TILE_PAD_Y = 18;

const names = (keys: readonly string[], nameOf?: (k: string) => string) =>
  keys.map((k) => nameOf?.(k) || k).join(' + ');

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
      lines.push(`×${s.count} layers drawn as one: ${nameOf?.(s.pieceKey) || s.pieceKey}`);
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
        'relative flex size-14 shrink-0 items-center justify-center overflow-hidden bg-bgZebra',
        className,
      )}
    >
      <span className='flex size-full items-center justify-center p-1 pb-3.5'>
        <UnitShape
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
  if (!picture) return null;
  const title = unitShapeTitle(name, picture);
  return (
    <span title={title} className={cn('mr-1.5 inline-flex h-7 w-10 shrink-0', boxClassName)}>
      <UnitShape picture={picture} plain label={title} />
    </span>
  );
}
