import { common_MediaFull, common_TechCard, googletype_Decimal } from 'api/proto-http/admin';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import {
  approvalStateLabel,
  formatTechCardDate,
  stageLabel,
} from 'components/managers/tech-cards/components/utils';
import {
  techCardBomSectionOptions,
  techCardFabricDirectionOptions,
  techCardGenderOptions,
  techCardIssueSeverityOptions,
  techCardIssueStatusOptions,
  techCardLabDipStatusOptions,
  techCardLabelTypeOptions,
  techCardMeasurementUnitOptions,
  techCardMediaKindOptions,
  techCardSignoffSectionOptions,
  techCardSignoffStateOptions,
} from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { ReactNode, useMemo } from 'react';
import { decimalToInput } from 'utils/decimal';

const mapOf = (opts: ReadonlyArray<{ value: string; label: string }>) =>
  Object.fromEntries(opts.map((o) => [o.value, o.label])) as Record<string, string>;

const genderL = mapOf(techCardGenderOptions);
const unitL = mapOf(techCardMeasurementUnitOptions);
const mediaKindL = mapOf(techCardMediaKindOptions);
const bomSectionL = mapOf(techCardBomSectionOptions);
const fabricDirL = mapOf(techCardFabricDirectionOptions);
const labDipL = mapOf(techCardLabDipStatusOptions);
const labelTypeL = mapOf(techCardLabelTypeOptions);
const issueSevL = mapOf(techCardIssueSeverityOptions);
const issueStatusL = mapOf(techCardIssueStatusOptions);
const signoffSectionL = mapOf(techCardSignoffSectionOptions);
const signoffStateL = mapOf(techCardSignoffStateOptions);

const dec = (d?: googletype_Decimal): string => decimalToInput(d) || '';
const has = (a?: unknown[]): boolean => Array.isArray(a) && a.length > 0;
const num = (s?: string): number => {
  const n = parseFloat(s ?? '');
  return Number.isNaN(n) ? NaN : n;
};

const TD = 'border border-black px-1.5 py-1 align-top';
const TH = 'border border-black px-1.5 py-1 text-left font-semibold bg-neutral-100 uppercase';

function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='mb-5'>
      <h2 className='mb-2 break-after-avoid bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white'>
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v?: ReactNode }) {
  const empty = v == null || v === '' || v === '—';
  return (
    <div className='flex gap-2 break-inside-avoid border-b border-neutral-200 py-0.5 text-[11px] leading-tight'>
      <span className='w-36 shrink-0 uppercase tracking-wide text-neutral-500'>{k}</span>
      <span className='font-medium'>{empty ? '—' : v}</span>
    </div>
  );
}

// Full printable tech-pack document for one tech card. Pure presentational — reads the
// loaded card (server truth, so save before exporting). Self-contained black-on-white so
// it prints/PDFs identically regardless of the app theme. See print-page for the @media
// print isolation that hides app chrome.
export function TechPackDocument({ techCard }: { techCard: common_TechCard }) {
  const tc = techCard.techCard;
  const { dictionary } = useDictionary();
  const { data: models } = useAllModels();

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? [])
      if (s.id != null) m.set(s.id, formatSizeName(s.name ?? `#${s.id}`));
    return m;
  }, [dictionary?.sizes]);

  const categoryName = useMemo(() => {
    const c = (dictionary?.categories ?? []).find((x) => x.id === tc?.categoryId);
    return c?.name ?? (tc?.categoryId ? `#${tc.categoryId}` : '');
  }, [dictionary?.categories, tc?.categoryId]);

  const modelName = useMemo(() => {
    const m = (models ?? []).find((x) => x.id === tc?.baseModelId);
    return m?.model?.name ?? (tc?.baseModelId ? `#${tc.baseModelId}` : '');
  }, [models, tc?.baseModelId]);

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard.resolvedMedia ?? [])
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    return m;
  }, [techCard.resolvedMedia]);

  if (!tc) return null;

  // `constructor` is an Object.prototype key — when the backend omits it, tc.constructor is
  // the Object constructor function, not a string. Guard so React never renders a function.
  const patternMaker = typeof tc.constructor === 'string' ? tc.constructor : '';
  const sizeName = (id?: number) => (id ? (sizeById.get(id) ?? `#${id}`) : '—');
  const unitAbbr = tc.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_MM' ? 'mm' : 'cm';
  const sizeIds = tc.sizeIds ?? [];
  const colorways = tc.colorways ?? [];
  const captionById = new Map<number, { caption?: string; kind?: string }>();
  for (const m of tc.media ?? [])
    if (m.mediaId != null) captionById.set(m.mediaId, { caption: m.caption, kind: m.kind });

  return (
    <div id='techpack-print' className='mx-auto max-w-[210mm] bg-white px-8 py-6 text-black'>
      {/* COVER / IDENTITY */}
      <header className='mb-5 border-b-2 border-black pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <div className='text-[10px] uppercase tracking-[0.2em] text-neutral-500'>
              {tc.brand || 'GRBPWR'} · tech pack
            </div>
            <div className='text-2xl font-bold uppercase leading-tight'>{tc.name || 'untitled'}</div>
            <div className='text-sm'>
              style <span className='font-semibold'>{tc.styleNumber || '—'}</span>
              {tc.collection ? ` · ${tc.collection}` : ''}
              {tc.season ? ` · ${tc.season}` : ''}
            </div>
          </div>
          <div className='text-right text-[11px] leading-tight'>
            <div className='font-semibold uppercase'>{stageLabel(tc.stage)}</div>
            <div>{approvalStateLabel(tc.approvalState)}</div>
            <div className='text-neutral-500'>
              v{tc.version || '—'} · {formatTechCardDate(techCard.updatedAt)}
            </div>
          </div>
        </div>
      </header>

      <div className='grid grid-cols-2 gap-x-8'>
        <div>
          <KV k='gender' v={genderL[tc.targetGender ?? ''] ?? '—'} />
          <KV k='category' v={categoryName} />
          <KV k='base model' v={modelName} />
          <KV k='sample size' v={sizeName(tc.baseSampleSizeId)} />
          <KV k='measurement unit' v={unitL[tc.measurementUnit ?? ''] ?? unitAbbr} />
          <KV k='size range' v={sizeIds.map(sizeName).join(', ')} />
        </div>
        <div>
          <KV k='designer' v={tc.designer} />
          <KV k='pattern maker' v={patternMaker} />
          <KV k='technologist' v={tc.technologist} />
          <KV k='approved by' v={tc.approvedBy} />
          <KV
            k='target cost'
            v={dec(tc.targetCost) && `${dec(tc.targetCost)} ${tc.currency ?? ''}`.trim()}
          />
          <KV
            k='target retail'
            v={
              dec(tc.targetRetailPrice) &&
              `${dec(tc.targetRetailPrice)} ${tc.currency ?? ''}`.trim()
            }
          />
        </div>
      </div>

      {/* DESCRIPTION */}
      {(tc.concept ||
        tc.description ||
        tc.silhouette ||
        tc.collar ||
        tc.fastening ||
        tc.pockets ||
        tc.sleeveCuff ||
        tc.extraDetails ||
        tc.topstitching ||
        tc.auxMaterials ||
        tc.notes) && (
        <div className='mb-5 mt-4'>
          <Sheet title='description'>
            {tc.concept && <p className='mb-2 text-xs italic'>{tc.concept}</p>}
            <div className='grid grid-cols-2 gap-x-8'>
              <div>
                <KV k='description' v={tc.description} />
                <KV k='silhouette' v={tc.silhouette} />
                <KV k='collar' v={tc.collar} />
                <KV k='fastening' v={tc.fastening} />
                <KV k='pockets' v={tc.pockets} />
              </div>
              <div>
                <KV k='sleeve / cuff' v={tc.sleeveCuff} />
                <KV k='topstitching' v={tc.topstitching} />
                <KV k='extra details' v={tc.extraDetails} />
                <KV k='aux materials' v={tc.auxMaterials} />
                <KV k='notes' v={tc.notes} />
              </div>
            </div>
          </Sheet>
        </div>
      )}

      {/* SKETCHES + CALLOUTS */}
      {has(tc.media) && (
        <Sheet title='technical sketch'>
          <div className='flex flex-wrap gap-4'>
            {(tc.media ?? []).map((m, i) => {
              const full = m.mediaId != null ? mediaById.get(m.mediaId) : undefined;
              const url = full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';
              const meta = captionById.get(m.mediaId ?? -1);
              const pins = (tc.callouts ?? []).filter((c) => c.mediaId === m.mediaId);
              if (!url) return null;
              return (
                <figure key={i} className='break-inside-avoid'>
                  <div className='relative inline-block border border-black'>
                    <img src={url} alt='' className='block max-h-[280px] w-auto' />
                    {pins.map((c, j) => {
                      const x = num(dec(c.posX));
                      const y = num(dec(c.posY));
                      if (Number.isNaN(x) || Number.isNaN(y)) return null;
                      return (
                        <span
                          key={j}
                          className='absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-black text-[8px] font-bold text-white'
                          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                        >
                          {c.number || j + 1}
                        </span>
                      );
                    })}
                  </div>
                  <figcaption className='mt-1 text-[10px] uppercase text-neutral-500'>
                    {mediaKindL[meta?.kind ?? ''] ?? 'view'}
                    {meta?.caption ? ` · ${meta.caption}` : ''}
                  </figcaption>
                </figure>
              );
            })}
          </div>

          {has(tc.callouts) && (
            <table className='mt-3 w-full border-collapse text-[10px]'>
              <thead>
                <tr>
                  <th className={`${TH} w-8`}>#</th>
                  <th className={TH}>part</th>
                  <th className={TH}>dimensions</th>
                  <th className={TH}>description</th>
                </tr>
              </thead>
              <tbody>
                {(tc.callouts ?? []).map((c, i) => (
                  <tr key={i} className='break-inside-avoid'>
                    <td className={`${TD} text-center font-semibold`}>{c.number ?? i + 1}</td>
                    <td className={TD}>{c.part || '—'}</td>
                    <td className={TD}>{c.dimensions || '—'}</td>
                    <td className={TD}>{c.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sheet>
      )}

      {/* SIZE QUANTITIES */}
      {has(tc.sizeQuantities) && (
        <Sheet title='size run'>
          <table className='w-full border-collapse text-[11px]'>
            <thead>
              <tr>
                {(tc.sizeQuantities ?? []).map((sq, i) => (
                  <th key={i} className={`${TH} text-center`}>
                    {sizeName(sq.sizeId)}
                  </th>
                ))}
                <th className={`${TH} text-center`}>total</th>
              </tr>
            </thead>
            <tbody>
              <tr className='break-inside-avoid'>
                {(tc.sizeQuantities ?? []).map((sq, i) => (
                  <td key={i} className={`${TD} text-center`}>
                    {sq.orderQty ?? 0}
                  </td>
                ))}
                <td className={`${TD} text-center font-semibold`}>
                  {(tc.sizeQuantities ?? []).reduce((s, sq) => s + (sq.orderQty ?? 0), 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </Sheet>
      )}

      {/* BILL OF MATERIALS */}
      {has(tc.bomItems) && (
        <Sheet title='bill of materials'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={TH}>section</th>
                <th className={TH}>material</th>
                <th className={TH}>placement</th>
                <th className={TH}>supplier</th>
                <th className={TH}>colour</th>
                <th className={TH}>fabric</th>
                <th className={`${TH} text-right`}>cons. / qty</th>
                <th className={`${TH} text-right`}>unit price</th>
                <th className={`${TH} text-right`}>total</th>
              </tr>
            </thead>
            <tbody>
              {(tc.bomItems ?? []).map((b, i) => {
                const consumption = dec(b.quantity) || dec(b.consumption);
                const fabric = [
                  dec(b.fabricWidth) && `${dec(b.fabricWidth)}cm`,
                  dec(b.fabricWeightGsm) && `${dec(b.fabricWeightGsm)}g/m²`,
                  b.fabricDirection && b.fabricDirection !== 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN'
                    ? fabricDirL[b.fabricDirection]
                    : '',
                  dec(b.wastagePercent) && `+${dec(b.wastagePercent)}%`,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <tr key={i} className='break-inside-avoid'>
                    <td className={TD}>{bomSectionL[b.section ?? ''] ?? '—'}</td>
                    <td className={TD}>
                      <div className='font-medium'>{b.name || '—'}</div>
                      {b.composition && <div className='text-neutral-500'>{b.composition}</div>}
                    </td>
                    <td className={TD}>{b.placement || '—'}</td>
                    <td className={TD}>
                      {b.supplier || '—'}
                      {b.supplierRef ? ` (${b.supplierRef})` : ''}
                    </td>
                    <td className={TD}>{b.color || '—'}</td>
                    <td className={TD}>{fabric || '—'}</td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {consumption ? `${consumption} ${b.unit ?? ''}` : '—'}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {dec(b.unitPrice) ? `${dec(b.unitPrice)} ${b.currency ?? ''}` : '—'}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right font-medium`}>
                      {dec(b.lineTotal) ? `${dec(b.lineTotal)} ${b.currency ?? ''}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Sheet>
      )}

      {/* COLOURWAYS */}
      {has(colorways) && (
        <Sheet title='colourways'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={TH}>code</th>
                <th className={TH}>name</th>
                <th className={TH}>pantone</th>
                <th className={TH}>hex</th>
                <th className={TH}>lab-dip</th>
                <th className={TH}>round</th>
                <th className={TH}>decided</th>
              </tr>
            </thead>
            <tbody>
              {colorways.map((c, i) => (
                <tr key={i} className='break-inside-avoid'>
                  <td className={TD}>{c.code || '—'}</td>
                  <td className={TD}>{c.name || '—'}</td>
                  <td className={TD}>
                    {c.pantone || '—'}
                    {c.pantoneSystem ? ` ${c.pantoneSystem}` : ''}
                  </td>
                  <td className={TD}>
                    <span className='inline-flex items-center gap-1'>
                      {c.hex && (
                        <span
                          className='inline-block size-3 border border-black'
                          style={{ backgroundColor: c.hex }}
                        />
                      )}
                      {c.hex || '—'}
                    </span>
                  </td>
                  <td className={TD}>{labDipL[c.labDipStatus ?? ''] ?? '—'}</td>
                  <td className={`${TD} text-center`}>{c.labDipRound || '—'}</td>
                  <td className={TD}>
                    {formatTechCardDate(c.labDipDecidedAt)}
                    {c.labDipDecidedBy ? ` · ${c.labDipDecidedBy}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}

      {/* POINTS OF MEASURE */}
      {has(tc.pomPoints) && (
        <Sheet title={`points of measure (${unitAbbr})`}>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={`${TH} w-10`}>code</th>
                <th className={TH}>point</th>
                <th className={`${TH} text-right`}>tol ±</th>
                {sizeIds.map((id) => (
                  <th key={id} className={`${TH} text-right`}>
                    {sizeName(id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tc.pomPoints ?? []).map((p, i) => {
                const gradeBySize = new Map<number, string>();
                for (const g of p.grades ?? [])
                  if (g.sizeId != null) gradeBySize.set(g.sizeId, dec(g.value));
                const tol =
                  dec(p.tolerancePlus) || dec(p.toleranceMinus)
                    ? `+${dec(p.tolerancePlus) || '0'} / -${dec(p.toleranceMinus) || '0'}`
                    : '—';
                return (
                  <tr key={i} className='break-inside-avoid'>
                    <td className={`${TD} font-semibold`}>{p.code || i + 1}</td>
                    <td className={TD}>
                      <div className='font-medium'>{p.name || '—'}</div>
                      {p.howToMeasure && (
                        <div className='text-neutral-500'>{p.howToMeasure}</div>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>{tol}</td>
                    {sizeIds.map((id) => (
                      <td key={id} className={`${TD} text-right`}>
                        {gradeBySize.get(id) || '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Sheet>
      )}

      {/* CONSTRUCTION + OPERATIONS */}
      {(tc.construction || has(tc.operations)) && (
        <Sheet title='construction'>
          {tc.construction && (
            <div className='mb-3 grid grid-cols-2 gap-x-8'>
              <div>
                <KV k='main stitch' v={tc.construction.mainStitchType} />
                <KV k='stitch density' v={tc.construction.stitchDensity} />
                <KV k='overlock' v={tc.construction.overlockThreads} />
                <KV k='seam allowances' v={tc.construction.seamAllowances} />
                <KV k='hem finish' v={tc.construction.hemFinish} />
              </div>
              <div>
                <KV k='pressing' v={tc.construction.pressing} />
                <KV k='machine class' v={tc.construction.machineClass} />
                <KV
                  k='labour rate'
                  v={
                    dec(tc.construction.labourRate) &&
                    `${dec(tc.construction.labourRate)} ${tc.construction.labourRateCurrency ?? ''}`.trim()
                  }
                />
                <KV k='notes' v={tc.construction.notes} />
              </div>
            </div>
          )}
          {has(tc.operations) && (
            <table className='w-full border-collapse text-[10px]'>
              <thead>
                <tr>
                  <th className={`${TH} w-8`}>#</th>
                  <th className={TH}>node</th>
                  <th className={TH}>operation</th>
                  <th className={TH}>machine</th>
                  <th className={TH}>seam / needle</th>
                  <th className={`${TH} text-right`}>SAM</th>
                </tr>
              </thead>
              <tbody>
                {(tc.operations ?? []).map((o, i) => (
                  <tr key={i} className='break-inside-avoid'>
                    <td className={`${TD} text-center`}>{o.operationNumber || i + 1}</td>
                    <td className={TD}>{o.node || '—'}</td>
                    <td className={TD}>
                      <div>{o.description || '—'}</div>
                      {o.seamType && <div className='text-neutral-500'>{o.seamType}</div>}
                    </td>
                    <td className={TD}>{o.machine || '—'}</td>
                    <td className={TD}>
                      {[o.seamAllowance, o.needle].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className={`${TD} text-right`}>{dec(o.timeNorm) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sheet>
      )}

      {/* LABELS + PACKAGING */}
      {(has(tc.labels) || tc.packaging) && (
        <Sheet title='labels & packaging'>
          {has(tc.labels) && (
            <table className='mb-3 w-full border-collapse text-[10px]'>
              <thead>
                <tr>
                  <th className={TH}>type</th>
                  <th className={TH}>content</th>
                  <th className={TH}>placement</th>
                  <th className={TH}>attachment</th>
                  <th className={TH}>size</th>
                </tr>
              </thead>
              <tbody>
                {(tc.labels ?? []).map((l, i) => (
                  <tr key={i} className='break-inside-avoid'>
                    <td className={TD}>{labelTypeL[l.labelType ?? ''] ?? '—'}</td>
                    <td className={TD}>{l.content || '—'}</td>
                    <td className={TD}>{l.placement || '—'}</td>
                    <td className={TD}>{l.attachment || '—'}</td>
                    <td className={TD}>{l.size || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tc.packaging && (
            <div className='grid grid-cols-2 gap-x-8'>
              <div>
                <KV k='folding' v={tc.packaging.foldingMethod} />
                <KV k='polybag' v={tc.packaging.polybag} />
                <KV k='bag sticker' v={tc.packaging.bagSticker} />
                <KV k='inserts' v={tc.packaging.inserts} />
              </div>
              <div>
                <KV k='units / box' v={tc.packaging.unitsPerBox || ''} />
                <KV k='box marking' v={tc.packaging.boxMarking} />
                <KV k='box dimensions' v={tc.packaging.boxDimensions} />
                <KV
                  k='weight net / gross'
                  v={
                    (dec(tc.packaging.weightNet) || dec(tc.packaging.weightGross)) &&
                    `${dec(tc.packaging.weightNet) || '—'} / ${dec(tc.packaging.weightGross) || '—'}`
                  }
                />
              </div>
            </div>
          )}
        </Sheet>
      )}

      {/* COSTING */}
      {tc.costing && (
        <Sheet title='costing'>
          <div className='grid grid-cols-2 gap-x-8'>
            <div>
              <KV k='cmt' v={dec(tc.costing.cmtCost)} />
              <KV k='hardware' v={dec(tc.costing.hardwareCost)} />
              <KV k='packaging' v={dec(tc.costing.packagingCost)} />
              <KV k='logistics' v={dec(tc.costing.logisticsCost)} />
              <KV k='overhead' v={dec(tc.costing.overheadCost)} />
              <KV k='defect %' v={dec(tc.costing.defectPercent)} />
            </div>
            <div>
              <KV k='materials (computed)' v={dec(tc.costing.materialsCost)} />
              <KV k='total SAM' v={dec(tc.costing.totalSam)} />
              <KV k='labour cost' v={dec(tc.costing.labourCost)} />
              <KV k='markup ×' v={dec(tc.costing.markupMultiplier)} />
              <KV k='wholesale' v={dec(tc.costing.wholesalePrice)} />
              <KV k='retail' v={dec(tc.costing.retailPrice)} />
            </div>
          </div>
          <div className='mt-2 flex items-center justify-between border-t-2 border-black pt-1 text-sm'>
            <span className='font-bold uppercase'>total cost</span>
            <span className='font-bold'>
              {dec(tc.costing.totalCost) || '—'} {tc.costing.currency ?? ''}
            </span>
          </div>
          {tc.costing.hasUnconvertedCurrencies && (
            <p className='mt-1 text-[10px] text-neutral-500'>
              ⚠ contains unconverted currencies — totals are per-currency, not summed
            </p>
          )}
        </Sheet>
      )}

      {/* ISSUES */}
      {has(tc.issues) && (
        <Sheet title='issues'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={TH}>severity</th>
                <th className={TH}>status</th>
                <th className={TH}>ref</th>
                <th className={TH}>description</th>
                <th className={TH}>resolution</th>
              </tr>
            </thead>
            <tbody>
              {(tc.issues ?? []).map((iss, i) => (
                <tr key={i} className='break-inside-avoid'>
                  <td className={TD}>{issueSevL[iss.severity ?? ''] ?? '—'}</td>
                  <td className={TD}>{issueStatusL[iss.status ?? ''] ?? '—'}</td>
                  <td className={TD}>
                    {[
                      iss.operationNumber ? `op ${iss.operationNumber}` : '',
                      iss.calloutNumber ? `callout ${iss.calloutNumber}` : '',
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </td>
                  <td className={TD}>{iss.description || '—'}</td>
                  <td className={TD}>{iss.resolutionNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}

      {/* SIGN-OFFS */}
      {has(tc.signoffs) && (
        <Sheet title='sign-off'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={TH}>section</th>
                <th className={TH}>state</th>
                <th className={TH}>signed by</th>
                <th className={TH}>date</th>
                <th className={TH}>note</th>
              </tr>
            </thead>
            <tbody>
              {(tc.signoffs ?? []).map((s, i) => (
                <tr key={i} className='break-inside-avoid'>
                  <td className={TD}>{signoffSectionL[s.section ?? ''] ?? '—'}</td>
                  <td className={TD}>{signoffStateL[s.state ?? ''] ?? '—'}</td>
                  <td className={TD}>{s.signedBy || '—'}</td>
                  <td className={TD}>{formatTechCardDate(s.signedAt)}</td>
                  <td className={TD}>{s.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}

      {/* REVISIONS */}
      {has(tc.revisions) && (
        <Sheet title='revision log'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={TH}>version</th>
                <th className={TH}>date</th>
                <th className={TH}>author</th>
                <th className={TH}>section</th>
                <th className={TH}>change</th>
              </tr>
            </thead>
            <tbody>
              {(tc.revisions ?? []).map((r, i) => (
                <tr key={i} className='break-inside-avoid'>
                  <td className={TD}>{r.version || '—'}</td>
                  <td className={TD}>{formatTechCardDate(r.revisionDate)}</td>
                  <td className={TD}>{r.author || '—'}</td>
                  <td className={TD}>{r.section || '—'}</td>
                  <td className={TD}>{r.changeNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}

      <footer className='mt-6 border-t border-neutral-300 pt-2 text-[9px] uppercase tracking-wide text-neutral-400'>
        {tc.brand || 'GRBPWR'} · {tc.styleNumber || ''} · {tc.name || ''} · generated{' '}
        {formatTechCardDate(techCard.updatedAt)}
      </footer>
    </div>
  );
}
