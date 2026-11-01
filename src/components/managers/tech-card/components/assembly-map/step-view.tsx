// STEP — the active operation reduced to its result, seam picture, exceptions, and sewn values.
import { isJoin, stepConfidence, type MapRead } from 'lib/assembly-skeleton/map';
import { edgesOf } from 'lib/assembly-skeleton/map/frame';
import { pieceKeyOf, resolveEdge } from 'lib/assembly-skeleton/union/layout';
import type { SeamCandidate } from 'lib/assembly-skeleton/types';
import { useMemo } from 'react';
import { Text } from 'ui';
import { useStepResults } from '../step-seams/step-result-context';
import type { StepResult } from '../step-seams/step-result';
import { StepPictureSvg, useCardGeoms } from '../step-seams/step-picture-view';
import { stepPictureOf, type SurfacePicture } from '../step-seams/surface-picture';
import { SewnStrip } from './sewn-strip';
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

function mismatchFacts(read: MapRead, seam: SeamCandidate): string[] {
  // A side sewn along several runs (upper + main front edge) is as long as all its runs.
  const lengthOf = (ids: readonly string[], evidence?: number) => {
    if (evidence != null) return evidence;
    const lens = ids.map((id) => resolveEdge(id, read.geoms)?.len);
    return lens.every((len) => len != null) ? lens.reduce((sum, len) => sum! + len!, 0)! : null;
  };
  const aIds = seam.aParts?.length ? seam.aParts : [seam.a];
  const bIds = seam.bParts?.length ? seam.bParts : [seam.b];
  const a = lengthOf(aIds, seam.evidence?.aLenMm);
  const b = lengthOf(bIds, seam.evidence?.bLenMm);
  const facts: string[] = [];
  if (a != null && b != null && Math.round(a) !== Math.round(b)) {
    facts.push(`${Math.round(a)} / ${Math.round(b)} mm`);
  }

  const notchCount = (id: string) => {
    const geom = read.geoms.get(pieceKeyOf(id));
    return geom ? edgesOf(id, geom).reduce((total, edge) => total + edge.notchesMm.length, 0) : 0;
  };
  const na = aIds.reduce((total, id) => total + notchCount(id), 0);
  const nb = bIds.reduce((total, id) => total + notchCount(id), 0);
  const matched =
    seam.evidence?.notchesMatched ??
    ((seam.evidence?.notchScore ?? 0) >= 0.7 ? Math.min(na, nb) : 0);
  if (na !== nb || (Math.min(na, nb) > 0 && matched < Math.min(na, nb))) {
    facts.push(`${na} / ${nb} notches`);
  }
  return facts;
}

export function StepView({ model, index }: { model: MapModel; index: number }) {
  const { read, ops, pieceName, unitName, isUnit } = model;
  const results = useStepResults();
  const picture = mapStepPictureOf(results, index);
  const { geoms, innerLines } = useCardGeoms();
  const op = ops[index];
  const marks = useMemo(
    () =>
      (read?.seams[index] ?? []).flatMap((seam) =>
        [
          ...(seam.aParts?.length ? seam.aParts : [seam.a]),
          ...(seam.bParts?.length ? seam.bParts : [seam.b]),
        ].map((id) => ({ id, tone: 'stored' as const })),
      ),
    [read, index],
  );
  if (!op) return null;

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
    ? [...new Set((read.seams[index] ?? []).flatMap((seam) => mismatchFacts(read, seam)))]
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
            marks={marks}
            names={inputNames}
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

      {facts.map((fact) => (
        <Text key={fact} size='micro' variant='errorLabel' data-map-fact=''>
          {fact}
        </Text>
      ))}

      <SewnStrip tiles={model.sewnOf(index)} />
    </div>
  );
}
