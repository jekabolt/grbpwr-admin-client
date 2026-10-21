import { HeaderNote, SectionHeader, Tile } from 'ui';
import { PieceShape } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { derivePieces, type TechpackPieceGeometry } from '../derive-pieces';
import { formatNumber } from '../derive-shared';
import { Missing, Swatch } from './bits';
import { TechpackSheet, type TechpackPageProps } from '../sheet';

type PiecesPageProps = TechpackPageProps & { geometry?: TechpackPieceGeometry };

const pcs = (qty: number) => `${qty} ${qty === 1 ? 'pc' : 'pcs'}`;

export function PiecesPage({ techCard, orient, docline, n, geometry }: PiecesPageProps) {
  const model = derivePieces(techCard, geometry);
  const land = orient === 'land';
  const columns = land ? 5 : 3;
  return (
    <TechpackSheet orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} cut pieces × material`}
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
      <div className='mb-2 flex flex-wrap gap-x-6 gap-y-1 text-control'>
        {model.groups.map((group) => (
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
      <div className='flex min-h-0 flex-1 flex-col gap-2'>
        {model.groups.map((group) => {
          const across = Math.min(columns, group.tiles.length);
          const rows = Math.ceil(group.tiles.length / columns);
          return (
            <section key={group.key} className='flex min-h-0 flex-col' style={{ flex: rows }}>
              <div className='border-b border-textColor py-1 text-micro uppercase tracking-label'>
                <b>{group.label}</b>{' '}
                {[group.name, group.composition, group.colour].filter(Boolean).join(' · ')}
              </div>
              <div
                className='mx-auto grid min-h-0 flex-1 gap-2 pt-2'
                style={{
                  width: `${(across / columns) * 100}%`,
                  gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                }}
              >
                {group.tiles.map((tile) => {
                  const missing = tile.missing.filter((name) => name !== 'name');
                  return (
                    <Tile
                      key={tile.key}
                      dashed={!tile.shape}
                      tone={missing.length ? 'error' : 'default'}
                      className='min-h-0'
                      media={
                        <div
                          className='flex min-h-0 flex-1 items-center justify-center'
                          style={{ containerType: 'size' }}
                        >
                          {tile.shape && tile.box ? (
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
                          ) : (
                            <Missing name='dxf' />
                          )}
                        </div>
                      }
                      name={tile.name || <Missing name='name' />}
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
                          {missing.length > 0 && (
                            <span className='basis-full'>
                              <Missing name={missing.join(' · ')} />
                            </span>
                          )}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
        {!model.groups.length && <Missing name='pieces' />}
      </div>
    </TechpackSheet>
  );
}
