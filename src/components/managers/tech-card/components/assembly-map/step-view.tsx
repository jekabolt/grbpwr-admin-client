// STEP — the active operation reduced to its result, seam picture, exceptions, and sewn values.
import { isJoin, stepConfidence, type MapRead } from 'lib/assembly-skeleton/map';
import { edgesOf } from 'lib/assembly-skeleton/map/frame';
import { pieceKeyOf, resolveEdge } from 'lib/assembly-skeleton/union/layout';
import type { SeamCandidate } from 'lib/assembly-skeleton/types';
import { activeFoldRows, type StoredFold } from 'lib/folds';
import { candidateSideParts } from 'lib/seams';
import { Text } from 'ui';
import { useFoldRows } from '../assembly-folds/folds-store';
import { seamLengthsDiffer } from '../cut-strips/length-check';
import { stepHighlightOf } from '../step-seams/step-highlight';
import { useStepResults } from '../step-seams/step-result-context';
import type { StepResult } from '../step-seams/step-result';
import { StepPictureSvg, useCardGeoms, useSeamRows } from '../step-seams/step-picture-view';
import {
  DEFAULT_SEAM_TOLERANCE_MM,
  seamToleranceOf,
  sideLengthMm,
} from '../step-seams/seam-length';
import { stepPictureOf, type SurfacePicture } from '../step-seams/surface-picture';
import { SewnStrip } from './sewn-strip';
import { StepFoldThumbs } from './step-fold-thumbs';
import type { MapModel } from './use-map-model';

/** Inner width of the 320px column after the block padding and outline. */
export const MAP_W = 286;
const PIC_H = 230;

const num = (i: number) => (i + 1) * 10;

/** The ASSEMBLY MAP uses the same selector as every other step surface. */
export const mapStepPictureOf = (
  results: readonly StepResult[] | null | undefined,
  index: number,
): SurfacePicture | null => stepPictureOf(results, index);

export function mismatchFacts(
  read: MapRead,
  seam: SeamCandidate,
  activeFolds: readonly StoredFold[] = [],
  grainDeg?: ReadonlyMap<string, number>,
  toleranceMm: number = DEFAULT_SEAM_TOLERANCE_MM,
): string[] {
  const aParts = candidateSideParts(seam, 'a', read.geoms);
  const bParts = candidateSideParts(seam, 'b', read.geoms);
  const plainLengthOf = (parts: typeof aParts) =>
    parts.every((part) => resolveEdge(part.target, read.geoms))
      ? sideLengthMm(parts, read.geoms, () => 0)
      : null;
  const aPlain = plainLengthOf(aParts);
  const bPlain = plainLengthOf(bParts);
  /** The side's length once its plies lie on each other; null when no active fold changes it. */
  const foldedOf = (parts: typeof aParts, plain: number | null, other: number | null) => {
    if (!activeFolds.length || plain == null) return null;
    const folded = sideLengthMm(parts, read.geoms, () => 0, {
      activeFolds,
      otherSideMm: other,
      grainDeg,
    });
    return folded !== plain ? folded : null;
  };
  const aFolded = foldedOf(aParts, aPlain, bPlain);
  const bFolded = foldedOf(bParts, bPlain, aPlain);
  // Without a fold event, evidence remains the first and byte-identical answer.
  const a = aFolded ?? seam.evidence?.aLenMm ?? aPlain;
  const b = bFolded ?? seam.evidence?.bLenMm ?? bPlain;
  const facts: string[] = [];
  const piecesOf = (parts: typeof aParts) => [
    ...new Set(parts.map((part) => pieceKeyOf(part.target))),
  ];
  if (
    a != null &&
    b != null &&
    seamLengthsDiffer(a, b, piecesOf(aParts), piecesOf(bParts), read.geoms, toleranceMm)
  ) {
    facts.push(`length ${Math.round(a)} / ${Math.round(b)} mm`);
  }

  const notchCount = (part: (typeof aParts)[number]) => {
    const geom = read.geoms.get(pieceKeyOf(part.target));
    if (!geom) return 0;
    let at = 0;
    return edgesOf(part.target, geom).reduce((total, edge) => {
      const from = part.range ? Math.max(0, part.range[0] - at) : 0;
      const to = part.range ? Math.min(edge.lenMm, part.range[1] - at) : edge.lenMm;
      at += edge.lenMm;
      if (to <= from) return total;
      return total + edge.notchesMm.filter((notch) => notch > from + 3 && notch < to - 3).length;
    }, 0);
  };
  // Folded plies sew as one: a notch cut in one ply only is not a notch of this seam.
  const notchesOf = (parts: typeof aParts, folded: number | null) =>
    folded != null
      ? Math.min(...parts.map(notchCount))
      : parts.reduce((total, part) => total + notchCount(part), 0);
  const na = notchesOf(aParts, aFolded);
  const nb = notchesOf(bParts, bFolded);
  const matched =
    seam.evidence?.notchesMatched ??
    ((seam.evidence?.notchScore ?? 0) >= 0.7 ? Math.min(na, nb) : 0);
  if (na !== nb || (Math.min(na, nb) > 0 && matched < Math.min(na, nb))) {
    facts.push(`notches ${na} / ${nb}`);
  }
  return facts;
}

export function StepView({ model, index }: { model: MapModel; index: number }) {
  const { read, ops, pieceName, unitName, isUnit } = model;
  const results = useStepResults();
  const picture = mapStepPictureOf(results, index);
  const { geo, geoms, innerLines } = useCardGeoms();
  const byKey = useSeamRows();
  const foldRows = useFoldRows();
  const activeFolds = activeFoldRows(ops, index, foldRows);
  const op = ops[index];
  if (!op) return null;
  const highlight = stepHighlightOf(ops, index, byKey);

  const inputs = (op.inputKeys ?? []).filter(Boolean);
  const nameOf = (key: string) => (isUnit(key) ? unitName(key) : pieceName(key));
  const join = read ? isJoin(read, index) : inputs.length > 1;
  const output = (op.outputUnitKey ?? '').trim();
  const heading = join
    ? output
      ? unitName(output)
      : inputs[0]
        ? nameOf(inputs[0])
        : ''
    : inputs[0]
      ? nameOf(inputs[0])
      : output
        ? unitName(output)
        : '';
  const unsure = join && (!read || stepConfidence(read, index) !== 'sure');
  const inputNames = inputs.map(nameOf);
  const fallbackNames = [...new Set(inputNames)];
  const facts = read
    ? [
        ...new Set(
          (read.seams[index] ?? []).flatMap((seam) =>
            mismatchFacts(read, seam, activeFolds, geo?.grainDeg, seamToleranceOf(op.seamToleranceMm)),
          ),
        ),
      ]
    : [];
  const drawn = !!picture && picture.layout.T.size > 0;

  return (
    <div className='flex flex-col gap-1.5' data-map-step={index}>
      <div className='grid grid-cols-[auto_1fr_auto] items-baseline gap-2'>
        <Text size='stat' component='span' data-map-step-number>
          {num(index)}
        </Text>
        <Text size='control' component='span' className='min-w-0 truncate'>
          {heading}
        </Text>
        {unsure && (
          <Text size='micro' variant='errorLabel' component='span'>
            check
          </Text>
        )}
      </div>

      <div
        className='flex items-center justify-center bg-pageBg'
        style={{ height: drawn ? PIC_H : undefined, minHeight: drawn ? undefined : 120 }}
        role={drawn ? 'img' : undefined}
        aria-label={drawn ? `step ${num(index)}: ${inputNames.join(', ')}` : undefined}
        data-map-step-picture={drawn ? '' : undefined}
      >
        {drawn ? (
          <StepPictureSvg
            w={MAP_W}
            h={PIC_H}
            pad={8}
            look='tile'
            layout={picture.layout}
            layers={picture.layers}
            geoms={geoms}
            innerLines={innerLines}
            stepEdges={highlight.targets}
            stepParts={highlight.parts}
            names={inputNames}
            foldGhost
          />
        ) : (
          <div className='flex flex-wrap items-center justify-center gap-2 p-2' data-map-names=''>
            {fallbackNames.map((name) => (
              <Text key={name} size='micro' component='span' className='min-w-0 truncate'>
                {name}
              </Text>
            ))}
          </div>
        )}
      </div>

      <StepFoldThumbs ops={ops} index={index} />

      {facts.map((fact) => (
        <Text key={fact} size='micro' variant='errorLabel' data-map-fact=''>
          {fact}
        </Text>
      ))}

      <SewnStrip tiles={model.sewnOf(index)} />
    </div>
  );
}
