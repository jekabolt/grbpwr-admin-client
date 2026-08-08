import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_AdminColorwayRef, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  techCardKeys,
  useCreateTechCard,
  useTechCardReadiness,
  useUpdateTechCard,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  formatTechCardDate,
  techCardErrorMessage,
} from 'components/managers/tech-cards/components/utils';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import {
  techCardApprovalStateOptions,
  techCardAuxSubtypeFormOptions,
  techCardGenderOptions,
  techCardMeasurementUnitOptions,
  techCardPurposeFormOptions,
  techCardStageOptions,
} from 'constants/filter';
import { ROUTES, SECTION } from 'constants/routes';
import {
  applyServerFieldErrors,
  errorRootKey,
  flattenFieldErrors,
  revealField,
} from 'utils/field-errors';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import { Section, SectionStack } from 'ui/components/section';
import { SectionHeader } from 'ui/components/section-header';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import { CalloutBox } from 'ui/components/callout-box';
import { Drawer } from 'ui/components/drawer';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { ReleaseBlocker, ReleaseBlockersModal } from './release-blockers-modal';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { BomField } from './bom-field';
import { ColorwayRecipes } from './colorway-recipe';
import { CollectionField } from './collection-field';
import { CompositionEntries } from './composition-entries';
import { ConstructionTab } from './construction-tab';
import { CostEstimateField } from './cost-estimate-field';
import { CostingField } from './costing-field';
import { CutListField } from './cut-list-field';
import { DetailsEditor } from './details-editor';
import { HeaderMetaFields } from './header-meta-fields';
import { IssuesField } from './issues-field';
import { AssemblyField } from './assembly-field';
import { LabelsField } from './labels-field';
import { PackagingRecipeField } from './packaging-recipe-field';
import { LifecycleStrip } from './lifecycle-strip';
import { TechCardTasksPanel } from './tech-card-tasks-panel';
import {
  activeVariantCount,
  AdoptLegacyOutputButton,
  OutputVariantsPanel,
  seedColourVariants,
} from './output-variants-field';
import { PackagingField } from './packaging-field';
import { PatternsField } from './patterns-field';
import { MarkersSection } from './nesting/markers-section';
import { PiecesTab } from './pieces-tab';
import { ProductIdsField } from './product-ids-field';
import { DevExpensesField } from './dev-expenses-field';
import { ReleasesField } from './releases-field';
import { RevisionsField } from './revisions-field';
import { SignoffsField } from './signoffs-field';
import { SeasonField } from './season-field';
import { StyleNumberField } from './style-number-field';
import { RolesField } from './roles-field';
import { SizeQuantitiesField } from './size-quantities-field';
import { SketchTab } from './sketch-tab';
import {
  TechCardFormData,
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  toPurposeEnum,
  wireInt,
} from './schema';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { ProductionTab } from './production-tab';
import { SamplesTab } from './samples-tab';
import { SizeIdsField } from './size-ids-field';
import { SizeChartField } from './size-chart-field';
import { StyleFactsField } from './style-facts-field';
import { TechCardFittings } from './tech-card-fittings';
import { useTechCardDraft } from './useTechCardDraft';
import { StagedChangesChip } from './staged-changes-chip';
import { useTechCardStagingRequired } from './useTechCardStaging';

const TABS = [
  { id: 'header', label: 'header' },
  { id: 'sketch', label: 'sketch' },
  { id: 'moodboard', label: 'moodboard' },
  { id: 'patterns', label: 'patterns' },
  { id: 'samples', label: 'samples' },
  { id: 'bom', label: 'BOM' },
  { id: 'colorways', label: 'colorways' },
  { id: 'construction', label: 'construction' },
  { id: 'labels', label: 'labels & pkg' },
  { id: 'costing', label: 'costing' },
  { id: 'production', label: 'production' },
  { id: 'issues', label: 'issues' },
  { id: 'signoff', label: 'sign-off' },
  { id: 'history', label: 'history' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Tabs grouped into lifecycle bands so the rail reads at a glance (R-2): DESIGN what it is,
// DEVELOP how it's made, SPEC what ships. History stands alone.
const TAB_GROUPS: { band: string; tabs: TabId[] }[] = [
  // Moodboard before sketch: the reference comes first and the technical drawing is derived from
  // it, so the rail follows the order the work actually happens in.
  { band: 'design', tabs: ['header', 'moodboard', 'sketch'] },
  // Patterns OPENS develop rather than closing design: nothing on it describes what the style is.
  // The size range, the measurement chart, the DXF sheets and the раскладки are the first artefacts
  // MADE from the sketch, and the sheets are filed by BOM material — «how it's made» throughout. It
  // leads the band because everything under it is downstream of a pattern: a sample is cut from
  // these sheets, and the marker on this tab is what the BOM's fabric consumption is measured from.
  //
  // Cut pieces live HERE too, directly under the DXF sheets. A piece is a property of the PATTERN,
  // not of a colour — every colourway cuts the same pieces — and they are literally created from
  // the sheets above them by «↔ детали кроя». They used to sit on colorways, so the dialog that
  // makes them and the list they land in were on different tabs. What stays on colorways is the
  // per-colourway fabric map: which article each piece is cut from IN THAT COLOUR.
  //
  // BOM sits directly under patterns, ahead of samples: the выкройки panel files its DXF sheets BY
  // BOM material line and names every rollgoods line with no sheet as a hole, so the tab that
  // DEFINES those lines belongs next to the tab that reads them — two entries apart it read as an
  // unrelated stop. Samples follow both, which is also the order the work happens in: you cannot
  // cut a sample before there is a pattern and a fabric to cut it from.
  { band: 'develop', tabs: ['patterns', 'bom', 'samples', 'colorways', 'construction'] },
  { band: 'spec', tabs: ['labels', 'costing', 'issues', 'signoff'] },
  // Production is its own band: it is what happens AFTER the spec is settled, and folding it into
  // `spec` would break the rail's lifecycle reading — the bands are the story of the card, in order.
  { band: 'produce', tabs: ['production'] },
  { band: '', tabs: ['history'] },
];

// Tabs that were folded into another one keep their deep links working: ?tab=dev became a costing
// section, ?tab=pieces a section of patterns (it lived on colorways in between). A shared link or a
// bookmark still lands on the right place, and the address bar is rewritten to match what is
// rendered. Both targets exist on every card, auxiliary included — which is why no alias needs
// re-resolving per card any more.
const FOLDED_TABS: Record<string, TabId> = { dev: 'costing', pieces: 'patterns' };

// Maps a form-error root key to the tab that owns it; unmapped keys are header fields.
const ERROR_TAB: Record<string, TabId> = {
  moodboardMedia: 'moodboard',
  technicalMedia: 'sketch',
  callouts: 'sketch',
  patterns: 'patterns',
  sizeIds: 'patterns',
  sizeQuantities: 'patterns',
  bomItems: 'bom',
  // Cut pieces (and their DXF block aliases) render on PATTERNS. A `pieces.N.*` violation routed
  // anywhere else raises a toast naming a field nobody can see.
  pieces: 'patterns',
  pieceDxfAliases: 'patterns',
  details: 'header',
  construction: 'construction',
  // A CARD-level field (it deliberately does not live inside `construction` — see schema.ts), but it
  // RENDERS on the construction tab next to the free-text seam-allowance note it disambiguates.
  // Without this row it would fall through to the header default and the toast would name a field
  // that tab does not contain.
  requiredSeamAllowanceCm: 'construction',
  operations: 'construction',
  labels: 'labels',
  packaging: 'labels',
  costing: 'costing',
  issues: 'issues',
  signoffs: 'signoff',
  revisions: 'history',
};

// Where each server release requirement (GetTechCardReadiness `key`) is fixed. The backend names and
// judges the condition; which tab clears it is this admin's navigation and cannot come over the
// wire. An unmapped key falls back to the header tab — a requirement added server-side later is
// still shown and still leads somewhere, rather than being silently dropped from the gate.
const RELEASE_BLOCKER_TAB: Record<string, TabId> = {
  style_number: 'header',
  size_range: 'patterns',
  bom_fabric: 'bom',
  bom_linked: 'bom',
  costing: 'costing',
  colorway_linked: 'colorways',
  lab_dip: 'colorways',
  signoffs: 'signoff',
};

const RELEASED = 'TECH_CARD_APPROVAL_STATE_RELEASED';
const DRAFT = 'TECH_CARD_APPROVAL_STATE_DRAFT';
const SIGNOFF_APPROVED = 'TECH_CARD_SIGNOFF_STATE_APPROVED';

function PreSaveTile({ label }: { label: string }) {
  return (
    <div className='flex aspect-square flex-col items-center justify-center gap-1 border border-dashed border-textInactiveColor p-2 text-center'>
      <Text variant='inactive' size='small'>
        {label}
      </Text>
    </div>
  );
}

// Shown on the LABELS & PKG tab for a brand-new (unsaved) card: the assembly bill, packaging recipe
// and dust-bag option are per-style and need a saved card id (their own RPCs, not the main insert),
// so instead of silently hiding them we say so and offer Save — which lands the user right back
// here on the saved card (see doSubmit's create branch).
function PreSavePrompt({
  canWrite,
  saving,
  onSave,
}: {
  canWrite: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className='flex flex-col items-start gap-4 border border-textInactiveColor bg-textColor/5 p-4'>
      <div className='space-y-1'>
        <Text variant='uppercase'>save the tech card first</Text>
        <Text variant='inactive' size='small'>
          on-garment items (labels / tags), the packaging recipe and the “goes in a dust bag” option
          are stored per style — they need a saved card to attach to. Save now and they unlock right
          here.
        </Text>
      </div>
      <div className='grid w-full max-w-md grid-cols-3 gap-2'>
        <PreSaveTile label='on-garment items' />
        <PreSaveTile label='packaging recipe' />
        <PreSaveTile label='dust bag (пыльник)' />
      </div>
      {canWrite && (
        <Button
          type='button'
          variant='main'
          size='lg'
          className='uppercase'
          loading={saving}
          onClick={onSave}
        >
          save tech card
        </Button>
      )}
    </div>
  );
}

export function TechCardForm({
  isEditMode,
  id,
  techCard,
}: {
  isEditMode: boolean;
  id?: string;
  techCard?: common_TechCard;
}) {
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const createTechCard = useCreateTechCard();
  const updateTechCard = useUpdateTechCard();
  const { canWrite, canReadCosting, canWriteCosting } = usePermissions();
  const queryClient = useQueryClient();
  // Sub-panels stage their mutation here instead of firing it; the header's one save commits the
  // card body and then this queue (phase 19).
  const staging = useTechCardStagingRequired();
  // A partial failure is a fact about a save that already half-happened, so it stays on screen
  // until the next save rather than passing through a toast.
  const [stagingError, setStagingError] = useState<string | null>(null);

  const numId = id ? parseInt(id, 10) : undefined;

  // URL-driven state. ?stage=… seeds a freshly-created card's stage ([new idea] → IDEA); ?tab=…
  // and ?sample=/?fits= make the open section / sample / fittings-filter deep-linkable (R-1).
  // Both params are validated — a mistyped shared link must not seed a garbage enum into the
  // form (the backend would 400 with no field pointer) or park the page on a blank tab.
  const [params, setParams] = useSearchParams();
  const stageParam = params.get('stage');
  const initialStage = techCardStageOptions.some((o) => o.value === stageParam)
    ? (stageParam as TechCardFormData['stage'])
    : undefined;

  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema),
    defaultValues: techCard
      ? mapTechCardToForm(techCard)
      : initialStage
        ? { ...techCardDefaultData, stage: initialStage }
        : techCardDefaultData,
    mode: 'onSubmit',
  });

  // NF-07 auxiliary items: an aux card produces a packaging material, links no products, and needs
  // an output material set before its first run. Read HERE, above the tab plumbing, because which
  // tabs exist depends on it — the folded-alias resolution and isTabVisible both branch on isAux.
  const purpose = toPurposeEnum(
    useWatch({ control: form.control, name: 'purpose' }) as string | undefined,
  );
  const isAux = purpose === 'TECH_CARD_PURPOSE_AUXILIARY';

  // Switching tabs drops a stale ?sample= / ?fits=; extra params (a sample to open, a fittings
  // filter) can be set in the same navigation (spine deep links).
  const rawTab = params.get('tab');
  // A folded alias has to resolve to a tab that EXISTS on this card. Both fold targets (costing,
  // patterns) do on every card, including an auxiliary one — ?tab=pieces used to fold onto
  // colorways, which an aux card does not have, and that needed a per-card rewrite here. Since the
  // cut-piece table moved to PATTERNS the alias is unconditional.
  const tabParam = rawTab ? FOLDED_TABS[rawTab] ?? rawTab : rawTab;
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'header';
  const navTo = (id: TabId, extra?: Record<string, string>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', id);
        if (id !== 'samples') p.delete('sample');
        p.delete('fits');
        for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
        return p;
      },
      { replace: true },
    );
  const setActiveTab = (id: TabId) => navTo(id);
  const [conflict, setConflict] = useState(false);
  // A sellable→auxiliary save held back until the operator answers for the live colourways it has to
  // retire first (NF-07 purpose lock). Carries the validated payload so «archive & switch» re-runs
  // exactly the save that was intercepted, not whatever the form holds a few seconds later.
  const [convert, setConvert] = useState<{
    data: TechCardFormData;
    colorways: common_AdminColorwayRef[];
  } | null>(null);
  const [converting, setConverting] = useState(false);
  // What a half-finished convert left behind. Like stagingError this is a fact about a write that
  // already partly happened, so it stays on screen instead of passing through a toast.
  const [convertReport, setConvertReport] = useState<string | null>(null);
  // 0252: offer to carry the colours over. The colourways being archived ARE the card's colour
  // range, and re-picking them one by one afterwards is the same list typed twice. Opt-out rather
  // than opt-in — the operator who converts a multi-colour style almost always wants the buckets —
  // but it runs strictly AFTER the flip has landed, so a declined or failed flip seeds nothing.
  const [seedColours, setSeedColours] = useState(true);
  // Colourways THIS page archived, which the `techCard` prop does not know about yet. Without it the
  // window between the archive loop and the refetch landing is a trap: a save that 409s, answered
  // with «keep mine & overwrite», re-enters doSubmit against the stale prop, re-opens the convert
  // dialog and re-archives already-ARCHIVED colourways — and archive is not idempotent (ARCHIVED has
  // no outgoing archive edge), so the retry hard-fails and the report lies about where it stopped.
  const archivedIds = useRef(new Set<number>());
  // The set holds ONLY "archived by us, not yet confirmed by a read": each id drops out the moment
  // the server's own copy says ARCHIVED. Without this it would outlive the fact — a colourway
  // restored from its own page would stay invisible here for the rest of the session.
  useEffect(() => {
    if (archivedIds.current.size === 0) return;
    for (const c of techCard?.colorways ?? []) {
      if (c.status === 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED')
        archivedIds.current.delete(c.colorwayId ?? 0);
    }
  }, [techCard?.colorways]);
  // The version the NEXT body save must claim. Null = the loaded card's, the normal case. A 409 that
  // the operator answered with «keep mine & overwrite» parks the server's CURRENT version here: the
  // techCard prop stays stale after a failed save (nothing invalidates it, and the query neither
  // refetches on focus nor remounts), so without this the retry resent the same rejected version and
  // 409'd forever — the modal's overwrite affordance could never do what it said. A ref, not state:
  // the handler re-runs the save immediately after setting it.
  const lockOverride = useRef<number | null>(null);
  const [blockersOpen, setBlockersOpen] = useState(false);
  // Drawer state lives in the URL so it survives a refresh and can be linked to.
  const tasksOpen = params.get('tasks') === '1';
  // The field a failed save should walk the user to. `nonce` re-arms the effect when the SAME field
  // fails twice in a row (a second Save without fixing anything must pulse again, not sit silent).
  const [focusTarget, setFocusTarget] = useState<{ path: string; nonce: number } | null>(null);
  // bump to jump to the BOM tab and pulse the empty composition fields (from labels care-gen)
  const [bomHighlight, setBomHighlight] = useState(0);
  const goToBomComposition = () => {
    setActiveTab('bom');
    setBomHighlight((n) => n + 1);
  };

  // The loaded card's server state freezes the body; the user's in-form approval value
  // drives the Release gate.
  const frozen = techCard?.techCard?.approvalState === RELEASED;
  const styleNumber = useWatch({ control: form.control, name: 'styleNumber' });
  const name = useWatch({ control: form.control, name: 'name' });
  const issues = (useWatch({ control: form.control, name: 'issues' }) ?? []) as Array<{
    status?: string;
  }>;
  const openIssues = issues.filter((i) => i.status === 'TECH_CARD_ISSUE_STATUS_OPEN').length;
  const signoffs = (useWatch({ control: form.control, name: 'signoffs' }) ?? []) as Array<{
    state?: string;
  }>;
  // Every present sign-off must be APPROVED (a REJECTED / PENDING row blocks release) and at least
  // one must exist — so a card can no longer be released with zero sign-offs (M10).
  const signoffsApproved =
    signoffs.length > 0 && signoffs.every((s) => s.state === SIGNOFF_APPROVED);

  // Lifecycle spine inputs: current stage/approval drive the stepper.
  const stage = (useWatch({ control: form.control, name: 'stage' }) ?? '') as string;
  const isIdea = stage === 'TECH_CARD_STAGE_IDEA';
  // The server's readiness checklist. The lifecycle strip reads the SAME cached query for its stage
  // rows; this call is here for `releaseRequirements`, which is a second, independent list.
  const { data: readiness } = useTechCardReadiness(isEditMode ? numId : undefined);
  // The style's batches. Read here as well as inside the production tab so the rail's completion
  // glyph knows whether the tab has content — React Query serves both from ONE cached list, keyed by
  // the same arguments, so this is not a second request.
  const { data: productionRunsData } = useProductionRuns(
    numId ?? 0,
    '',
    0,
    false,
    isEditMode && !!numId,
  );
  const productionRunCount = productionRunsData?.runs?.length ?? 0;
  // Release freezes the card as the factory-facing spec, so what it takes is stated once, below.
  // The old M8/M3 gap note is gone with the guesswork it described: colourway lab-dip approval could
  // never be gated here (the read model exposes no labDipStatus — the field lives only on the
  // write-only ColorwayDevelopmentInsert), and the readiness RPC now scores it server-side.
  const bomItemsW = (useWatch({ control: form.control, name: 'bomItems' }) ?? []) as Array<{
    materialId?: number;
    id?: number;
    lineKey?: string;
  }>;
  // ONE release-blocker list, rendered three ways (header chips, the blockers modal, the
  // ReleasesField gate). Its spine is now the SERVER's release checklist — `releaseRequirements`
  // from GetTechCardReadiness — which knows things this screen never could (costing currency, an
  // unapproved lab dip, an empty size range) and phrases each failure as a fact.
  // Server rows are scored against SAVED data, so a fix made in the form counts once it is saved.
  // That is the right reading here: release freezes the saved spec as the factory-facing document.
  // Each blocker still carries the tab that fixes it, so every rendering navigates identically.
  const serverReleaseRows = (readiness?.releaseRequirements ?? []).filter(
    // The one fact the readiness RPC cannot know (same filter, same reason as lifecycle-strip.tsx:
    // the facts query has no notion of `purpose`): an NF-07 auxiliary card produces a packaging
    // material and links no products BY DESIGN, so `colorway_linked` — and the `lab_dip` row that
    // only exists to score those colourways — would sit permanently unmet. Worse than merely wrong
    // since the colourways tab became aux-hidden: both chips route to RELEASE_BLOCKER_TAB
    // 'colorways', which for an aux card bounces straight back to header, i.e. a dead control that
    // states an unfixable requirement. Dropped, not failed.
    (r) => !(isAux && (r.key === 'colorway_linked' || r.key === 'lab_dip')),
  );
  const releaseBlockers: (ReleaseBlocker & { tab: TabId })[] = serverReleaseRows
    .filter((r) => !r.met)
    .map((r) => ({
      label: r.label ?? 'a release requirement is unmet',
      detail: r.detail,
      tab: RELEASE_BLOCKER_TAB[r.key ?? ''] ?? 'header',
    }));
  // The two facts no readiness row answers: the stage is a live form value the server has not been
  // handed yet, and issues are not part of the readiness facts at all.
  if (isIdea)
    releaseBlockers.push({
      label: 'advance the stage (an IDEA draft can’t be released)',
      tab: 'header',
    });
  if (openIssues > 0)
    releaseBlockers.push({
      label: `resolve ${openIssues} open issue${openIssues > 1 ? 's' : ''}`,
      tab: 'issues',
    });
  // #64 under slots: a slot needs an ARTICLE to be releasable — its own default, or a pin in EVERY
  // live (non-archived) colourway. Mirrors the server's bom_linked rule word-for-word; that rule
  // sits on the PP stage checklist, not on release, so this stays a client rule and no duplicate.
  // The old blanket "link a material on every line" wrongly blocked a role-only slot that every
  // colourway pins — under the slot model that slot is fully specified.
  // The style's LIVE colourways — archived ones are retired work. The single source for both the
  // release gate below and the purpose lock warning on the header tab: the server's purpose lock
  // counts `product.lifecycle_status <> archived` too, so a card whose colourways are all archived
  // is free to flip and must not be told otherwise.
  const liveColorways = (techCard?.colorways ?? []).filter(
    (c) =>
      c.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED' &&
      !archivedIds.current.has(c.colorwayId ?? 0),
  );
  const slotCovered = (b: { materialId?: number; id?: number; lineKey?: string }) => {
    if ((b.materialId ?? 0) > 0) return true;
    if (liveColorways.length === 0) return false;
    return liveColorways.every((c) =>
      (c.usages ?? []).some(
        (u) =>
          ((wireInt(u.bomItemId) > 0 && wireInt(u.bomItemId) === wireInt(b.id)) ||
            (!!b.lineKey && u.bomLineKey === b.lineKey)) &&
          wireInt(u.materialId) > 0,
      ),
    );
  };
  if (bomItemsW.some((b) => !slotCovered(b)))
    releaseBlockers.push({
      label: 'every BOM slot needs an article — a default, or a pin in every live colourway',
      tab: 'bom',
    });
  // Sign-offs are the one rule both sides know, and the server states it better ("2 of 5 sign-offs
  // are not approved"). The form-derived check survives ONLY as the fallback for a checklist that
  // has not arrived (in flight, or the call failed): an advisory RPC must never WIDEN the gate.
  // Tested against the RAW rows, not the aux-filtered ones — "the checklist has not arrived" and
  // "every row in it was dropped as inapplicable" are different states, and only the first one
  // justifies falling back to the weaker client-side rule.
  if ((readiness?.releaseRequirements?.length ?? 0) === 0 && !signoffsApproved)
    releaseBlockers.push({
      label:
        signoffs.length === 0
          ? 'sign off every required section first'
          : 'every sign-off section must be APPROVED',
      tab: 'signoff',
    });
  const canRelease = releaseBlockers.length === 0;
  const approvalState = (useWatch({ control: form.control, name: 'approvalState' }) ??
    '') as string;
  // `purpose` / `isAux` are read further up — the tab plumbing branches on them.
  const outputMaterialId = (useWatch({ control: form.control, name: 'outputMaterialId' }) ??
    0) as number;
  const auxSubtype = (useWatch({ control: form.control, name: 'auxSubtype' }) ??
    'TECH_CARD_AUX_SUBTYPE_UNKNOWN') as string;
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  // 0252 colour variants. Read off the CARD, never the form: they are written by their own RPCs
  // (a variant owns warehouse stock, so the full-replace save must not be able to re-mint or drop
  // one), which also means they are already saved — there is nothing here for Save to carry.
  const outputVariants = techCard?.outputVariants ?? [];
  // ANY variant — active or retired — pins the auxiliary purpose. Only the ACTIVE ones ENABLE a
  // run: each owns the warehouse bucket its output is booked into, so a card whose colours are all
  // retired is back to needing the single output material before anything can be planned.
  const liveVariants = activeVariantCount(outputVariants);

  // Autosave the working draft to localStorage (Q9b): leaving the route (to /materials, /fitting,
  // the product manager) or a hard refresh no longer loses unsaved edits — restore on return.
  const draftKey = isEditMode ? `edit.${numId ?? id ?? '0'}` : 'new';
  // Only the two staging functions, pinned: `staging` itself is a fresh object every render (it
  // carries the live `changes` array), and handing that straight to the hook restarted its debounced
  // autosave timer on every render — a card being edited could keep re-arming the timer and never
  // actually persist the staged snapshots the restore banner then promises.
  const stagingIO = useMemo(
    () => ({ serialize: staging.serialize, hydrate: staging.hydrate }),
    [staging.serialize, staging.hydrate],
  );
  const draft = useTechCardDraft(
    form,
    draftKey,
    canWrite(SECTION.techCards) && !frozen,
    staging.changes.length > 0,
    stagingIO,
  );

  // Section-completion progress (Q9): a visible "how filled is this card" signal, per tab + overall.
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const moodboardMedia = useWatch({ control: form.control, name: 'moodboardMedia' });
  const technicalMedia = useWatch({ control: form.control, name: 'technicalMedia' });
  const sizeIdsW = useWatch({ control: form.control, name: 'sizeIds' });
  // Watched for the patterns glyph only. Cheap in practice: a rename commits on blur/Enter and a
  // rebind on select, so this re-renders the form on an upload or a deliberate edit — not per
  // keystroke (the inline rename holds its draft in the panel's own state).
  const patternsW = useWatch({ control: form.control, name: 'patterns' });
  const operationsW = useWatch({ control: form.control, name: 'operations' });
  const labelsW = useWatch({ control: form.control, name: 'labels' });
  // Which tabs count toward "the card's core spec is filled", and whether each currently has content.
  const sectionFilled: Partial<Record<TabId, boolean>> = {
    header: !!name?.trim() && (stage === 'TECH_CARD_STAGE_IDEA' || !!styleNumber?.trim()),
    sketch: len(technicalMedia) > 0,
    moodboard: len(moodboardMedia) > 0,
    // A size range alone stopped answering for this tab. The выкройки panel below it files DXF
    // sheets BY MATERIAL and names every fabric line with no sheet as a hole, so a card carrying a
    // full size range and not one pattern was ticked done while the tab itself said otherwise.
    // The truthful rule is the panel's own — every rollgoods BOM line carries at least one DXF —
    // but that rule is ROLE_OF_SECTION in patterns-field.tsx, and restating it here would be a
    // second implementation to keep in step (and would peg a card whose sheets are still on paper
    // below done for good). This is the cheap, strictly-less-wrong half: the range AND a sheet.
    patterns: len(sizeIdsW) > 0 && len(patternsW) > 0,
    bom: len(bomItemsW) > 0,
    // colourways are products, read from techCard.colorways (the RHF `colorways` array is always []).
    // Cut pieces are deliberately NOT part of any tab's test (they answer for `patterns` now): no
    // release gate requires them, so a style that genuinely has none (an accessory) would be pegged
    // below 100% for good. Its own half-empty table says so on the tab.
    // Left UNSET for an auxiliary card: it can never have a colourway, its tab is hidden
    // (isTabVisible), and stating `false` for a section that cannot exist would be a claim about
    // work that is not outstanding.
    colorways: isAux ? undefined : (techCard?.colorways?.length ?? 0) > 0,
    construction: len(operationsW) > 0,
    labels: len(labelsW) > 0,
    // "filled" = actually signed off, not merely present — 7 REJECTED rows must not read as done (M10).
    signoff: signoffsApproved,
    // A style has "production" once at least one batch of it exists. Read off the runs query rather
    // than the form — runs are not part of the tech-card payload.
    production: productionRunCount > 0,
  };
  const isFilled = (t: TabId) => sectionFilled[t] === true;

  // Every lookup goes through here so the rail's error dot, the failed-save tab switch and the
  // walk-to-the-field routine all land on the tab that actually renders the field. The map is now
  // purely static: it used to re-route `pieces` (colorways → construction for an auxiliary card,
  // which has no colourways), and that special case died with the move of the cut-piece table onto
  // PATTERNS — a tab every card has. Nothing in ERROR_TAB points at `colorways` any more, which is
  // what lets isTabVisible hide it for an aux card with no error escape.
  const errorTabFor = (rootKey: string): TabId => ERROR_TAB[rootKey] ?? 'header';

  // Full dotted paths, not root keys: `bomItems.3.name` used to collapse to `bomItems`, so the rail
  // could only ever say "something on the BOM tab is wrong" and the count was always 1 per tab.
  const flatErrors = flattenFieldErrors(form.formState.errors as FieldErrors);
  const errorCountByTab = new Map<TabId, number>();
  for (const e of flatErrors) {
    const tab = errorTabFor(errorRootKey(e.path));
    errorCountByTab.set(tab, (errorCountByTab.get(tab) ?? 0) + 1);
  }
  const errorTabs = new Set(errorCountByTab.keys());

  // IDEA is a "light" card (screen E): only the concept-relevant tabs show; the rest reappear when
  // the stage advances, their echoed fields untouched. Not disabled — hidden. A tab carrying a
  // validation error stays visible even at IDEA, or the error dot would point at an invisible tab.
  const IDEA_TABS: TabId[] = ['header', 'sketch', 'moodboard', 'samples', 'history'];
  // Costing is field-shaped: hidden entirely without costing:read (server nulls the cost block; an
  // empty tab would read as "zero cost"). R&D dev-expenses now live as a section inside it. Samples
  // need a saved card (id).
  const isTabVisible = (t: TabId) => {
    // An auxiliary card produces a MATERIAL, not products: it has no colourways (CreateColorway
    // refuses an aux style), so the whole tab — the colourway recipes, the lab dips, the SKU-shaped
    // machinery — is furniture for a thing that cannot exist. Nothing else shares the tab any more:
    // the cut-piece editor (a кофр is cut and sewn like any garment) lives on PATTERNS, which every
    // card has, so hiding this one takes nothing an aux card needs with it.
    // No error escape here, unlike the IDEA rule below: no ERROR_TAB row points at `colorways` any
    // more, so nothing can be filed against this tab while it is invisible.
    if (t === 'colorways' && isAux) return false;
    if (isIdea && !IDEA_TABS.includes(t)) return errorTabs.has(t);
    if (t === 'costing' && !canReadCosting) return false;
    if (t === 'samples' && !isEditMode) return false;
    // Production needs a saved card (the runs query is keyed by its id). Deliberately NOT gated on
    // costing:read, unlike costing above: the server strips money out of a run payload but keeps the
    // quantities and the defect rate, so a warehouse role gets a coherent view rather than an empty
    // tab — and receiving stock is precisely that role's job.
    if (t === 'production' && !isEditMode) return false;
    return true;
  };
  // Rewrite a legacy ?tab=dev / ?tab=pieces to the tab that absorbed it, so the URL matches what is
  // rendered (the alias above already resolves it; this cleans the address bar / a bookmark).
  useEffect(() => {
    const folded = rawTab ? FOLDED_TABS[rawTab] : undefined;
    if (folded) navTo(folded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab]);
  // If the open tab becomes hidden (switching a card to IDEA while on the BOM tab, or permissions
  // resolving and taking the costing tab away), fall back to header so the body isn't blank.
  useEffect(() => {
    if (!isTabVisible(activeTab)) navTo('header');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isIdea, canReadCosting, isEditMode, isAux]);

  // Walk the user to the field a failed save flagged. This has to run AFTER the tab switch commits
  // (it's a router param update) and after any collapsed container that owns the field expands
  // itself — a BomTile opens on its own error, one render later — so the target simply may not
  // exist yet. Retry a few frames before giving up; the toast already names the path either way.
  useEffect(() => {
    if (!focusTarget) return;
    const { path } = focusTarget;
    let cancelled = false;
    let timer = 0;
    const attempt = (attemptsLeft: number) => {
      if (cancelled) return;
      try {
        form.setFocus(path as Parameters<typeof form.setFocus>[0]);
      } catch {
        // Registered through a wrapper that keeps no focusable ref (Radix select, media picker).
        // Not fatal: revealField still scrolls and pulses the row via its [data-field] anchor.
      }
      if (revealField(path) || attemptsLeft <= 0) return;
      timer = window.setTimeout(() => attempt(attemptsLeft - 1), 80);
    };
    const raf = requestAnimationFrame(() => attempt(4));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  // After a body save the server owns values this form cannot compute, and `data` — the payload
  // that just went over the wire — still carries the pre-save placeholder for each of them.
  // Resetting the form to it leaves the card lying about itself, and for ONE of those fields the lie
  // is destructive: «approve» blanks a sign-off's signedDigest precisely because an EMPTY digest on
  // the wire MEANS "approve this now". Left blank in form state it is re-sent by every LATER save in
  // the same page session, silently re-blessing the section against whatever it has become since —
  // approve the BOM once and every subsequent save re-approves it against the new content.
  //
  // Deliberately a MERGE into what was sent rather than a wholesale reset to mapTechCardToForm(fresh):
  // the staged sub-panels commit AFTER this (styleFacts writes fit / brand / collection / season via
  // UpdateStyle, order 10), so their form fields are still unsaved at this point and a wholesale
  // reset would revert them to the server's pre-commit values — losing exactly the edits the staged
  // queue is about to write. Only the three server-assigned lists are taken. Cut pieces have nothing
  // to re-seed: their identity is the client-minted lineKey, not a server id.
  async function withServerAssignedValues(sent: TechCardFormData): Promise<TechCardFormData> {
    if (!numId) return sent;
    let fresh: common_TechCard | undefined;
    try {
      const res = await adminService.GetTechCard({ id: numId, vatCountryCode: undefined });
      fresh = res.techCard;
    } catch {
      // Not fatal — the save itself landed. Fall back to what was sent; useUpdateTechCard's own
      // invalidation still refetches the card, and a reload re-seeds the form from the server.
      return sent;
    }
    if (!fresh) return sent;
    // Prime the cache with the read we already paid for, so the detail this reset is built from is
    // the same one the NEXT save reads its expectedLockVersion from.
    queryClient.setQueryData(techCardKeys.detail(numId), fresh);
    const server = mapTechCardToForm(fresh);

    // Sign-off digests, by section. A section normally holds one row; a duplicate ("other entries")
    // takes the NEXT server row for that section rather than a copy of the first.
    const serverDigests = new Map<string, string[]>();
    for (const s of server.signoffs ?? []) {
      const sec = s.section ?? '';
      serverDigests.set(sec, [...(serverDigests.get(sec) ?? []), s.signedDigest ?? '']);
    }
    const seenSection = new Map<string, number>();
    const signoffs = (sent.signoffs ?? []).map((s) => {
      const sec = s.section ?? '';
      const nth = seenSection.get(sec) ?? 0;
      seenSection.set(sec, nth + 1);
      const digest = serverDigests.get(sec)?.[nth];
      return digest === undefined ? s : { ...s, signedDigest: digest };
    });

    // Pattern revisions: a freshly uploaded sheet goes out as version 0 and the server assigns
    // MAX+1 for its size, so the form would otherwise keep asking for a new number on every save.
    // uploadedAt is server-owned as well (never sent, only displayed).
    const patternKey = (p: { sizeId?: number; url?: string }) =>
      `${p.sizeId ?? 0}|${(p.url ?? '').trim()}`;
    const serverPatterns = new Map((server.patterns ?? []).map((p) => [patternKey(p), p]));
    const patterns = (sent.patterns ?? []).map((p) => {
      const sp = serverPatterns.get(patternKey(p));
      return sp ? { ...p, version: sp.version ?? 0, uploadedAt: sp.uploadedAt ?? '' } : p;
    });

    // BOM primary keys, matched on the durable line_key: a row added in this session went out with
    // id 0 and comes back with the PK the insert assigned.
    const serverBomIds = new Map((server.bomItems ?? []).map((b) => [b.lineKey ?? '', b.id ?? 0]));
    const bomItems = (sent.bomItems ?? []).map((b) => {
      const id = serverBomIds.get(b.lineKey ?? '');
      return id === undefined ? b : { ...b, id };
    });

    return { ...sent, signoffs, patterns, bomItems };
  }

  // The actual write: card body first (it carries the lock version), then the staged sub-panels.
  //
  // Two answers, not one, because "did it all land" and "is the card's PURPOSE now auxiliary" are
  // different questions with different consequences. A staged panel can fail AFTER the body PUT has
  // already committed the flip — at which point the convert flow must NOT tell the operator the card
  // is still sellable and their colourways are restorable, because an auxiliary style refuses every
  // un-archive edge (checkOwningStyleSellable). `bodySaved` is the honest half of that answer.
  async function writeTechCard(
    data: TechCardFormData,
  ): Promise<{ bodySaved: boolean; ok: boolean }> {
    setConflict(false);
    setStagingError(null);
    const techCardInsert = mapFormToTechCardInsert(data, techCard?.techCard, canWriteCosting);
    let bodySaved = false;
    try {
      if (isEditMode) {
        // Count what this run intends to write BEFORE anything moves, so a partial-failure banner
        // can say "2 of 4" and mean it.
        const bodyDirty = form.formState.isDirty;
        const planned = (bodyDirty ? 1 : 0) + staging.changes.length;

        // The card body goes FIRST: it carries expectedLockVersion, so a 409 here must abort before
        // any child panel writes. Committing a recipe against a card body someone else has already
        // moved is how orphan references are made (19.4). The catch below handles that.
        if (bodyDirty) {
          await updateTechCard.mutateAsync({
            id: parseInt(id || '0', 10),
            techCard: techCardInsert,
            // Normally the loaded card's version; after «keep mine & overwrite» the version read
            // back from the server, so that choice actually overwrites (see keepMineAndOverwrite).
            expectedLockVersion: lockOverride.current ?? techCard?.lockVersion ?? 0,
          });
          // The body is committed server-side from here on — anything that fails below leaves the
          // card carrying the values this PUT just wrote (see the return type's comment).
          bodySaved = true;
          // Spent: the write moved the server's version on, and useUpdateTechCard's invalidation
          // brings the new one back. Holding it would 409 the save after next.
          lockOverride.current = null;
          // Reset to what the SERVER now holds, not to what we sent — above all so a sign-off that
          // was just approved carries its stamped digest instead of the blank that MEANS "approve
          // now" (see withServerAssignedValues).
          form.reset(await withServerAssignedValues(data));
        }
        // Then the staged sub-panels, in commit order. These are separate RPCs — there is NO
        // transaction, and the banner below deliberately does not pretend otherwise.
        const outcome = await staging.commitAll();
        if (outcome.failed) {
          const { change, error } = outcome.failed;
          const done = (bodyDirty ? 1 : 0) + outcome.committed.length;
          setStagingError(
            `saved ${done} of ${planned} — «${change.label}» failed: ${techCardErrorMessage(error, 'unknown error')}. Everything not yet saved is still staged.`,
          );
          showMessage(`«${change.label}» failed — the rest is still staged`, 'error');
          return { bodySaved, ok: false };
        }
        // A committed panel bumps the SHARED tech_card.lock_version server-side (UpdateStyleSizeChart
        // and UpdateStyle both do), but only useUpdateTechCard invalidates this card. Without this
        // refetch a save that committed panels ONLY leaves the cached lockVersion a step behind, and
        // the next body save 409s into the "this card moved on without you" modal over a conflict
        // that never happened.
        if (numId && outcome.committed.length > 0) {
          queryClient.invalidateQueries({ queryKey: techCardKeys.detail(numId) });
        }
        showMessage(planned > 1 ? `saved ${planned} changes` : 'tech card updated', 'success');
        // A panel edited WHILE its own commit was in flight wrote the older values and kept the newer
        // ones staged (see commitAll). Saying so is the whole point — the previous behaviour reported
        // everything saved and dropped those keystrokes. The draft stays too: it is the only copy of
        // those newer values until the next autosave tick rewrites it.
        if (outcome.restaged?.length) {
          setStagingError(
            `«${outcome.restaged.map((c) => c.label).join('», «')}» changed while the save was running — the newer values are still staged. Press Save again.`,
          );
        } else {
          draft.clear();
        }
      } else {
        const created = await createTechCard.mutateAsync(techCardInsert);
        bodySaved = true;
        showMessage('tech card created', 'success');
        draft.clear();
        // If they were working on labels & pkg, land on the saved card's labels tab so the
        // per-style assembly / packaging-recipe / dust-bag editors (which need the new id) are
        // right there — instead of bouncing to the list and losing the thread (see PreSavePrompt).
        if (created?.id && activeTab === 'labels') {
          navigate(`${ROUTES.techCards}/${created.id}?tab=labels`);
        } else {
          navigate(ROUTES.techCards);
        }
      }
      return { bodySaved, ok: true };
    } catch (error) {
      if ((error as { status?: number })?.status === 409) setConflict(true);
      // Pin server field-violations (google.rpc.BadRequest) onto the exact inputs, then surface the
      // owning tab so the error dot + focus land where the user can act (Q1/S24).
      const { applied, unmapped } = applyServerFieldErrors(error, form.setError, {
        stripPrefixes: ['tech_card'],
      });
      if (applied.length > 0) {
        const root = applied[0].split('.')[0];
        setActiveTab(errorTabFor(root));
      }
      const base = techCardErrorMessage(error, 'Failed to submit tech card');
      showMessage(
        unmapped.length ? `${base} — ${unmapped.map((u) => u.description).join('; ')}` : base,
        'error',
      );
      console.error('Failed to submit tech card', error);
      return { bodySaved, ok: false };
    }
  }

  // NF-07 guided convert. The server's purpose lock counts LIVE colourways, and the client already
  // knows them — so the flip is intercepted BEFORE the request instead of coming back as a refusal
  // the operator can do nothing with. The lock's OTHER arms (non-cancelled runs, sold colourways,
  // assembly usage — and the registry grows) are invisible from here and stay the server's refusal;
  // archiving cannot clear those, which is why the dialog promises only the colourway arm.
  const flipsToAuxiliary = (data: TechCardFormData) =>
    isEditMode &&
    toPurposeEnum(data.purpose) === 'TECH_CARD_PURPOSE_AUXILIARY' &&
    toPurposeEnum(techCard?.techCard?.purpose) !== 'TECH_CARD_PURPOSE_AUXILIARY';

  const colorwayLabel = (c: { colorwayId?: number; colorCode?: string; baseSku?: string }) =>
    c.baseSku?.trim() || c.colorCode?.trim() || `#${c.colorwayId ?? 0}`;

  // Which colours a convert can seed. A colour is unique per card server-side, so two colourways
  // sharing one code would make the second a guaranteed refusal — dedup here rather than report a
  // "failure" the operator can do nothing about. UPPERCASED because the server uppercases before
  // its own duplicate check: 'blk' and 'BLK' are one colour there, so they must collapse into one
  // here too or the second is sent only to be refused. A colourway with no colour code is skipped
  // outright: there is nothing to register it under.
  const colourCodesOf = (colorways: common_AdminColorwayRef[]) => {
    const seen = new Set<string>();
    for (const c of colorways) {
      const code = c.colorCode?.trim().toUpperCase();
      if (code) seen.add(code);
    }
    return [...seen];
  };
  // Every colour this convert has ever queued, across retries. The archive loop is resumable and
  // `liveColorways` shrinks as it succeeds — so attempt 2's queue no longer contains the colours
  // attempt 1 already archived, and seeding from that queue alone would silently drop them while
  // reporting success. Accumulated BEFORE the loop runs, drained only by a colour that actually
  // landed.
  const seedCodes = useRef(new Set<string>());
  // What the dialog's checkbox promises — the union of what is queued now and what an earlier
  // attempt already archived, so the list names exactly what will be sent. Reading the ref here is
  // safe: it is written before the dialog can re-open, and re-opening is what changes `convert`.
  const seedableCodes = useMemo(
    () => [...new Set([...seedCodes.current, ...colourCodesOf(convert?.colorways ?? [])])],
    [convert],
  );

  async function doSubmit(data: TechCardFormData) {
    if (flipsToAuxiliary(data) && liveColorways.length > 0) {
      setConvertReport(null);
      setConvert({ data, colorways: liveColorways });
      return;
    }
    await writeTechCard(data);
  }

  // «archive & switch»: retire every live colourway, then run the same save again. Client-guided and
  // NOT atomic — there is no server RPC that does both — so every exit says exactly what happened.
  // Archiving a colourway touches `product` only (it does not bump tech_card.lock_version), so the
  // save that follows still claims the version this page loaded; a genuine 409 here is a real
  // concurrent edit and falls through to the existing conflict modal.
  async function confirmConvert() {
    if (!convert || converting) return;
    const queue = convert.colorways;
    const data = convert.data;
    const archived: string[] = [];
    // Banked BEFORE anything can fail: whatever this attempt archives stops being a live colourway,
    // so a later retry would never see these codes again.
    for (const code of colourCodesOf(queue)) seedCodes.current.add(code);
    // Held across the archive loop AND the save that follows: this path bypasses form.handleSubmit,
    // so `isSubmitting` never rises and the header's Save button would otherwise stay live while the
    // flip PUT is in flight. `converting` is what disables it (see the Save button).
    setConverting(true);
    try {
      try {
        for (const c of queue) {
          // expectedVersion is echoed per the RPC contract; the server enforces the transition on the
          // colourway's own lifecycle_status, so a sequential loop needs no re-read between calls.
          await adminService.ArchiveColorwayByID({
            colorwayId: c.colorwayId,
            expectedVersion: c.lockVersion ?? 0,
          });
          // Remembered before the label: this is what keeps a retry from re-archiving it.
          archivedIds.current.add(c.colorwayId ?? 0);
          archived.push(colorwayLabel(c));
        }
      } catch (error) {
        const failed = queue[archived.length];
        setConvert(null);
        setConvertReport(
          `archived ${archived.length} of ${queue.length}${
            archived.length ? ` (${archived.join(', ')})` : ''
          } — «${colorwayLabel(failed ?? {})}» failed: ${
            // Deliberately NOT techCardErrorMessage: this is a COLOURWAY transition, and that helper's
            // copy talks about the tech card ("re-open it to Draft"), which would misdirect.
            error instanceof Error ? error.message : 'unknown error'
          }. ` +
            'The card is STILL SELLABLE and nothing was flipped — restore each archived colourway ' +
            'from its own page while it stays sellable, or press save again to retry the rest.',
        );
        showMessage('convert stopped — the card is still sellable', 'error');
        return;
      }
      // The card's colourway list drives the lock warning and the release gate; it is stale the
      // moment the loop finishes. Refetch (don't await — the save below reads the form, not the
      // query, and archivedIds already covers the gap).
      if (numId) queryClient.invalidateQueries({ queryKey: techCardKeys.detail(numId) });
      setConvert(null);
      const { bodySaved, ok } = await writeTechCard(data);
      if (ok) {
        // Only now: the card has to BE auxiliary before a colour variant is allowed on it (the
        // server refuses one on a sellable card), so seeding is a follow-up to the flip, not part
        // of it. Nothing here can un-flip the card — a failed colour is a retry from «output
        // material», which is exactly what the report says.
        // Every colour banked across ALL attempts, not just this queue: a resumed convert must
        // still seed what the earlier attempt archived.
        const codes = [...seedCodes.current];
        if (seedColours && codes.length > 0 && numId) {
          showMessage(`registering ${codes.length} colour(s)…`, 'success');
          const { created, failed } = await seedColourVariants(numId, codes);
          // Drain only what landed. A colour that failed stays banked so the next attempt retries
          // exactly it, and one already created is never re-sent (that would refuse as a duplicate).
          for (const code of created) seedCodes.current.delete(code);
          // The save's own invalidation already fired BEFORE these writes existed, so the seed has
          // to repeat it — same three keys the variants panel uses.
          queryClient.invalidateQueries({ queryKey: techCardKeys.detail(numId) });
          queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
          queryClient.invalidateQueries({ queryKey: techCardKeys.pipeline() });
          if (failed.length > 0) {
            setConvertReport(
              `the card IS auxiliary now and ${created.length} of ${codes.length} colour ` +
                `variant(s) were registered. Not registered: ${failed
                  .map((f) => `${f.code} — ${f.message}`)
                  .join('; ')}. ` +
                'Nothing else is pending — retry each one from «output material» on the header tab.',
            );
            showMessage('switched to auxiliary — some colours were not registered', 'error');
          } else {
            showMessage(
              `switched to auxiliary · ${created.length} colour variant(s) registered`,
              'success',
            );
          }
        }
        return;
      }
      // Two different truths, and telling them apart is the whole point of bodySaved. If the body
      // PUT landed, the card IS auxiliary now and those colourways can no longer be restored —
      // promising otherwise would send the operator to a page whose restore button refuses.
      setConvertReport(
        bodySaved
          ? `archived ${archived.length} colourway(s) (${archived.join(', ')}) and the switch to ` +
              'AUXILIARY DID save — but a staged panel did not (see the banner above; what failed is ' +
              'still staged, press Save again). The archived colourways can no longer be restored: ' +
              'the card is auxiliary now and un-archiving is refused for an auxiliary style.'
          : `archived ${archived.length} colourway(s) (${archived.join(', ')}) but the switch to ` +
              'auxiliary did NOT save — see the error above. The card is still SELLABLE, so every one ' +
              'of them can still be restored from its own page; after a successful flip that stops ' +
              'working (an auxiliary style refuses to un-archive a colourway).',
      );
    } finally {
      setConverting(false);
    }
  }

  // Surface validation failures — otherwise clicking Save with an invalid field (e.g. a tab the
  // user can't see) does nothing and looks like a broken button. Every errored field renders red on
  // its own (aria-invalid, styled once in ui/form + ui/components/input); this routine additionally
  // walks the user to the FIRST one: switch to its tab, focus it, scroll it into view, pulse it.
  const onInvalid = (errors: FieldErrors<TechCardFormData>) => {
    const flat = flattenFieldErrors(errors as FieldErrors);
    if (flat.length === 0) {
      showMessage('Проверьте поля с ошибками', 'error');
      return;
    }
    const first = flat[0];
    const tab = errorTabFor(errorRootKey(first.path));
    setActiveTab(tab);
    setFocusTarget((prev) => ({ path: first.path, nonce: (prev?.nonce ?? 0) + 1 }));
    // The toast ALWAYS carries the concrete dotted path AND the message — never just a tab name.
    // If the path has no reachable input (a container we forgot to open, a field behind a
    // permission, a schema key with no control), this line is the safety net that keeps the error
    // diagnosable instead of a dead end where Save silently does nothing.
    const tabLabel = TABS.find((t) => t.id === tab)?.label ?? tab;
    const more = flat.length > 1 ? ` (+${flat.length - 1})` : '';
    showMessage(`${tabLabel} → ${first.path} — ${first.message || 'invalid'}${more}`, 'error');
  };
  const save = () => form.handleSubmit(doSubmit, onInvalid)();

  // «keep mine & overwrite» — the conflict modal's other exit. Read the card's CURRENT version off
  // the server, then re-run the same save carrying it: the form's values are untouched, so the
  // operator's edits land on top of the other editor's, which is exactly what the button offers. The
  // old handler only closed the modal, leaving the stale version in place — every retry 409'd again
  // and the only way out was «reload theirs», discarding the work.
  const keepMineAndOverwrite = async () => {
    if (!numId) return;
    try {
      const res = await adminService.GetTechCard({ id: numId, vatCountryCode: undefined });
      lockOverride.current = res.techCard?.lockVersion ?? 0;
    } catch (error) {
      showMessage(
        techCardErrorMessage(error, 'could not read the server’s version — try saving again'),
        'error',
      );
      return;
    }
    // The header's Save button shows the spinner for this second run (form.formState.isSubmitting).
    save();
  };
  // Pass the approval override INTO the validated submit (don't mutate form state before
  // validation — on failure that would leave the card stuck in an ungated state that a later
  // plain save would persist).
  const submitWithApproval = (next: string) =>
    form.handleSubmit((data) => doSubmit({ ...data, approvalState: next }), onInvalid)();

  const saving = form.formState.isSubmitting;

  return (
    <Form {...form}>
      {/* TWO-TIER CHROME (-mx-2.5 cancels the Layout content px-2.5 so the bar spans full width).
          Row 1 is identity + the page actions. Row 2 is the card's STATE: stage, approval,
          and one chip per release blocker — each chip navigates to the tab that fixes it.
          NOT sticky — it scrolls away with the content on every screen (the left tab rail stays
          pinned so the sections remain reachable while scrolling). */}
      <div className='-mx-2.5 border-b border-borderColor bg-bgColor'>
        <div className='flex flex-wrap items-center gap-2 px-2.5 py-2'>
          <Button asChild variant='secondary' size='sm'>
            <Link to={ROUTES.techCards}>←</Link>
          </Button>
          <div className='min-w-0'>
            <Text variant='uppercase' className='truncate font-bold'>
              {styleNumber || (isEditMode ? 'tech card' : 'new tech card')}
              {name ? ` · ${name}` : ''}
            </Text>
            <Text size='micro' variant='label' className='truncate'>
              {isEditMode && techCard
                ? `v${techCard.lockVersion ?? 0} · ${formatTechCardDate(techCard.updatedAt)}`
                : 'not saved yet'}
            </Text>
          </div>

          <div className='ml-auto flex flex-wrap items-center gap-1.5'>
            {isEditMode && numId && (
              <>
                {/* Tasks moved off the page into a drawer — the tile row used to push the
                    actual spec below the fold on every single tab. */}
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() =>
                    setParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        p.set('tasks', '1');
                        return p;
                      },
                      { replace: true },
                    )
                  }
                >
                  tasks
                </Button>
                <Button asChild variant='secondary' size='sm'>
                  <Link to={`/tech-cards/${numId}/print`} target='_blank' rel='noopener'>
                    pdf
                  </Link>
                </Button>
              </>
            )}
            {canWrite(SECTION.techCards) && !frozen && isEditMode && (
              <StagedChangesChip changes={staging.changes} cardBodyDirty={form.formState.isDirty} />
            )}
            {canWrite(SECTION.techCards) &&
              (frozen ? (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase'
                  loading={saving}
                  onClick={() => submitWithApproval(DRAFT)}
                >
                  re-open to draft
                </Button>
              ) : (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase'
                  // `converting` as well as `saving`: the guided convert drives its re-save WITHOUT
                  // form.handleSubmit, so isSubmitting stays false for the whole archive→flip
                  // sequence and this button would otherwise stay live through it.
                  disabled={
                    (isEditMode && !form.formState.isDirty && staging.changes.length === 0) ||
                    saving ||
                    converting
                  }
                  loading={saving || converting}
                  onClick={save}
                >
                  {isEditMode ? 'save' : 'add'}
                </Button>
              ))}
          </div>
        </div>

        {!frozen && (
          <div className='flex flex-wrap items-center gap-1.5 border-t border-hairline px-2.5 py-1.5'>
            <div className='w-28'>
              <SelectField
                name='stage'
                label='stage'
                items={techCardStageOptions}
                disabled={frozen}
              />
            </div>
            <div className='w-32'>
              <SelectField
                name='approvalState'
                label='approval'
                items={techCardApprovalStateOptions}
                disabled={frozen}
              />
            </div>
            {canRelease ? (
              <Pill tone='ok'>ready to release</Pill>
            ) : (
              <>
                <Text size='micro' variant='label' component='span'>
                  can’t release —
                </Text>
                <ChipRow>
                  {releaseBlockers.map((b) => (
                    <Chip
                      key={b.label}
                      tone='error'
                      onClick={() => setActiveTab(b.tab)}
                      title={`fix this on the ${b.tab} tab`}
                    >
                      {b.label}
                    </Chip>
                  ))}
                </ChipRow>
              </>
            )}
            {canWrite(SECTION.techCards) && (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className='ml-auto'
                disabled={saving}
                // Enabled even when blocked: pressing it explains WHY, which is the one
                // moment the reasons are actually wanted.
                onClick={() => (canRelease ? submitWithApproval(RELEASED) : setBlockersOpen(true))}
              >
                release ▸
              </Button>
            )}
          </div>
        )}
      </div>

      {isEditMode && numId ? (
        <LifecycleStrip
          techCardId={numId}
          stage={stage}
          approvalState={approvalState}
          canEdit={canWrite(SECTION.techCards)}
          unsaved={form.formState.isDirty}
          // An auxiliary run needs somewhere to BOOK its output, and there are now two ways to have
          // one: the single output material, or at least one live colour variant (each colour owns
          // its own bucket). Only a card with neither cannot be planned. Per-variant runs are no
          // longer blocked — that refusal shipped and has since been lifted server-side.
          planRunDisabled={isAux && !outputMaterialId && liveVariants === 0}
          planRunDisabledReason='set an output material or register a colour variant before planning an auxiliary run'
          isAuxiliary={isAux}
          onGoTab={(t) => navTo(t as TabId)}
          onAddSample={() => navTo('samples', { sample: 'new' })}
          onGoFittings={(unresolvedOnly) =>
            navTo('history', unresolvedOnly ? { fits: 'unresolved' } : undefined)
          }
        />
      ) : null}

      {/* Tasks as a drawer, opened from the header and deep-linkable via ?tasks=1. */}
      {isEditMode && numId ? (
        <Drawer
          open={tasksOpen}
          onOpenChange={(o) =>
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                if (o) p.set('tasks', '1');
                else p.delete('tasks');
                return p;
              },
              { replace: true },
            )
          }
          title={`tasks · ${styleNumber || 'tech card'}`}
        >
          <TechCardTasksPanel techCardId={numId} />
        </Drawer>
      ) : null}

      {/* Why release is greyed out, on demand. Reuses the SAME blocker list the header
          chips render — one source, two views — and is the only one of the two with room
          for each row's `detail`, the server's factual reason it failed. */}
      <ReleaseBlockersModal
        blockers={releaseBlockers}
        open={blockersOpen}
        onOpenChange={setBlockersOpen}
        onGoToTab={(tab) => setActiveTab(tab as TabId)}
      />

      {/* A version conflict is not a banner — it is a decision, and continuing to edit a
          card someone else has moved only compounds the problem. Stop the page. */}
      <ConfirmationModal
        open={conflict}
        onOpenChange={setConflict}
        title='this card moved on without you'
        width='sm'
        cancelLabel='keep mine & overwrite'
        confirmLabel='reload theirs'
        onCancel={keepMineAndOverwrite}
        onConfirm={() => window.location.reload()}
      >
        <Row label='your version' value={`v${techCard?.lockVersion ?? 0} · edited here`} />
        <Row label='on the server' value='newer' />
        <Text size='micro' variant='label' className='mt-2'>
          Someone saved this card while you were editing. Reloading fetches their version and
          discards your unsaved changes; keeping yours re-reads their version number and saves your
          values straight over theirs.
        </Text>
      </ConfirmationModal>

      {/* NF-07 guided convert. Intercepts the flip BEFORE the request — the 412 it would otherwise
          come back as names the obstacle but offers no way past it. closeOnConfirm=false: the
          handler closes this itself, after the archive loop has either finished or reported. */}
      <ConfirmationModal
        open={!!convert}
        onOpenChange={(open) => !open && !converting && setConvert(null)}
        title='switch to auxiliary?'
        width='sm'
        confirmLabel={converting ? 'archiving…' : 'archive & switch'}
        cancelLabel='cancel'
        confirmDisabled={converting}
        closeOnConfirm={false}
        onConfirm={confirmConvert}
      >
        <Row label='live colourways' value={convert?.colorways.length ?? 0} />
        {(convert?.colorways ?? []).map((c) => (
          <Row key={c.colorwayId} label={colorwayLabel(c)} value='→ archive' />
        ))}
        {/* 0252: the colours survive the flip even though the colourways do not — as warehouse
            buckets rather than sellable articles. Offered here because this is the one moment the
            card's colour range is still on screen. */}
        {seedableCodes.length > 0 && (
          <label className='mt-2 flex items-start gap-1.5'>
            <input
              type='checkbox'
              checked={seedColours}
              disabled={converting}
              onChange={(e) => setSeedColours(e.target.checked)}
            />
            <Text size='micro' variant='label' component='span'>
              register each archived colourway’s colour as a colour variant (auto-creates materials)
              — {seedableCodes.join(', ')}
            </Text>
          </label>
        )}
        <Text size='micro' variant='label' className='mt-2'>
          An auxiliary card produces a material, not products — it cannot own colourways, so all{' '}
          {convert?.colorways.length ?? 0} are archived first, one by one, and then the card is
          saved as auxiliary. Archiving is not deletion: the SKU stays frozen and readable and order
          history is untouched.
        </Text>
        <Text size='micro' variant='label' className='mt-2'>
          Restoring an archived colourway works while this card is still SELLABLE — after the flip
          lands it is one-way. If a step fails, nothing is rolled back and you are told exactly
          where it stopped.
        </Text>
        <Text size='micro' variant='label' className='mt-2'>
          Live colourways are only one of the things that pin the purpose — runs, sold colourways,
          assembly usage and anything else the card is registered in do too. Archiving clears none
          of those; the server refuses them on its own and names what it found.
        </Text>
      </ConfirmationModal>

      {/* Half a convert is a fact the operator has to act on — which colourways are archived, and
          that the card did NOT flip. Stays until dismissed. */}
      {convertReport && (
        <CalloutBox tone='error' className='mt-2.5 flex flex-wrap items-center gap-2'>
          <Text size='micro'>{convertReport}</Text>
          <div className='ml-auto'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setConvertReport(null)}
            >
              dismiss
            </Button>
          </div>
        </CalloutBox>
      )}

      {/* A partial save is not a toast: some of it landed, some of it did not, and the operator has
          to decide what to do about the half that failed. It stays until the next save attempt. */}
      {stagingError && (
        <CalloutBox tone='error' className='mt-2.5 flex flex-wrap items-center gap-2'>
          <Text size='micro'>{stagingError}</Text>
          <div className='ml-auto'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setStagingError(null)}
            >
              dismiss
            </Button>
          </div>
        </CalloutBox>
      )}

      {/* Draft and frozen stay inline — they are context, not decisions. */}
      {draft.pending && (
        <CalloutBox tone='warning' className='mt-2.5 flex flex-wrap items-center gap-2'>
          <Text size='micro'>
            Найден несохранённый черновик
            {draft.pending.savedAt
              ? ` от ${new Date(draft.pending.savedAt).toLocaleString()}`
              : ''}{' '}
            — восстановить его или отбросить?
          </Text>
          <div className='ml-auto flex gap-1.5'>
            <Button type='button' variant='main' size='sm' onClick={draft.restore}>
              restore
            </Button>
            <Button type='button' variant='secondary' size='sm' onClick={draft.clear}>
              discard
            </Button>
          </div>
        </CalloutBox>
      )}

      {frozen && (
        <CalloutBox tone='note' className='mt-2.5'>
          <Text size='micro'>
            Released and frozen — the factory spec is locked. Use “Re-open to draft” to edit.
          </Text>
        </CalloutBox>
      )}

      {/* LEFT SIDEBAR RAIL + content. All 14 sections are visible at once on a laptop
          instead of scrolling sideways; the checkbox column doubles as the completion
          signal, so the old separate progress bar is gone. Below lg the rail becomes a
          horizontal scroll strip — the sidebar is a desktop affordance and the
          fitting-room phone use is real. */}
      <div className='grid gap-2.5 pt-3 lg:grid-cols-[150px_1fr]'>
        <aside
          aria-label='Tech card sections'
          className='top-16 self-start lg:sticky lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto'
        >
          <div className='flex gap-1 overflow-x-auto lg:block lg:overflow-visible'>
            {TAB_GROUPS.map((group, gi) => {
              const groupTabs = group.tabs
                .map((id) => TABS.find((t) => t.id === id)!)
                .filter((t) => isTabVisible(t.id));
              if (groupTabs.length === 0) return null;
              return (
                <div key={gi} className='flex shrink-0 items-center gap-1 lg:block'>
                  {group.band && (
                    <div className='hidden lg:block'>
                      <GroupLabel flush={gi === 0}>{group.band}</GroupLabel>
                    </div>
                  )}
                  {groupTabs.map((tab) => {
                    const active = activeTab === tab.id;
                    const errorCount = errorCountByTab.get(tab.id) ?? 0;
                    const filled = isFilled(tab.id);
                    return (
                      <button
                        key={tab.id}
                        type='button'
                        onClick={() => setActiveTab(tab.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex w-full items-center gap-1.5 border-b-2 px-2 py-1 text-left text-control whitespace-nowrap uppercase transition-colors lg:border-b-0 lg:px-0 ${
                          active
                            ? 'border-textColor font-bold text-textColor'
                            : 'border-transparent text-labelColor hover:text-textColor'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`hidden size-3.5 shrink-0 items-center justify-center border border-textColor text-nano leading-none lg:inline-flex ${
                            filled ? 'bg-textColor text-bgColor' : ''
                          }`}
                        >
                          {filled ? '✓' : ''}
                        </span>
                        <span className='min-w-0 flex-1 truncate'>{tab.label}</span>
                        {tab.id === 'issues' && openIssues > 0 && (
                          <Pill tone='mut'>{openIssues}</Pill>
                        )}
                        {errorCount > 0 && (
                          <Pill
                            tone='warn'
                            title={`${errorCount} field${errorCount > 1 ? 's' : ''} blocking save`}
                          >
                            {errorCount}
                          </Pill>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        <form className='min-w-0 pb-24' onSubmit={form.handleSubmit(doSubmit, onInvalid)}>
          <fieldset disabled={frozen} className='m-0 min-w-0 border-0 p-0'>
            {/* HEADER */}
            <SectionStack hidden={activeTab !== 'header'}>
              <SectionStack row>
                <Section title='identification' className='w-full lg:w-1/2'>
                  <StyleNumberField isIdea={isIdea} />
                  {isIdea && (
                    <Text variant='inactive' size='small'>
                      optional while this is an idea — a real style number is required before the
                      card can advance to PROTO
                    </Text>
                  )}
                  <InputField name='name' label='name *' placeholder='название изделия' />
                  <SeasonField />
                  {isEditMode && (
                    <Text variant='label' size='micro'>
                      Смена сезона перевыпускает SKU всех колорвеев стиля. Если хотя бы один уже
                      заморожен (были заказы или печатались этикетки) — сохранение будет отклонено,
                      для такого случая есть clone for season.
                    </Text>
                  )}
                  <CollectionField />
                  {/* brand sits inline with the rest of the card's identity rather than behind a
                    disclosure: it is pre-filled with GRBPWR (techCardDefaultData) and is almost
                    never changed, but hiding it made it look absent rather than defaulted. The
                    legacy freeform `status` is still not rendered — it has no downstream consumer —
                    yet its stored value round-trips, since RHF keeps the field from defaultValues
                    and the full-replace save (mapFormToTechCardInsert) sends it back verbatim. */}
                  <InputField name='brand' label='brand' />
                </Section>

                <Section title='classification' className='w-full lg:w-1/2'>
                  <SelectField name='purpose' label='purpose' items={techCardPurposeFormOptions} />
                  {/* NF-07: the server refuses a purpose flip once the card is referenced — runs,
                    LIVE colourways, sold colourways, assembly usage. Live colourways are the one arm
                    the client can see (they come back on the card), so say it here rather than let
                    the operator discover it by failing the save — and say it only about the live
                    ones, exactly as the server counts them. The other arms are known server-side
                    only; that refusal names itself, and techCardErrorMessage now passes the server's
                    own text through (it arrives as a 400 — grpc-gateway maps FailedPrecondition
                    there, not to 412). */}
                  {liveColorways.length > 0 && (
                    <Text variant='error' size='small'>
                      ! purpose is locked while {liveColorways.length} live colourway(s) are linked
                      — saving as auxiliary offers to archive them first (archived ones do not
                      count)
                    </Text>
                  )}
                  {/* 0252: the OTHER purpose lock, and the one the operator can actually clear from
                    here. A registered colour — active or retired — pins the card as auxiliary,
                    because the colour owns a warehouse bucket that a sellable card has no place for.
                    Unlike the colourway arm there is no "archive them for me" offer: deleting a
                    variant is a stock-bearing decision (see the panel's own confirm), so it stays a
                    deliberate trip to the header tab.
                    NOT gated on `isAux`: that reads the FORM, so gating on it would hide this the
                    instant the operator selects «sellable» — the one moment it is worth reading. A
                    variant can only exist on a card the server holds as auxiliary, so its presence
                    is the whole condition. */}
                  {outputVariants.length > 0 && (
                    <Text variant='error' size='small'>
                      ! purpose is locked while {outputVariants.length} colour variant(s) are
                      registered — delete them on the header tab first (a colour variant pins the
                      auxiliary purpose)
                    </Text>
                  )}
                  {/* Purpose is mutually exclusive with the output material and the save is a full
                    replace — flag the destruction BEFORE it happens, it's not reversible. There is
                    no matching warning for the other direction: a colourway links itself to a style
                    (R1), so switching to auxiliary unlinks nothing this save could destroy. */}
                  {!isAux && outputMaterialId > 0 && (
                    <Text variant='error' size='small'>
                      ! saving as sellable clears the output material
                    </Text>
                  )}
                  {/* WS7: what KIND of auxiliary item this card makes. Auxiliary-only — the dto
                    rejects a subtype on a sellable card, and the save mapper clears it on a purpose
                    flip, so hiding the control is not hiding a value that survives. Left
                    unclassified, every consumer that groups by subtype (the assembly bill's
                    component type, the labels/packaging pickers' type filter) can only file this
                    card under "unknown". */}
                  {isAux && (
                    <>
                      <SelectField
                        name='auxSubtype'
                        label='auxiliary type'
                        items={techCardAuxSubtypeFormOptions}
                      />
                      {auxSubtype === 'TECH_CARD_AUX_SUBTYPE_UNKNOWN' && (
                        <Text variant='label' size='micro'>
                          unclassified — the assembly bill and the labels/packaging pickers file
                          this card under «unknown» until a type is set
                        </Text>
                      )}
                    </>
                  )}
                  <SelectField
                    name='targetGender'
                    label='target gender'
                    items={techCardGenderOptions}
                  />
                  <SelectField
                    name='measurementUnit'
                    label='measurement unit'
                    items={techCardMeasurementUnitOptions}
                  />
                </Section>
              </SectionStack>

              {isEditMode && numId && (
                <Section title='responsible roles'>
                  <Text variant='inactive' size='small'>
                    who is on this card (Q5) — admin accounts, saved immediately, not part of the
                    card’s draft.
                  </Text>
                  <RolesField
                    techCardId={numId}
                    canEdit={canWrite(SECTION.techCards) && !frozen}
                    initialAssignments={techCard?.roleAssignments}
                  />
                </Section>
              )}

              <Section title='category & base model'>
                <HeaderMetaFields />
              </Section>

              <Section title='style facts — fit / care (shared by all colourways)'>
                <StyleFactsField
                  styleId={numId}
                  canEdit={canWrite(SECTION.techCards) && !frozen}
                  careEntries={techCard?.careEntries}
                />
              </Section>

              <Section title='concept & construction description'>
                {/* concept → details → notes is the order the tech pack's description sheet prints
                  them in, so the editor reads the same way. Concept is the one prose field an IDEA
                  card is really about, and until now nothing in this admin could write it. */}
                <TextareaField
                  name='concept'
                  label='concept (design intent)'
                  rows={3}
                  maxLength={2000}
                  placeholder='что это за вещь — идея, референс, назначение'
                />
                <DetailsEditor techCard={techCard} />
                <TextareaField name='notes' label='notes' rows={2} maxLength={2000} />
              </Section>

              {isAux ? (
                <Section title='output material'>
                  {/* 0252: once a colour is registered the card produces one bucket PER COLOUR, and
                      the single picker below stops being the answer — showing both would offer two
                      contradictory places to say where the goods land. The variants are their own
                      immediate RPC writes, so this branch needs a SAVED card; an unsaved one has no
                      id to write against and only ever sees the legacy picker. */}
                  {isEditMode && numId && outputVariants.length > 0 ? (
                    <OutputVariantsPanel
                      techCardId={numId}
                      variants={outputVariants}
                      canEdit={canWrite(SECTION.techCards)}
                    />
                  ) : (
                    <>
                      <Text variant='inactive' size='small'>
                        runs of this card receipt into material stock, not product stock. Pick the
                        packaging material this card produces (required before its first run).
                      </Text>
                      <div className='max-w-md'>
                        <MaterialPicker
                          value={outputMaterialId}
                          onChange={(mid) =>
                            form.setValue('outputMaterialId', mid, { shouldDirty: true })
                          }
                          section='TECH_CARD_BOM_SECTION_PACKAGING'
                          disabled={!canWrite(SECTION.techCards)}
                          placeholder='search packaging material'
                        />
                      </div>
                      {canWrite(SECTION.techCards) && (
                        <Button
                          type='button'
                          variant='secondary'
                          size='lg'
                          className='uppercase'
                          onClick={() => setMaterialModalOpen(true)}
                        >
                          + create material
                        </Button>
                      )}
                      {/* The way INTO per-colour mode without stranding the balance already on the
                          books: adopt this very material as the first colour rather than minting a
                          second bucket beside it. Hidden until there is something to adopt, and
                          until the card exists to hang it on. */}
                      {isEditMode && numId ? (
                        <AdoptLegacyOutputButton
                          techCardId={numId}
                          materialId={outputMaterialId}
                          canEdit={canWrite(SECTION.techCards)}
                        />
                      ) : null}
                    </>
                  )}
                </Section>
              ) : (
                <Section title='linked products'>
                  <ProductIdsField />
                </Section>
              )}
            </SectionStack>

            {/* SKETCH */}
            <div hidden={activeTab !== 'sketch'}>
              <SketchTab techCard={techCard} view='sketch' />
            </div>

            <div hidden={activeTab !== 'moodboard'}>
              <SketchTab techCard={techCard} view='moodboard' />
            </div>

            {/* PATTERNS (size range + DXF выкройки по материалам) */}
            <SectionStack hidden={activeTab !== 'patterns'}>
              <Section title='size range'>
                {/* The colourways AS READ: their recipes grade per-size consumption, and that is
                    what makes removing a size destructive beyond this form. */}
                <SizeIdsField colorways={techCard?.colorways} />
                <div className='space-y-2 border-t border-textInactiveColor pt-3'>
                  <Text variant='uppercase' size='small'>
                    size run (order qty)
                  </Text>
                  <SizeQuantitiesField />
                </div>
              </Section>
              <Section title='размерная таблица (межурменты) — общая для всех колорвеев стиля'>
                <SizeChartField styleId={numId} canEdit={canWrite(SECTION.techCards) && !frozen} />
              </Section>
              <Section title='выкройки (DXF) — по материалам'>
                <PatternsField
                  techCardId={numId || undefined}
                  // Разбор DXF стартует сам, но только на ОТКРЫТОЙ вкладке: этот SectionStack
                  // смонтирован всегда и прячется через `hidden`, так что без явного ответа
                  // карточка качала бы все выкройки всякому, кто зашёл править BOM.
                  active={activeTab === 'patterns'}
                  canEdit={canWrite(SECTION.techCards) && !frozen}
                  // БЕЗ `&& !frozen`, и это не описка: индекс размеров описывает ФАЙЛЫ, а не
                  // редактируемое содержимое карточки, и нужен он именно на замороженной — с неё
                  // запускают прогоны, её и судит гейт готовности.
                  canPublishIndex={canWrite(SECTION.techCards)}
                  savedSizeIds={techCard?.techCard?.sizeIds ?? undefined}
                />
              </Section>
              {/* Cut pieces sit directly under the sheets they come out of: «↔ детали кроя» on the
                  panel above creates them, and until now it wrote into a table on another tab. Its
                  own block, not a nested one — a block never contains a block (DESIGN.md). Mounted
                  ONCE for every card shape, so there is exactly one useFieldArray('pieces') and one
                  set of [data-field] anchors for revealField to walk to. */}
              <PiecesTab techCard={techCard} active={activeTab === 'patterns'} />
              {/* The cut list is the projection of the block directly above it: it is derived
                  entirely from the cut pieces, the size range and the per-colourway fabric map, and
                  the first two now live on THIS tab. It used to close the construction tab, which
                  put the output two tabs away from its inputs. Here the operator's flow finally
                  runs in one place — upload DXF → match blocks to pieces → see the piece list →
                  see what will actually be cut — instead of jumping tabs to read the answer.
                  A peer Section, not nested inside the pieces block: a block never contains a
                  block (DESIGN.md). Mount semantics are unchanged — this SectionStack, like the
                  construction one, is display:none-hidden with its children MOUNTED, so
                  useStyleCutList still fires once on a saved card and no fetch is gained or lost.
                  Guarded by isEditMode && numId exactly as before: without a saved id the query is
                  disabled and the table would have nothing to project. */}
              {isEditMode && numId && (
                <Section title='cut list (production projection)'>
                  <CutListField techCardId={numId} />
                </Section>
              )}
              <Section title='раскладки (маркеры) — расход ткани по размерам'>
                <MarkersSection
                  techCard={techCard}
                  techCardId={numId || 0}
                  canEdit={canWrite(SECTION.techCards) && !frozen}
                />
              </Section>
            </SectionStack>

            {/* BOM */}
            <div hidden={activeTab !== 'bom'}>
              <Section title='bill of materials — справочник артикулов'>
                {/* Structured style fibre composition (S17/M1) — typed composition_entries, read-only. */}
                {(techCard?.compositionEntries?.length ?? 0) > 0 && (
                  <div className='border-b border-textInactiveColor pb-3'>
                    <CompositionEntries
                      entries={techCard?.compositionEntries}
                      label='style fibre composition'
                    />
                  </div>
                )}
                {/* The colourways as READ: their recipes are the one reference to a BOM article
                    this form cannot clear itself, so the delete has to check them first. */}
                <BomField highlightComposition={bomHighlight} colorways={techCard?.colorways} />
              </Section>
            </div>

            {/* COLORWAYS — per colourway, which article each piece is cut from, in what colour and
                at what consumption. The pieces THEMSELVES are on the patterns tab: a piece belongs
                to the pattern, not to a colour, and every colourway cuts the same ones. What is
                genuinely per-colourway is this map, and the recipe editor's placement picker offers
                exactly the pieces defined there. */}
            {/* CONDITIONAL, not merely hidden: SectionStack's `hidden` is a display:none attribute
                and every child stays MOUNTED. Left as a hidden-only branch for an aux card this
                would keep ColorwayRecipes alive fetching the whole material catalogue for a card
                that can never have a colourway. */}
            <SectionStack hidden={activeTab !== 'colorways' || isAux}>
              {!isAux && (
                <div>
                  {isEditMode && numId ? (
                    <ColorwayRecipes
                      techCard={techCard}
                      techCardId={numId}
                      canEdit={canWrite(SECTION.techCards) && !frozen}
                    />
                  ) : (
                    <Text variant='inactive' size='small'>
                      save the card first — colourways are products; their material recipes are
                      edited here once the style exists.
                    </Text>
                  )}
                </div>
              )}
            </SectionStack>

            {/* CONSTRUCTION — how it's made: the assembly map and the operations. The cut list used
                to close this tab; it moved to PATTERNS, next to the cut pieces it is derived from. */}
            <SectionStack hidden={activeTab !== 'construction'}>
              {/* No PiecesTab branch here any more. It used to be mounted for an AUXILIARY card,
                  whose colourways tab (the pieces' old home) does not exist — two conditional mounts
                  of one field array, which is exactly the shape that made a piece created from the
                  DXF dialog land in the copy nobody was looking at. Cut pieces are on PATTERNS now,
                  a tab every card has, so the whole special case is gone. */}
              <ConstructionTab techCard={techCard} />
            </SectionStack>

            {/* LABELS & PACKAGING */}
            <SectionStack hidden={activeTab !== 'labels'}>
              <SectionStack row>
                <Section title='labels' className='w-full lg:w-1/2'>
                  <LabelsField onMissingComposition={goToBomComposition} />
                </Section>
                <Section title='packaging' className='w-full lg:w-1/2'>
                  <PackagingField />
                </Section>
              </SectionStack>
              {/* Assembly bill + packaging recipe are per-style, managed via their own RPCs — they
                need a saved card id. For a brand-new card, prompt to Save (which lands back here)
                instead of silently hiding them, so the user is never left wondering. */}
              {isEditMode && numId ? (
                <>
                  <Section title='assembly — on-garment items (labels / tags)'>
                    <AssemblyField
                      styleId={numId}
                      sizeIds={(sizeIdsW as number[] | undefined) ?? []}
                      canEdit={canWrite(SECTION.techCards) && !frozen}
                    />
                  </Section>
                  <Section title='packaging recipe'>
                    <PackagingRecipeField
                      techCardId={numId}
                      canEdit={canWrite(SECTION.techCards) && !frozen}
                    />
                  </Section>
                </>
              ) : (
                <Section title='on-garment items, packaging & the dust bag'>
                  <PreSavePrompt
                    canWrite={canWrite(SECTION.techCards)}
                    saving={saving}
                    onSave={save}
                  />
                </Section>
              )}
            </SectionStack>

            {/* COSTING — mounted only with costing:read (field-shaped) */}
            {canReadCosting && (
              <SectionStack hidden={activeTab !== 'costing'}>
                <Section title='costing'>
                  {/* Costing gap at the point of action. The tech-card payload only carries the plan
                    costing rollup (not each colorway's product cost_price), so this is a style-level
                    signal; per-colorway precision lives on each product's detail page. */}
                  {!(
                    techCard?.techCard?.costing?.unitCost?.value ||
                    techCard?.techCard?.costing?.materialsPerUnit?.value ||
                    (techCard?.techCard?.costing?.colorwayCosts?.length ?? 0) > 0 ||
                    (techCard?.techCard?.costing?.materialsTotal?.length ?? 0) > 0
                  ) && (
                    <CalloutBox tone='warning' className='mb-2.5'>
                      <Text size='micro'>
                        No costing set for this style — margin, break-even and economics cannot be
                        computed for its colorways, and its sold products count as uncosted in
                        analytics (lowering store-wide cost coverage). Add materials or costs below.
                      </Text>
                    </CalloutBox>
                  )}
                  <CostingField techCard={techCard} />
                </Section>
                {isEditMode && numId && (
                  <Section title='cost estimate (per colourway — plan vs actual)'>
                    <CostEstimateField techCardId={numId} techCard={techCard} />
                  </Section>
                )}
                {/* R&D / development spend — folded in from its own tab: a section OF costing, not a
                  separate rail entry. Placed after the unit-cost blocks because it is amortised
                  style dev cost, deliberately NOT part of the product COGS. Edit-mode only (its own
                  RPC needs a saved card id). */}
                <Section title='R&D development cost'>
                  {/* Plan 11 band 6: the one label that stops R&D being priced into garments. */}
                  <Text size='micro' variant='label'>
                    периодные затраты разработки стиля — НЕ входят в unit cost / COGS; выше они
                    только как «сколько маржа должна отбить» (break-even).
                  </Text>
                  {isEditMode && numId ? (
                    <DevExpensesField techCardId={numId} />
                  ) : (
                    <Text variant='inactive' size='small'>
                      save this tech card first, then you can log development costs
                    </Text>
                  )}
                </Section>
              </SectionStack>
            )}

            {/* ISSUES */}
            <div hidden={activeTab !== 'issues'}>
              <div>
                <IssuesField />
              </div>
            </div>

            {/* SIGN-OFF */}
            <div hidden={activeTab !== 'signoff'}>
              <div>
                <SignoffsField />
              </div>
            </div>

            {/* HISTORY */}
            <SectionStack hidden={activeTab !== 'history'}>
              <div>
                {isEditMode && numId ? (
                  <TechCardFittings techCardId={numId} />
                ) : (
                  <Text variant='inactive' size='small'>
                    save this tech card first, then you can link fittings to it
                  </Text>
                )}
              </div>
              <div>
                <RevisionsField revisions={techCard?.revisions} />
              </div>
              <div>
                {isEditMode && numId ? (
                  // `create release` moved INTO ReleasesField's own header via the `gate`
                  // prop, so the button sits with the list it appends to and shares one
                  // blockers modal with the page header instead of a second `title` tooltip.
                  <ReleasesField
                    techCardId={numId}
                    gate={
                      canWrite(SECTION.techCards) && !frozen
                        ? {
                            blockers: releaseBlockers,
                            onRelease: () => submitWithApproval(RELEASED),
                            onGoToTab: (tab: string) => setActiveTab(tab as TabId),
                            saving,
                          }
                        : undefined
                    }
                  />
                ) : (
                  <Text variant='inactive' size='small'>
                    a frozen Rev.N snapshot is created when the card is saved as “released”
                  </Text>
                )}
              </div>
            </SectionStack>
          </fieldset>

          {/* SAMPLES — edit-mode only (needs a saved card id). OUTSIDE the frozen fieldset: a
            released card must still allow reading — paging the material ledger, opening/closing
            sample rows — so editing is gated explicitly instead of by the disabled fieldset
            (which killed every native button, read paths included). */}
          {isEditMode && numId ? (
            <div hidden={activeTab !== 'samples'}>
              <div>
                <SamplesTab
                  techCardId={numId}
                  techCard={techCard}
                  canEdit={canWrite(SECTION.techCards) && !frozen}
                  canReadCosting={canReadCosting}
                />
              </div>
            </div>
          ) : null}

          {/* PRODUCTION — outside the frozen fieldset for the same reason samples is: a RELEASED
            card is exactly when batches get planned, and the disabled fieldset would kill the
            create-run link along with every other native control. The one field here that the
            server's freeze really does govern (the drop date) is gated explicitly instead. */}
          {isEditMode && numId ? (
            <div hidden={activeTab !== 'production'}>
              <ProductionTab
                techCardId={numId}
                techCard={techCard}
                canEdit={canWrite(SECTION.techCards)}
                canReadCosting={canReadCosting}
                frozen={frozen}
              />
            </div>
          ) : null}
        </form>
      </div>

      {/* Create a packaging material inline for the aux output picker (prefilled section). The
          created material is selected straight into the field the button sits under — without
          onCreated the operator filled a whole material form and landed back on an empty picker,
          then had to search for the thing they had just made. shouldDirty so Save lights up: the
          selection is a change to the CARD, which the material's own create did not persist.
          `defaultSection` is only a DEFAULT — the modal's class/section controls stay live, so the
          operator can create a fabric here. Auto-selecting that would pin an id the picker beside it
          (filtered to packaging) cannot even render, leaving the field looking empty while holding a
          value; so the selection is gated on what was actually created, and says why when it isn't. */}
      <MaterialModal
        open={materialModalOpen}
        onOpenChange={setMaterialModalOpen}
        defaultSection='TECH_CARD_BOM_SECTION_PACKAGING'
        onCreated={(newId, material) => {
          if (material.section !== 'TECH_CARD_BOM_SECTION_PACKAGING') {
            showMessage(
              `«${material.name || 'material'}» created, but an aux card outputs a PACKAGING material — not selected`,
              'error',
            );
            return;
          }
          form.setValue('outputMaterialId', newId, { shouldDirty: true });
        }}
      />
    </Form>
  );
}
