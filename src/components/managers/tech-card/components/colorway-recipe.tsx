import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_ColorwayDevelopmentInsert,
  common_ColorwayLabDipRound,
  common_Material,
  common_TechCard,
  common_TechCardColorwayUsage,
  common_TechCardLabDipStatus,
  UpdateColorwayRequest,
} from 'api/proto-http/admin';
import {
  composeArticleFromMaterial,
  materialSpec,
} from 'components/managers/materials/components/material-code';
import { materialImageUrl } from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardLabDipStatusOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, buttonVariants } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import GenericPopover from 'ui/components/popover';
import { Row, RowTotal } from 'ui/components/row';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { sectionShort } from './bom-line-picker';
import { PieceRef } from './piece-picker';
import {
  createColorwayErrorMessage,
  recipeSaveErrorMessage,
  useCreateColorway,
  useUpdateColorwayRecipe,
} from './useColorwayRecipe';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// Phase-02 field metrics: a full 1px box, 3px/7px padding, 22px min height — identical to <Input>,
// so a control in this locally-managed editor is indistinguishable from an RHF-bound one elsewhere.
const cell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

// Inside a DataTable variant='grid' cell the BORDER is the cell's, not the input's — an input with
// its own box inside a bordered cell is the box-in-box the reference exists to kill.
const gridInput =
  'block min-h-[22px] w-full appearance-none border-0 bg-transparent text-center text-textBaseSize outline-none focus:bg-bgSecondary disabled:text-labelColor';

const PENDING = 'TECH_CARD_LAB_DIP_STATUS_PENDING';
const SUBMITTED = 'TECH_CARD_LAB_DIP_STATUS_SUBMITTED';
const REJECTED = 'TECH_CARD_LAB_DIP_STATUS_REJECTED';
const APPROVED = 'TECH_CARD_LAB_DIP_STATUS_APPROVED';
const UNKNOWN_LAB_DIP = 'TECH_CARD_LAB_DIP_STATUS_UNKNOWN';

// Ink → gray fibre shades for the composition bar (grays only, per the brand palette). Inline
// because a bar of N segments needs N distinct fills — this is a chart, not a themed surface.
const COMP_SHADES = ['#111111', '#666666', '#aaaaaa', '#cccccc', '#dddddd'];

// Measured sections cost by a rate (consumption, per metre/gram) and support per-size grading; the
// rest are counted (quantity, per piece). Mirrors colorways-field.tsx so the per-size grid only
// appears where it's meaningful.
const MEASURED_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
]);

type BomLine = {
  id?: number;
  lineKey?: string;
  name?: string;
  section?: string;
  unit?: string;
  unitPrice?: string; // decimal string
  currency?: string;
  wastagePercent?: string; // decimal string
  composition?: string; // legacy free-text (never structured, M1)
  materialId?: number;
  // the linked catalog material (resolved from ListMaterials by materialId) — carries the photo,
  // article code, class and spec the recipe card renders. undefined for a legacy/unlinked line.
  material?: common_Material;
};

type UsageDraft = {
  bomLineKey: string;
  placement: string;
  color: string;
  pantone: string;
  consumption: string;
  quantity: string;
  // preserved verbatim across the full-replace so a save never drops per-size grading / piece links.
  sizeConsumptions: { sizeId?: number; consumption?: string }[];
  pieceLineKey: string;
  // display-only (server-computed, stripped without costing:read).
  lineTotal: string;
  sizeRunTotal: string;
};

// Lab-dip editing state (M8). Initialised from the colourway ref's labDip* fields and PERSISTED through
// UpdateColorway's development submessage under LAB_DIP_UPDATE_MASK — see LabDipTimeline.
type LabDipDraft = {
  labDipStatus: string;
  labDipRound: string;
  labDipSubmittedAt: string;
  labDipDecidedAt: string;
  labDipDecidedBy: string;
  labDipRejectReason: string;
};

// What the grid tile needs to know about a recipe that is only fully known inside its editor: the
// LIVE material count (including rows added but not yet saved) and whether anything here is waiting
// on the card's Save.
type RecipeStatus = { count: number; staged: boolean };

// What the recipe editor needs to rebuild itself after a refresh (19.6). A UsageDraft is already
// plain strings and arrays, so it goes over as-is — there is no Map to flatten. The lab-dip draft is
// six strings and is stored as itself.
type RecipeSnapshot = { usages: UsageDraft[] };

// The operator's word for a colourway — never its numeric id: a staged change labelled
// «колорвей 4127» names nothing anybody can find in the swatch grid.
function colorwayTitle(cw: common_AdminColorwayRef): string {
  return cw.colorCode?.trim() || cw.baseSku?.trim() || `#${cw.colorwayId}`;
}

// THE OPTIMISTIC LOCK, READ AT COMMIT TIME — never at render time. Both colourway writes echo the
// ref's lockVersion, which IS the shared tech_card.lock_version. Under one staged save the card body
// commits first (COMMIT_ORDER 0) and bumps that version, and so does every colourway write queued
// ahead of this one. A version captured when this panel rendered is therefore already stale by the
// time the header reaches it, and the save would 409 against its own card body. So re-read it
// immediately before each write — the same move the size chart makes with GetStyleSizeChart.
async function readColorwayVersion(
  techCardId: number,
  colorwayId: number,
  fallback: number,
): Promise<number> {
  const res = await adminService.GetTechCard({ id: techCardId, vatCountryCode: undefined });
  const ref = res.techCard?.colorways?.find((c) => c.colorwayId === colorwayId);
  return ref?.lockVersion ?? res.techCard?.lockVersion ?? fallback;
}

// How many recipe lines this draft actually changes against what the server returned. The header's
// label has to be a FACT, and the write is a FULL REPLACE — counting every line it sends would claim
// work nobody did. Re-derived over the PIECE MODEL: a line is identified by the piece it sits on
// (piece-bound), or by its fabric when its piece is gone (an orphan). Blank piece cards carry no
// fabric, are not lines, and are never counted — so poking a piece and leaving it empty stages
// nothing.
function changedLines(base: UsageDraft[], next: UsageDraft[], pieceKeys: Set<string>): number {
  const key = (u: UsageDraft) =>
    pieceKeys.has(u.pieceLineKey) ? `p:${u.pieceLineKey}` : `o:${u.bomLineKey}`;
  const sig = (u: UsageDraft) => JSON.stringify(toWire(u));
  const before = new Map(base.filter((u) => u.bomLineKey).map((u) => [key(u), sig(u)]));
  const after = new Map(next.filter((u) => u.bomLineKey).map((u) => [key(u), sig(u)]));
  let n = 0;
  // added (no such key before) or edited (same key, different payload)
  for (const [k, s] of after) if (before.get(k) !== s) n += 1;
  for (const k of before.keys()) if (!after.has(k)) n += 1; // removed
  return n;
}

// UpdateColorway is a field-masked write. This mask lists ONLY the six lab-dip leaves INSIDE `development`,
// so a save touches exactly those columns and nothing else on the colourway. Everything else in the
// development submessage (devCode / name / pantone / pantoneSystem / devHex / swatchMediaId / usages /
// displayOrder) is left intact by the backend even though it is sent undefined here — that subpath mask is
// precisely what prevents clobbering. It also means no read-merge is needed (and none is possible: no read
// path returns those dev identity fields). `usages` stays owned by UpdateColorwayRecipe — never sent here.
// The paths are camelCase on purpose: that is the form the server matches, so do not "correct" them to the
// proto's snake_case — a mask it cannot match silently degrades into writing nothing.
const LAB_DIP_UPDATE_MASK = [
  'development.labDipStatus',
  'development.labDipRound',
  'development.labDipSubmittedAt',
  'development.labDipDecidedAt',
  'development.labDipDecidedBy',
  'development.labDipRejectReason',
].join(',');

// protobuf Timestamp (RFC 3339) <-> <input type="date"> (YYYY-MM-DD). The 0001-01-01 zero value is "unset".
const ZERO_TS = '0001-01-01T00:00:00Z';
function tsToDateInput(ts?: string): string {
  if (!ts || ts.startsWith('0001-01-01')) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? m[1] : '';
}
function dateInputToTs(v: string): string {
  if (!v) return ZERO_TS;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v;
}
function todayInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// "2026-07-08" -> "08 jul" — the timeline reads as a date line, not an ISO stamp.
function fmtDay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]}`;
}

// Initialise the editor from the colourway ref's mirrored lab-dip fields (techCard.colorways[].labDip*),
// instead of always starting empty. An UNKNOWN/absent status falls back to PENDING (the editor baseline).
function fromRefLabDip(cw: common_AdminColorwayRef): LabDipDraft {
  const status = cw.labDipStatus;
  return {
    labDipStatus: status && status !== UNKNOWN_LAB_DIP ? status : PENDING,
    labDipRound: cw.labDipRound ? String(cw.labDipRound) : '',
    labDipSubmittedAt: tsToDateInput(cw.labDipSubmittedAt),
    labDipDecidedAt: tsToDateInput(cw.labDipDecidedAt),
    labDipDecidedBy: cw.labDipDecidedBy ?? '',
    labDipRejectReason: cw.labDipRejectReason ?? '',
  };
}

// Has a round actually been submitted? The read path collapses "never submitted" and "round 1 pending"
// onto the same PENDING baseline (fromRefLabDip), so anything that only a real submission produces —
// a round number, a date, a decided status — is what distinguishes them.
function hasLabDipRound(d: LabDipDraft): boolean {
  return (
    (parseInt(d.labDipRound, 10) || 0) > 0 ||
    !!d.labDipSubmittedAt ||
    !!d.labDipDecidedAt ||
    d.labDipStatus === SUBMITTED ||
    d.labDipStatus === APPROVED ||
    d.labDipStatus === REJECTED
  );
}

// One row of the timeline. `staged` marks the round the draft is currently editing — the only row
// that is not straight off the server's journal.
type TimelineRound = {
  key: string;
  round: number;
  status: string;
  submittedAt: string; // YYYY-MM-DD (input form), as fmtDay expects
  decidedAt: string;
  decidedBy: string;
  rejectReason: string;
  comment: string;
  staged?: boolean;
};

function fromRecordedRound(r: common_ColorwayLabDipRound, i: number): TimelineRound {
  const status = r.status;
  return {
    key: `round-${r.roundNumber ?? i}`,
    round: r.roundNumber ?? 0,
    status: status && status !== UNKNOWN_LAB_DIP ? status : PENDING,
    submittedAt: tsToDateInput(r.submittedAt),
    decidedAt: tsToDateInput(r.decidedAt),
    decidedBy: r.decidedBy ?? '',
    rejectReason: r.rejectReason ?? '',
    comment: r.comment ?? '',
  };
}

// The substance of a round's verdict, next to (never duplicating) its status pill: why it was rejected,
// who approved it and when, or that it is still out at the dyehouse.
function roundOutcome(r: TimelineRound): string {
  if (r.status === REJECTED) return r.rejectReason.trim() || r.comment.trim();
  if (r.status === APPROVED)
    return [r.decidedBy, fmtDay(r.decidedAt)].filter(Boolean).join(' · ') || r.comment.trim();
  return r.comment.trim() || 'awaiting decision';
}

// Build the field-masked UpdateColorway request that persists ONLY this colourway's lab-dip state. Every
// non-lab-dip key is sent undefined AND left out of the mask, so merchandising / media / prices / tags and
// the rest of `development` are untouched. expected_colorway_version is passed IN rather than read off the
// ref: under the card's one save the shared tech_card.lock_version has usually moved since this panel
// rendered, so the caller reads it fresh (readColorwayVersion) right before the write.
function buildLabDipRequest(
  cw: common_AdminColorwayRef,
  draft: LabDipDraft,
  expectedColorwayVersion: number,
): UpdateColorwayRequest {
  const development: common_ColorwayDevelopmentInsert = {
    devCode: undefined,
    name: undefined,
    labDipStatus: draft.labDipStatus as common_TechCardLabDipStatus,
    comment: undefined,
    pantone: undefined,
    pantoneSystem: undefined,
    devHex: undefined,
    swatchMediaId: undefined,
    labDipRound: parseInt(draft.labDipRound, 10) || 0,
    labDipSubmittedAt: dateInputToTs(draft.labDipSubmittedAt),
    labDipDecidedAt: dateInputToTs(draft.labDipDecidedAt),
    labDipDecidedBy: draft.labDipDecidedBy.trim(),
    // Only meaningful when rejected; cleared otherwise so a stale reason never lingers.
    labDipRejectReason: draft.labDipStatus === REJECTED ? draft.labDipRejectReason.trim() : '',
    usages: undefined, // recipe is owned by UpdateColorwayRecipe — never write it through here.
    displayOrder: undefined,
  };
  return {
    colorwayId: cw.colorwayId ?? 0,
    expectedColorwayVersion,
    merchandising: undefined,
    development,
    mediaIds: undefined,
    tags: undefined,
    prices: undefined,
    updateMask: LAB_DIP_UPDATE_MASK,
    thumbnailMediaId: undefined,
    secondaryThumbnailMediaId: undefined,
    costPrice: undefined,
    countryCode: undefined,
    translations: undefined,
  };
}

const labDipStatusLabel = new Map<common_TechCardLabDipStatus, string>(
  techCardLabDipStatusOptions.map((o) => [o.value, o.label]),
);

// Lab-dip status marker. Green = approved, red = rejected, blue = mid-flight (pending / submitted),
// grey = never submitted. Read-only, so a Pill and never a Chip.
function LabDipPill({ status }: { status?: string }) {
  const s = status && status !== UNKNOWN_LAB_DIP ? status : '';
  if (!s) return <Pill tone='mut'>no lab-dip</Pill>;
  const label = labDipStatusLabel.get(s as common_TechCardLabDipStatus) ?? s;
  const tone: 'ok' | 'warn' | 'attention' =
    s === APPROVED ? 'ok' : s === REJECTED ? 'warn' : 'attention';
  return <Pill tone={tone}>{label}</Pill>;
}

// The reference's `.sw`: a 12px colour square carrying a 1px ink outline. Unlike the big tile swatch
// (where the colour is the whole content and an outline would make it read as a box), an inline
// swatch this small needs the outline or a pale dye vanishes into the page.
function Swatch({ hex, title }: { hex?: string; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? hex ?? undefined}
      className='inline-block size-3 shrink-0 border border-textColor'
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

// Field label at phase-02 density: 10px uppercase grey, tight above its control. FormLabel can't be
// reused here — it reads an RHF FieldContext this locally-managed editor doesn't have.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' component='span' className='block leading-none uppercase'>
      {children}
    </Text>
  );
}

// The lock version is read fresh immediately before the write, so a 409 here is a genuinely
// concurrent edit by someone else — not this card's own save racing itself.
function labDipSaveErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409)
    return 'Someone else changed this colourway while you were saving — reload and re-apply the lab-dip change.';
  return e instanceof Error ? e.message : 'Failed to save lab-dip';
}

// Lab-dip write: UpdateColorway under the subpath mask above. Mirrors useUpdateColorwayRecipe — invalidate
// the tech-card detail, which is the read that carries colorways[].labDip* (the latest round), each ref's
// lockVersion AND colorways[].labDipRounds (the journal the timeline draws). A save appends to or amends
// that journal server-side, so refetching the detail is what makes the new round appear.
//
// The mutation is fired through mutateAsync from the staged commit, so a rejection propagates to the
// header instead of being swallowed here — the header is what reports the outcome now (19.3).
function useUpdateColorwayLabDip(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateColorwayRequest) => adminService.UpdateColorway(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
  });
}

function measured(section?: string): boolean {
  return !section || MEASURED_SECTIONS.has(section);
}

// Resolve a stored usage into a draft. bom_line_key is the durable ref; fall back to resolving the
// server bom_item_id against the saved BOM lines so a legacy usage still points at the right line.
function fromRead(u: common_TechCardColorwayUsage, bomItems: BomLine[]): UsageDraft {
  const byId = u.bomItemId ? bomItems.find((b) => b.id === u.bomItemId)?.lineKey : undefined;
  return {
    bomLineKey: u.bomLineKey || byId || '',
    placement: u.placement || '',
    color: u.color || '',
    pantone: u.pantone || '',
    consumption: decimalToInput(u.consumption),
    quantity: decimalToInput(u.quantity),
    sizeConsumptions: (u.sizeConsumptions ?? []).map((s) => ({
      sizeId: s.sizeId,
      consumption: decimalToInput(s.consumption),
    })),
    pieceLineKey: u.pieceLineKey || '',
    lineTotal: decimalToInput(u.lineTotal),
    sizeRunTotal: decimalToInput(u.sizeRunTotal),
  };
}

function toWire(d: UsageDraft): common_TechCardColorwayUsage {
  return {
    // durable ref (§2.3); the server resolves it to the real FK — positional index/id not sent.
    bomLineKey: d.bomLineKey || '',
    bomItemIndex: undefined,
    bomItemId: undefined,
    placement: d.placement.trim(),
    color: d.color.trim(),
    pantone: d.pantone.trim(),
    consumption: inputToDecimal(d.consumption),
    quantity: inputToDecimal(d.quantity),
    sizeConsumptions: (d.sizeConsumptions ?? [])
      .filter((s) => s.sizeId)
      .map((s) => ({ sizeId: s.sizeId, consumption: inputToDecimal(s.consumption) })),
    pieceLineKey: d.pieceLineKey || '',
    pieceId: undefined,
    pieceIndex: undefined,
    // output-only — never sent
    lineTotal: undefined,
    sizeRunTotal: undefined,
  };
}

// Client-side preview of the whole-run spend for a measured usage (the backend computes the
// authoritative size_run_total): Σ(consumption_size × orderQty_size) × price × (1 + wastage%).
function runTotalPreview(
  sizeIds: number[],
  consumptionBySize: Map<number, string>,
  orderQtyBySize: Map<number, number>,
  unitPrice: string,
  wastagePercent: string,
): string {
  const price = Number(unitPrice);
  if (!unitPrice.trim() || Number.isNaN(price)) return '';
  let units = 0;
  let any = false;
  for (const id of sizeIds) {
    const raw = consumptionBySize.get(id);
    const c = Number(raw);
    if (raw?.trim() && !Number.isNaN(c)) {
      units += c * (orderQtyBySize.get(id) ?? 0);
      any = true;
    }
  }
  if (!any || units === 0) return '';
  const wastage = Number(wastagePercent) || 0;
  const total = units * price * (1 + wastage / 100);
  return Number.isFinite(total) ? String(Number(total.toFixed(2))) : '';
}

// #29 — best-effort DERIVED fibre composition for a colourway, computed from its recipe's BOM lines.
// The BOM line `composition` is legacy FREE TEXT (never structured, M1), so this parses "NN% fibre"
// tokens and weights each line's fibres by that usage's per-garment consumption (fallback: equal
// weight), then normalises to 100%. Approximate by construction — flagged in the UI. A precise
// weighted composition needs a structured per-material composition on the backend (see report).
function deriveComposition(
  usages: UsageDraft[],
  bomItems: BomLine[],
): { fibers: { name: string; percent: number }[]; skipped: number } {
  const totals = new Map<string, number>();
  let skipped = 0;
  for (const u of usages) {
    if (!u.bomLineKey) continue;
    const line = bomItems.find((b) => b.lineKey === u.bomLineKey);
    const comp = line?.composition?.trim();
    const weight = Number(u.consumption) > 0 ? Number(u.consumption) : 1;
    const tokens = comp ? [...comp.matchAll(/(\d+(?:\.\d+)?)\s*%\s*([\p{L}][\p{L} .\-/]*)/gu)] : [];
    if (tokens.length === 0) {
      skipped += 1;
      continue;
    }
    for (const t of tokens) {
      const pct = Number(t[1]);
      const name = t[2].trim().toLowerCase();
      if (!name || !Number.isFinite(pct)) continue;
      totals.set(name, (totals.get(name) ?? 0) + (pct / 100) * weight);
    }
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return { fibers: [], skipped };
  const fibers = [...totals.entries()]
    .map(([name, v]) => ({ name, percent: Math.round((v / sum) * 1000) / 10 }))
    .sort((a, b) => b.percent - a.percent);
  return { fibers, skipped };
}

// Per-size consumption grading for one measured usage (ported from colorways-field.tsx into the
// live local-state editor, M8/§296). Two chips flip between «один на изделие» (the single
// consumption) ↔ «по размерам» (a grid of one input per declared card size), with a live run-cost
// preview using the referenced article's price/wastage.
function UsagePerSizeLocal({
  draft,
  sizeIds,
  sizeQuantities,
  article,
  canEdit,
  sizeNameById,
  onChange,
}: {
  draft: UsageDraft;
  sizeIds: number[];
  sizeQuantities: { sizeId?: number; orderQty?: number }[];
  article?: BomLine;
  canEdit: boolean;
  sizeNameById: Map<number, string>;
  onChange: (patch: Partial<UsageDraft>) => void;
}) {
  const perSize = draft.sizeConsumptions.length > 0;
  const lastPerSize = useRef<{ sizeId: number; consumption: string }[]>([]);

  const consumptionBySize = new Map<number, string>();
  for (const e of draft.sizeConsumptions)
    if (e.sizeId != null) consumptionBySize.set(e.sizeId, e.consumption ?? '');
  const orderQtyBySize = new Map<number, number>();
  for (const q of sizeQuantities) if (q.sizeId) orderQtyBySize.set(q.sizeId, q.orderQty ?? 0);

  const enablePerSize = () => {
    if (perSize) return;
    const prior = new Map(lastPerSize.current.map((e) => [e.sizeId, e.consumption]));
    onChange({
      sizeConsumptions: sizeIds.map((id) => ({
        sizeId: id,
        consumption: prior.get(id) ?? draft.consumption ?? '',
      })),
    });
  };
  const disablePerSize = () => {
    if (!perSize) return;
    lastPerSize.current = draft.sizeConsumptions.map((e) => ({
      sizeId: e.sizeId ?? 0,
      consumption: e.consumption ?? '',
    }));
    onChange({ sizeConsumptions: [] });
  };
  const setSizeCell = (sizeId: number, value: string) => {
    const clean = sanitizeDecimal(value);
    const next = [...draft.sizeConsumptions];
    const i = next.findIndex((x) => x.sizeId === sizeId);
    if (i >= 0) next[i] = { sizeId, consumption: clean };
    else next.push({ sizeId, consumption: clean });
    onChange({ sizeConsumptions: next });
  };

  const preview = runTotalPreview(
    sizeIds,
    consumptionBySize,
    orderQtyBySize,
    article?.unitPrice ?? '',
    article?.wastagePercent ?? '',
  );
  const currency = article?.currency ?? '';
  const unit = article?.unit?.trim() || '';
  const hasOrderQty = sizeIds.some((id) => (orderQtyBySize.get(id) ?? 0) > 0);
  const hasAnyConsumption = sizeIds.some((id) => consumptionBySize.get(id)?.trim());

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <FieldLabel>consumption{unit ? ` (${unit})` : ''}</FieldLabel>
        {sizeIds.length > 0 && canEdit && (
          <ChipRow>
            <Chip selected={!perSize} pressed={!perSize} onClick={disablePerSize}>
              один на изделие
            </Chip>
            <Chip selected={perSize} pressed={perSize} onClick={enablePerSize}>
              по размерам
            </Chip>
          </ChipRow>
        )}
      </div>

      {!perSize ? (
        <input
          className={cell}
          inputMode='decimal'
          disabled={!canEdit}
          placeholder='per garment'
          aria-label={`consumption per garment${unit ? ` (${unit})` : ''}`}
          value={draft.consumption}
          onChange={(e) => onChange({ consumption: sanitizeDecimal(e.target.value) })}
        />
      ) : (
        <div className='flex flex-col gap-1.5'>
          <DataTable variant='grid'>
            <thead>
              <tr>
                <th>size</th>
                {sizeIds.map((id) => (
                  <th key={id}>{formatSizeName(sizeNameById.get(id) ?? `#${id}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{unit ? `${unit} / garment` : 'per garment'}</td>
                {sizeIds.map((id) => (
                  <td key={id}>
                    <input
                      className={gridInput}
                      inputMode='decimal'
                      disabled={!canEdit}
                      placeholder='0.00'
                      aria-label={`consumption ${formatSizeName(sizeNameById.get(id) ?? `#${id}`)}`}
                      value={consumptionBySize.get(id) ?? ''}
                      onChange={(e) => setSizeCell(id, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td>order qty</td>
                {sizeIds.map((id) => (
                  <td key={id} className='text-labelColor'>
                    {orderQtyBySize.get(id) || <EmptyCell />}
                  </td>
                ))}
              </tr>
            </tbody>
          </DataTable>

          <RowTotal
            label='расход на партию ≈'
            value={preview ? `${preview} ${currency}`.trim() : '—'}
          />
          {draft.sizeRunTotal && (
            <Row
              tone='label'
              label={
                <Text size='micro' variant='label' component='span'>
                  сохранённое
                </Text>
              }
              value={
                <Text size='micro' variant='label' component='span'>
                  {draft.sizeRunTotal} {currency}
                </Text>
              }
            />
          )}
          {hasAnyConsumption && !hasOrderQty && (
            <CalloutBox tone='warning'>
              <Text size='micro' component='span'>
                заполните тираж по размерам (patterns → size run), чтобы посчитать расход на партию
              </Text>
            </CalloutBox>
          )}
        </div>
      )}
    </div>
  );
}

// The one-word material class ("тип"): fabric / hardware / thread / packaging — the same rule the
// catalog card uses, kept local so the recipe card badges class the way the BOM catalogue does.
function materialClassLabel(c?: string): string {
  return c && c !== 'MATERIAL_CLASS_UNKNOWN' ? c.replace('MATERIAL_CLASS_', '').toLowerCase() : '';
}

// The material rendered as the SAME square article card the BOM tab shows — identical fields in the
// same order (photo · section+тип pills · name · code · spec+colour) so a usage reads as the article
// it points at, not as a dropdown value. For a legacy/unlinked line (no catalog material) it degrades
// to the placeholder photo + the BOM line's own name, so the card still stands in for the article.
function RecipeMaterialCard({ article }: { article?: BomLine }) {
  const material = article?.material;
  const url = materialImageUrl(material);
  const section = sectionShort(article?.section);
  const klass = materialClassLabel(material?.materialClass);
  const name = material?.name?.trim() || article?.name?.trim() || 'new material';
  const code = material ? composeArticleFromMaterial(material, true) : '';
  const spec = material
    ? [materialSpec(material), material.color?.trim()].filter(Boolean).join(' · ')
    : '';

  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <span className='relative block aspect-square w-full overflow-hidden border border-borderColor'>
        {url ? (
          <Media src={url} alt={name} aspectRatio='1/1' fit='cover' />
        ) : (
          <Placeholder aspect='square' label='no photo' />
        )}
      </span>
      {(section || klass) && (
        <div className='flex flex-wrap items-center gap-1'>
          {section && <Pill tone='mut'>{section}</Pill>}
          {klass && <Pill tone='mut'>{klass}</Pill>}
        </div>
      )}
      <Text component='span' size='control' className='block truncate font-bold'>
        {name}
      </Text>
      {code && (
        <Text component='span' size='micro' className='block truncate font-mono tabular-nums'>
          {code}
        </Text>
      )}
      {spec && (
        <Text component='span' size='micro' variant='label' className='block truncate'>
          {spec}
        </Text>
      )}
    </div>
  );
}

// Option label for the fabric picker: the linked catalog material's article code (or its name) plus
// its spec, so an operator picks a fabric by what it IS, not by a BOM row number. Falls back to the
// BOM line's own name for a legacy/unlinked line.
function fabricOptionLabel(b: BomLine): string {
  const m = b.material;
  const base = m
    ? composeArticleFromMaterial(m, true) || m.name?.trim() || b.name?.trim() || 'material'
    : b.name?.trim() || 'unnamed';
  const spec = m ? materialSpec(m) : '';
  return spec ? `${base} · ${spec}` : base;
}

// A fresh usage for a piece that has none yet: no fabric, its placement primed to the piece name so
// the PDF and legacy readers still get a human label the moment a fabric is picked.
function blankDraft(pieceLineKey: string, placement: string): UsageDraft {
  return {
    bomLineKey: '',
    placement,
    color: '',
    pantone: '',
    consumption: '',
    quantity: '',
    sizeConsumptions: [],
    pieceLineKey,
    lineTotal: '',
    sizeRunTotal: '',
  };
}

// Stable-enough identity for an orphan usage in the session keep-set: its fabric, else its dead
// piece key.
const orphanKey = (u: UsageDraft) => u.bomLineKey || u.pieceLineKey || '∅';

// ONE CARD PER DECLARED CUT PIECE. The header NAMES the piece and is fixed — the recipe assigns a
// fabric TO a piece, it never chooses which piece (that is the PIECES tab). A piece takes exactly one
// fabric, so the picker is a single select whose options carry the material's own meta; the chosen
// article renders as the same square BOM card the catalogue shows, and the consumption controls
// below are the measured/counted pair, unchanged.
function PieceRecipeCard({
  piece,
  draft,
  bomItems,
  sizeIds,
  sizeQuantities,
  sizeNameById,
  canEdit,
  onChange,
}: {
  piece: PieceRef;
  draft: UsageDraft;
  bomItems: BomLine[];
  sizeIds: number[];
  sizeQuantities: { sizeId?: number; orderQty?: number }[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onChange: (patch: Partial<UsageDraft>) => void;
}) {
  const article = draft.bomLineKey
    ? bomItems.find((b) => b.lineKey === draft.bomLineKey)
    : undefined;
  const isMeasured = measured(article?.section);
  const unit = article?.unit?.trim() || '';
  const hasFabric = !!draft.bomLineKey;

  return (
    <div className='flex flex-col gap-2 border border-borderColor p-2.5'>
      {/* HEADER — the cut piece, fixed. No piece picker: this card IS that piece's line. */}
      <div className='flex items-center justify-between gap-2'>
        <Text size='control' component='span' className='min-w-0 truncate font-bold uppercase'>
          {piece.name?.trim() || 'без названия'}
        </Text>
        {!hasFabric && <Pill tone='mut'>no fabric yet</Pill>}
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:items-start'>
        {/* LEFT — the fabric AS the square BOM card, with the single picker that assigns which catalog
            article this piece is cut from directly under it. Option labels carry the material's meta
            so a fabric is chosen by what it is, not a row number. */}
        <div className='flex w-full flex-col gap-1.5 sm:w-40 sm:shrink-0'>
          <RecipeMaterialCard article={article} />
          <label className='flex flex-col gap-1'>
            <FieldLabel>ткань</FieldLabel>
            <select
              className={cell}
              disabled={!canEdit}
              value={draft.bomLineKey}
              onChange={(e) => onChange({ bomLineKey: e.target.value })}
            >
              <option value=''>— no fabric yet —</option>
              {/* keep an unknown stored key selectable so a save never silently drops it */}
              {draft.bomLineKey && !bomItems.some((b) => b.lineKey === draft.bomLineKey) ? (
                <option value={draft.bomLineKey}>(unknown / removed material)</option>
              ) : null}
              {bomItems.map((b) => (
                <option key={b.lineKey} value={b.lineKey}>
                  {fabricOptionLabel(b)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* RIGHT — how much of that fabric this piece takes. Measured articles cost by a rate (per-size
            gradable); counted ones by a flat quantity (M14) — the controls are unchanged. */}
        <div className='flex min-w-0 flex-1 flex-col gap-3'>
          {isMeasured ? (
            <UsagePerSizeLocal
              draft={draft}
              sizeIds={sizeIds}
              sizeQuantities={sizeQuantities}
              article={article}
              canEdit={canEdit}
              sizeNameById={sizeNameById}
              onChange={onChange}
            />
          ) : (
            <label className='flex flex-col gap-1'>
              <FieldLabel>quantity{unit ? ` (${unit})` : ''}</FieldLabel>
              <input
                className={cell}
                inputMode='decimal'
                disabled={!canEdit}
                value={draft.quantity}
                onChange={(e) => onChange({ quantity: sanitizeDecimal(e.target.value) })}
              />
            </label>
          )}
        </div>
      </div>

      {/* server-computed spend — present only with costing:read (stripped otherwise) */}
      {(draft.lineTotal || draft.sizeRunTotal) && (
        <Text size='micro' variant='label'>
          {draft.lineTotal ? `per garment ${draft.lineTotal}` : ''}
          {draft.lineTotal && draft.sizeRunTotal ? ' · ' : ''}
          {draft.sizeRunTotal ? `run ${draft.sizeRunTotal}` : ''}
        </Text>
      )}
    </div>
  );
}

// A usage whose piece is no longer declared (removed on the PIECES tab, a legacy/empty pieceLineKey,
// or a duplicate of a piece that already has a card). Surfaced rather than silently dropped: KEEP
// retains it in the full-replace save exactly as it is, UNLINK removes it from the recipe. Read-only
// — this is triage, not editing.
function OrphanRecipeCard({
  draft,
  bomItems,
  canEdit,
  kept,
  onKeep,
  onUnlink,
}: {
  draft: UsageDraft;
  bomItems: BomLine[];
  canEdit: boolean;
  kept: boolean;
  onKeep: () => void;
  onUnlink: () => void;
}) {
  const article = draft.bomLineKey
    ? bomItems.find((b) => b.lineKey === draft.bomLineKey)
    : undefined;
  const consumption =
    draft.sizeConsumptions.length > 0
      ? 'per-size consumption'
      : draft.consumption
        ? `consumption ${draft.consumption}`
        : draft.quantity
          ? `quantity ${draft.quantity}`
          : '';

  return (
    <div className='flex flex-col gap-2 border border-borderColor p-2.5'>
      <div className='flex items-center justify-between gap-2'>
        <Text size='micro' variant='label' component='span' className='min-w-0 truncate uppercase'>
          {draft.placement?.trim() || 'unassigned'}
        </Text>
        <Pill tone='warn'>piece removed</Pill>
      </div>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start'>
        <div className='w-full sm:w-40 sm:shrink-0'>
          <RecipeMaterialCard article={article} />
        </div>
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          <Text size='micro' variant='label'>
            This fabric points at a cut piece that is no longer on the PIECES tab.
          </Text>
          {consumption && (
            <Text size='micro' variant='label'>
              {consumption}
            </Text>
          )}
          {canEdit &&
            (kept ? (
              <Text size='micro' variant='label'>
                kept · saved as-is
              </Text>
            ) : (
              <div className='flex flex-wrap items-center gap-1.5'>
                <Button type='button' variant='secondary' size='sm' onClick={onKeep}>
                  keep
                </Button>
                <Button type='button' variant='secondary' size='sm' onClick={onUnlink}>
                  unlink
                </Button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Lab-dip approval lifecycle (M8), rendered as the ROUND TIMELINE the process actually is: R1 rejected →
// R2 rejected → R3 approved, mapped straight off `AdminColorwayRef.labDipRounds` (oldest first). The six
// flat labDip* scalars are the LATEST entry of that same journal, so no row is ever reconstructed from
// them — a colourway with no rounds has genuinely never had a swatch submitted, and the timeline says
// exactly that rather than inventing an R1 out of a PENDING baseline.
//
// PERSISTENCE: UpdateColorway's `development` submessage under LAB_DIP_UPDATE_MASK, a field mask naming
// ONLY the six lab-dip leaves. That subpath mask keeps the rest of `development` (devCode / name / pantone
// / devHex / swatch / usages) intact, so no read-merge is needed (and none is possible — no read path
// returns those dev identity fields). That write now REACHES THE DATABASE: the server used to ignore
// UpdateColorway's `development` entirely, so every save this panel made was a no-op that still reported
// success. If you are wondering why the panel suddenly works, that is why — nothing changed on this side.
// The server keys each write by round_number, so saving round 3 leaves rounds 1-2 standing and the journal
// grows one entry per round.
//
// Phase 19: the RPC is still this panel's, but the BUTTON is not. There is one save on the card and this
// panel STAGES into it (key `labDip:<colorwayId>`, COMMIT_ORDER.labDip). The action buttons only move the
// draft; nothing reaches the server until the card's Save runs. Until then the staged round is drawn on
// the timeline marked STAGED, so an approve or a reject is visible where it will land rather than only as
// a pill on the toolbar.
function LabDipTimeline({
  colorway,
  techCardId,
  lockVersion,
  canEdit,
  swatchHex,
  onStagedChange,
}: {
  colorway: common_AdminColorwayRef;
  techCardId: number;
  lockVersion: number;
  canEdit: boolean;
  swatchHex?: string;
  onStagedChange: (staged: boolean) => void;
}) {
  const save = useUpdateColorwayLabDip(techCardId);
  const staging = useTechCardStaging();
  // A colourway the card has not created yet has no id to write against — it must not stage.
  const colorwayId = colorway.colorwayId ?? 0;
  const stagingKey = `labDip:${colorwayId}`;
  const [dirty, setDirty] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  // What the server says this colourway's lab-dip is: the editor's starting point AND the baseline the
  // draft is diffed against below.
  const stored = useMemo(() => fromRefLabDip(colorway), [colorway]);
  const [draft, setDraft] = useState<LabDipDraft>(stored);
  // Re-sync after a save's refetch, unless there are unstaged-but-unsaved edits (mirrors the usages
  // editor) — a refetch must never silently overwrite work the operator has not committed.
  useEffect(() => {
    if (dirty) return;
    setDraft(stored);
  }, [stored, dirty]);

  // Claim any edit this panel had staged when the tab was refreshed (19.6). Declared AFTER the re-sync
  // above on purpose: both run in the same mount flush and the LAST setDraft is the one that sticks, so
  // the restored draft has to be second. Claims exactly once — takeSnapshot removes what it returns.
  useEffect(() => {
    if (!staging || !colorwayId) return;
    const snap = staging.takeSnapshot(stagingKey) as LabDipDraft | undefined;
    if (!snap) return;
    setDraft(snap);
    setDirty(true);
  }, [staging, colorwayId, stagingKey]);

  // Dirty says a control was touched; STAGED says the six values would actually write something else.
  // Poking a status and putting it back must not leave the header counting a change that writes nothing.
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(stored), [draft, stored]);
  const staged = dirty && changed;

  useEffect(() => {
    onStagedChange(staged);
  }, [staged, onStagedChange]);

  const set = (patch: Partial<LabDipDraft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const recorded = useMemo<TimelineRound[]>(
    () => (colorway.labDipRounds ?? []).map(fromRecordedRound),
    [colorway.labDipRounds],
  );
  const round = parseInt(draft.labDipRound, 10) || 0;
  const started = hasLabDipRound(draft) || recorded.length > 0;

  // The panel's mutation, unwrapped: it THROWS instead of toasting, because the header's one save is what
  // reports the outcome now — it needs the rejection to name this panel in the partial-failure banner and
  // to keep everything queued after it staged (19.3).
  async function commitLabDip() {
    if (!colorwayId) return;
    try {
      const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);
      await save.mutateAsync(buildLabDipRequest(colorway, draft, expected));
    } catch (e) {
      // Re-throw carrying this panel's copy: the header prints the message it is handed.
      throw new Error(labDipSaveErrorMessage(e));
    }
  }

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over this
  // render's draft — a stale closure would write the edit before last. One key PER COLOURWAY: several
  // colourways can be edited before a single save and each is its own RPC, so each is its own line in the
  // header's list.
  useEffect(() => {
    if (!staging || !colorwayId || !canEdit) return;
    if (!staged) {
      staging.unstage(stagingKey);
      return;
    }
    staging.stage({
      key: stagingKey,
      label: `колорвей ${colorwayTitle(colorway)} · lab-dip R${round || 1}`,
      order: COMMIT_ORDER.labDip,
      commit: commitLabDip,
      settle: () => setDirty(false),
      snapshot: draft,
    });
    // commitLabDip is redefined every render by design (it reads current state); depending on it here
    // would restage on every keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    stagingKey,
    colorwayId,
    canEdit,
    staged,
    draft,
    round,
    colorway,
    lockVersion,
    techCardId,
  ]);

  // The server's journal, with the STAGED draft laid over the round it edits (or appended when the
  // action buttons have moved a round the server has not seen yet). Only while it is actually staged: an
  // untouched draft is just a mirror of the latest recorded round, and drawing it a second time — or
  // minting a row for a colourway that has no rounds at all — is the fabricated history this panel
  // refuses.
  const rounds = useMemo<TimelineRound[]>(() => {
    if (!staged || !hasLabDipRound(draft)) return recorded;
    const n = round || 1;
    const pending: TimelineRound = {
      key: `staged-${n}`,
      round: n,
      status: draft.labDipStatus,
      submittedAt: draft.labDipSubmittedAt,
      decidedAt: draft.labDipDecidedAt,
      decidedBy: draft.labDipDecidedBy,
      rejectReason: draft.labDipRejectReason,
      comment: '',
      staged: true,
    };
    const at = recorded.findIndex((r) => r.round === n);
    if (at < 0) return [...recorded, pending];
    // The draft carries no comment field, so keep the recorded one rather than blanking it on screen.
    const next = [...recorded];
    next[at] = { ...pending, comment: recorded[at].comment };
    return next;
  }, [recorded, staged, draft, round]);

  const approve = () =>
    set({ labDipStatus: APPROVED, labDipDecidedAt: todayInput(), labDipRejectReason: '' });
  const confirmReject = () => {
    set({
      labDipStatus: REJECTED,
      labDipDecidedAt: todayInput(),
      labDipRejectReason: reasonDraft.trim(),
    });
    setRejectOpen(false);
  };
  // Highest round anyone knows about: the journal's last entry, or the draft when it runs ahead of it.
  // A started-but-unnumbered draft (legacy rows carry a submission with round 0) still counts as R1.
  const highestRound = recorded.reduce(
    (m, r) => Math.max(m, r.round),
    Math.max(round, hasLabDipRound(draft) ? 1 : 0),
  );
  // Opens the round after it, with no verdict yet.
  const newRound = () =>
    set({
      labDipRound: String(highestRound + 1),
      labDipStatus: SUBMITTED,
      labDipSubmittedAt: todayInput(),
      labDipDecidedAt: '',
      labDipDecidedBy: '',
      labDipRejectReason: '',
    });

  const smallBtn = buttonVariants({ variant: 'secondary', size: 'sm' });

  return (
    <div className='flex flex-col gap-1.5'>
      {rounds.length === 0 ? (
        <Text size='micro' variant='label'>
          лаб-дип ещё не отправляли
        </Text>
      ) : (
        rounds.map((r, i) => {
          const outcome = roundOutcome(r);
          const latest = i === rounds.length - 1;
          return (
            <Row
              key={r.key}
              label={
                <span className='flex min-w-0 items-center gap-2'>
                  {/* The hex belongs to the COLOURWAY, not to this round, so it marks the live round
                      only — repeated down the timeline it would read as a per-round dye. The empty
                      slot keeps every round's text on one left edge. */}
                  {latest ? (
                    <Swatch hex={swatchHex} />
                  ) : (
                    <span aria-hidden className='inline-block size-3 shrink-0' />
                  )}
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='truncate uppercase'
                  >
                    R{r.round || i + 1}
                    {r.submittedAt ? ` · submitted ${fmtDay(r.submittedAt)}` : ''}
                  </Text>
                </span>
              }
              value={
                <span className='flex items-center gap-1.5'>
                  {outcome && (
                    <Text
                      size='micro'
                      variant='label'
                      component='span'
                      className='max-w-48 truncate'
                      title={outcome}
                    >
                      {outcome}
                    </Text>
                  )}
                  {r.staged && <Pill tone='attention'>staged</Pill>}
                  <LabDipPill status={r.status} />
                </span>
              }
            />
          );
        })
      )}

      {canEdit && (
        <div className='flex flex-wrap items-center gap-1.5 pt-1'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={!started || draft.labDipStatus === APPROVED}
            onClick={approve}
          >
            approve
          </Button>

          <GenericPopover
            open={rejectOpen}
            onOpenChange={(o) => {
              if (o) setReasonDraft(draft.labDipRejectReason);
              setRejectOpen(o);
            }}
            title='reject reason'
            className='w-64'
            triggerProps={{ className: smallBtn, disabled: !started }}
            openElement='reject…'
          >
            <div className='flex flex-col gap-1.5'>
              <textarea
                autoFocus
                className={cell}
                rows={3}
                maxLength={1000}
                placeholder='too warm, pull toward green'
                aria-label='reject reason'
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
              />
              <div className='flex justify-end gap-1.5'>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => setRejectOpen(false)}
                >
                  cancel
                </Button>
                <Button type='button' variant='main' size='sm' onClick={confirmReject}>
                  reject
                </Button>
              </div>
            </div>
          </GenericPopover>

          {/* The scalars the timeline derives but cannot express — a corrected date, who decided, or
              a status the three actions don't produce. Kept reachable so nothing the old form could
              set became unreachable. */}
          <GenericPopover
            title='round details'
            className='w-64'
            triggerProps={{ className: smallBtn, 'aria-label': 'round details' }}
            openElement='⋯'
          >
            <div className='flex flex-col gap-1.5'>
              <label className='flex flex-col gap-1'>
                <FieldLabel>status</FieldLabel>
                <select
                  className={cell}
                  value={draft.labDipStatus}
                  onChange={(e) => set({ labDipStatus: e.target.value })}
                >
                  {techCardLabDipStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <FieldLabel>round</FieldLabel>
                <input
                  className={cell}
                  type='number'
                  min='0'
                  value={draft.labDipRound}
                  onChange={(e) => set({ labDipRound: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <FieldLabel>submitted</FieldLabel>
                <input
                  className={cell}
                  type='date'
                  value={draft.labDipSubmittedAt}
                  onChange={(e) => set({ labDipSubmittedAt: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <FieldLabel>decided</FieldLabel>
                <input
                  className={cell}
                  type='date'
                  value={draft.labDipDecidedAt}
                  onChange={(e) => set({ labDipDecidedAt: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <FieldLabel>decided by</FieldLabel>
                <input
                  className={cell}
                  value={draft.labDipDecidedBy}
                  onChange={(e) => set({ labDipDecidedBy: e.target.value })}
                />
              </label>
            </div>
          </GenericPopover>

          <div className='ml-auto flex items-center gap-1.5'>
            {/* Only when the timeline is not already carrying the marker on the round being edited —
                two `staged` pills side by side say nothing the first one did not. */}
            {staged && !rounds.some((r) => r.staged) && (
              <Pill tone='attention'>{save.isPending ? 'saving…' : 'staged'}</Pill>
            )}
            <Button type='button' variant='secondary' size='sm' onClick={newRound}>
              + new round
            </Button>
          </div>
        </div>
      )}

      {/* No save button of its own any more: the lab-dip write is queued behind the card's one Save,
          which is what reports whether it landed. */}
      {canEdit && staged && (
        <Text size='micro' variant='label'>
          included in the card’s Save
        </Text>
      )}
    </div>
  );
}

// #29 derived composition — approximate, parsed from BOM free-text, weighted by consumption.
function CompositionBar({ fibers, skipped }: ReturnType<typeof deriveComposition>) {
  if (fibers.length === 0) return null;
  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel>derived composition (approx · from BOM)</GroupLabel>
      <div className='flex h-4 w-full overflow-hidden border border-borderColor'>
        {fibers.map((f, i) => (
          <div
            key={`${f.name}-${i}`}
            className='flex items-center justify-center overflow-hidden px-1 text-nano whitespace-nowrap'
            style={{
              width: `${f.percent}%`,
              backgroundColor: COMP_SHADES[i % COMP_SHADES.length],
              color: i < 2 ? '#fff' : '#000',
            }}
            title={`${f.name} ${f.percent}%`}
          >
            {f.percent >= 12 ? `${f.name} ${f.percent}%` : ''}
          </div>
        ))}
      </div>
      <Text size='micro' variant='label'>
        {fibers.map((f) => `${f.percent}% ${f.name}`).join(' · ')} · weighted by consumption
        {skipped > 0
          ? ` · ${skipped} article${skipped > 1 ? 's' : ''} excluded (no readable composition)`
          : ''}
      </Text>
    </div>
  );
}

// One colourway's recipe, rendered BELOW the swatch grid rather than inside an accordion, so the
// grid stays on screen while you edit and you can hop between colourways. Every editor stays mounted
// (the caller only hides the inactive ones) — an unsaved draft must survive that hop.
//
// Phase 19: the recipe RPC (UpdateColorwayRecipe, full-replace) is still this panel's, but the button
// is not — the panel STAGES into the card's one save under `recipe:<colorwayId>`, one key per
// colourway, so three colourways edited before a single Save are three lines in the header's list and
// three separate writes.
function ColorwayRecipeEditor({
  colorway,
  bomItems,
  pieces,
  sizeIds,
  sizeQuantities,
  sizeNameById,
  swatchHex,
  lockVersion,
  techCardId,
  canEdit,
  onStatus,
}: {
  colorway: common_AdminColorwayRef;
  bomItems: BomLine[];
  pieces: PieceRef[];
  sizeIds: number[];
  sizeQuantities: { sizeId?: number; orderQty?: number }[];
  sizeNameById: Map<number, string>;
  swatchHex?: string;
  lockVersion: number;
  techCardId: number;
  canEdit: boolean;
  onStatus: (colorwayId: number, status: RecipeStatus) => void;
}) {
  const save = useUpdateColorwayRecipe(techCardId);
  const staging = useTechCardStaging();
  // A colourway the card has not created yet has no id to write against — it must not stage.
  const colorwayId = colorway.colorwayId ?? 0;
  const stagingKey = `recipe:${colorwayId}`;
  const title = colorwayTitle(colorway);
  const [dirty, setDirty] = useState(false);
  const [labDipStaged, setLabDipStaged] = useState(false);
  // CRITICAL (full-replace): the draft starts from the LIVE read (colorway.usages), never from empty.
  // This is also the baseline the header's line count is measured against.
  const baseline = useMemo(
    () => (colorway.usages ?? []).map((u) => fromRead(u, bomItems)),
    [colorway.usages, bomItems],
  );
  const [usages, setUsages] = useState<UsageDraft[]>(baseline);
  // Re-sync when the read changes (after a save's refetch) unless the user has uncommitted edits.
  useEffect(() => {
    if (dirty) return;
    setUsages(baseline);
  }, [baseline, dirty]);

  // Claim any edits this panel had staged when the tab was refreshed (19.6). Declared AFTER the re-sync
  // above on purpose: both run in the same mount flush and the LAST setUsages is the one that sticks, so
  // the restored rows have to be second. Claims exactly once — takeSnapshot removes what it returns.
  useEffect(() => {
    if (!staging || !colorwayId) return;
    const snap = staging.takeSnapshot(stagingKey) as RecipeSnapshot | undefined;
    if (!snap) return;
    setUsages(snap.usages);
    setDirty(true);
  }, [staging, colorwayId, stagingKey]);

  // The recipe is now PIECE-DRIVEN: one card per declared cut piece, its usage matched by
  // pieceLineKey. pieceKeySet is the membership test that classifies every draft as piece-bound or
  // orphaned.
  const pieceKeySet = useMemo(() => new Set(pieces.map((p) => p.lineKey)), [pieces]);
  // The FIRST usage that names each declared piece owns that piece's card. A second usage naming the
  // same piece (legacy dup) falls through to the orphan group rather than being silently re-saved
  // behind a card that never shows it.
  const usageIndexByPiece = useMemo(() => {
    const m = new Map<string, number>();
    usages.forEach((u, i) => {
      if (u.pieceLineKey && pieceKeySet.has(u.pieceLineKey) && !m.has(u.pieceLineKey))
        m.set(u.pieceLineKey, i);
    });
    return m;
  }, [usages, pieceKeySet]);
  const boundIndices = useMemo(() => new Set(usageIndexByPiece.values()), [usageIndexByPiece]);
  // Usages no declared piece claims: a piece removed on the PIECES tab, a legacy/empty pieceLineKey,
  // or a duplicate. Surfaced, never dropped.
  const orphans = useMemo(
    () => usages.map((u, i) => ({ u, i })).filter(({ i }) => !boundIndices.has(i)),
    [usages, boundIndices],
  );

  // What a save actually sends: every usage that names a fabric. A piece with no fabric emits
  // nothing — the full-replace simply omits it.
  const saveUsages = useMemo(() => usages.filter((u) => u.bomLineKey), [usages]);

  // Dirty says a control was touched; STAGED says the recipe would actually write something else, and
  // `lines` is what the header's label counts — re-derived over the piece model. Typing a value and
  // typing it back must not leave the header claiming work that is not there.
  const lines = useMemo(
    () => changedLines(baseline, usages, pieceKeySet),
    [baseline, usages, pieceKeySet],
  );
  const staged = dirty && lines > 0;
  // Memoised so re-staging for an unrelated reason (a lock version, a title) hands the store the SAME
  // snapshot object and it can skip the re-render — the whole draft list travels, so blank piece
  // cards and kept orphans both survive a tab refresh.
  const snapshot = useMemo<RecipeSnapshot>(() => ({ usages }), [usages]);

  // Feed the grid tile: how many pieces have a fabric, and whether anything here is waiting on the Save.
  useEffect(() => {
    onStatus(colorwayId, { count: saveUsages.length, staged: staged || labDipStaged });
  }, [colorwayId, saveUsages.length, staged, labDipStaged, onStatus]);

  // Orphans the operator has explicitly chosen to KEEP (session-only, by fabric key). They stay in
  // the save either way — this only dismisses the keep/unlink prompt.
  const [keptKeys, setKeptKeys] = useState<Set<string>>(() => new Set());

  // Write a piece's card back into the flat draft list, CREATING the usage on first touch so a piece
  // that had no usage becomes one the moment a fabric (or a consumption) is set.
  const patchPiece = (piece: PieceRef, patch: Partial<UsageDraft>) => {
    setDirty(true);
    setUsages((prev) => {
      const i = prev.findIndex((u) => u.pieceLineKey === piece.lineKey);
      if (i >= 0) return prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u));
      return [...prev, { ...blankDraft(piece.lineKey, piece.name?.trim() || ''), ...patch }];
    });
  };
  const removeUsage = (i: number) => {
    setDirty(true);
    setUsages((prev) => prev.filter((_, idx) => idx !== i));
  };
  const keepOrphan = (u: UsageDraft) => setKeptKeys((prev) => new Set(prev).add(orphanKey(u)));

  // The panel's mutation, unwrapped: it THROWS instead of toasting, because the header's one save is
  // what reports the outcome now — it needs the rejection to name this panel in the partial-failure
  // banner and to keep everything queued after it staged (19.3). A blank piece card carries no fabric
  // and is simply not part of `saveUsages`, so there is no half-filled row to refuse — a piece with
  // no fabric is a valid state, not an error.
  async function commitRecipe() {
    if (!colorwayId) return;
    try {
      const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);
      await save.mutateAsync({
        colorwayId,
        expectedColorwayVersion: expected,
        usages: saveUsages.map(toWire),
      });
    } catch (e) {
      // Re-throw carrying this panel's copy: the header prints the message it is handed.
      throw new Error(recipeSaveErrorMessage(e));
    }
  }

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over this
  // render's rows — a stale closure would write the edit before last. Unstaged the moment the recipe
  // matches the server again, so the header count never claims work that is not there.
  useEffect(() => {
    if (!staging || !colorwayId || !canEdit) return;
    if (!staged) {
      staging.unstage(stagingKey);
      return;
    }
    staging.stage({
      key: stagingKey,
      label: `колорвей ${title} · recipe — ${lines} ${lines === 1 ? 'line' : 'lines'}`,
      order: COMMIT_ORDER.recipe,
      commit: commitRecipe,
      settle: () => setDirty(false),
      snapshot,
    });
    // commitRecipe is redefined every render by design (it reads current state); depending on it here
    // would restage on every keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    stagingKey,
    colorwayId,
    canEdit,
    staged,
    lines,
    usages,
    snapshot,
    title,
    lockVersion,
    techCardId,
  ]);

  const derived = useMemo(() => deriveComposition(usages, bomItems), [usages, bomItems]);

  return (
    <div className='flex flex-col gap-2 border border-borderColor bg-bgColor p-4'>
      <SectionHeader
        title={`${title} · рецепт`}
        question={[
          colorway.baseSku,
          `${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'}`,
          `${saveUsages.length} with fabric`,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={staged ? <Pill tone='attention'>staged</Pill> : undefined}
      />

      {bomItems.length === 0 && (
        <Text size='micro' variant='label'>
          add BOM articles on the BOM tab first — then assign one to each piece here
        </Text>
      )}

      {pieces.length === 0 ? (
        <CalloutBox tone='note'>
          <Text size='micro' component='span'>
            Declare cut pieces on the PIECES tab — the recipe assigns a fabric to each piece.
          </Text>
        </CalloutBox>
      ) : (
        <div className='flex flex-col gap-1.5'>
          {pieces.map((piece) => {
            const idx = usageIndexByPiece.get(piece.lineKey);
            const draft =
              idx != null ? usages[idx] : blankDraft(piece.lineKey, piece.name?.trim() || '');
            return (
              <PieceRecipeCard
                key={piece.lineKey}
                piece={piece}
                draft={draft}
                bomItems={bomItems}
                sizeIds={sizeIds}
                sizeQuantities={sizeQuantities}
                sizeNameById={sizeNameById}
                canEdit={canEdit}
                onChange={(patch) => patchPiece(piece, patch)}
              />
            );
          })}
        </div>
      )}

      {orphans.length > 0 && (
        <div className='flex flex-col gap-1.5'>
          <GroupLabel>unassigned · piece removed</GroupLabel>
          <Text size='micro' variant='label'>
            These fabrics point at a cut piece that is no longer declared — keep them in the recipe or
            unlink them.
          </Text>
          {orphans.map(({ u, i }) => (
            <OrphanRecipeCard
              key={`orphan-${i}`}
              draft={u}
              bomItems={bomItems}
              canEdit={canEdit}
              kept={keptKeys.has(orphanKey(u))}
              onKeep={() => keepOrphan(u)}
              onUnlink={() => removeUsage(i)}
            />
          ))}
        </div>
      )}

      <CompositionBar {...derived} />

      {/* No save button of its own any more: the recipe write is queued behind the card's one Save,
          which is what reports whether it landed. */}
      {canEdit && staged && (
        <Text size='micro' variant='label'>
          {save.isPending ? 'saving…' : 'staged'} · included in the card’s Save
        </Text>
      )}

      {/* Dye approval is a SEPARATE concern from the material recipe — its own group and its own RPC,
          staged separately so a lab-dip verdict and a recipe edit are two lines in the header. */}
      <GroupLabel>dye · lab-dip</GroupLabel>
      <LabDipTimeline
        colorway={colorway}
        techCardId={techCardId}
        lockVersion={lockVersion}
        canEdit={canEdit}
        swatchHex={swatchHex}
        onStagedChange={setLabDipStaged}
      />
    </div>
  );
}

// One colourway in the swatch grid. The swatch IS the content: full-bleed colour, no outline — an
// outline around a colour reads as a box rather than as the colour itself.
function ColorwayTile({
  colorway,
  hex,
  bomCount,
  status,
  selected,
  onSelect,
}: {
  colorway: common_AdminColorwayRef;
  hex?: string;
  bomCount: number;
  status?: RecipeStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const code = colorwayTitle(colorway);
  const count = status?.count ?? colorway.usages?.length ?? 0;
  const completeness = bomCount > 0 ? `${count}/${bomCount}` : String(count);

  return (
    <Tile
      selected={selected}
      onClick={onSelect}
      name={code}
      media={
        hex ? (
          <div className='aspect-square w-full' style={{ backgroundColor: hex }} aria-hidden />
        ) : (
          <Placeholder aspect='square' label='no hex' />
        )
      }
    >
      <div className='mt-1 flex flex-wrap items-center gap-1'>
        <LabDipPill status={colorway.labDipStatus} />
        {/* A colourway with no recipe is red right here in the grid — you should never have to open
            one to find out it is empty. */}
        {count === 0 ? (
          <Pill tone='warn'>{completeness}</Pill>
        ) : (
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {completeness}
          </Text>
        )}
        {status?.staged && <Pill tone='attention'>staged</Pill>}
      </div>
    </Tile>
  );
}

// #35 — inline "create colourway": until this existed the recipe editor could only edit EXISTING
// colourways (techCard.colorways), so making a new one meant leaving for the product manager and
// coming back (ping-pong). This spins up a minimal DRAFT (colour only, via CreateColorway) without
// leaving the tech card. It occupies the SAME slot below the grid as a recipe, opened from the
// dashed `+ colourway` tile.
//
// KEEPS ITS OWN BUTTON, deliberately — like roles-field (19.5). Creating a colourway is not a draft
// edit of this card: it mints the row every other panel here then refers to, so it has to exist
// before the card's Save runs, not with it.
function CreateColorwayForm({
  techCardId,
  usedCodes,
  onCancel,
  onCreated,
}: {
  techCardId: number;
  usedCodes: Set<string>;
  onCancel: () => void;
  onCreated: (colorwayId?: number) => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const create = useCreateColorway(techCardId);
  const [colorCode, setColorCode] = useState('');

  const availableColors = (dictionary?.colors ?? []).filter((c) => !c.archived && c.code);
  const picked = availableColors.find((c) => c.code === colorCode);

  const submit = () => {
    if (!colorCode) {
      showMessage('Pick a colour', 'error');
      return;
    }
    create.mutate(colorCode, {
      onSuccess: (res) => {
        showMessage('Draft colourway created', 'success');
        setColorCode('');
        onCreated(res?.colorwayId);
      },
      onError: (e) => showMessage(createColorwayErrorMessage(e), 'error'),
    });
  };

  return (
    <div className='flex flex-col gap-2 border border-borderColor bg-bgColor p-4'>
      <SectionHeader
        title='новый колорвей'
        question='a DRAFT colourway — colour only, so its recipe can be edited here; media, price and the rest come from the product manager afterwards'
      />
      {availableColors.length === 0 ? (
        <CalloutBox tone='note'>
          <Text size='micro' component='span'>
            no colours in the dictionary yet — add them under <b>settings › colors</b>
          </Text>
        </CalloutBox>
      ) : (
        <Toolbar>
          <label className='flex flex-col gap-1'>
            <FieldLabel>colour</FieldLabel>
            <span className='flex items-center gap-2'>
              <Swatch hex={picked?.hex} title={picked?.name ?? undefined} />
              <select
                className={cn(cell, 'w-56')}
                value={colorCode}
                onChange={(e) => setColorCode(e.target.value)}
              >
                <option value=''>— select colour —</option>
                {availableColors.map((c) => (
                  <option key={c.code} value={c.code} disabled={usedCodes.has(c.code ?? '')}>
                    {c.code} · {c.name}
                    {usedCodes.has(c.code ?? '') ? ' (already on this style)' : ''}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <ToolbarSpacer />
          <Button type='button' variant='secondary' size='sm' onClick={onCancel}>
            cancel
          </Button>
          <Button
            type='button'
            variant='main'
            size='sm'
            disabled={create.isPending || !colorCode}
            loading={create.isPending}
            onClick={submit}
          >
            create
          </Button>
        </Toolbar>
      )}
    </div>
  );
}

// Colourway recipes (H1/§2.3): the constructor view of each colourway's material recipe, now that the
// read-path surfaces usages. Edited per colourway and written by UpdateColorwayRecipe (full-replace),
// staged into the card's one save rather than fired from here (19).
//
// Colour is the subject here, so the roster leads with the swatch: a grid of tiles that STAYS ON
// SCREEN while a recipe is edited underneath it — the accordion this replaced hid every sibling the
// moment you opened one, which is exactly wrong for a job that is comparing colourways.
export function ColorwayRecipes({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  const { dictionary } = useDictionary();
  const colorways = techCard?.colorways ?? [];
  // The card's cut pieces, for the placement picker. Only pieces that already carry a stable
  // line_key are offered: a piece minted in this session but not yet saved has none, and pointing a
  // norm at it would resolve to nothing server-side.
  const pieces = useMemo<PieceRef[]>(
    () =>
      (techCard?.techCard?.pieces ?? [])
        .filter((p) => !!p.lineKey?.trim())
        .map((p) => ({ lineKey: p.lineKey as string, name: p.name ?? '' })),
    [techCard?.techCard?.pieces],
  );
  // The catalog materials the BOM lines link to (materialId) — loaded once for the whole tab so each
  // recipe usage can render the SAME square article card the BOM tab shows (photo · code · spec).
  // section '' = all sections; includeArchived so a line linked to an archived material still resolves.
  const { data: materialsData } = useMaterials('', true);
  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materialsData?.materials ?? []) if (mat.id != null) m.set(Number(mat.id), mat);
    return m;
  }, [materialsData?.materials]);
  // Enrich BOM lines with the fields the recipe editor now needs: price/wastage/unit for the run-cost
  // preview (per-size grading), the legacy composition string for the derived-composition summary,
  // and the linked catalog material so each usage renders as the square article card.
  const bomItems = useMemo<BomLine[]>(
    () =>
      (techCard?.techCard?.bomItems ?? [])
        .filter((b) => !!b.lineKey)
        .map((b) => {
          const materialId = Number(b.materialId) || 0;
          return {
            id: b.id,
            lineKey: b.lineKey,
            name: b.name,
            section: b.section,
            unit: b.unit,
            unitPrice: decimalToInput(b.unitPrice),
            currency: b.currency,
            wastagePercent: decimalToInput(b.wastagePercent),
            composition: b.composition,
            materialId,
            material: materialId > 0 ? materialById.get(materialId) : undefined,
          };
        }),
    [techCard?.techCard?.bomItems, materialById],
  );
  const sizeIds = (techCard?.techCard?.sizeIds ?? []) as number[];
  const sizeQuantities = (techCard?.techCard?.sizeQuantities ?? []) as {
    sizeId?: number;
    orderQty?: number;
  }[];
  const sizeNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);
  // Each colourway's dictionary colour, for the tile swatch and the lab-dip round marker.
  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);
  const lockVersion = techCard?.lockVersion ?? 0;
  const usedCodes = useMemo(
    () => new Set(colorways.map((c) => c.colorCode ?? '').filter(Boolean)),
    [colorways],
  );

  // Which tile owns the slot below the grid: a colourway id, the create form, or nothing (which
  // falls back to the first colourway so the tab is never a grid over dead space).
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const activeId = selected === 'new' ? null : selected ?? colorways[0]?.colorwayId ?? null;

  // Live per-colourway recipe state, reported up by each editor so the grid can badge it — including
  // the colourways whose editor is currently hidden, which is the point: a staged edit two swatches
  // away must be visible without opening it.
  const [statuses, setStatuses] = useState<Record<number, RecipeStatus>>({});
  const reportStatus = useCallback((colorwayId: number, next: RecipeStatus) => {
    setStatuses((prev) => {
      const cur = prev[colorwayId];
      if (cur && cur.count === next.count && cur.staged === next.staged) return prev;
      return { ...prev, [colorwayId]: next };
    });
  }, []);

  return (
    <div className='flex flex-col gap-2.5'>
      <Text size='micro' variant='label'>
        Which catalog article goes on each part, and how much. Each colourway is its own write, and
        every one you edit goes out with the card’s Save.
      </Text>

      <Tiles min={120}>
        {colorways.map((cw) => (
          <ColorwayTile
            key={cw.colorwayId}
            colorway={cw}
            hex={hexByCode.get(cw.colorCode ?? '')}
            bomCount={bomItems.length}
            status={statuses[cw.colorwayId ?? 0]}
            selected={activeId === cw.colorwayId}
            onSelect={() => setSelected(cw.colorwayId ?? null)}
          />
        ))}
        {canEdit && (
          <Tile
            dashed
            selected={selected === 'new'}
            name='colourway'
            onClick={() => setSelected('new')}
            media={
              <div className='flex aspect-square w-full items-center justify-center border border-dashed border-borderColor'>
                <Text size='stat' variant='label' component='span'>
                  +
                </Text>
              </div>
            }
          />
        )}
      </Tiles>

      {colorways.length === 0 && (
        <Text size='micro' variant='label'>
          no colourways yet — a colourway is a product. Create a draft from the tile above, or from
          the product manager, then its material recipe is edited here.
        </Text>
      )}

      {/* The slot. Every editor stays MOUNTED and merely hidden, so an unsaved recipe survives a hop
          to another colourway and back — losing a draft to a tile click would be worse than the
          accordion this replaced. */}
      {colorways.map((cw) => (
        <div key={cw.colorwayId} hidden={activeId !== cw.colorwayId}>
          <ColorwayRecipeEditor
            colorway={cw}
            bomItems={bomItems}
            pieces={pieces}
            sizeIds={sizeIds}
            sizeQuantities={sizeQuantities}
            sizeNameById={sizeNameById}
            swatchHex={hexByCode.get(cw.colorCode ?? '')}
            lockVersion={lockVersion}
            techCardId={techCardId}
            canEdit={canEdit}
            onStatus={reportStatus}
          />
        </div>
      ))}

      {canEdit && selected === 'new' && (
        <CreateColorwayForm
          techCardId={techCardId}
          usedCodes={usedCodes}
          onCancel={() => setSelected(null)}
          // Land on the colourway that was just created — its recipe is why you made it.
          onCreated={(id) => setSelected(id ?? null)}
        />
      )}
    </div>
  );
}
