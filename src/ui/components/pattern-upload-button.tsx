import { adminService } from 'api/api';
import { getBase64File } from 'lib/features/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  MAX_PATTERN_FILENAME,
  MAX_PATTERN_NAME,
  PATTERN_FILE_ACCEPT,
  clampPatternName,
  clampUtf8Bytes,
  formatBytes,
  isDxfFile,
  patternFileError,
  patternUploadErrorMessage,
  stripDataUrlPrefix,
} from 'utils/pattern';
import { Button } from './button';
import { ConfirmationModal } from './confirmation-modal';
import Input from './input';
import Text from './text';

export type UploadedPattern = {
  url: string;
  filename: string;
  sizeBytes: number;
  // Operator-entered display name from the naming modal. '' = deliberately unnamed — the
  // save path still sends it explicitly (absent-on-the-wire is reserved for stale clients).
  name: string;
  // Fabric BOM line this sheet is cut from, picked in the modal. '' when the caller offers no
  // slots (fittings have no BOM) or the operator left a PDF unbound.
  bomLineKey: string;
};

// A fabric slot the sheet can be bound to. Deliberately minimal — this control lives in ui/ and
// must not learn the tech-card's BOM shape.
export type PatternFabricSlot = { lineKey: string; name: string };

// One picked file staged in the naming modal, with its per-file upload status.
type StagedFile = {
  file: File;
  name: string;
  bomLineKey: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
};

// The naming step (§1): every upload — click or drag-drop, one file or a batch — passes
// through this modal so each выкройка can carry a display name (optional, may stay
// empty; placeholder shows the filename it falls back to). Confirm uploads sequentially
// via Admin.UploadPattern and hands each {url, filename, sizeBytes, name} to the caller;
// cancel drops the batch. Files already uploaded when a later one fails are NOT rolled
// back — they are in object storage and in form state, the modal reports the failure and
// keeps the failed rows staged for retry.
export function PatternUploadModal({
  files,
  onClose,
  onUploaded,
  fabricSlots,
}: {
  files: File[] | null; // null = closed
  onClose: () => void;
  onUploaded: (pattern: UploadedPattern) => void;
  // Fabric slots to bind sheets to. Omitted entirely by callers that have none (fittings), and
  // then no slot control renders and every sheet uploads unbound — the binding is a tech-card
  // concept, not a property of uploading a file.
  fabricSlots?: PatternFabricSlot[];
}) {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const slots = fabricSlots ?? [];
  // One fabric on the card means there is nothing to ask: preselect it. With two or more the
  // modal must not guess — which cloth a sheet is cut from is exactly the fact being captured.
  const soleSlot = slots.length === 1 ? slots[0].lineKey : '';

  // Re-stage whenever a new batch arrives. `files` is a fresh array per pick/drop, so
  // identity is the correct trigger. Layout effect: with a passive one the dialog's first
  // painted frame shows zero rows and a disabled confirm.
  useLayoutEffect(() => {
    setStaged(
      (files ?? []).map((file) => ({ file, name: '', bomLineKey: soleSlot, status: 'pending' })),
    );
    setBusy(false);
  }, [files, soleSlot]);

  const open = files != null && files.length > 0;
  // A DXF without a slot cannot be laid out: the раскладка would have no width, no кромка and
  // no idea which fabric's consumption it measures. Blocked here rather than discovered later,
  // while the operator still has the file in front of them. PDFs stay optional — a sheet a human
  // reads does not need a cloth.
  const missingSlot =
    slots.length > 0 && staged.some((r) => r.status !== 'done' && isDxfFile(r.file) && !r.bomLineKey);

  async function uploadAll() {
    setBusy(true);
    // Work on a local copy — setState is async and the loop needs the truth.
    const rows = [...staged];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === 'done') continue;
      rows[i] = { ...rows[i], status: 'uploading', error: undefined };
      setStaged([...rows]);
      try {
        const raw = stripDataUrlPrefix(await getBase64File(rows[i].file));
        // Byte-clamped, not char-sliced — the server counts BYTES and slice() can split a
        // surrogate pair.
        const filename = clampUtf8Bytes(rows[i].file.name, MAX_PATTERN_FILENAME);
        const res = await adminService.UploadPattern({ raw, filename });
        onUploaded({
          url: res.url ?? '',
          filename: res.filename ?? filename,
          // size_bytes is an int64 — grpc-gateway serialises it as a STRING in JSON (despite
          // the generated `number` type). Coerce so the form holds a real number (z.number()
          // rejects a string, which silently blocks the whole save).
          sizeBytes: Number(res.sizeBytes ?? rows[i].file.size) || 0,
          name: clampPatternName(rows[i].name),
          bomLineKey: rows[i].bomLineKey,
        });
        rows[i] = { ...rows[i], status: 'done' };
      } catch (e) {
        console.error('UploadPattern failed', e);
        rows[i] = { ...rows[i], status: 'error', error: patternUploadErrorMessage(e) };
      }
      setStaged([...rows]);
    }
    setBusy(false);
    if (rows.every((r) => r.status === 'done')) onClose();
  }

  const doneCount = staged.filter((r) => r.status === 'done').length;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
      onConfirm={uploadAll}
      onCancel={() => {
        if (!busy) onClose();
      }}
      title={staged.length === 1 ? 'название выкройки' : `названия выкроек (${staged.length})`}
      confirmLabel={doneCount > 0 ? 'повторить незагруженные' : 'загрузить'}
      cancelLabel={doneCount > 0 ? 'закрыть' : 'отмена'}
      confirmDisabled={busy || staged.every((r) => r.status === 'done') || missingSlot}
      closeOnConfirm={false}
    >
      <div className='space-y-2.5'>
        <Text size='micro' variant='label'>
          название необязательно — пустое поле оставит только имя файла
          {slots.length > 0 ? '; для DXF обязательна ткань — из неё берутся ширина и кромка' : ''}
        </Text>
        {staged.map((row, i) => (
          <div key={`${row.file.name}-${i}`} className='space-y-0.5'>
            <div className='flex items-baseline gap-1.5'>
              <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                {row.file.name}
              </Text>
              {isDxfFile(row.file) && (
                <span className='shrink-0 border border-textColor px-1 text-nano uppercase leading-snug tracking-label'>
                  dxf
                </span>
              )}
              <Text size='micro' variant='label' component='span' className='shrink-0'>
                {formatBytes(row.file.size)}
              </Text>
            </div>
            <Input
              name={`pattern-name-${i}`}
              value={row.name}
              placeholder={row.file.name}
              maxLength={MAX_PATTERN_NAME}
              disabled={busy || row.status === 'done'}
              autoComplete='off'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setStaged((rows) =>
                  rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                )
              }
            />
            {slots.length > 0 && (
              <select
                className='h-8 w-full border border-borderColor bg-bgColor px-1.5 text-micro'
                aria-label={`ткань для ${row.file.name}`}
                value={row.bomLineKey}
                disabled={busy || row.status === 'done'}
                onChange={(e) =>
                  setStaged((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, bomLineKey: e.target.value } : r)),
                  )
                }
              >
                <option value=''>
                  {isDxfFile(row.file) ? 'выберите ткань…' : 'без привязки к ткани'}
                </option>
                {slots.map((s) => (
                  <option key={s.lineKey} value={s.lineKey}>
                    {s.name || 'без названия'}
                  </option>
                ))}
              </select>
            )}
            {row.status === 'uploading' && (
              <Text size='micro' variant='label'>
                загрузка…
              </Text>
            )}
            {row.status === 'done' && (
              <Text size='micro' variant='label'>
                ✓ загружено
              </Text>
            )}
            {row.status === 'error' && (
              <Text size='micro' className='text-error'>
                {row.error}
              </Text>
            )}
          </div>
        ))}
      </div>
    </ConfirmationModal>
  );
}

type Props = {
  // Called once per file as it lands in object storage. The caller holds it as a pending
  // entry in form state and only persists it when the parent (tech card / fitting) is saved.
  onUploaded: (pattern: UploadedPattern) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  // Forwarded to the naming modal; see PatternUploadModal.
  fabricSlots?: PatternFabricSlot[];
};

// Shared выкройка upload control (§1): pick (multi-select, PDF/DXF, ≤40 MB each) → naming
// modal → base64 → Admin.UploadPattern per file → hand each {url, filename, sizeBytes,
// name} back to the caller. Errors are mapped (bad file vs server) and surfaced inline +
// via snackbar. Stateless beyond the staged batch — it never touches form state itself.
export function PatternUploadButton({
  onUploaded,
  label,
  disabled,
  className,
  fabricSlots,
}: Props) {
  const { showMessage } = useSnackBarStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `pattern-upload-${useId().replace(/:/g, '')}`;
  const [picked, setPicked] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(list: FileList | null) {
    setError(null);
    // Array.from, not spread — FileList iteration needs lib dom.iterable, which tsconfig omits.
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    // Pre-flight the whole batch; bad files are reported and dropped, good ones proceed.
    const bad = files.map((f) => ({ f, err: patternFileError(f) })).filter((x) => x.err);
    for (const x of bad) showMessage(`${x.f.name}: ${x.err}`, 'error');
    if (bad.length > 0) setError(bad.length === 1 ? bad[0].err : `отклонено файлов: ${bad.length}`);
    const good = files.filter((f) => !patternFileError(f));
    if (good.length > 0) setPicked(good);
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={inputId}
        type='file'
        accept={PATTERN_FILE_ACCEPT}
        multiple
        className='sr-only'
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          // Reset so re-picking the same file re-fires onChange.
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <Button
        type='button'
        variant='secondary'
        className='uppercase'
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label ?? '+ PDF/DXF'}
      </Button>
      {error && (
        <Text size='small' className='mt-1 block text-error'>
          {error}
        </Text>
      )}
      <PatternUploadModal
        files={picked}
        onClose={() => setPicked(null)}
        onUploaded={onUploaded}
        fabricSlots={fabricSlots}
      />
    </div>
  );
}
