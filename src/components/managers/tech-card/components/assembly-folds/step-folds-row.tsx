// «FOLDS» GROUP OF A STEP CARD (doll-folds T4, owner OK 01.11 «Inline» + «Thumb»): under the step's
// seams, the step's own pieces (its direct piece inputs). A folded piece shows as a row — flat
// thumbnail, folded thumbnail, small section, kind glyphs; `+ fold` opens the fold sheet on these
// pieces. Folds belong to the PIECE, not the step: the same piece reads the same in every step.

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button, GroupLabel, Text } from 'ui';
import type { FoundPiece } from '../nesting/dxf-geometry';
import type { TechCardFormData } from '../schema';
import { useStepSeams } from '../step-seams/step-seams-context';
import { foldGroupsOf, sizeOf } from './fold-model';
import { FlatThumb, FoldedThumb, KindIcon, SectionSvg } from './fold-picture';
import { FoldsSheet } from './fold-sheet';
import { useFoldRows } from './folds-store';

export function StepFoldsRow({ index }: { index: number }) {
  const ctx = useStepSeams();
  const geo = ctx?.geometry;
  const inputKeys = useWatch<TechCardFormData>({ name: `operations.${index}.inputKeys` }) as
    | string[]
    | undefined;
  const styleNumber = (useWatch<TechCardFormData>({ name: 'styleNumber' }) ?? '') as string;
  const name = (useWatch<TechCardFormData>({ name: 'name' }) ?? '') as string;
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

  if (!ctx || !geo || !pieces.length) return null;
  return (
    <StepFoldsGroup
      stepKey={index}
      pieces={pieces}
      shapes={geo.shapes.shapeByKey}
      grainDeg={geo.grainDeg}
      cardId={ctx.cardId}
      frozen={ctx.frozen}
      title={styleNumber.trim() || name.trim() || 'this card'}
    />
  );
}

/** The group itself, from plain values (the step row above, a probe). */
export function StepFoldsGroup({
  stepKey,
  pieces,
  shapes,
  grainDeg,
  cardId,
  frozen,
  title,
}: {
  stepKey: number | string;
  pieces: readonly PieceGeom[];
  shapes: ReadonlyMap<string, FoundPiece | null> | null;
  grainDeg: ReadonlyMap<string, number>;
  cardId: number | undefined;
  frozen: boolean;
  title: string;
}) {
  const rows = useFoldRows();
  const [open, setOpen] = useState<string | null>(null);
  const size = useMemo(() => sizeOf(shapes), [shapes]);
  const folded = useMemo(
    () =>
      pieces
        .map((g) => {
          const deg = grainDeg.get(g.pieceKey) ?? 0;
          return { g, deg, groups: foldGroupsOf(g, rows, deg).groups };
        })
        .filter((x) => x.groups.length > 0),
    [pieces, rows, grainDeg],
  );

  if (!pieces.length) return null;
  return (
    <div className='flex flex-col' data-step-folds={stepKey}>
      <GroupLabel
        action={
          <Button
            type='button'
            variant='underline'
            size='xs'
            onClick={() => setOpen(pieces[0].pieceKey)}
            data-step-folds-open=''
          >
            + fold
          </Button>
        }
      >
        folds
      </GroupLabel>
      {folded.length > 0 && (
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5'>
          {folded.map(({ g, deg, groups }) => (
            <Button
              key={g.pieceKey}
              onClick={() => setOpen(g.pieceKey)}
              className='flex items-center gap-1.5 text-left'
              data-step-fold-piece={g.name}
            >
              <FlatThumb piece={g} deg={deg} groups={groups} hints={[]} />
              <FoldedThumb piece={g} deg={deg} groups={groups} />
              <SectionSvg piece={g} groups={groups} />
              <span className='flex flex-col gap-0.5'>
                <Text size='micro' component='span' className='uppercase'>
                  {g.name}
                </Text>
                <span className='flex items-center gap-1'>
                  {groups.map((x, i) => (
                    <KindIcon key={i} kind={x.kind} size={12} />
                  ))}
                </span>
              </span>
            </Button>
          ))}
        </div>
      )}
      {open && (
        <FoldsSheet
          open
          onClose={() => setOpen(null)}
          cardId={cardId}
          frozen={frozen}
          title={title}
          size={size}
          pieces={pieces}
          shapes={shapes}
          grainDeg={grainDeg}
          initialKey={open}
        />
      )}
    </div>
  );
}
