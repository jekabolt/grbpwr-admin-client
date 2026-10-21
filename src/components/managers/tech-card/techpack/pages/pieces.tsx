import { HeaderNote, SectionHeader, Tile } from 'ui';
import { PieceShape } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { derivePieces, type TechpackPieceGeometry } from '../derive-pieces';
import { formatNumber } from '../derive-shared';
import { Missing, Swatch } from './bits';
import {
  continuedTitle,
  TechpackSheet,
  type TechpackPageProps,
  useTechpackOverflow,
} from '../sheet';

type PiecesPageProps = TechpackPageProps & { geometry?: TechpackPieceGeometry };

const pcs = (qty: number) => `${qty} ${qty === 1 ? 'pc' : 'pcs'}`;

function missingCounts(tiles: readonly { missing: readonly string[] }[]) {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    for (const name of tile.missing) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts);
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
  const model = derivePieces(techCard, geometry);
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
          title={continuedTitle(n, 'cut pieces × material', continued)}
          action={
            <HeaderNote>
              {[
                `${model.panelCount} panels`,
                model.paired && 'pairs grouped',
                model.grainLayer && 'grain marked',
              ]
                .filter(Boolean)
                .join(' · ')}
            </HeaderNote>
          }
        />
        {groups.some((group) => group.role !== 'unassigned') && (
          <div className='mb-2 flex flex-wrap gap-x-6 gap-y-1 text-control'>
            {groups
              .filter((group) => group.role !== 'unassigned')
              .map((group) => (
                <span key={group.key} className='flex items-center gap-2 whitespace-nowrap'>
                  <b>{group.label}</b>
                  <span>{group.name}</span>
                  <Swatch colour={group.swatch} />
                  <span>{[group.composition, group.colour].filter(Boolean).join(' · ')}</span>
                  <span className='text-labelColor'>
                    {pcs(group.panelCount)}
                    {model.hasGeometry && ` · ${formatNumber(group.netAreaM2, 2)} m² net`}
                  </span>
                </span>
              ))}
          </div>
        )}
        <div className='flex min-h-0 flex-1 flex-col gap-2' style={{ containerType: 'size' }}>
          {groups.map((group) => {
            const across = Math.min(columns, group.tiles.length);
            const rows = Math.ceil(group.tiles.length / columns);
            const missing = missingCounts(group.tiles);
            return (
              <section key={group.key} className='flex min-h-0 flex-none flex-col'>
                <div className='flex flex-wrap items-baseline gap-x-3 border-b border-textColor py-1 text-micro uppercase tracking-label'>
                  {group.role !== 'unassigned' && (
                    <span>
                      <b>{group.label}</b>{' '}
                      {[group.name, group.composition, group.colour].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {missing.map(([name, count]) => (
                    <span key={name} className='font-bold text-error' data-missing={String(count)}>
                      ! {name} × {count}
                    </span>
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
                      name={tile.name}
                      sub={
                        <span className='flex flex-wrap justify-between gap-x-1'>
                          <span>{tile.codes}</span>
                          <span className='whitespace-nowrap text-textColor'>
                            {tile.qty != null && <b>{pcs(tile.qty)}</b>}
                            {tile.paired ? ' · L+R' : tile.symmetry && ` · ${tile.symmetry}`}
                            {` · ${group.label}`}
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
          {!groups.length && <Missing name='pieces' />}
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
