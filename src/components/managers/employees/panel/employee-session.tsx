import { Employee, OpexRecurring, OpexRecurringInsert } from 'api/proto-http/admin';
import {
  scrollerOf,
  scrollTopOf,
  softScrollTo,
  viewTopOf,
} from 'components/managers/model/components/panel-scroll';
import { currentMonth } from 'components/managers/opex/utils/options';
import { errorSentence, isRefusal, notifyFailure } from 'components/shared/notify-failure';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import { useArchiveEmployee, useUpsertEmployee, useUpsertSalaryTemplate } from '../utils/hooks';
import {
  day,
  type Draft,
  draftOf,
  MAX_NAME,
  MAX_NOTE,
  MAX_ROLE,
  monthFirst,
  sameDraft,
  todayISO,
} from '../utils/model';

export type EmployeeCategoryKey = 'required' | 'employment' | 'cost' | 'note' | 'salary';
export const EMPLOYEE_CATEGORY_ORDER: EmployeeCategoryKey[] = [
  'required',
  'employment',
  'cost',
  'note',
  'salary',
];
export const employeeCategoryId = (key: EmployeeCategoryKey) => `employee-category-${key}`;

/**
 * A lifecycle step asked in the action bar instead of a modal: `left` (the To date set, Save marks
 * them left), `restore` (the To date cleared), `archive` (ArchiveEmployee).
 */
export type Intent = 'left' | 'restore' | 'archive';

type Accordion = {
  activeCat: EmployeeCategoryKey;
  folded: Partial<Record<EmployeeCategoryKey, boolean>>;
  quiet: ReadonlySet<EmployeeCategoryKey>;
  toggleCat: (key: EmployeeCategoryKey, open: boolean) => void;
  activateCat: (key: EmployeeCategoryKey) => void;
  focusInto: (key: EmployeeCategoryKey) => void;
  reveal: (key: EmployeeCategoryKey) => void;
  foldPassed: (keys: EmployeeCategoryKey[]) => void;
};

type EmployeeSession = Accordion & {
  row?: Employee;
  isEditMode: boolean;
  /** The row is archived: shown, never written (no unarchive in the API). */
  readOnly: boolean;
  writer: boolean;
  base: string;
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  dirty: boolean;
  /** Back to what the panel opened with. */
  reset: () => void;
  formError: { text: string; field?: keyof Draft } | null;
  submit: () => Promise<boolean>;
  submitting: boolean;
  intent: Intent | null;
  startIntent: (intent: Intent) => void;
  dropIntent: () => void;
  /** Runs the asked lifecycle step; resolves `true` when it was stored. */
  runIntent: () => Promise<boolean>;
  roleOptions: string[];
  /** Non-archived salary templates linked to this person (empSalary v3). */
  linked: OpexRecurring[];
  createSalary: () => void;
  salaryBusy: boolean;
  pinned: boolean;
  togglePin: () => void;
};

const Context = createContext<EmployeeSession | null>(null);

export function useEmployeeSession(): EmployeeSession {
  const value = useContext(Context);
  if (!value) throw new Error('no EmployeeSessionProvider');
  return value;
}

/** The accordion of the panel: the Models panel's rules. */
function useAccordion(): Accordion {
  // Everything opens by default. Scrolling past a whole category folds it; it never reopens by
  // itself. A title click opens a folded category and brings its title to the top of the panel.
  const [activeCat, setActiveCat] = useState<EmployeeCategoryKey>('required');
  const [folded, setFolded] = useState<Partial<Record<EmployeeCategoryKey, boolean>>>({});
  const [quiet, setQuiet] = useState<ReadonlySet<EmployeeCategoryKey>>(new Set());
  const reveal = useCallback((key: EmployeeCategoryKey) => {
    setActiveCat(key);
    setQuiet((q) => {
      if (!q.has(key)) return q;
      const next = new Set(q);
      next.delete(key);
      return next;
    });
    setFolded((f) => (f[key] ? { ...f, [key]: false } : f));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const section = document.getElementById(employeeCategoryId(key));
        if (!section) return;
        const scroller = scrollerOf(section);
        const top =
          scrollTopOf(scroller) + section.getBoundingClientRect().top - viewTopOf(scroller);
        const row = section.firstElementChild as HTMLElement | null;
        const stuck = row ? parseFloat(getComputedStyle(row).top) || 0 : 0;
        softScrollTo(scroller, Math.max(0, top - stuck - 8));
      }),
    );
  }, []);
  const foldPassed = useCallback((keys: EmployeeCategoryKey[]) => {
    setQuiet((q) => new Set([...q, ...keys]));
    setFolded((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, true])) }));
  }, []);
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const focusInto = useCallback(
    (key: EmployeeCategoryKey) => {
      setActiveCat(key);
      if (foldedRef.current[key]) reveal(key);
    },
    [reveal],
  );
  return {
    activeCat,
    folded,
    quiet,
    toggleCat: (key, open) => (open ? reveal(key) : setFolded((f) => ({ ...f, [key]: true }))),
    activateCat: setActiveCat,
    focusInto,
    reveal,
    foldPassed,
  };
}

/**
 * ONE FORM FOR THE LIVE TILE, THE PANEL AND THE ACTION BAR (the Models session, for a person).
 * Create and edit share it; edit pre-fills from the row. `UpsertEmployee` replaces the row, so the
 * save sends every field. Lifecycle steps (Mark Left / Restore / Archive) are asked in the action
 * bar (`intent`), never in a modal.
 */
export function EmployeeSessionProvider({
  row,
  base,
  writer,
  roleOptions,
  recurring,
  initialIntent,
  pinned,
  onTogglePin,
  onSaved,
  onArchived,
  onDirtyChange,
  children,
}: {
  /** Undefined = a new person. */
  row?: Employee;
  base: string;
  writer: boolean;
  roleOptions: string[];
  recurring: OpexRecurring[];
  /** A lifecycle word pressed on the board tile opens the panel already asking. */
  initialIntent?: Intent | null;
  pinned: boolean;
  onTogglePin: () => void;
  onSaved: (id: number, created: boolean) => void;
  onArchived: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  children: ReactNode;
}) {
  const isEditMode = !!row?.id;
  const readOnly = !!row?.archived;
  const accordion = useAccordion();
  const { focusInto } = accordion;
  const upsert = useUpsertEmployee();
  const archive = useArchiveEmployee();
  const salaryMut = useUpsertSalaryTemplate();

  const seed = useRef<Draft>(draftOf(row?.employee, base));
  const [draft, setDraft] = useState<Draft>(seed.current);
  const [formError, setFormError] = useState<EmployeeSession['formError']>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback((patch: Partial<Draft>) => {
    setFormError(null);
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const dirty = !sameDraft(draft, seed.current);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const reset = useCallback(() => {
    setFormError(null);
    setIntent(null);
    setDraft(seed.current);
  }, []);

  const save = async (values: Draft): Promise<boolean> => {
    const name = values.fullName.trim();
    const stop = (text: string, field: keyof Draft) => {
      setFormError({ text, field });
      return false;
    };
    if (!name) return stop('Enter a name', 'fullName');
    if (name.length > MAX_NAME) return stop(`Name over ${MAX_NAME}`, 'fullName');
    if (values.role.trim().length > MAX_ROLE) return stop(`Role over ${MAX_ROLE}`, 'role');
    if (values.note.trim().length > MAX_NOTE) return stop(`Note over ${MAX_NOTE}`, 'note');
    if (values.defaultMonthlyCost.trim()) {
      const n = parseDecimalNumber(values.defaultMonthlyCost);
      if (!Number.isFinite(n) || n < 0) return stop('Cost below zero', 'defaultMonthlyCost');
    }
    // YYYY-MM-DD strings compare lexicographically.
    if (
      values.employmentEnd &&
      values.employmentStart &&
      values.employmentEnd < values.employmentStart
    )
      return stop('End before start', 'employmentEnd');
    setSubmitting(true);
    try {
      const res = await upsert.mutateAsync({
        id: row?.id ?? 0,
        employee: {
          fullName: name,
          role: values.role.trim(),
          employmentStart: values.employmentStart,
          employmentEnd: values.employmentEnd,
          defaultCurrency: values.defaultCurrency,
          defaultMonthlyCost: values.defaultMonthlyCost.trim()
            ? { value: normalizeDecimalInput(values.defaultMonthlyCost) }
            : undefined,
          note: values.note.trim(),
        },
      });
      seed.current = values;
      setDraft(values);
      setIntent(null);
      onSaved(res?.id || row?.id || 0, !isEditMode);
      return true;
    } catch (e) {
      if (isRefusal(e)) {
        setFormError({ text: errorSentence(e, 'Not saved') });
        return false;
      }
      setFormError({ text: 'Not saved' });
      notifyFailure(row?.id ? `EMPLOYEE ${row.id}` : 'EMPLOYEE', 'not saved', e);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const submit = () => save(draftRef.current);

  const startIntent = useCallback(
    (next: Intent) => {
      setFormError(null);
      setIntent(next);
      if (next === 'left') {
        // The last working day: the one on file, else today (empArchive v3).
        setDraft((d) => ({ ...d, employmentEnd: day(d.employmentEnd) || todayISO() }));
        // The To date shows it; a folded Employment opens (no scroll while it is open).
        focusInto('employment');
      } else if (next === 'restore') {
        setDraft((d) => ({ ...d, employmentEnd: '' }));
        focusInto('employment');
      }
    },
    [focusInto],
  );

  const dropIntent = useCallback(() => {
    setFormError(null);
    if (intent === 'left' || intent === 'restore')
      setDraft((d) => ({ ...d, employmentEnd: seed.current.employmentEnd }));
    setIntent(null);
  }, [intent]);

  const runIntent = async (): Promise<boolean> => {
    if (!intent) return false;
    if (intent === 'left') {
      const end = draftRef.current.employmentEnd;
      const start = draftRef.current.employmentStart;
      if (!end) {
        setFormError({ text: 'Set the To date', field: 'employmentEnd' });
        return false;
      }
      if (start && end < start) {
        setFormError({ text: 'Before the start', field: 'employmentEnd' });
        return false;
      }
    }
    if (intent !== 'archive') return save(draftRef.current);
    if (!row?.id) return false;
    const id = row.id;
    setSubmitting(true);
    try {
      await archive.mutateAsync(id);
      setIntent(null);
      seed.current = draftRef.current;
      onArchived();
      return true;
    } catch (e) {
      setFormError({ text: 'Not archived' });
      notifyFailure(`EMPLOYEE ${id}`, 'not archived', e);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // A lifecycle word pressed on the board tile: the panel opens asking it.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !initialIntent || !isEditMode || readOnly) return;
    asked.current = true;
    startIntent(initialIntent);
  }, [initialIntent, isEditMode, readOnly, startIntent]);

  // empSalary v3: templates already linked to THIS person (non-archived).
  const linked = useMemo(
    () =>
      row?.id ? recurring.filter((t) => !t.archived && t.recurring?.employeeId === row.id) : [],
    [recurring, row?.id],
  );
  const createSalary = () => {
    if (!row?.id || !draft.defaultMonthlyCost.trim()) return;
    const id = row.id;
    const recurringInsert: OpexRecurringInsert = {
      label: `${draft.fullName.trim() || 'employee'} — salary`,
      category: 'salaries',
      amount: { value: normalizeDecimalInput(draft.defaultMonthlyCost) },
      currency: draft.defaultCurrency,
      activeFrom: monthFirst(draft.employmentStart) || `${currentMonth()}-01`,
      activeTo: '',
      note: '',
      employeeId: id,
    };
    // The linked template replaces the word: that is the receipt.
    salaryMut.mutate(
      { id: 0, recurring: recurringInsert },
      {
        onError: (e) =>
          isRefusal(e)
            ? setFormError({ text: errorSentence(e, 'Template not created') })
            : notifyFailure(`EMPLOYEE ${id}`, 'template not created', e, createSalary),
      },
    );
  };

  const session: EmployeeSession = {
    ...accordion,
    row,
    isEditMode,
    readOnly,
    writer: writer && !readOnly,
    base,
    draft,
    set,
    dirty,
    reset,
    formError,
    submit,
    submitting,
    intent,
    startIntent,
    dropIntent,
    runIntent,
    roleOptions,
    linked,
    createSalary,
    salaryBusy: salaryMut.isPending,
    pinned,
    togglePin: onTogglePin,
  };

  return <Context.Provider value={session}>{children}</Context.Provider>;
}
