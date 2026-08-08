import type {
  common_TechCardAttachmentKind,
  common_TechCardGarmentZone,
  common_TechCardOperationType,
  common_TechCardSeamClass,
  common_TechCardTopstitch,
} from 'api/proto-http/admin';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_Category,
  common_Color,
  common_Material,
  common_MediaFull,
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardColorwayUsage,
  common_TechCardReleaseMeta,
  common_TechCardSizePattern,
  googletype_Decimal,
  PackagingRecipeLine,
  StyleAssemblyLine,
} from 'api/proto-http/admin';
import { PageFurniture, furnitureLine } from 'components/managers/print/page-furniture';
import {
  depStatus,
  type PrintDep,
} from 'components/managers/print/use-print-ready';
import { KV, Sheet, TD, TH } from 'components/managers/print/sheet';
import { CARE_ARTWORK } from 'components/managers/product/components/care/care-artwork';
import {
  fabricScopes,
  isRollGoodsSection,
  scopeKeyOfBinding,
  bomPurposeLabel,
  type RollGoodsLine,
} from './bom-purpose';
import { formatCompositionEntries } from './composition-entries';
import { wireFabricPurpose } from './pattern-size-index';
import { wireInt } from './schema';
import { skuToSeasonLabel } from './season-util';
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
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useMedia, useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { ReactNode, useEffect, useMemo } from 'react';
import { decimalToInput } from 'utils/decimal';
// ORIGIN, КОТОРЫЙ УЕДЕТ НА БУМАГУ И ОСТАНЕТСЯ ТАМ НАВСЕГДА — жил здесь локальной функцией, пока
// печатных документов с QR было ровно один. Наряд на партию (run-pack-document.tsx) печатает такой
// же код на такой же публичный вьюер, и вторая копия этой функции означала бы вторую копию правила
// «не бери window.location.origin», из которых одну однажды поправят, а другую нет.
import { viewerOrigin } from 'utils/viewer-origin';
import { PatternQR } from 'ui/components/pattern-qr';
import { GrbpwrMark } from 'ui/icons/grbpwr-mark';
import { detailKeyLabel } from './tech-card-options';
import {
  CUT_SYMMETRY_PRINT_LEGEND,
  cutSymmetryPrintCaption,
  cutSymmetryUnanswered,
} from './piece-codes';
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

import {
  attachmentOptions,
  operationTypeOptions,
  seamClassOptions,
  zoneOptions,
} from './operation-options';

const dec = (d?: googletype_Decimal): string => decimalToInput(d) || '';

// The printed sheet renders dictionary TOKENS, so it needs the same labels the editor shows. They
// come from the one options module rather than a second table here — the tech pack and the screen
// disagreeing about what a token means is exactly the failure a shared vocabulary prevents.
const optionLabel = <T extends string>(
  opts: ReadonlyArray<{ value: T; label: string }>,
  v?: T,
  noneValue?: T,
): string => (!v || v === noneValue ? '' : (opts.find((o) => o.value === v)?.label ?? ''));

const operationTypeText = (v?: common_TechCardOperationType): string =>
  optionLabel(operationTypeOptions, v, 'TECH_CARD_OPERATION_TYPE_UNKNOWN') || '—';
const zoneText = (v?: common_TechCardGarmentZone): string =>
  optionLabel(zoneOptions, v, 'TECH_CARD_GARMENT_ZONE_UNKNOWN');
const seamClassText = (v?: common_TechCardSeamClass): string =>
  optionLabel(seamClassOptions, v, 'TECH_CARD_SEAM_CLASS_UNKNOWN');

// MILLIMETRES throughout, and ABSENT stays absent: an unset allowance inherits the card standard,
// and printing «0 mm» for it would tell the floor to cut on the line as drawn.
const allowanceText = (d?: googletype_Decimal): string => {
  const v = dec(d);
  return v ? `${v} mm` : '';
};
const densityText = (d?: googletype_Decimal): string => {
  const v = dec(d);
  return v ? `${v} st/cm` : '';
};
const topstitchText = (t?: common_TechCardTopstitch): string => {
  if (!t || t.mode === 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN') return '';
  const rows = t.rows && t.rows > 1 ? `${t.rows} × ` : '';
  if (t.mode === 'TECH_CARD_TOPSTITCH_MODE_EDGE') return `topstitch ${rows}edge`;
  const w = dec(t.widthMm);
  return `topstitch ${rows}${w ? `${w} mm` : ''}`.trim();
};
const attachmentText = (
  kind?: common_TechCardAttachmentKind,
  size?: googletype_Decimal,
): string => {
  const label = optionLabel(attachmentOptions, kind, 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN');
  if (!label) return '';
  const s = dec(size);
  return s ? `${label} ${s} mm` : label;
};
const has = (a?: unknown[]): boolean => Array.isArray(a) && a.length > 0;

// Русская форма счётного существительного: 1 лист, 2 листа, 5 листов.
const plural = (n: number, one: string, few: string, many: string): string => {
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return many;
  const m10 = n % 10;
  return m10 === 1 ? one : m10 >= 2 && m10 <= 4 ? few : many;
};

// Lowercase extension of a pattern sheet: filename first, url path as the legacy fallback —
// the same source order as the server manifest's sheetExt and the viewer's sheetKind. The
// caption branches on it because a SIZELESS sheet means two different things by format: a DXF
// is graded (sizes live in its block names), a PDF simply has no size — «градуированный» on a
// PDF would promise a size switcher the viewer will not show.
const patternExt = (p: { filename?: string; url?: string }): string => {
  const fromName = /\.([a-z0-9]+)$/i.exec((p.filename ?? '').trim());
  if (fromName) return fromName[1].toLowerCase();
  const fromUrl = /\.([a-z0-9]+)$/i.exec((p.url ?? '').split(/[?#]/)[0]);
  return fromUrl ? fromUrl[1].toLowerCase() : '';
};
const num = (s?: string): number => {
  const n = parseFloat(s ?? '');
  return Number.isNaN(n) ? NaN : n;
};

// Full printable tech-pack document for one tech card. Pure presentational — reads the
// loaded card (server truth, so save before exporting). Self-contained black-on-white so
// it prints/PDFs identically regardless of the app theme. See print-page for the @media
// print isolation that hides app chrome. `assembly` (on-garment items) and `packagingRecipe`
// are fetched by the caller (print-page) — separate per-style RPCs, not part of GetTechCard.
export function TechPackDocument({
  techCard,
  assembly = [],
  packagingRecipe = [],
  patternViewerToken = '',
  onDataStatus,
}: {
  techCard: common_TechCard;
  assembly?: StyleAssemblyLine[];
  packagingRecipe?: PackagingRecipeLine[];
  /** Статусы запросов, которые документ делает сам, — для гейта готовности печатной страницы. */
  onDataStatus?: (deps: PrintDep[]) => void;
  // Card-level capability token from GetTechCardResponse (never on common_TechCard — a token
  // must not reach a persisted release snapshot). Non-empty → the patterns section prints one
  // QR per fabric scope opening the public viewer /p/{token}; empty (older backend, service
  // unwired) → transitional per-sheet QR fallback.
  patternViewerToken?: string;
}) {
  const tc = techCard.techCard;
  const { dictionary } = useDictionary();
  const careVocabulary = useCareVocabulary();
  const { data: models, isLoading: modelsLoading, isError: modelsError } = useAllModels();
  // Rev.N (task: header proof-of-version) — techCard.id === styleId (R1), same call ReleasesField
  // already makes; free once the constructor tab warmed the cache.
  const {
    data: releasesData,
    isLoading: releasesLoading,
    isError: releasesError,
  } = useTechCardReleases(techCard.id);

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
  // Тот же запрос, что внутри useMediaMap (react-query отдаёт его из кэша) — но со статусом:
  // useMediaMap возвращает голую Map, а гейту печати нужно знать, приехала ли медиатека. Без
  // неё referenced-картинки деталей просто не появятся в DOM, и ждать их decode будет нечего.
  const { isLoading: mediaLoading, isError: mediaError } = useMedia(500, 0);
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
  const {
    data: sizeChartData,
    isLoading: chartLoading,
    isError: chartError,
  } = useQuery({
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

  // The materials catalog, for the colourways sheet: the printed colour is the EFFECTIVE article's
  // (usage pin, else the slot default) own colour/pantone — the usage-level color/pantone inputs
  // are gone from the recipe editor and survive only on legacy rows. Archived included: a pinned
  // article that was later archived must still print its colour.
  const {
    data: materialsData,
    isLoading: materialsLoading,
    isError: materialsError,
  } = useMaterials('', true);
  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materialsData?.materials ?? [])
      if (wireInt(mat.id)) m.set(wireInt(mat.id), mat);
    return m;
  }, [materialsData?.materials]);

  // Статусы запросов, которые документ делает сам, — наверх, в гейт печати. Ключ-строка не даёт
  // эффекту срабатывать на каждый рендер (массив пересоздаётся всегда, статусы — нет).
  const depsKey = [
    modelsLoading,
    modelsError,
    releasesLoading,
    releasesError,
    chartLoading,
    chartError,
    materialsLoading,
    materialsError,
    mediaLoading,
    mediaError,
  ].join(',');
  useEffect(() => {
    onDataStatus?.([
      { label: 'модели', status: depStatus(modelsLoading, modelsError) },
      { label: 'релизы', status: depStatus(releasesLoading, releasesError) },
      { label: 'размерная таблица', status: depStatus(chartLoading, chartError) },
      { label: 'справочник материалов', status: depStatus(materialsLoading, materialsError) },
      { label: 'медиатека', status: depStatus(mediaLoading, mediaError) },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

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
  // Mirrors the backend's resolveUsageBom ladder: durable FK, then stable line_key, then the legacy
  // positional index. A line_key-authored usage round-trips with bomItemIndex unset, so resolving
  // positionally alone printed "—" in the material column for every recipe saved by this client.
  const resolveUsageArt = (u: {
    bomItemId?: number;
    bomLineKey?: string;
    bomItemIndex?: number;
  }): common_TechCardBomItem | undefined => {
    const items = tc.bomItems ?? [];
    const id = wireInt(u.bomItemId);
    if (id > 0) {
      const byId = items.find((b) => wireInt(b.id) === id);
      if (byId) return byId;
    }
    if (u.bomLineKey) {
      const byKey = items.find((b) => b.lineKey === u.bomLineKey);
      if (byKey) return byKey;
    }
    return u.bomItemIndex != null && u.bomItemIndex >= 0 ? items[u.bomItemIndex] : undefined;
  };
  // EVERY material a step consumes, not just the first. An operation links BOM lines many-to-many
  // (bom_line_keys → tech_card_operation_bom, 0200) — «втачать молнию» takes the zip AND the thread
  // — but this sheet resolved only the LEGACY singular triple through resolveUsageArt. That printed
  // one material for a step that has several, and nothing at all for a step whose links live purely
  // in bomLineKeys with the legacy mirror empty. The singular ref stays as the fallback, for rows
  // authored before the plural field existed.
  const resolveOpMaterials = (o: {
    bomLineKeys?: string[];
    bomItemId?: number;
    bomLineKey?: string;
    bomItemIndex?: number;
  }): string[] => {
    const items = tc.bomItems ?? [];
    // A key with no surviving line is DROPPED rather than printed as a placeholder: the tech pack
    // is what the factory cuts and sews to, and «(удалён)» on a spec sheet is worse than silence.
    // The editor surfaces the same dangling link in red, which is where it belongs.
    const names = (o.bomLineKeys ?? [])
      .filter(Boolean)
      .map((k) => items.find((b) => b.lineKey === k)?.name?.trim() || '')
      .filter(Boolean);
    // Fall through when the plural field resolved NOTHING, not merely when it was empty: the legacy
    // singular ref carries a durable bom_item_id and can still resolve a row whose key has moved.
    if (names.length > 0) return names;
    const legacy = resolveUsageArt(o)?.name?.trim();
    return legacy ? [legacy] : [];
  };
  // The step's pieces, by name — the "pieces" column of the operations table. Resolved through the
  // card's own piece list, which is why the removed free-text `placement` is not missed: it was this
  // same join, computed in the editor and stored in the row.
  const opParts = (o: { pieceLineKeys?: string[] }): string[] => {
    const pieces = tc.pieces ?? [];
    return (o.pieceLineKeys ?? [])
      .map((k) => pieces.find((pc) => pc.lineKey === k)?.name?.trim() || '')
      .filter(Boolean);
  };

  // The "part" column: the piece link is the durable ref (line_key, then the legacy piece_id);
  // free-text placement survives only on legacy rows, and an unlinked row is per-garment.
  const resolveUsagePart = (u: common_TechCardColorwayUsage): string => {
    const pieces = tc.pieces ?? [];
    const piece =
      (u.pieceLineKey ? pieces.find((p) => p.lineKey === u.pieceLineKey) : undefined) ??
      (wireInt(u.pieceId)
        ? pieces.find((p) => wireInt((p as unknown as { id?: unknown }).id) === wireInt(u.pieceId))
        : undefined);
    return piece?.name?.trim() || u.placement?.trim() || 'на изделие';
  };
  // The "colour" column: the effective article's own colour/pantone (pin, else slot default),
  // then the legacy usage-level text, then the slot's colour snapshot.
  const resolveUsageColour = (
    u: common_TechCardColorwayUsage,
    art?: common_TechCardBomItem,
  ): string => {
    const effId = wireInt(u.materialId) || wireInt(art?.materialId);
    const m = effId ? materialById.get(effId) : undefined;
    return (
      m?.color?.trim() ||
      m?.pantone?.trim() ||
      u.color?.trim() ||
      u.pantone?.trim() ||
      art?.color?.trim() ||
      ''
    );
  };
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

  // ── PATTERNS (Ф4): fold the sheets into DISPLAY fabric scopes — one QR per scope. ──
  // A row with no file is not a sheet yet; skipped exactly as before, and as the server
  // manifest skips it, so «N листов» counts what the viewer will actually list.
  const patternSheets = (tc.patterns ?? []).filter((p) => p.url?.trim());
  // Roll-goods lines EXACTLY as the patterns editor builds them (patterns-field.tsx
  // fabricBomLines): the four roll-goods sections AND a line key. isRollGoodsSection is the
  // same four-section set as the editor's ROLE_OF_SECTION. A different filter here would
  // print a different set of groups than both the editor and the server's viewerGroups
  // (internal/patternaccess/viewer.go) derive — and the caption would lie about what the QR
  // opens. The editor additionally re-sorts by role for its shelf; membership is what must
  // agree, and print keeps BOM order (which is also the manifest's group order).
  const rollGoodsLines: RollGoodsLine[] = (tc.bomItems ?? [])
    .filter((b) => isRollGoodsSection(b.section) && b.lineKey)
    .map((b) => ({
      lineKey: b.lineKey!,
      purpose: b.purpose ?? '',
      name: b.name ?? '',
      section: b.section ?? '',
    }));
  const patternScopes = fabricScopes(rollGoodsLines);
  // scopeKeyOfBinding resolves the MID-SORT case the same way the panel and the server do: a
  // sheet bound to line L, where L has since been sorted into назначение P, files under P's
  // group. '' = resolves to nothing → «листы без привязки».
  const sheetsByScope = new Map<string, common_TechCardSizePattern[]>();
  for (const p of patternSheets) {
    const k = scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, patternScopes);
    sheetsByScope.set(k, [...(sheetsByScope.get(k) ?? []), p]);
  }
  // THE WIRE KEY IS THE SERVER'S SPELLING — the whole correctness risk of this section. The
  // client stores a purpose as the proto enum name (TECH_CARD_BOM_PURPOSE_MAIN); the server's
  // manifest groups are keyed by the lowercase stored value (main). A purpose scope therefore
  // converts through wireFabricPurpose; an unsorted-line scope's key is its line_key verbatim
  // (already the stored spelling); unbound is the literal _unbound. A wrong spelling does not
  // error — the viewer silently falls back to the first group, i.e. the QR opens the wrong one.
  const patternGroups: Array<{
    wireKey: string;
    label: string;
    sheets: common_TechCardSizePattern[];
  }> = [];
  const seenScopeKeys = new Set<string>();
  for (const s of patternScopes) {
    if (seenScopeKeys.has(s.key)) continue; // duplicate line_key guard — one figure per key
    seenScopeKeys.add(s.key);
    const sheets = sheetsByScope.get(s.key) ?? [];
    if (sheets.length === 0) continue; // no sheets → no QR (the manifest omits the group too)
    patternGroups.push({
      wireKey: s.byPurpose ? wireFabricPurpose(s.key) : s.key,
      label: s.byPurpose
        ? bomPurposeLabel(s.key)
        : (s.lines[0]?.name ?? '').trim() || 'строка BOM',
      sheets,
    });
  }
  const unboundSheets = sheetsByScope.get('') ?? [];
  if (unboundSheets.length > 0) {
    patternGroups.push({ wireKey: '_unbound', label: 'листы без привязки', sheets: unboundSheets });
  }
  // Which sizes a group covers: named sizes in the card's size-range order (strays after),
  // plus «градуированные» for sizeless DXF and «без размера» for sizeless PDF — two different
  // facts, branched on the file format the same way the viewer's sheet list does.
  const patternGroupSizes = (sheets: common_TechCardSizePattern[]): string => {
    const named = new Set<number>();
    let graded = false;
    let sizeless = false;
    for (const p of sheets) {
      if (p.sizeId) named.add(p.sizeId);
      else if (patternExt(p) === 'dxf') graded = true;
      else sizeless = true;
    }
    const inRange = sizeIds.filter((id) => named.has(id));
    const stray = [...named].filter((id) => !sizeIds.includes(id));
    return [
      ...inRange.map(sizeName),
      ...stray.map(sizeName),
      graded ? 'градуированные' : '',
      sizeless ? 'без размера' : '',
    ]
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className='mx-auto max-w-[210mm] bg-white px-8 py-6 text-black'>
      {/* Постраничный колонтитул: лист, вынутый из середины стопки, обязан называть свой стиль
          и версию. Один PageFurniture на документ — @page глобален (см. page-furniture.tsx). */}
      <PageFurniture
        line={furnitureLine(
          tc.styleNumber ? `style ${tc.styleNumber}` : '',
          tc.name,
          latestRelease ? `rev.${latestRelease.releaseNumber ?? '—'}` : 'unreleased',
        )}
      />
      {/* COVER / IDENTITY */}
      <header className='mb-5 border-b-2 border-black pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-10 w-10 shrink-0 text-black' />
            <div>
              <div className='text-micro uppercase tracking-[0.2em] text-labelColor'>
                {tc.brand || 'GRBPWR'} · tech pack
              </div>
              <div className='text-2xl font-bold uppercase leading-tight'>
                {tc.name || 'untitled'}
              </div>
              <div className='text-sm'>
                style <span className='font-semibold'>{tc.styleNumber || '—'}</span>
                {/* Season is `skuSeason` (the structured SkuSeason) since the R1 merge — the flat
                    `season` string this header used to print is gone, which left the printed pack
                    without the one fact its style number encodes. */}
                {skuToSeasonLabel(tc.skuSeason) ? ` · ${skuToSeasonLabel(tc.skuSeason)}` : ''}
                {tc.collection ? ` · ${tc.collection}` : ''}
              </div>
            </div>
          </div>
          <div className='text-right text-control leading-tight'>
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
                  <figcaption className='mt-1 text-micro uppercase text-labelColor'>
                    {mediaKindL[meta?.kind ?? ''] ?? 'view'}
                    {meta?.caption ? ` · ${meta.caption}` : ''}
                  </figcaption>
                </figure>
              );
            })}
          </div>

          {has(tc.callouts) && (
            <table className='mt-3 w-full border-collapse text-micro'>
              <thead>
                <tr>
                  <th className={`${TH} w-8`}>#</th>
                  <th className={TH}>part</th>
                  <th className={TH}>description</th>
                </tr>
              </thead>
              <tbody>
                {(tc.callouts ?? []).map((c, i) => (
                  <tr key={i} className='break-inside-avoid'>
                    <td className={`${TD} text-center font-semibold`}>{c.number ?? i + 1}</td>
                    <td className={TD}>{c.part || '—'}</td>
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
                  <figcaption className='mt-1 text-micro uppercase text-labelColor'>
                    {mediaKindL[meta?.kind ?? ''] ?? 'reference'}
                    {meta?.caption ? ` · ${meta.caption}` : ''}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* MEASUREMENTS — point-of-measure grading chart (GetStyleSizeChart), the single most
          standard artifact of a garment tech pack; previously never fetched/printed. */}
      {has(sizeIds) && measurements.length > 0 && (
        <Sheet title={`measurements (${unitAbbr})`}>
          <table className='w-full border-collapse text-micro'>
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

      {/* PATTERNS (выкройки) — one QR per FABRIC SCOPE, opening the public viewer /p/{token}.
          The per-size breakdown is gone from paper: sheet choice, size switching and download
          all live in the viewer, so the print names the выкройка (the scope), not its files. */}
      {patternSheets.length > 0 && (
        <Sheet title='patterns (выкройки)'>
          {patternViewerToken ? (
            <>
              <div className='flex flex-wrap gap-4'>
                {patternGroups.map((g) => {
                  const maxVersion = g.sheets.reduce((m, p) => Math.max(m, p.version ?? 0), 0);
                  const sizesLine = patternGroupSizes(g.sheets);
                  return (
                    <figure
                      key={g.wireKey}
                      className='break-inside-avoid border border-black p-2 text-center'
                    >
                      <PatternQR
                        size={96}
                        value={`${viewerOrigin()}/p/${patternViewerToken}?g=${encodeURIComponent(g.wireKey)}`}
                      />
                      <figcaption className='mt-1 max-w-[150px] text-micro uppercase'>
                        <div className='break-words font-semibold'>{g.label}</div>
                        <div>
                          {g.sheets.length} {plural(g.sheets.length, 'лист', 'листа', 'листов')}
                          {maxVersion > 0 ? ` · v${maxVersion}` : ''}
                        </div>
                        {sizesLine && (
                          <div className='break-words text-labelColor'>{sizesLine}</div>
                        )}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
              <p className='mt-2 text-nano text-labelColor'>
                наведите камеру на QR — откроется вьюер этой выкройки: выбор листа, переключение
                размеров и скачивание внутри
              </p>
            </>
          ) : (
            <>
              {/* TRANSITIONAL fallback — the backend sent no viewer token (older backend, or the
                  pattern service unwired): the old per-sheet QR layout, byte-for-byte.
                  It deliberately still encodes the RAW url and NOT p.viewUrl, tempting as that
                  is: view_url is minted with the INTERNAL ('i') scope, whose whole reason for
                  existing is that revoking a leaked paper tech-pack must not have to break the
                  admin UI. Putting an admin-scope token on paper trades a known weakness (a
                  public storage url — what this branch always printed) for a contract violation
                  that outlives the transition. The print-scope url is not on the wire, so the
                  honest fix is to ship the backend first and never render this branch. Delete
                  it once every contour serves pattern_viewer_token. */}
              <div className='flex flex-wrap gap-4'>
                {patternSheets.map((p, i) => (
                  <figure
                    key={i}
                    className='break-inside-avoid border border-black p-2 text-center'
                  >
                    <PatternQR value={p.url ?? ''} />
                    <figcaption className='mt-1 text-micro uppercase'>
                      {/* Лист без размера (0281) — градуированный: размеры внутри файла. Печатать
                          под ним прочерк значило бы сказать «размер не заполнен», а это другой
                          факт. */}
                      <div className='font-semibold'>
                        {p.sizeId ? sizeName(p.sizeId) : 'весь ряд'}
                      </div>
                      {/* The operator's name for the sheet leads; the CAD filename stays as the
                          secondary line the factory can match against the file it receives. */}
                      {p.name && <div className='max-w-[120px] truncate'>{p.name}</div>}
                      {p.filename && (
                        <div className='max-w-[120px] truncate text-labelColor'>{p.filename}</div>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className='mt-2 text-nano text-labelColor'>
                наведите камеру на QR, чтобы открыть этот лист выкройки (PDF/DXF). «весь ряд» —
                градуированный файл: размеры записаны в именах блоков внутри него
              </p>
            </>
          )}
        </Sheet>
      )}

      {/* BILL OF MATERIALS — article catalog (recipe/consumption is per colourway below) */}
      {has(tc.bomItems) && (
        <Sheet title='bill of materials (article catalog)'>
          <table className='w-full border-collapse text-micro'>
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
          <table className='w-full border-collapse text-micro'>
            <thead>
              <tr>
                <th className={`${TH} w-6`}>#</th>
                <th className={TH}>piece</th>
                <th className={`${TH} text-center`}>qty / garment</th>
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
                    {/* КОЛИЧЕСТВО И ЕГО ПОЯСНЕНИЕ В ОДНОЙ КЛЕТКЕ — это и есть весь смысл Ф1.3 на
                        бумаге. Тех-пак печатает pieces_per_garment и НИКОГДА total, поэтому после
                        миграции 0266 зеркальная пара приходила на фабрику как голая «2», без
                        единого признака парности: шапка 0266 сама называет это своим худшим
                        последствием. Подпись стоит вплотную к числу, которое она уточняет, —
                        отдельная колонка на другом конце строки читалась бы как ещё один атрибут,
                        а не как оговорка к количеству. */}
                    <td className={`${TD} text-center`}>
                      <div>{p.piecesPerGarment ?? '—'}</div>
                      {(() => {
                        const caption = cutSymmetryPrintCaption(p.cutSymmetry, p.piecesPerGarment);
                        if (!caption) return null;
                        // Неразмеченная парная деталь — это ВОПРОС к цеху, а не факт о ней, и
                        // выглядеть он должен иначе, чем указание: рамка вместо простой подписи.
                        return cutSymmetryUnanswered(p.cutSymmetry, p.piecesPerGarment) ? (
                          <div className='mt-0.5 border border-black px-0.5 text-nano uppercase'>
                            {caption}
                          </div>
                        ) : (
                          <div className='mt-0.5 text-nano uppercase text-labelColor'>
                            {caption}
                          </div>
                        );
                      })()}
                    </td>
                    <td className={TD}>{p.grainline || '—'}</td>
                    <td className={`${TD} text-center`}>{p.fused ? 'yes' : 'no'}</td>
                    <td className={TD}>
                      {materials.length === 0 ? (
                        '—'
                      ) : (
                        <div className='flex flex-col gap-0.5'>
                          {materials.map((m, j) => {
                            const cw = colorways.find(
                              (c) => wireInt(c.colorwayId) === wireInt(m.colorwayId),
                            );
                            const fabricName = resolveUsageArt(m)?.name || '';
                            const fusingName =
                              resolveUsageArt({
                                bomItemId: m.fusingBomItemId,
                                bomLineKey: m.fusingBomLineKey,
                                bomItemIndex: m.fusingBomItemIndex,
                              })?.name || '';
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
          {/* Словарь колонки «qty / garment» — один раз под таблицей. Печатается только если в
              таблице реально есть что объяснять: на карточке, где ни одна деталь не размечена и все
              идут по одной, легенда была бы строкой ни о чём. */}
          {(tc.pieces ?? []).some((p) =>
            cutSymmetryPrintCaption(p.cutSymmetry, p.piecesPerGarment),
          ) && <p className='mt-1 text-nano text-labelColor'>{CUT_SYMMETRY_PRINT_LEGEND}</p>}
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
                  <div className='mb-1 flex items-center gap-2 border-b border-black pb-1 text-control'>
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
                    <p className='text-micro text-labelColor'>нет материалов</p>
                  ) : (
                    <table className='w-full border-collapse text-micro'>
                      <thead>
                        <tr>
                          <th className={TH}>part</th>
                          <th className={TH}>material</th>
                          <th className={TH}>colour</th>
                          <th className={`${TH} text-right`}>cons. / qty</th>
                          {/* No «run total»: it printed size_run_total, the spend on the card's
                              typical calculation batch. A style has no batch — the run does. */}
                          <th className={`${TH} text-right`}>per garment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usages.map((u, j) => {
                          const art = resolveUsageArt(u);
                          const cons =
                            dec(u.quantity) ||
                            dec(u.consumption) ||
                            (has(u.sizeConsumptions) ? 'по размерам' : '');
                          const colour = resolveUsageColour(u, art) || '—';
                          return (
                            <tr key={j} className='break-inside-avoid'>
                              <td className={TD}>{resolveUsagePart(u)}</td>
                              <td className={TD}>{art?.name || '—'}</td>
                              <td className={TD}>{colour}</td>
                              <td className={`${TD} whitespace-nowrap text-right`}>
                                {cons ? `${cons} ${art?.unit ?? ''}`.trim() : '—'}
                              </td>
                              <td className={`${TD} whitespace-nowrap text-right`}>
                                {dec(u.lineTotal) || '—'}
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
      {(tc.construction || has(tc.operations) || tc.requiredSeamAllowanceMm) && (
        <Sheet title='construction'>
          {/* CARD-LEVEL, so it prints on its own. It used to sit inside the construction block, which
              meant a card that sets the standard and leaves the defaults empty printed its steps and
              not the standard they inherit — and «0 mm» (cut on the line as drawn) became
              indistinguishable from «no standard» on the paper the floor works from. */}
          {allowanceText(tc.requiredSeamAllowanceMm) && (
            <div className='mb-2'>
              <KV k='required seam allowance' v={allowanceText(tc.requiredSeamAllowanceMm)} />
            </div>
          )}
          {tc.construction && (
            <div className='mb-3 grid grid-cols-2 gap-x-8'>
              <div>
                <KV k='default seam class' v={seamClassText(tc.construction.defaultSeamClass)} />
                <KV k='default density' v={densityText(tc.construction.defaultStitchesPerCm)} />
                <KV
                  k='overlock'
                  v={
                    tc.construction.overlockThreadCount
                      ? `${tc.construction.overlockThreadCount}-thread`
                      : ''
                  }
                />
              </div>
              <div>
                <KV k='hem finish' v={tc.construction.hemFinish} />
                <KV k='pressing' v={tc.construction.pressing} />
                <KV k='notes' v={tc.construction.notes} />
              </div>
            </div>
          )}
          {has(tc.operations) && (
            <table className='w-full border-collapse text-micro'>
              <thead>
                <tr>
                  <th className={`${TH} w-8`}>#</th>
                  <th className={TH}>operation</th>
                  <th className={TH}>zone</th>
                  <th className={TH}>pieces</th>
                  <th className={TH}>seam</th>
                  <th className={TH}>materials</th>
                  <th className={`${TH} text-right`}>SMV</th>
                </tr>
              </thead>
              <tbody>
                {(tc.operations ?? []).map((o, i) => {
                  // THE THREAD DE-DUPLICATION THAT USED TO LIVE HERE IS GONE, and so is the reason
                  // for it: the editor auto-filled `thread` from the linked BOM line, so the same
                  // string printed twice — once as the step's thread, once in its material list —
                  // and this table had to subtract one from the other before printing. There is one
                  // answer now, and it is the material list.
                  const materials = resolveOpMaterials(o);
                  const detail = [
                    dec(o.stitchesPerCm) && `${dec(o.stitchesPerCm)} st/cm`,
                    topstitchText(o.topstitch),
                    attachmentText(o.attachmentKind, o.attachmentSizeMm),
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <tr key={i} className='break-inside-avoid'>
                      <td className={`${TD} text-center`}>{o.operationNumber || (i + 1) * 10}</td>
                      <td className={TD}>
                        <div>{operationTypeText(o.operationType)}</div>
                        {o.note && <div className='italic text-labelColor'>{o.note}</div>}
                      </td>
                      <td className={TD}>{zoneText(o.zone) || '—'}</td>
                      <td className={TD}>{opParts(o).join(' + ') || '—'}</td>
                      <td className={TD}>
                        <div>{seamClassText(o.seamClass) || '—'}</div>
                        {/* An ABSENT allowance inherits the card standard printed above, so only a
                            value that DIFFERS is worth ink on the sheet the floor works from. */}
                        {allowanceText(o.seamAllowanceMm) && (
                          <div className='text-labelColor'>{allowanceText(o.seamAllowanceMm)}</div>
                        )}
                        {detail && <div className='text-labelColor'>{detail}</div>}
                      </td>
                      <td className={TD}>{materials.join(' + ') || '—'}</td>
                      <td className={`${TD} text-right`}>{dec(o.smv) || '—'}</td>
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
            <table className='mb-3 w-full border-collapse text-micro'>
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
                              const m = careVocabulary.byCode[code];
                              // Local artwork fallback: the printed tech pack must not degrade
                              // to bare codes while the backend dictionary is empty (pre-0217).
                              const img = m?.img ?? CARE_ARTWORK[code];
                              return img ? (
                                <img
                                  key={k}
                                  src={img}
                                  alt={m?.name ?? code}
                                  title={m?.name ?? code}
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
          <table className='w-full border-collapse text-micro'>
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
                    {/* Same rule as the assembly tile: a per-colour component has no single
                        destination, so the pack reports the count rather than one bucket. */}
                    {(a.outputVariantCount ?? 0) > 0 ? (
                      <div className='text-labelColor'>
                        → {a.outputVariantCount} {a.outputVariantCount === 1 ? 'colour' : 'colours'}
                      </div>
                    ) : (
                      a.outputMaterialName && (
                        <div className='text-labelColor'>→ {a.outputMaterialName}</div>
                      )
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
            <p className='mb-1 text-nano text-labelColor'>
              no style-specific recipe — showing the inherited global fallback
            </p>
          )}
          <table className='w-full border-collapse text-micro'>
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
              <KV k='logistics' v={dec(tc.costing.logisticsCost)} />
              <KV k='overhead' v={dec(tc.costing.overheadCost)} />
              <KV k='defect %' v={dec(tc.costing.defectPercent)} />
            </div>
            <div>
              <KV k='materials / unit (primary cw)' v={dec(tc.costing.materialsPerUnit)} />
              <KV k='unit cost' v={dec(tc.costing.unitCost)} />
              {/* No «order qty» / «order cost» on paper. They were the card's typical calculation
                  size run and unit cost × that run; the run is gone, so printing them would put a
                  zero-priced batch on a sheet a workshop reads as an order. The batch figures are
                  printed by the run pack (наряд на партию), from the run's own plan lines. */}
              <KV k='total SAM (min)' v={dec(tc.costing.totalSam)} />
            </div>
          </div>

          {/* per-colourway material cost */}
          {has(tc.costing.colorwayCosts) && (
            <table className='mt-3 w-full border-collapse text-micro'>
              <thead>
                <tr>
                  <th className={TH}>colourway</th>
                  <th className={`${TH} text-right`}>materials / unit</th>
                  <th className={`${TH} text-right`}>unit cost</th>
                </tr>
              </thead>
              <tbody>
                {(tc.costing.colorwayCosts ?? []).map((cc, i) => {
                  // colorway_id is a real FK (product id), not a positional index into
                  // `colorways` — resolve by id, not by array offset.
                  const cw = colorways.find(
                    (c) => wireInt(c.colorwayId) === wireInt(cc.colorwayId),
                  );
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* The sheet's closing total is the UNIT cost now that «order cost» is gone, so it
              takes the heavy 2px rule that used to close the sheet under the batch figure. */}
          <div className='mt-2 flex items-center justify-between border-t-2 border-black pt-1 text-sm'>
            <span className='font-bold uppercase'>unit cost</span>
            <span className='font-bold'>
              {dec(tc.costing.unitCost) || '—'} {tc.costing.currency ?? ''}
            </span>
          </div>
          {tc.costing.hasUnconvertedCurrencies && (
            <p className='mt-1 text-micro text-labelColor'>
              ⚠ contains unconverted currencies — totals are per-currency, not summed
            </p>
          )}
        </Sheet>
      )}

      {/* ISSUES */}
      {has(tc.issues) && (
        <Sheet title='issues'>
          <table className='w-full border-collapse text-micro'>
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
          <table className='w-full border-collapse text-micro'>
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

      <footer className='mt-6 border-t border-textInactiveColor pt-2 text-nano uppercase tracking-wide text-labelColor'>
        {tc.brand || 'GRBPWR'} · {tc.styleNumber || ''} · {tc.name || ''} · generated{' '}
        {formatTechCardDate(techCard.updatedAt)}
      </footer>
    </div>
  );
}
