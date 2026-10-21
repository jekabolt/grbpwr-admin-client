import type { common_TechCard } from 'api/proto-http/admin';
import { DataTable, GroupLabel, HeaderNote, SectionHeader } from 'ui';
import { deriveColourways } from '../derive-colourways';
import { Missing, Swatch } from './bits';
import { TechpackSheet, type TechpackPageProps } from '../sheet';

export function ColourwaysContent({ techCard, n }: { techCard: common_TechCard; n: string }) {
  const model = deriveColourways(techCard);
  return (
    <div>
      <SectionHeader
        title={`${n} colourways`}
        action={
          <HeaderNote>
            {model.rows.length} · {model.fromBom ? 'from bom colours' : 'material recipe'}
          </HeaderNote>
        }
      />
      {model.rows.length ? (
        <>
          <DataTable variant='grid'>
            <thead>
              <tr>
                <th>colourway</th>
                {model.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.key}>
                  <td className='whitespace-nowrap'>
                    <Swatch colour={row.swatch} size={14} /> <b>{row.name}</b>
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.key}>
                      <span className='inline-flex items-center gap-1.5'>
                        <Swatch colour={cell.swatch} />
                        <span>{cell.value}</span>
                      </span>
                      {cell.sub && <div className='text-micro text-labelColor'>{cell.sub}</div>}
                      {cell.missing && (
                        <div>
                          <Missing name='recipe' />
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </DataTable>
          {model.fabricRows.length > 0 && (
            <>
              <GroupLabel flush className='mt-4'>
                pieces × colourway
              </GroupLabel>
              <DataTable variant='grid'>
                <thead>
                  <tr>
                    <th>bom</th>
                    <th data-align='left'>pieces</th>
                    {model.rows.map((row) => (
                      <th key={row.key}>{row.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.fabricRows.map((fabric) => (
                    <tr key={fabric.key}>
                      <td className='whitespace-nowrap'>
                        <b>{fabric.label}</b> {fabric.role}
                      </td>
                      <td data-align='left'>
                        {fabric.pieces.length ? (
                          fabric.pieces.join(' · ')
                        ) : (
                          <Missing name='pieces' />
                        )}
                      </td>
                      {fabric.cells.map((cell) => (
                        <td key={cell.key}>
                          <div className='whitespace-nowrap'>
                            <Swatch colour={cell.swatch} /> {cell.material}
                            {cell.colour && ` · ${cell.colour}`}
                          </div>
                          {cell.differs && (
                            <div className='text-micro text-labelColor'>
                              {cell.pieces.length ? (
                                cell.pieces.join(' · ')
                              ) : (
                                <Missing name='pieces' />
                              )}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </>
          )}
        </>
      ) : (
        <Missing name='colourways' />
      )}
    </div>
  );
}

export function ColourwaysPage({ techCard, orient, docline, n }: TechpackPageProps) {
  return (
    <TechpackSheet orient={orient} docline={docline}>
      <ColourwaysContent techCard={techCard} n={n} />
    </TechpackSheet>
  );
}
