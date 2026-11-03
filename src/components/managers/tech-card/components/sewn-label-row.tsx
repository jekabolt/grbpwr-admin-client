// A SEWN-IN LABEL, as one row of the «labels & pkg» tab: where it sits on the garment, what it is made
// of (a catalogue material, which becomes a BOM line), how it goes on, and one artwork file per colour
// and size behind a QR. Missing things turn red; nothing here ever stops a save.
import type { common_Material, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { failureText } from 'components/managers/files/api/rpc-error';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import { MaterialPickerDialog } from 'components/managers/materials/components/material-picker';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import { useEffect, useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Chip, ChipRow, Close, ConfirmationModal, Input, Pill, Pin, Select, Text, Tile } from 'ui';
import { labelMediaOf } from '../care-labels/label-media';
import { mediaFromResolved } from '../techpack/derive-shared';
import { bornMaterialBomLine, materialLineFields } from './bom-material-line';
import { resolveBomPrice } from './bom-price';
import { patchBomLine, removeGarmentLabel, upsertGarmentLabel } from './form-writers';
import { uploadPublicFile } from './label-artwork-upload';
import {
  LABEL_NOTE_MAX,
  LABEL_SIZE_MAX,
  LABEL_TEXT_MAX,
  type FormGarmentLabel,
} from './labels-schema';
import type { TechCardFormData } from './schema';
import {
  artworkLines,
  artworkMode,
  cellIsFull,
  isCompositionLabel,
  labelBomLine,
  labelFlat,
  labelPin,
  strayFiles,
  withCellFile,
  type ArtworkCell,
  type ArtworkFile,
  type LabelAxes,
} from './sewn-label-model';
import {
  labelAttachmentOptions,
  labelFoldingOptions,
  labelPlacementOptions,
} from './tech-card-options';
import { useUndoHistory } from './undo-history';
import { wireInt } from './wire-int';

const LABEL_SECTION = 'TECH_CARD_BOM_SECTION_LABEL';
const OTHER_PLACE = '__other';

const sameKey = (a?: string, b?: string) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** What a new row starts with: the most common way a label goes on. */
export function bornLabelFacts(key: string): Partial<FormGarmentLabel> {
  return {
    attachment: labelAttachmentOptions[0],
    folding: labelFoldingOptions[0],
    qtyPerGarment: 1,
    ...(isCompositionLabel(key) ? { artworkPerSize: true, artworkPerColorway: true } : {}),
  };
}

const virtualRow = (key: string): FormGarmentLabel => ({
  key,
  placement: '',
  size: '',
  bomItemId: 0,
  bomLineKey: '',
  note: '',
  mediaIds: [],
  calloutNumber: 0,
  artworkPerSize: false,
  artworkPerColorway: false,
  files: [],
  ...bornLabelFacts(key),
});

/** What is missing on a row, for the block's `! N`. */
export function labelGaps(
  row: FormGarmentLabel,
  axes: LabelAxes,
  bomItems: { id?: number; lineKey?: string | null }[],
): { material: boolean; location: boolean; files: number } {
  return {
    material: !labelBomLine(row, bomItems),
    location: !(row.placement ?? '').trim(),
    files: artworkLines(row, axes)
      .flatMap((l) => l.cells)
      .filter((c) => !cellIsFull(c)).length,
  };
}

type Flat = { mediaId: number; url: string; ratio: number };

const TILE_W = 130;
const TILE_H = 144;
const CANVAS_W = 380;
const CANVAS_H = 430;

function useLabelFlatMedia(techCard?: common_TechCard): Flat | null {
  const { control } = useFormContext<TechCardFormData>();
  const items = (useWatch({ control, name: 'technicalMedia' }) ?? []) as {
    mediaId?: number;
    kind?: string;
  }[];
  const library = useMediaMap();
  const flat = labelFlat(items.filter((m) => wireInt(m.mediaId) > 0));
  if (!flat) return null;
  const mediaId = wireInt(flat.mediaId);
  const saved = mediaFromResolved(
    techCard?.resolvedTechnicalMedia?.find((m) => wireInt(m.media?.id) === mediaId),
  );
  const picked = library.get(mediaId)?.media?.fullSize;
  const url = saved?.url || picked?.mediaUrl || '';
  if (!url) return null;
  const w = saved?.width || picked?.width || 0;
  const h = saved?.height || picked?.height || 0;
  return { mediaId, url, ratio: w > 0 && h > 0 ? w / h : 0 };
}

/**
 * The flat in a frame of its own proportions: a pin stands in percent of the picture, so the frame
 * has to be the picture exactly, with no letterbox around it.
 */
function FlatFrame({
  flat,
  boxW,
  boxH,
  onPlace,
  children,
}: {
  flat: Flat;
  boxW: number;
  boxH: number;
  onPlace?: (x: number, y: number) => void;
  children?: ReactNode;
}): JSX.Element {
  const [natural, setNatural] = useState(0);
  const ratio = flat.ratio || natural || boxW / boxH;
  const fit =
    ratio >= boxW / boxH
      ? { width: boxW, height: boxW / ratio }
      : { width: boxH * ratio, height: boxH };
  return (
    <div
      className={onPlace ? 'relative mx-auto cursor-crosshair' : 'relative mx-auto'}
      style={fit}
      data-label-flat={flat.mediaId}
      onClick={
        onPlace
          ? (e) => {
              const box = e.currentTarget.getBoundingClientRect();
              onPlace(
                Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
                Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
              );
            }
          : undefined
      }
    >
      <img
        src={flat.url}
        alt=''
        draggable={false}
        className='size-full select-none'
        onLoad={(e) =>
          setNatural(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))
        }
      />
      {children}
    </div>
  );
}

/** Another label's pin on the same flat: dimmed, so the row's own reads first. */
function OtherPin({ x, y, label }: { x: number; y: number; label: number }): JSX.Element {
  return (
    <span className='opacity-40'>
      <Pin x={x} y={y} label={label} />
    </span>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }): JSX.Element {
  return (
    <Text
      size='micro'
      variant='label'
      tracking='label'
      component={htmlFor ? 'label' : 'span'}
      htmlFor={htmlFor}
      className='mb-1 block uppercase'
    >
      {children}
    </Text>
  );
}

/** «Per garment»: a whole number ≥ 1; the field may be empty on the way to a new number. */
function QtyInput({
  id,
  value,
  onCommit,
  disabled,
}: {
  id: string;
  value: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
}): JSX.Element {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Input
      name={id}
      aria-label='per garment'
      inputMode='numeric'
      value={draft}
      className='w-12 shrink-0'
      disabled={disabled}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value.replace(/[^0-9]/g, '');
        setDraft(v);
        const n = parseInt(v, 10);
        if (n >= 1 && n <= 999) onCommit(n);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

/** A pick list that keeps a stored word the list no longer offers. */
function PickField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (v: string) => void;
}): JSX.Element {
  const id = `${useId().replace(/:/g, '')}-${label}`;
  const words = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className='min-w-0'>
      <FieldLabel>{label}</FieldLabel>
      <Select
        name={id}
        aria-label={label}
        className='w-full'
        fullWidth
        readOnly={disabled}
        value={value}
        placeholder='pick'
        items={words.map((w) => ({ value: w, label: w }))}
        onValueChange={onChange}
      />
    </div>
  );
}

/** One artwork cell: black with a file behind it, dashed red without. */
function ArtworkTile({
  label,
  wide,
  full,
  progress,
  title,
  onOpen,
  onUpload,
  onRemove,
  data,
}: {
  label: string;
  wide?: boolean;
  full: boolean;
  progress?: number;
  title?: string;
  onOpen?: () => void;
  onUpload?: () => void;
  onRemove?: () => void;
  data?: string;
}): JSX.Element {
  const busy = progress !== undefined;
  return (
    <div className='group relative h-10 shrink-0' style={{ width: wide ? 134 : 64 }}>
      <Tile
        dashed={!full && !busy}
        tone={!full && !busy ? 'error' : 'default'}
        title={title ?? label}
        onClick={busy ? undefined : full ? onOpen : onUpload}
        className={`items-center justify-center p-0 ${full ? 'border-textColor bg-textColor' : ''}`}
      >
        <span
          data-artwork-tile={data}
          data-artwork-full={full ? '1' : '0'}
          className={`truncate px-1 text-micro uppercase ${
            full ? 'text-bgColor' : busy ? 'text-textColor' : 'text-error'
          }`}
        >
          {busy ? `${Math.round((progress ?? 0) * 100)}%` : label}
        </span>
      </Tile>
      {full && onRemove ? (
        <Close
          size='sm'
          aria-label={`remove ${label}`}
          onClick={onRemove}
          className='absolute right-0 top-0 bg-bgColor opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
        />
      ) : null}
    </div>
  );
}

/** Generated artwork: the composition label's tiles come from `rebuild`, not from an upload. */
export type GeneratedArtwork = {
  pills?: ReactNode;
  action: ReactNode;
};

export function SewnLabelRow({
  labelKey,
  title,
  removable,
  techCard,
  axes,
  canEdit,
  last,
  generated,
}: {
  labelKey: string;
  title: string;
  removable: boolean;
  techCard?: common_TechCard;
  axes: LabelAxes;
  canEdit: boolean;
  last?: boolean;
  generated?: GeneratedArtwork;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const undoHistory = useUndoHistory();
  const { canWrite } = usePermissions();
  const libraryMap = useMediaMap();
  const uid = useId().replace(/:/g, '');

  const rows = (useWatch({ control, name: 'garmentLabels' }) ?? []) as FormGarmentLabel[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as NonNullable<
    TechCardFormData['callouts']
  >;
  const stored = rows.find((r) => sameKey(r.key, labelKey));
  const row = stored ?? virtualRow(labelKey);

  const flat = useLabelFlatMedia(techCard);
  const catalog = useMaterials(LABEL_SECTION, true);

  const [otherOpen, setOtherOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sketch, setSketch] = useState(false);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingCell = useRef<ArtworkCell | null>(null);

  const liveRow = (): FormGarmentLabel =>
    ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).find((r) =>
      sameKey(r.key, labelKey),
    ) ?? virtualRow(labelKey);

  const patch = (p: Partial<Omit<FormGarmentLabel, 'key'>>) => {
    const exists = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).some((r) =>
      sameKey(r.key, labelKey),
    );
    upsertGarmentLabel(
      getValues,
      setValue,
      labelKey,
      exists ? p : { ...bornLabelFacts(labelKey), ...p },
      { keepBare: true },
    );
  };

  // ── location ──
  const placement = row.placement ?? '';
  const placeInList = labelPlacementOptions.includes(placement);
  const placeIsOther = otherOpen || (!!placement.trim() && !placeInList);

  // ── material ──
  const line = labelBomLine(row, bomItems);
  const material = (catalog.data?.materials ?? []).find(
    (m) => wireInt(m.id) === wireInt(line?.materialId),
  );
  const price = line ? resolveBomPrice(line, material).label : '';
  const materialText = line ? [line.name, price].filter(Boolean).join(' · ') : 'pick';

  const uniqueLineName = (name: string, exceptKey?: string): string => {
    const taken = new Set(
      ((getValues('bomItems') ?? []) as NonNullable<TechCardFormData['bomItems']>)
        .filter((b) => (b.lineKey ?? '') !== (exceptKey ?? '\u0000'))
        .map((b) => (b.name ?? '').trim().toLowerCase()),
    );
    if (!taken.has(name.trim().toLowerCase())) return name;
    for (let n = 2; ; n += 1) {
      const next = `${name} ${n}`;
      if (!taken.has(next.toLowerCase())) return next;
    }
  };

  const pickMaterial = (m?: common_Material) => {
    setPicker(false);
    setCreating(false);
    if (!m) {
      patch({ bomLineKey: '', bomItemId: 0 });
      return;
    }
    const bom = (getValues('bomItems') ?? []) as NonNullable<TechCardFormData['bomItems']>;
    const current = labelBomLine(liveRow(), bom);
    const lineKey = (current?.lineKey ?? '').trim();
    const allRows = [
      ...((getValues('garmentLabels') ?? []) as FormGarmentLabel[]),
      ...((getValues('packagingItems') ?? []) as { key?: string; bomItemId?: number }[]),
    ];
    const sharedLine =
      !!current &&
      allRows.some((r) => !sameKey(r.key, labelKey) && labelBomLine(r, [current]) === current);
    const name = m.name?.trim() || `material #${wireInt(m.id)}`;
    // The row's own line follows the new material. A line another row leans on stays as it is.
    if (current && lineKey && !sharedLine && current.section === LABEL_SECTION) {
      patchBomLine(getValues, setValue, lineKey, {
        ...materialLineFields(m),
        section: LABEL_SECTION,
        name: uniqueLineName(name, lineKey),
        materialId: wireInt(m.id),
      } as never);
      patch({ bomLineKey: lineKey, bomItemId: 0 });
      return;
    }
    const born = bornMaterialBomLine(m, {
      section: LABEL_SECTION,
      name: uniqueLineName(name),
    });
    setValue('bomItems', [...bom, born] as never, { shouldDirty: true });
    patch({ bomLineKey: String(born.lineKey), bomItemId: 0 });
  };

  // ── pin ──
  const pin = labelPin(row, callouts);
  const shownPin = flat && pin && pin.mediaId === flat.mediaId ? pin : null;
  const othersOnFlat = rows
    .filter((r) => !sameKey(r.key, labelKey))
    .map((r) => labelPin(r, callouts))
    .filter((p): p is NonNullable<typeof p> => !!p && p.mediaId === flat?.mediaId);

  const nextCalloutNumber = (): number => {
    const v = getValues();
    const onCard = new Set((v.technicalMedia ?? []).map((m) => wireInt(m.mediaId)));
    const taken = [
      ...(v.callouts ?? [])
        .filter((c) => !c.mediaId || onCard.has(wireInt(c.mediaId)))
        .map((c) => wireInt(c.number)),
      ...(v.pieces ?? []).map((p) => wireInt(p.calloutNumber)),
      ...(v.operations ?? []).map((o) => wireInt(o.calloutNumber)),
      ...(v.issues ?? []).map((i) => wireInt(i.calloutNumber)),
      ...(v.garmentLabels ?? []).map((l) => wireInt(l.calloutNumber)),
    ];
    return Math.max(0, ...taken) + 1;
  };

  const writePin = (x: number, y: number) => {
    if (!flat) return;
    const cur = (getValues('callouts') ?? []) as NonNullable<TechCardFormData['callouts']>;
    const number = wireInt(liveRow().calloutNumber);
    const at = number > 0 ? cur.findIndex((c) => wireInt(c.number) === number) : -1;
    const pos = { mediaId: flat.mediaId, posX: x.toFixed(3), posY: y.toFixed(3) };
    if (at >= 0) {
      const next = cur.slice();
      next[at] = { ...cur[at], ...pos };
      setValue('callouts', next as never, { shouldDirty: true });
      return;
    }
    const fresh = nextCalloutNumber();
    setValue(
      'callouts',
      [
        ...cur,
        {
          number: fresh,
          part: '',
          parts: [],
          description: title,
          dimensions: '',
          kind: 'pin',
          points: [],
          color: '',
          dashed: false,
          filled: false,
          spec: '',
          ...pos,
        },
      ] as never,
      { shouldDirty: true },
    );
    patch({ calloutNumber: fresh });
  };

  const removeRow = () => {
    const v = getValues();
    const number = wireInt(liveRow().calloutNumber);
    const pointedAt =
      number > 0 &&
      [...(v.pieces ?? []), ...(v.operations ?? []), ...(v.issues ?? [])].some(
        (r) => wireInt(r.calloutNumber) === number,
      );
    if (number > 0 && !pointedAt) {
      const cur = (v.callouts ?? []) as NonNullable<TechCardFormData['callouts']>;
      setValue('callouts', cur.filter((c) => wireInt(c.number) !== number) as never, {
        shouldDirty: true,
      });
    }
    removeGarmentLabel(getValues, setValue, labelKey);
  };

  // ── artwork ──
  const { perColour, perSize } = artworkMode(row, axes);
  const lines = artworkLines(row, axes);
  const strays = generated ? [] : strayFiles(row, axes);
  const missing = lines.flatMap((l) => l.cells).filter((c) => !cellIsFull(c)).length;

  const cellId = (c: { colorwayId?: number; sizeId?: number }) =>
    `${wireInt(c.colorwayId)}:${wireInt(c.sizeId)}`;

  const openFile = (f?: ArtworkFile) => {
    const url = f?.publicUrl?.trim();
    if (url) window.open(publicFilePageUrl(url) || url, '_blank', 'noopener');
  };

  const startUpload = (cell: ArtworkCell) => {
    if (!canWrite(SECTION.files)) {
      notify({ sev: 'error', subject: '', text: '', bad: 'no files access' });
      return;
    }
    pendingCell.current = cell;
    fileInput.current?.click();
  };

  const uploadInto = async (cell: ArtworkCell, file: File) => {
    const id = cellId(cell);
    undoHistory.cut('label-upload');
    setUploads((u) => ({ ...u, [id]: 0 }));
    try {
      const { libraryFileId, publicUrl } = await uploadPublicFile(file, (f) =>
        setUploads((u) => ({ ...u, [id]: f })),
      );
      // Read the LIVE row: two uploads running side by side must not clobber each other.
      const files = withCellFile(liveRow(), axes, {
        colorwayId: cell.colorwayId,
        sizeId: cell.sizeId,
        libraryFileId,
        sourceHash: '',
        publicUrl,
      });
      patch({ files: files as FormGarmentLabel['files'] });
    } catch (e) {
      notify({ sev: 'error', subject: '', text: '', bad: failureText(e, 'upload failed') });
    } finally {
      setUploads((u) => {
        const next = { ...u };
        delete next[id];
        return next;
      });
    }
  };

  const removeFile = (f: ArtworkFile) => {
    const files = (liveRow().files ?? []).filter((x) => cellId(x) !== cellId(f));
    patch({ files });
  };

  const multiColour = axes.colorways.length >= 2;
  const mockups = row.mediaIds ?? [];

  return (
    <div
      className={`flex flex-col gap-3 py-4 ${last ? '' : 'border-b border-hairline'}`}
      data-sewn-label={labelKey}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <Text className='uppercase tracking-label' component='span'>
          {title}
        </Text>
        {!line ? <Pill tone='warn'>! no material</Pill> : null}
        {missing > 0 ? (
          <Pill tone='warn'>
            ! {missing} {missing === 1 ? 'file' : 'files'}
          </Pill>
        ) : null}
        {generated?.pills}
        {removable && canEdit ? (
          <Close size='sm' aria-label={`remove ${title}`} onClick={removeRow} className='ml-auto' />
        ) : null}
      </div>

      <div className='flex flex-wrap gap-4'>
        <div className='shrink-0'>
          <FieldLabel>on sketch</FieldLabel>
          <div style={{ width: TILE_W + 2, height: TILE_H + 2 }}>
            <Tile
              dashed={!shownPin}
              title='on sketch'
              onClick={
                flat && canEdit
                  ? () => {
                      setDraftPin(shownPin ? { x: shownPin.x / 100, y: shownPin.y / 100 } : null);
                      setSketch(true);
                    }
                  : undefined
              }
              className='items-center justify-center p-0'
            >
              {flat ? (
                <FlatFrame flat={flat} boxW={TILE_W} boxH={TILE_H}>
                  {shownPin ? <Pin x={shownPin.x} y={shownPin.y} label={shownPin.number} /> : null}
                </FlatFrame>
              ) : (
                <Text size='micro' variant='label' className='text-center uppercase'>
                  no flat
                </Text>
              )}
            </Tile>
          </div>
        </div>

        <div
          className='grid min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-3'
          style={{ flex: '999 1 520px' }}
        >
          <div className='min-w-0'>
            <FieldLabel>location</FieldLabel>
            <Select
              name={`${uid}-location`}
              aria-label='location'
              className='w-full'
              fullWidth
              readOnly={!canEdit}
              invalid={!placement.trim() && !placeIsOther}
              value={placeIsOther ? OTHER_PLACE : placement}
              placeholder='pick'
              items={[
                ...labelPlacementOptions.map((w) => ({ value: w, label: w })),
                { value: OTHER_PLACE, label: 'other' },
              ]}
              onValueChange={(v: string) => {
                if (v === OTHER_PLACE) {
                  setOtherOpen(true);
                  if (placeInList) patch({ placement: '' });
                  return;
                }
                setOtherOpen(false);
                patch({ placement: v });
              }}
            />
          </div>

          <div className='min-w-0 sm:col-span-2'>
            <FieldLabel>material</FieldLabel>
            <Input
              name={`${uid}-material`}
              aria-label='material'
              aria-invalid={!line}
              readOnly
              disabled={!canEdit}
              value={materialText}
              data-label-material={labelKey}
              className='cursor-pointer truncate'
              onClick={() => setPicker(true)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') setPicker(true);
              }}
            />
          </div>

          {placeIsOther ? (
            <div className='min-w-0 sm:col-span-3'>
              <FieldLabel htmlFor={`${uid}-other`}>other</FieldLabel>
              <Input
                id={`${uid}-other`}
                name={`${uid}-other`}
                value={placement}
                maxLength={LABEL_TEXT_MAX}
                disabled={!canEdit}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  patch({ placement: e.target.value })
                }
              />
            </div>
          ) : null}

          <PickField
            label='attachment'
            value={row.attachment ?? ''}
            options={labelAttachmentOptions}
            disabled={!canEdit}
            onChange={(v) => patch({ attachment: v })}
          />
          <PickField
            label='folding'
            value={row.folding ?? ''}
            options={labelFoldingOptions}
            disabled={!canEdit}
            onChange={(v) => patch({ folding: v })}
          />
          <div className='min-w-0'>
            <FieldLabel htmlFor={`${uid}-size`}>size · per garment</FieldLabel>
            <div className='flex items-center gap-1'>
              <Input
                id={`${uid}-size`}
                name={`${uid}-size`}
                value={row.size ?? ''}
                maxLength={LABEL_SIZE_MAX}
                disabled={!canEdit}
                className='min-w-0 flex-1'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  patch({ size: e.target.value })
                }
              />
              <QtyInput
                id={`${uid}-qty`}
                value={row.qtyPerGarment ?? 1}
                disabled={!canEdit}
                onCommit={(n) => patch({ qtyPerGarment: n })}
              />
            </div>
          </div>
          <div className='min-w-0 sm:col-span-3'>
            <FieldLabel htmlFor={`${uid}-note`}>note</FieldLabel>
            <Input
              id={`${uid}-note`}
              name={`${uid}-note`}
              value={row.note ?? ''}
              maxLength={LABEL_NOTE_MAX}
              disabled={!canEdit}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ note: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className='flex flex-col gap-1.5' data-label-artwork={labelKey}>
        <div className='flex flex-wrap items-center gap-2'>
          <FieldLabel>artwork</FieldLabel>
          {generated ? (
            generated.action
          ) : (
            <ChipRow>
              {multiColour ? (
                <Chip
                  nonForm
                  pressed={perColour}
                  selected={perColour}
                  disabled={!canEdit}
                  onClick={() => patch({ artworkPerColorway: !row.artworkPerColorway })}
                >
                  per colour
                </Chip>
              ) : null}
              {axes.sizes.length > 0 ? (
                <Chip
                  nonForm
                  pressed={perSize}
                  selected={perSize}
                  disabled={!canEdit}
                  onClick={() => patch({ artworkPerSize: !row.artworkPerSize })}
                >
                  per size
                </Chip>
              ) : null}
            </ChipRow>
          )}
        </div>
        {lines.map((l) => (
          <div key={l.colorwayId} className='flex flex-wrap items-center gap-1.5'>
            {perColour ? (
              <Text
                size='micro'
                variant='label'
                className='w-12 truncate uppercase tracking-label'
                title={l.colorName}
              >
                {l.colorName}
              </Text>
            ) : null}
            {l.cells.map((c) => (
              <ArtworkTile
                key={cellId(c)}
                label={c.sizeLabel}
                wide={!perSize}
                full={cellIsFull(c)}
                progress={uploads[cellId(c)]}
                title={[l.colorName, c.sizeLabel].filter(Boolean).join(' · ')}
                data={`${labelKey}:${cellId(c)}`}
                onOpen={() => openFile(c.file)}
                onUpload={canEdit && !generated ? () => startUpload(c) : undefined}
                onRemove={canEdit && !generated ? () => c.file && removeFile(c.file) : undefined}
              />
            ))}
          </div>
        ))}
        {strays.length > 0 ? (
          <div className='flex flex-wrap items-center gap-1.5' data-label-old-files={labelKey}>
            <Text size='micro' variant='label' className='uppercase tracking-label'>
              old files
            </Text>
            {strays.map((f) => (
              <ArtworkTile
                key={cellId(f)}
                label={
                  [
                    axes.colorways.find((c) => c.id === wireInt(f.colorwayId))?.name,
                    axes.sizes.find((s) => s.id === wireInt(f.sizeId))?.label,
                  ]
                    .filter(Boolean)
                    .join(' ') || 'all'
                }
                full={!!f.publicUrl?.trim()}
                onOpen={() => openFile(f)}
                onUpload={undefined}
                onRemove={canEdit ? () => removeFile(f) : undefined}
              />
            ))}
          </div>
        ) : null}
        {mockups.length > 0 ? (
          <div className='flex flex-wrap items-center gap-1.5' data-label-mockups={labelKey}>
            <Text size='micro' variant='label' className='uppercase tracking-label'>
              mockups
            </Text>
            {mockups.map((id) => {
              const m = labelMediaOf(id, techCard?.resolvedLabelMedia, libraryMap)?.media;
              const url = m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || '';
              return (
                <div key={id} className='relative h-10 w-16 shrink-0 border border-borderColor'>
                  {url ? <img src={url} alt='' className='size-full object-contain' /> : null}
                  {canEdit ? (
                    <Close
                      size='sm'
                      aria-label='remove this mockup'
                      className='absolute right-0 top-0 bg-bgColor'
                      onClick={() =>
                        patch({ mediaIds: (liveRow().mediaIds ?? []).filter((x) => x !== id) })
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <input
        ref={fileInput}
        type='file'
        hidden
        data-label-file-input={labelKey}
        onChange={(e) => {
          const file = e.target.files?.[0];
          const cell = pendingCell.current;
          e.target.value = '';
          pendingCell.current = null;
          if (file && cell) void uploadInto(cell, file);
        }}
      />

      <MaterialPickerDialog
        open={picker}
        initialSection={LABEL_SECTION}
        value={wireInt(line?.materialId)}
        title='material'
        onPick={pickMaterial}
        onClose={() => setPicker(false)}
        onCreate={() => {
          setPicker(false);
          setCreating(true);
        }}
      />
      <MaterialModal
        open={creating}
        onOpenChange={setCreating}
        defaultSection={LABEL_SECTION}
        onCreated={(_id, m) => pickMaterial(m)}
      />

      {flat ? (
        <ConfirmationModal
          open={sketch}
          onOpenChange={setSketch}
          title={title}
          confirmLabel='accept'
          confirmDisabled={!draftPin}
          hideCancel
          onConfirm={() => {
            if (draftPin) writePin(draftPin.x, draftPin.y);
            setSketch(false);
          }}
        >
          <FlatFrame
            flat={flat}
            boxW={CANVAS_W}
            boxH={CANVAS_H}
            onPlace={(x, y) => setDraftPin({ x, y })}
          >
            {othersOnFlat.map((p) => (
              <OtherPin key={p.number} x={p.x} y={p.y} label={p.number} />
            ))}
            {draftPin ? (
              <Pin
                x={draftPin.x * 100}
                y={draftPin.y * 100}
                label={shownPin?.number ?? pin?.number ?? nextCalloutNumber()}
              />
            ) : null}
          </FlatFrame>
        </ConfirmationModal>
      ) : null}
    </div>
  );
}
