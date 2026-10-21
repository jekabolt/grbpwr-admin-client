import type { ReactNode } from 'react';
import { GrbpwrMark, HeaderNote, SectionHeader } from 'ui';
import { deriveLabels, type LabelsDeriveOptions } from '../derive-labels';
import { Missing, TechpackDrawing } from './bits';
import { TechpackPaper, type TechpackPageProps } from './paper';

type LabelsPageProps = TechpackPageProps & LabelsDeriveOptions;

// The composition-label sheet contract from care-labels/layout.ts, kept local so this print page
// does not pull the outline shaper and its font assets into the tech-pack bundle.
const labelSheet = { widthMm: 100, heightMm: 30, seamMm: 10 } as const;

function PhysicalTape({
  caption,
  scale,
  heightMm = labelSheet.heightMm,
  children,
}: {
  caption: string;
  scale: number;
  heightMm?: number;
  children: ReactNode;
}) {
  return (
    <figure>
      <figcaption className='mb-1 text-micro uppercase tracking-label text-labelColor'>
        {caption}
      </figcaption>
      <div
        className='relative border border-textColor bg-bgColor text-textColor'
        style={{ width: labelSheet.widthMm * scale, height: heightMm * scale }}
      >
        <div
          className='absolute inset-y-0 left-0 p-1.5'
          style={{ width: (labelSheet.widthMm - labelSheet.seamMm) * scale }}
        >
          {children}
        </div>
        <div
          className='absolute inset-y-0 border-l border-dashed border-textColor'
          style={{ left: (labelSheet.widthMm - labelSheet.seamMm) * scale }}
        />
      </div>
    </figure>
  );
}

export function LabelsPage({ techCard, orient, docline, n, sampleSizeName }: LabelsPageProps) {
  const model = deriveLabels(techCard, { sampleSizeName });
  const land = orient === 'land';
  const scale = land ? 5.2 : 5.4;
  const tapes = (
    <div className='flex flex-col gap-5'>
      <PhysicalTape caption='a · identity' scale={scale}>
        <div className='flex h-full items-center gap-3'>
          <div className='h-full shrink-0' style={{ width: 22 * scale }}>
            {model.identity.logo ? (
              <img
                src={model.identity.logo.url}
                alt='label logo'
                className='h-full w-full object-contain'
              />
            ) : (
              <GrbpwrMark className='h-full w-full text-textColor' />
            )}
          </div>
          <div className='flex min-w-0 flex-1 flex-col gap-1 text-control uppercase leading-tight'>
            <div className='font-bold'>{model.identity.name || <Missing name='name' />}</div>
            <div>
              {model.identity.colour || <Missing name='colour' />} ·{' '}
              {model.identity.size || <Missing name='size' />}
            </div>
            <div className='text-labelColor'>{model.identity.brand}</div>
          </div>
        </div>
      </PhysicalTape>
      <PhysicalTape caption='b · composition' scale={scale} heightMm={labelSheet.heightMm / 2}>
        <div className='flex h-full gap-3 text-micro uppercase leading-snug'>
          <div className='text-labelColor'>en</div>
          <div>
            {model.composition.length ? (
              model.composition.map((line) => (
                <div key={`${line.part}-${line.value}`}>
                  <span className='font-bold'>{line.part}</span> {line.value}
                </div>
              ))
            ) : (
              <Missing name='composition' />
            )}
          </div>
        </div>
      </PhysicalTape>
    </div>
  );
  const placement = (
    <div className='flex min-h-0 flex-1 flex-col items-center justify-center border border-borderColor'>
      <TechpackDrawing media={model.back} name='back' height={land ? 480 : 430} caption='' />
      <div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 text-micro uppercase'>
        <b>{model.placement.name || <Missing name='placement' />}</b>
        {model.placement.attachment && <span>{model.placement.attachment}</span>}
        {model.placement.folding && <span>{model.placement.folding}</span>}
        {model.placement.size && <span>{model.placement.size}</span>}
        {model.placement.qty != null && <span>qty {model.placement.qty}</span>}
      </div>
    </div>
  );

  return (
    <TechpackPaper orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} labels`}
        action={<HeaderNote>identity · composition · placement</HeaderNote>}
      />
      {land ? (
        <div className='flex min-h-0 flex-1 gap-8'>
          <div className='flex flex-col'>{tapes}</div>
          <div className='flex min-w-0 flex-1 flex-col'>{placement}</div>
        </div>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col gap-5'>
          <div className='flex justify-center'>{tapes}</div>
          {placement}
        </div>
      )}
    </TechpackPaper>
  );
}
