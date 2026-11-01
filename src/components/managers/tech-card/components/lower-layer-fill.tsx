import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import type { Pt2 } from 'lib/assembly-skeleton/types';
import { LOWER_LAYER_FILL } from 'lib/assembly-skeleton/union';
import { useId } from 'react';

const SCALE = 1_000;
const AREA_EPS = 1e-6;

export type LowerLayerShape = {
  key: string;
  ring: readonly Pt2[];
  path: string;
};

export type LowerLayerClaim = {
  key: string;
  depth: 1 | 2;
  coveredBy: readonly string[];
};

export type LowerLayerTint = LowerLayerClaim & {
  path: string;
  coverPaths: string[];
  partial: boolean;
};

const clipperPath = (ring: readonly Pt2[]): Path64 => {
  const path = new Path64();
  for (const [x, y] of ring) path.push(new Point64(Math.round(x * SCALE), Math.round(y * SCALE)));
  if (path.length >= 3 && !Clipper.isPositive(path)) path.reverse();
  return path;
};

const pathsOf = (paths: readonly Path64[]): Paths64 => {
  const result = new Paths64();
  paths.forEach((path) => result.push(path));
  return result;
};

const isPartialCover = (lower: readonly Pt2[], covers: readonly (readonly Pt2[])[]): boolean => {
  if (!covers.length) return false;
  const lowerPath = clipperPath(lower);
  if (lowerPath.length < 3) return false;
  const lowerArea = Math.abs(Clipper.area(lowerPath));
  if (lowerArea <= AREA_EPS) return false;
  const coverPaths = covers.map(clipperPath).filter((path) => path.length >= 3);
  if (!coverPaths.length) return true;
  const intersection = Clipper.Intersect(
    pathsOf([lowerPath]),
    pathsOf(coverPaths),
    FillRule.NonZero,
  );
  const coveredArea = Math.abs(Clipper.areaPaths(intersection));
  return lowerArea - coveredArea > Math.max(AREA_EPS, lowerArea * AREA_EPS);
};

/** Resolve the exact tint subset once; every owned-picture renderer consumes this result. */
export function lowerLayerTints(
  shapes: readonly LowerLayerShape[],
  claims: readonly LowerLayerClaim[],
): LowerLayerTint[] {
  const byKey = new Map(shapes.map((shape) => [shape.key, shape]));
  return claims.flatMap((claim) => {
    const lower = byKey.get(claim.key);
    if (!lower) return [];
    const covers = claim.coveredBy.flatMap((key) => {
      const shape = byKey.get(key);
      return shape ? [shape] : [];
    });
    return [
      {
        ...claim,
        path: lower.path,
        coverPaths: covers.map((shape) => shape.path),
        partial:
          covers.length < claim.coveredBy.length ||
          isPartialCover(
            lower.ring,
            covers.map((shape) => shape.ring),
          ),
      },
    ];
  });
}

/** Translucent lower-layer fills, clipped to the union of each piece's claimed covers. */
export function LowerLayerFills({ tints }: { tints: readonly LowerLayerTint[] }) {
  const pictureId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = (index: number) => `lower-layer-${pictureId}-${index}`;
  if (!tints.length) return null;

  return (
    <>
      {tints.some((tint) => tint.coveredBy.length > 0) && (
        <defs>
          {tints.map((tint, index) =>
            tint.coveredBy.length > 0 ? (
              <clipPath key={tint.key} id={clipId(index)} clipPathUnits='userSpaceOnUse'>
                {tint.coverPaths.map((path, coverIndex) => (
                  <path key={coverIndex} d={path} />
                ))}
              </clipPath>
            ) : null,
          )}
        </defs>
      )}
      <g stroke='none' pointerEvents='none'>
        {tints.flatMap((tint, index) => {
          const clipPath = tint.coveredBy.length ? `url(#${clipId(index)})` : undefined;
          return [
            <path
              key={`${tint.key}:1`}
              d={tint.path}
              fill={LOWER_LAYER_FILL}
              clipPath={clipPath}
              pointerEvents='none'
              data-lower-layer={tint.key}
              data-lower-partial={tint.partial ? '1' : undefined}
            />,
            tint.depth > 1 ? (
              <path
                key={`${tint.key}:2`}
                d={tint.path}
                fill={LOWER_LAYER_FILL}
                clipPath={clipPath}
                pointerEvents='none'
                data-lower-layer-depth='2'
                data-lower-partial={tint.partial ? '1' : undefined}
              />
            ) : null,
          ];
        })}
      </g>
    </>
  );
}
