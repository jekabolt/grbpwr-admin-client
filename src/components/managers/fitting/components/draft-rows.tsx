import { Button, Chip, Close } from 'ui';
import { notify } from 'lib/stores/store';
import { useState } from 'react';
import { DraftEdit, useFittingWorkspace } from './workspace';
import { useAddEdit } from './use-add-edit';

function useAcceptDraft() {
  const { drafts, setDrafts } = useFittingWorkspace();
  const addEdit = useAddEdit();
  return async (d: DraftEdit) => {
    try {
      await addEdit({ note: d.note, target: d.target });
      setDrafts(drafts.filter((x) => x !== d));
      return true;
    } catch {
      notify({ sev: 'error', subject: 'DRAFT EDITS', text: 'not added' });
      return false;
    }
  };
}

// Rendered by EditsList at the top of its list: one row per AI draft (✓ adds, × drops).
export function DraftRows() {
  const { drafts, setDrafts, readOnly } = useFittingWorkspace();
  const accept = useAcceptDraft();
  const [busy, setBusy] = useState(false);
  if (!drafts.length) return null;
  return (
    <>
      {drafts.map((d, i) => (
        <li
          key={`${i}-${d.note}`}
          className='flex flex-wrap items-start gap-x-2 border-b border-hairline py-1'
        >
          <span className='grid h-4 w-4 place-items-center border border-warning text-warning'>
            ·
          </span>
          <span className='min-w-0 flex-1 text-warning'>{d.note}</span>
          <span className='flex gap-1'>
            <Button
              type='button'
              variant='main'
              size='xs'
              aria-label='add draft'
              disabled={busy || readOnly}
              onClick={async () => {
                setBusy(true);
                await accept(d);
                setBusy(false);
              }}
            >
              ✓
            </Button>
            <Close
              size='sm'
              aria-label='drop draft'
              disabled={busy}
              onClick={() => setDrafts(drafts.filter((x) => x !== d))}
            />
          </span>
          <span className='basis-full flex gap-2 pl-6 text-labelColor'>
            <Chip tone='attention'>draft</Chip>
            {d.target && <span>{d.target}</span>}
          </span>
        </li>
      ))}
    </>
  );
}

// Rendered in the Edits header after «N open»: adds every draft one after another.
export function DraftsAddAll() {
  const { drafts, readOnly } = useFittingWorkspace();
  const addEdit = useAddEdit();
  const { setDrafts } = useFittingWorkspace();
  const [busy, setBusy] = useState(false);
  if (!drafts.length || readOnly) return null;
  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      className='text-warning'
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        let rest = [...drafts];
        for (const d of drafts) {
          try {
            await addEdit({ note: d.note, target: d.target });
            rest = rest.filter((x) => x !== d);
            setDrafts(rest);
          } catch {
            notify({ sev: 'error', subject: 'DRAFT EDITS', text: 'not added' });
            break;
          }
        }
        setBusy(false);
      }}
    >
      add all {drafts.length}
    </Button>
  );
}
