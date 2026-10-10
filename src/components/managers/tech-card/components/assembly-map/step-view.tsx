// STEP — один шаг крупно: что с чем сшивают, какой кромкой, сколько надсечек, туго или посадкой, и во
// что результат идёт дальше (§4 zone 3). Вид по умолчанию: без выбора — первый машинный шаг (D2).
import type {
  common_TechCardGarmentZone,
  common_TechCardMachineType,
  common_TechCardOperationType,
} from 'api/proto-http/admin';
import {
  isJoin,
  pairPicture,
  pieceFamilies,
  seamWords,
  stepConfidence,
  stepReadings,
  thenChain,
} from 'lib/assembly-skeleton/map';
import { useMemo } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { machineTypeLabel, PRESS_EQUIPMENT_LABELS } from '../equipment-options';
import { operationHeading, zoneLabel } from '../operation-options';
import type { WorkCatalog } from '../operation-work';
import { UnitGlyph, UnitTile, useUnitPictures } from '../unit-silhouette';
import { PairShape } from './pair-shape';
import { PieceMapShape } from './piece-map-shape';
import type { SewnField } from './sewn';
import { SewnStrip } from './sewn-strip';
import { MACHINE, type MapModel } from './use-map-model';

/** Внутренняя ширина колонки 320px за вычетом паддингов блока (16 × 2) и рамки. */
export const MAP_W = 286;
const PIC_H = 230;
const THEN_MAX = 4;
const PICTO_MAX = 16;

const num = (i: number) => (i + 1) * 10;

export function StepView({
  model,
  index,
  workCatalog,
  onPick,
  onDoor,
}: {
  model: MapModel;
  index: number;
  workCatalog: WorkCatalog | undefined;
  /** Строка THEN — ссылка на шаг: выбрать его (липко) и открыть в рельсе. */
  onPick: (index: number) => void;
  /** Пустой слот полосы «как шьют»: открыть шаг в рельсе и поставить фокус в поле. */
  onDoor: (index: number, field: SewnField) => void;
}) {
  const { read, ops, pieceName, unitName, isUnit } = model;
  const op = ops[index];
  const unitPics = useUnitPictures();
  const picture = useMemo(() => (read ? pairPicture(read, index) : null), [read, index]);
  // Плитки входов без картинки шага: детали — своим контуром, без номеров.
  const families = useMemo(() => (read ? pieceFamilies(read) : []), [read]);
  if (!read || !op) return null;

  const inputs = (op.inputKeys ?? []).filter(Boolean);
  const nameOf = (k: string) => (isUnit(k) ? unitName(k) : pieceName(k));
  const join = isJoin(read, index);
  const seams = read.seams[index] ?? [];
  const word = stepConfidence(read, index);
  const readings = stepReadings(read, index);
  const verb =
    operationHeading({
      operationType: op.operationType as common_TechCardOperationType,
      machineType: op.machineType as common_TechCardMachineType,
      seamClass: op.seamClass,
      work: op.work,
      workCatalog,
      zone: undefined,
      pieceNames: [],
      note: op.note,
    }) || 'step';
  const out = (op.outputUnitKey ?? '').trim();
  const tool =
    op.operationType === MACHINE
      ? machineTypeLabel(op.machineType)
      : PRESS_EQUIPMENT_LABELS[op.pressEquipment as keyof typeof PRESS_EQUIPMENT_LABELS] || '';
  const sub = [
    tool,
    zoneLabel(op.zone as common_TechCardGarmentZone),
    readings > 1 ? `${readings} readings` : '',
  ]
    .filter((s) => s && !/unknown|not set/i.test(s))
    .join(' · ');
  const then = thenChain(read.steps, index);
  const sewn = model.sewnOf(index);

  const facts: string[] =
    inputs.length === 0
      ? ['no inputs yet · pick the pieces in the step editor']
      : !join
        ? [`on ${nameOf(inputs[0])} alone · nothing is joined in this step`]
        : seams.length === 0
          ? ['edges not read from the pattern · check at the machine']
          : seams.map((c) => seamWords(read, c, pieceName));

  return (
    <div className='flex flex-col gap-1.5' data-map-step={index}>
      <div className='grid grid-cols-[auto_1fr_auto] items-baseline gap-2'>
        <Text size='stat' component='span' data-map-step-number>
          {num(index)}
        </Text>
        <Text size='control' component='span' className='min-w-0 break-words'>
          <b>{verb}</b>
          {inputs.length > 0 && <> · {inputs.map(nameOf).join(' + ')}</>}
          {out && (
            <>
              {' '}
              → <b>{unitName(out)}</b>
            </>
          )}
        </Text>
        {join && (
          <Pill
            tone={word === 'check' ? 'attention' : 'ink'}
            data-map-confidence={word}
            title={
              word === 'check'
                ? 'the pattern does not say this for certain — look at the pieces before sewing'
                : `the weakest seam of the step reads ${word}`
            }
          >
            {word}
          </Pill>
        )}
      </div>
      {sub && (
        <Text size='micro' variant='label' className='uppercase tracking-label'>
          {sub}
        </Text>
      )}

      <div
        className='flex items-center justify-center bg-bgZebra'
        style={{ height: picture ? PIC_H : undefined, minHeight: picture ? undefined : 120 }}
      >
        {picture ? (
          <PairShape
            picture={picture}
            names={inputs.map(nameOf)}
            boxW={MAP_W}
            boxH={PIC_H}
            label={`step ${num(index)}: ${inputs.map(nameOf).join(' + ')}, the sewn edges drawn bold`}
          />
        ) : (
          <div className='flex flex-wrap items-center justify-center gap-1 p-2' data-map-tiles>
            {inputs.map((k, i) => {
              const leaves = read.inputLeaves[index]?.[i] ?? [];
              const pic = isUnit(k) ? unitPics?.get(k) : null;
              const fam = read.geoms.has(k)
                ? families.find((f) => f.members.includes(k))
                : undefined;
              return (
                <span key={`${k}:${i}`} className='flex items-center gap-1'>
                  {i > 0 && (
                    <Text size='micro' variant='label' component='span'>
                      +
                    </Text>
                  )}
                  {pic ? (
                    <UnitTile picture={pic} name={nameOf(k)} nameOf={pieceName} />
                  ) : fam ? (
                    <span className='relative flex size-14 shrink-0 items-center justify-center bg-bgColor'>
                      <PieceMapShape
                        picture={{ ...fam.picture, edges: [] }}
                        boxW={56}
                        boxH={42}
                        active={null}
                        numberOf={num}
                        numbers={false}
                        label={nameOf(k)}
                      />
                      <span className='absolute inset-x-0 bottom-0 truncate bg-bgColor/80 px-0.5 text-center text-nano leading-[1.35] tracking-pill uppercase'>
                        {nameOf(k)}
                      </span>
                    </span>
                  ) : (
                    <span className='flex min-h-14 w-24 flex-col items-center justify-center border border-dashed border-borderColor px-1 py-1 text-center'>
                      <Text size='nano' component='span' className='uppercase tracking-pill'>
                        {nameOf(k)}
                      </Text>
                      <Text size='nano' variant='label' component='span'>
                        {isUnit(k)
                          ? leaves.length > PICTO_MAX
                            ? `${leaves.length} pieces · no pictogram above ${PICTO_MAX}`
                            : `${leaves.length} pieces`
                          : 'no contour'}
                      </Text>
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className='flex flex-col' data-map-facts>
        {facts.map((f, i) => (
          <Text key={i} size='micro' variant={seams.length === 0 && join ? 'default' : 'label'}>
            {f}
          </Text>
        ))}
      </div>

      {sewn.length > 0 && (
        <div>
          <GroupLabel flush>how it is sewn</GroupLabel>
          <SewnStrip tiles={sewn} onDoor={(f) => onDoor(index, f)} />
        </div>
      )}

      {then.length > 0 && (
        <div>
          <GroupLabel>then</GroupLabel>
          {then.slice(0, THEN_MAX).map((t) => (
            <Row
              key={t.step}
              className='py-0.5'
              label={
                <span
                  role='button'
                  tabIndex={0}
                  data-map-then={t.step}
                  onClick={() => onPick(t.step)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    onPick(t.step);
                  }}
                  className='flex cursor-pointer items-center gap-1.5 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                  title={`open step ${num(t.step)}`}
                >
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='w-6 shrink-0 tabular-nums'
                  >
                    {num(t.step)}
                  </Text>
                  <span className='inline-flex h-5 w-8 shrink-0 items-center justify-center'>
                    {unitPics?.get(t.unitKey) ? (
                      <UnitGlyph
                        picture={unitPics.get(t.unitKey)!}
                        name={unitName(t.unitKey)}
                        boxClassName='mr-0 h-5 w-8'
                      />
                    ) : (
                      <Text size='nano' variant='label' component='span' title='no pictogram'>
                        ▣
                      </Text>
                    )}
                  </span>
                  <Text size='micro' component='span' className='min-w-0 truncate font-bold'>
                    {unitName(t.unitKey)}
                  </Text>
                </span>
              }
            />
          ))}
          {then.length > THEN_MAX && (
            <Text size='micro' variant='label' className='pt-0.5'>
              … {then.length - THEN_MAX} more
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
