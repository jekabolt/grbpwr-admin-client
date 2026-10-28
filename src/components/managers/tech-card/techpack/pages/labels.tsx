import type { ReactNode } from 'react';
import { GrbpwrMark, HeaderNote, SectionHeader } from 'ui';
import { deriveLabels, type LabelsDeriveOptions } from '../derive-labels';
import { Missing, TechpackDrawing } from './bits';
import { TechpackSheet, type TechpackPageProps } from '../sheet';
import { own, useT } from '../i18n';

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
  const { t } = useT();
  const model = deriveLabels(techCard, { sampleSizeName }, undefined, t);
  const land = orient === 'land';
  const scale = land ? 5.2 : 5.4;
  const tapes = (
    <div className='flex flex-col gap-5'>
      <PhysicalTape caption={t('labels.identity')} scale={scale}>
        <div className='flex h-full items-center gap-3'>
          <div className='h-full shrink-0' style={{ width: 22 * scale }}>
            {model.identity.logo ? (
              <img
                src={model.identity.logo.url}
                alt={t('labels.logoAlt')}
                className='h-full w-full object-contain'
              />
            ) : (
              <GrbpwrMark className='h-full w-full text-textColor' />
            )}
          </div>
          <div className='flex min-w-0 flex-1 flex-col gap-1 text-control uppercase leading-tight'>
            <div className='font-bold'>
              {model.identity.name || (model.gaps.name && <Missing gap={model.gaps.name} />)}
            </div>
            <div>
              {own(model.identity.colour) ||
                (model.gaps.colour && <Missing gap={model.gaps.colour} />)}{' '}
              · {model.identity.size || (model.gaps.size && <Missing gap={model.gaps.size} />)}
            </div>
            <div className='text-labelColor'>{model.identity.brand}</div>
          </div>
        </div>
      </PhysicalTape>
      <PhysicalTape
        caption={t('labels.composition')}
        scale={scale}
        heightMm={labelSheet.heightMm / 2}
      >
        <div className='flex h-full gap-3 text-micro uppercase leading-snug'>
          <div className='text-labelColor'>{t('labels.language')}</div>
          <div>
            {model.composition.length
              ? model.composition.map((line) => (
                  <div key={`${line.part}-${line.value}`}>
                    <span className='font-bold'>{line.part}</span> {own(line.value)}
                  </div>
                ))
              : model.gaps.composition && <Missing gap={model.gaps.composition} />}
          </div>
        </div>
      </PhysicalTape>
    </div>
  );
  const placement = (
    <div className='flex min-h-0 flex-1 flex-col items-center justify-center border border-borderColor'>
      <TechpackDrawing
        media={model.back}
        name={t('common.back')}
        height={land ? 480 : 430}
        caption=''
        missingGap={model.gaps.back}
      />
      <div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 text-micro uppercase'>
        <b>
          {own(model.placement.name) ||
            (model.gaps.placement && <Missing gap={model.gaps.placement} />)}
        </b>
        {model.placement.attachment && <span>{own(model.placement.attachment)}</span>}
        {model.placement.folding && <span>{own(model.placement.folding)}</span>}
        {model.placement.size && <span>{own(model.placement.size)}</span>}
        {model.placement.qty != null && (
          <span>{t('labels.quantity', { count: model.placement.qty })}</span>
        )}
      </div>
    </div>
  );

  return (
    <TechpackSheet orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} ${t('labels.title')}`}
        action={<HeaderNote>{t('labels.summary')}</HeaderNote>}
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
    </TechpackSheet>
  );
}
