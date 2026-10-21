import { HeaderNote, SectionHeader, Tile } from 'ui';
import { PieceShape } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { derivePieces, type TechpackPieceGeometry } from '../derive-pieces';
import { formatNumber } from '../derive-shared';
import { Missing, Swatch } from './bits';
import { TechpackPaper, type TechpackPageProps } from './paper';

type PiecesPageProps = TechpackPageProps & { geometry?: TechpackPieceGeometry };

export function PiecesPage({ techCard, orient, docline, n, geometry }: PiecesPageProps) {
  const model = derivePieces(techCard, geometry);
  const land = orient === 'land';
  return (
    <TechpackPaper orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} cut pieces × material`}
        action={
          <HeaderNote>
            {model.panelCount} panels · {model.pieceCount} pieces · grain marked
          </HeaderNote>
        }
      />
      <div className='mb-2 flex flex-wrap gap-x-6 gap-y-1 text-control'>
        {model.groups.map((group) => (
          <span key={group.key} className='flex items-center gap-2 whitespace-nowrap'>
            <span className='inline-flex size-3 border border-textColor' />
            <b>{group.label}</b>
            <span>{group.role}</span>
            <Swatch colour={group.swatch} />
            <span>{[group.name, group.colour].filter(Boolean).join(' · ')}</span>
            <span className='text-labelColor'>
              {group.panelCount} panels
              {model.hasGeometry && ` · ${formatNumber(group.netAreaM2, 2)} m² net`}
            </span>
          </span>
        ))}
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-2'>
        {model.groups.map((group) => {
          const columns = land ? 5 : 3;
          const rows = Math.ceil(group.pieces.length / columns);
          return (
            <section key={group.key} className='flex min-h-0 flex-col' style={{ flex: rows }}>
              <div className='border-b border-textColor py-1 text-micro uppercase tracking-label'>
                <b>{group.label}</b> {group.role} · {group.name}
                {group.colour && ` · ${group.colour}`}
              </div>
              <div
                className='grid min-h-0 flex-1 gap-2 pt-2'
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                }}
              >
                {group.pieces.map((piece) => (
                  <Tile
                    key={piece.key}
                    dashed={!piece.shape}
                    tone={piece.missing.length ? 'error' : 'default'}
                    className='min-h-0'
                    media={
                      <div className='flex min-h-0 flex-1 items-center justify-center'>
                        {piece.shape ? (
                          <PieceShape
                            piece={piece.shape.piece}
                            grainLayer={model.grainLayer}
                            hatchRole={group.hatchRole}
                            className='block h-full w-full'
                          />
                        ) : (
                          <Missing name='dxf' />
                        )}
                      </div>
                    }
                    name={piece.name || <Missing name='name' />}
                    sub={
                      <span className='flex flex-wrap justify-between gap-x-1'>
                        <span className='text-textColor'>
                          <b>{piece.qty == null ? <Missing name='qty' /> : `${piece.qty} pcs`}</b>
                          {piece.symmetry && ` · ${piece.symmetry}`}
                        </span>
                        <span className='text-textColor'>
                          {piece.grainline || <Missing name='grain' />}
                          {piece.perimeterCm != null &&
                            ` · P ${formatNumber(piece.perimeterCm, 0)} cm`}
                        </span>
                        {piece.missing.length > 0 && (
                          <span className='basis-full'>
                            <Missing name={piece.missing.join(' · ')} />
                          </span>
                        )}
                      </span>
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
        {!model.groups.length && <Missing name='pieces' />}
      </div>
    </TechpackPaper>
  );
}
