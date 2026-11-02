// «FOLDS» GROUP OF A STEP CARD (doll-folds T4, owner OK 01.11 «Inline» + «Thumb»): under the step's
// seams, one tile per piece of the step (its direct piece inputs) — flat thumbnail, and once folded
// the folded thumbnail + its small section + kind glyphs; a dashed glyph when the pattern has a fold
// hint nobody took yet. A tap opens the fold picker in place under the row, on that piece. Folds
// belong to the PIECE, not the step: the same piece reads the same in every step.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button, GroupLabel, Text } from 'ui';
import type { FoundPiece } from '../nesting/dxf-geometry';
import type { TechCardFormData } from '../schema';
import { useStepSeams } from '../step-seams/step-seams-context';
import { sizeOf } from './fold-model';
import { FlatThumb, FoldedThumb, HintIcon, KindIcon, SectionSvg } from './fold-picture';
import { FoldPicker, usePieceReads } from './fold-picker';

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

  if (!reads.length) return null;
  return (
    <div className='flex flex-col' data-step-folds={stepKey}>
      <GroupLabel>folds</GroupLabel>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5'>
        {reads.map((r) => {
          const on = r.geom.pieceKey === open;
          const isFolded = r.groups.length > 0;
          return (
            <Button
              key={r.geom.pieceKey}
              onClick={() => setOpen(on ? null : r.geom.pieceKey)}
              aria-pressed={on}
              className={cn(
                'flex items-center gap-1.5 border-b-2 pb-0.5 text-left',
                on ? 'border-textColor' : 'border-transparent',
              )}
              data-step-fold-piece={r.geom.name}
            >
              <FlatThumb
                piece={r.geom}
                deg={r.deg}
                inner={r.inner}
                groups={r.groups}
                hints={r.hints}
              />
              {isFolded && (
                <>
                  <FoldedThumb piece={r.geom} deg={r.deg} groups={r.groups} />
                  <SectionSvg piece={r.geom} groups={r.groups} />
                </>
              )}
              <span className='flex flex-col gap-0.5'>
                <Text
                  size='micro'
                  component='span'
                  className={cn('uppercase', !on && !isFolded && 'text-labelColor')}
                >
                  {r.geom.name}
                </Text>
                <span className='flex items-center gap-1'>
                  {isFolded
                    ? r.groups.map((x, i) => <KindIcon key={i} kind={x.kind} size={12} />)
                    : r.hints.some((h) => h.origin !== 'inner') && (
                        <span className='text-labelColor'>
                          <HintIcon size={12} />
                        </span>
                      )}
                </span>
              </span>
            </Button>
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
