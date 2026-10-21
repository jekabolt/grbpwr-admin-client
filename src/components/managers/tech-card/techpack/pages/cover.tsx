import { GrbpwrMark, GroupLabel, Pill, Row } from 'ui';
import { KV } from 'components/managers/print/sheet';
import { deriveCover, type CoverDeriveOptions } from '../derive-cover';
import { TechpackDrawing, Missing } from './bits';
import { TechpackPaper, type TechpackPageProps } from './paper';

export type TechpackTocItem = { n: string; title: string; page: number };

type CoverPageProps = TechpackPageProps &
  CoverDeriveOptions & {
    toc: TechpackTocItem[];
  };

const glossary: Array<[string, string]> = [
  ['SA', 'seam allowance'],
  ['CB', 'centre back'],
  ['CF', 'centre front'],
  ['TS', 'topstitch'],
  ['m/c', 'machine'],
  ['GSM', 'grams / m²'],
  ['DXF', 'pattern file'],
  ['P', 'perimeter'],
  ['RS / WS', 'right / wrong side'],
];

const approvalTone = (approval: string): 'ok' | 'warn' | 'attention' | 'mut' => {
  const value = approval.toLowerCase();
  if (value.includes('released') || value.includes('approved')) return 'ok';
  if (value.includes('obsolete')) return 'warn';
  if (value.includes('review')) return 'attention';
  return 'mut';
};

export function CoverPage({
  techCard,
  orient,
  docline,
  n,
  toc,
  sampleSizeName,
  revisionLabel,
}: CoverPageProps) {
  const model = deriveCover(techCard, { sampleSizeName, revisionLabel });
  const land = orient === 'land';
  const fabrics = model.fabrics
    .map((fabric) => [fabric.name, fabric.colour].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join(' + ');
  const buttonFacts = model.buttons
    .map((button) => [button.qty, button.spec].filter(Boolean).join(' × '))
    .filter(Boolean)
    .join(' · ');
  const summary = (
    <div>
      <KV
        k='status'
        v={
          model.approval ? (
            <Pill tone={approvalTone(model.approval)}>{model.approval}</Pill>
          ) : (
            <Missing name='status' />
          )
        }
      />
      <KV k='sample size' v={model.sampleSize || <Missing name='sample size' />} />
      <KV
        k='cut pieces'
        v={
          model.pieceCount ? (
            <>
              {model.panelCount} panels
              <span className='text-labelColor'> · {model.pieceCount} pieces</span>
            </>
          ) : (
            <Missing name='pieces' />
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
            <Missing name='operations' />
          )
        }
      />
      <KV k='fabrics' v={fabrics || <Missing name='fabrics' />} />
      {model.buttons.length ? (
        <KV
          k='buttons'
          v={
            <>
              {model.buttonTotal || <Missing name='qty' />}
              {buttonFacts && <span className='text-labelColor'> · {buttonFacts}</span>}
            </>
          }
        />
      ) : null}
      <KV k='colourways' v={model.colorways.length || <Missing name='colourways' />} />
      {model.requiredMissing.length ? (
        <KV k='missing' v={<Missing name={model.requiredMissing.join(' · ')} />} />
      ) : null}
      {model.revision && <KV k='revision' v={model.revision} />}
    </div>
  );
  const contents = (
    <div>
      <GroupLabel flush>contents</GroupLabel>
      {toc.map((item) => (
        <Row
          key={`${item.n}-${item.page}`}
          label={
            <span>
              <span className='mr-3 tabular-nums text-labelColor'>{item.n}</span>
              {item.title}
            </span>
          }
          value={item.page}
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
    <TechpackPaper orient={orient} docline={docline}>
      <header className='mb-4 border-b-2 border-textColor pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex min-w-0 items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-10 w-10 shrink-0 text-textColor' />
            <div className='min-w-0'>
              <div className='text-micro uppercase tracking-section text-labelColor'>
                {model.brand} · tech pack · {n}
              </div>
              <h1 className='text-statBig font-bold uppercase leading-tight'>
                {model.name || <Missing name='name' />}
              </h1>
              <div className='text-control'>
                {[model.gender, model.collection, model.season].filter(Boolean).join(' · ')}
              </div>
              <div className='text-micro uppercase tracking-label text-labelColor'>
                {model.styleNumber || <Missing name='style' />}
              </div>
            </div>
          </div>
          <div className='flex flex-col items-end gap-1 text-right text-control leading-tight'>
            {model.approval ? (
              <Pill tone={approvalTone(model.approval)}>{model.approval}</Pill>
            ) : (
              <Missing name='status' />
            )}
            {model.revision && <div className='font-semibold'>{model.revision}</div>}
            <div className='text-labelColor'>
              sample {model.sampleSize || <Missing name='size' />}
            </div>
          </div>
        </div>
      </header>

      {land ? (
        <div className='flex min-h-0 flex-1 gap-8'>
          <div className='flex min-w-0 flex-1 flex-col gap-4'>
            <div className='flex flex-1 items-center justify-center gap-4 border border-borderColor'>
              <TechpackDrawing media={model.front} name='front' height={325} />
              <TechpackDrawing media={model.back} name='back' height={325} />
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
            <TechpackDrawing media={model.front} name='front' height={325} />
            <TechpackDrawing media={model.back} name='back' height={325} />
          </div>
          <div className='grid grid-cols-2 gap-x-8'>
            {summary}
            {contents}
          </div>
          {key}
        </div>
      )}
    </TechpackPaper>
  );
}
