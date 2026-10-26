import { DataTable, GroupLabel, HeaderNote, SectionHeader, TotalRow } from 'ui';
import { deriveMaterials, type MaterialsModel, type Spot } from '../derive-materials';
import { formatNumber } from '../derive-shared';
import {
  chunksOf,
  continuedTitle,
  TechpackSheet,
  type TechpackPageProps,
  useTechpackOverflow,
} from '../sheet';
import { Missing, Swatch, TechpackDrawing } from './bits';

type Hardware = MaterialsModel['hardware'][number] & { showTotal?: boolean };
type PageModel = Omit<MaterialsModel, 'hardware'> & { hardware: Hardware[] };

function MaterialsBody({
  model,
  land,
  n,
  continued = false,
  showDrawing = true,
  showFabrics = true,
}: {
  model: PageModel;
  land: boolean;
  n: string;
  continued?: boolean;
  showDrawing?: boolean;
  showFabrics?: boolean;
}) {
  return (
    <>
      <SectionHeader
        title={continuedTitle(n, 'materials & trims', continued)}
        action={
          <HeaderNote>
            bom {model.bomCount}
            {model.buttonTotal ? ` · buttons ${formatNumber(model.buttonTotal, 0)}` : ''}
          </HeaderNote>
        }
      />
      <div
        className={
          land && showDrawing ? 'flex min-h-0 flex-1 gap-8' : 'flex min-h-0 flex-1 flex-col gap-4'
        }
      >
        <div
          className={
            land && showDrawing ? 'flex w-3/5 shrink-0 flex-col gap-4' : 'flex flex-col gap-4'
          }
        >
          {showFabrics && (
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
                        {[fabric.name, fabric.colour].filter(Boolean).join(' · ') ||
                          (fabric.gaps.material && <Missing gap={fabric.gaps.material} />)}
                        <div className='text-micro uppercase text-labelColor'>{fabric.role}</div>
                      </td>
                      <td data-align='left'>{fabric.composition}</td>
                      <td className='whitespace-nowrap'>
                        {fabric.widthCm == null
                          ? fabric.gaps.width && <Missing gap={fabric.gaps.width} />
                          : `${formatNumber(fabric.widthCm)} cm`}
                      </td>
                      <td>{fabric.weightGsm == null ? null : formatNumber(fabric.weightGsm, 0)}</td>
                      <td>
                        {fabric.pieceCount ||
                          (fabric.gaps.pieces && <Missing gap={fabric.gaps.pieces} />)}
                      </td>
                      <td className='whitespace-nowrap'>
                        {fabric.consumptionM == null ? (
                          fabric.gaps.marker && <Missing gap={fabric.gaps.marker} />
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
                      <td>{model.gaps.fabrics && <Missing gap={model.gaps.fabrics} />}</td>
                      <td colSpan={7} />
                    </tr>
                  )}
                  {model.missingInterlining.length > 0 && (
                    <tr>
                      <td>{model.gaps.interlining && <Missing gap={model.gaps.interlining} />}</td>
                      <td data-align='left' colSpan={7} className='text-labelColor'>
                        {model.missingInterlining.join(' · ')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </DataTable>
            </div>
          )}

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
                    <td data-align='left'>
                      {thread.name || (thread.articleGap && <Missing gap={thread.articleGap} />)}
                    </td>
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
            const rows: Spot[] = item.spots.length
              ? item.spots
              : [
                  {
                    key: `${item.key}-missing`,
                    pin: '',
                    where: '',
                    operationNumbers: [],
                    source: '',
                    qty: item.qty,
                    x: 50,
                    y: 50,
                    hasPosition: false,
                    onFront: false,
                    gaps: item.emptyGaps,
                  },
                ];
            return (
              <div key={`${item.key}-${rows[0]?.key ?? 'empty'}`}>
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
                            spot.gaps?.pin && <Missing gap={spot.gaps.pin} />
                          )}
                        </td>
                        <td data-align='left'>
                          {spot.where ||
                            (spot.gaps?.placement && <Missing gap={spot.gaps.placement} />)}
                        </td>
                        <td>
                          {spot.operationNumbers.length
                            ? spot.operationNumbers.join(' · ')
                            : spot.gaps?.operation && <Missing gap={spot.gaps.operation} />}
                        </td>
                        <td data-align='left' className='text-labelColor'>
                          {spot.source}
                        </td>
                        <td>
                          {spot.qty == null
                            ? spot.gaps?.qty && <Missing gap={spot.gaps.qty} />
                            : formatNumber(spot.qty, 2)}
                        </td>
                      </tr>
                    ))}
                    {item.showTotal !== false && (
                      <TotalRow>
                        <td />
                        <td data-align='left'>per garment</td>
                        <td />
                        <td />
                        <td>
                          {item.qty == null
                            ? item.qtyGap && <Missing gap={item.qtyGap} />
                            : formatNumber(item.qty, 2)}
                        </td>
                      </TotalRow>
                    )}
                  </tbody>
                </DataTable>
              </div>
            );
          })}
        </div>
        {showDrawing && (
          <div className='flex min-h-0 min-w-0 flex-1 items-center justify-center border border-borderColor'>
            <TechpackDrawing
              media={model.front}
              name='front'
              pins={model.pins.map((pin) => ({
                ...pin,
                highlighted: pin.missingQty,
              }))}
              height={land ? 560 : 300}
              caption='front · trims'
              missingGap={model.gaps.front}
            />
          </div>
        )}
      </div>
    </>
  );
}

type MaterialBlock =
  | { kind: 'fabrics'; weight: number; fabrics: MaterialsModel['fabrics']; interlining: string[] }
  | { kind: 'thread'; weight: number; thread: MaterialsModel['thread'][number] }
  | { kind: 'hardware'; weight: number; hardware: Hardware };

function packBlocks(blocks: MaterialBlock[], land: boolean): MaterialBlock[][] {
  const pages: MaterialBlock[][] = [];
  let page: MaterialBlock[] = [];
  let weight = 0;
  for (const block of blocks) {
    const capacity = land ? 15 : pages.length === 0 ? 8 : 20;
    if (page.length && weight + block.weight > capacity) {
      pages.push(page);
      page = [];
      weight = 0;
    }
    page.push(block);
    weight += block.weight;
  }
  if (page.length) pages.push(page);
  return pages;
}

export function MaterialsPage({ techCard, orient, docline, n }: TechpackPageProps) {
  const model = deriveMaterials(techCard);
  const land = orient === 'land';
  const itemCount =
    model.fabrics.length +
    model.thread.length +
    model.hardware.reduce((sum, item) => sum + Math.max(1, item.spots.length), 0);
  const paginationKey = `${techCard.id ?? 0}:${orient}:${itemCount}:${model.missingInterlining.length}`;
  const { contentRef, overflow } = useTechpackOverflow(paginationKey);

  if (!overflow) {
    return (
      <TechpackSheet orient={orient} docline={docline}>
        <div ref={contentRef} className='contents'>
          <MaterialsBody model={model} land={land} n={n} />
        </div>
      </TechpackSheet>
    );
  }

  const blocks: MaterialBlock[] = chunksOf(model.fabrics, 5).map((fabrics, index) => ({
    kind: 'fabrics',
    weight: fabrics.length + 2 + (index === 0 && model.missingInterlining.length ? 1 : 0),
    fabrics,
    interlining: index === 0 ? model.missingInterlining : [],
  }));
  if (!model.fabrics.length && model.missingInterlining.length) {
    blocks.push({
      kind: 'fabrics',
      weight: 3,
      fabrics: [],
      interlining: model.missingInterlining,
    });
  } else if (!model.fabrics.length) {
    blocks.push({ kind: 'fabrics', weight: 2, fabrics: [], interlining: [] });
  }
  blocks.push(...model.thread.map((thread) => ({ kind: 'thread' as const, weight: 4, thread })));
  for (const item of model.hardware) {
    const spots = item.spots.length ? item.spots : ([] as Spot[]);
    const spotPages = spots.length ? chunksOf(spots, 4) : [[]];
    spotPages.forEach((pageSpots, index) => {
      blocks.push({
        kind: 'hardware',
        weight: Math.max(1, pageSpots.length) + 3,
        hardware: {
          ...item,
          spots: pageSpots,
          showTotal: index === spotPages.length - 1,
        },
      });
    });
  }

  const pages = packBlocks(blocks, land);
  return (
    <>
      {pages.map((page, index) => {
        const pageModel: PageModel = {
          ...model,
          fabrics: page.flatMap((block) => (block.kind === 'fabrics' ? block.fabrics : [])),
          missingInterlining: page.flatMap((block) =>
            block.kind === 'fabrics' ? block.interlining : [],
          ),
          thread: page.flatMap((block) => (block.kind === 'thread' ? [block.thread] : [])),
          hardware: page.flatMap((block) => (block.kind === 'hardware' ? [block.hardware] : [])),
        };
        return (
          <TechpackSheet key={index} orient={orient} docline={docline}>
            <MaterialsBody
              model={pageModel}
              land={land}
              n={n}
              continued={index > 0}
              showDrawing={index === 0}
              showFabrics={page.some((block) => block.kind === 'fabrics')}
            />
          </TechpackSheet>
        );
      })}
    </>
  );
}
