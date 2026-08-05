import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_FittingChangeRequest } from 'api/proto-http/admin';
import {
  useAddFittingChangeRequest,
  useDeleteFittingChangeRequest,
  useUpdateFittingChangeRequest,
} from 'components/managers/fittings/components/useFittingQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { fieldErrorSummary } from 'utils/field-errors';
import { FittingCarryOver } from './carry-over';
import { crPieceIds, FittingFormData } from './schema';
import { fittingZoneOptions, normalizeFittingZone } from './zone-options';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
const statusOptions = [
  { value: 'open', label: 'open' },
  { value: 'resolved', label: 'resolved' },
];
// target is the change CATEGORY (backend allow-list) — NOT a free "sleeve/collar" field (that
// location role is now zone + pieces, A2). Kept as a constrained select to stay aligned with the server.
const targetOptions = [
  { value: '', label: '— category —' },
  { value: 'pattern', label: 'pattern' },
  { value: 'construction', label: 'construction' },
  { value: 'material', label: 'material' },
  { value: 'grading', label: 'grading' },
  { value: 'other', label: 'other' },
];

type PieceOption = { value: number; label: string };
type CRValue = {
  target?: string;
  note?: string;
  calloutNumber?: number;
  zone?: string;
  pieceIds?: number[];
  status?: string;
  carriedFromId?: number;
};

// One remark routinely covers several cut-pieces («обработка низа на полочке и спинке»), so the piece
// picker is a toggle set, not a single select. Chips over a multi-<select> because a native multiple
// select hides what is picked behind a scroll box and needs ⌘-click to deselect.
function PiecePicker({
  selected,
  options,
  optionsReady,
  disabled,
  onChange,
}: {
  selected: number[];
  options: PieceOption[];
  // False while the style's cut-list is still loading. Without it every already-pinned piece would
  // be "not in options" for one render and flash as a red orphan chip before the list arrives.
  optionsReady: boolean;
  disabled?: boolean;
  onChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  // Pieces pinned on the remark that the style no longer offers — a piece deleted from the card, or a
  // carried-over item from a round whose cut-list has since changed. Shown so they can be un-pinned
  // instead of silently riding along invisibly.
  const orphans = optionsReady ? selected.filter((id) => !options.some((o) => o.value === id)) : [];

  if (!optionsReady) {
    return (
      <Text variant='inactive' size='small'>
        загрузка деталей…
      </Text>
    );
  }
  if (options.length === 0 && orphans.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        у этой тех карты ещё нет деталей — укажите зону
      </Text>
    );
  }
  return (
    <ChipRow>
      {options.map((o) => (
        <Chip
          key={o.value}
          selected={selected.includes(o.value)}
          pressed={selected.includes(o.value)}
          disabled={disabled}
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </Chip>
      ))}
      {orphans.map((id) => (
        <Chip
          key={`orphan-${id}`}
          selected
          tone='error'
          disabled={disabled}
          title='этой детали больше нет в тех карте'
          onClick={() => toggle(id)}
        >
          {`#${id}`}
        </Chip>
      ))}
    </ChipRow>
  );
}

// Piece ids only surface on the wire through the cut-list projection — reuse it for the piece picker.
function useStylePieces(techCardId?: number) {
  return useQuery({
    queryKey: ['stylePieces', techCardId ?? 0],
    queryFn: () => adminService.GetStyleCutList({ techCardId: techCardId ?? 0 }),
    enabled: !!techCardId,
  });
}

// Shared structured-remark input group (S26: category + zone + pieces + status). value/onChange so it
// works both RHF-bound (create) and local-state (edit CRUD).
function CRFields({
  value,
  onChange,
  pieceOptions,
  piecesReady,
  disabled,
}: {
  value: CRValue;
  onChange: (patch: Partial<CRValue>) => void;
  pieceOptions: PieceOption[];
  piecesReady: boolean;
  disabled?: boolean;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <label className='flex flex-col gap-1'>
          <Text size='small'>category</Text>
          <select
            className={cell}
            disabled={disabled}
            value={value.target ?? ''}
            onChange={(e) => onChange({ target: e.target.value })}
          >
            {targetOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>zone</Text>
          <select
            className={cell}
            disabled={disabled}
            value={normalizeFittingZone(value.zone)}
            onChange={(e) => onChange({ zone: e.target.value })}
          >
            {fittingZoneOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className='flex flex-col gap-1'>
        <Text size='small'>детали</Text>
        <PiecePicker
          selected={value.pieceIds ?? []}
          options={pieceOptions}
          optionsReady={piecesReady}
          disabled={disabled}
          onChange={(ids) => onChange({ pieceIds: ids })}
        />
      </div>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_8rem]'>
        <label className='flex flex-col gap-1'>
          <Text size='small'>what to change</Text>
          <input
            className={cell}
            disabled={disabled}
            placeholder='shorten 1cm'
            value={value.note ?? ''}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>callout # (opt.)</Text>
          <input
            className={cell}
            type='number'
            min='0'
            disabled={disabled}
            value={value.calloutNumber || 0}
            onChange={(e) => onChange({ calloutNumber: Number(e.target.value) || 0 })}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>status</Text>
          <select
            className={cell}
            disabled={disabled}
            value={value.status || 'open'}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// CREATE mode: the initial batch is written with the fitting (embedded, full-replace). Managed as an
// RHF field array so it saves atomically on create; after that, edit mode switches to dedicated CRUD.
function CreateModeList({
  techCardId,
  pieceOptions,
  piecesReady,
}: {
  techCardId?: number;
  pieceOptions: PieceOption[];
  piecesReady: boolean;
}) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'changeRequests' });
  const items = (useWatch({ control, name: 'changeRequests' }) ?? []) as CRValue[];
  const roundNumber = (useWatch({ control, name: 'roundNumber' }) as number) ?? 0;

  return (
    <div className='space-y-3'>
      {/* carry-over: continuing an open item appends it here so it's saved with this new fitting */}
      <FittingCarryOver
        techCardId={techCardId}
        roundNumber={roundNumber}
        onCarryToForm={(src) =>
          append({
            id: 0,
            target: src.target || '',
            note: src.note || '',
            calloutNumber: src.calloutNumber || 0,
            zone: normalizeFittingZone(src.zone),
            pieceIds: src.pieceIds ?? [],
            status: 'open',
            carriedFromId: src.id || 0,
          })
        }
      />
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          нет замечаний к доработке
        </Text>
      ) : (
        fields.map((f, index) => (
          <div key={f.id} className='flex flex-col gap-2'>
            <GroupLabel
              flush={index === 0}
              action={
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove change request'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              }
            >
              {`change #${index + 1}`}
            </GroupLabel>
            <CRFields
              value={items[index] ?? {}}
              pieceOptions={pieceOptions}
              piecesReady={piecesReady}
              onChange={(patch) => {
                for (const [k, v] of Object.entries(patch)) {
                  setValue(`changeRequests.${index}.${k}` as never, v as never, {
                    shouldDirty: true,
                  });
                }
              }}
            />
          </div>
        ))
      )}
      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() =>
          append({
            id: 0,
            target: '',
            note: '',
            calloutNumber: 0,
            zone: '',
            pieceIds: [],
            status: 'open',
            carriedFromId: 0,
          })
        }
      >
        add change request
      </Button>
    </div>
  );
}

// One editable structured remark (edit-mode CRUD): local draft + save/delete. Also used as the "add"
// form (onDelete omitted). carriedFromId (if any) is preserved read-only.
function EditableCR({
  initial,
  pieceOptions,
  piecesReady,
  onSave,
  onDelete,
  saving,
  isNew,
  index,
}: {
  initial: CRValue;
  pieceOptions: PieceOption[];
  piecesReady: boolean;
  onSave: (v: CRValue) => void;
  onDelete?: () => void;
  saving: boolean;
  isNew?: boolean;
  index?: number;
}) {
  const [v, setV] = useState<CRValue>(initial);
  const [dirty, setDirty] = useState(false);
  const onChange = (patch: Partial<CRValue>) => {
    setDirty(true);
    setV((prev) => ({ ...prev, ...patch }));
  };
  return (
    <div className='flex flex-col gap-2'>
      {!isNew && index != null && (
        <GroupLabel flush={index === 0}>{`change #${index + 1}`}</GroupLabel>
      )}
      {v.carriedFromId ? (
        <Text variant='inactive' size='small'>
          ↳ carried from a previous round (#{v.carriedFromId})
        </Text>
      ) : null}
      <CRFields
        value={v}
        onChange={onChange}
        pieceOptions={pieceOptions}
        piecesReady={piecesReady}
        disabled={saving}
      />
      <div className='flex justify-end gap-2'>
        {onDelete && (
          <Button
            type='button'
            variant='secondary'
            aria-label='delete change request'
            disabled={saving}
            onClick={onDelete}
          >
            delete
          </Button>
        )}
        <Button
          type='button'
          variant='main'
          size='lg'
          className='uppercase'
          disabled={saving || (!isNew && !dirty) || !(v.note?.trim() || v.target?.trim())}
          onClick={() => {
            onSave(v);
            if (isNew) setV(initial);
            setDirty(false);
          }}
        >
          {isNew ? 'add' : 'save'}
        </Button>
      </div>
    </div>
  );
}

// EDIT mode: manage the fitting's structured remarks individually (stable ids for carry-over).
function EditModeList({
  fittingId,
  techCardId,
  serverChangeRequests,
  pieceOptions,
  piecesReady,
}: {
  fittingId: number;
  techCardId?: number;
  serverChangeRequests: common_FittingChangeRequest[];
  pieceOptions: PieceOption[];
  piecesReady: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const { control } = useFormContext<FittingFormData>();
  const roundNumber = (useWatch({ control, name: 'roundNumber' }) as number) ?? 0;
  const add = useAddFittingChangeRequest(fittingId, techCardId);
  const update = useUpdateFittingChangeRequest(fittingId, techCardId);
  const del = useDeleteFittingChangeRequest(fittingId, techCardId);

  const toInsert = (v: CRValue) => ({
    fittingId,
    target: v.target?.trim() || '',
    note: v.note?.trim() || '',
    calloutNumber: v.calloutNumber || 0,
    zone: normalizeFittingZone(v.zone),
    pieceIds: v.pieceIds ?? [],
    pieceId: 0, // deprecated on the wire; pieceIds is authoritative
    status: v.status || 'open',
    carriedFromId: v.carriedFromId || 0,
  });

  return (
    <div className='space-y-3'>
      <FittingCarryOver techCardId={techCardId} roundNumber={roundNumber} fittingId={fittingId} />
      {serverChangeRequests.length === 0 ? (
        <Text variant='inactive' size='small'>
          нет замечаний — добавьте первый
        </Text>
      ) : (
        serverChangeRequests.map((cr, index) => (
          <EditableCR
            key={cr.id}
            index={index}
            saving={update.isPending || del.isPending}
            pieceOptions={pieceOptions}
            piecesReady={piecesReady}
            initial={{
              target: cr.target || '',
              note: cr.note || '',
              calloutNumber: cr.calloutNumber || 0,
              zone: normalizeFittingZone(cr.zone),
              pieceIds: crPieceIds(cr),
              status: cr.status || (cr.resolved ? 'resolved' : 'open'),
              carriedFromId: cr.carriedFromId || 0,
            }}
            onSave={(v) =>
              cr.id &&
              update.mutate(
                { id: cr.id, changeRequest: toInsert(v) },
                {
                  onSuccess: () => showMessage('Change request saved', 'success'),
                  onError: (e) => showMessage(fieldErrorSummary(e, 'Failed to save'), 'error'),
                },
              )
            }
            onDelete={() =>
              cr.id &&
              del.mutate(cr.id, {
                onSuccess: () => showMessage('Change request removed', 'success'),
                onError: (e) => showMessage(fieldErrorSummary(e, 'Failed to delete'), 'error'),
              })
            }
          />
        ))
      )}

      <div className='border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          add change request
        </Text>
        <EditableCR
          isNew
          saving={add.isPending}
          pieceOptions={pieceOptions}
          piecesReady={piecesReady}
          initial={{
            target: '',
            note: '',
            calloutNumber: 0,
            zone: '',
            pieceIds: [],
            status: 'open',
            carriedFromId: 0,
          }}
          onSave={(v) =>
            add.mutate(toInsert(v), {
              onSuccess: () => showMessage('Change request added', 'success'),
              onError: (e) => showMessage(fieldErrorSummary(e, 'Failed to add'), 'error'),
            })
          }
        />
      </div>
    </div>
  );
}

// The "what to change" work list (S26). CREATE: initial batch saved with the fitting. EDIT: dedicated
// CRUD (stable ids), the source of truth for carry-over across rounds.
export function ChangeRequestsFields({
  fittingId = 0,
  techCardId,
  serverChangeRequests = [],
}: {
  fittingId?: number;
  techCardId?: number;
  serverChangeRequests?: common_FittingChangeRequest[];
}) {
  const { data, isPending } = useStylePieces(techCardId);
  // A fitting always has a tech card, but until one is chosen the query is disabled and stays
  // `pending` forever — treat "no card" as ready-with-no-pieces rather than a permanent spinner.
  const piecesReady = !techCardId || !isPending;
  // No "— piece —" placeholder entry: the picker is a toggle set, so "none selected" IS the empty
  // state. A 0-valued option would render as a chip that pins a non-existent piece.
  const pieceOptions: PieceOption[] = (data?.pieces ?? [])
    .filter((p) => (p.pieceId ?? 0) > 0)
    .map((p) => ({
      value: p.pieceId as number,
      label: p.name?.trim() || `#${p.pieceId}`,
    }));

  return fittingId ? (
    <EditModeList
      fittingId={fittingId}
      techCardId={techCardId}
      serverChangeRequests={serverChangeRequests}
      pieceOptions={pieceOptions}
      piecesReady={piecesReady}
    />
  ) : (
    <CreateModeList
      techCardId={techCardId}
      pieceOptions={pieceOptions}
      piecesReady={piecesReady}
    />
  );
}
