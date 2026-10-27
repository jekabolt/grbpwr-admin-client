// STEP — the active operation reduced to its result, seam picture, exceptions, and sewn values.
import { isJoin, pairPicture, stepConfidence, type MapRead } from 'lib/assembly-skeleton/map';
import { edgesOf } from 'lib/assembly-skeleton/map/frame';
import { pieceKeyOf, resolveEdge } from 'lib/assembly-skeleton/union/layout';
import type { SeamCandidate } from 'lib/assembly-skeleton/types';
import { useMemo } from 'react';
import { Text } from 'ui';
import { PairShape } from './pair-shape';
import { SewnStrip } from './sewn-strip';
import type { MapModel } from './use-map-model';

/** Inner width of the 320px column after the block padding and outline. */
export const MAP_W = 286;
const PIC_H = 230;

const num = (i: number) => (i + 1) * 10;

function mismatchFacts(read: MapRead, seam: SeamCandidate): string[] {
  const lengthOf = (id: string, evidence?: number) =>
    evidence ?? resolveEdge(id, read.geoms)?.len ?? null;
  const a = lengthOf(seam.a, seam.evidence?.aLenMm);
  const b = lengthOf(seam.b, seam.evidence?.bLenMm);
  const facts: string[] = [];
  if (a != null && b != null && Math.round(a) !== Math.round(b)) {
    facts.push(`${Math.round(a)} / ${Math.round(b)} mm`);
  }

  const notchCount = (id: string) => {
    const geom = read.geoms.get(pieceKeyOf(id));
    return geom ? edgesOf(id, geom).reduce((total, edge) => total + edge.notchesMm.length, 0) : 0;
  };
  const na = notchCount(seam.a);
  const nb = notchCount(seam.b);
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
  const op = ops[index];
  const picture = useMemo(() => (read ? pairPicture(read, index) : null), [read, index]);
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
        style={{ height: picture ? PIC_H : undefined, minHeight: picture ? undefined : 120 }}
      >
        {picture ? (
          <PairShape
            picture={picture}
            names={inputNames}
            boxW={MAP_W}
            boxH={PIC_H}
            label={`step ${num(index)}: ${inputNames.join(', ')}`}
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
