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
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import {
  composeArticleFromMaterial,
  materialCompositionCode,
  materialSpec,
  parseCompositionCode,
} from 'components/managers/materials/components/material-code';
import {
  MaterialThumb,
  materialImageUrl,
} from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardLabDipStatusOptions } from 'constants/filter';
import { composition as compositionDict } from 'constants/garment-composition';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button, buttonVariants } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import GenericPopover from 'ui/components/popover';
import { Row, RowTotal } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { MarkerApplyHint } from './marker-apply';
import { markersOfColorway } from './nesting/marker-io';
import { sectionShort } from './bom-line-picker';
import { PieceRef, useFormPieces } from './piece-picker';
import { TechCardFormData, wireInt } from './schema';
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
  'TECH_CARD_BOM_SECTION_TRIM',
]);

const PIECE_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

const GARMENT_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_INTERLINING',
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
  fabricWidth?: string; // decimal string, cm — this LINE's own cloth ROLL width, if it sets one
  // Read-only enrichment off the card read (0259): effectiveFabricWidthCm is
  // COALESCE(this line's width, the linked article's) — the roll the раскладка prefills from —
  // and selvedgeCm is that article's кромка per edge. Cutting width = roll − 2×selvedge, and
  // that is what a marker is laid on: comparing a marker against the ROLL width flags every
  // fabric with a кромка as a mismatch.
  effectiveFabricWidthCm?: string;
  selvedgeCm?: string;
  // structured { part: [{ code, percent }] } JSON on catalog-linked / picker-authored lines, free
  // text only on legacy rows — read it through parseCompositionCode, never with a bare regex.
  composition?: string;
  materialId?: number;
  // the linked catalog material (resolved from ListMaterials by materialId) — carries the photo,
  // article code, class and spec the recipe card renders. undefined for a legacy/unlinked line.
  material?: common_Material;
};

type RecipePiece = PieceRef & { id: number };

type UsageDraft = {
  bomLineKey: string;
  materialId: number;
  // placement/color/pantone predate article pinning and are round-tripped for legacy rows only —
  // no input renders them: the colour/pantone live on the effective article, the "where" on the
  // piece link. placement is still primed to the piece name on add for the PDF and legacy readers.
  placement: string;
  color: string;
  pantone: string;
  consumption: string;
  quantity: string;
  // preserved verbatim across the full-replace so a save never drops per-size grading / piece links.
  sizeConsumptions: { sizeId?: number; consumption?: string }[];
  pieceLineKey: string;
  // display-only (server-computed, stripped without costing:read). Per GARMENT only: the
  // whole-batch figure (size_run_total) is not carried any more — it was Σ(норма × типовой тираж)
  // over a made-up size run that no longer exists, i.e. a cost for a batch nobody ordered. The
  // real batch spend belongs to the production run, which knows its own colourway × size lines.
  lineTotal: string;
  // Wastage provenance (0261). 'marker' = the norm came from a saved раскладка and its measured
  // length ALREADY contains the cutting waste, so costing must not gross it up again; '' =
  // typed by hand and the article's wastage_percent applies as before. The two pcts are the
  // display decomposition of a marker norm's waste (кромка / межлекальные выпады) and are NEVER
  // multiplied into a cost — they only explain where the length went.
  //
  // `undefined` is a THIRD state and not the same as '': it means this draft does not know the
  // provenance, and the field must then be OMITTED on the wire so the store carries the stored
  // triple forward. It arises only from a staged draft persisted by a build that predates these
  // fields — asserting '' there would silently downgrade every marker row to manual on restore.
  consumptionSource: string | undefined;
  wasteSelvedgePct: string;
  wasteCutPct: string;
};

// The provenance triple travels together: a norm is either marker-measured (with its
// decomposition) or hand-typed (with none). Retyping a number by hand makes it manual — leaving
// it marked «marker» would keep costing from applying the article's wastage to a figure that no
// longer contains any.
const MANUAL_PROVENANCE = {
  consumptionSource: '',
  wasteSelvedgePct: '',
  wasteCutPct: '',
} as const;

// Lab-dip editing state (M8). Initialised from the colourway ref's labDip* fields; only the three
// WRITABLE leaves below travel back through UpdateColorway under LAB_DIP_UPDATE_MASK — see LabDipTimeline.
// submittedAt / decidedAt / decidedBy are READ-ONLY MIRRORS of the server's own audit stamps: they are
// carried here so the panel can show and reason about them, never mutated and never sent.
type LabDipDraft = {
  labDipStatus: string;
  labDipRound: string;
  labDipSubmittedAt: string;
  labDipDecidedAt: string;
  labDipDecidedBy: string;
  labDipRejectReason: string;
};

// The subset this client may actually change. `set` takes only these, so the read-only mirrors above
// cannot be written back into the draft by accident — the compiler is the guard, not a comment.
type LabDipWritable = Pick<LabDipDraft, 'labDipStatus' | 'labDipRound' | 'labDipRejectReason'>;

// What the grid tile needs to know about a recipe that is only fully known inside its editor: the
// LIVE usage-row count (including rows added but not yet saved) and whether anything here is waiting
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

// How many recipe rows this draft actually changes against what the server returned. The write is a
// FULL REPLACE, but identity is the durable pair (piece_line_key || '', bom_line_key): the same slot
// may be used on several pieces, and per-garment rows deliberately carry an empty piece key.
function usageKey(u: Pick<UsageDraft, 'pieceLineKey' | 'bomLineKey'>): string {
  return `${u.pieceLineKey || ''}\u0000${u.bomLineKey}`;
}

function changedLines(base: UsageDraft[], next: UsageDraft[]): number {
  const sig = (u: UsageDraft) => JSON.stringify(toWire(u));
  const before = new Map(base.map((u) => [usageKey(u), sig(u)]));
  const after = new Map(next.map((u) => [usageKey(u), sig(u)]));
  let n = 0;
  // added (no such key before) or edited (same key, different payload)
  for (const [k, s] of after) if (before.get(k) !== s) n += 1;
  for (const k of before.keys()) if (!after.has(k)) n += 1; // removed
  return n;
}

// UpdateColorway is a field-masked write. This mask lists ONLY the three WRITABLE lab-dip leaves INSIDE
// `development`, so a save touches exactly those columns and nothing else on the colourway. Everything else
// in the development submessage (devCode / name / pantone / pantoneSystem / devHex / swatchMediaId / usages /
// displayOrder) is left intact by the backend even though it is sent undefined here — that subpath mask is
// precisely what prevents clobbering. It also means no read-merge is needed (and none is possible: no read
// path returns those dev identity fields). `usages` stays owned by UpdateColorwayRecipe — never sent here.
// The paths are camelCase on purpose: that is the form the server matches, so do not "correct" them to the
// proto's snake_case — a mask it cannot match silently degrades into writing nothing.
//
// labDipSubmittedAt / labDipDecidedAt / labDipDecidedBy are DELIBERATELY ABSENT: the backend stamps those
// itself and discards whatever the client sends, so naming them here only promised the operator an edit that
// the very next refetch rubbed out. This list is a CONSTANT of three, never a diff of what changed — so the
// mask a save carries is always non-empty and always valid. The complementary half of that guarantee lives
// in LabDipTimeline: a draft whose only difference is in the read-only mirrors never stages a write at all.
const LAB_DIP_UPDATE_MASK = [
  'development.labDipStatus',
  'development.labDipRound',
  'development.labDipRejectReason',
].join(',');

// protobuf Timestamp (RFC 3339) -> YYYY-MM-DD, for display only. The 0001-01-01 zero value is "unset".
// There is no inverse any more: the lab-dip dates are read from the server and never written back to it.
function tsToDateInput(ts?: string): string {
  if (!ts || ts.startsWith('0001-01-01')) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? m[1] : '';
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
    // The audit trail is the SERVER's: it stamps submitted_at / decided_at / decided_by from the write
    // itself and ignores anything sent for them. Left undefined and out of the mask, same as every other
    // field this call does not own — sending them would be a lie the operator can see revert.
    labDipSubmittedAt: undefined,
    labDipDecidedAt: undefined,
    labDipDecidedBy: undefined,
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

// EXACTLY what buildLabDipRequest would put on the wire, as one comparable string — the three writable
// leaves in the normalised form the request sends them in. Two drafts with the same signature produce a
// byte-identical write, so comparing signatures instead of the whole draft answers the only question the
// header cares about: would saving this change anything? It ignores the read-only audit mirrors (the
// server owns those), collapses '' against '0' rounds and untrimmed reject reasons, and drops a reason
// that a non-rejected status would blank out anyway.
function labDipWire(d: LabDipDraft): string {
  return JSON.stringify([
    d.labDipStatus,
    String(parseInt(d.labDipRound, 10) || 0),
    d.labDipStatus === REJECTED ? d.labDipRejectReason.trim() : '',
  ]);
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

// One server-owned fact, stated rather than offered for editing: label left, value right, the same
// label/value row the auto-journal uses for the rest of the card's audit trail.
function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <Row
      className='py-0.5'
      label={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {label}
        </Text>
      }
      value={
        <Text size='micro' variant={value ? 'default' : 'label'} component='span'>
          {value || '—'}
        </Text>
      }
    />
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

// The width a раскладка for this usage would actually be laid on: the effective article's roll
// width minus its кромка on both edges (0259). The pinned material wins over the slot — a
// colourway pin can be a different cloth — and the flat legacy width stands in when the typed
// fabric attributes are absent. '' when no width is known at all; a кромка wider than the roll
// is operator error the read must not turn into a negative width.
function cuttingWidthOf(material?: common_Material, slot?: BomLine, pinned = false): string {
  // Precedence must match what the раскладка itself laid on (nesting-modal), or the two sides
  // of the width comparison disagree and warn about a marker that fits:
  //   pinned  — the colourway named a DIFFERENT cloth, so BOTH numbers come from it (taking the
  //             pin's width with the slot's кромка would describe a roll that does not exist);
  //   else    — effective width, i.e. this line's own override before the article's own figure,
  //             paired with the linked article's кромка, which is what selvedgeCm already is.
  const [rollRaw, selvedgeRaw] = pinned
    ? [
        material?.fabricAttrs?.widthCm?.value || material?.fabricWidth?.value || '',
        material?.fabricAttrs?.selvedgeCm?.value || '',
      ]
    : [
        slot?.effectiveFabricWidthCm || slot?.fabricWidth || '',
        slot?.selvedgeCm || '',
      ];
  const roll = parseDecimalNumber(rollRaw);
  if (!Number.isFinite(roll) || roll <= 0) return '';
  const sv = parseDecimalNumber(selvedgeRaw);
  const cut = roll - 2 * (Number.isFinite(sv) && sv > 0 ? sv : 0);
  return cut > 0 ? String(Math.round(cut * 100) / 100) : '';
}

// Resolve a stored usage into a draft. bom_line_key is the durable ref; fall back to resolving the
// server bom_item_id against the saved BOM lines so a legacy usage still points at the right line.
function fromRead(
  u: common_TechCardColorwayUsage,
  bomItems: BomLine[],
  pieces: RecipePiece[],
): UsageDraft {
  const bomItemId = wireInt(u.bomItemId);
  const byId = bomItemId ? bomItems.find((b) => b.id === bomItemId)?.lineKey : undefined;
  const piecesById = new Map(pieces.filter((piece) => piece.id).map((piece) => [piece.id, piece]));
  return {
    bomLineKey: u.bomLineKey || byId || '',
    materialId: wireInt(u.materialId),
    placement: u.placement || '',
    color: u.color || '',
    pantone: u.pantone || '',
    consumption: decimalToInput(u.consumption),
    quantity: decimalToInput(u.quantity),
    sizeConsumptions: (u.sizeConsumptions ?? []).map((s) => ({
      sizeId: s.sizeId,
      consumption: decimalToInput(s.consumption),
    })),
    pieceLineKey: u.pieceLineKey || piecesById.get(wireInt(u.pieceId))?.lineKey || '',
    lineTotal: decimalToInput(u.lineTotal),
    // The server normalises '' to 'manual', so a row this client has saved once reads back as
    // 'manual' while a hand edit writes ''. Both mean the same thing, and leaving them distinct
    // made a no-op edit (type 1.5 over 1.5) differ from its baseline signature and claim a
    // staged change that does not exist. Normalise on the way IN, one spelling from here on.
    consumptionSource: u.consumptionSource === 'manual' ? '' : u.consumptionSource || '',
    wasteSelvedgePct: decimalToInput(u.wasteSelvedgePct),
    wasteCutPct: decimalToInput(u.wasteCutPct),
  };
}

function toWire(d: UsageDraft): common_TechCardColorwayUsage {
  return {
    // durable ref (§2.3); the server resolves it to the real FK — positional index/id not sent.
    bomLineKey: d.bomLineKey || '',
    bomItemIndex: undefined,
    bomItemId: undefined,
    // Presence is intentional: 0 clears a pin and means “inherit the slot default”. Omitting this
    // on a full-replace write would preserve an old pin server-side instead of round-tripping the
    // editor's current state.
    materialId: d.materialId || 0,
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
    // Wastage provenance (0261). Sent VERBATIM, including undefined: presence is what tells the
    // store «write what I say» instead of «preserve what you stored», so '' is a deliberate
    // reset to manual and undefined is «I don't know, keep yours». JSON.stringify drops the key
    // for undefined, which is exactly the carry-forward the store expects from a stale client —
    // and a draft restored from a pre-0261 snapshot IS one.
    consumptionSource: d.consumptionSource,
    wasteSelvedgePct: inputToDecimal(d.wasteSelvedgePct),
    wasteCutPct: inputToDecimal(d.wasteCutPct),
    // output-only — never sent. size_run_total stays in the wire shape (the proto field still
    // exists) but the editor neither reads nor shows it: see the note on UsageDraft.
    lineTotal: undefined,
    sizeRunTotal: undefined,
  };
}

// There used to be a runTotalPreview() here — a client-side «расход на партию» estimate,
// Σ(норма_размера × типовой тираж_размера) × цена × (1 + wastage%). It is gone with the typical
// size run it multiplied: without an order quantity per size there is no batch to price on this
// screen. The per-garment norm is what the recipe owns; the batch spend is the production run's,
// computed from its own plan lines. Do not reintroduce a local batch estimate here.

// A composition code as the operator reads it. The code slot holds different things depending on who
// wrote the line: the CompositionPicker stores garment-composition CODES ('COT'), a catalog-linked
// material stores its resolved fibre NAME ('хлопок органический'). Resolve what the table knows,
// print the rest as-is — the same `codeToName ?? code` rule the care-label generator uses.
const FIBRE_NAME_BY_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const cat of Object.values(compositionDict.garment_composition)) {
    for (const [name, code] of Object.entries(cat as Record<string, string>)) m[code] = name;
  }
  return m;
})();

// #29 — best-effort DERIVED fibre composition for a colourway, computed from its recipe's BOM lines.
// A line's `composition` is the structured { part: [{ code, percent }] } JSON on every catalog-linked
// or picker-authored line, and free text only on genuinely legacy rows — parseCompositionCode reads
// both (a regex hunting for an 'NN%' token finds NOTHING in the JSON, which is what used to leave this
// bar blank, or claiming "no readable composition", on cards whose blends were fully entered).
// Each line's fibres are weighted by that usage's per-garment consumption (fallback: equal weight),
// then normalised to 100%. Approximate by construction — flagged in the UI.
function deriveComposition(
  usages: UsageDraft[],
  bomItems: BomLine[],
  materials: common_Material[],
): { fibers: { name: string; percent: number }[]; skipped: number } {
  const totals = new Map<string, number>();
  let skipped = 0;
  for (const u of usages) {
    if (!u.bomLineKey) continue;
    const slot = bomItems.find((b) => b.lineKey === u.bomLineKey);
    const line = articleForUsage(
      slot,
      effectiveMaterial(u, slot, materials),
      effectiveMaterialId(u, slot),
    );
    const weight = Number(u.consumption) > 0 ? Number(u.consumption) : 1;
    const shares = parseCompositionCode(line?.composition);
    if (shares.length === 0) {
      skipped += 1;
      continue;
    }
    for (const s of shares) {
      const name = (FIBRE_NAME_BY_CODE[s.code] ?? s.code).trim().toLowerCase();
      if (!name || !Number.isFinite(s.percent) || s.percent <= 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + (s.percent / 100) * weight);
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
// consumption) ↔ «по размерам» (a grid of one input per declared card size). NO batch preview:
// this grid states the NORM per size, and the money a batch of it costs is the production run's
// question, not the recipe's.
function UsagePerSizeLocal({
  draft,
  sizeIds,
  article,
  canEdit,
  sizeNameById,
  onChange,
}: {
  draft: UsageDraft;
  sizeIds: number[];
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

  // Every hand edit of the NUMBER drops the marker provenance (see MANUAL_PROVENANCE): the
  // decomposition described a length this figure no longer is, and costing must go back to
  // grossing the article's wastage on top. Switching the grading MODE counts too — «по
  // размерам» seeds cells from a scalar the marker measured for one size only.
  const manual = <T extends Partial<UsageDraft>>(patch: T) => ({ ...patch, ...MANUAL_PROVENANCE });

  const enablePerSize = () => {
    if (perSize) return;
    const prior = new Map(lastPerSize.current.map((e) => [e.sizeId, e.consumption]));
    onChange(
      manual({
        sizeConsumptions: sizeIds.map((id) => ({
          sizeId: id,
          consumption: prior.get(id) ?? draft.consumption ?? '',
        })),
      }),
    );
  };
  const disablePerSize = () => {
    if (!perSize) return;
    lastPerSize.current = draft.sizeConsumptions.map((e) => ({
      sizeId: e.sizeId ?? 0,
      consumption: e.consumption ?? '',
    }));
    onChange(manual({ sizeConsumptions: [] }));
  };
  const setSizeCell = (sizeId: number, value: string) => {
    const clean = sanitizeDecimal(value);
    const next = [...draft.sizeConsumptions];
    const i = next.findIndex((x) => x.sizeId === sizeId);
    if (i >= 0) next[i] = { sizeId, consumption: clean };
    else next.push({ sizeId, consumption: clean });
    onChange(manual({ sizeConsumptions: next }));
  };

  const unit = article?.unit?.trim() || '';

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
          onChange={(e) => onChange(manual({ consumption: sanitizeDecimal(e.target.value) }))}
        />
      ) : (
        <div className='flex flex-col gap-1.5'>
          <DataTable variant='grid' className='[&_td]:text-micro'>
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
                      className={cn(gridInput, 'text-micro')}
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
            </tbody>
          </DataTable>
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
// same order (photo · section+тип pills · name · code · spec+colour) so a usage reads as the concrete
// effective article, never as the slot's role name. An unresolved id stays visible as `артикул #ID`.
function RecipeMaterialCard({
  slot,
  material,
  materialId,
}: {
  slot?: BomLine;
  material?: common_Material;
  materialId?: number;
}) {
  const url = materialImageUrl(material);
  const section = sectionShort(slot?.section);
  // A fabric-class article in a fabric slot would badge "fabric fabric" — the class earns a pill
  // only when it says something the section doesn't (e.g. a thread-class article on a trim slot).
  const rawKlass = materialClassLabel(material?.materialClass);
  const klass = rawKlass === section ? '' : rawKlass;
  const name = material?.name?.trim() || (materialId ? `артикул #${materialId}` : 'нет артикула');
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

function materialLabel(material: common_Material): string {
  const code = material.code?.trim() || composeArticleFromMaterial(material, true);
  return [material.name?.trim() || `#${wireInt(material.id)}`, code].filter(Boolean).join(' · ');
}

function effectiveMaterialId(draft: UsageDraft, slot?: BomLine): number {
  return draft.materialId || slot?.materialId || 0;
}

function effectiveMaterial(
  draft: UsageDraft,
  slot: BomLine | undefined,
  materials: common_Material[],
): common_Material | undefined {
  const id = effectiveMaterialId(draft, slot);
  return id ? materials.find((m) => wireInt(m.id) === id) : undefined;
}

// Cost/composition previews must follow the effective concrete article, not the slot's default
// snapshot. Costing-gated price data can be absent; in that case the server remains authoritative.
function articleForUsage(
  slot: BomLine | undefined,
  material: common_Material | undefined,
  materialId: number,
): BomLine | undefined {
  if (!slot) return undefined;
  if (!material) {
    const pinnedOutsideCatalog = materialId > 0 && materialId !== slot.materialId;
    return {
      ...slot,
      material: undefined,
      unitPrice: pinnedOutsideCatalog ? '' : slot.unitPrice,
      currency: pinnedOutsideCatalog ? '' : slot.currency,
      composition: pinnedOutsideCatalog ? '' : slot.composition,
    };
  }
  const isDefault = wireInt(material.id) === slot.materialId;
  return {
    ...slot,
    material,
    materialId: wireInt(material.id),
    unit: material.unit?.trim() || slot.unit,
    unitPrice: decimalToInput(material.latestPrice?.price) || (isDefault ? slot.unitPrice : ''),
    currency: material.latestPrice?.currency || (isDefault ? slot.currency : ''),
    composition: materialCompositionCode(material) || (isDefault ? slot.composition : ''),
  };
}

// The slot's identifying CODE for the picker: the default article's code (or its name), so a slot
// reads by what it IS, not by a row number. Falls back to the slot's own role for an article-less
// line — same rule the master fabric picker used.
function slotCode(b: BomLine): string {
  const m = b.material;
  if (m)
    return composeArticleFromMaterial(m, true) || m.name?.trim() || b.name?.trim() || 'material';
  return b.name?.trim() || 'без названия';
}

// The meta line under the code: the ROLE first (it is what tells two slots with the same default
// article apart), then the material's own spec + colour.
function slotSpecLine(b: BomLine): string {
  const m = b.material;
  const role = b.name?.trim();
  return [role, m ? materialSpec(m) : '', m?.color?.trim()].filter(Boolean).join(' · ');
}

// The slot chooser — the master fabric picker, carried over to slots. Replaces the native <select>:
// a select can render only text, and a slot is picked by its article's photo + spec + role, not by
// a row label. A field-box trigger (the shared `cell` box) shows the current pick as thumbnail +
// code + meta; the menu is the app's one popover shell (portalled, focus-trapped, Esc to close).
// Options already used in this recipe group are disabled with «уже в рецепте»; the current pick
// stays visible even when the section filter (or its removal from the BOM) would hide it, so a
// save never silently drops a stored reference.
function SlotPicker({
  value,
  slots,
  allowedSections,
  usedKeys,
  canEdit,
  onChange,
}: {
  value: string;
  slots: BomLine[];
  allowedSections: Set<string>;
  usedKeys: Set<string>;
  canEdit: boolean;
  onChange: (bomLineKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? slots.find((slot) => slot.lineKey === value) : undefined;
  const unknown = !!value && !selected;
  const eligible = slots.filter(
    (slot) => allowedSections.has(slot.section ?? '') || slot.lineKey === value,
  );

  const pick = (bomLineKey: string) => {
    onChange(bomLineKey);
    setOpen(false);
  };

  return (
    <GenericPopover
      open={open && canEdit}
      onOpenChange={setOpen}
      noTail
      title='слот'
      className='w-[280px]'
      triggerProps={{
        disabled: !canEdit,
        'aria-label': 'слот',
        className: cn(cell, 'flex items-center gap-2 text-left'),
      }}
      openElement={(isOpen) => (
        <>
          {selected ? (
            <MaterialThumb material={selected.material} size='sm' className='h-5 w-5' />
          ) : null}
          <span className='min-w-0 flex-1'>
            {selected ? (
              <>
                <Text
                  component='span'
                  size='control'
                  className='block truncate font-mono tabular-nums'
                >
                  {slotCode(selected)}
                </Text>
                {slotSpecLine(selected) && (
                  <Text component='span' size='micro' variant='label' className='block truncate'>
                    {slotSpecLine(selected)}
                  </Text>
                )}
              </>
            ) : (
              <Text component='span' variant='label' className='block truncate'>
                {unknown ? '(unknown / removed slot)' : '— выбрать слот —'}
              </Text>
            )}
          </span>
          <Text component='span' variant='inactive' className='shrink-0'>
            {isOpen ? '▴' : '▾'}
          </Text>
        </>
      )}
    >
      {/* full-bleed list inside the popover body's px-2 py-1.5 padding */}
      <div role='listbox' aria-label='слот' className='-mx-2 -my-1.5'>
        {/* the stored-but-removed slot, surfaced as the current selection so it is never dropped */}
        {unknown && (
          <div
            role='option'
            aria-selected
            className='flex w-full items-center gap-2 border-b border-hairline bg-bgZebra px-2 py-1 text-left'
          >
            <MaterialThumb size='sm' className='h-8 w-8' />
            <Text component='span' variant='label' size='micro' className='min-w-0 flex-1 truncate'>
              (unknown / removed slot)
            </Text>
            <Text component='span' variant='inactive' className='shrink-0'>
              ✓
            </Text>
          </div>
        )}

        {eligible.length === 0 && !unknown ? (
          <div className='px-2 py-2.5'>
            <Text variant='label' size='micro'>
              нет подходящих слотов в BOM
            </Text>
          </div>
        ) : (
          eligible.map((b) => {
            const current = value === b.lineKey;
            const used = !current && usedKeys.has(b.lineKey ?? '');
            const offGroup = !allowedSections.has(b.section ?? '');
            const spec = slotSpecLine(b);
            return (
              <button
                key={b.lineKey}
                type='button'
                role='option'
                aria-selected={current}
                disabled={used}
                onClick={() => pick(b.lineKey ?? '')}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-hairline px-2 py-1 text-left',
                  current && 'bg-bgZebra',
                  used && 'cursor-not-allowed text-labelColor',
                )}
              >
                <MaterialThumb material={b.material} size='sm' className='h-8 w-8' />
                <span className='min-w-0 flex-1'>
                  <Text
                    component='span'
                    size='control'
                    className='block truncate font-mono tabular-nums'
                  >
                    {slotCode(b)}
                  </Text>
                  {(spec || used || offGroup) && (
                    <Text component='span' size='micro' variant='label' className='block truncate'>
                      {[spec, used ? 'уже в рецепте' : '', offGroup ? 'не для этой группы' : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}
                </span>
                {current && (
                  <Text component='span' variant='inactive' className='shrink-0'>
                    ✓
                  </Text>
                )}
              </button>
            );
          })
        )}
      </div>
    </GenericPopover>
  );
}

function ArticlePinSelect({
  draft,
  slot,
  materials,
  canEdit,
  onChange,
}: {
  draft: UsageDraft;
  slot?: BomLine;
  materials: common_Material[];
  canEdit: boolean;
  onChange: (materialId: number) => void;
}) {
  const sameSection = materials.filter(
    (material) =>
      material.section === slot?.section &&
      (!material.archived || wireInt(material.id) === draft.materialId),
  );
  const otherSections = materials.filter(
    (material) => material.section !== slot?.section && !material.archived,
  );
  const pinned = draft.materialId
    ? materials.find((material) => wireInt(material.id) === draft.materialId)
    : undefined;
  const missingPin = draft.materialId > 0 && !pinned;
  const archivedPinOutsideSection =
    !!pinned && !!pinned.archived && pinned.section !== slot?.section;
  return (
    <select
      className={cell}
      value={draft.materialId}
      disabled={!canEdit || !slot}
      aria-label='артикул колорвея'
      onChange={(e) => onChange(wireInt(e.target.value))}
    >
      <option value={0}>default — {slot?.material?.name?.trim() || 'нет'}</option>
      {missingPin && <option value={draft.materialId}>(unknown / removed article)</option>}
      {pinned && archivedPinOutsideSection && (
        <option value={draft.materialId}>{materialLabel(pinned)} (не для секции)</option>
      )}
      {sameSection.map((material) => (
        <option key={wireInt(material.id)} value={wireInt(material.id)}>
          {materialLabel(material)}
        </option>
      ))}
      {otherSections.length > 0 && (
        <optgroup label='другие секции'>
          {otherSections.map((material) => (
            <option key={wireInt(material.id)} value={wireInt(material.id)}>
              {materialLabel(material)} · {sectionShort(material.section) || 'unknown'}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// A fresh usage for a piece that has none yet: no fabric, its placement primed to the piece name so
// the PDF and legacy readers still get a human label the moment a fabric is picked.
function blankDraft(pieceLineKey: string, placement: string): UsageDraft {
  return {
    bomLineKey: '',
    materialId: 0,
    placement,
    color: '',
    pantone: '',
    consumption: '',
    quantity: '',
    sizeConsumptions: [],
    pieceLineKey,
    lineTotal: '',
    ...MANUAL_PROVENANCE,
  };
}

// Orphan triage follows the same durable row identity as dirty tracking. A removed piece can still
// carry several slots, so neither the piece key nor the BOM key is unique by itself.
const orphanKey = (u: UsageDraft) => usageKey(u);

type IndexedUsage = { draft: UsageDraft; index: number };

function SlotUsageRow({
  draft,
  bomItems,
  allowedSections,
  usedKeys,
  materials,
  sizeIds,
  sizeNameById,
  canEdit,
  markers,
  colorwayId,
  onChange,
  onRemove,
}: {
  draft: UsageDraft;
  bomItems: BomLine[];
  allowedSections: Set<string>;
  usedKeys: Set<string>;
  materials: common_Material[];
  markers?: common_TechCardMarkerSummary[];
  // Чей рецепт редактируется — для ранжирования маркеров (свой важнее свежего общего).
  colorwayId?: number;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onChange: (patch: Partial<UsageDraft>) => void;
  onRemove: () => void;
}) {
  const slot = draft.bomLineKey
    ? bomItems.find((item) => item.lineKey === draft.bomLineKey)
    : undefined;
  const material = effectiveMaterial(draft, slot, materials);
  const materialId = effectiveMaterialId(draft, slot);
  const article = articleForUsage(slot, material, materialId);
  const isMeasured = measured(slot?.section);
  const legacyCountedMeasured =
    isMeasured &&
    !!draft.quantity.trim() &&
    !draft.consumption.trim() &&
    draft.sizeConsumptions.length === 0;
  const unit = article?.unit?.trim() || slot?.unit?.trim() || '';
  const missingArticle = !!slot && materialId === 0;

  // The colourway PIN — «этот колорвей берёт ДРУГОЙ артикул в этом слоте» — demoted from a second
  // always-on select to a small popover on the article card: one visible picker per row (the slot),
  // exactly like the master fabric picker; pinning is the exception, not a parallel question.
  const pinned = draft.materialId > 0;
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <div className='flex flex-col gap-3 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start'>
      <div className='w-full sm:w-28 sm:shrink-0'>
        <RecipeMaterialCard slot={slot} material={material} materialId={materialId} />
        {canEdit && slot && (
          <div className='mt-1'>
            <GenericPopover
              open={pinOpen}
              onOpenChange={setPinOpen}
              noTail
              title='артикул колорвея'
              className='w-[280px]'
              triggerProps={{
                'aria-label': 'артикул колорвея',
                className: cn(
                  buttonVariants({ variant: 'secondary', size: 'xs' }),
                  'w-full justify-center',
                ),
              }}
              openElement={pinned ? 'пин ✎' : 'другой артикул…'}
            >
              <div className='flex flex-col gap-1.5'>
                <ArticlePinSelect
                  draft={draft}
                  slot={slot}
                  materials={materials}
                  canEdit={canEdit}
                  onChange={(materialId) => {
                    onChange({ materialId });
                    setPinOpen(false);
                  }}
                />
                <Text size='micro' variant='label'>
                  Переопределяет артикул слота только в этом колорвее. «default» возвращает артикул
                  из BOM.
                </Text>
              </div>
            </GenericPopover>
          </div>
        )}
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-2.5'>
        {/* The section already badges the article card to the left — repeating it here made every
            fabric row open with three FABRIC chips. This row is just the action now. */}
        {canEdit && (
          <div className='flex items-center justify-end'>
            <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
              unlink
            </Button>
          </div>
        )}

        <label className='flex min-w-0 flex-col gap-1 lg:max-w-sm'>
          <FieldLabel>слот</FieldLabel>
          <SlotPicker
            value={draft.bomLineKey}
            slots={bomItems}
            allowedSections={allowedSections}
            usedKeys={usedKeys}
            canEdit={canEdit}
            // Moving the row to another slot drops the marker provenance too. A раскладка is
            // measured on ONE cloth: carried across, its «marker» flag would keep costing from
            // grossing the new slot's wastage onto a length that never contained the new
            // cloth's cutting waste — understating the line, with no marker on the new slot for
            // the operator to notice it by. Same class of desync as retyping the number.
            onChange={(bomLineKey) => onChange({ bomLineKey, materialId: 0, ...MANUAL_PROVENANCE })}
          />
        </label>

        {pinned && (
          <Pill tone='mut'>пин: {material?.name?.trim() || `артикул #${draft.materialId}`}</Pill>
        )}
        {missingArticle && <Pill tone='warn'>нет артикула — блокер производства</Pill>}
        {/* The slot list is live form state now, so a slot can be deleted on the BOM tab while a
            recipe row still points at it — the BOM tab's delete guard only sees recipes the SERVER
            has, and this row may never have been saved. Say so here rather than let the save fail
            on a line_key the server cannot resolve. */}
        {!!draft.bomLineKey && !slot && (
          <Pill tone='warn'>слот удалён на вкладке BOM — выберите другой</Pill>
        )}

        {isMeasured && !legacyCountedMeasured ? (
          <div className='flex flex-col gap-1.5'>
            <UsagePerSizeLocal
              draft={draft}
              sizeIds={sizeIds}
              article={article}
              canEdit={canEdit}
              sizeNameById={sizeNameById}
              onChange={onChange}
            />
            {/* Ф4: измеренный маркером расход этого слота, применяемый в ЭТОТ драфт — через
                тот же onChange, которым staged-рецепт и живёт. */}
            <MarkerApplyHint
              markers={markers}
              colorwayId={colorwayId}
              lineKey={draft.bomLineKey}
              unit={unit}
              wastagePercent={slot?.wastagePercent ?? ''}
              // The article's CUTTING width — roll minus the кромка on both edges — because
              // that is the width a marker is laid on and records. The pinned/linked material's
              // catalog figures come first (a colourway pin can be a different cloth), the
              // slot's own otherwise.
              // "Pinned" here means pinned to a DIFFERENT article than the slot's default: a pin
              // back to the slot's own article is the same cloth, and the line's own width
              // override still describes it.
              articleWidth={cuttingWidthOf(
                material,
                slot,
                draft.materialId > 0 && draft.materialId !== slot?.materialId,
              )}
              sizeIds={sizeIds}
              sizeNameById={sizeNameById}
              canEdit={canEdit}
              onApply={(patch) => onChange(patch)}
            />
          </div>
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

        {/* Provenance of the norm (0261): a marker-measured figure is priced WITHOUT the
            article's wastage gross-up, and that is a costing-visible difference the operator
            must be able to see on the row that causes it. */}
        {draft.consumptionSource === 'marker' && (
          <div className='flex flex-wrap items-center gap-1.5'>
            <Pill tone='mut'>из раскладки</Pill>
            <Text size='nano' variant='label' component='span'>
              {draft.wasteSelvedgePct || draft.wasteCutPct
                ? `отходы уже внутри: кромка ${draft.wasteSelvedgePct || '0'}% + выпады ${draft.wasteCutPct || '0'}%`
                : 'отходы уже внутри нормы; разложение не записано'}
              {slot?.wastagePercent?.trim() ? ` · ${slot.wastagePercent}% слота не начисляются` : ''}
            </Text>
          </div>
        )}

        {/* Ф6.6: РУЧНАЯ НОРМА — тот же вопрос с другой стороны, и он обязан быть подписан ТАМ, ГДЕ
            ЧИСЛО ВВОДЯТ. Ручной ввод — аварийный выход, и он нужен: без него первый же странный DXF
            останавливает производство. Поэтому гейт готовности прогона такую норму ПРОПУСКАЕТ
            (norm_provenance = предупреждение, не блокер) — но помечает, и здесь стоит тот же знак,
            чтобы «почему у меня жёлтая строка на прогоне» имело ответ на этой же странице.
            Только для рулонных слотов: у счётного трима ручной ввод — единственный способ, и метка
            на каждой пуговице была бы шумом, а не сигналом. */}
        {isMeasured && !legacyCountedMeasured && draft.consumptionSource !== 'marker' && (
          <div className='flex flex-wrap items-center gap-1.5'>
            <Pill tone='attention'>расход введён руками</Pill>
            <Text size='nano' variant='label' component='span'>
              норма не снята с раскладки
              {slot?.wastagePercent?.trim()
                ? ` · костинг начисляет сверху ${slot.wastagePercent}% раскроя слота`
                : ''}
            </Text>
          </div>
        )}

        {/* Per-garment only. The `run …` half of this line printed the server's size_run_total —
            the cost of the card's made-up typical batch — and went with it. */}
        {draft.lineTotal && (
          <Text size='micro' variant='label'>
            per garment {draft.lineTotal}
          </Text>
        )}
      </div>
    </div>
  );
}

// One ruled group per declared cut piece. The group owns any number of distinct slot usages; rows
// are separated by #e6e6e6 hairlines, while the piece label uses the heavier subgroup rule.
function PieceRecipeCard({
  piece,
  rows,
  bomItems,
  materials,
  markers,
  colorwayId,
  sizeIds,
  sizeNameById,
  canEdit,
  canAdd,
  onAdd,
  onChange,
  onRemove,
}: {
  piece: PieceRef;
  rows: IndexedUsage[];
  bomItems: BomLine[];
  materials: common_Material[];
  markers?: common_TechCardMarkerSummary[];
  // Чей рецепт редактируется — для ранжирования маркеров (свой важнее свежего общего).
  colorwayId?: number;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onChange: (index: number, patch: Partial<UsageDraft>) => void;
  onRemove: (index: number) => void;
}) {
  const usedKeys = new Set(rows.map(({ draft }) => draft.bomLineKey).filter(Boolean));

  return (
    <div>
      <GroupLabel
        action={
          canEdit ? (
            <Button type='button' variant='secondary' size='xs' disabled={!canAdd} onClick={onAdd}>
              + добавить материал к детали
            </Button>
          ) : undefined
        }
      >
        {piece.name?.trim() || 'без названия'}
      </GroupLabel>
      {rows.length === 0 ? (
        <Row
          tone='label'
          label={
            <Text size='micro' variant='label' component='span'>
              материалы не назначены
            </Text>
          }
        />
      ) : (
        <div className='divide-y divide-hairline'>
          {rows.map(({ draft, index }) => (
            <SlotUsageRow
              key={`${usageKey(draft)}:${index}`}
              draft={draft}
              bomItems={bomItems}
              allowedSections={PIECE_SECTIONS}
              usedKeys={usedKeys}
              materials={materials}
              markers={markers}
              colorwayId={colorwayId}
              sizeIds={sizeIds}
              sizeNameById={sizeNameById}
              canEdit={canEdit}
              onChange={(patch) => onChange(index, patch)}
              onRemove={() => onRemove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A usage whose non-empty piece key no longer resolves on the PIECES tab. Empty piece keys belong in
// «на изделие», and additional slots on a live piece belong in that piece's list. KEEP retains the
// orphan in the full-replace save exactly as-is; UNLINK removes it.
function OrphanRecipeCard({
  draft,
  bomItems,
  materials,
  canEdit,
  kept,
  onKeep,
  onUnlink,
}: {
  draft: UsageDraft;
  bomItems: BomLine[];
  materials: common_Material[];
  canEdit: boolean;
  kept: boolean;
  onKeep: () => void;
  onUnlink: () => void;
}) {
  const slot = draft.bomLineKey ? bomItems.find((b) => b.lineKey === draft.bomLineKey) : undefined;
  const material = effectiveMaterial(draft, slot, materials);
  const materialId = effectiveMaterialId(draft, slot);
  const consumption =
    draft.sizeConsumptions.length > 0
      ? 'per-size consumption'
      : draft.consumption
        ? `consumption ${draft.consumption}`
        : draft.quantity
          ? `quantity ${draft.quantity}`
          : '';

  return (
    <div className='flex flex-col gap-2 border-b border-hairline py-2 last:border-b-0'>
      <div className='flex items-center justify-between gap-2'>
        <Text size='micro' variant='label' component='span' className='min-w-0 truncate uppercase'>
          {draft.placement?.trim() || 'unassigned'}
        </Text>
        <Pill tone='warn'>piece removed</Pill>
      </div>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start'>
        <div className='w-full sm:w-40 sm:shrink-0'>
          <RecipeMaterialCard slot={slot} material={material} materialId={materialId} />
        </div>
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          <Text size='micro' variant='label'>
            This slot points at a cut piece that is no longer on the PIECES tab.
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
// ONLY the three writable lab-dip leaves. That subpath mask keeps the rest of `development` (devCode / name
// / pantone / devHex / swatch / usages) intact, so no read-merge is needed (and none is possible — no read
// path returns those dev identity fields). That write now REACHES THE DATABASE: the server used to ignore
// UpdateColorway's `development` entirely, so every save this panel made was a no-op that still reported
// success. If you are wondering why the panel suddenly works, that is why — nothing changed on this side.
// The server keys each write by round_number, so saving round 3 leaves rounds 1-2 standing and the journal
// grows one entry per round.
//
// WHO OWNS WHAT: this panel writes status, round and reject reason. submitted_at / decided_at / decided_by
// are stamped BY THE SERVER off the write itself and it discards anything the client sends for them, so
// they are shown here as facts (AuditRow) and never as fields. They used to be date inputs — the operator
// typed one, got a success toast, and watched the refetch put the old value back. For the same reason the
// three verdict buttons move only the writable leaves: a locally invented date would draw a round the save
// does not actually send.
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
    // Only the three writable leaves come back. The audit mirrors stay whatever the server says NOW —
    // they were never the operator's to restore, and a snapshot taken before a colleague's save would
    // otherwise resurrect a superseded stamp on screen.
    setDraft((d) => ({
      ...d,
      labDipStatus: snap.labDipStatus,
      labDipRound: snap.labDipRound,
      labDipRejectReason: snap.labDipRejectReason,
    }));
    setDirty(true);
  }, [staging, colorwayId, stagingKey]);

  // Dirty says a control was touched; STAGED says the write would actually change something. Compared on
  // the WIRE form, so it counts only what the request carries: poking a status and putting it back writes
  // nothing, and neither does a draft that differs solely in the server-owned audit mirrors — that one
  // would otherwise queue an RPC the backend discards, report success, and revert on the refetch, which is
  // exactly the round trip this panel is meant to stop promising.
  const changed = useMemo(() => labDipWire(draft) !== labDipWire(stored), [draft, stored]);
  const staged = dirty && changed;

  useEffect(() => {
    onStagedChange(staged);
  }, [staged, onStagedChange]);

  // Narrowed to the writable leaves on purpose: the audit mirrors are the server's copy, and making them
  // unsettable here is what keeps that true no matter what a later edit to this component tries.
  const set = (patch: Partial<LabDipWritable>) => {
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
    const at = recorded.findIndex((r) => r.round === n);
    const base = at < 0 ? undefined : recorded[at];
    const pending: TimelineRound = {
      key: `staged-${n}`,
      round: n,
      status: draft.labDipStatus,
      // Dates and decider come off the journal entry this draft is editing, never off the draft: the
      // server stamps them and the staged write does not carry them, so a locally minted date would be a
      // preview of something that is not being saved. A round the journal has not seen yet simply has
      // none until the save lands. The draft has no comment field either, so that stays the recorded one
      // rather than blanking on screen.
      submittedAt: base?.submittedAt ?? '',
      decidedAt: base?.decidedAt ?? '',
      decidedBy: base?.decidedBy ?? '',
      rejectReason: draft.labDipRejectReason,
      comment: base?.comment ?? '',
      staged: true,
    };
    if (at < 0) return [...recorded, pending];
    const next = [...recorded];
    next[at] = pending;
    return next;
  }, [recorded, staged, draft, round]);

  // The three verdict actions move only the writable leaves. `decided at` and `decided by` follow from
  // the save itself, stamped server-side — this panel states the verdict and lets the backend date it.
  const approve = () => set({ labDipStatus: APPROVED, labDipRejectReason: '' });
  const confirmReject = () => {
    set({ labDipStatus: REJECTED, labDipRejectReason: reasonDraft.trim() });
    setRejectOpen(false);
  };
  // Highest round anyone knows about: the journal's last entry, or the draft when it runs ahead of it.
  // A started-but-unnumbered draft (legacy rows carry a submission with round 0) still counts as R1.
  const highestRound = recorded.reduce(
    (m, r) => Math.max(m, r.round),
    Math.max(round, hasLabDipRound(draft) ? 1 : 0),
  );
  // Opens the round after it, with no verdict yet. Its submission date is the server's to stamp when the
  // card's Save actually sends this round, so the staged row carries the number and the status only.
  const newRound = () =>
    set({
      labDipRound: String(highestRound + 1),
      labDipStatus: SUBMITTED,
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

          {/* The scalars the timeline derives but cannot express: the round number and a status the
              three actions don't produce. Underneath them, the server's own audit stamps — stated, not
              offered, because the backend sets those itself and ignores anything sent for them. */}
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
              <div className='flex flex-col gap-0.5 pt-1'>
                <FieldLabel>stamped by the server</FieldLabel>
                {/* Straight off `stored`, i.e. the colourway as the backend last returned it — never off
                    the draft, which cannot change these and must not appear to. */}
                <AuditRow label='submitted' value={stored.labDipSubmittedAt} />
                <AuditRow label='decided' value={stored.labDipDecidedAt} />
                <AuditRow label='decided by' value={stored.labDipDecidedBy} />
              </div>
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

// #29 derived composition — approximate, read off each BOM line's composition, weighted by consumption.
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
  materials,
  markers,
  pieces,
  sizeIds,
  sizeNameById,
  swatchHex,
  lockVersion,
  techCardId,
  canEdit,
  onStatus,
}: {
  colorway: common_AdminColorwayRef;
  bomItems: BomLine[];
  materials: common_Material[];
  markers?: common_TechCardMarkerSummary[];
  pieces: RecipePiece[];
  sizeIds: number[];
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
  // Раскладки ЭТОГО колорвея (плюс общие). Фильтруется один раз на входе, а не в каждом месте
  // ниже: «применить маркер» подставляет измеренную длину прямо в норму расхода, и длина, снятая
  // на артикуле другого колорвея, отличается ровно настолько, насколько отличаются ширины — то
  // есть выглядит совершенно нормально.
  //
  // ЭТОТ ЖЕ ВЫЗОВ ОТСЕИВАЕТ РАСКРОЙНЫЕ МАРКЕРЫ ПРОГОНОВ (Ф4.2, cardMarkers внутри
  // markersOfColorway). Ниже по течению `cwMarkers` — единственный источник раскладок для всего
  // редактора рецепта, включая MarkerApplyHint, так что второго места, где прогонная однодневка
  // могла бы попасть в предложение «применить расход в рецепт», в этом файле нет.
  const cwMarkers = useMemo(() => markersOfColorway(markers, colorwayId), [markers, colorwayId]);
  const stagingKey = `recipe:${colorwayId}`;
  const title = colorwayTitle(colorway);
  const [dirty, setDirty] = useState(false);
  const [labDipStaged, setLabDipStaged] = useState(false);
  // CRITICAL (full-replace): the draft starts from the LIVE read (colorway.usages), never from empty.
  // This is also the baseline the header's line count is measured against.
  const baseline = useMemo(
    () => (colorway.usages ?? []).map((u) => fromRead(u, bomItems, pieces)),
    [colorway.usages, bomItems, pieces],
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

  // A declared piece claims EVERY usage that names it. Empty piece_line_key is a first-class
  // per-garment usage; only a non-empty key that no longer resolves is orphaned.
  const pieceKeySet = useMemo(() => new Set(pieces.map((p) => p.lineKey)), [pieces]);
  const usagesByPiece = useMemo(() => {
    const m = new Map<string, IndexedUsage[]>();
    usages.forEach((u, i) => {
      if (!u.pieceLineKey || !pieceKeySet.has(u.pieceLineKey)) return;
      const rows = m.get(u.pieceLineKey) ?? [];
      rows.push({ draft: u, index: i });
      m.set(u.pieceLineKey, rows);
    });
    return m;
  }, [usages, pieceKeySet]);
  const garmentUsages = useMemo<IndexedUsage[]>(
    () =>
      usages.map((draft, index) => ({ draft, index })).filter(({ draft }) => !draft.pieceLineKey),
    [usages],
  );
  const orphans = useMemo(
    () =>
      usages
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => !!u.pieceLineKey && !pieceKeySet.has(u.pieceLineKey)),
    [usages, pieceKeySet],
  );

  // A usage whose stored BOM reference no longer resolves can read back without bom_line_key. Do not
  // send that as an all-NULL slot: the recipe write validates every submitted row.
  const saveUsages = useMemo(() => usages.filter((usage) => usage.bomLineKey), [usages]);

  // Dirty says a control was touched; STAGED says the recipe would actually write something else, and
  // `lines` is what the header's label counts — re-derived over the piece model. Typing a value and
  // typing it back must not leave the header claiming work that is not there.
  const lines = useMemo(() => changedLines(baseline, usages), [baseline, usages]);
  const staged = dirty && lines > 0;
  // Memoised so re-staging for an unrelated reason (a lock version, a title) hands the store the SAME
  // snapshot object and it can skip the re-render — the whole draft list travels, so blank piece
  // cards and kept orphans both survive a tab refresh.
  const snapshot = useMemo<RecipeSnapshot>(() => ({ usages }), [usages]);

  // Feed the grid tile: total usage rows and whether anything here is waiting on the Save.
  useEffect(() => {
    onStatus(colorwayId, { count: saveUsages.length, staged: staged || labDipStaged });
  }, [colorwayId, saveUsages.length, staged, labDipStaged, onStatus]);

  // Orphans the operator has explicitly chosen to KEEP (session-only, by fabric key). They stay in
  // the save either way — this only dismisses the keep/unlink prompt.
  const [keptKeys, setKeptKeys] = useState<Set<string>>(() => new Set());

  const patchUsage = (index: number, patch: Partial<UsageDraft>) => {
    setDirty(true);
    setUsages((prev) => prev.map((usage, i) => (i === index ? { ...usage, ...patch } : usage)));
  };
  const addUsage = (
    pieceLineKey: string,
    placement: string,
    allowedSections: Set<string>,
    rows: IndexedUsage[],
  ) => {
    const used = new Set(rows.map(({ draft }) => draft.bomLineKey).filter(Boolean));
    const slot = bomItems.find(
      (item) =>
        !!item.lineKey && allowedSections.has(item.section ?? '') && !used.has(item.lineKey),
    );
    if (!slot?.lineKey) return;
    setDirty(true);
    setUsages((prev) => [
      ...prev,
      { ...blankDraft(pieceLineKey, placement), bomLineKey: slot.lineKey ?? '' },
    ]);
  };
  const removeUsage = (i: number) => {
    setDirty(true);
    setUsages((prev) => prev.filter((_, idx) => idx !== i));
  };
  const keepOrphan = (u: UsageDraft) => setKeptKeys((prev) => new Set(prev).add(orphanKey(u)));

  // The panel's mutation, unwrapped: it THROWS instead of toasting, because the header's one save is
  // what reports the outcome now — it needs the rejection to name this panel in the partial-failure
  // banner and to keep everything queued after it staged (19.3). Every read row is round-tripped;
  // add actions create rows on an eligible slot immediately, so the client adds no blank refs.
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

  const derived = useMemo(
    () => deriveComposition(usages, bomItems, materials),
    [usages, bomItems, materials],
  );
  const garmentUsedKeys = new Set(
    garmentUsages.map(({ draft }) => draft.bomLineKey).filter(Boolean),
  );
  const canAddTo = (allowedSections: Set<string>, rows: IndexedUsage[]) => {
    const used = new Set(rows.map(({ draft }) => draft.bomLineKey).filter(Boolean));
    return bomItems.some(
      (item) =>
        !!item.lineKey && allowedSections.has(item.section ?? '') && !used.has(item.lineKey),
    );
  };

  return (
    <SectionStack>
      <Section
        title={`${title} · детали`}
        question={[
          colorway.baseSku,
          `${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'}`,
          `${saveUsages.length} material rows`,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={staged ? <Pill tone='attention'>staged</Pill> : undefined}
      >
        {bomItems.length === 0 && (
          <Text size='micro' variant='label'>
            add BOM slots on the BOM tab first, then assign them to pieces or the whole garment here
          </Text>
        )}

        {pieces.length === 0 ? (
          <CalloutBox tone='note'>
            <Text size='micro' component='span'>
              Declare cut pieces on the PIECES tab to assign piece-level material slots.
            </Text>
          </CalloutBox>
        ) : (
          // Wider than the block's 10px stack on purpose: each card is itself a dense ruled group,
          // so at stack spacing one piece's last row and the next piece's label read as one list.
          <div className='flex flex-col gap-5'>
            {pieces.map((piece) => {
              const rows = usagesByPiece.get(piece.lineKey) ?? [];
              return (
                <PieceRecipeCard
                  key={piece.lineKey}
                  piece={piece}
                  rows={rows}
                  bomItems={bomItems}
                  materials={materials}
                  markers={cwMarkers}
                  colorwayId={colorwayId}
                  sizeIds={sizeIds}
                      sizeNameById={sizeNameById}
                  canEdit={canEdit}
                  canAdd={canAddTo(PIECE_SECTIONS, rows)}
                  onAdd={() =>
                    addUsage(piece.lineKey, piece.name?.trim() || '', PIECE_SECTIONS, rows)
                  }
                  onChange={patchUsage}
                  onRemove={removeUsage}
                />
              );
            })}
          </div>
        )}

        <CompositionBar {...derived} />

        {canEdit && staged && (
          <Text size='micro' variant='label'>
            {save.isPending ? 'saving…' : 'staged'} · included in the card’s Save
          </Text>
        )}
      </Section>

      <Section
        title={`${title} · на изделие`}
        question='thread, hardware, trim, decoration and whole-garment interlining'
        action={
          canEdit ? (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={!canAddTo(GARMENT_SECTIONS, garmentUsages)}
              onClick={() => addUsage('', '', GARMENT_SECTIONS, garmentUsages)}
            >
              + добавить материал на изделие
            </Button>
          ) : undefined
        }
      >
        {garmentUsages.length === 0 ? (
          <Row
            tone='label'
            label={
              <Text size='micro' variant='label' component='span'>
                материалы на изделие не назначены
              </Text>
            }
          />
        ) : (
          <div className='divide-y divide-hairline'>
            {garmentUsages.map(({ draft, index }) => (
              <SlotUsageRow
                key={`${usageKey(draft)}:${index}`}
                draft={draft}
                bomItems={bomItems}
                allowedSections={GARMENT_SECTIONS}
                usedKeys={garmentUsedKeys}
                materials={materials}
                markers={cwMarkers}
                colorwayId={colorwayId}
                sizeIds={sizeIds}
                  sizeNameById={sizeNameById}
                canEdit={canEdit}
                onChange={(patch) => patchUsage(index, patch)}
                onRemove={() => removeUsage(index)}
              />
            ))}
          </div>
        )}
      </Section>

      {orphans.length > 0 && (
        <Section
          title={`${title} · unassigned`}
          question='piece removed, keep the usage as-is or unlink it'
        >
          {orphans.map(({ u, i }) => (
            <OrphanRecipeCard
              key={`${usageKey(u)}:${i}`}
              draft={u}
              bomItems={bomItems}
              materials={materials}
              canEdit={canEdit}
              kept={keptKeys.has(orphanKey(u))}
              onKeep={() => keepOrphan(u)}
              onUnlink={() => removeUsage(i)}
            />
          ))}
        </Section>
      )}

      <Section title={`${title} · dye · lab-dip`} question={colorway.baseSku}>
        <LabDipTimeline
          colorway={colorway}
          techCardId={techCardId}
          lockVersion={lockVersion}
          canEdit={canEdit}
          swatchHex={swatchHex}
          onStagedChange={setLabDipStaged}
        />
      </Section>
    </SectionStack>
  );
}

// One colourway in the swatch grid. The swatch IS the content: full-bleed colour, no outline — an
// outline around a colour reads as a box rather than as the colour itself.
function ColorwayTile({
  colorway,
  hex,
  status,
  selected,
  onSelect,
}: {
  colorway: common_AdminColorwayRef;
  hex?: string;
  status?: RecipeStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const code = colorwayTitle(colorway);
  const count = status?.count ?? colorway.usages?.length ?? 0;

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
          <Pill tone='warn'>0</Pill>
        ) : (
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {count}
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
  // The card's cut pieces, LIVE from form state — the same source every other piece picker reads —
  // so a piece added seconds ago in the table above appears in each recipe immediately, without a
  // save round-trip. addPiece mints the stable lineKey up front, and under the card's one save the
  // body (which creates the piece server-side, keyed by that lineKey) commits before any recipe
  // write (COMMIT_ORDER), so a usage pointed at a fresh piece resolves. The server id — needed only
  // to resolve legacy usages that carry piece_id instead of piece_line_key — still comes off the
  // read, merged by lineKey; a piece not yet saved simply has none.
  const formPieces = useFormPieces();
  const serverPieceIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = p.lineKey?.trim();
      if (key) m.set(key, wireInt((p as unknown as { id?: unknown }).id));
    }
    return m;
  }, [techCard?.techCard?.pieces]);
  const pieces = useMemo<RecipePiece[]>(
    () => formPieces.map((p) => ({ ...p, id: serverPieceIdByKey.get(p.lineKey) ?? 0 })),
    [formPieces, serverPieceIdByKey],
  );
  // The catalog materials the BOM lines link to (materialId) — loaded once for the whole tab so each
  // recipe usage can render the SAME square article card the BOM tab shows (photo · code · spec).
  // section '' = all sections; includeArchived so a line linked to an archived material still resolves.
  const { data: materialsData } = useMaterials('', true);
  const materials = useMemo(() => materialsData?.materials ?? [], [materialsData?.materials]);
  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materials) if (wireInt(mat.id)) m.set(wireInt(mat.id), mat);
    return m;
  }, [materials]);
  // The card's BOM slots, LIVE from form state — for the same reason the pieces above are: a slot
  // added on the BOM tab a moment ago has to be assignable here immediately, instead of only after
  // a save and a refetch. It is safe for a usage to point at a slot the server has never seen,
  // because COMMIT_ORDER puts the card body (which creates the line, keyed by that same lineKey)
  // ahead of every recipe write — that ordering exists for exactly this case.
  //
  // The server `id` still comes off the read, merged by lineKey: it is needed only to resolve a
  // LEGACY usage that carries bom_item_id instead of bom_line_key (see fromRead). A slot not yet
  // saved simply has none, and nothing legacy can point at it.
  //
  // The values here are already input-shaped strings (mapBomItemToForm ran decimalToInput on the
  // way in), so unlike the read path they are used as-is.
  const formBom = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const serverBomIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of techCard?.techCard?.bomItems ?? []) {
      const key = b.lineKey?.trim();
      if (key) m.set(key, wireInt(b.id));
    }
    return m;
  }, [techCard?.techCard?.bomItems]);
  // Enrich BOM lines with the fields the recipe editor now needs: price/wastage/unit for the run-cost
  // preview (per-size grading), the composition cell for the derived-composition summary,
  // and the linked catalog material so each usage renders as the square article card.
  const bomItems = useMemo<BomLine[]>(
    () =>
      (formBom ?? [])
        .filter((b) => !!b.lineKey?.trim())
        .map((b) => {
          const materialId = wireInt(b.materialId);
          const lineKey = b.lineKey as string;
          return {
            id: serverBomIdByKey.get(lineKey) ?? 0,
            lineKey,
            name: b.name,
            section: b.section,
            unit: b.unit,
            unitPrice: b.unitPrice,
            currency: b.currency,
            wastagePercent: b.wastagePercent,
            fabricWidth: b.fabricWidth,
            effectiveFabricWidthCm: b.effectiveFabricWidthCm,
            selvedgeCm: b.selvedgeCm,
            composition: b.composition,
            materialId,
            material: materialId > 0 ? materialById.get(materialId) : undefined,
          };
        }),
    [formBom, serverBomIdByKey, materialById],
  );
  const sizeIds = (techCard?.techCard?.sizeIds ?? []) as number[];
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

  // ?colorway=<id> opens one colourway's recipe directly. Sent by the BOM tab when a delete is
  // blocked by this colourway's recipe, so «which usage do I remove» lands on screen rather than
  // on a grid the operator has to search. The param is consumed, not kept: leaving it set would
  // re-select this colourway every time the tab is reopened.
  const [params, setParams] = useSearchParams();
  const deepLinked = params.get('colorway');
  useEffect(() => {
    if (!deepLinked) return;
    const id = Number(deepLinked);
    if (Number.isFinite(id) && id > 0) setSelected(id);
    const next = new URLSearchParams(params);
    next.delete('colorway');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinked]);

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
      {/* This half shares the tab with the cut-piece table above it, so it has to announce itself —
          an unlabelled swatch grid under «детали кроя» reads as part of that block. */}
      <SectionHeader
        title='колорвеи'
        question='— which catalog article goes on each part, in what colour and at what consumption'
      />
      <Text size='micro' variant='label'>
        Each colourway is its own write, and every one you edit goes out with the card’s Save.
      </Text>

      <Tiles min={120}>
        {colorways.map((cw) => (
          <ColorwayTile
            key={cw.colorwayId}
            colorway={cw}
            hex={hexByCode.get(cw.colorCode ?? '')}
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
            materials={materials}
            markers={techCard?.markers}
            pieces={pieces}
            sizeIds={sizeIds}
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
