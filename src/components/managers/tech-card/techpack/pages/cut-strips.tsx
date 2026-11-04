import { useMemo } from 'react';
import { DataTable, EmptyCell, SectionHeader } from 'ui';

import type { AssemblyModel } from '../derive-assembly';
import { deriveCutStrips, type CutStripRow, type CutStripsModel } from '../derive-cut-strips';
import { own, useT } from '../i18n';
import { chunksOf, continuedTitle, TechpackSheet, type TechpackPageProps } from '../sheet';

/** Two short tables a strip: a sheet holds this many before a long size row could push it over. */
const STRIPS_PER_SHEET = 5;

const mm = (value: number | null | undefined) => (value == null ? null : `${value} mm`);

function StripTables({ strip, model }: { strip: CutStripRow; model: CutStripsModel }) {
  const { t } = useT();
  const name = own(strip.name);
  const width = mm(strip.widthMm);
  const columns = strip.oneLength
    ? [t('cutStrips.allSizes')]
    : model.sizes.map((size) => own(size.name));
  return (
    <div className='flex flex-col gap-2' data-cut-strip-sheet={strip.key}>
      {strip.steps.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <th>{t('assembly.op')}</th>
              <th data-align='left'>{t('cutStrips.step')}</th>
              <th>{name}</th>
              <th>
                {t('cutStrips.cutAt', {
                  size: strip.oneLength ? t('cutStrips.allSizes') : own(model.baseSizeName),
                })}
              </th>
            </tr>
          </thead>
          <tbody>
            {strip.steps.map((step) => (
              <tr key={step.n}>
                <td>{step.n}</td>
                <td data-align='left'>{step.text || <EmptyCell />}</td>
                <td>{width ?? <EmptyCell />}</td>
                <td>{mm(strip.baseCutMm) ?? <EmptyCell />}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <DataTable>
        <thead>
          <tr>
            <th data-align='left'>{t('cutStrips.cutMmOf', { name })}</th>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-align='left'>
              ×{strip.qty}
              {width ? `, ${width}` : ''}
            </td>
            {strip.cuts.map((cut, index) => (
              <td key={columns[index]}>{cut ?? <EmptyCell />}</td>
            ))}
          </tr>
        </tbody>
      </DataTable>
    </div>
  );
}

/** Nothing at all on a card with no strip: its document stays what it was. */
export function CutStripsPage({
  techCard,
  orient,
  docline,
  n,
  assembly,
  sizeNames,
  orderSizes,
}: TechpackPageProps & {
  assembly?: AssemblyModel | null;
  sizeNames?: Readonly<Record<number, string>>;
  orderSizes?: (ids: number[]) => number[];
}) {
  const { t } = useT();
  const model = useMemo(
    () =>
      deriveCutStrips(techCard, {
        sizeNames,
        orderSizes,
        pieces: assembly?.pieces,
        grainDeg: assembly?.grainDeg,
        verbOf: (operation) => assembly?.words.get(operation)?.verb,
        t,
      }),
    [techCard, sizeNames, orderSizes, assembly, t],
  );
  if (model.strips.length === 0) return null;
  return (
    <>
      {chunksOf(model.strips, STRIPS_PER_SHEET).map((strips, sheet) => (
        <TechpackSheet orient={orient} docline={docline} key={sheet}>
          <SectionHeader title={continuedTitle(n, t('cutStrips.title'), sheet > 0, t)} />
          <div className='flex flex-col gap-6'>
            {strips.map((strip) => (
              <StripTables key={strip.key} strip={strip} model={model} />
            ))}
          </div>
        </TechpackSheet>
      ))}
    </>
  );
}
