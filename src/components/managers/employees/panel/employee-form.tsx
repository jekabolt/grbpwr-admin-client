import {
  scrollerOf,
  scrollTopOf,
  setScrollTop,
  viewTopOf,
} from 'components/managers/model/components/panel-scroll';
import { useTypingOnPhone } from 'components/managers/model/components/use-typing-on-phone';
import { monthLabelShort, opexCurrencyOptions } from 'components/managers/opex/utils/options';
import { useDockBottom } from 'hooks/useDockBottom';
import { cn } from 'lib/utility';
import { notify } from 'lib/stores/store';
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  ButtonRow,
  Category,
  Dropdown,
  LineField,
  MetaWord,
  NoteBlock,
  Segmented,
  Text,
  WheelDatePicker,
} from 'ui';
import { decimalToInput } from 'utils/decimal';
import {
  activeThisMonth,
  dateOf,
  type Draft,
  fmtDate,
  hasLeft,
  isoOf,
  MAX_NAME,
  MAX_NOTE,
  money,
  tenureLabel,
  toMonth,
  UNSAVED_MESSAGE,
} from '../utils/model';
import {
  EMPLOYEE_CATEGORY_ORDER,
  type EmployeeCategoryKey,
  employeeCategoryId,
  useEmployeeSession,
} from './employee-session';

const WORD =
  'cursor-pointer text-textBaseSize text-ink transition-colors duration-500 ease-soft hover:underline disabled:cursor-default disabled:text-placeholder';

const CURRENCY_ITEMS = opexCurrencyOptions.map((c) => ({ value: c.value, label: c.value }));

/** «Mark Left» (or «Restore») · «Archive» on the Required Info title row: asked in the bar. */
function LifecycleWords() {
  const { row, startIntent, intent } = useEmployeeSession();
  if (!row) return null;
  const left = hasLeft(row.employee);
  return (
    <div className='flex items-center gap-4'>
      <Button
        type='button'
        variant='default'
        disabled={!!intent}
        onClick={() => startIntent(left ? 'restore' : 'left')}
        className={WORD}
      >
        {left ? 'Restore' : 'Mark Left'}
      </Button>
      <Button
        type='button'
        variant='default'
        disabled={!!intent}
        onClick={() => startIntent('archive')}
        className={WORD}
      >
        Archive
      </Button>
    </div>
  );
}

function RoleField() {
  const { draft, set, roleOptions, writer, formError } = useEmployeeSession();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    const all = new Set(roleOptions);
    if (draft.role.trim()) all.add(draft.role.trim());
    return [...all].sort((a, b) => a.localeCompare(b)).map((r) => ({ value: r, label: r }));
  }, [roleOptions, draft.role]);
  return (
    <Dropdown
      label='Role'
      searchable
      deselectable
      open={open}
      onOpenChange={setOpen}
      options={options}
      value={draft.role.trim() || null}
      onChange={(next) => set({ role: next ?? '' })}
      addLabel={writer ? 'Add Role' : undefined}
      onAdd={
        writer
          ? (name) => {
              if (!name) return;
              set({ role: name.slice(0, 64) });
              setOpen(false);
            }
          : undefined
      }
      emptyLabel='No roles'
      disabled={!writer}
      error={formError?.field === 'role'}
    />
  );
}

/** A date on the Dropdown's line: `+` opens the wheel picker under it; «Clear» empties it. */
function DateField({
  field,
  label,
}: {
  field: 'employmentStart' | 'employmentEnd';
  label: string;
}) {
  const { draft, set, writer, formError, intent } = useEmployeeSession();
  const [open, setOpen] = useState(false);
  // Marking left opens the To date at once.
  useEffect(() => {
    if (field === 'employmentEnd' && intent === 'left') setOpen(true);
  }, [field, intent]);
  const value = draft[field];
  return (
    <Dropdown
      label={label}
      open={open}
      onOpenChange={setOpen}
      display={value ? fmtDate(value) : undefined}
      disabled={!writer}
      error={formError?.field === field}
    >
      <div className='flex flex-col gap-2 px-2 py-2'>
        <WheelDatePicker
          size='compact'
          open={open}
          value={dateOf(value)}
          onChange={(d) => set({ [field]: isoOf(d) } as Partial<Draft>)}
        />
        {value && (
          <Button
            type='button'
            variant='default'
            onClick={() => {
              set({ [field]: '' } as Partial<Draft>);
              setOpen(false);
            }}
            className='cursor-pointer self-start text-textBaseSize text-placeholder transition-colors duration-500 ease-soft hover:text-ink press:translate-y-0 press:bg-transparent press:text-ink'
          >
            Clear
          </Button>
        )}
      </div>
    </Dropdown>
  );
}

function NoteField() {
  const { draft, set, writer, formError } = useEmployeeSession();
  return (
    <NoteBlock
      name='note'
      value={draft.note}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set({ note: e.target.value })}
      maxLength={MAX_NOTE}
      readOnly={!writer}
      placeholder='Write Here...'
      aria-label='note'
      aria-invalid={formError?.field === 'note' || undefined}
      uploadLabel={writer ? 'Upload a Text File' : undefined}
      onUploadText={(text) => {
        const clean = text.replace(/\r\n/g, '\n').trim();
        if (clean.length > MAX_NOTE)
          notify({ sev: 'warn', subject: 'NOTE', text: `cut to ${MAX_NOTE}` });
        set({ note: clean.slice(0, MAX_NOTE) });
      }}
    />
  );
}

/** empSalary v3: the salary templates linked to this person, or the door to create one. */
function SalaryRows() {
  const { linked } = useEmployeeSession();
  if (!linked.length) return <Text className='text-placeholder'>No template</Text>;
  return (
    <ul className='flex flex-col'>
      {linked.map((t) => {
        const on = activeThisMonth(t);
        return (
          <li
            key={t.id}
            className='flex min-h-8.25 items-center justify-between gap-3 border-b border-hairline text-textBaseSize'
          >
            <span className={cn('min-w-0 truncate', on ? 'text-ink' : 'text-placeholder')}>
              {t.recurring?.label}
            </span>
            <span className='flex shrink-0 items-baseline gap-3 text-labelDark'>
              <span>
                {money(Number(decimalToInput(t.recurring?.amount)) || 0, t.recurring?.currency)}
              </span>
              <span className='text-placeholder'>
                {monthLabelShort(toMonth(t.recurring?.activeFrom))} →{' '}
                {t.recurring?.activeTo ? monthLabelShort(toMonth(t.recurring.activeTo)) : 'Open'}
              </span>
              {!on && <span className='text-alert'>Inactive</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CreateTemplate() {
  const { linked, draft, createSalary, salaryBusy, writer } = useEmployeeSession();
  if (linked.length || !writer) return null;
  return (
    <Button
      type='button'
      variant='default'
      disabled={!draft.defaultMonthlyCost.trim() || salaryBusy}
      title={draft.defaultMonthlyCost.trim() ? undefined : 'set a default cost first'}
      onClick={createSalary}
      className={WORD}
    >
      {salaryBusy ? 'Creating' : 'Create Template'}
    </Button>
  );
}

/**
 * THE EMPLOYEE PANEL, on the fill system: borderless 32px categories as one accordion — Required
 * Info, Employment, Cost, Note, Salary — with sticky titles and the scroll-driven folding of the
 * Models panel. Lives inside `EmployeeSessionProvider`; Save / Cancel are the page's action bar.
 */
export function EmployeeForm() {
  const {
    isEditMode,
    writer,
    draft,
    set,
    formError,
    submit,
    activeCat,
    folded,
    toggleCat,
    activateCat,
    focusInto,
    quiet,
    foldPassed,
    pinned,
    togglePin,
  } = useEmployeeSession();
  const formRef = useRef<HTMLFormElement>(null);
  const passed = useRef<{ anchor: HTMLElement; top: number } | null>(null);
  const order = EMPLOYEE_CATEGORY_ORDER.filter((k) => isEditMode || k !== 'salary');

  // SCROLLING PAST A CATEGORY FOLDS IT (the Models panel's rule): only a category wholly above the
  // visible area folds, and the height it gives back is taken out of `scrollTop` in the same frame.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const scroller = scrollerOf(form);
    const onScroll = () => {
      if (passed.current) return;
      const top = viewTopOf(scroller);
      const fold: EmployeeCategoryKey[] = [];
      let anchor: HTMLElement | null = null;
      for (const key of EMPLOYEE_CATEGORY_ORDER) {
        const section = document.getElementById(employeeCategoryId(key));
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
    const delta = held.top - held.anchor.getBoundingClientRect().top;
    const scroller = scrollerOf(form);
    if (delta) setScrollTop(scroller, scrollTopOf(scroller) - delta);
  }, [folded]);

  const tops = Category.stackTops(order, folded, { offset: 'var(--panel-sticky-offset, 0px)' });
  const categoryProps = (key: EmployeeCategoryKey) => ({
    id: employeeCategoryId(key),
    stickyTop: tops[key],
    active: activeCat === key,
    onActivate: () => activateCat(key),
    onFocusInside: () => focusInto(key),
    open: !folded[key],
    instant: quiet.has(key) && !!folded[key],
    onOpenChange: (open: boolean) => toggleCat(key, open),
  });

  const tenure = tenureLabel(draft.employmentStart, draft.employmentEnd);

  return (
    <form
      ref={formRef}
      className='flex flex-col gap-4.5 pt-4 pb-6'
      onSubmit={(e) => {
        e.preventDefault();
        if (writer) void submit();
      }}
    >
      <Category
        title='Required Info'
        {...categoryProps('required')}
        pin={{ pinned, onToggle: togglePin, label: 'pin note to the tile' }}
        action={isEditMode && writer ? <LifecycleWords /> : undefined}
      >
        <div className='@container flex flex-col'>
          <div className='grid grid-cols-1 items-start gap-x-6.5 gap-y-4'>
            <LineField
              name='fullName'
              label='Full Name'
              value={draft.fullName}
              maxLength={MAX_NAME}
              autoComplete='off'
              disabled={!writer}
              error={formError?.field === 'fullName'}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set({ fullName: e.target.value })}
            />
            <RoleField />
          </div>
        </div>
      </Category>

      <Category
        title='Employment'
        {...categoryProps('employment')}
        action={tenure ? <MetaWord label='Tenure' value={tenure} bracket={false} /> : undefined}
      >
        <div className='@container'>
          <div className='grid grid-cols-1 items-start gap-x-2.5 gap-y-4 @[28rem]:grid-cols-2'>
            <DateField field='employmentStart' label='From' />
            <DateField field='employmentEnd' label='To' />
          </div>
        </div>
      </Category>

      <Category
        title='Cost'
        {...categoryProps('cost')}
        action={<span className='text-textBaseSize text-placeholder'>Pre-fill only</span>}
      >
        <div className='flex flex-col gap-4'>
          <LineField
            name='defaultMonthlyCost'
            label='Default Monthly Cost'
            type='number'
            inputMode='decimal'
            step='0.01'
            min='0'
            value={draft.defaultMonthlyCost}
            disabled={!writer}
            error={formError?.field === 'defaultMonthlyCost'}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              set({ defaultMonthlyCost: e.target.value })
            }
          />
          <Segmented
            items={CURRENCY_ITEMS}
            value={draft.defaultCurrency}
            // A currency is always set: pressing the chosen one keeps it.
            onChange={(next) => next && set({ defaultCurrency: next })}
            label='currency'
            disabled={!writer}
          />
        </div>
      </Category>

      <Category title='Note' {...categoryProps('note')}>
        <NoteField />
      </Category>

      {isEditMode && (
        <Category title='Salary' {...categoryProps('salary')} action={<CreateTemplate />}>
          <SalaryRows />
        </Category>
      )}
      {/* A panel's height of room under the last category (the Models panel's rule): a child, not
          padding — sticky titles may not leave the form's content box. */}
      <div aria-hidden='true' className='min-[56.25rem]:h-[calc(100dvh-10rem)]' />
    </form>
  );
}

const ASK: Record<string, string> = {
  left: 'Mark as left?',
  restore: 'Restore employee?',
  archive: 'Archive employee?',
};
const ACT: Record<string, string> = { left: 'Mark Left', restore: 'Restore', archive: 'Archive' };

/**
 * The bottom action bar (the Models «contexterror» bar): the context in 24px ink at the left — the
 * held leave's question, a lifecycle step asked, or why the save was refused — and the system pair
 * at the right: Cancel / Save («Add» for a new person), or Cancel / the asked step.
 */
export function EmployeeActionBar({
  leaving,
  onContinue,
  onClose,
}: {
  leaving: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const {
    isEditMode,
    writer,
    submit,
    submitting,
    formError,
    dirty,
    reset,
    intent,
    dropIntent,
    runIntent,
    linked,
  } = useEmployeeSession();
  const bar = useRef<HTMLDivElement>(null);
  useDockBottom(bar, []);
  const typingOnPhone = useTypingOnPhone();
  const asking = intent && !leaving;
  const stillBooking = intent === 'archive' && linked.some(activeThisMonth);
  const message =
    formError?.text ??
    (leaving
      ? UNSAVED_MESSAGE
      : asking
        ? `${ASK[intent]}${stillBooking ? ' Salary keeps booking.' : ''}`
        : '');

  const items = asking
    ? [
        { key: 'cancel', label: 'Cancel', onClick: dropIntent },
        {
          key: 'act',
          label: ACT[intent],
          busy: submitting,
          disabled: submitting,
          onClick: () => void runIntent(),
        },
      ]
    : [
        {
          key: 'cancel',
          label: 'Cancel',
          onClick: () => {
            reset();
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
                disabled: submitting || (isEditMode && !dirty && !leaving),
                onClick: () => {
                  void submit().then((ok) => {
                    if (ok && leaving) onContinue();
                  });
                },
              },
            ]
          : []),
      ];

  return (
    <div
      ref={bar}
      role='region'
      aria-label='actions'
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-dock)] flex min-h-12.25 flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-bgColor py-2 pr-2.5 pl-[clamp(1.5rem,13vw,11.6875rem)] max-md:px-3',
        typingOnPhone && 'hidden',
      )}
    >
      <p
        role={formError ? 'alert' : 'status'}
        key={message}
        className='min-w-0 flex-1 text-head leading-tight text-ink motion-safe:animate-[employees-fade-up_700ms_var(--ease-soft)_both] max-md:text-textBaseSize'
      >
        {message}
      </p>
      <ButtonRow
        label={asking ? 'confirm or cancel' : 'save or cancel'}
        className='w-full shrink-0 md:w-[min(30.9375rem,46vw)]'
        items={items}
      />
    </div>
  );
}

/**
 * While the bar speaks, everything above it steps back to 32% (soft ease). Mark Left / Restore
 * stay lit: the To date they ask about is set right there.
 */
export function EmployeeDim({
  leaving,
  className,
  children,
}: {
  leaving: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { formError, intent } = useEmployeeSession();
  return (
    <div
      className={cn(
        'transition-opacity duration-700 ease-soft motion-reduce:transition-none',
        (leaving || !!formError || intent === 'archive') && 'opacity-32',
        className,
      )}
    >
      {children}
    </div>
  );
}
