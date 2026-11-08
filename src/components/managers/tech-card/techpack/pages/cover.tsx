import { useMemo } from 'react';
import { GrbpwrMark, GroupLabel, Pill, Row } from 'ui';
import { KV } from 'components/managers/print/sheet';
import { deriveCover, type CoverDeriveOptions } from '../derive-cover';
import type { Gap } from '../gaps';
import { Missing, statusTone, TechpackDrawing } from './bits';
import { TechpackSheet, type TechpackPageProps } from '../sheet';
import { own, useT, type PdfT } from '../i18n';
import { useDictionary } from 'lib/providers/dictionary-provider';

/** A section in the contents; its page number is filled in from the laid-out sheets. */
export type TechpackTocItem = { n: string; title: string };

type CoverPageProps = TechpackPageProps &
  CoverDeriveOptions & {
    toc: TechpackTocItem[];
    pdfGaps?: readonly Gap[];
    auxiliary?: boolean;
  };

const glossary = (t: PdfT): Array<[string, string]> => [
  ['SA', t('cover.seamAllowance')],
  ['CB', t('cover.centreBack')],
  ['CF', t('cover.centreFront')],
  ['TS', t('cover.topstitch')],
  ['m/c', t('cover.machine')],
  ['GSM', t('cover.gramsPerSquareMetre')],
  ['DXF', t('cover.patternFile')],
  ['PAIR', t('cover.pair')],
  ['P', t('cover.perimeter')],
  [t('cover.turnOutKey'), t('cover.turnOut')],
  ['Δ', t('cover.lengthDifference')],
  [t('cover.sidesKey'), t('cover.sides')],
];

/** «a · b · b» → «a · b»: a collection named after its season prints once. */
const uniqueLine = (parts: string[]) =>
  parts
    .filter(
      (part, i) => part && parts.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === i,
    )
    .join(' · ');

export function CoverPage({
  techCard,
  orient,
  docline,
  toc,
  sampleSizeName,
  revisionLabel,
  pdfGaps = [],
  auxiliary = false,
}: CoverPageProps) {
  const { t } = useT();
  const model = useMemo(
    () => deriveCover(techCard, { sampleSizeName, revisionLabel }, undefined, t),
    [techCard, sampleSizeName, revisionLabel, t],
  );
  const land = orient === 'land';
  const fabrics = model.fabrics
    .map((fabric) => [own(fabric.name), own(fabric.colour)].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join(' + ');
  const buttonFacts = model.buttons
    // «button 11 mm» without a spec still names its size
    .map((button) =>
      [button.qty, own(button.spec) || own(button.name).replace(/^buttons?\s*/i, '')]
        .filter(Boolean)
        .join(' × '),
    )
    .filter(Boolean)
    .join(' · ');
  const { dictionary } = useDictionary();
  const colourByCode = new Map(
    (dictionary?.colors ?? []).map((colour) => [colour.code ?? '', colour]),
  );
  const legacyMaterial = (techCard.techCard?.bomItems ?? []).find(
    (item) => item.materialId === techCard.techCard?.outputMaterialId,
  );
  const legacyColour =
    colourByCode.get(legacyMaterial?.color ?? '') ??
    (dictionary?.colors ?? []).find((colour) => colour.name === legacyMaterial?.color);
  const makes = (techCard.outputVariants ?? []).length
    ? (techCard.outputVariants ?? []).map((variant) => ({
        key: variant.id ?? variant.colorCode,
        colour: variant.colorName || variant.colorCode || 'colour',
        hex: colourByCode.get(variant.colorCode ?? '')?.hex,
        material: variant.materialName || `#${variant.materialId ?? 0}`,
      }))
    : techCard.techCard?.outputMaterialId
      ? [
          {
            key: 'legacy',
            colour: legacyColour?.name || legacyMaterial?.color || 'colour',
            hex: legacyColour?.hex,
            material: legacyMaterial?.name || `material #${techCard.techCard.outputMaterialId}`,
          },
        ]
      : [];
  const summary = (
    <div>
      <KV
        k={t('common.status')}
        v={
          model.approval ? (
            <Pill tone={statusTone(model.approval)}>{model.approvalLabel}</Pill>
          ) : (
            model.gaps.status && <Missing gap={model.gaps.status} />
          )
        }
      />
      <KV
        k={t('common.sampleSize')}
        v={
          model.sampleSize ? (
            <span className='uppercase'>{model.sampleSize}</span>
          ) : (
            model.gaps.sampleSize && <Missing gap={model.gaps.sampleSize} />
          )
        }
      />
      <KV
        k={t('common.cutPieces')}
        v={
          model.pieceCount ? (
            <>
              {model.panelCount}
              {model.fabrics
                .filter((fabric) => fabric.pieces)
                .map((fabric) => (
                  <span key={fabric.role} className='text-labelColor'>
                    {' '}
                    · {fabric.pieces} {fabric.role}
                  </span>
                ))}
            </>
          ) : (
            model.gaps.pieces && <Missing gap={model.gaps.pieces} />
          )
        }
      />
      <KV
        k={t('common.operations')}
        v={
          model.operations ? (
            <>
              {model.operations}
              <span className='text-labelColor'>
                {' '}
                · {t('cover.assemblies', { count: model.assemblies })}
              </span>
            </>
          ) : (
            model.gaps.operations && <Missing gap={model.gaps.operations} />
          )
        }
      />
      <KV
        k={t('common.fabrics')}
        v={fabrics || (model.gaps.fabrics && <Missing gap={model.gaps.fabrics} />)}
      />
      {model.buttons.length ? (
        <KV
          k={t('common.buttons')}
          v={
            <>
              {model.buttonTotal ||
                (model.gaps.buttonQty && <Missing gap={model.gaps.buttonQty} />)}
              {buttonFacts && <span className='text-labelColor'> · {buttonFacts}</span>}
            </>
          }
        />
      ) : null}
      <KV
        k={t('common.colourways')}
        v={
          model.colorways.length ||
          (model.gaps.colourways && <Missing gap={model.gaps.colourways} />)
        }
      />
      {pdfGaps.length > 0 && (
        <KV k={t('common.missing')} v={t('common.gaps', { count: pdfGaps.length })} />
      )}
      {model.revision && <KV k={t('common.revision')} v={model.revision} />}
    </div>
  );
  const contents = (
    <div>
      <GroupLabel flush>{t('cover.contents')}</GroupLabel>
      {toc.map((item) => (
        <Row
          key={item.n}
          label={
            <span>
              <span className='mr-3 tabular-nums text-labelColor'>{item.n}</span>
              {item.title}
            </span>
          }
          value={<span className='tabular-nums' data-toc-page={item.n} />}
        />
      ))}
    </div>
  );
  const key = (
    <div>
      <GroupLabel flush>{t('cover.key')}</GroupLabel>
      <div className='grid grid-cols-2 gap-x-4'>
        {glossary(t).map(([label, value]) => (
          <Row
            key={label}
            className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 [&>span:first-child]:whitespace-nowrap [&>span:last-child]:min-w-0 [&>span:last-child]:whitespace-normal'
            label={label}
            value={value}
          />
        ))}
      </div>
    </div>
  );

  if (auxiliary) {
    return (
      <TechpackSheet orient={orient} docline={docline}>
        <header className='mb-4 border-b-2 border-textColor pb-3'>
          <div className='flex min-w-0 items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-10 w-10 shrink-0 text-textColor' />
            <div className='min-w-0'>
              <div className='text-micro uppercase tracking-section text-labelColor'>
                {model.brand} · {t('common.techPack')}
              </div>
              <h1 className='text-statBig font-bold uppercase leading-tight'>{model.name}</h1>
              <div className='text-control'>{uniqueLine([model.collection, model.season])}</div>
              {model.styleNumber && (
                <div className='text-micro uppercase tracking-label text-labelColor'>
                  {model.styleNumber}
                </div>
              )}
            </div>
          </div>
        </header>
        <div className='grid min-h-0 flex-1 grid-cols-2 gap-8'>
          <div>
            <GroupLabel flush>makes</GroupLabel>
            {makes.map((row) => (
              <Row
                key={row.key}
                label={
                  <span className='flex items-start gap-2'>
                    <span
                      aria-hidden
                      className='size-5 shrink-0 border border-textColor'
                      style={row.hex ? { backgroundColor: row.hex } : undefined}
                    />
                    <span className='min-w-0'>
                      <span className='block'>{row.colour}</span>
                      <span className='block break-words text-labelColor'>{row.material}</span>
                    </span>
                  </span>
                }
              />
            ))}
          </div>
          {contents}
        </div>
      </TechpackSheet>
    );
  }

  return (
    <TechpackSheet orient={orient} docline={docline}>
      <header className='mb-4 border-b-2 border-textColor pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex min-w-0 items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-10 w-10 shrink-0 text-textColor' />
            <div className='min-w-0'>
              <div className='text-micro uppercase tracking-section text-labelColor'>
                {model.brand} · {t('common.techPack')}
              </div>
              <h1 className='text-statBig font-bold uppercase leading-tight'>
                {model.name || (model.gaps.name && <Missing gap={model.gaps.name} />)}
              </h1>
              <div className='text-control'>
                {uniqueLine([model.gender, model.collection, model.season])}
              </div>
              {model.styleNumber && (
                <div className='text-micro uppercase tracking-label text-labelColor'>
                  {model.styleNumber}
                </div>
              )}
            </div>
          </div>
          <div className='flex flex-col items-end gap-1 text-right text-control leading-tight'>
            {model.approval ? (
              <Pill tone={statusTone(model.approval)}>{model.approvalLabel}</Pill>
            ) : (
              model.gaps.status && <Missing gap={model.gaps.status} />
            )}
            {model.revision && <div className='font-semibold'>{model.revision}</div>}
            <div className='text-labelColor'>
              {t('common.sample')}{' '}
              {model.sampleSize ? (
                <span className='uppercase'>{model.sampleSize}</span>
              ) : (
                model.gaps.sampleSize && <Missing gap={model.gaps.sampleSize} />
              )}
            </div>
          </div>
        </div>
      </header>

      {land ? (
        <div className='flex min-h-0 flex-1 gap-8'>
          <div className='flex min-w-0 flex-1 flex-col gap-4'>
            <div className='flex flex-1 items-center justify-center gap-4 border border-borderColor'>
              <TechpackDrawing
                media={model.front}
                name={t('common.front')}
                height={325}
                missingGap={model.gaps.front}
              />
              <TechpackDrawing
                media={model.back}
                name={t('common.back')}
                height={325}
                missingGap={model.gaps.back}
              />
            </div>
            {summary}
          </div>
          <div className='flex w-80 shrink-0 flex-col gap-4'>
            {contents}
            {key}
          </div>
        </div>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col gap-4'>
          <div className='flex items-center justify-center gap-2 border border-borderColor py-2'>
            <TechpackDrawing
              media={model.front}
              name={t('common.front')}
              height={325}
              missingGap={model.gaps.front}
            />
            <TechpackDrawing
              media={model.back}
              name={t('common.back')}
              height={325}
              missingGap={model.gaps.back}
            />
          </div>
          <div className='grid grid-cols-2 gap-x-8'>
            {summary}
            {contents}
          </div>
          {key}
        </div>
      )}
    </TechpackSheet>
  );
}
