import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { useSnackBarStore } from 'lib/stores/store';
import { Suspense, lazy, useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DxfQuickViewModal } from 'ui/components/dxf-quick-view-modal';
import Input from 'ui/components/input';
import { PatternUploadButton, PatternUploadModal } from 'ui/components/pattern-upload-button';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import {
  MAX_PATTERN_NAME,
  clampPatternName,
  formatBytes,
  isDxfUrl,
  patternFileError,
} from 'utils/pattern';
import { ulid } from 'utils/ulid';
import { sizeTokensOf } from './nesting/block-code';
import type { NestingFile } from './nesting/use-nesting';
import { TechCardFormData } from './schema';

// The whole nesting feature (modal + worker + dxf/clipper deps) lives in a lazy chunk —
// nothing loads until someone actually opens a раскладка.
const NestingModal = lazy(() =>
  import('./nesting/nesting-modal').then((m) => ({ default: m.NestingModal })),
);
// Same lazy neighbourhood: the matching dialog parses DXF through the same worker.
const PieceMatchModal = lazy(() =>
  import('./nesting/piece-match-modal').then((m) => ({ default: m.PieceMatchModal })),
);

type PatternRow = {
  sizeId?: number;
  url?: string;
  filename?: string;
  name?: string;
  sizeBytes?: number;
  version?: number;
  uploadedAt?: string;
  lineKey?: string;
  bomLineKey?: string;
};
type SizeSlot = { sizeId: number; label: string; files: Array<{ row: PatternRow; index: number }> };

// What the operator calls the sheet — the display name when given, else the filename.
function labelOf(row?: PatternRow): string {
  return row?.name || row?.filename || '(без имени)';
}

// Rev.N of this sheet within its size, straight off the row — the server numbers a url it has not
// seen on this card and preserves the number for one it has. 0 is not revision zero, it is a row
// that was never numbered (a legacy upload), so it claims no revision rather than printing "v0".
function revisionOf(row: PatternRow): number | null {
  return row.version && row.version > 0 ? row.version : null;
}

// Per-size выкройки (§2), PDF or DXF, as a coverage grid. Driven by the card's size range: one
// tile per declared size, each a drag-drop target. Coverage is the entire point of this panel — a
// size with no file is a hole the factory finds, not you — so coverage is the picture: a missing
// size is a red dashed tile, a size whose file trails the rest is blue, and sizes carrying files
// that are no longer in the range are shown rather than quietly saved.
//
// Every upload (click or drop) passes through the naming modal, so a sheet can carry an operator
// name («перед», «рукав x2») next to its factory filename; the name is editable in place after.
// The flat `patterns` array stays the source of truth (full-replace on save); upload appends,
// ✕ removes.
export function PatternsField({
  techCardId,
  canEdit = true,
  savedSizeIds,
}: {
  techCardId?: number;
  // Gates «сохранить раскладку» (RBAC write + not released), mirroring MarkersSection.
  canEdit?: boolean;
  // Server-known size range: a form-added size cannot take a marker until the card saves.
  savedSizeIds?: number[];
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  // Live row values. `fields` is a snapshot that array actions refresh but setValue on a
  // nested path does NOT — rename writes via setValue (a useFieldArray.update would replace
  // the row and revert any sibling Controller-written field), so display must read live.
  const liveRows = (useWatch({ control, name: 'patterns' }) ?? []) as PatternRow[];
  // A save's form.reset() overwrites concurrent edits and un-dirties them — freeze renames
  // for its duration.
  const { isSubmitting } = useFormState({ control });
  // Осмысленные имена экспортов раскладки: SEASON-STYLE-размер-…
  const season = (useWatch({ control, name: 'season' }) ?? '') as string;
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) ?? '') as string;

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();

  const [dragSize, setDragSize] = useState<number | null>(null);
  // Files dropped onto a tile, staged for the naming modal (click uploads stage inside
  // PatternUploadButton; drops land here because the modal must know the target size).
  const [droppedOn, setDroppedOn] = useState<{ sizeId: number; files: File[] } | null>(null);
  // The pattern sheet open in the in-app viewer (null = closed). PDF and DXF rows share this
  // state and split into the two viewers at the bottom.
  const [viewing, setViewing] = useState<PatternRow | null>(null);
  // Inline rename in progress: which row and the draft value.
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  // Раскладка modal: the DXF files of one size, pooled (null = closed).
  const [nesting, setNesting] = useState<{
    sizeLabel: string;
    sizeId: number;
    files: NestingFile[];
    // The fabric these sheets are bound to; '' for legacy unbound DXFs, which the modal then
    // asks about as before.
    bomLineKey: string;
  } | null>(null);
  // «сопоставить детали»: the same DXF set, opened against the cut-piece list instead of the
  // nesting engine (null = closed).
  const [matching, setMatching] = useState<{
    sizeLabel: string;
    bomLineKey: string;
    fabricName: string;
    files: NestingFile[];
  } | null>(null);
  // The card's fabric BOM lines, live from form state — the save-marker dialog's slot select.
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    name?: string;
    unit?: string;
    fabricWidth?: string;
    wastagePercent?: string;
    effectiveFabricWidthCm?: string;
    selvedgeCm?: string;
    lineKey?: string;
    id?: number;
  }>;
  const fabricBomLines = useMemo(
    () =>
      bomItems
        .filter((b) => (b.section ?? '') === 'TECH_CARD_BOM_SECTION_FABRIC' && b.lineKey)
        .map((b) => ({
          id: b.id ?? 0,
          lineKey: b.lineKey!,
          name: b.name ?? '',
          unit: b.unit ?? '',
          fabricWidth: b.fabricWidth ?? '',
          wastagePercent: b.wastagePercent ?? '',
          // read-only enrichment (0259) the card read filled; the раскладка prefills its
          // cutting width from these instead of the 140 cm default.
          effectiveFabricWidthCm: b.effectiveFabricWidthCm ?? '',
          selvedgeCm: b.selvedgeCm ?? '',
        })),
    [bomItems],
  );
  // Every fabric line of the card, saved or not. The card save upserts the BOM BEFORE it
  // reconciles patterns and aliases (techcard.go: bom at :1185, aliases :1198, patterns :1223),
  // so a line added on the BOM tab a moment ago resolves by the time its key is used. Filtering
  // on a server id would have left a brand-new card with no slot control at all — and therefore
  // no binding, no per-fabric раскладка and no matching — until after a save and a return trip.
  const uploadSlots = useMemo(
    () => fabricBomLines.map((b) => ({ lineKey: b.lineKey, name: b.name })),
    [fabricBomLines],
  );
  const liveFabricKeys = useMemo(
    () => new Set(fabricBomLines.map((b) => b.lineKey)),
    [fabricBomLines],
  );

  const rowsBySize = useMemo(() => {
    const m = new Map<number, Array<{ row: PatternRow; index: number }>>();
    fields.forEach((f, index) => {
      // Structure (order, ids) from the array snapshot; values from the live form state so
      // setValue-written fields (rename) show through.
      const row = { ...(f as PatternRow & { id: string }), ...liveRows[index] };
      const sid = row.sizeId ?? 0;
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid)!.push({ row, index });
    });
    return m;
  }, [fields, liveRows]);

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

  // Drop path of the naming modal: pre-flight here (instant feedback, same guards the
  // server enforces), then stage the good files for naming + upload.
  function stageDrop(sizeId: number, list: FileList | null) {
    // Array.from, not spread — FileList iteration needs lib dom.iterable, which tsconfig omits.
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const bad = files.map((f) => ({ f, err: patternFileError(f) })).filter((x) => x.err);
    for (const x of bad) showMessage(`${x.f.name}: ${x.err}`, 'error');
    const good = files.filter((f) => !patternFileError(f));
    if (good.length > 0) setDroppedOn({ sizeId, files: good });
  }

  // ВСЕ DXF карточки, сгруппированные по ТКАНИ — через все размерные слоты сразу.
  //
  // Один DXF несёт весь размерный ряд и относится к ткани, а не к размеру: подклад, карманы и
  // основная ткань — это три файла, а не пятнадцать. Пока раскладка открывалась с плитки
  // размера, файл, залитый в слот M, был не виден из слота XS — там просто нет строки, — и
  // операцию приходилось повторять на каждой плитке. Размер выбирается уже ВНУТРИ диалога, по
  // именам блоков.
  //
  // Слот остаётся местом ХРАНЕНИЯ строки (у выкройки на сервере есть size_id), но перестаёт
  // быть смыслом.
  const dxfByFabric = useMemo(() => {
    const byFabric = new Map<string, { files: NestingFile[]; sizeIds: Set<number> }>();
    for (const [sid, rows] of rowsBySize) {
      for (const { row } of rows) {
        if (!row.url || !isDxfUrl(row.url)) continue;
        const key = row.bomLineKey ?? '';
        const entry = byFabric.get(key) ?? { files: [], sizeIds: new Set<number>() };
        entry.files.push({ name: row.name || row.filename || 'выкройка.dxf', url: row.url });
        entry.sizeIds.add(sid);
        byFabric.set(key, entry);
      }
    }
    const order = new Map(fabricBomLines.map((b, i) => [b.lineKey, i]));
    return [...byFabric.entries()]
      .map(([bomLineKey, v]) => ({ bomLineKey, ...v }))
      .sort((a, b) => (order.get(a.bomLineKey) ?? 1e9) - (order.get(b.bomLineKey) ?? 1e9));
  }, [rowsBySize, fabricBomLines]);

  // Размерный токен из имён блоков → id размера карточки. Нужен раскладке: один DXF несёт весь
  // ряд, и маркер обязан лечь на ВЫБРАННЫЙ внутри размер, а не на тот, в чей слот файл положили.
  const sizeIdByToken = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of sizeIds) {
      for (const t of sizeTokensOf(sizeById.get(id))) if (!m.has(t)) m.set(t, id);
    }
    return m;
  }, [sizeIds, sizeById]);

  const fabricName = (lineKey: string) =>
    fabricBomLines.find((b) => b.lineKey === lineKey)?.name?.trim() || 'без ткани';

  function commitRename(index: number, value: string) {
    // '' is a legal committed value — it clears the name and the row falls back to the
    // filename (the save path still sends name explicitly, so the clear reaches the server).
    // setValue on the nested path, NOT useFieldArray.update: update() replaces the whole
    // row from the stale `fields` snapshot, reverting sibling fields written by other
    // controls, and remounts the row. Byte-clamped — the server counts UTF-8 bytes.
    setValue(`patterns.${index}.name`, clampPatternName(value), { shouldDirty: true });
    setEditing(null);
  }

  function renderSlot(slot: SizeSlot, orphan: boolean) {
    const { sizeId, label, files } = slot;
    const primary = files[files.length - 1]?.row;
    const has = files.length > 0;
    const stale = !orphan && isStale(slot);
    const v = versionOf(slot);
    const dragging = !orphan && dragSize === sizeId;
    // When the file first landed, server-side and carried across saves — the age of a sheet is what
    // makes "behind the others" actionable. formatTechCardDate answers '—' for the unset timestamp
    // a just-uploaded row still carries; on a coverage grid that dash reads as data, so drop it.
    const uploaded = formatTechCardDate(primary?.uploadedAt);
    const uploadedOn = uploaded === '—' ? null : uploaded;
    // Grouped once per tile: it was being recomputed on every button and every label, which
    // re-walked the whole file list several times per render.

    const media = has ? (
      <button
        type='button'
        onClick={() => primary && setViewing(primary)}
        title={`посмотреть ${labelOf(primary)}`}
        className='relative block w-full cursor-pointer'
      >
        {isDxfUrl(primary?.url) ? (
          // No native DXF renderer to borrow a first page from — a flat marked tile, the
          // WebGL viewer is one click away.
          <span className='flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 border border-borderColor bg-bgColor'>
            <span className='border border-textColor px-1.5 py-0.5 text-micro uppercase leading-none tracking-label'>
              dxf
            </span>
            <span className='text-nano uppercase tracking-label text-labelColor'>чертёж</span>
          </span>
        ) : (
          /* First-page preview via the browser's own PDF renderer — no extra dependency. It is
             non-interactive (the tile owns the click → opens the viewer); if the storage host
             blocks framing, the fallback placeholder shows and the viewer's "open in new tab"
             still works. */
          <object
            data={`${primary?.url ?? ''}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            type='application/pdf'
            aria-label={labelOf(primary)}
            tabIndex={-1}
            className='pointer-events-none block aspect-[3/4] w-full border border-borderColor bg-bgColor'
          >
            <Placeholder aspect='3/4' label='PDF' />
          </object>
        )}
        <span className='pointer-events-none absolute bottom-0 left-0 bg-textColor px-1 py-px text-nano uppercase leading-none tracking-label text-bgColor'>
          view
        </span>
      </button>
    ) : (
      <Placeholder aspect='3/4' dashed tone='error' label='drop' />
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
          stageDrop(sizeId, e.dataTransfer.files);
        }}
      >
        <Tile
          media={media}
          name={label}
          sub={sub}
          // while a file is over the tile the ink outline has to win, so the drop reads as aimed
          tone={!dragging && (orphan || !has) ? 'error' : undefined}
          selected={dragging}
        >
          {files.map(({ row, index }) => (
            <div key={index} className='mt-1'>
              {editing?.index === index ? (
                <Input
                  name={`pattern-rename-${index}`}
                  value={editing.value}
                  placeholder={row.filename || 'название'}
                  maxLength={MAX_PATTERN_NAME}
                  autoFocus
                  autoComplete='off'
                  className='px-1 py-0 text-micro'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditing({ index, value: e.target.value })
                  }
                  onBlur={() => commitRename(index, editing.value)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename(index, editing.value);
                    }
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <div className='flex items-center gap-1'>
                  <button
                    type='button'
                    onClick={() => setViewing(row)}
                    title={`посмотреть ${row.filename ?? ''}`}
                    className='min-w-0 flex-1 truncate text-left text-micro underline hover:opacity-70'
                  >
                    {labelOf(row)}
                  </button>
                  {isDxfUrl(row.url) && (
                    <span className='shrink-0 border border-textColor px-1 text-nano uppercase leading-snug tracking-label'>
                      dxf
                    </span>
                  )}
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    aria-label='rename pattern'
                    title='переименовать'
                    className='shrink-0'
                    disabled={isSubmitting}
                    onClick={() => setEditing({ index, value: row.name ?? '' })}
                  >
                    ✎
                  </Button>
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
              )}
              {/* When a name is set the filename still matters (it is what the factory's CAD
                  saved) — keep it readable underneath rather than only in a tooltip. */}
              {row.name && row.filename && editing?.index !== index && (
                <span className='block truncate text-nano text-labelColor'>{row.filename}</span>
              )}
              {/* Fabric binding, editable in place. It has to be reachable after upload too:
                  every DXF uploaded before 0260 has none, and without this the раскладка for
                  those rows would stay a guess forever. PDFs are left alone — a sheet a human
                  reads is not cut from anything. */}
              {/* An orphan tile's rows are outside the size range and the server rejects them
                  outright, so offering a binding there would only invite work that cannot land. */}
              {!orphan && isDxfUrl(row.url) && uploadSlots.length > 0 && editing?.index !== index && (
                <select
                  className='mt-0.5 h-6 w-full border border-hairline bg-bgColor px-1 text-nano'
                  aria-label={`ткань для ${labelOf(row)}`}
                  value={row.bomLineKey ?? ''}
                  disabled={isSubmitting || !canEdit}
                  onChange={(e) =>
                    setValue(`patterns.${index}.bomLineKey`, e.target.value, { shouldDirty: true })
                  }
                >
                  <option value=''>ткань не выбрана</option>
                  {/* A binding whose line was deleted or reclassified still EXISTS in form state.
                      Without an option for it the controlled select paints empty and reads as
                      «unbound», so "fixing" it would rebind a sheet the operator thought was free. */}
                  {!!row.bomLineKey && !liveFabricKeys.has(row.bomLineKey) && (
                    <option value={row.bomLineKey}>ткань удалена из BOM — выберите заново</option>
                  )}
                  {uploadSlots.map((s) => (
                    <option key={s.lineKey} value={s.lineKey}>
                      {s.name || 'без названия'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {!orphan && (
            <PatternUploadButton
              label='+ PDF/DXF'
              fabricSlots={uploadSlots}
              onUploaded={(p) => append({ sizeId, lineKey: ulid(), ...p })}
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
        финальные выкройки изделия — PDF или DXF на каждый размер (можно несколько файлов на
        размер, у каждого своё название). Перетащите файлы на плитку или нажмите «+ PDF/DXF».
        Загруженный файл сохраняется вместе с тех картой.
      </Text>

      <Tiles min={112}>
        {slots.map((s) => renderSlot(s, false))}
        {orphans.map((s) => renderSlot(s, true))}
      </Tiles>

      {/* DXF — по ТКАНИ, а не по размеру. Один чертёж несёт весь размерный ряд, а разные
          материалы (основная, подклад, карманы) — это разные файлы. Раньше эти кнопки жили на
          плитке размера, и файл, залитый в слот M, был не виден из слота XS: там просто нет
          строки. Размер выбирается внутри диалога, по именам блоков. */}
      {dxfByFabric.length > 0 && (
        <div className='space-y-1 border border-borderColor p-2'>
          <Text size='micro' variant='label' component='p'>
            раскладка и детали кроя — по ткани: один DXF несёт все размеры, а размер выбирается
            внутри
          </Text>
          {dxfByFabric.map((g) => {
            const bound = !!g.bomLineKey && liveFabricKeys.has(g.bomLineKey);
            return (
              <div key={g.bomLineKey || '(none)'} className='flex flex-wrap items-center gap-1.5'>
                <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                  {fabricName(g.bomLineKey)}
                  <span className='text-labelColor'>
                    {' '}
                    · {g.files.length} {g.files.length === 1 ? 'файл' : 'файлов'}
                  </span>
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  title={`авто-раскладка деталей «${fabricName(g.bomLineKey)}» на полосе`}
                  onClick={() =>
                    setNesting({
                      // Размер тут больше ничего не решает: он выбирается внутри по именам
                      // блоков, и маркер сохраняется на выбранный.
                      sizeLabel: '',
                      sizeId: [...g.sizeIds][0] ?? 0,
                      files: g.files,
                      bomLineKey: g.bomLineKey,
                    })
                  }
                >
                  ⌗ раскладка
                </Button>
                {/* Алиас пишется в скоуп ткани, и стор ОТКАЗЫВАЕТ паре (слот, блок), чей слот не
                    является живой тканевой строкой, — это уронило бы весь сейв карточки из-за
                    строки, до которой в интерфейсе не добраться. */}
                {canEdit && bound && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    title={`сопоставить детали DXF с деталями кроя для «${fabricName(g.bomLineKey)}»`}
                    onClick={() =>
                      setMatching({
                        sizeLabel: '',
                        bomLineKey: g.bomLineKey,
                        fabricName: fabricName(g.bomLineKey),
                        files: g.files,
                      })
                    }
                  >
                    ↔ детали кроя
                  </Button>
                )}
                {!bound && (
                  <Text size='nano' component='span' className='text-error'>
                    файлы не привязаны к ткани — привяжите на плитке размера
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Text size='micro' variant='label'>
        {slots.length > 0 && `${covered} of ${slots.length} sizes have a pattern`}
        {slots.length - covered > 0 && ` · ${slots.length - covered} missing`}
        {staleCount > 0 && ` · ${staleCount} ${staleCount === 1 ? 'is' : 'are'} behind the others`}
        {orphans.length > 0 &&
          ` · ${orphans.length} ${orphans.length === 1 ? 'file set is' : 'file sets are'} attached to a size that left the range`}
      </Text>

      {/* Naming modal for tile drops (click uploads carry their own inside the button). */}
      <PatternUploadModal
        files={droppedOn?.files ?? null}
        onClose={() => setDroppedOn(null)}
        onUploaded={(p) => droppedOn && append({ sizeId: droppedOn.sizeId, lineKey: ulid(), ...p })}
        fabricSlots={uploadSlots}
      />

      {/* In-app PDF viewer: the browser renders the sheet inside the modal; a fallback link opens it
          in a new tab if the storage host refuses to be framed. */}
      <ConfirmationModal
        open={viewing != null && !isDxfUrl(viewing.url)}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        onConfirm={() => setViewing(null)}
        title={viewing ? labelOf(viewing) : 'выкройка'}
        width='lg'
        hideActions
      >
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label' component='span' className='min-w-0 flex-1 truncate'>
              {viewing?.filename}
              {viewing?.sizeBytes ? ` · ${formatBytes(viewing.sizeBytes)}` : ''}
            </Text>
            <Button asChild variant='secondary' size='xs'>
              <a href={viewing?.url || '#'} target='_blank' rel='noopener noreferrer'>
                open in new tab
              </a>
            </Button>
          </div>
          <iframe
            src={viewing?.url}
            title={viewing ? labelOf(viewing) : 'выкройка'}
            className='h-[75vh] w-full border border-borderColor bg-bgColor'
          />
        </div>
      </ConfirmationModal>

      {/* DXF quick view — WebGL render of the drawing, dynamically loaded. */}
      <DxfQuickViewModal
        url={viewing && isDxfUrl(viewing.url) ? (viewing.url ?? null) : null}
        title={viewing ? labelOf(viewing) : undefined}
        sizeBytes={viewing?.sizeBytes}
        onClose={() => setViewing(null)}
      />

      {/* Раскладка (nesting) — the whole feature is a lazy chunk; mounted only when open. */}
      {nesting && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля раскладки…
            </Text>
          }
        >
          <NestingModal
            files={nesting.files}
            sizeLabel={nesting.sizeLabel}
            sizeIdByToken={sizeIdByToken}
            techCardId={techCardId}
            sizeId={nesting.sizeId}
            bomLines={fabricBomLines}
            lockedBomLineKey={nesting.bomLineKey || undefined}
            canEdit={canEdit}
            savedSizeIds={savedSizeIds}
            season={season}
            styleNumber={styleNumber}
            onClose={() => setNesting(null)}
          />
        </Suspense>
      )}

      {/* Сопоставление блоков DXF с деталями кроя — тот же ленивый чанк (общий воркер разбора). */}
      {matching && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля разбора DXF…
            </Text>
          }
        >
          <PieceMatchModal
            files={matching.files}
            bomLineKey={matching.bomLineKey}
            fabricName={matching.fabricName}
            sizeLabel={matching.sizeLabel}
            onClose={() => setMatching(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
