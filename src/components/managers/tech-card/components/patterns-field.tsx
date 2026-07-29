import { adminService } from 'api/api';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { getBase64File } from 'lib/features/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { PatternUploadButton } from 'ui/components/pattern-upload-button';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import {
  MAX_PATTERN_BYTES,
  MAX_PATTERN_FILENAME,
  formatBytes,
  isPdfFile,
  patternUploadErrorMessage,
  stripDataUrlPrefix,
} from 'utils/pattern';
import { TechCardFormData } from './schema';

type PatternRow = {
  sizeId?: number;
  url?: string;
  filename?: string;
  sizeBytes?: number;
  version?: number;
  uploadedAt?: string;
};
type SizeSlot = { sizeId: number; label: string; files: Array<{ row: PatternRow; index: number }> };

// Rev.N of this sheet within its size, straight off the row — the server numbers a url it has not
// seen on this card and preserves the number for one it has. 0 is not revision zero, it is a row
// that was never numbered (a legacy upload), so it claims no revision rather than printing "v0".
function revisionOf(row: PatternRow): number | null {
  return row.version && row.version > 0 ? row.version : null;
}

// Per-size PDF выкройки (§2), as a coverage grid. Driven by the card's size range: one tile per
// declared size, each a drag-drop target. Coverage is the entire point of this panel — a size with
// no file is a hole the factory finds, not you — so coverage is the picture: a missing size is a
// red dashed tile, a size whose file trails the rest is blue, and sizes carrying files that are no
// longer in the range are shown rather than quietly saved.
//
// The flat `patterns` array stays the source of truth (full-replace on save); upload appends,
// ✕ removes.
export function PatternsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();

  const [dragSize, setDragSize] = useState<number | null>(null);
  const [busySize, setBusySize] = useState<number | null>(null);

  const rowsBySize = useMemo(() => {
    const m = new Map<number, Array<{ row: PatternRow; index: number }>>();
    fields.forEach((f, index) => {
      const row = f as PatternRow & { id: string };
      const sid = row.sizeId ?? 0;
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid)!.push({ row, index });
    });
    return m;
  }, [fields]);

  const inRange = useMemo(() => new Set(sizeIds), [sizeIds]);
  const nameOf = (id: number) =>
    id > 0 ? formatSizeName(sizeById.get(id) ?? `#${id}`) : 'no size';

  const slots: SizeSlot[] = orderSizes(sizeIds).map((sizeId) => ({
    sizeId,
    label: nameOf(sizeId),
    files: rowsBySize.get(sizeId) ?? [],
  }));

  // Files whose size was removed from the range (or never had one). They still go over the wire on
  // save, so they get a tile with an error border rather than a panel nobody scrolls to.
  const orphans: SizeSlot[] = [...rowsBySize.keys()]
    .filter((sid) => !inRange.has(sid))
    .sort((a, b) => a - b)
    .map((sizeId) => ({ sizeId, label: nameOf(sizeId), files: rowsBySize.get(sizeId) ?? [] }));

  // "Behind the others" only means something when at least two sheets carry a revision — an
  // unnumbered row reads as unknown, not old, so it neither raises nor loses this comparison.
  const versions = slots.flatMap((s) =>
    s.files.map((f) => revisionOf(f.row)).filter((v): v is number => v != null),
  );
  const latest = versions.length ? Math.max(...versions) : null;
  const versionOf = (slot: SizeSlot) => {
    const vs = slot.files.map((f) => revisionOf(f.row)).filter((v): v is number => v != null);
    return vs.length ? Math.max(...vs) : null;
  };
  const isStale = (slot: SizeSlot) => {
    const v = versionOf(slot);
    return latest != null && v != null && v < latest;
  };

  const covered = slots.filter((s) => s.files.length > 0).length;
  const staleCount = slots.filter(isStale).length;

  async function uploadTo(sizeId: number, file: File) {
    // Mirror the guards Admin.UploadPattern enforces so a bad drop fails instantly, not after a
    // 25 MB round-trip. Same checks PatternUploadButton runs on the click path.
    if (!isPdfFile(file)) {
      showMessage('PDF files only.', 'error');
      return;
    }
    if (file.size > MAX_PATTERN_BYTES) {
      showMessage('File too large — maximum size is 25 MB.', 'error');
      return;
    }
    setBusySize(sizeId);
    try {
      const raw = stripDataUrlPrefix(await getBase64File(file));
      const filename = file.name.slice(0, MAX_PATTERN_FILENAME);
      const res = await adminService.UploadPattern({ raw, filename });
      append({
        sizeId,
        url: res.url ?? '',
        filename: res.filename ?? filename,
        // size_bytes is an int64 — grpc-gateway serialises it as a STRING in JSON (despite the
        // generated `number` type). Coerce so the form holds a real number.
        sizeBytes: Number(res.sizeBytes ?? file.size) || 0,
      });
    } catch (e) {
      showMessage(patternUploadErrorMessage(e), 'error');
      console.error('UploadPattern failed', e);
    } finally {
      setBusySize(null);
    }
  }

  function renderSlot(slot: SizeSlot, orphan: boolean) {
    const { sizeId, label, files } = slot;
    const primary = files[files.length - 1]?.row;
    const has = files.length > 0;
    const busy = busySize === sizeId;
    const stale = !orphan && isStale(slot);
    const v = versionOf(slot);
    const dragging = !orphan && dragSize === sizeId;
    // When the PDF first landed, server-side and carried across saves — the age of a sheet is what
    // makes "behind the others" actionable. formatTechCardDate answers '—' for the unset timestamp
    // a just-uploaded row still carries; on a coverage grid that dash reads as data, so drop it.
    const uploaded = formatTechCardDate(primary?.uploadedAt);
    const uploadedOn = uploaded === '—' ? null : uploaded;

    const media = has ? (
      <a
        href={primary?.url || '#'}
        target='_blank'
        rel='noopener noreferrer'
        title={primary?.filename}
        className='block'
      >
        <Placeholder aspect='3/4' label={busy ? 'uploading…' : 'PDF'} />
      </a>
    ) : (
      <Placeholder aspect='3/4' dashed tone='error' label={busy ? 'uploading…' : 'drop'} />
    );

    // A stale tile gives its byte count up to the pill — but keeps the date, which is the fact
    // that makes the pill worth acting on.
    const sub = orphan ? (
      <Pill tone='warn'>not in range</Pill>
    ) : has ? (
      <>
        {stale && v != null ? (
          <Pill tone='attention'>v{v} stale</Pill>
        ) : (
          v != null && <span>v{v} · </span>
        )}
        {!stale && formatBytes(primary?.sizeBytes)}
        {uploadedOn && (
          <span>
            {stale ? ' ' : ' · '}
            {uploadedOn}
          </span>
        )}
      </>
    ) : (
      <span className='text-error'>missing</span>
    );

    return (
      <div
        key={orphan ? `orphan-${sizeId}` : sizeId}
        onDragOver={(e) => {
          if (orphan) return;
          e.preventDefault();
          setDragSize(sizeId);
        }}
        onDragLeave={() => setDragSize((s) => (s === sizeId ? null : s))}
        onDrop={(e) => {
          if (orphan) return;
          e.preventDefault();
          setDragSize(null);
          const f = e.dataTransfer.files?.[0];
          if (f) uploadTo(sizeId, f);
        }}
      >
        <Tile
          media={media}
          name={label}
          sub={sub}
          // while a file is over the tile the ink outline has to win, so the drop reads as aimed
          tone={!dragging && (orphan || (!has && !busy)) ? 'error' : undefined}
          selected={dragging}
        >
          {files.map(({ row, index }) => (
            <div key={index} className='mt-1 flex items-center gap-1'>
              <a
                href={row.url || '#'}
                target='_blank'
                rel='noopener noreferrer'
                title={row.filename}
                className='min-w-0 flex-1 truncate text-micro underline hover:opacity-70'
              >
                {row.filename || '(без имени)'}
              </a>
              <Button
                type='button'
                variant='secondary'
                size='xs'
                aria-label='remove pattern'
                className='shrink-0'
                onClick={() => remove(index)}
              >
                ✕
              </Button>
            </div>
          ))}
          {!orphan && (
            <PatternUploadButton
              label='+ PDF'
              disabled={busy}
              onUploaded={(p) => append({ sizeId, ...p })}
              // PatternUploadButton renders a page-sized Button; inside a tile it has to sit at
              // control density. It exposes no `size`, so the density is applied from here.
              className='mt-1 [&_button]:w-full [&_button]:px-1.5 [&_button]:py-px [&_button]:text-micro [&_button]:tracking-label'
            />
          )}
        </Tile>
      </div>
    );
  }

  if (sizeIds.length === 0 && orphans.length === 0) {
    return (
      <Text size='micro' variant='label'>
        задайте размерный ряд выше, чтобы загрузить выкройки по размерам
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      <Text size='micro' variant='label'>
        финальные выкройки изделия — отдельный PDF на каждый размер (можно несколько листов на
        размер). Перетащите файл на плитку или нажмите «+ PDF». Загруженный файл сохраняется вместе
        с тех картой.
      </Text>

      <Tiles min={112}>
        {slots.map((s) => renderSlot(s, false))}
        {orphans.map((s) => renderSlot(s, true))}
      </Tiles>

      <Text size='micro' variant='label'>
        {slots.length > 0 && `${covered} of ${slots.length} sizes have a pattern`}
        {slots.length - covered > 0 && ` · ${slots.length - covered} missing`}
        {staleCount > 0 && ` · ${staleCount} ${staleCount === 1 ? 'is' : 'are'} behind the others`}
        {orphans.length > 0 &&
          ` · ${orphans.length} ${orphans.length === 1 ? 'file set is' : 'file sets are'} attached to a size that left the range`}
      </Text>
    </div>
  );
}
