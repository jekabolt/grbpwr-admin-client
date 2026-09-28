import type { common_MediaFull, common_Model } from 'api/proto-http/admin';
import { useAllModels, useModel } from 'components/managers/models/components/useModelQuery';
import { useMemo, type JSX } from 'react';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { PictureTile } from '../../picture-tile';
import { FieldRow } from '../../render/field-row';
import { mediaThumb } from '../../render/model';
import { modelFacts, modelName } from '../../render/model-picker';

/**
 * ═══ TILE 1 · THE MODEL PROFILE AND ONE PHOTOGRAPH OF IT (C-09) ═════════════════════════════════
 *
 * Owner: «model profile — required field». Two steps, one after the other, and nothing else:
 *
 *   PROFILE  [ face · Vera K. · women · 178 cm ▾ ]
 *   [photo] [photo] [photo] [photo]          ← that profile's gallery; one is chosen
 *
 * THE GALLERY IS THE CHOSEN PROFILE'S AND NOTHING ELSE. The server checks it (B-11,
 * `model_photo_mismatch`): a `role=model` picture must be the profile's thumbnail or one of its
 * gallery media, or the run is refused before money. So this picker offers exactly that set
 * (`modelPhotosOf`) — no upload, no Reuse: a photograph from anywhere else would be filed under
 * this person's name.
 *
 * PICKING A PROFILE ALSO PICKS ITS COVER PHOTO (the thumbnail, else the first gallery frame). The
 * field is required and a profile with a chosen photo is the whole answer for most runs; another
 * frame is one press on it. A profile with no photograph is still listed, and says so under the
 * select rather than drawing an empty row.
 *
 * The component holds no state: the panel's draft owns `modelId` and `photo` (C-08's contract).
 */
export type ModelPhotoPickerProps = {
  /** The chosen profile, 0 = none. */
  modelId: number;
  /** The chosen photograph of that profile. */
  photo: common_MediaFull | null;
  onChange: (next: { modelId: number; photo: common_MediaFull | null }) => void;
  disabled?: boolean;
};

/** Radix forbids an empty item value; «no profile yet» is a placeholder, never a choice. */
const LOADING = '__loading__';
const NONE = '__none__';

/**
 * THE PHOTOGRAPHS THE SERVER ACCEPTS FOR THIS PROFILE, in the order they are offered: the
 * thumbnail first (the profile's own cover), then the gallery, one entry per media id, only those
 * with a picture to draw. The server's set is `{thumbnail_id} ∪ media_ids` (B-11); this is that set
 * minus what cannot be shown.
 */
export function modelPhotosOf(model: common_Model | null | undefined): common_MediaFull[] {
  if (!model) return [];
  const seen = new Set<number>();
  const out: common_MediaFull[] = [];
  for (const m of [model.thumbnail, ...(model.media ?? [])]) {
    const id = m?.id ?? 0;
    if (!m || id <= 0 || seen.has(id) || !mediaThumb(m)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

function Face({ url }: { url: string }): JSX.Element | null {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=''
      loading='lazy'
      className='h-[18px] w-[14px] shrink-0 border border-borderColor object-cover'
    />
  );
}

function profileLine(model: common_Model): JSX.Element {
  const facts = modelFacts(model, () => '');
  return (
    <span className='flex min-w-0 items-center gap-1.5'>
      <Face url={mediaThumb(modelPhotosOf(model)[0])} />
      <span className='min-w-0 truncate'>
        {modelName(model)}
        {facts ? ` · ${facts}` : ''}
      </span>
    </span>
  );
}

export function ModelPhotoPicker({
  modelId,
  photo,
  onChange,
  disabled,
}: ModelPhotoPickerProps): JSX.Element {
  const list = useAllModels();
  const detail = useModel(modelId > 0 ? modelId : undefined);

  const all = useMemo(() => (list.data ?? []).filter((m) => (m.id ?? 0) > 0), [list.data]);
  const entry = useMemo(() => all.find((m) => (m.id ?? 0) === modelId) ?? null, [all, modelId]);
  // The profile's own read is fresher than the list's (a photo added since the list was cached).
  const chosen = detail.data ?? entry;
  const photos = useMemo(() => modelPhotosOf(chosen), [chosen]);
  const photoId = photo?.id ?? 0;
  const stale = !!chosen && photoId > 0 && !photos.some((m) => (m.id ?? 0) === photoId);

  const items = useMemo(() => {
    if (list.isLoading) return [{ value: LOADING, label: 'loading the models…', disabled: true }];
    if (!all.length) {
      return [
        {
          value: NONE,
          label: list.isError
            ? 'could not load the models'
            : 'no model profiles yet: add them under MODELS',
          disabled: true,
        },
      ];
    }
    return all.map((m) => ({ value: String(m.id ?? 0), label: profileLine(m) }));
  }, [all, list.isLoading, list.isError]);

  const pickProfile = (id: number) => {
    if (id === modelId) return;
    const next = all.find((m) => (m.id ?? 0) === id) ?? null;
    onChange({ modelId: id, photo: modelPhotosOf(next)[0] ?? null });
  };

  return (
    <div className='flex flex-col gap-4' data-model-photo-picker={modelId}>
      <FieldRow label='Profile' className='py-2'>
        <div className='ml-auto w-[280px] max-w-full'>
          <SelectComponent
            name='playground-model-profile'
            value={modelId > 0 ? String(modelId) : undefined}
            placeholder={list.isLoading ? 'loading the models…' : 'pick a model'}
            disabled={disabled}
            items={items}
            fullWidth
            renderValue={() =>
              chosen ? (
                <span className='flex min-w-0 uppercase'>{profileLine(chosen)}</span>
              ) : (
                <span className='truncate uppercase'>
                  {modelId > 0 ? `model ${modelId}` : 'pick a model'}
                </span>
              )
            }
            onValueChange={(value: string) => {
              const id = Number(value);
              if (Number.isFinite(id) && id > 0) pickProfile(id);
            }}
          />
        </div>
      </FieldRow>

      {modelId > 0 && (
        <div className='flex flex-col gap-2'>
          {photos.length === 0 ? (
            <Text size='micro' variant='label' component='p' className='normal-case'>
              {detail.isLoading && !entry
                ? 'loading this profile…'
                : 'This profile has no photos yet. Add one under MODELS.'}
            </Text>
          ) : (
            <div
              className='flex flex-wrap items-start gap-2.5'
              role='group'
              aria-label={`photos of ${chosen ? modelName(chosen) : `model ${modelId}`}`}
            >
              {photos.map((m, i) => {
                const id = m.id ?? 0;
                const on = id === photoId;
                const pick = () => {
                  if (!on) onChange({ modelId, photo: m });
                };
                return (
                  <div key={id} className='w-[88px] shrink-0' data-model-photo={id}>
                    <PictureTile
                      url={mediaThumb(m)}
                      alt={`photo ${i + 1} of this model`}
                      aspect='3/4'
                      fit='cover'
                      selected={on}
                      badge={on ? 'chosen' : undefined}
                      className='w-full bg-bgColor'
                      onOpen={disabled || on ? undefined : pick}
                      onSelect={
                        disabled || on
                          ? undefined
                          : {
                              onClick: pick,
                              ariaLabel: `use photo ${i + 1} of this model`,
                              title: 'dress this photo',
                            }
                      }
                      selectLabel='use'
                    />
                  </div>
                );
              })}
            </div>
          )}
          {stale && (
            <Text size='micro' variant='label' component='p' className='normal-case'>
              The chosen photo is no longer in this profile. Pick one of the photos above.
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
