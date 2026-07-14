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
import { CARE_CODE_META } from 'components/managers/product/components/care/care-picker';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { ReactNode, useMemo } from 'react';
import { decimalToInput } from 'utils/decimal';
import { PatternQR } from 'ui/components/pattern-qr';
import { GrbpwrMark } from 'ui/icons/grbpwr-mark';
import { detailKeyLabel } from './tech-card-options';

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
    <div className='flex gap-2 break-inside-avoid border-b border-textInactiveColor py-0.5 text-[11px] leading-tight'>
      <span className='w-36 shrink-0 uppercase tracking-wide text-labelColor'>{k}</span>
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
    for (const rm of [
      ...(techCard.resolvedTechnicalMedia ?? []),
      ...(techCard.resolvedMoodboardMedia ?? []),
    ])
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    return m;
  }, [techCard.resolvedTechnicalMedia, techCard.resolvedMoodboardMedia]);
  // detail reference images (and swatches) are library media ids not carried in the resolved
  // sketch maps — resolve them from the library so they print.
  const libraryMap = useMediaMap();
  const resolveMedia = (id: number) => mediaById.get(id) ?? libraryMap.get(id);

  if (!tc) return null;

  // `constructor` is an Object.prototype key — when the backend omits it, tc.constructor is
  // the Object constructor function, not a string. Guard so React never renders a function.
  const patternMaker = typeof tc.constructor === 'string' ? tc.constructor : '';
  const sizeName = (id?: number) => (id ? sizeById.get(id) ?? `#${id}` : '—');
  const unitAbbr = tc.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_MM' ? 'mm' : 'cm';
  const sizeIds = tc.sizeIds ?? [];
  const colorways = tc.colorways ?? [];
  const captionById = new Map<number, { caption?: string; kind?: string }>();
  for (const m of [...(tc.technicalMedia ?? []), ...(tc.moodboardMedia ?? [])])
    if (m.mediaId != null) captionById.set(m.mediaId, { caption: m.caption, kind: m.kind });

  return (
    <div className='mx-auto max-w-[210mm] bg-white px-8 py-6 text-black'>
      {/* COVER / IDENTITY */}
      <header className='mb-5 border-b-2 border-black pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-10 w-10 shrink-0 text-black' />
            <div>
              <div className='text-[10px] uppercase tracking-[0.2em] text-labelColor'>
                {tc.brand || 'GRBPWR'} · tech pack
              </div>
              <div className='text-2xl font-bold uppercase leading-tight'>
                {tc.name || 'untitled'}
              </div>
              <div className='text-sm'>
                style <span className='font-semibold'>{tc.styleNumber || '—'}</span>
                {tc.collection ? ` · ${tc.collection}` : ''}
                {tc.season ? ` · ${tc.season}` : ''}
              </div>
            </div>
          </div>
          <div className='text-right text-[11px] leading-tight'>
            <div className='font-semibold uppercase'>{stageLabel(tc.stage)}</div>
            <div>{approvalStateLabel(tc.approvalState)}</div>
            <div className='text-labelColor'>
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
        </div>
      </div>

      {/* DESCRIPTION */}
      {(tc.concept || has(tc.details) || tc.notes) && (
        <div className='mb-5 mt-4'>
          <Sheet title='description'>
            {tc.concept && <p className='mb-2 text-xs italic'>{tc.concept}</p>}
            <div className='space-y-2'>
              {(tc.details ?? []).map((d, i) => {
                const imgs = (d.mediaIds ?? [])
                  .map((id) => resolveMedia(id))
                  .map((f) => f?.media?.thumbnail?.mediaUrl || f?.media?.fullSize?.mediaUrl || '')
                  .filter(Boolean);
                if (!d.text?.trim() && imgs.length === 0) return null;
                return (
                  <div key={i} className='break-inside-avoid'>
                    <KV k={detailKeyLabel(d.key)} v={d.text} />
                    {imgs.length > 0 && (
                      <div className='mt-1 flex flex-wrap gap-2'>
                        {imgs.map((url, j) => (
                          <img
                            key={j}
                            src={url}
                            alt=''
                            className='block max-h-[140px] w-auto border border-black'
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {tc.notes && <KV k='notes' v={tc.notes} />}
            </div>
          </Sheet>
        </div>
      )}

      {/* SKETCHES + CALLOUTS */}
      {has(tc.technicalMedia) && (
        <Sheet title='technical sketch'>
          <div className='flex flex-wrap gap-4'>
            {(tc.technicalMedia ?? []).map((m, i) => {
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
                  <figcaption className='mt-1 text-[10px] uppercase text-labelColor'>
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

      {/* MOODBOARD */}
      {has(tc.moodboardMedia) && (
        <Sheet title='moodboard'>
          <div className='flex flex-wrap gap-4'>
            {(tc.moodboardMedia ?? []).map((m, i) => {
              const full = m.mediaId != null ? mediaById.get(m.mediaId) : undefined;
              const url = full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';
              const meta = captionById.get(m.mediaId ?? -1);
              if (!url) return null;
              return (
                <figure key={i} className='break-inside-avoid'>
                  <img
                    src={url}
                    alt=''
                    className='block max-h-[240px] w-auto border border-black'
                  />
                  <figcaption className='mt-1 text-[10px] uppercase text-labelColor'>
                    {mediaKindL[meta?.kind ?? ''] ?? 'reference'}
                    {meta?.caption ? ` · ${meta.caption}` : ''}
                  </figcaption>
                </figure>
              );
            })}
          </div>
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

      {/* PATTERNS (выкройки) — per-size PDF, QR-linked for the factory */}
      {has(tc.patterns) && (
        <Sheet title='patterns (выкройки)'>
          <div className='flex flex-wrap gap-4'>
            {(tc.patterns ?? [])
              .filter((p) => p.url?.trim())
              .map((p, i) => (
                <figure key={i} className='break-inside-avoid border border-black p-2 text-center'>
                  <PatternQR value={p.url ?? ''} />
                  <figcaption className='mt-1 text-[10px] uppercase'>
                    <div className='font-semibold'>{sizeName(p.sizeId)}</div>
                    {p.filename && (
                      <div className='max-w-[120px] truncate text-labelColor'>{p.filename}</div>
                    )}
                  </figcaption>
                </figure>
              ))}
          </div>
          <p className='mt-2 text-[9px] text-labelColor'>
            наведите камеру на QR, чтобы открыть PDF-выкройку этого размера
          </p>
        </Sheet>
      )}

      {/* BILL OF MATERIALS — article catalog (recipe/consumption is per colourway below) */}
      {has(tc.bomItems) && (
        <Sheet title='bill of materials (article catalog)'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={`${TH} w-6`}>#</th>
                <th className={TH}>section</th>
                <th className={TH}>material</th>
                <th className={TH}>supplier</th>
                <th className={TH}>base colour</th>
                <th className={TH}>fabric</th>
                <th className={TH}>unit</th>
                <th className={`${TH} text-right`}>unit price</th>
              </tr>
            </thead>
            <tbody>
              {(tc.bomItems ?? []).map((b, i) => {
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
                    <td className={`${TD} text-center font-semibold`}>{i + 1}</td>
                    <td className={TD}>{bomSectionL[b.section ?? ''] ?? '—'}</td>
                    <td className={TD}>
                      <div className='font-medium'>{b.name || '—'}</div>
                      {b.composition && <div className='text-labelColor'>{b.composition}</div>}
                    </td>
                    <td className={TD}>
                      {b.supplier || '—'}
                      {b.supplierRef ? ` (${b.supplierRef})` : ''}
                    </td>
                    <td className={TD}>{b.color || '—'}</td>
                    <td className={TD}>{fabric || '—'}</td>
                    <td className={TD}>{b.unit || '—'}</td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {dec(b.unitPrice) ? `${dec(b.unitPrice)} ${b.currency ?? ''}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Sheet>
      )}

      {/* COLOURWAYS — each colourway is a recipe (usages over the BOM catalog) */}
      {has(colorways) && (
        <Sheet title='colourways'>
          <div className='space-y-4'>
            {colorways.map((c, i) => {
              const usages = c.usages ?? [];
              return (
                <div key={i} className='break-inside-avoid'>
                  <div className='mb-1 flex items-center gap-2 border-b border-black pb-1 text-[11px]'>
                    {c.hex && (
                      <span
                        className='inline-block size-4 border border-black'
                        style={{ backgroundColor: c.hex }}
                      />
                    )}
                    <span className='font-bold uppercase'>{c.name || c.code || `#${i + 1}`}</span>
                    {c.code && <span className='text-labelColor'>{c.code}</span>}
                    {c.pantone && (
                      <span className='text-labelColor'>
                        · {c.pantone}
                        {c.pantoneSystem ? ` ${c.pantoneSystem}` : ''}
                      </span>
                    )}
                    <span className='ml-auto text-labelColor'>
                      {labDipL[c.labDipStatus ?? ''] ?? ''}
                      {c.labDipRound ? ` · round ${c.labDipRound}` : ''}
                    </span>
                  </div>
                  {usages.length === 0 ? (
                    <p className='text-[10px] text-labelColor'>нет материалов</p>
                  ) : (
                    <table className='w-full border-collapse text-[10px]'>
                      <thead>
                        <tr>
                          <th className={TH}>part</th>
                          <th className={TH}>material</th>
                          <th className={TH}>colour</th>
                          <th className={`${TH} text-right`}>cons. / qty</th>
                          <th className={`${TH} text-right`}>run total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usages.map((u, j) => {
                          const bi = u.bomItemIndex ?? -1;
                          const art = bi >= 0 ? (tc.bomItems ?? [])[bi] : undefined;
                          const cons =
                            dec(u.quantity) ||
                            dec(u.consumption) ||
                            (has(u.sizeConsumptions) ? 'по размерам' : '');
                          const colour = u.color || u.pantone || '—';
                          return (
                            <tr key={j} className='break-inside-avoid'>
                              <td className={TD}>{u.placement || '—'}</td>
                              <td className={TD}>{art?.name || (bi >= 0 ? `#${bi + 1}` : '—')}</td>
                              <td className={TD}>{colour}</td>
                              <td className={`${TD} whitespace-nowrap text-right`}>
                                {cons ? `${cons} ${art?.unit ?? ''}`.trim() : '—'}
                              </td>
                              <td className={`${TD} whitespace-nowrap text-right`}>
                                {dec(u.sizeRunTotal) || dec(u.lineTotal) || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
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
                  <th className={TH}>part</th>
                  <th className={TH}>operation</th>
                  <th className={TH}>machine</th>
                  <th className={TH}>seam / needle</th>
                  <th className={`${TH} text-right`}>SAM</th>
                </tr>
              </thead>
              <tbody>
                {(tc.operations ?? []).map((o, i) => (
                  <tr key={i} className='break-inside-avoid'>
                    <td className={`${TD} text-center`}>{o.operationNumber || (i + 1) * 10}</td>
                    <td className={TD}>{o.node || '—'}</td>
                    <td className={TD}>{o.placement || '—'}</td>
                    <td className={TD}>
                      <div>{o.description || '—'}</div>
                      {o.seamType && <div className='text-labelColor'>{o.seamType}</div>}
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
                {(tc.labels ?? []).map((l, i) => {
                  const isCare = l.labelType === 'TECH_CARD_LABEL_TYPE_CARE';
                  const careCodes = isCare
                    ? (l.content ?? '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [];
                  return (
                    <tr key={i} className='break-inside-avoid'>
                      <td className={TD}>{labelTypeL[l.labelType ?? ''] ?? '—'}</td>
                      <td className={TD}>
                        {isCare && careCodes.length > 0 ? (
                          <div className='flex flex-wrap items-center gap-1'>
                            {careCodes.map((code, k) => {
                              const m = CARE_CODE_META[code];
                              return m?.img ? (
                                <img
                                  key={k}
                                  src={m.img}
                                  alt={m.name}
                                  title={m.name}
                                  className='h-5 w-5'
                                />
                              ) : (
                                <span key={k}>{code}</span>
                              );
                            })}
                          </div>
                        ) : (
                          l.content || '—'
                        )}
                        {l.note?.trim() && <div className='text-labelColor'>{l.note}</div>}
                      </td>
                      <td className={TD}>{l.placement || '—'}</td>
                      <td className={TD}>{l.attachment || '—'}</td>
                      <td className={TD}>{l.size || '—'}</td>
                    </tr>
                  );
                })}
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
              <KV k='materials / unit (primary cw)' v={dec(tc.costing.materialsPerUnit)} />
              <KV k='unit cost' v={dec(tc.costing.unitCost)} />
              <KV k='order qty' v={tc.costing.orderQty ? String(tc.costing.orderQty) : ''} />
              <KV k='total SAM (min)' v={dec(tc.costing.totalSam)} />
            </div>
          </div>

          {/* per-colourway material cost */}
          {has(tc.costing.colorwayCosts) && (
            <table className='mt-3 w-full border-collapse text-[10px]'>
              <thead>
                <tr>
                  <th className={TH}>colourway</th>
                  <th className={`${TH} text-right`}>materials / unit</th>
                  <th className={`${TH} text-right`}>unit cost</th>
                  <th className={`${TH} text-right`}>order cost</th>
                </tr>
              </thead>
              <tbody>
                {(tc.costing.colorwayCosts ?? []).map((cc, i) => {
                  const cw = colorways[cc.colorwayIndex ?? -1];
                  return (
                    <tr key={i} className='break-inside-avoid'>
                      <td className={TD}>
                        {cw?.name || cw?.code || `#${(cc.colorwayIndex ?? 0) + 1}`}
                        {cc.colorwayIndex === 0 ? ' (primary)' : ''}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        {dec(cc.materialsPerUnit) || '—'}
                        {cc.hasUnconvertedCurrencies ? ' ⚠' : ''}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        {dec(cc.unitCost) || '—'}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        {dec(cc.orderCost) || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className='mt-2 flex items-center justify-between border-t border-black pt-1 text-sm'>
            <span className='font-bold uppercase'>unit cost</span>
            <span className='font-bold'>
              {dec(tc.costing.unitCost) || '—'} {tc.costing.currency ?? ''}
            </span>
          </div>
          <div className='mt-1 flex items-center justify-between border-t-2 border-black pt-1 text-sm'>
            <span className='font-bold uppercase'>order cost</span>
            <span className='font-bold'>
              {dec(tc.costing.orderCost) || '—'} {tc.costing.currency ?? ''}
            </span>
          </div>
          {tc.costing.hasUnconvertedCurrencies && (
            <p className='mt-1 text-[10px] text-labelColor'>
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

      <footer className='mt-6 border-t border-textInactiveColor pt-2 text-[9px] uppercase tracking-wide text-labelColor'>
        {tc.brand || 'GRBPWR'} · {tc.styleNumber || ''} · {tc.name || ''} · generated{' '}
        {formatTechCardDate(techCard.updatedAt)}
      </footer>
    </div>
  );
}
