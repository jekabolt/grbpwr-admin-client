import {
  useAddFittingChangeRequest,
  useUpdateFittingChangeRequest,
} from 'components/managers/fittings/components/useFittingQuery';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, FoldCaret, Section } from 'ui';
import { fieldErrorSummary } from 'utils/field-errors';
import { CarryOverRows } from './carry-over';
import { DraftRows, DraftsAddAll } from './draft-rows';
import { EditComposer } from './edit-composer';
import { EditRowItem } from './edit-row';
import { buildEditRows, EditRow, FormCallout, nextEditNumber } from './edit-rows';
import { FittingFormData } from './schema';
import { changeRequestInsert, useEditChangeRequests } from './use-add-edit';
import { useFittingWorkspace } from './workspace';

type Patch = { target?: string; status?: 'open' | 'resolved' };

// The Edits block of the fitting workspace: open edits, then the resolved ones folded into one
// line, then the composer. An edit is a change request; its mark is the callout with its number.
export function EditsList() {
  const ws = useFittingWorkspace();
  const { fittingId, techCardId, readOnly, currentMediaId, hotNumber, setHotNumber } = ws;
  const { control } = useFormContext<FittingFormData>();
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const { changeRequests, pendingNumbers } = useEditChangeRequests();
  const add = useAddFittingChangeRequest(fittingId, techCardId);
  const update = useUpdateFittingChangeRequest(fittingId, techCardId);

  // Optimistic category / resolved per edit number, dropped once the server copy agrees.
  const [overrides, setOverrides] = useState<Map<number, Patch>>(new Map());
  // Legacy marks (no change request yet) whose first change is creating one right now.
  const [creating, setCreating] = useState<Set<number>>(new Set());
  const [showResolved, setShowResolved] = useState(false);

  const serverRows = useMemo(
    () => buildEditRows(callouts, changeRequests),
    [callouts, changeRequests],
  );
  const rows: EditRow[] = useMemo(
    () => serverRows.map((r) => ({ ...r, ...overrides.get(r.number) })),
    [serverRows, overrides],
  );

  useEffect(() => {
    if (overrides.size === 0) return;
    const next = new Map(overrides);
    for (const r of serverRows) {
      const o = next.get(r.number);
      if (!o || !r.crId) continue;
      if ((o.target ?? r.target) === r.target && (o.status ?? r.status) === r.status)
        next.delete(r.number);
    }
    if (next.size !== overrides.size) setOverrides(next);
  }, [serverRows, overrides]);

  useEffect(() => {
    if (creating.size === 0) return;
    const has = new Set(serverRows.filter((r) => r.crId).map((r) => r.number));
    if ([...creating].some((n) => has.has(n)))
      setCreating(new Set([...creating].filter((n) => !has.has(n))));
  }, [serverRows, creating]);

  const save = (row: EditRow, patch: Patch) => {
    const merged = { ...overrides.get(row.number), ...patch };
    setOverrides((m) => new Map(m).set(row.number, merged));
    const fail = (e: unknown) => {
      setOverrides((m) => {
        const next = new Map(m);
        next.delete(row.number);
        return next;
      });
      setCreating((s) => {
        const next = new Set(s);
        next.delete(row.number);
        return next;
      });
      notify({
        sev: 'error',
        subject: 'EDIT',
        text: 'not saved',
        detail: fieldErrorSummary(e, 'Failed'),
      });
    };
    const cr = row.crId ? changeRequests.find((c) => c.id === row.crId) : undefined;
    if (cr) {
      update.mutate(
        { id: row.crId, changeRequest: changeRequestInsert(cr, fittingId, merged) },
        {
          onError: fail,
        },
      );
      return;
    }
    // A legacy mark without a change request: its first change creates one with the mark's number.
    setCreating((s) => new Set(s).add(row.number));
    add.mutate(
      {
        fittingId,
        target: merged.target ?? row.target,
        note: row.callout?.value.note ?? row.note,
        calloutNumber: row.number,
        zone: '',
        pieceIds: [],
        pieceId: 0,
        status: merged.status ?? row.status,
        carriedFromId: 0,
      },
      { onError: fail },
    );
  };

  const open = rows.filter((r) => r.status !== 'resolved');
  const done = rows.filter((r) => r.status === 'resolved');
  const nextNumber = nextEditNumber(callouts, changeRequests);
  const carriedIds = useMemo(
    () => new Set(changeRequests.map((cr) => cr.carriedFromId ?? 0).filter((id) => id > 0)),
    [changeRequests],
  );

  // A mark picked on the stage: bring its row into view (and out of the fold).
  const listRef = useRef<HTMLDivElement | null>(null);
  const fromList = useRef(false);
  useEffect(() => {
    if (hotNumber == null) return;
    if (fromList.current) {
      fromList.current = false;
      return;
    }
    if (!showResolved && done.some((r) => r.number === hotNumber)) {
      setShowResolved(true);
      return;
    }
    listRef.current
      ?.querySelector(`[data-edit-row="${hotNumber}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotNumber, showResolved]);

  const setHotFromList = (n: number | null) => {
    fromList.current = n != null;
    setHotNumber(n);
  };

  const item = (row: EditRow) => (
    <EditRowItem
      key={row.number}
      row={row}
      hot={hotNumber === row.number}
      busy={pendingNumbers.has(row.number) || creating.has(row.number)}
      readOnly={readOnly}
      onOpen={() => {
        if (row.mediaId !== currentMediaId) ws.setCurrentMediaId(row.mediaId);
        setHotFromList(row.number);
      }}
      onHover={(on) => {
        if (!row.mediaId || row.mediaId !== currentMediaId) return;
        setHotFromList(on ? row.number : null);
      }}
      onCategory={(target) => save(row, { target })}
      onResolved={(resolved) => save(row, { status: resolved ? 'resolved' : 'open' })}
    />
  );

  return (
    <Section
      title='Edits'
      question={
        <span className='inline-flex flex-wrap items-baseline gap-2'>
          <span>{open.length} open</span>
          <DraftsAddAll />
        </span>
      }
    >
      <div ref={listRef}>
        <DraftRows />
        <ol>{open.map(item)}</ol>
        <CarryOverRows carriedIds={carriedIds} />
        {done.length > 0 && (
          <>
            <div className='pt-2.5'>
              <Button
                type='button'
                variant='underline'
                size='xs'
                aria-expanded={showResolved}
                onClick={() => setShowResolved((v) => !v)}
                className='-ml-1.5 inline-flex items-center text-labelColor hover:text-textColor'
              >
                {done.length} resolved
                <FoldCaret open={showResolved} />
              </Button>
            </div>
            {showResolved && <ol>{done.map(item)}</ol>}
          </>
        )}
      </div>
      {!readOnly && <EditComposer nextNumber={nextNumber} />}
    </Section>
  );
}
