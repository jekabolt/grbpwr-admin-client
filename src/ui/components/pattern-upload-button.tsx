import { adminService } from 'api/api';
import { getBase64File } from 'lib/features/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  MAX_PATTERN_FILENAME,
  MAX_PATTERN_NAME,
  PATTERN_FILE_ACCEPT,
  PATTERN_FILE_ACCEPT_DXF,
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
  // The cloth this sheet is cut from, as an OPAQUE scope key picked in the modal. '' when the
  // caller offers no scopes (fittings have no BOM) or the operator left a PDF unbound.
  //
  // Opaque on purpose: since 0267 the tech card binds a выкройка to a НАЗНАЧЕНИЕ where the card has
  // been sorted and to a BOM line where it has not, and this control lives in ui/ — it must not
  // learn either shape. It hands the key back and the caller translates it into the two wire fields.
  scopeKey: string;
};

// A cloth the sheet can be bound to: an opaque key and the fully composed label to show for it.
// The caller owns the wording precisely because it owns the meaning — «основной материал · Твил 1,
// Твил 2» for a назначение, «подкладка · Cupro 90» for a line nobody has sorted yet.
export type PatternScopeOption = { key: string; label: string };

// One picked file staged in the naming modal, with its per-file upload status.
type StagedFile = {
  file: File;
  name: string;
  scopeKey: string;
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
  fabricScopes,
  defaultScopeKey,
  dxfOnly,
}: {
  files: File[] | null; // null = closed
  onClose: () => void;
  onUploaded: (pattern: UploadedPattern) => void;
  // Cloths to bind sheets to. Omitted entirely by callers that have none (fittings), and then no
  // control renders and every sheet uploads unbound — the binding is a tech-card concept, not a
  // property of uploading a file.
  fabricScopes?: PatternScopeOption[];
  // Scope to preselect when the caller already knows which cloth the sheet belongs to — the tech
  // card's panel is organised BY cloth, so dropping a file into the «подкладка» group has already
  // answered the question. Still editable here; ignored when it names no live scope.
  defaultScopeKey?: string;
  // Restrict the pick to DXF. Opt-in, not the default: fittings legitimately attach PDF sheets.
  dxfOnly?: boolean;
}) {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const slots = fabricScopes ?? [];
  // The scope a new sheet starts on: the caller's stated one when it is real, else the card's only
  // cloth (with one there is nothing to ask). With two or more and no stated default the modal must
  // not guess — which cloth a sheet is cut from is exactly the fact being captured.
  const presetSlot =
    defaultScopeKey && slots.some((s) => s.key === defaultScopeKey)
      ? defaultScopeKey
      : slots.length === 1
        ? slots[0].key
        : '';

  // Re-stage whenever a new batch arrives. `files` is a fresh array per pick/drop, so
  // identity is the correct trigger. Layout effect: with a passive one the dialog's first
  // painted frame shows zero rows and a disabled confirm.
  useLayoutEffect(() => {
    setStaged(
      (files ?? []).map((file) => ({
        file,
        name: '',
        // A PDF is a sheet a human reads, not a thing cut from a cloth: it gets no fabric
        // control and no binding. Only DXFs carry one.
        scopeKey: isDxfFile(file) ? presetSlot : '',
        status: 'pending',
      })),
    );
    setBusy(false);
  }, [files, presetSlot]);

  const open = files != null && files.length > 0;
  // A DXF without a slot cannot be laid out: the раскладка would have no width, no кромка and
  // no idea which fabric's consumption it measures. Blocked here rather than discovered later,
  // while the operator still has the file in front of them. PDFs stay optional — a sheet a human
  // reads does not need a cloth.
  const missingSlot =
    slots.length > 0 &&
    staged.some((r) => r.status !== 'done' && isDxfFile(r.file) && !r.scopeKey);

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
          scopeKey: rows[i].scopeKey,
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
      title={staged.length === 1 ? 'pattern name' : `pattern names (${staged.length})`}
      confirmLabel={doneCount > 0 ? 'retry the ones not uploaded' : 'upload'}
      cancelLabel={doneCount > 0 ? 'close' : 'cancel'}
      confirmDisabled={busy || staged.every((r) => r.status === 'done') || missingSlot}
      closeOnConfirm={false}
    >
      <div className='space-y-2.5'>
        <Text size='micro' variant='label'>
          the name is optional — an empty field leaves just the file name
          {slots.length === 0
            ? ''
            : dxfOnly
              ? '; the material is required — the width and the selvedge are taken from it'
              : '; a material is required for DXF — the width and the selvedge are taken from it'}
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
            {slots.length > 0 && isDxfFile(row.file) && (
              <select
                className='h-8 w-full border border-borderColor bg-bgColor px-1.5 text-micro'
                aria-label={`material for ${row.file.name}`}
                value={row.scopeKey}
                disabled={busy || row.status === 'done'}
                onChange={(e) =>
                  setStaged((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, scopeKey: e.target.value } : r)),
                  )
                }
              >
                <option value=''>pick a material…</option>
                {slots.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            {row.status === 'uploading' && (
              <Text size='micro' variant='label'>
                uploading…
              </Text>
            )}
            {row.status === 'done' && (
              <Text size='micro' variant='label'>
                ✓ uploaded
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
  fabricScopes?: PatternScopeOption[];
  defaultScopeKey?: string;
  // Accept DXF only. OPT-IN — the tech card's выкройки are cut geometry and a PDF there is a
  // dead end, but a fitting sheet is a document a human reads and PDF stays legitimate for it.
  // Hard-coding the restriction in this shared control would have broken that call site.
  dxfOnly?: boolean;
};

// Shared выкройка upload control (§1): pick (multi-select, ≤40 MB each, PDF/DXF or DXF-only per
// `dxfOnly`) → naming modal → base64 → Admin.UploadPattern per file → hand each {url, filename,
// sizeBytes, name} back to the caller. Errors are mapped (bad file vs server) and surfaced inline
// + via snackbar. Stateless beyond the staged batch — it never touches form state itself.
export function PatternUploadButton({
  onUploaded,
  label,
  disabled,
  className,
  fabricScopes,
  defaultScopeKey,
  dxfOnly,
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
    const bad = files
      .map((f) => ({ f, err: patternFileError(f, { dxfOnly }) }))
      .filter((x) => x.err);
    for (const x of bad) showMessage(`${x.f.name}: ${x.err}`, 'error');
    if (bad.length > 0) setError(bad.length === 1 ? bad[0].err : `${bad.length} files rejected`);
    const good = files.filter((f) => !patternFileError(f, { dxfOnly }));
    if (good.length > 0) setPicked(good);
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={inputId}
        type='file'
        accept={dxfOnly ? PATTERN_FILE_ACCEPT_DXF : PATTERN_FILE_ACCEPT}
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
        {label ?? (dxfOnly ? '+ DXF' : '+ PDF/DXF')}
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
        fabricScopes={fabricScopes}
        defaultScopeKey={defaultScopeKey}
        dxfOnly={dxfOnly}
      />
    </div>
  );
}
