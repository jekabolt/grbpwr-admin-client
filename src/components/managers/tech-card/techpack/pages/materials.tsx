import { DataTable, GroupLabel, HeaderNote, SectionHeader, TotalRow } from 'ui';
import { formatNumber } from '../derive-shared';
import { deriveMaterials } from '../derive-materials';
import { Missing, Swatch, TechpackDrawing } from './bits';
import { TechpackPaper, type TechpackPageProps } from './paper';

export function MaterialsPage({ techCard, orient, docline, n }: TechpackPageProps) {
  const model = deriveMaterials(techCard);
  const land = orient === 'land';
  return (
    <TechpackPaper orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} materials & trims`}
        action={
          <HeaderNote>
            bom {model.bomCount}
            {model.buttonTotal ? ` · buttons ${formatNumber(model.buttonTotal, 0)}` : ''}
          </HeaderNote>
        }
      />
      <div className={land ? 'flex min-h-0 flex-1 gap-8' : 'flex min-h-0 flex-1 flex-col gap-4'}>
        <div className={land ? 'flex w-3/5 flex-col gap-4' : 'flex flex-col gap-4'}>
          <div>
            <GroupLabel flush>fabrics</GroupLabel>
            <DataTable>
              <thead>
                <tr>
                  <th>bom</th>
                  <th data-align='left'>material · colour</th>
                  <th data-align='left'>composition</th>
                  <th>width</th>
                  <th>gsm</th>
                  <th>pcs</th>
                  <th>consumption</th>
                  <th>price</th>
                </tr>
              </thead>
              <tbody>
                {model.fabrics.map((fabric) => (
                  <tr key={fabric.refKey}>
                    <td className='whitespace-nowrap'>
                      <Swatch colour={fabric.swatch} /> <b>{fabric.key}</b>
                    </td>
                    <td data-align='left'>
                      {[fabric.name, fabric.colour].filter(Boolean).join(' · ') || (
                        <Missing name='material' />
                      )}
                      <div className='text-micro uppercase text-labelColor'>{fabric.role}</div>
                    </td>
                    <td data-align='left'>{fabric.composition}</td>
                    <td className='whitespace-nowrap'>
                      {fabric.widthCm == null ? (
                        <Missing name='width' />
                      ) : (
                        `${formatNumber(fabric.widthCm)} cm`
                      )}
                    </td>
                    <td>{fabric.weightGsm == null ? null : formatNumber(fabric.weightGsm, 0)}</td>
                    <td>{fabric.pieceCount || <Missing name='pieces' />}</td>
                    <td className='whitespace-nowrap'>
                      {fabric.consumptionM == null ? (
                        <Missing name='marker' />
                      ) : (
                        <>
                          {formatNumber(fabric.consumptionM, 2)} m
                          {fabric.efficiencyPct != null &&
                            ` · ${formatNumber(fabric.efficiencyPct)}%`}
                        </>
                      )}
                    </td>
                    <td className='whitespace-nowrap'>
                      {fabric.unitPrice == null
                        ? null
                        : `${formatNumber(fabric.unitPrice, 2)} ${fabric.currency}${fabric.unit ? `/${fabric.unit}` : ''}`}
                    </td>
                  </tr>
                ))}
                {!model.fabrics.length && (
                  <tr>
                    <td>
                      <Missing name='fabrics' />
                    </td>
                    <td colSpan={7} />
                  </tr>
                )}
                {model.missingInterlining.length > 0 && (
                  <tr>
                    <td>
                      <Missing name='interlining' />
                    </td>
                    <td data-align='left' colSpan={7} className='text-labelColor'>
                      {model.missingInterlining.join(' · ')}
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </div>

          {model.thread.map((thread) => (
            <div key={thread.key}>
              <GroupLabel
                flush
                action={<HeaderNote>{thread.operationNumbers.length} ops</HeaderNote>}
              >
                thread
              </GroupLabel>
              <DataTable>
                <thead>
                  <tr>
                    <th>colour</th>
                    <th data-align='left'>article</th>
                    <th data-align='left'>composition</th>
                    <th data-align='left'>supplier</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className='whitespace-nowrap'>
                      <Swatch colour={thread.swatch} /> {thread.colour}
                    </td>
                    <td data-align='left'>{thread.name || <Missing name='article' />}</td>
                    <td data-align='left'>{thread.composition}</td>
                    <td data-align='left'>{thread.supplier}</td>
                  </tr>
                  {thread.operationNumbers.length > 0 && (
                    <tr>
                      <td className='text-labelColor'>ops</td>
                      <td data-align='left' colSpan={3}>
                        {thread.operationNumbers.join(' · ')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </DataTable>
            </div>
          ))}

          {model.hardware.map((item) => {
            const rows = item.spots.length
              ? item.spots
              : [
                  {
                    key: `${item.key}-missing`,
                    pin: '',
                    where: '',
                    operationNumber: undefined,
                    source: '',
                    qty: item.qty,
                    x: 50,
                    y: 50,
                    hasPosition: false,
                    onFront: false,
                  },
                ];
            return (
              <div key={item.key}>
                <GroupLabel
                  flush
                  action={item.detail ? <HeaderNote>{item.detail}</HeaderNote> : undefined}
                >
                  {item.name || item.kind}
                </GroupLabel>
                <DataTable>
                  <thead>
                    <tr>
                      <th>pin</th>
                      <th data-align='left'>where</th>
                      <th>ops</th>
                      <th data-align='left'>source</th>
                      <th>qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((spot) => (
                      <tr key={spot.key}>
                        <td>
                          {spot.pin ? (
                            <span className='inline-flex size-4 items-center justify-center bg-textColor text-nano text-bgColor'>
                              {spot.pin}
                            </span>
                          ) : (
                            <Missing name='pin' />
                          )}
                        </td>
                        <td data-align='left'>{spot.where || <Missing name='placement' />}</td>
                        <td>{spot.operationNumber ?? <Missing name='operation' />}</td>
                        <td data-align='left' className='text-labelColor'>
                          {spot.source}
                        </td>
                        <td>
                          {spot.qty == null ? <Missing name='qty' /> : formatNumber(spot.qty, 2)}
                        </td>
                      </tr>
                    ))}
                    <TotalRow>
                      <td />
                      <td data-align='left'>per garment</td>
                      <td />
                      <td />
                      <td>
                        {item.qty == null ? <Missing name='qty' /> : formatNumber(item.qty, 2)}
                      </td>
                    </TotalRow>
                  </tbody>
                </DataTable>
              </div>
            );
          })}
        </div>
        <div className='flex min-h-0 flex-1 items-center justify-center border border-borderColor'>
          <TechpackDrawing
            media={model.front}
            name='front'
            pins={model.pins.map((pin) => ({
              ...pin,
              highlighted: pin.missingQty,
            }))}
            height={land ? 560 : 300}
            caption='front · trims'
          />
        </div>
      </div>
    </TechpackPaper>
  );
}
