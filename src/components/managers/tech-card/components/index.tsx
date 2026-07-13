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
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { BomField } from './bom-field';
import { ColorwaysField } from './colorways-field';
import { ConstructionTab } from './construction-tab';
import { CostingField } from './costing-field';
import { DetailsEditor } from './details-editor';
import { HeaderMetaFields } from './header-meta-fields';
import { IssuesField } from './issues-field';
import { LabelsField } from './labels-field';
import { LifecycleStrip } from './lifecycle-strip';
import { PackagingField } from './packaging-field';
import { PatternsField } from './patterns-field';
import { ProductIdsField } from './product-ids-field';
import { DevExpensesField } from './dev-expenses-field';
import { ReleasesField } from './releases-field';
import { RevisionsField } from './revisions-field';
import { SignoffsField } from './signoffs-field';
import { SeasonField } from './season-field';
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
import { TechCardFittings } from './tech-card-fittings';

const TABS = [
  { id: 'header', label: 'header' },
  { id: 'sketch', label: 'sketch' },
  { id: 'patterns', label: 'patterns' },
  { id: 'samples', label: 'samples' },
  { id: 'bom', label: 'BOM' },
  { id: 'colorways', label: 'colorways' },
  { id: 'construction', label: 'construction' },
  { id: 'labels', label: 'labels & pkg' },
  { id: 'costing', label: 'costing' },
  { id: 'dev', label: 'R&D cost' },
  { id: 'issues', label: 'issues' },
  { id: 'signoff', label: 'sign-off' },
  { id: 'history', label: 'history' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Tabs grouped into lifecycle bands so the rail reads at a glance (R-2): DESIGN what it is,
// DEVELOP how it's made, SPEC what ships. History stands alone.
const TAB_GROUPS: { band: string; tabs: TabId[] }[] = [
  { band: 'design', tabs: ['header', 'sketch', 'patterns'] },
  { band: 'develop', tabs: ['samples', 'bom', 'colorways', 'construction'] },
  { band: 'spec', tabs: ['labels', 'costing', 'dev', 'issues', 'signoff'] },
  { band: '', tabs: ['history'] },
];

// Maps a form-error root key to the tab that owns it; unmapped keys are header fields.
const ERROR_TAB: Record<string, TabId> = {
  moodboardMedia: 'sketch',
  technicalMedia: 'sketch',
  callouts: 'sketch',
  patterns: 'patterns',
  sizeIds: 'patterns',
  sizeQuantities: 'patterns',
  bomItems: 'bom',
  colorways: 'colorways',
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
const LAB_DIP_APPROVED = 'TECH_CARD_LAB_DIP_STATUS_APPROVED';

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
  const [params, setParams] = useSearchParams();
  const initialStage = (params.get('stage') as TechCardFormData['stage']) || undefined;

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
  const activeTab: TabId = (params.get('tab') as TabId) || 'header';
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
  const colorways = (useWatch({ control: form.control, name: 'colorways' }) ?? []) as Array<{
    labDipStatus?: string;
  }>;
  const canRelease = colorways.every((c) => c.labDipStatus === LAB_DIP_APPROVED);

  const issues = (useWatch({ control: form.control, name: 'issues' }) ?? []) as Array<{
    status?: string;
  }>;
  const openIssues = issues.filter((i) => i.status === 'TECH_CARD_ISSUE_STATUS_OPEN').length;

  // Lifecycle spine inputs: current stage/approval drive the stepper + next-hint; linked-product
  // count feeds the counter row.
  const stage = (useWatch({ control: form.control, name: 'stage' }) ?? '') as string;
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

  // IDEA is a "light" card (screen E): only the concept-relevant tabs show; the rest reappear when
  // the stage advances, their echoed fields untouched. Not disabled — hidden.
  const isIdea = stage === 'TECH_CARD_STAGE_IDEA';
  const IDEA_TABS: TabId[] = ['header', 'sketch', 'samples', 'history'];
  // Costing + R&D-cost tabs are field-shaped: hidden entirely without costing:read (server nulls
  // the cost block / returns an empty journal; an empty tab would read as "zero cost"). Samples
  // need a saved card (id).
  const isTabVisible = (t: TabId) => {
    if (isIdea && !IDEA_TABS.includes(t)) return false;
    if ((t === 'costing' || t === 'dev') && !canReadCosting) return false;
    if (t === 'samples' && !isEditMode) return false;
    return true;
  };
  // If the open tab becomes hidden (e.g. switching a card to IDEA while on the BOM tab), fall back
  // to header so the body isn't blank.
  useEffect(() => {
    if (!isTabVisible(activeTab)) navTo('header');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isIdea]);

  const errorTabs = new Set(
    Object.keys(form.formState.errors).map((k) => ERROR_TAB[k] ?? 'header'),
  );

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
        form.reset(data);
      } else {
        await createTechCard.mutateAsync(techCardInsert);
        showMessage('tech card created', 'success');
        navigate(ROUTES.techCards);
      }
    } catch (error) {
      if ((error as { status?: number })?.status === 409) setConflict(true);
      showMessage(techCardErrorMessage(error, 'Failed to submit tech card'), 'error');
      console.error('Failed to submit tech card', error);
    }
  }

  // Surface validation failures — otherwise clicking Save with an invalid field (e.g. a tab the
  // user can't see) does nothing and looks like a broken button.
  const onInvalid = () => {
    const tabs = Array.from(
      new Set(Object.keys(form.formState.errors).map((k) => ERROR_TAB[k] ?? 'header')),
    );
    showMessage(
      `Проверьте поля с ошибками${tabs.length ? ` (вкладки: ${tabs.join(', ')})` : ''}`,
      'error',
    );
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
                    title={canRelease ? '' : 'Approve every colourway lab-dip before release'}
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
                  const hasError = errorTabs.has(tab.id);
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
                      {hasError && <span className='size-1.5 rounded-full bg-error' aria-hidden />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>

      {isEditMode && numId ? (
        <LifecycleStrip
          techCardId={numId}
          stage={stage}
          approvalState={approvalState}
          productCount={productCount}
          frozen={frozen}
          canEdit={canWrite(SECTION.techCards)}
          planRunDisabled={isAux && !outputMaterialId}
          planRunDisabledReason='set an output material before planning an auxiliary run'
          onStageChange={(next) => form.setValue('stage', next, { shouldDirty: true })}
          onGoSamples={() => navTo('samples')}
          onAddSample={() => navTo('samples', { sample: 'new' })}
          onGoFittings={(unresolvedOnly) =>
            navTo('history', unresolvedOnly ? { fits: 'unresolved' } : undefined)
          }
        />
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

      {frozen && (
        <div className='mt-3 border border-textInactiveColor bg-highlightColor/10 p-3'>
          <Text size='small'>
            Released and frozen — the factory spec is locked. Use “Re-open to draft” to edit.
          </Text>
        </div>
      )}

      <form className='pt-4 pb-24' onSubmit={form.handleSubmit(doSubmit)}>
        <fieldset disabled={frozen} className='m-0 min-w-0 border-0 p-0'>
          {/* HEADER */}
          <div hidden={activeTab !== 'header'} className='flex flex-col gap-6'>
            <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
              <Section title='identification' className='w-full lg:w-1/2'>
                <InputField
                  name='styleNumber'
                  label={isIdea ? 'style number' : 'style number *'}
                  placeholder={isIdea ? 'auto IDEA-… draft' : 'артикул'}
                />
                {isIdea && (
                  <Text variant='inactive' size='small'>
                    optional at idea — a draft number is assigned on save; set the real one before
                    PROTO
                  </Text>
                )}
                <InputField name='name' label='name *' placeholder='название изделия' />
                <InputField name='brand' label='brand' />
                <SeasonField />
                <InputField name='collection' label='collection' />
                <InputField name='version' label='version' />
                <InputField name='designer' label='designer' />
                <InputField name='constructorName' label='constructor' />
                <InputField name='technologist' label='technologist' />
                <InputField name='status' label='status (freeform note)' />
              </Section>

              <Section title='classification' className='w-full lg:w-1/2'>
                <SelectField name='purpose' label='purpose' items={techCardPurposeOptions} />
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
                <InputField name='approvedBy' label='approved by' />
              </Section>
            </div>

            <Section title='category & base model'>
              <HeaderMetaFields />
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
            <SketchTab techCard={techCard} />
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
            <Section title='выкройки (PDF) — по размерам'>
              <PatternsField />
            </Section>
          </div>

          {/* SAMPLES — edit-mode only (needs a saved card id) */}
          {isEditMode && numId ? (
            <div hidden={activeTab !== 'samples'}>
              <Section title='samples (сэмплы)'>
                <SamplesTab
                  techCardId={numId}
                  techCard={techCard}
                  canEdit={canWrite(SECTION.techCards)}
                  canReadCosting={canReadCosting}
                />
              </Section>
            </div>
          ) : null}

          {/* BOM */}
          <div hidden={activeTab !== 'bom'}>
            <Section title='bill of materials — справочник артикулов'>
              <BomField highlightComposition={bomHighlight} />
            </Section>
          </div>

          {/* COLORWAYS — рецепты: какой артикул на какую часть, цвет и расход */}
          <div hidden={activeTab !== 'colorways'}>
            <Section title='колорвеи — рецепты (материалы по частям)'>
              <ColorwaysField />
            </Section>
          </div>

          {/* CONSTRUCTION */}
          <div hidden={activeTab !== 'construction'}>
            <ConstructionTab techCard={techCard} />
          </div>

          {/* LABELS & PACKAGING */}
          <div
            hidden={activeTab !== 'labels'}
            className='flex flex-col gap-6 lg:flex-row lg:items-start'
          >
            <Section title='labels' className='w-full lg:w-1/2'>
              <LabelsField onMissingComposition={goToBomComposition} />
            </Section>
            <Section title='packaging' className='w-full lg:w-1/2'>
              <PackagingField />
            </Section>
          </div>

          {/* COSTING — mounted only with costing:read (field-shaped) */}
          {canReadCosting && (
            <div hidden={activeTab !== 'costing'}>
              <Section title='costing'>
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
            </div>
          )}
          {canReadCosting && isEditMode && numId ? (
            <StyleEconomicsModal techCardId={numId} open={econOpen} onOpenChange={setEconOpen} />
          ) : null}

          {/* R&D COST — mounted only with costing:read (field-shaped) */}
          {canReadCosting && (
            <div hidden={activeTab !== 'dev'}>
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
            <Section title='revision log'>
              <RevisionsField />
            </Section>
            <Section title='releases'>
              {isEditMode && numId ? (
                <ReleasesField techCardId={numId} />
              ) : (
                <Text variant='inactive' size='small'>
                  a frozen snapshot is created when the card is saved as “released”
                </Text>
              )}
            </Section>
          </div>
        </fieldset>
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
