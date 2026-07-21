import { zodResolver } from '@hookform/resolvers/zod';
import { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { StyleEconomicsModal } from 'components/managers/page/components/StyleEconomicsModal';
import {
  useCreateTechCard,
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

const RELEASED = 'TECH_CARD_APPROVAL_STATE_RELEASED';
const DRAFT = 'TECH_CARD_APPROVAL_STATE_DRAFT';
const SIGNOFF_APPROVED = 'TECH_CARD_SIGNOFF_STATE_APPROVED';

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`space-y-4 border border-textInactiveColor p-4 ${className ?? ''}`}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
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
  const [econOpen, setEconOpen] = useState(false);

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
  // drives the Release gate. Lab-dips must all be approved to release (empty = allowed).
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

  // Lifecycle spine inputs: current stage/approval drive the stepper + next-hint; linked-product
  // count feeds the counter row.
  const stage = (useWatch({ control: form.control, name: 'stage' }) ?? '') as string;
  const isIdea = stage === 'TECH_CARD_STAGE_IDEA';
  // Release freezes the card as the factory-facing spec. Gate on real, readable state: not an IDEA
  // draft, every sign-off section APPROVED (M10) and zero open issues (M10) — and surface WHY it's
  // blocked in the button tooltip.
  // BACKEND GAP (M8/M3): colourway lab-dip approval is intentionally NOT gated here — the tech-card
  // read model (techCard.colorways → AdminColorwayRef) exposes no labDipStatus to read (the lab-dip
  // fields live only on the write-only ColorwayDevelopmentInsert). The old check ran over the RHF
  // `colorways` array, which is permanently [] (vacuously true); switching it to
  // AdminColorwayRef.labDipStatus (always undefined) would permanently block release instead. Lab-dip
  // gating is deferred until the backend surfaces lab-dip on the read path (see report).
  const bomItemsW = (useWatch({ control: form.control, name: 'bomItems' }) ?? []) as Array<{
    materialId?: number;
  }>;
  const releaseBlockers: string[] = [];
  if (isIdea) releaseBlockers.push('advance the stage (an IDEA draft can’t be released)');
  if (!signoffsApproved)
    releaseBlockers.push(
      signoffs.length === 0
        ? 'sign off every required section first'
        : 'every sign-off section must be APPROVED',
    );
  if (openIssues > 0)
    releaseBlockers.push(`resolve ${openIssues} open issue${openIssues > 1 ? 's' : ''}`);
  // #64: every BOM article must link a catalog material before the card can be released — moved
  // here (was a hard zod error on every save; see schema.ts superRefine) so a legacy free-text BOM
  // line no longer blocks routine saves / sign-off recording, only release.
  if (bomItemsW.some((b) => !(b.materialId && b.materialId > 0)))
    releaseBlockers.push('link a catalog material on every BOM line');
  const canRelease = releaseBlockers.length === 0;
  const releaseBlockedReason = releaseBlockers.join('; ');
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
  const coreSections: TabId[] = ['header', 'sketch', 'bom', 'colorways', 'construction'];
  const filledCore = coreSections.filter(isFilled).length;
  const progressPct = Math.round((filledCore / coreSections.length) * 100);

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
      {/* sticky lifecycle bar + tabs as one block (top-16 clears the fixed Layout nav;
          -mx-2.5 cancels the Layout content px-2.5 so the bar spans full width) */}
      <div className='sticky top-16 z-30 -mx-2.5 bg-bgColor'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor px-2.5 py-2'>
          <div className='flex min-w-0 items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.techCards}>←</Link>
            </Button>
            <div className='min-w-0'>
              <Text variant='uppercase' className='truncate'>
                {styleNumber || (isEditMode ? 'tech card' : 'new tech card')}
              </Text>
              <Text variant='inactive' size='small' className='truncate'>
                {name || '—'}
                {isEditMode && techCard
                  ? ` · v${techCard.lockVersion ?? 0} · ${formatTechCardDate(techCard.updatedAt)}`
                  : ''}
              </Text>
            </div>
          </div>

          <div className='flex flex-wrap items-end gap-2'>
            <div className='w-32'>
              <SelectField
                name='stage'
                label='stage'
                items={techCardStageOptions}
                disabled={frozen}
              />
            </div>
            <div className='w-36'>
              <SelectField
                name='approvalState'
                label='approval'
                items={techCardApprovalStateOptions}
                disabled={frozen}
              />
            </div>
            {isEditMode && numId && (
              <Button asChild variant='secondary' size='lg' className='uppercase'>
                <Link to={`/tech-cards/${numId}/print`} target='_blank' rel='noopener'>
                  pdf
                </Link>
              </Button>
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
                <>
                  <Button
                    type='button'
                    variant='secondary'
                    size='lg'
                    className='uppercase'
                    title={canRelease ? '' : `Can’t release — ${releaseBlockedReason}`}
                    disabled={!canRelease || saving}
                    onClick={() => submitWithApproval(RELEASED)}
                  >
                    release ▸
                  </Button>
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
                </>
              ))}
          </div>
        </div>

        <nav
          className='flex items-center gap-1 overflow-x-auto border-b border-textInactiveColor px-2.5'
          aria-label='Tech card sections'
        >
          {TAB_GROUPS.map((group, gi) => {
            const groupTabs = group.tabs
              .map((id) => TABS.find((t) => t.id === id)!)
              .filter((t) => isTabVisible(t.id));
            if (groupTabs.length === 0) return null;
            return (
              <div key={gi} className='flex items-center'>
                {gi > 0 && <span className='mx-1 h-4 w-px bg-textInactiveColor' aria-hidden />}
                {group.band && (
                  <Text variant='inactive' size='small' className='px-1 uppercase'>
                    {group.band}
                  </Text>
                )}
                {groupTabs.map((tab) => {
                  const active = activeTab === tab.id;
                  const errorCount = errorCountByTab.get(tab.id) ?? 0;
                  return (
                    <button
                      key={tab.id}
                      type='button'
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-textBaseSize uppercase transition-colors ${
                        active
                          ? 'border-textInactiveColor text-textColor'
                          : 'border-transparent text-textInactiveColor hover:text-textColor'
                      }`}
                    >
                      {tab.label}
                      {tab.id === 'issues' && openIssues > 0 && (
                        <span className='border border-textInactiveColor px-1 text-textBaseSize leading-none'>
                          {openIssues}
                        </span>
                      )}
                      {errorCount > 0 ? (
                        // How MANY fields block the save on this tab, not just "something does" —
                        // same badge shape as the open-issues counter beside it, in the error token.
                        <span
                          className='border border-error px-1 text-textBaseSize leading-none text-error'
                          title={`${errorCount} field${errorCount > 1 ? 's' : ''} blocking save`}
                        >
                          {errorCount}
                        </span>
                      ) : (
                        isFilled(tab.id) && (
                          <span
                            className='size-1.5 rounded-full bg-textColor/50'
                            aria-hidden
                            title='has content'
                          />
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* section-completion progress (Q9): at-a-glance «сколько заполнено» over the core spec */}
        <div className='flex items-center gap-2 border-b border-textInactiveColor px-2.5 py-1'>
          <div className='h-1 flex-1 bg-textInactiveColor/30'>
            <div
              className='h-full bg-textColor transition-all'
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <Text variant='inactive' size='small' className='whitespace-nowrap'>
            {filledCore}/{coreSections.length} core sections
          </Text>
        </div>
      </div>

      {isEditMode && numId ? (
        <>
          <LifecycleStrip
            techCardId={numId}
            stage={stage}
            approvalState={approvalState}
            productCount={productCount}
            canEdit={canWrite(SECTION.techCards)}
            unsaved={form.formState.isDirty}
            planRunDisabled={isAux && !outputMaterialId}
            planRunDisabledReason='set an output material before planning an auxiliary run'
            onGoSamples={() => navTo('samples')}
            onAddSample={() => navTo('samples', { sample: 'new' })}
            onGoFittings={(unresolvedOnly) =>
              navTo('history', unresolvedOnly ? { fits: 'unresolved' } : undefined)
            }
          />
          {/* TASKS hub panel (#75) — техкарта как рабочий хаб: work items linked to this style,
              scannable and always visible next to the lifecycle spine regardless of active tab. */}
          <TechCardTasksPanel techCardId={numId} />
        </>
      ) : null}

      {conflict && (
        <div className='mt-3 flex flex-wrap items-center justify-between gap-3 border border-textInactiveColor bg-highlightColor/10 p-3'>
          <Text size='small'>
            This card was saved by someone else. Reload to get the latest version, then re-apply
            your changes.
          </Text>
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => window.location.reload()}
          >
            reload
          </Button>
        </div>
      )}

      {draft.pending && (
        <div className='mt-3 flex flex-wrap items-center justify-between gap-3 border border-warning bg-highlightColor/10 p-3'>
          <Text size='small'>
            Найден несохранённый черновик
            {draft.pending.savedAt
              ? ` от ${new Date(draft.pending.savedAt).toLocaleString()}`
              : ''}{' '}
            — восстановить его или отбросить?
          </Text>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              onClick={draft.restore}
            >
              restore
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={draft.clear}
            >
              discard
            </Button>
          </div>
        </div>
      )}

      {frozen && (
        <div className='mt-3 border border-textInactiveColor bg-highlightColor/10 p-3'>
          <Text size='small'>
            Released and frozen — the factory spec is locked. Use “Re-open to draft” to edit.
          </Text>
        </div>
      )}

      <form className='pt-4 pb-24' onSubmit={form.handleSubmit(doSubmit, onInvalid)}>
        <fieldset disabled={frozen} className='m-0 min-w-0 border-0 p-0'>
          {/* HEADER */}
          <div hidden={activeTab !== 'header'} className='flex flex-col gap-6'>
            <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
              <Section title='identification' className='w-full lg:w-1/2'>
                <StyleNumberField isIdea={isIdea} />
                {isIdea && (
                  <Text variant='inactive' size='small'>
                    optional while this is an idea — a real style number is required before the card
                    can advance to PROTO
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
            <Section title='колорвеи — рецепты (материалы по частям)'>
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
            </Section>
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
                  <div className='mb-3 border border-warning bg-warning/10 p-3'>
                    <Text className='text-warning text-textBaseSize'>
                      No costing set for this style — margin, break-even and economics cannot be
                      computed for its colorways, and its sold products count as uncosted in
                      analytics (lowering store-wide cost coverage). Add materials or costs below.
                    </Text>
                  </div>
                )}
                {isEditMode && numId && (
                  <div className='mb-3 flex justify-end'>
                    <Button
                      type='button'
                      variant='secondary'
                      size='lg'
                      className='uppercase'
                      onClick={() => setEconOpen(true)}
                    >
                      style economics
                    </Button>
                  </div>
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
          {canReadCosting && isEditMode && numId ? (
            <StyleEconomicsModal techCardId={numId} open={econOpen} onOpenChange={setEconOpen} />
          ) : null}

          {/* ISSUES */}
          <div hidden={activeTab !== 'issues'}>
            <Section title='issues (maker flags)'>
              <IssuesField />
            </Section>
          </div>

          {/* SIGN-OFF */}
          <div hidden={activeTab !== 'signoff'}>
            <Section title='section sign-off'>
              <SignoffsField />
            </Section>
          </div>

          {/* HISTORY */}
          <div hidden={activeTab !== 'history'} className='flex flex-col gap-6'>
            <Section title='fittings'>
              {isEditMode && numId ? (
                <TechCardFittings techCardId={numId} />
              ) : (
                <Text variant='inactive' size='small'>
                  save this tech card first, then you can link fittings to it
                </Text>
              )}
            </Section>
            <Section title='revision log (auto-journal)'>
              <RevisionsField revisions={techCard?.revisions} />
            </Section>
            <Section title='releases (Rev.N)'>
              {isEditMode && numId ? (
                <div className='flex flex-col gap-3'>
                  {canWrite(SECTION.techCards) && !frozen && (
                    <div className='flex flex-wrap items-center gap-2'>
                      <Button
                        type='button'
                        variant='main'
                        size='lg'
                        className='uppercase'
                        disabled={!canRelease || saving}
                        loading={saving}
                        title={
                          canRelease
                            ? 'freeze the current spec as a new immutable Rev.N release'
                            : `Can’t release — ${releaseBlockedReason}`
                        }
                        onClick={() => submitWithApproval(RELEASED)}
                      >
                        create release
                      </Button>
                      <Text variant='inactive' size='small'>
                        freezes the current spec as the next immutable Rev.N snapshot the factory
                        reads
                      </Text>
                    </div>
                  )}
                  <ReleasesField techCardId={numId} />
                </div>
              ) : (
                <Text variant='inactive' size='small'>
                  a frozen Rev.N snapshot is created when the card is saved as “released”
                </Text>
              )}
            </Section>
          </div>
        </fieldset>

        {/* SAMPLES — edit-mode only (needs a saved card id). OUTSIDE the frozen fieldset: a
            released card must still allow reading — paging the material ledger, opening/closing
            sample rows — so editing is gated explicitly instead of by the disabled fieldset
            (which killed every native button, read paths included). */}
        {isEditMode && numId ? (
          <div hidden={activeTab !== 'samples'}>
            <Section title='samples (сэмплы)'>
              <SamplesTab
                techCardId={numId}
                techCard={techCard}
                canEdit={canWrite(SECTION.techCards) && !frozen}
                canReadCosting={canReadCosting}
              />
            </Section>
          </div>
        ) : null}
      </form>

      {/* Create a packaging material inline for the aux output picker (prefilled section). */}
      <MaterialModal
        open={materialModalOpen}
        onOpenChange={setMaterialModalOpen}
        defaultSection='TECH_CARD_BOM_SECTION_PACKAGING'
      />
    </Form>
  );
}
