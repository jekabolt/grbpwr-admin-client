import { common_MediaFull, type common_TechCardMediaFull } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useUploadMedia } from 'components/managers/media/utils/useUploadMedia';
import { useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { GroupLabel, Section, ComboField, InputField } from 'ui';
import {
  MediaViewer,
  type MediaViewerItem,
  mediaFullToViewerItem,
} from 'components/shared/media-viewer/media-viewer';
import { labelMediaOf } from '../care-labels/label-media';
import {
  removeGarmentLabel,
  removePackagingItem,
  upsertGarmentLabel,
  upsertPackagingItem,
} from './form-writers';
import { KindPicker } from './kind-picker';
import { LabelCard, type CardField, type CardRow } from './label-card';
import { LABEL_NOTE_MAX, LABEL_SIZE_MAX, LABEL_TEXT_MAX } from './labels-schema';
import type { TechCardFormData } from './schema';
import { useUndoHistory } from './undo-history';
import {
  foldingMethodOptions,
  garmentLabelKinds,
  kindLabel,
  labelAttachmentOptions,
  labelFoldingOptions,
  labelPlacementOptions,
  packagingItemKinds,
  packagingPackingOptions,
  packagingUsageOptions,
  type LabelKind,
} from './tech-card-options';

/**
 * LABELS and PACKAGING — two blocks of the «labels & pkg» tab (02-DESIGN §2.1, §2.3–2.6; I-11).
 * Both are the construction-aspects grammar: the rows the card carries, each a `LabelCard`, and
 * under them ONE dashed add row that turns into the kind picker in place. Empty = only that row.
 *
 * Every write goes through the keyed writers in `form-writers.ts` (live `getValues`, one row by
 * key, case-blind). The card passes `keepBare`: a row leaves only by its ✕.
 */

const LABEL_FIELDS: CardField[] = [
  {
    name: 'placement',
    label: 'placement',
    kind: 'pick',
    options: labelPlacementOptions,
    max: LABEL_TEXT_MAX,
    hint: 'where on the garment',
  },
  {
    name: 'attachment',
    label: 'attachment',
    kind: 'pick',
    options: labelAttachmentOptions,
    max: LABEL_TEXT_MAX,
    hint: 'sewn how / inserted where',
  },
  {
    name: 'folding',
    label: 'folding',
    kind: 'pick',
    options: labelFoldingOptions,
    max: LABEL_TEXT_MAX,
    hint: 'how it is folded',
  },
  { name: 'size', label: 'size', kind: 'text', max: LABEL_SIZE_MAX, hint: 'e.g. 50 × 20 mm' },
  { name: 'qtyPerGarment', label: 'per garment', kind: 'qty' },
  { name: 'bomItemId', label: 'material (BOM line)', kind: 'bom' },
  { name: 'note', label: 'note', kind: 'note', max: LABEL_NOTE_MAX },
];

const ITEM_FIELDS: CardField[] = [
  {
    name: 'usage',
    label: 'used for',
    kind: 'pick',
    options: packagingUsageOptions,
    max: LABEL_TEXT_MAX,
    hint: 'where / how it is used',
  },
  {
    name: 'packing',
    label: 'packing',
    kind: 'pick',
    options: packagingPackingOptions,
    max: LABEL_TEXT_MAX,
    hint: 'folding / packing',
  },
  { name: 'size', label: 'size', kind: 'text', max: LABEL_SIZE_MAX, hint: 'e.g. 30 × 40 cm' },
  { name: 'qtyPerGarment', label: 'per garment', kind: 'qty' },
  { name: 'bomItemId', label: 'material (BOM line)', kind: 'bom' },
  { name: 'note', label: 'note', kind: 'note', max: LABEL_NOTE_MAX },
];

type Writers = {
  upsert: typeof upsertGarmentLabel | typeof upsertPackagingItem;
  remove: typeof removeGarmentLabel;
};

/** The shared body: the rows, the add door, the one viewer. */
function KeyedCards({
  field,
  kinds,
  noun,
  example,
  fields,
  mockupBlocking,
  canEdit,
  writers,
  resolvedMedia,
}: {
  field: 'garmentLabels' | 'packagingItems';
  kinds: LabelKind[];
  noun: string;
  example: string;
  fields: CardField[];
  mockupBlocking: boolean;
  canEdit: boolean;
  writers: Writers;
  /** The card's `resolvedLabelMedia` (M-02): every saved mockup id, resolved by the server. */
  resolvedMedia?: readonly common_TechCardMediaFull[];
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const rows = (useWatch({ control, name: field }) ?? []) as CardRow[];
  // Media are ids on the wire. The card's resolvedLabelMedia resolves every SAVED id (M-02: the
  // library map holds only the latest 500 files); a just-picked one is cached for the session, and
  // the library map stays the last fallback for media picked before a save / refetch.
  const libraryMap = useMediaMap();
  const uploadMedia = useUploadMedia({ silent: true });
  const undoHistory = useUndoHistory();
  const [cache, setCache] = useState<Map<number, common_MediaFull>>(new Map());
  const [viewer, setViewer] = useState<{
    key: string;
    ids: number[];
    items: MediaViewerItem[];
    index: number;
  } | null>(null);

  const mediaOf = (id: number) => cache.get(id) ?? labelMediaOf(id, resolvedMedia, libraryMap);
  const urlOf = (id: number) => {
    const m = mediaOf(id)?.media;
    return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
  };

  const patch = (key: string, p: Record<string, unknown>) =>
    writers.upsert(getValues, setValue, key, p as never, { keepBare: true });
  const liveIds = (key: string) =>
    ((getValues(field) ?? []) as CardRow[]).find(
      (r) => (r.key ?? '').trim().toLowerCase() === key.trim().toLowerCase(),
    )?.mediaIds ?? [];

  const addMedia = (key: string, picked: common_MediaFull[]) => {
    setCache((prev) => {
      const m = new Map(prev);
      for (const p of picked) if (p.id != null) m.set(p.id, p);
      return m;
    });
    const ids = picked.map((m) => m.id).filter((x): x is number => x != null && x > 0);
    // Read the LIVE ids: two quick picks must not clobber each other.
    patch(key, { mediaIds: Array.from(new Set([...liveIds(key), ...ids])) });
  };
  const removeMedia = (key: string, id: number) =>
    patch(key, { mediaIds: liveIds(key).filter((x) => x !== id) });

  const openViewer = (key: string, index: number, ids: number[]) =>
    setViewer({
      key,
      ids,
      index,
      items: ids.map((id) => {
        const m = mediaOf(id)?.media;
        const thumb = urlOf(id);
        return { src: m?.fullSize?.mediaUrl || m?.compressed?.mediaUrl || thumb, thumbnail: thumb };
      }),
    });

  const replaceMedia = async (dataUrl: string, item: MediaViewerItem) => {
    if (!viewer) throw new Error('slot closed');
    const targetIndex = viewer.items.indexOf(item);
    const sourceId = viewer.ids[targetIndex];
    const before = liveIds(viewer.key);
    if (targetIndex < 0 || !sourceId || before[targetIndex] !== sourceId)
      throw new Error('slot changed');

    undoHistory.cut('label-upload');

    const uploaded = await uploadMedia.mutateAsync(dataUrl);
    const newId = uploaded.id;
    if (!newId) throw new Error('upload failed');

    const latest = liveIds(viewer.key);
    if (latest[targetIndex] !== sourceId)
      throw new Error('slot changed');

    const nextIds = latest.slice();
    nextIds[targetIndex] = newId;
    patch(viewer.key, { mediaIds: nextIds });
    setCache((prev) => new Map(prev).set(newId, uploaded));
    setViewer((prev) => {
      if (!prev || prev.key !== viewer.key || prev.ids[targetIndex] !== sourceId) return prev;
      const items = prev.items.slice();
      const ids = prev.ids.slice();
      items[targetIndex] = mediaFullToViewerItem(uploaded);
      ids[targetIndex] = newId;
      return { ...prev, items, ids };
    });
  };

  return (
    <div data-keyed-cards={field}>
      {rows.map((r, i) => {
        const key = r.key ?? '';
        return (
          <LabelCard
            key={key.toLowerCase() || i}
            cardKey={key}
            title={kindLabel(kinds, key)}
            noun={noun}
            row={r}
            fields={fields}
            mockupBlocking={mockupBlocking}
            last={i === rows.length - 1}
            urlOf={urlOf}
            onPatch={(p) => patch(key, p)}
            onRemove={() => writers.remove(getValues, setValue, key)}
            onAddMedia={(picked) => addMedia(key, picked)}
            onRemoveMedia={(id) => removeMedia(key, id)}
            onOpenViewer={(index, ids) => openViewer(key, index, ids)}
          />
        );
      })}
      <KindPicker
        noun={noun}
        kinds={kinds}
        taken={rows.map((r) => r.key ?? '')}
        example={example}
        hasRows={rows.length > 0}
        onAdd={(key) => writers.upsert(getValues, setValue, key, {})}
      />
      <MediaViewer
        items={viewer?.items ?? []}
        index={viewer?.index ?? 0}
        open={!!viewer}
        onOpenChange={(open) => !open && setViewer(null)}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
        onReplace={canEdit ? replaceMedia : undefined}
      />
    </div>
  );
}

/** LABELS — every label on the garment but the composition one, each with its mockup (R-05..R-07). */
export function LabelsBlock({
  resolvedMedia,
  canEdit = true,
}: {
  resolvedMedia?: readonly common_TechCardMediaFull[];
  canEdit?: boolean;
}): JSX.Element {
  return (
    <Section title='labels'>
      <KeyedCards
        field='garmentLabels'
        kinds={garmentLabelKinds}
        noun='label'
        example='tax stamp'
        fields={LABEL_FIELDS}
        mockupBlocking
        canEdit={canEdit}
        writers={{ upsert: upsertGarmentLabel, remove: removeGarmentLabel }}
        resolvedMedia={resolvedMedia}
      />
    </Section>
  );
}

/**
 * PACKAGING — the carton facts (kept: shipping reads the gross weight and the box dimensions, F3),
 * then the packaging items, same grammar as labels (R-09). The deprecated polybag / bag sticker /
 * inserts text fields are not shown; the form still round-trips what it read.
 */
export function PackagingBlock({
  resolvedMedia,
  canEdit = true,
}: {
  resolvedMedia?: readonly common_TechCardMediaFull[];
  canEdit?: boolean;
}): JSX.Element {
  return (
    <Section title='packaging'>
      <div id='packaging-spec'>
        <GroupLabel flush>carton</GroupLabel>
        <div className='mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3'>
          <InputField
            name='packaging.unitsPerBox'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='units per box'
          />
          <InputField
            name='packaging.boxDimensions'
            label='box L×W×H'
            placeholder='e.g. 60×40×30'
          />
          <InputField name='packaging.boxMarking' label='box marking' placeholder='style + qty' />
          <InputField
            name='packaging.weightGrossGrams'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='weight gross (g)'
          />
          <InputField
            name='packaging.weightNetGrams'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='weight net (g)'
          />
          <ComboField
            name='packaging.foldingMethod'
            label='garment fold'
            options={foldingMethodOptions}
          />
          <div className='sm:col-span-2 lg:col-span-3'>
            <InputField name='packaging.notes' label='carton note' />
          </div>
        </div>
      </div>
      <div className='pt-6'>
        <GroupLabel flush>items</GroupLabel>
        <KeyedCards
          field='packagingItems'
          kinds={packagingItemKinds}
          noun='item'
          example='thank-you card'
          fields={ITEM_FIELDS}
          mockupBlocking={false}
          canEdit={canEdit}
          writers={{ upsert: upsertPackagingItem, remove: removePackagingItem }}
          resolvedMedia={resolvedMedia}
        />
      </div>
    </Section>
  );
}
