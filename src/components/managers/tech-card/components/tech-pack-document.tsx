import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_Category,
  common_Color,
  common_MediaFull,
  common_TechCard,
  common_TechCardReleaseMeta,
  googletype_Decimal,
  PackagingRecipeLine,
  StyleAssemblyLine,
} from 'api/proto-http/admin';
import { formatCompositionEntries } from './composition-entries';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMeasurements } from 'components/managers/product/utility/useMeasurements';
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
import { useTechCardReleases } from './useSamples';

const mapOf = (opts: ReadonlyArray<{ value: string; label: string }>) =>
  Object.fromEntries(opts.map((o) => [o.value, o.label])) as Record<string, string>;

const genderL = mapOf(techCardGenderOptions);
const unitL = mapOf(techCardMeasurementUnitOptions);
const mediaKindL = mapOf(techCardMediaKindOptions);
const bomSectionL = mapOf(techCardBomSectionOptions);
const fabricDirL = mapOf(techCardFabricDirectionOptions);
const labelTypeL = mapOf(techCardLabelTypeOptions);
const issueSevL = mapOf(techCardIssueSeverityOptions);
const issueStatusL = mapOf(techCardIssueStatusOptions);
const signoffSectionL = mapOf(techCardSignoffSectionOptions);
const signoffStateL = mapOf(techCardSignoffStateOptions);

// No shared option list for these two (colourway lifecycle / aux subtype) — strip the enum
// prefix for a compact print label, same convention as the maps above.
const enumLabel = (v: string | undefined, prefix: string): string =>
  v && v !== `${prefix}UNKNOWN` ? v.replace(prefix, '').replace(/_/g, ' ').toLowerCase() : '';
const lifecycleLabel = (v?: string) => enumLabel(v, 'COLORWAY_LIFECYCLE_STATUS_');
const auxSubtypeLabel = (v?: string) => enumLabel(v, 'TECH_CARD_AUX_SUBTYPE_');

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
// print isolation that hides app chrome. `assembly` (on-garment items) and `packagingRecipe`
// are fetched by the caller (print-page) — separate per-style RPCs, not part of GetTechCard.
export function TechPackDocument({
  techCard,
  assembly = [],
  packagingRecipe = [],
}: {
  techCard: common_TechCard;
  assembly?: StyleAssemblyLine[];
  packagingRecipe?: PackagingRecipeLine[];
}) {
  const tc = techCard.techCard;
  const { dictionary } = useDictionary();
  const { data: models } = useAllModels();
  // Rev.N (task: header proof-of-version) — techCard.id === styleId (R1), same call ReleasesField
  // already makes; free once the constructor tab warmed the cache.
  const { data: releasesData } = useTechCardReleases(techCard.id);

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

  // Size/measurement grading chart (task: point-of-measure table never printed). Walk the stored
  // leaf category up to {top, sub, type} — same derivation SizeChartField uses — so the columns
  // resolve exactly as the live editor's grid did.
  const catPath = useMemo(() => {
    const byId = new Map<number, common_Category>();
    for (const c of dictionary?.categories ?? []) if (c.id != null) byId.set(c.id, c);
    const out = { top: 0, sub: 0, type: 0 };
    let cur = tc?.categoryId ? byId.get(tc.categoryId) : undefined;
    let guard = 0;
    while (cur && guard++ < 8) {
      if (cur.level === 'top_category') out.top = cur.id ?? 0;
      else if (cur.level === 'sub_category') out.sub = cur.id ?? 0;
      else out.type = cur.id ?? 0;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  }, [dictionary?.categories, tc?.categoryId]);
  const { measurements } = useMeasurements(dictionary, catPath.top, catPath.sub, catPath.type);
  const { data: sizeChartData } = useQuery({
    queryKey: ['styleSizeChart', techCard.id],
    queryFn: () => adminService.GetStyleSizeChart({ styleId: techCard.id ?? 0 }),
    enabled: !!techCard.id,
  });
  const chartCellByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of sizeChartData?.chart?.cells ?? []) {
      if (c.sizeId == null || c.measurementNameId == null) continue;
      m.set(`${c.sizeId}:${c.measurementNameId}`, c.value?.value ?? '');
    }
    return m;
  }, [sizeChartData]);

  const colorByCode = useMemo(() => {
    const m = new Map<string, common_Color>();
    for (const c of dictionary?.colors ?? []) if (c.code) m.set(c.code, c);
    return m;
  }, [dictionary?.colors]);

  if (!tc) return null;

  // Responsible people come from the role-assignment table now (Q5), not free-text header fields.
  const roleNames = (role: string) =>
    (techCard.roleAssignments ?? [])
      .filter((a) => a.role === role)
      .map((a) => a.adminUsername || `#${a.adminId}`)
      .join(', ') || '—';
  const designer = roleNames('TECH_CARD_ROLE_DESIGNER');
  const patternMaker = roleNames('TECH_CARD_ROLE_PATTERN_MAKER');
  const technologist = roleNames('TECH_CARD_ROLE_TECHNOLOGIST');
  const approver = roleNames('TECH_CARD_ROLE_APPROVER');
  const sizeName = (id?: number) => (id ? sizeById.get(id) ?? `#${id}` : '—');
  const unitAbbr = tc.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_MM' ? 'mm' : 'cm';
  const sizeIds = tc.sizeIds ?? [];
  // The live colourway data — this is the actual fix for #71/M10: previously hardcoded to `[]`,
  // so the colourways sheet and per-colourway cost labels below never rendered for any card.
  const colorways = techCard.colorways ?? [];
  const colorwayLabel = (cw?: common_AdminColorwayRef): string => {
    if (!cw) return '—';
    const dc = cw.colorCode ? colorByCode.get(cw.colorCode) : undefined;
    return (
      dc?.name?.trim() || cw.colorCode?.trim() || cw.baseSku?.trim() || `#${cw.colorwayId ?? ''}`
    );
  };
  const bomLabel = (idx?: number): string =>
    idx != null && idx >= 0 ? (tc.bomItems ?? [])[idx]?.name || '' : '';
  // Highest-numbered release, if any — "latest" isn't guaranteed by response order.
  const latestRelease = (releasesData?.releases ?? []).reduce<
    common_TechCardReleaseMeta | undefined
  >(
    (best, r) => (best == null || (r.releaseNumber ?? 0) > (best.releaseNumber ?? 0) ? r : best),
    undefined,
  );
  const captionById = new Map<number, { caption?: string; kind?: string }>();
  for (const m of [...(tc.technicalMedia ?? []), ...(tc.moodboardMedia ?? [])])
    if (m.mediaId != null) captionById.set(m.mediaId, { caption: m.caption, kind: m.kind });

  // #71 root cause: on-garment assembly (labels/tags attached to the garment) and the packaging
  // recipe (materials consumed on ship) each live behind their own per-style RPC that neither
  // this component nor the print route ever called — printing only inactive/disabled lines would
  // misstate the spec, so both are filtered to active before rendering.
  const activeAssembly = assembly.filter((a) => a.active !== false);
  const activePackaging = packagingRecipe.filter((p) => p.active !== false);
  // Mirrors PackagingRecipeField's own resolution: this style's active lines if it has any,
  // else the global fallback it would inherit at order time.
  const stylePackaging = activePackaging.filter(
    (p) => p.scope === 'style' && p.techCardId === techCard.id,
  );
  const globalPackaging = activePackaging.filter((p) => p.scope === 'global');
  const packagingRows = stylePackaging.length > 0 ? stylePackaging : globalPackaging;
  const packagingIsFallback = stylePackaging.length === 0 && globalPackaging.length > 0;

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
                {/* TODO(final-bump): season no longer on TechCardInsert (moved to skuSeason). */}
              </div>
            </div>
          </div>
          <div className='text-right text-[11px] leading-tight'>
            <div className='font-semibold uppercase'>{stageLabel(tc.stage)}</div>
            <div>{approvalStateLabel(tc.approvalState)}</div>
            {/* Proof of which frozen snapshot (if any) this printout matches — so a printed
                copy is never mistaken for a newer/older edit. */}
            <div className='font-semibold'>
              {latestRelease ? `Rev.${latestRelease.releaseNumber ?? '—'}` : 'unreleased'}
            </div>
            <div className='text-labelColor'>{formatTechCardDate(techCard.updatedAt)}</div>
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
          {/* structured fibre composition (S17/M1 typed composition_entries); omitted when empty */}
          {has(techCard.compositionEntries) && (
            <KV k='composition' v={formatCompositionEntries(techCard.compositionEntries)} />
          )}
        </div>
        <div>
          <KV k='designer' v={designer} />
          <KV k='pattern maker' v={patternMaker} />
          <KV k='technologist' v={technologist} />
          <KV k='approved by' v={approver} />
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

      {/* MEASUREMENTS — point-of-measure grading chart (GetStyleSizeChart), the single most
          standard artifact of a garment tech pack; previously never fetched/printed. */}
      {has(sizeIds) && measurements.length > 0 && (
        <Sheet title={`measurements (${unitAbbr})`}>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={`${TH} w-16`}>size</th>
                {measurements.map((m) => (
                  <th key={m.id} className={`${TH} text-center`}>
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizeIds.map((sizeId) => (
                <tr key={sizeId} className='break-inside-avoid'>
                  <td className={`${TD} font-semibold`}>{sizeName(sizeId)}</td>
                  {measurements.map((m) => (
                    <td key={m.id} className={`${TD} text-center`}>
                      {chartCellByKey.get(`${sizeId}:${m.id}`) || '—'}
                    </td>
                  ))}
                </tr>
              ))}
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

      {/* CUT PIECES — structural pieces (детали кроя) + per-colourway fabric mapping (NF-05).
          Sat unrendered right alongside the BOM/colourways data it references (task: M10). */}
      {has(tc.pieces) && (
        <Sheet title='cut pieces'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={`${TH} w-6`}>#</th>
                <th className={TH}>piece</th>
                <th className={`${TH} text-center`}>qty / garment</th>
                <th className={`${TH} text-center`}>mirrored</th>
                <th className={TH}>grainline</th>
                <th className={`${TH} text-center`}>fused</th>
                <th className={TH}>fabric (by colourway)</th>
                <th className={TH}>note</th>
              </tr>
            </thead>
            <tbody>
              {(tc.pieces ?? []).map((p, i) => {
                const materials = p.materials ?? [];
                return (
                  <tr key={p.lineKey || i} className='break-inside-avoid'>
                    <td className={`${TD} text-center font-semibold`}>{i + 1}</td>
                    <td className={TD}>
                      <div className='font-medium'>{p.name || '—'}</div>
                      {p.detached && (
                        <div className='text-labelColor'>unpinned from sketch callout</div>
                      )}
                    </td>
                    <td className={`${TD} text-center`}>{p.piecesPerGarment ?? '—'}</td>
                    <td className={`${TD} text-center`}>{p.mirrored ? 'yes' : 'no'}</td>
                    <td className={TD}>{p.grainline || '—'}</td>
                    <td className={`${TD} text-center`}>{p.fused ? 'yes' : 'no'}</td>
                    <td className={TD}>
                      {materials.length === 0 ? (
                        '—'
                      ) : (
                        <div className='flex flex-col gap-0.5'>
                          {materials.map((m, j) => {
                            const cw = colorways.find((c) => c.colorwayId === m.colorwayId);
                            const fabricName = bomLabel(m.bomItemIndex);
                            const fusingName = bomLabel(m.fusingBomItemIndex);
                            return (
                              <div key={j}>
                                <span className='font-medium'>{colorwayLabel(cw)}</span>:{' '}
                                {fabricName || '—'}
                                {fusingName ? ` (+ fusing: ${fusingName})` : ''}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className={TD}>{p.note || '—'}</td>
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
              const dictColor = c.colorCode ? colorByCode.get(c.colorCode) : undefined;
              return (
                <div key={c.colorwayId ?? i} className='break-inside-avoid'>
                  <div className='mb-1 flex items-center gap-2 border-b border-black pb-1 text-[11px]'>
                    {dictColor?.hex && (
                      <span
                        className='inline-block size-4 border border-black'
                        style={{ backgroundColor: dictColor.hex }}
                      />
                    )}
                    <span className='font-bold uppercase'>{colorwayLabel(c)}</span>
                    {c.colorCode && <span className='text-labelColor'>{c.colorCode}</span>}
                    {c.baseSku && <span className='text-labelColor'>· {c.baseSku}</span>}
                    <span className='ml-auto text-labelColor'>{lifecycleLabel(c.status)}</span>
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
                {(tc.operations ?? []).map((o, i) => {
                  // Compact secondary line instead of 4 more raw columns (thread/attachment/
                  // stitches-per-cm/BOM-material) — an 11-column table doesn't fit A4, and this
                  // mirrors the seam-type secondary line already used below.
                  const bomMaterial = bomLabel(o.bomItemIndex);
                  const detail = [
                    o.thread && `thread: ${o.thread}`,
                    o.attachment && `attach: ${o.attachment}`,
                    dec(o.stitchesPerCm) && `${dec(o.stitchesPerCm)} st/cm`,
                    bomMaterial && `material: ${bomMaterial}`,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <tr key={i} className='break-inside-avoid'>
                      <td className={`${TD} text-center`}>{o.operationNumber || (i + 1) * 10}</td>
                      <td className={TD}>{o.node || '—'}</td>
                      <td className={TD}>{o.placement || '—'}</td>
                      <td className={TD}>
                        <div>{o.description || '—'}</div>
                        {o.seamType && <div className='text-labelColor'>{o.seamType}</div>}
                        {detail && <div className='text-labelColor'>{detail}</div>}
                        {o.note && <div className='italic text-labelColor'>{o.note}</div>}
                      </td>
                      <td className={TD}>{o.machine || '—'}</td>
                      <td className={TD}>
                        {[o.seamAllowance, o.needle].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className={`${TD} text-right`}>{dec(o.timeNorm) || '—'}</td>
                    </tr>
                  );
                })}
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
                    tc.packaging.weightNetGrams || tc.packaging.weightGrossGrams
                      ? `${tc.packaging.weightNetGrams || '—'} / ${tc.packaging.weightGrossGrams || '—'} g`
                      : ''
                  }
                />
              </div>
            </div>
          )}
        </Sheet>
      )}

      {/* ASSEMBLY — ON-GARMENT ITEMS: labels/tags/hangtags attached on or into the garment
          (ListStyleAssembly). Root cause of #71 — this RPC was never fetched, so the section
          was structurally impossible to render regardless of what this component did. */}
      {has(activeAssembly) && (
        <Sheet title='assembly — on-garment items'>
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={TH}>component</th>
                <th className={TH}>type</th>
                <th className={TH}>size</th>
                <th className={`${TH} text-right`}>qty</th>
                <th className={TH}>position</th>
                <th className={TH}>print note</th>
              </tr>
            </thead>
            <tbody>
              {activeAssembly.map((a, i) => (
                <tr key={a.id ?? i} className='break-inside-avoid'>
                  <td className={TD}>
                    <div className='font-medium'>
                      {a.componentName || `#${a.componentTechCardId}`}
                    </div>
                    {a.outputMaterialName && (
                      <div className='text-labelColor'>→ {a.outputMaterialName}</div>
                    )}
                  </td>
                  <td className={TD}>{auxSubtypeLabel(a.componentAuxSubtype) || '—'}</td>
                  <td className={TD}>{a.sizeId ? sizeName(a.sizeId) : 'all sizes'}</td>
                  <td className={`${TD} text-right`}>{dec(a.qty) || '—'}</td>
                  <td className={TD}>{a.positionNote || '—'}</td>
                  <td className={TD}>{a.printNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}

      {/* PACKAGING RECIPE — materials consumed on ship (ListPackagingRecipe): once per shipment
          (qty/order, e.g. a branded box) plus once per unit (qty/item, e.g. a dust bag). Same
          missing-RPC root cause as assembly, one tab over. */}
      {packagingRows.length > 0 && (
        <Sheet title='packaging recipe'>
          {packagingIsFallback && (
            <p className='mb-1 text-[9px] text-labelColor'>
              no style-specific recipe — showing the inherited global fallback
            </p>
          )}
          <table className='w-full border-collapse text-[10px]'>
            <thead>
              <tr>
                <th className={TH}>material</th>
                <th className={`${TH} text-right`}>qty / order</th>
                <th className={`${TH} text-right`}>qty / item</th>
              </tr>
            </thead>
            <tbody>
              {packagingRows.map((p, i) => (
                <tr key={p.id ?? i} className='break-inside-avoid'>
                  <td className={TD}>{p.materialName || `#${p.materialId}`}</td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {dec(p.qtyPerOrder)
                      ? `${dec(p.qtyPerOrder)} ${p.materialUnit ?? ''}`.trim()
                      : '—'}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {dec(p.qtyPerItem)
                      ? `${dec(p.qtyPerItem)} ${p.materialUnit ?? ''}`.trim()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  // colorway_id is a real FK (product id), not a positional index into
                  // `colorways` — resolve by id, not by array offset.
                  const cw = colorways.find((c) => c.colorwayId === cc.colorwayId);
                  return (
                    <tr key={i} className='break-inside-avoid'>
                      <td className={TD}>{cw ? colorwayLabel(cw) : `#${cc.colorwayId ?? '—'}`}</td>
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

      <footer className='mt-6 border-t border-textInactiveColor pt-2 text-[9px] uppercase tracking-wide text-labelColor'>
        {tc.brand || 'GRBPWR'} · {tc.styleNumber || ''} · {tc.name || ''} · generated{' '}
        {formatTechCardDate(techCard.updatedAt)}
      </footer>
    </div>
  );
}
