import { cn } from 'lib/utility';
import { useDockBottom } from 'hooks/useDockBottom';
import { useTypingOnPhone } from './use-typing-on-phone';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { common_MediaFull, common_Model } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  useCreateModel,
  useDeleteModel,
  useUpdateModel,
} from 'components/managers/models/components/useModelQuery';
import { genderOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { useController, useForm, useFormContext, useWatch } from 'react-hook-form';
import {
  Button,
  ButtonRow,
  Category,
  ConfirmationModal,
  Form,
  LineInputField,
  NoteBlock,
  Segmented,
  Text,
  TextareaField,
} from 'ui';
import { DefaultSizesField } from './default-sizes-field';
import { ModelFittingRows } from './fitting-rows';
import { MeasurementsFields, MeasurementsHeaderActions } from './measurements-fields';
import { ModelPhotoPick } from './model-media';
import {
  ModelPins,
  ModelPinsProvider,
  REQUIRED_PIN_KEYS,
  useFormPins,
  usePinFor,
} from './model-pins';
import {
  mapFormToModelInsert,
  mapModelToForm,
  ModelFormData,
  modelDefaultData,
  modelSchema,
} from './schema';
import {
  MODEL_MEASUREMENTS,
  SheetMeasurementFocusProvider,
  SheetMeasurementMobileStrip,
} from './sheet-measurement-focus';
import { scrollerOf, scrollTopOf, setScrollTop, softScrollTo, viewTopOf } from './panel-scroll';

const COMMENT_MAX = 1000;

/** Measurements that carry a value, out of the 20 the sheet asks for. */
export function measuredCount(measurements: ModelFormData['measurements']): number {
  return MODEL_MEASUREMENTS.filter((m) => Number(measurements?.[m.name]) > 0).length;
}

/** Men / Women / Unisex, in the frame's order. */
const GENDER_ITEMS = ['GENDER_ENUM_MALE', 'GENDER_ENUM_FEMALE', 'GENDER_ENUM_UNISEX'].map(
  (value) => {
    const label = genderOptions.find((g) => g.value === value)?.label ?? value;
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  },
);

function GenderField() {
  const { control } = useFormContext<ModelFormData>();
  const { field, fieldState } = useController({ control, name: 'gender' });
  return (
    <Segmented
      items={GENDER_ITEMS}
      value={field.value}
      onChange={field.onChange}
      label='gender'
      error={!!fieldState.error}
    />
  );
}

function NameField() {
  const pin = usePinFor('name', 'name');
  return <LineInputField name='name' placeholder='Model Name' autoComplete='off' pin={pin} />;
}

function CommentNote() {
  const { control } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: 'comment' });
  const [full, setFull] = useState(false);
  return (
    <>
      <NoteBlock
        ref={field.ref}
        name={field.name}
        value={field.value ?? ''}
        onChange={field.onChange}
        onBlur={field.onBlur}
        maxLength={COMMENT_MAX}
        placeholder='Add a Comment...'
        aria-label='comment'
        uploadLabel='Upload a Text File'
        onUploadText={(text) => {
          const clean = text.replace(/\r\n/g, '\n').trim();
          if (clean.length > COMMENT_MAX)
            notify({ sev: 'warn', subject: 'NOTE', text: `cut to ${COMMENT_MAX}` });
          field.onChange(clean.slice(0, COMMENT_MAX));
        }}
        openLabel='Open Full Note'
        onOpen={() => setFull(true)}
      />
      <ConfirmationModal
        open={full}
        onOpenChange={setFull}
        onConfirm={() => setFull(false)}
        title='note'
        confirmLabel='done'
        hideCancel
        width='lg'
      >
        <TextareaField
          name='comment'
          label='note'
          srLabel
          maxLength={COMMENT_MAX}
          autoGrow={false}
          className='h-[60vh] resize-none'
        />
      </ConfirmationModal>
    </>
  );
}

export type CategoryKey = 'required' | 'measurements' | 'comments' | 'fittings';
const CATEGORY_ORDER: CategoryKey[] = ['required', 'measurements', 'comments', 'fittings'];
const categoryId = (key: CategoryKey) => `model-category-${key}`;

/** The owner's sentence for a blocked leave (owner-approved copy). */
export const UNSAVED_MESSAGE = 'You have unsaved changes, what to do?';

type ModelSession = {
  isEditMode: boolean;
  id?: string;
  writer: boolean;
  /** Validates and saves; resolves `true` when the model was stored. */
  submit: () => Promise<boolean>;
  submitting: boolean;
  /** The refused save's reason, for the action bar. */
  formError: string | null;
  /** Photos picked in this session: not in `model.media` until the model is saved and re-read. */
  knownMedia: common_MediaFull[];
  rememberMedia: (media: common_MediaFull) => void;
  /** The accordion of the panel, shared so the card can open a category and focus a field. */
  activeCat: CategoryKey;
  folded: Partial<Record<CategoryKey, boolean>>;
  toggleCat: (key: CategoryKey, open: boolean) => void;
  activateCat: (key: CategoryKey) => void;
  focusInto: (key: CategoryKey) => void;
  /** Categories folded by scrolling past them (no height animation). */
  quiet: ReadonlySet<CategoryKey>;
  foldPassed: (keys: CategoryKey[]) => void;
  /** Open Measurements and put the caret in that measurement's panel field (a scheme segment). */
  focusMeasurement: (name: string) => void;
  onDeleted: () => void;
};

const ModelSessionContext = createContext<ModelSession | null>(null);

export function useModelSession(): ModelSession {
  const value = useContext(ModelSessionContext);
  if (!value) throw new Error('no ModelFormProvider');
  return value;
}

/**
 * ONE FORM FOR THE CARD, THE PANEL AND THE ACTION BAR. The open model's react-hook-form lives here,
 * above the active card on the left (its name, pinned fields, scheme), the Model Info panel on the
 * right and the bottom action bar, so a value typed on the card and in the panel is the same field.
 * Same form for edit and create; edit only pre-fills.
 *
 * The parent owns the route: `onCreated` receives the id AddModel returned, `onDeleted` fires after
 * Delete a Profile, `onDirtyChange` feeds the page's leave-block. `pins` is the page's
 * (`model-pins.tsx` — local until the API has a field). Needs a `MeasurementUnitProvider` above it.
 */
export function ModelFormProvider({
  isEditMode,
  id,
  model,
  pins,
  onCreated,
  onDeleted,
  onDirtyChange,
  children,
}: {
  isEditMode: boolean;
  id?: string;
  model?: common_Model;
  pins: ModelPins;
  onCreated: (id: number | undefined) => void;
  onDeleted: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  children: ReactNode;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [knownMedia, setKnownMedia] = useState<common_MediaFull[]>([]);
  const rememberMedia = useCallback(
    (m: common_MediaFull) =>
      setKnownMedia((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m])),
    [],
  );
  const createModel = useCreateModel();
  const updateModel = useUpdateModel();
  const { canWrite } = usePermissions();
  const writer = canWrite(SECTION.models);

  // Accordion (owner, spec 5): everything opens by default. Scrolling past a whole category folds
  // it (the panel folds it, `foldPassed`); it never reopens by itself. A title click opens a folded
  // category and brings its title to the top of the panel; on an open one it folds it.
  const [activeCat, setActiveCat] = useState<CategoryKey>('required');
  const [folded, setFolded] = useState<Partial<Record<CategoryKey, boolean>>>({});
  // Folded by the scroll: no height animation, so the scroll compensation lands in one frame.
  const [quiet, setQuiet] = useState<ReadonlySet<CategoryKey>>(new Set());
  const reveal = useCallback((key: CategoryKey) => {
    setActiveCat(key);
    setQuiet((q) => {
      if (!q.has(key)) return q;
      const next = new Set(q);
      next.delete(key);
      return next;
    });
    setFolded((f) => (f[key] ? { ...f, [key]: false } : f));
    // After the body opened: its title to the top of the panel's visible area, on the soft ease.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const section = document.getElementById(categoryId(key));
        if (!section) return;
        const scroller = scrollerOf(section);
        const top =
          scrollTopOf(scroller) + section.getBoundingClientRect().top - viewTopOf(scroller);
        // Below the stack of folded titles that stick above it.
        const row = section.firstElementChild as HTMLElement | null;
        const stuck = row ? parseFloat(getComputedStyle(row).top) || 0 : 0;
        softScrollTo(scroller, Math.max(0, top - stuck - 8));
      }),
    );
  }, []);
  const foldPassed = useCallback((keys: CategoryKey[]) => {
    setQuiet((q) => new Set([...q, ...keys]));
    setFolded((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, true])) }));
  }, []);
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const focusInto = useCallback(
    (key: CategoryKey) => {
      setActiveCat(key);
      if (foldedRef.current[key]) reveal(key);
    },
    [reveal],
  );
  const focusMeasurement = useCallback(
    (name: string) => {
      if (foldedRef.current.measurements) reveal('measurements');
      setActiveCat('measurements');
      // A folded body is `inert` until this render lands.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document.getElementById(`model-measurement-${name}`)?.focus({ preventScroll: false }),
        ),
      );
    },
    [reveal],
  );

  const form = useForm<ModelFormData>({
    resolver: zodResolver(modelSchema),
    defaultValues: model ? mapModelToForm(model) : modelDefaultData,
    mode: 'onSubmit',
  });

  // A refused save stands until the next edit or attempt.
  useEffect(() => {
    const sub = form.watch(() => setFormError(null));
    return () => sub.unsubscribe();
  }, [form]);

  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function save(data: ModelFormData): Promise<boolean> {
    const modelInsert = mapFormToModelInsert(data);
    setFormError(null);
    try {
      if (isEditMode) {
        await updateModel.mutateAsync({ id: parseInt(id || '0', 10), model: modelInsert });
        form.reset(data);
      } else {
        const created = await createModel.mutateAsync(modelInsert);
        // The new card turning active in the pool is the receipt.
        form.reset(data);
        onCreated(created?.id || undefined);
      }
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'not saved';
      // A transient failure keeps its retry: the message stands in the bar and Save tries again.
      setFormError(failureClassOfError(error) === 'transient' ? `${msg} · try again` : msg);
      console.error('Failed to submit model', error);
      return false;
    }
  }

  const submit = () =>
    new Promise<boolean>((resolve) => {
      void form.handleSubmit(
        async (data) => resolve(await save(data)),
        (errors) => {
          const first = Object.values(errors)[0];
          setFormError(
            typeof first?.message === 'string' ? first.message : 'check the required fields',
          );
          resolve(false);
        },
      )();
    });

  const session: ModelSession = {
    isEditMode,
    id,
    writer,
    submit,
    submitting: form.formState.isSubmitting,
    formError,
    knownMedia,
    rememberMedia,
    activeCat,
    folded,
    toggleCat: (key, open) => (open ? reveal(key) : setFolded((f) => ({ ...f, [key]: true }))),
    quiet,
    foldPassed,
    activateCat: setActiveCat,
    focusInto,
    focusMeasurement,
    onDeleted,
  };

  return (
    <Form {...form}>
      <ModelPinsProvider value={pins}>
        <SheetMeasurementFocusProvider>
          <ModelSessionContext.Provider value={session}>{children}</ModelSessionContext.Provider>
        </SheetMeasurementFocusProvider>
      </ModelPinsProvider>
    </Form>
  );
}

/** The photo door of Required Info: upload only; once there is a photo, it says so. */
function PhotoDoor() {
  const { writer, rememberMedia } = useModelSession();
  const { control } = useFormContext<ModelFormData>();
  const mediaIds = (useWatch({ control, name: 'mediaIds' }) ?? []) as number[];
  const has = mediaIds.length > 0;
  return (
    <ModelPhotoPick
      onPicked={rememberMedia}
      trigger={
        has ? (
          // A photo is there: no fill, a grey note; it still opens the picker to replace it.
          <Button
            type='button'
            variant='default'
            disabled={!writer}
            className='h-8.25 w-full cursor-pointer text-center text-textBaseSize text-placeholder transition-colors duration-500 ease-soft hover:text-ink'
          >
            Model Picture Uploaded
          </Button>
        ) : (
          <Button type='button' variant='fill' disabled={!writer} className='w-full'>
            Upload Profile Picture
          </Button>
        )
      }
    />
  );
}

function DeleteProfile() {
  const { id, onDeleted } = useModelSession();
  const deleteModel = useDeleteModel();
  const [asking, setAsking] = useState(false);
  const numId = parseInt(id || '0', 10);
  return (
    <>
      <Button
        type='button'
        variant='default'
        onClick={() => setAsking(true)}
        className='cursor-pointer text-textBaseSize text-ink hover:underline'
      >
        Delete a Profile
      </Button>
      <ConfirmationModal
        open={asking}
        onOpenChange={setAsking}
        onConfirm={() => {
          setAsking(false);
          deleteModel.mutate(numId, {
            onSuccess: onDeleted,
            onError: (e) =>
              notify({
                sev: 'error',
                subject: `MODEL ${numId}`,
                text: 'not deleted',
                detail: e instanceof Error ? e.message : undefined,
              }),
          });
        }}
        title='delete model'
        confirmLabel='delete'
        cancelLabel='cancel'
      >
        <Text>delete this model? this cannot be undone.</Text>
      </ConfirmationModal>
    </>
  );
}

/**
 * The Model Info panel, on the Lekalo fill system: borderless categories with 32px titles
 * (Required Info / Measurements / Comments / Fittings) as an accordion, underline fields, pins.
 * Lives inside `ModelFormProvider`; Save / Cancel are the page's action bar (`ModelActionBar`).
 */
export function ModelForm() {
  const {
    isEditMode,
    id,
    writer,
    submit,
    activeCat,
    folded,
    toggleCat,
    activateCat,
    focusInto,
    quiet,
    foldPassed,
  } = useModelSession();
  const pins = useFormPins();
  const formRef = useRef<HTMLFormElement>(null);
  // What the person looks at when the scroll folds something: the first section still in view and
  // its top, so the fold can be taken back out of `scrollTop` exactly.
  const passed = useRef<{ anchor: HTMLElement; top: number } | null>(null);

  // SCROLLING PAST A CATEGORY FOLDS IT. Only a category that is wholly above the visible area
  // folds, and the height it gives back is taken out of `scrollTop` in the same frame (below), so
  // what the person looks at does not move. It never reopens by itself.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const scroller = scrollerOf(form);
    const onScroll = () => {
      if (passed.current) return;
      const top = viewTopOf(scroller);
      const fold: CategoryKey[] = [];
      let anchor: HTMLElement | null = null;
      for (const key of CATEGORY_ORDER) {
        const section = document.getElementById(categoryId(key));
        // Read open / folded from the page, not from a closure: a scroll event can land between a
        // fold and the listener that knows about it.
        if (!section || section.dataset.open !== 'true') continue;
        const box = section.getBoundingClientRect();
        if (box.bottom < top) fold.push(key);
        else if (!anchor) anchor = section;
      }
      if (!fold.length) return;
      const target = anchor ?? form;
      passed.current = { anchor: target, top: target.getBoundingClientRect().top };
      foldPassed(fold);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [folded, foldPassed]);

  useLayoutEffect(() => {
    const held = passed.current;
    const form = formRef.current;
    if (!held || !form) return;
    passed.current = null;
    // The anchor slid up by what folded above it: scroll back by the same amount.
    const delta = held.top - held.anchor.getBoundingClientRect().top;
    const scroller = scrollerOf(form);
    if (delta) setScrollTop(scroller, scrollTopOf(scroller) - delta);
  }, [folded]);

  // Folded titles stack at the top of the panel; the open one sticks below them.
  const tops = Category.stackTops(CATEGORY_ORDER, folded, {
    offset: 'var(--panel-sticky-offset, 0px)',
  });
  const categoryProps = (key: CategoryKey) => ({
    id: categoryId(key),
    stickyTop: tops[key],
    active: activeCat === key,
    onActivate: () => activateCat(key),
    onFocusInside: () => focusInto(key),
    open: !folded[key],
    instant: quiet.has(key) && !!folded[key],
    onOpenChange: (open: boolean) => toggleCat(key, open),
  });

  return (
    <form
      ref={formRef}
      className='flex flex-col gap-4.5 pt-4 pb-6'
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <SheetMeasurementMobileStrip />

      <Category
        title='Required Info'
        {...categoryProps('required')}
        pin={
          pins
            ? {
                pinned: pins.allPinned(REQUIRED_PIN_KEYS),
                onToggle: () => pins.toggleAll(REQUIRED_PIN_KEYS),
                label: 'pin required info',
              }
            : undefined
        }
        action={isEditMode && writer ? <DeleteProfile /> : undefined}
      >
        <div className='@container flex flex-col'>
          <div className='grid grid-cols-1 items-center gap-x-6.5 gap-y-4 @[28.75rem]:grid-cols-2'>
            <div className='@[28.75rem]:col-span-2'>
              <NameField />
            </div>
            <GenderField />
            <PhotoDoor />
          </div>
          <Text component='h3' className='mt-6 mb-1 text-ink'>
            Sizes
          </Text>
          <DefaultSizesField />
        </div>
      </Category>

      <Category
        title='Measurements'
        {...categoryProps('measurements')}
        action={<MeasurementsHeaderActions />}
      >
        <MeasurementsFields />
      </Category>

      <Category title='Comments' {...categoryProps('comments')}>
        <CommentNote />
      </Category>

      {isEditMode && id && (
        <Category title='Fittings' {...categoryProps('fittings')}>
          <ModelFittingRows modelId={parseInt(id, 10)} />
        </Category>
      )}
      {/* A panel's height of room under the last category: any title can reach the top (a click
          brings it there) and any category can be scrolled past and fold without a jump. A child,
          not padding: sticky titles may not leave the form's content box. */}
      <div aria-hidden='true' className='min-[56.25rem]:h-[calc(100dvh-10rem)]' />
    </form>
  );
}

/**
 * The bottom action bar («contexterror»): one white bar across the screen's content area. Left, the
 * context in 24px ink — the blocked leave's question, or why the save was refused; empty otherwise.
 * Right, the system pair as a `ButtonRow` — Cancel, then Save («Add» for a new model).
 *
 * `leaving` = the page holds a navigation because the form is dirty: Save saves and goes on, Cancel
 * discards and goes on. Without one, Cancel closes the card (discarding) and Save just saves.
 */
export function ModelActionBar({
  leaving,
  onContinue,
  onClose,
  className,
}: {
  leaving: boolean;
  /** Run the held navigation (after Save stored the model, or after Cancel discarded). */
  onContinue: () => void;
  onClose: () => void;
  className?: string;
}) {
  const { isEditMode, writer, submit, submitting, formError } = useModelSession();
  const form = useFormContext<ModelFormData>();
  const isDirty = form.formState.isDirty;
  const bar = useRef<HTMLDivElement>(null);
  useDockBottom(bar, []);
  const typingOnPhone = useTypingOnPhone();

  const message = formError ?? (leaving ? UNSAVED_MESSAGE : '');

  return (
    <div
      ref={bar}
      role='region'
      aria-label='actions'
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-dock)] flex min-h-12.25 flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-bgColor py-2 pr-2.5 pl-[clamp(1.5rem,13vw,11.6875rem)] max-md:px-3',
        typingOnPhone && 'hidden',
        className,
      )}
    >
      <p
        role={formError ? 'alert' : 'status'}
        key={message}
        className='min-w-0 flex-1 text-head leading-tight text-ink motion-safe:animate-[models-fade-up_700ms_var(--ease-soft)_both] max-md:text-textBaseSize'
      >
        {message}
      </p>
      <ButtonRow
        label='save or cancel'
        className='w-full shrink-0 md:w-[min(30.9375rem,46vw)]'
        items={[
          {
            key: 'cancel',
            label: 'Cancel',
            onClick: () => {
              form.reset();
              if (leaving) onContinue();
              else onClose();
            },
          },
          ...(writer
            ? [
                {
                  key: 'save',
                  label: isEditMode ? 'Save' : 'Add',
                  busy: submitting,
                  disabled: submitting || (isEditMode && !isDirty && !leaving),
                  onClick: () => {
                    void submit().then((ok) => {
                      if (ok && leaving) onContinue();
                    });
                  },
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/**
 * While the action bar speaks — a refused save, or the held leave's question — everything above it
 * steps back to 32% (soft ease), so the system message stands out. Pointer events stay: a field can
 * still be fixed, and the dim lifts when the message clears.
 */
export function ModelDim({
  leaving,
  className,
  children,
}: {
  leaving: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { formError } = useModelSession();
  return (
    <div
      className={cn(
        'transition-opacity duration-700 ease-soft motion-reduce:transition-none',
        (leaving || !!formError) && 'opacity-32',
        className,
      )}
    >
      {children}
    </div>
  );
}
