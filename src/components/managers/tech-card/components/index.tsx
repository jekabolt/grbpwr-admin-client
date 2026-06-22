import { zodResolver } from '@hookform/resolvers/zod';
import { common_TechCard } from 'api/proto-http/admin';
import { formatFittingDate } from 'components/managers/fittings/components/utils';
import {
  useCreateTechCard,
  useTechCardFittings,
  useUpdateTechCard,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  formatTechCardDate,
  techCardErrorMessage,
} from 'components/managers/tech-cards/components/utils';
import {
  techCardApprovalStateOptions,
  techCardGenderOptions,
  techCardMeasurementUnitOptions,
  techCardStageOptions,
} from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { BomField } from './bom-field';
import { ColorwaysField } from './colorways-field';
import { ConstructionField } from './construction-field';
import { CostingField } from './costing-field';
import { HeaderMetaFields } from './header-meta-fields';
import { IssuesField } from './issues-field';
import { LabelsField } from './labels-field';
import { OperationsField } from './operations-field';
import { PackagingField } from './packaging-field';
import { PomField } from './pom-field';
import { ProductIdsField } from './product-ids-field';
import { RevisionsField } from './revisions-field';
import { SignoffsField } from './signoffs-field';
import { SizeQuantitiesField } from './size-quantities-field';
import { SketchTab } from './sketch-tab';
import {
  TechCardFormData,
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
} from './schema';
import { SizeIdsField } from './size-ids-field';
import { TechCardFittings } from './tech-card-fittings';

const TABS = [
  { id: 'header', label: 'header' },
  { id: 'sketch', label: 'sketch' },
  { id: 'bom', label: 'BOM' },
  { id: 'colorways', label: 'colorways' },
  { id: 'pom', label: 'POM' },
  { id: 'construction', label: 'construction' },
  { id: 'labels', label: 'labels & pkg' },
  { id: 'costing', label: 'costing' },
  { id: 'issues', label: 'issues' },
  { id: 'signoff', label: 'sign-off' },
  { id: 'history', label: 'history' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Maps a form-error root key to the tab that owns it; unmapped keys are header fields.
const ERROR_TAB: Record<string, TabId> = {
  media: 'sketch',
  callouts: 'sketch',
  bomItems: 'bom',
  colorways: 'colorways',
  pomPoints: 'pom',
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
    <section className={`space-y-4 border border-textColor p-4 ${className ?? ''}`}>
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

  const numId = id ? parseInt(id, 10) : undefined;
  const { data: fittings } = useTechCardFittings(numId);
  const fittingOptions = useMemo(
    () =>
      (fittings ?? []).map((f) => ({
        value: f.id ?? 0,
        label: `#${f.id} · ${formatFittingDate(f.fitting?.fittingDate)}`,
      })),
    [fittings],
  );

  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema),
    defaultValues: techCard ? mapTechCardToForm(techCard) : techCardDefaultData,
    mode: 'onSubmit',
  });

  const [activeTab, setActiveTab] = useState<TabId>('header');
  const [conflict, setConflict] = useState(false);

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

  const errorTabs = new Set(
    Object.keys(form.formState.errors).map((k) => ERROR_TAB[k] ?? 'header'),
  );

  async function doSubmit(data: TechCardFormData) {
    setConflict(false);
    const techCardInsert = mapFormToTechCardInsert(data, techCard?.techCard);
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

  const save = () => form.handleSubmit(doSubmit)();
  const submitWithApproval = (next: string) => {
    form.setValue('approvalState', next, { shouldDirty: true });
    form.handleSubmit(doSubmit)();
  };

  const saving = form.formState.isSubmitting;

  return (
    <Form {...form}>
      {/* sticky lifecycle bar + tabs as one block (top-16 clears the fixed Layout nav;
          -mx-2.5 cancels the Layout content px-2.5 so the bar spans full width) */}
      <div className='sticky top-16 z-30 -mx-2.5 bg-bgColor'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textColor px-2.5 py-2'>
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
            {frozen ? (
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
            )}
          </div>
        </div>

        <nav
          className='flex gap-1 overflow-x-auto border-b border-textInactiveColor px-2.5'
          aria-label='Tech card sections'
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const hasError = errorTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                type='button'
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm uppercase transition-colors ${
                  active
                    ? 'border-textColor text-textColor'
                    : 'border-transparent text-textInactiveColor hover:text-textColor'
                }`}
              >
                {tab.label}
                {tab.id === 'issues' && openIssues > 0 && (
                  <span className='border border-textColor px-1 text-xs leading-none'>
                    {openIssues}
                  </span>
                )}
                {hasError && <span className='size-1.5 rounded-full bg-red-600' aria-hidden />}
              </button>
            );
          })}
        </nav>
      </div>

      {conflict && (
        <div className='mt-3 flex flex-wrap items-center justify-between gap-3 border border-textColor bg-highlightColor/10 p-3'>
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
        <div className='mt-3 border border-textColor bg-highlightColor/10 p-3'>
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
                <InputField name='styleNumber' label='style number *' placeholder='артикул' />
                <InputField name='name' label='name *' placeholder='название изделия' />
                <InputField name='brand' label='brand' />
                <InputField name='season' label='season' />
                <InputField name='collection' label='collection' />
                <InputField name='version' label='version' />
                <InputField name='designer' label='designer' />
                <InputField name='constructorName' label='constructor' />
                <InputField name='technologist' label='technologist' />
                <InputField name='status' label='status (freeform note)' />
              </Section>

              <Section title='classification' className='w-full lg:w-1/2'>
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

            <Section title='classification & targets'>
              <HeaderMetaFields />
            </Section>

            <Section title='construction description'>
              <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                <TextareaField name='description' label='description' rows={3} maxLength={2000} />
                <TextareaField name='silhouette' label='silhouette' rows={3} maxLength={1000} />
                <TextareaField name='collar' label='collar' rows={2} maxLength={1000} />
                <TextareaField name='fastening' label='fastening' rows={2} maxLength={1000} />
                <TextareaField name='pockets' label='pockets' rows={2} maxLength={1000} />
                <TextareaField name='sleeveCuff' label='sleeve / cuff' rows={2} maxLength={1000} />
                <TextareaField
                  name='extraDetails'
                  label='extra details'
                  rows={2}
                  maxLength={1000}
                />
                <TextareaField name='topstitching' label='topstitching' rows={2} maxLength={1000} />
                <TextareaField
                  name='auxMaterials'
                  label='aux materials'
                  rows={2}
                  maxLength={1000}
                />
                <TextareaField name='notes' label='notes' rows={2} maxLength={2000} />
              </div>
            </Section>

            <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
              <Section title='size range' className='w-full lg:w-1/2'>
                <SizeIdsField />
                <div className='space-y-2 border-t border-textInactiveColor pt-3'>
                  <Text variant='uppercase' size='small'>
                    size run (order qty)
                  </Text>
                  <SizeQuantitiesField />
                </div>
              </Section>
              <Section title='linked products' className='w-full lg:w-1/2'>
                <ProductIdsField />
              </Section>
            </div>
          </div>

          {/* SKETCH */}
          <div hidden={activeTab !== 'sketch'}>
            <SketchTab techCard={techCard} />
          </div>

          {/* BOM */}
          <div hidden={activeTab !== 'bom'}>
            <Section title='bill of materials'>
              <BomField />
            </Section>
          </div>

          {/* COLORWAYS */}
          <div hidden={activeTab !== 'colorways'}>
            <Section title='colourways'>
              <ColorwaysField />
            </Section>
          </div>

          {/* POM */}
          <div hidden={activeTab !== 'pom'}>
            <Section title='points of measure'>
              <PomField fittingOptions={fittingOptions} techCard={techCard} />
            </Section>
          </div>

          {/* CONSTRUCTION */}
          <div hidden={activeTab !== 'construction'} className='flex flex-col gap-6'>
            <Section title='construction'>
              <ConstructionField />
            </Section>
            <Section title='operations'>
              <OperationsField />
            </Section>
          </div>

          {/* LABELS & PACKAGING */}
          <div
            hidden={activeTab !== 'labels'}
            className='flex flex-col gap-6 lg:flex-row lg:items-start'
          >
            <Section title='labels' className='w-full lg:w-1/2'>
              <LabelsField />
            </Section>
            <Section title='packaging' className='w-full lg:w-1/2'>
              <PackagingField />
            </Section>
          </div>

          {/* COSTING */}
          <div hidden={activeTab !== 'costing'}>
            <Section title='costing'>
              <CostingField techCard={techCard} />
            </Section>
          </div>

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
          </div>
        </fieldset>
      </form>
    </Form>
  );
}
