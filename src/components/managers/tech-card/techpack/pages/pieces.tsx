import { HeaderNote, SectionHeader, Tile } from 'ui';
import { PieceShape } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { derivePieces, type TechpackPieceGeometry } from '../derive-pieces';
import { formatNumber } from '../derive-shared';
import { gapKey, type Gap } from '../gaps';
import { Missing, Swatch } from './bits';
import {
  continuedTitle,
  TechpackSheet,
  type TechpackPageProps,
  useTechpackOverflow,
} from '../sheet';
import { own, useT, type PdfT } from '../i18n';

type PiecesPageProps = TechpackPageProps & { geometry?: TechpackPieceGeometry };

const pcs = (qty: number, t: PdfT) => t('common.piecesShort', { count: qty });

function missingGaps(tiles: readonly { missing: readonly Gap[] }[]) {
  const gaps = new Map<string, Gap>();
  for (const tile of tiles) {
    for (const gap of tile.missing) gaps.set(gapKey(gap), gap);
  }
  return [...gaps.values()];
}

function paginateGroups<T extends { key: string; tiles: unknown[] }>(
  groups: readonly T[],
  columns: number,
  rowBudget: number,
): T[][] {
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;
  const pushPage = () => {
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };

  for (const group of groups) {
    let at = 0;
    while (at < group.tiles.length) {
      const availableRows = Math.floor(rowBudget - used - 0.35);
      if (availableRows < 1) {
        pushPage();
        continue;
      }
      const take = Math.min(group.tiles.length - at, availableRows * columns);
      const tiles = group.tiles.slice(at, at + take);
      page.push({ ...group, tiles });
      used += 0.35 + Math.ceil(tiles.length / columns);
      at += take;
      if (at < group.tiles.length) pushPage();
    }
  }
  pushPage();
  return pages;
}

export function PiecesPage({ techCard, orient, docline, n, geometry }: PiecesPageProps) {
  const { t } = useT();
  const model = derivePieces(techCard, geometry, undefined, t);
  const land = orient === 'land';
  const columns = land ? 5 : 3;
  const tileCount = model.groups.reduce((sum, group) => sum + group.tiles.length, 0);
  const pageCapacity = land ? 15 : 12;
  const rowBudget = land ? 5 : 7;
  const rowUnits = model.groups.reduce(
    (sum, group) => sum + 0.35 + Math.ceil(group.tiles.length / columns),
    0,
  );
  const paginationKey = `${techCard.id ?? 0}:${orient}:${tileCount}:${model.groups.length}`;
  const { contentRef, overflow } = useTechpackOverflow(paginationKey);

  const sheet = (groups: typeof model.groups, continued: boolean, probe = false) => (
    <TechpackSheet
      key={`${continued}-${groups[0]?.key ?? 'empty'}-${groups[0]?.tiles[0]?.key ?? ''}`}
      orient={orient}
      docline={docline}
    >
      <div ref={probe ? contentRef : undefined} className='contents'>
        <SectionHeader
          title={continuedTitle(n, t('pieces.title'), continued, t)}
          action={
            <HeaderNote>
              {[
                t('common.panels', { count: model.panelCount }),
                model.paired && t('pieces.pairsGrouped'),
                model.grainLayer && t('pieces.grainMarked'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </HeaderNote>
          }
        />
        {groups.some((group) => group.key !== 'unassigned') && (
          <div className='mb-2 flex flex-wrap gap-x-6 gap-y-1 text-control'>
            {groups
              .filter((group) => group.key !== 'unassigned')
              .map((group) => (
                <span key={group.key} className='flex items-center gap-2 whitespace-nowrap'>
                  <b>{group.label}</b>
                  <span>{own(group.name)}</span>
                  <Swatch colour={group.swatch} />
                  <span>
                    {[own(group.composition), own(group.colour)].filter(Boolean).join(' · ')}
                  </span>
                  <span className='text-labelColor'>
                    {pcs(group.panelCount, t)}
                    {model.hasGeometry &&
                      ` · ${formatNumber(group.netAreaM2, 2)} m² ${t('pieces.net')}`}
                  </span>
                </span>
              ))}
          </div>
        )}
        <div className='flex min-h-0 flex-1 flex-col gap-2' style={{ containerType: 'size' }}>
          {groups.map((group) => {
            const across = Math.min(columns, group.tiles.length);
            const rows = Math.ceil(group.tiles.length / columns);
            const missing = missingGaps(group.tiles);
            return (
              <section key={group.key} className='flex min-h-0 flex-none flex-col'>
                <div className='flex flex-wrap items-baseline gap-x-3 border-b border-textColor py-1 text-micro uppercase tracking-label'>
                  {group.key !== 'unassigned' && (
                    <span>
                      <b>{group.label}</b>{' '}
                      {[own(group.name), own(group.composition), own(group.colour)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                  {missing.map((gap) => (
                    <Missing key={gapKey(gap)} gap={gap} />
                  ))}
                </div>
                <div
                  className='mx-auto grid min-h-0 shrink-0 gap-2 pt-2'
                  style={{
                    width: `${(across / columns) * 100}%`,
                    height: `calc(${rows * 100}cqh / ${rowBudget})`,
                    gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  }}
                >
                  {group.tiles.map((tile) => (
                    <Tile
                      key={tile.key}
                      dashed={!tile.shape}
                      className='min-h-0'
                      media={
                        <div
                          className='flex min-h-0 flex-1 items-center justify-center'
                          style={{ containerType: 'size' }}
                        >
                          {tile.shape && tile.box && (
                            <div
                              className='tp-piece'
                              style={{
                                width: `calc(min(100cqw, 100cqh) * ${tile.box.w / model.scaleCm})`,
                                height: `calc(min(100cqw, 100cqh) * ${tile.box.h / model.scaleCm})`,
                              }}
                            >
                              <PieceShape
                                piece={tile.shape.piece}
                                grainLayer={model.grainLayer}
                                hatchRole={group.hatchRole}
                                className='block h-full w-full'
                              />
                            </div>
                          )}
                        </div>
                      }
                      name={own(tile.name)}
                      sub={
                        <span className='flex flex-wrap justify-between gap-x-1'>
                          <span>{tile.codes}</span>
                          <span className='whitespace-nowrap text-textColor'>
                            {tile.qty != null && <b>{pcs(tile.qty, t)}</b>}
                            {tile.paired ? ' · L+R' : tile.symmetry && ` · ${tile.symmetry}`}
                            {group.key !== 'unassigned' && ` · ${group.label}`}
                            {tile.perimeterCm != null &&
                              ` · P ${formatNumber(tile.perimeterCm, 0)} cm`}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {!groups.length && model.emptyGap && <Missing gap={model.emptyGap} />}
        </div>
      </div>
    </TechpackSheet>
  );

  if (!overflow && tileCount <= pageCapacity && rowUnits <= rowBudget) {
    return sheet(model.groups, false, true);
  }

  const tilePages = paginateGroups(model.groups, columns, rowBudget);
  return <>{tilePages.map((groups, pageIndex) => sheet(groups, pageIndex > 0))}</>;
}
