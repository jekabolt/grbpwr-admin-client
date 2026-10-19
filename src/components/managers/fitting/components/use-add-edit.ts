import {
  common_FittingChangeRequest,
  common_FittingChangeRequestInsert,
} from 'api/proto-http/admin';
import { useAddFittingChangeRequest } from 'components/managers/fittings/components/useFittingQuery';
import { notify } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFormContext } from 'react-hook-form';
import { fieldErrorSummary } from 'utils/field-errors';
import { FormCallout, nextEditNumber } from './edit-rows';
import { crPieceIds, FittingFormData } from './schema';
import { PendingMark, useFittingWorkspace } from './workspace';
import { normalizeFittingZone } from './zone-options';

// LANE C. The one way to add an edit (composer, draft ✓, «add all», carry-over ✓).
//
// The number is RESERVED SYNCHRONOUSLY at call time: the pending change request goes into a small
// per-fitting store before any await, so a burst of calls («add all» fires several) takes 1, 2, 3…
// and never collides, and the row shows at once with its final number (no flicker while the
// server copy refetches). The RPCs themselves run one after another on a per-fitting chain.
export type AddEditInput = {
  note: string;
  target?: string;
  mark?: PendingMark | null;
  // Carry-over: the open edit of an earlier round this one continues (zone / pieces copied).
  carriedFrom?: common_FittingChangeRequest | null;
};

type Store = {
  pending: common_FittingChangeRequest[];
  chain: Promise<unknown>;
  subs: Set<() => void>;
};

const stores = new Map<number, Store>();

function storeOf(fittingId: number): Store {
  let s = stores.get(fittingId);
  if (!s) {
    s = { pending: [], chain: Promise.resolve(), subs: new Set() };
    stores.set(fittingId, s);
  }
  return s;
}

function setPending(s: Store, next: common_FittingChangeRequest[]) {
  s.pending = next;
  s.subs.forEach((f) => f());
}

// Server change requests + the ones added here that the server copy does not show yet.
// `pendingNumbers` = rows whose change request is still on its way (their controls wait).
export function useEditChangeRequests(): {
  changeRequests: common_FittingChangeRequest[];
  pendingNumbers: Set<number>;
} {
  const { fittingId, changeRequests: server } = useFittingWorkspace();
  const s = storeOf(fittingId);
  const pending = useSyncExternalStore(
    useCallback(
      (cb: () => void) => {
        s.subs.add(cb);
        return () => {
          s.subs.delete(cb);
        };
      },
      [s],
    ),
    () => s.pending,
  );
  const serverNumbers = useMemo(
    () => new Set(server.map((cr) => cr.calloutNumber ?? 0).filter((n) => n > 0)),
    [server],
  );
  // Drop pending entries once the refetched server copy carries their number.
  useEffect(() => {
    if (pending.some((p) => serverNumbers.has(p.calloutNumber ?? 0)))
      setPending(
        s,
        s.pending.filter((p) => !serverNumbers.has(p.calloutNumber ?? 0)),
      );
  }, [pending, serverNumbers, s]);
  return useMemo(() => {
    const extra = pending.filter((p) => !serverNumbers.has(p.calloutNumber ?? 0));
    return {
      changeRequests: extra.length ? [...server, ...extra] : server,
      pendingNumbers: new Set(extra.map((p) => p.calloutNumber ?? 0)),
    };
  }, [pending, server, serverNumbers]);
}

// The write payload for a stored change request: every field the server sent goes back as is
// (zone / pieces / carried-from are not shown, but must survive), with `patch` on top.
export function changeRequestInsert(
  cr: common_FittingChangeRequest,
  fittingId: number,
  patch: Partial<Pick<common_FittingChangeRequestInsert, 'target' | 'status' | 'note'>> = {},
): common_FittingChangeRequestInsert {
  return {
    fittingId: cr.fittingId || fittingId,
    target: cr.target ?? '',
    note: cr.note ?? '',
    calloutNumber: cr.calloutNumber ?? 0,
    zone: normalizeFittingZone(cr.zone),
    pieceIds: crPieceIds(cr),
    pieceId: 0, // deprecated on the wire; pieceIds is authoritative
    status: cr.status || (cr.resolved ? 'resolved' : 'open'),
    carriedFromId: cr.carriedFromId ?? 0,
    ...patch,
  };
}

export function useAddEdit(): (input: AddEditInput) => Promise<number> {
  const { fittingId, techCardId, saveNow } = useFittingWorkspace();
  const { getValues, setValue } = useFormContext<FittingFormData>();
  const add = useAddFittingChangeRequest(fittingId, techCardId);
  const { changeRequests } = useEditChangeRequests();
  // Read at call time, not render time: several calls may land between two renders.
  const latest = useRef({ changeRequests, saveNow, add });
  latest.current = { changeRequests, saveNow, add };

  return useCallback(
    (input: AddEditInput) => {
      const s = storeOf(fittingId);
      const note = input.note.trim();
      const target = input.target ?? '';
      const callouts = (getValues('callouts') ?? []) as FormCallout[];
      const known = [...latest.current.changeRequests, ...s.pending];
      const n = nextEditNumber(callouts, known);

      const from = input.carriedFrom;
      const insert: common_FittingChangeRequestInsert = {
        fittingId,
        target,
        note,
        calloutNumber: n,
        zone: from ? normalizeFittingZone(from.zone) : '',
        pieceIds: from ? crPieceIds(from) : [],
        pieceId: 0,
        status: 'open',
        carriedFromId: from?.id ?? 0,
      };
      setPending(s, [
        ...s.pending,
        { ...insert, id: 0, resolved: false, createdBy: '', roundNumber: 0 },
      ]);

      if (input.mark) {
        const m = input.mark;
        setValue(
          'callouts',
          [
            ...callouts,
            {
              number: n,
              note,
              mediaId: m.mediaId,
              posX: m.posX,
              posY: m.posY,
              kind: m.kind,
              points: m.points,
            },
          ],
          { shouldDirty: true },
        );
        latest.current.saveNow();
      }

      const run = s.chain.then(() => latest.current.add.mutateAsync(insert));
      s.chain = run.catch(() => undefined);
      return run.then(
        () => n,
        (e) => {
          setPending(
            s,
            s.pending.filter((p) => p.calloutNumber !== n),
          );
          // The mark went into the form before the RPC; without its edit it would be an orphan.
          if (input.mark) {
            const now = (getValues('callouts') ?? []) as FormCallout[];
            setValue(
              'callouts',
              now.filter((c) => c.number !== n),
              { shouldDirty: true },
            );
            latest.current.saveNow();
          }
          notify({
            sev: 'error',
            subject: 'EDIT',
            text: 'not added',
            detail: fieldErrorSummary(e, 'Failed'),
          });
          throw e;
        },
      );
    },
    [fittingId, getValues, setValue],
  );
}
