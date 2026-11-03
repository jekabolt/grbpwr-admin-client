// «FOLDS» GROUP OF A STEP CARD (doll-folds T4, owner OK 01.11 «Inline» + «Thumb»): under the step's
// seams, one tile per piece of the step (its direct piece inputs) — flat thumbnail, and once folded
// the folded thumbnail + its small section + kind glyphs; a dashed glyph when the pattern has a fold
// hint nobody took yet. A tap opens the fold picker in place under the row, on that piece. Folds
// belong to the PIECE, not the step: the same piece reads the same in every step.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Close, GroupLabel, Text, Tile, TILE_QUIET } from 'ui';
import type { FoundPiece } from '../nesting/dxf-geometry';
import type { TechCardFormData } from '../schema';
import { useStepSeams } from '../step-seams/step-seams-context';
import { sizeOf } from './fold-model';
import { FlatThumb, FoldedThumb } from './fold-picture';
import { FoldPicker, usePieceReads } from './fold-picker';
import { useFoldsStore } from './folds-store';
import { useFoldWrites } from './use-fold-writes';

const FOLD_CLOSE = cn(
  'absolute top-0 right-0 z-10 size-7 bg-bgColor p-0 [@media(pointer:coarse)]:size-11',
  TILE_QUIET,
);

export function StepFoldsRow({ index }: { index: number }) {
  const ctx = useStepSeams();
  const geo = ctx?.geometry;
  const inputKeys = useWatch<TechCardFormData>({ name: `operations.${index}.inputKeys` }) as
    | string[]
    | undefined;
  const pieces = useMemo(() => {
    const out: PieceGeom[] = [];
    const seen = new Set<string>();
    for (const raw of inputKeys ?? []) {
      const k = raw.trim();
      const g = geo?.pieces.get(k)?.geom;
      if (!g || seen.has(k) || g.rs.length < 3) continue;
      seen.add(k);
      out.push(g);
    }
    return out;
  }, [inputKeys, geo?.pieces]);
  const innerLines = useMemo(() => {
    const out = new Map<string, Pt2[][]>();
    for (const raw of inputKeys ?? []) {
      const key = raw.trim();
      const piece = geo?.pieces.get(key);
      if (!piece) continue;
      out.set(
        key,
        piece.inner.map((line) => line.map(([x, y]) => [x, -y])),
      );
    }
    return out;
  }, [inputKeys, geo?.pieces]);

  if (!ctx || !geo || !pieces.length) return null;
  return (
    <StepFoldsGroup
      stepKey={index}
      pieces={pieces}
      shapes={geo.shapes.shapeByKey}
      grainDeg={geo.grainDeg}
      innerLines={innerLines}
      cardId={ctx.cardId}
      frozen={ctx.frozen}
    />
  );
}

/** The group itself, from plain values (the step row above, a probe). */
export function StepFoldsGroup({
  stepKey,
  pieces,
  shapes,
  grainDeg,
  innerLines,
  cardId,
  frozen,
}: {
  stepKey: number | string;
  pieces: readonly PieceGeom[];
  shapes: ReadonlyMap<string, FoundPiece | null> | null;
  grainDeg: ReadonlyMap<string, number>;
  innerLines?: ReadonlyMap<string, readonly Pt2[][]>;
  cardId: number | undefined;
  frozen: boolean;
}) {
  const reads = usePieceReads(pieces, shapes, grainDeg, innerLines);
  const [open, setOpen] = useState<string | null>(null);
  const size = useMemo(() => sizeOf(shapes), [shapes]);
  const openRead = reads.find((r) => r.geom.pieceKey === open) ?? null;
  const writes = useFoldWrites(cardId, frozen);
  const pendingWrites = useFoldsStore((state) => state.pending);

  if (!reads.length) return null;
  return (
    <div className='flex flex-col' data-step-folds={stepKey}>
      <GroupLabel>folds</GroupLabel>
      <div className='flex flex-wrap items-start gap-x-4 gap-y-2'>
        {reads.map((r) => {
          const on = r.geom.pieceKey === open;
          const isFolded = r.groups.length > 0;
          const rows = r.groups.flatMap((group) => group.rows);
          const writing = rows.some((row) => !!pendingWrites[row.foldKey]);
          return (
            <div
              key={r.geom.pieceKey}
              className='group relative size-18'
              data-step-fold-piece={r.geom.name}
            >
              <Tile
                onClick={() => setOpen(on ? null : r.geom.pieceKey)}
                pressed={on}
                selected={on}
                className={cn(
                  'items-center overflow-hidden p-1',
                  on && 'border-textColor bg-textColor text-bgColor [&_svg]:invert',
                )}
              >
                <span className='flex h-12 items-center justify-center'>
                  {isFolded ? (
                    <FoldedThumb piece={r.geom} deg={r.deg} groups={r.groups} />
                  ) : (
                    <FlatThumb
                      piece={r.geom}
                      deg={r.deg}
                      inner={r.inner}
                      groups={r.groups}
                      hints={[]}
                    />
                  )}
                </span>
                <Text
                  size='micro'
                  component='span'
                  tracking='label'
                  variant={on ? 'selected' : 'uppercase'}
                  className='mt-0.5 w-full truncate text-center leading-tight'
                >
                  {r.geom.name}
                </Text>
              </Tile>
              {isFolded && (
                <Close
                  aria-label={`remove folds ${r.geom.name}`}
                  disabled={frozen || writing}
                  onClick={() => {
                    if (on) setOpen(null);
                    void writes.remove(rows);
                  }}
                  className={FOLD_CLOSE}
                />
              )}
            </div>
          );
        })}
      </div>
      {openRead && (
        <FoldPicker
          key={openRead.geom.pieceKey}
          read={openRead}
          cardId={cardId}
          frozen={frozen}
          size={size}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
