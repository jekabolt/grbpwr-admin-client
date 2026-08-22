import { techCardIssueSeverityOptions, techCardIssueStatusOptions } from 'constants/filter';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';
import { operationHeading } from './operation-options';
import { useOperationWorkCatalog } from './useOperationWorkCatalog';
import { useFormPieces } from './piece-picker';

const OPEN = 'TECH_CARD_ISSUE_STATUS_OPEN';
const RESOLVED = 'TECH_CARD_ISSUE_STATUS_RESOLVED';
const HIGH = 'TECH_CARD_ISSUE_SEVERITY_HIGH';
const MEDIUM = 'TECH_CARD_ISSUE_SEVERITY_MEDIUM';

const emptyIssue = {
  operationNumber: 0,
  calloutNumber: 0,
  raisedBy: '',
  severity: MEDIUM,
  status: OPEN,
  description: '',
  resolutionNote: '',
};

// Sort order of the table: worst first, then unresolved first. Unknown values sink to the bottom
// rather than jumping to the top, so a legacy row never outranks a real `high · open`.
const SEVERITY_RANK: Record<string, number> = {
  [HIGH]: 0,
  [MEDIUM]: 1,
  TECH_CARD_ISSUE_SEVERITY_LOW: 2,
};
const STATUS_RANK: Record<string, number> = {
  [OPEN]: 0,
  [RESOLVED]: 1,
  TECH_CARD_ISSUE_STATUS_WONTFIX: 2,
};

type PillTone = 'ok' | 'warn' | 'attention' | 'mut';
// red = blocking · blue = mid-flight, needs a human · grey = neutral.
const severityTone = (v?: string): PillTone =>
  v === HIGH ? 'warn' : v === MEDIUM ? 'attention' : 'mut';
const statusTone = (v?: string): PillTone => (v === OPEN ? 'warn' : v === RESOLVED ? 'ok' : 'mut');

const severityLabel = (v?: string) =>
  techCardIssueSeverityOptions.find((o) => o.value === v)?.label ?? '—';
const statusLabel = (v?: string) =>
  techCardIssueStatusOptions.find((o) => o.value === v)?.label ?? '—';

type PickerOption = { value: number; label: string };
// What an issue's operation shows as. It is the COMPOSED heading, same as everywhere else — the
// step has no stored title, and identifying a step by its positional number alone is how a factory
// issue gets attached to the wrong one.
type OpInfo = { label: string };
type CalloutInfo = { part?: string };
type IssueValue = NonNullable<TechCardFormData['issues']>[number];

// The editing card, unchanged in content — only in default visibility. It used to be the whole
// list item; now it lives inside the expanded table row, so it drops its own frame and title.
// operationNumber/calloutNumber stay pickers sourced from the card's own operations/callouts (:62)
// rather than raw number inputs — a typo or a since-renumbered operation used to silently
// misattribute a flagged defect to the wrong step. Each picker also resolves the node/part label
// next to the number so the pick is legible without cross-checking another tab.
function IssueEditor({
  index,
  operationOptions,
  operationByNumber,
  calloutOptions,
  calloutByNumber,
}: {
  index: number;
  operationOptions: PickerOption[];
  operationByNumber: Map<number, OpInfo>;
  calloutOptions: PickerOption[];
  calloutByNumber: Map<number, CalloutInfo>;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const opNumber = (useWatch({ control, name: `issues.${index}.operationNumber` }) ?? 0) as number;
  const calloutNumber = (useWatch({ control, name: `issues.${index}.calloutNumber` }) ??
    0) as number;

  // If the referenced operation/callout was since removed or renumbered, keep the stored number
  // visible (as a flagged, findable option) instead of silently blanking the picker — losing the
  // number outright would be worse than showing it can't be resolved.
  const operationItems = useMemo(() => {
    if (!opNumber || operationByNumber.has(opNumber)) return operationOptions;
    return [...operationOptions, { value: opNumber, label: `#${opNumber} — not found (removed?)` }];
  }, [opNumber, operationOptions, operationByNumber]);
  const calloutItems = useMemo(() => {
    if (!calloutNumber || calloutByNumber.has(calloutNumber)) return calloutOptions;
    return [
      ...calloutOptions,
      { value: calloutNumber, label: `#${calloutNumber} — not found (removed?)` },
    ];
  }, [calloutNumber, calloutOptions, calloutByNumber]);

  const opInfo = opNumber ? operationByNumber.get(opNumber) : undefined;
  const calloutInfo = calloutNumber ? calloutByNumber.get(calloutNumber) : undefined;

  return (
    <div className='flex flex-col gap-2'>
      <div className='grid grid-cols-2 gap-2 lg:grid-cols-5'>
        <SelectField
          name={`issues.${index}.severity`}
          label='severity'
          items={techCardIssueSeverityOptions}
        />
        <SelectField
          name={`issues.${index}.status`}
          label='status'
          items={techCardIssueStatusOptions}
        />
        <InputField name={`issues.${index}.raisedBy`} label='raised by' />
        <div className='flex flex-col gap-0.5'>
          <SelectField
            name={`issues.${index}.operationNumber`}
            label='operation'
            items={operationItems}
            valueAsNumber
          />
          {opInfo && (
            <Text size='micro' variant='label' className='truncate'>
              {opInfo.label || '—'}
            </Text>
          )}
        </div>
        <div className='flex flex-col gap-0.5'>
          <SelectField
            name={`issues.${index}.calloutNumber`}
            label='sketch callout'
            items={calloutItems}
            valueAsNumber
          />
          {calloutInfo && (
            <Text size='micro' variant='label' className='truncate'>
              {calloutInfo.part || '—'}
            </Text>
          )}
        </div>
      </div>
      <TextareaField
        name={`issues.${index}.description`}
        label='description *'
        rows={2}
        maxLength={2000}
      />
      <TextareaField
        name={`issues.${index}.resolutionNote`}
        label='resolution note'
        rows={2}
        maxLength={2000}
      />
    </div>
  );
}

// The `where` column. A number that no longer resolves is shown WITH a `not found` pill rather
// than blanked — same defensive posture as the pickers in the editor below it.
function WhereCell({
  opNumber,
  calloutNumber,
  operationByNumber,
  calloutByNumber,
}: {
  opNumber: number;
  calloutNumber: number;
  operationByNumber: Map<number, OpInfo>;
  calloutByNumber: Map<number, CalloutInfo>;
}) {
  if (!opNumber && !calloutNumber) return <EmptyCell />;
  const opMissing = opNumber > 0 && !operationByNumber.has(opNumber);
  const calloutMissing = calloutNumber > 0 && !calloutByNumber.has(calloutNumber);
  const opInfo = operationByNumber.get(opNumber);
  return (
    <span className='inline-flex flex-wrap items-center justify-end gap-1'>
      {opNumber > 0 && (
        <Text
          size='micro'
          component='span'
          title={opInfo?.label || undefined}
        >
          op {opNumber}
        </Text>
      )}
      {opMissing && <Pill tone='warn'>not found</Pill>}
      {opNumber > 0 && calloutNumber > 0 && (
        <Text size='micro' variant='label' component='span'>
          ·
        </Text>
      )}
      {calloutNumber > 0 && (
        <Text size='micro' component='span' title={calloutByNumber.get(calloutNumber)?.part}>
          callout {calloutNumber}
        </Text>
      )}
      {calloutMissing && <Pill tone='warn'>not found</Pill>}
    </span>
  );
}

// Maker-flagged construction issues ("this seam is impossible"), pinned to an operation
// number and/or a sketch callout number. Raised by the seamstress, resolved by the
// technologist / manager.
//
// Read as a table sorted by severity then status: two open highs are visible in one glance
// instead of being three tall cards apart. Clicking a row expands it IN PLACE into the same
// editor the list used to render — the fields did not change, only their default visibility.
export function IssuesField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'issues' });
  const { errors } = useFormState({ control, name: 'issues' });
  // `fields` is a structural snapshot — it does not re-render on value edits, so the severity /
  // status the sort reads have to be watched separately.
  const values = (useWatch({ control, name: 'issues' }) ?? []) as IssueValue[];

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>());
  // A freshly flagged issue sorts to the top until the next reload, so it doesn't file itself away
  // under `medium` before it has been described.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState(false);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // `append` gives back no handle, and the row's RHF id is only knowable after the array updates —
  // so pin + open the new last row one render later.
  useEffect(() => {
    if (!pendingAdd) return;
    const last = fields[fields.length - 1];
    if (!last) return;
    setPinnedId(last.id);
    setExpanded((prev) => new Set(prev).add(last.id));
    setPendingAdd(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAdd, fields.length]);

  // Operation numbers are positional ((position+1)*10 — see operations-field.tsx / schema.ts),
  // not a stored id, so options are derived from the live `operations` array position, same as
  // OperationsField's own callout "pin" picker derives from `callouts`.
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as Array<{
    operationType?: string;
    machineType?: string;
    // Оба поля ЕЗДИЛИ здесь и раньше — объект передаётся в `headingOf` целиком, — но в приведении
    // названы не были, и читатель не видел, чем шаг называется. Класс шва (якорь вида) и работа
    // (названное имя) обязаны стоять в типе рядом с машинкой, иначе следующая правка выкинет их,
    // не заметив.
    seamClass?: string;
    work?: string;
    zone?: string;
    note?: string;
    inputKeys?: string[];
  }>;
  const formPieces = useFormPieces();
  // Каталог работ — одной подпиской на весь список жалоб: ссылка «join · подол» обязана называть
  // шаг тем же словом, каким его зовёт рельс, иначе жалоба указывает на соседний шаг.
  const { catalog: workCatalog } = useOperationWorkCatalog();
  const headingOf = useCallback(
    (o: {
      operationType?: string;
      machineType?: string;
      seamClass?: string;
      work?: string;
      zone?: string;
      note?: string;
      inputKeys?: string[];
    }) =>
      operationHeading({
        operationType: o.operationType as Parameters<typeof operationHeading>[0]['operationType'],
        // The verb of a machine step comes from its machine — an issue that points at «machine ·
        // hem» names no step on a card where nine steps are machine steps.
        machineType: o.machineType as Parameters<typeof operationHeading>[0]['machineType'],
        // ...и вид — из класса шва: ссылка «join · подол» на карточке, где подол отстрочен, не
        // называет шаг, а путает с соседним.
        seamClass: o.seamClass,
        // ...и названная работа бьёт обе выведенные лестницы (R8).
        work: o.work,
        workCatalog,
        zone: o.zone as Parameters<typeof operationHeading>[0]['zone'],
        // Ключ, не совпавший ни с одной деталью, — это УЗЕЛ, и он обязан быть виден. Просто
        // отбросить его (как делал .filter(Boolean) на именах) значило бы назвать джойн
        // «SHELL + HOOD» пустой строкой — то есть скрыть от автора именно то, что шаг собирает.
        pieceNames: (o.inputKeys ?? []).map(
          (k) => formPieces.find((p) => p.lineKey === k)?.name ?? `▣ ${k}`,
        ),
        note: o.note,
      }),
    [formPieces, workCatalog],
  );
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as Array<{
    number?: number;
    part?: string;
  }>;

  const operationOptions = useMemo<PickerOption[]>(
    () => [
      { value: 0, label: '— none —' },
      ...operations.map((o, i) => {
        const num = (i + 1) * 10;
        const info = headingOf(o);
        return { value: num, label: `#${num}${info ? ` — ${info}` : ''}` };
      }),
    ],
    [operations, headingOf],
  );
  const operationByNumber = useMemo(() => {
    const m = new Map<number, OpInfo>();
    operations.forEach((o, i) => m.set((i + 1) * 10, { label: headingOf(o) }));
    return m;
  }, [operations, headingOf]);

  const calloutOptions = useMemo<PickerOption[]>(
    () => [
      { value: 0, label: '— none —' },
      ...callouts
        .filter((c) => (c.number ?? 0) > 0)
        .map((c) => ({
          value: c.number as number,
          label: `#${c.number}${c.part?.trim() ? ` ${c.part}` : ''}`,
        })),
    ],
    [callouts],
  );
  const calloutByNumber = useMemo(() => {
    const m = new Map<number, CalloutInfo>();
    callouts.forEach((c) => {
      if ((c.number ?? 0) > 0) m.set(c.number as number, { part: c.part });
    });
    return m;
  }, [callouts]);

  // Rendered in severity order while keeping each row's real field-array index (the RHF paths the
  // editor registers are positional and must not follow the display order).
  const rows = useMemo(
    () =>
      fields
        .map((f, index) => ({ key: f.id, index }))
        .sort((a, b) => {
          const pin = (a.key === pinnedId ? 0 : 1) - (b.key === pinnedId ? 0 : 1);
          if (pin !== 0) return pin;
          const av = values[a.index];
          const bv = values[b.index];
          const sev =
            (SEVERITY_RANK[av?.severity ?? ''] ?? 9) - (SEVERITY_RANK[bv?.severity ?? ''] ?? 9);
          if (sev !== 0) return sev;
          const st = (STATUS_RANK[av?.status ?? ''] ?? 9) - (STATUS_RANK[bv?.status ?? ''] ?? 9);
          if (st !== 0) return st;
          return a.index - b.index;
        }),
    [fields, values, pinnedId],
  );

  // A row holding a validation error (description is required) must be reachable, so it opens
  // itself and cannot be collapsed away while the error stands.
  const issueErrors = errors.issues as unknown as Array<unknown> | undefined;
  const hasError = (index: number) => !!issueErrors?.[index];

  const openCount = values.filter((v) => v?.status === OPEN).length;

  const removeAt = (index: number, key: string) => {
    remove(index);
    if (pinnedId === key) setPinnedId(null);
    setExpanded((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className='flex flex-col border border-borderColor bg-bgColor p-3'>
      <SectionHeader
        title='maker flags'
        question='— each issue can point at an operation and a sketch callout; open ones block the release'
        action={
          <Button
            type='button'
            variant='main'
            size='sm'
            onClick={() => {
              append({ ...emptyIssue });
              setPendingAdd(true);
            }}
          >
            + flag an issue
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Text size='micro' variant='label'>
          no issues flagged
        </Text>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <th>sev</th>
                <th>
                  <span className='block text-left'>issue</span>
                </th>
                <th>where</th>
                <th>raised by</th>
                <th>status</th>
                <th aria-label='row actions' />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, index }) => {
                const v = values[index];
                const errored = hasError(index);
                const isOpen = expanded.has(key) || errored;
                const description = v?.description?.trim() ?? '';
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggle(key)}
                      aria-expanded={isOpen}
                      className='cursor-pointer'
                    >
                      <td className='whitespace-nowrap'>
                        <Pill tone={severityTone(v?.severity)}>{severityLabel(v?.severity)}</Pill>
                      </td>
                      <td className='w-full'>
                        <span className='block text-left' title={description || undefined}>
                          {description ? (
                            <Text size='micro' component='span' className='line-clamp-1'>
                              {description}
                            </Text>
                          ) : (
                            <EmptyCell>no description yet</EmptyCell>
                          )}
                        </span>
                      </td>
                      <td className='whitespace-nowrap'>
                        <WhereCell
                          opNumber={v?.operationNumber ?? 0}
                          calloutNumber={v?.calloutNumber ?? 0}
                          operationByNumber={operationByNumber}
                          calloutByNumber={calloutByNumber}
                        />
                      </td>
                      <td className='whitespace-nowrap'>
                        {v?.raisedBy?.trim() ? (
                          <Text size='micro' component='span'>
                            {v.raisedBy}
                          </Text>
                        ) : (
                          <EmptyCell />
                        )}
                      </td>
                      <td className='whitespace-nowrap'>
                        <Pill tone={statusTone(v?.status)}>{statusLabel(v?.status)}</Pill>
                      </td>
                      <td className='whitespace-nowrap'>
                        <span className='inline-flex items-center gap-1'>
                          {errored && <Pill tone='warn'>needs a fix</Pill>}
                          <Button
                            type='button'
                            variant='secondary'
                            size='xs'
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'collapse issue' : 'expand issue'}
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              toggle(key);
                            }}
                          >
                            {isOpen ? '▾' : '▸'}
                          </Button>
                          <Button
                            type='button'
                            variant='secondary'
                            size='xs'
                            aria-label='remove issue'
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              removeAt(index, key);
                            }}
                          >
                            ✕
                          </Button>
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6}>
                          <IssueEditor
                            index={index}
                            operationOptions={operationOptions}
                            operationByNumber={operationByNumber}
                            calloutOptions={calloutOptions}
                            calloutByNumber={calloutByNumber}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </DataTable>

          <Text size='micro' variant='label' className='mt-1'>
            {openCount > 0
              ? `${openCount} open issue${openCount > 1 ? 's' : ''} block${
                  openCount > 1 ? '' : 's'
                } the release`
              : 'no open issues — this tab is not holding the release'}
          </Text>
        </>
      )}
    </div>
  );
}
