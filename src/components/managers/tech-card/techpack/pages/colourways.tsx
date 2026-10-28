import type { common_TechCard } from 'api/proto-http/admin';
import { DataTable, GroupLabel, HeaderNote, SectionHeader } from 'ui';
import { deriveColourways, type ColourwaysModel } from '../derive-colourways';
import {
  chunksOf,
  continuedTitle,
  TechpackSheet,
  type TechpackPageProps,
  useTechpackOverflow,
} from '../sheet';
import { Missing, Swatch } from './bits';
import { own, useT } from '../i18n';

type RecipeRows = ColourwaysModel['rows'];
type RecipeColumns = ColourwaysModel['columns'];
type FabricRows = ColourwaysModel['fabricRows'];

function ColourwaysHeader({
  model,
  n,
  continued = false,
}: {
  model: ColourwaysModel;
  n: string;
  continued?: boolean;
}) {
  const { t } = useT();
  return (
    <SectionHeader
      title={continuedTitle(n, t('colourways.title'), continued, t)}
      action={
        <HeaderNote>
          {model.rows.length} ·{' '}
          {model.fromBom ? t('colourways.fromBom') : t('colourways.materialRecipe')}
        </HeaderNote>
      }
    />
  );
}

function RecipeMatrix({
  model,
  rows,
  columns,
}: {
  model: ColourwaysModel;
  rows: RecipeRows;
  columns: RecipeColumns;
}) {
  const { t } = useT();
  const indexes = columns.map((column) =>
    model.columns.findIndex((item) => item.key === column.key),
  );
  return (
    <DataTable variant='grid'>
      <thead>
        <tr>
          <th>{t('colourways.colourway')}</th>
          {columns.map((column) => (
            <th key={column.key}>{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className='whitespace-nowrap'>
              <Swatch colour={row.swatch} size={14} /> <b>{own(row.name)}</b>
            </td>
            {indexes.map((index) => {
              const cell = row.cells[index];
              return (
                <td key={cell.key}>
                  <span className='inline-flex items-center gap-1.5'>
                    <Swatch colour={cell.swatch} />
                    <span>{own(cell.value)}</span>
                  </span>
                  {cell.sub && <div className='text-micro text-labelColor'>{own(cell.sub)}</div>}
                  {cell.missing && <div>{cell.gap && <Missing gap={cell.gap} />}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function PiecesMatrix({
  model,
  rows,
  colourways,
  labelled = true,
}: {
  model: ColourwaysModel;
  rows: FabricRows;
  colourways: RecipeRows;
  labelled?: boolean;
}) {
  const { t } = useT();
  const indexes = colourways.map((row) => model.rows.findIndex((item) => item.key === row.key));
  return (
    <>
      {labelled && (
        <GroupLabel flush className='mt-4'>
          {t('colourways.piecesColourway')}
        </GroupLabel>
      )}
      <DataTable variant='grid'>
        <thead>
          <tr>
            <th>{t('materials.bom')}</th>
            <th data-align='left'>{t('common.pieces')}</th>
            {colourways.map((row) => (
              <th key={row.key}>{own(row.name)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((fabric) => (
            <tr key={fabric.key}>
              <td className='whitespace-nowrap'>
                <b>{fabric.label}</b> {fabric.role}
              </td>
              <td data-align='left'>
                {fabric.pieces.length
                  ? fabric.pieces.map(own).join(' · ')
                  : fabric.piecesGap && <Missing gap={fabric.piecesGap} />}
              </td>
              {indexes.map((index) => {
                const cell = fabric.cells[index];
                return (
                  <td key={cell.key}>
                    <div className='whitespace-nowrap'>
                      <Swatch colour={cell.swatch} /> {own(cell.material)}
                      {cell.colour && ` · ${own(cell.colour)}`}
                    </div>
                    {cell.differs && (
                      <div className='text-micro text-labelColor'>
                        {cell.pieces.length
                          ? cell.pieces.map(own).join(' · ')
                          : cell.piecesGap && <Missing gap={cell.piecesGap} />}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}

function ColourwaysBody({
  model,
  n,
  continued = false,
}: {
  model: ColourwaysModel;
  n: string;
  continued?: boolean;
}) {
  return (
    <div>
      <ColourwaysHeader model={model} n={n} continued={continued} />
      {model.rows.length ? (
        <>
          <RecipeMatrix model={model} rows={model.rows} columns={model.columns} />
          {model.fabricRows.length > 0 && (
            <PiecesMatrix model={model} rows={model.fabricRows} colourways={model.rows} />
          )}
        </>
      ) : (
        model.emptyGap && <Missing gap={model.emptyGap} />
      )}
    </div>
  );
}

export function ColourwaysContent({ techCard, n }: { techCard: common_TechCard; n: string }) {
  const { t } = useT();
  return <ColourwaysBody model={deriveColourways(techCard, undefined, t)} n={n} />;
}

export function ColourwaysPage({ techCard, orient, docline, n }: TechpackPageProps) {
  const { t } = useT();
  const model = deriveColourways(techCard, undefined, t);
  const land = orient === 'land';
  const recipeColumns = land ? 6 : 4;
  const fabricColumns = land ? 5 : 3;
  const paginationKey = `${techCard.id ?? 0}:${orient}:${model.rows.length}:${model.columns.length}:${model.fabricRows.length}`;
  const { contentRef, overflow } = useTechpackOverflow(paginationKey);
  const tooWide = model.columns.length > recipeColumns || model.rows.length > fabricColumns;

  if (!overflow && !tooWide) {
    return (
      <TechpackSheet orient={orient} docline={docline}>
        <div ref={contentRef} className='contents'>
          <ColourwaysBody model={model} n={n} />
        </div>
      </TechpackSheet>
    );
  }

  const pages: Array<{ key: string; body: React.ReactNode }> = [];
  const rowPages = chunksOf(model.rows, land ? 6 : 10);
  const columnPages = chunksOf(model.columns, recipeColumns);
  for (const [rowIndex, rows] of rowPages.entries()) {
    for (const [columnIndex, columns] of (columnPages.length ? columnPages : [[]]).entries()) {
      pages.push({
        key: `recipe-${rowIndex}-${columnIndex}`,
        body: <RecipeMatrix model={model} rows={rows} columns={columns} />,
      });
    }
  }
  const fabricRowPages = chunksOf(model.fabricRows, land ? 6 : 10);
  const colourwayPages = chunksOf(model.rows, fabricColumns);
  for (const [rowIndex, rows] of fabricRowPages.entries()) {
    for (const [columnIndex, colourways] of colourwayPages.entries()) {
      pages.push({
        key: `pieces-${rowIndex}-${columnIndex}`,
        body: <PiecesMatrix model={model} rows={rows} colourways={colourways} labelled />,
      });
    }
  }

  if (!pages.length) {
    return (
      <TechpackSheet orient={orient} docline={docline}>
        <ColourwaysBody model={model} n={n} />
      </TechpackSheet>
    );
  }

  return (
    <>
      {pages.map((page, index) => (
        <TechpackSheet key={page.key} orient={orient} docline={docline}>
          <ColourwaysHeader model={model} n={n} continued={index > 0} />
          {page.body}
        </TechpackSheet>
      ))}
    </>
  );
}
