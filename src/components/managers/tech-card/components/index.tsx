import { zodResolver } from '@hookform/resolvers/zod';
import { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
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
  techCardGenderOptions,
  techCardMeasurementUnitOptions,
  techCardPurposeOptions,
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
import { useEffect, useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
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
import { PackagingField } from './packaging-field';
import { PatternsField } from './patterns-field';
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
} from './schema';
import { SamplesTab } from './samples-tab';
import { SizeIdsField } from './size-ids-field';
import { SizeChartField } from './size-chart-field';
import { StyleFactsField } from './style-facts-field';
import { TechCardFittings } from './tech-card-fittings';
import { useTechCardDraft } from './useTechCardDraft';

const TABS = [
  { id: 'header', label: 'header' },
  { id: 'sketch', label: 'sketch' },
  { id: 'moodboard', label: 'moodboard' },
  { id: 'patterns', label: 'patterns' },
  { id: 'samples', label: 'samples' },
  { id: 'bom', label: 'BOM' },
  { id: 'colorways', label: 'colorways' },
  { id: 'pieces', label: 'pieces' },
  { id: 'construction', label: 'construction' },
  { id: 'labels', label: 'labels & pkg' },
  { id: 'costing', label: 'costing' },
  { id: 'issues', label: 'issues' },
  { id: 'signoff', label: 'sign-off' },
  { id: 'history', label: 'history' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Tabs grouped into lifecycle bands so the rail reads at a glance (R-2): DESIGN what it is,
// DEVELOP how it's made, SPEC what ships. History stands alone.
const TAB_GROUPS: { band: string; tabs: TabId[] }[] = [
  { band: 'design', tabs: ['header', 'sketch', 'moodboard', 'patterns'] },
  { band: 'develop', tabs: ['samples', 'bom', 'colorways', 'pieces', 'construction'] },
  { band: 'spec', tabs: ['labels', 'costing', 'issues', 'signoff'] },
  { band: '', tabs: ['history'] },
];

// Maps a form-error root key to the tab that owns it; unmapped keys are header fields.
const ERROR_TAB: Record<string, TabId> = {
  moodboardMedia: 'moodboard',
  technicalMedia: 'sketch',
  callouts: 'sketch',
  patterns: 'patterns',
  sizeIds: 'patterns',
  sizeQuantities: 'patterns',
  bomItems: 'bom',
  colorways: 'colorways',
  pieces: 'pieces',
  details: 'header',
  construction: 'construction',
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

// A section is a RULE, not a box. The old version wrapped every block in
// `border p-4` + a large title, which nested a box inside the page's own panel and
// was the single biggest visual difference from the reference. Blocks whose child
// component now renders its own <SectionHeader> are not wrapped at all.
function Section({
  title,
  question,
  className,
  children,
}: {
  title: string;
  question?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`space-y-2.5 ${className ?? ''}`}>
      <SectionHeader title={title} question={question} />
      {children}
    </section>
  );
}

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

  // Switching tabs drops a stale ?sample= / ?fits=; extra params (a sample to open, a fittings
  // filter) can be set in the same navigation (spine deep links).
  // The old R&D-cost tab folded into costing (dev-expenses is now a costing section) — resolve a
  // legacy ?tab=dev link straight to costing so shared links still land on the right place.
  const rawTab = params.get('tab');
  const tabParam = rawTab === 'dev' ? 'costing' : rawTab;
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
  // Release freezes the card as the factory-facing spec, so what it takes is stated once, below.
  // The old M8/M3 gap note is gone with the guesswork it described: colourway lab-dip approval could
  // never be gated here (the read model exposes no labDipStatus — the field lives only on the
  // write-only ColorwayDevelopmentInsert), and the readiness RPC now scores it server-side.
  const bomItemsW = (useWatch({ control: form.control, name: 'bomItems' }) ?? []) as Array<{
    materialId?: number;
  }>;
  // ONE release-blocker list, rendered three ways (header chips, the blockers modal, the
  // ReleasesField gate). Its spine is now the SERVER's release checklist — `releaseRequirements`
  // from GetTechCardReadiness — which knows things this screen never could (costing currency, an
  // unapproved lab dip, an empty size range) and phrases each failure as a fact.
  // Server rows are scored against SAVED data, so a fix made in the form counts once it is saved.
  // That is the right reading here: release freezes the saved spec as the factory-facing document.
  // Each blocker still carries the tab that fixes it, so every rendering navigates identically.
  const serverReleaseRows = readiness?.releaseRequirements ?? [];
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
  // #64: every BOM article must link a catalog material before the card can be released — moved
  // here (was a hard zod error on every save; see schema.ts superRefine) so a legacy free-text BOM
  // line no longer blocks routine saves / sign-off recording, only release. The server scores this
  // one on the PP stage checklist, not on release, so it stays a client rule and is no duplicate.
  if (bomItemsW.some((b) => !(b.materialId && b.materialId > 0)))
    releaseBlockers.push({ label: 'link a catalog material on every BOM line', tab: 'bom' });
  // Sign-offs are the one rule both sides know, and the server states it better ("2 of 5 sign-offs
  // are not approved"). The form-derived check survives ONLY as the fallback for a checklist that
  // has not arrived (in flight, or the call failed): an advisory RPC must never WIDEN the gate.
  if (serverReleaseRows.length === 0 && !signoffsApproved)
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
  const productCount = (useWatch({ control: form.control, name: 'productIds' }) ?? []).length;

  // NF-07 auxiliary items: an aux card produces a packaging material, links no products, and needs
  // an output material set before its first run.
  const purpose = (useWatch({ control: form.control, name: 'purpose' }) ?? 'sellable') as string;
  const outputMaterialId = (useWatch({ control: form.control, name: 'outputMaterialId' }) ??
    0) as number;
  const isAux = purpose === 'auxiliary';
  const [materialModalOpen, setMaterialModalOpen] = useState(false);

  // Autosave the working draft to localStorage (Q9b): leaving the route (to /materials, /fitting,
  // the product manager) or a hard refresh no longer loses unsaved edits — restore on return.
  const draftKey = isEditMode ? `edit.${numId ?? id ?? '0'}` : 'new';
  const draft = useTechCardDraft(form, draftKey, canWrite(SECTION.techCards) && !frozen);

  // Section-completion progress (Q9): a visible "how filled is this card" signal, per tab + overall.
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const moodboardMedia = useWatch({ control: form.control, name: 'moodboardMedia' });
  const technicalMedia = useWatch({ control: form.control, name: 'technicalMedia' });
  const sizeIdsW = useWatch({ control: form.control, name: 'sizeIds' });
  const piecesW = useWatch({ control: form.control, name: 'pieces' });
  const operationsW = useWatch({ control: form.control, name: 'operations' });
  const labelsW = useWatch({ control: form.control, name: 'labels' });
  // Which tabs count toward "the card's core spec is filled", and whether each currently has content.
  const sectionFilled: Partial<Record<TabId, boolean>> = {
    header: !!name?.trim() && (stage === 'TECH_CARD_STAGE_IDEA' || !!styleNumber?.trim()),
    sketch: len(technicalMedia) > 0,
    moodboard: len(moodboardMedia) > 0,
    patterns: len(sizeIdsW) > 0,
    bom: len(bomItemsW) > 0,
    // colourways are products, read from techCard.colorways (the RHF `colorways` array is always []).
    colorways: (techCard?.colorways?.length ?? 0) > 0,
    pieces: len(piecesW) > 0,
    construction: len(operationsW) > 0,
    labels: len(labelsW) > 0,
    // "filled" = actually signed off, not merely present — 7 REJECTED rows must not read as done (M10).
    signoff: signoffsApproved,
  };
  const isFilled = (t: TabId) => sectionFilled[t] === true;

  // Full dotted paths, not root keys: `bomItems.3.name` used to collapse to `bomItems`, so the rail
  // could only ever say "something on the BOM tab is wrong" and the count was always 1 per tab.
  const flatErrors = flattenFieldErrors(form.formState.errors as FieldErrors);
  const errorCountByTab = new Map<TabId, number>();
  for (const e of flatErrors) {
    const tab = ERROR_TAB[errorRootKey(e.path)] ?? 'header';
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
    if (isIdea && !IDEA_TABS.includes(t)) return errorTabs.has(t);
    if (t === 'costing' && !canReadCosting) return false;
    if (t === 'samples' && !isEditMode) return false;
    return true;
  };
  // Rewrite a legacy ?tab=dev to ?tab=costing so the URL matches the folded tab (the alias above
  // already renders costing; this cleans the address bar / a bookmarked deep link).
  useEffect(() => {
    if (rawTab === 'dev') navTo('costing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab]);
  // If the open tab becomes hidden (switching a card to IDEA while on the BOM tab, or permissions
  // resolving and taking the costing tab away), fall back to header so the body isn't blank.
  useEffect(() => {
    if (!isTabVisible(activeTab)) navTo('header');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isIdea, canReadCosting, isEditMode]);

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

  async function doSubmit(data: TechCardFormData) {
    setConflict(false);
    const techCardInsert = mapFormToTechCardInsert(data, techCard?.techCard, canWriteCosting);
    try {
      if (isEditMode) {
        await updateTechCard.mutateAsync({
          id: parseInt(id || '0', 10),
          techCard: techCardInsert,
          expectedLockVersion: techCard?.lockVersion ?? 0,
        });
        showMessage('tech card updated', 'success');
        draft.clear();
        form.reset(data);
      } else {
        const created = await createTechCard.mutateAsync(techCardInsert);
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
    } catch (error) {
      if ((error as { status?: number })?.status === 409) setConflict(true);
      // Pin server field-violations (google.rpc.BadRequest) onto the exact inputs, then surface the
      // owning tab so the error dot + focus land where the user can act (Q1/S24).
      const { applied, unmapped } = applyServerFieldErrors(error, form.setError, {
        stripPrefixes: ['tech_card'],
      });
      if (applied.length > 0) {
        const root = applied[0].split('.')[0];
        setActiveTab(ERROR_TAB[root] ?? 'header');
      }
      const base = techCardErrorMessage(error, 'Failed to submit tech card');
      showMessage(
        unmapped.length ? `${base} — ${unmapped.map((u) => u.description).join('; ')}` : base,
        'error',
      );
      console.error('Failed to submit tech card', error);
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
    const tab = ERROR_TAB[errorRootKey(first.path)] ?? 'header';
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
  // Pass the approval override INTO the validated submit (don't mutate form state before
  // validation — on failure that would leave the card stuck in an ungated state that a later
  // plain save would persist).
  const submitWithApproval = (next: string) =>
    form.handleSubmit((data) => doSubmit({ ...data, approvalState: next }), onInvalid)();

  const saving = form.formState.isSubmitting;

  return (
    <Form {...form}>
      {/* TWO-TIER STICKY CHROME (top-16 clears the fixed Layout nav; -mx-2.5 cancels the
          Layout content px-2.5 so the bar spans full width).
          Row 1 is identity + the page actions. Row 2 is the card's STATE: stage, approval,
          and one chip per release blocker — each chip navigates to the tab that fixes it.
          The blockers used to live only in a `title` on a disabled button: invisible on
          touch, unreadable by a screen reader, and gone the moment you looked away. */}
      <div className='sticky top-16 z-30 -mx-2.5 border-b border-borderColor bg-bgColor'>
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
                  disabled={(isEditMode && !form.formState.isDirty) || saving}
                  loading={saving}
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
          planRunDisabled={isAux && !outputMaterialId}
          planRunDisabledReason='set an output material before planning an auxiliary run'
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
        onCancel={() => setConflict(false)}
        onConfirm={() => window.location.reload()}
      >
        <Row label='your version' value={`v${techCard?.lockVersion ?? 0} · edited here`} />
        <Row label='on the server' value='newer' />
        <Text size='micro' variant='label' className='mt-2'>
          Someone saved this card while you were editing. Reloading fetches their version and
          discards your unsaved changes; keeping yours will overwrite theirs on the next save.
        </Text>
      </ConfirmationModal>

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
          className='top-40 self-start lg:sticky lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto'
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
            <div hidden={activeTab !== 'header'} className='flex flex-col gap-6'>
              <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
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
                  <SelectField name='purpose' label='purpose' items={techCardPurposeOptions} />
                  {/* Purpose is mutually exclusive with the other side's links and the save is a
                    full replace — flag the destruction BEFORE it happens, it's not reversible. */}
                  {isAux && productCount > 0 && (
                    <Text variant='error' size='small'>
                      ! saving as auxiliary permanently unlinks {productCount} linked product
                      {productCount > 1 ? 's' : ''}
                    </Text>
                  )}
                  {!isAux && outputMaterialId > 0 && (
                    <Text variant='error' size='small'>
                      ! saving as sellable clears the output material
                    </Text>
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
              </div>

              {isEditMode && numId && (
                <Section title='responsible roles'>
                  <Text variant='inactive' size='small'>
                    who is on this card (Q5) — admin accounts, saved immediately, not part of the
                    card’s draft.
                  </Text>
                  <RolesField techCardId={numId} canEdit={canWrite(SECTION.techCards) && !frozen} />
                </Section>
              )}

              <Section title='category & base model'>
                <HeaderMetaFields />
              </Section>

              <Section title='style facts — fit / care (shared by all colourways)'>
                <StyleFactsField styleId={numId} canEdit={canWrite(SECTION.techCards) && !frozen} />
              </Section>

              <Section title='construction description'>
                <DetailsEditor techCard={techCard} />
                <TextareaField name='notes' label='notes' rows={2} maxLength={2000} />
              </Section>

              {isAux ? (
                <Section title='output material'>
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
                </Section>
              ) : (
                <Section title='linked products'>
                  <ProductIdsField />
                </Section>
              )}
            </div>

            {/* SKETCH */}
            <div hidden={activeTab !== 'sketch'}>
              <SketchTab techCard={techCard} view='sketch' />
            </div>

            <div hidden={activeTab !== 'moodboard'}>
              <SketchTab techCard={techCard} view='moodboard' />
            </div>

            {/* PATTERNS (size range + per-size PDF выкройки) */}
            <div hidden={activeTab !== 'patterns'} className='flex flex-col gap-6'>
              <Section title='size range'>
                <SizeIdsField />
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
              <Section title='выкройки (PDF) — по размерам'>
                <PatternsField />
              </Section>
            </div>

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
                <BomField highlightComposition={bomHighlight} />
              </Section>
            </div>

            {/* COLORWAYS — рецепты: какой артикул на какую часть, цвет и расход (colourway-owned) */}
            <div hidden={activeTab !== 'colorways'}>
              <div>
                {isEditMode && numId ? (
                  <ColorwayRecipes
                    techCard={techCard}
                    techCardId={numId}
                    canEdit={canWrite(SECTION.techCards) && !frozen}
                  />
                ) : (
                  <Text variant='inactive' size='small'>
                    save the card first — colourways are products; their material recipes are edited
                    here once the style exists.
                  </Text>
                )}
              </div>
            </div>

            {/* PIECES — cut-piece details + fabric map (NF-05) + production cut-list projection */}
            <div hidden={activeTab !== 'pieces'} className='flex flex-col gap-6'>
              <PiecesTab techCard={techCard} />
              {isEditMode && numId && (
                <Section title='cut list (production projection — mirror ×2 folded)'>
                  <CutListField techCardId={numId} />
                </Section>
              )}
            </div>

            {/* CONSTRUCTION */}
            <div hidden={activeTab !== 'construction'}>
              <ConstructionTab techCard={techCard} />
            </div>

            {/* LABELS & PACKAGING */}
            <div hidden={activeTab !== 'labels'} className='flex flex-col gap-6'>
              <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
                <Section title='labels' className='w-full lg:w-1/2'>
                  <LabelsField onMissingComposition={goToBomComposition} />
                </Section>
                <Section title='packaging' className='w-full lg:w-1/2'>
                  <PackagingField />
                </Section>
              </div>
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
                  <Section title='packaging recipe (materials per order / item · dust bag)'>
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
            </div>

            {/* COSTING — mounted only with costing:read (field-shaped) */}
            {canReadCosting && (
              <div hidden={activeTab !== 'costing'} className='flex flex-col gap-6'>
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
                  {isEditMode && numId ? (
                    <DevExpensesField techCardId={numId} />
                  ) : (
                    <Text variant='inactive' size='small'>
                      save this tech card first, then you can log development costs
                    </Text>
                  )}
                </Section>
              </div>
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
            <div hidden={activeTab !== 'history'} className='flex flex-col gap-6'>
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
            </div>
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
        </form>
      </div>

      {/* Create a packaging material inline for the aux output picker (prefilled section). */}
      <MaterialModal
        open={materialModalOpen}
        onOpenChange={setMaterialModalOpen}
        defaultSection='TECH_CARD_BOM_SECTION_PACKAGING'
      />
    </Form>
  );
}
