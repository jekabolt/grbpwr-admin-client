import { GrbpwrMark, GroupLabel, Pill, Row } from 'ui';
import { KV } from 'components/managers/print/sheet';
import { deriveCover, type CoverDeriveOptions } from '../derive-cover';
import type { Gap } from '../gaps';
import { Missing, statusTone, TechpackDrawing } from './bits';
import { TechpackSheet, type TechpackPageProps } from '../sheet';

/** A section in the contents; its page number is filled in from the laid-out sheets. */
export type TechpackTocItem = { n: string; title: string };

type CoverPageProps = TechpackPageProps &
  CoverDeriveOptions & {
    toc: TechpackTocItem[];
    pdfGaps?: readonly Gap[];
  };

const glossary: Array<[string, string]> = [
  ['SA', 'seam allowance'],
  ['CB', 'centre back'],
  ['CF', 'centre front'],
  ['TS', 'topstitch'],
  ['m/c', 'machine'],
  ['GSM', 'grams / m²'],
  ['DXF', 'pattern file'],
  ['PAIR', '2 pcs L+R'],
  ['P', 'perimeter'],
  ['Turn out', 'right side out'],
  ['Δ', 'length difference'],
  ['RS / WS', 'right / wrong side'],
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
}: CoverPageProps) {
  const model = deriveCover(techCard, { sampleSizeName, revisionLabel });
  const land = orient === 'land';
  const fabrics = model.fabrics
    .map((fabric) => [fabric.name, fabric.colour].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join(' + ');
  const buttonFacts = model.buttons
    // «button 11 mm» without a spec still names its size
    .map((button) =>
      [button.qty, button.spec || button.name.replace(/^buttons?\s*/i, '')]
        .filter(Boolean)
        .join(' × '),
    )
    .filter(Boolean)
    .join(' · ');
  const summary = (
    <div>
      <KV
        k='status'
        v={
          model.approval ? (
            <Pill tone={statusTone(model.approval)}>{model.approval}</Pill>
          ) : (
            model.gaps.status && <Missing gap={model.gaps.status} />
          )
        }
      />
      <KV
        k='sample size'
        v={
          model.sampleSize ? (
            <span className='uppercase'>{model.sampleSize}</span>
          ) : (
            model.gaps.sampleSize && <Missing gap={model.gaps.sampleSize} />
          )
        }
      />
      <KV
        k='cut pieces'
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
        k='operations'
        v={
          model.operations ? (
            <>
              {model.operations}
              <span className='text-labelColor'> · {model.assemblies} assemblies</span>
            </>
          ) : (
            model.gaps.operations && <Missing gap={model.gaps.operations} />
          )
        }
      />
      <KV k='fabrics' v={fabrics || (model.gaps.fabrics && <Missing gap={model.gaps.fabrics} />)} />
      {model.buttons.length ? (
        <KV
          k='buttons'
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
        k='colourways'
        v={
          model.colorways.length ||
          (model.gaps.colourways && <Missing gap={model.gaps.colourways} />)
        }
      />
      {pdfGaps.length > 0 && <KV k='missing' v={`${pdfGaps.length} gaps`} />}
      {model.revision && <KV k='revision' v={model.revision} />}
    </div>
  );
  const contents = (
    <div>
      <GroupLabel flush>contents</GroupLabel>
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
      <GroupLabel flush>key</GroupLabel>
      <div className='grid grid-cols-2 gap-x-4'>
        {glossary.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );

  return (
    <TechpackSheet orient={orient} docline={docline}>
      <header className='mb-4 border-b-2 border-textColor pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex min-w-0 items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-10 w-10 shrink-0 text-textColor' />
            <div className='min-w-0'>
              <div className='text-micro uppercase tracking-section text-labelColor'>
                {model.brand} · tech pack
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
              <Pill tone={statusTone(model.approval)}>{model.approval}</Pill>
            ) : (
              model.gaps.status && <Missing gap={model.gaps.status} />
            )}
            {model.revision && <div className='font-semibold'>{model.revision}</div>}
            <div className='text-labelColor'>
              sample{' '}
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
                name='front'
                height={325}
                missingGap={model.gaps.front}
              />
              <TechpackDrawing
                media={model.back}
                name='back'
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
              name='front'
              height={325}
              missingGap={model.gaps.front}
            />
            <TechpackDrawing
              media={model.back}
              name='back'
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
