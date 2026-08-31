import type { GetDesignBandResponse, common_DesignAsset } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import { FieldRow, Hint, Swatch } from '../render/field-row';
import { PictureTile } from '../picture-tile';
import { ColourPicker } from './colour-picker';
import {
  ASSET_FABRIC,
  ASSET_NAME_MAX,
  ASSET_NOTE_MAX,
  ASSET_PATTERN,
  ASSET_REPEAT_MAX,
  ASSET_SHELVES,
  ASSETS_PER_CARD_MAX,
  assetFull,
  assetLabel,
  assetThumb,
  hexIsPaintable,
  kindTakesRepeat,
  placementsOfAsset,
  shelfAssets,
  type AssetKind,
} from './model';
import { useAssetWrites } from './use-assets';

/**
 * ТРИ ПОЛКИ ОДНОЙ СЕКЦИИ, И НИ ОДНОЙ РАМКИ ВНУТРИ.
 *
 * Полка — это `GroupLabel` плюс ряд плиток, то есть ВЕС ЛИНЕЙКИ, а не второй блок: блок в блоке в
 * этой системе запрещён (DESIGN.md, «A block never contains another block»), и три обведённые
 * коробки внутри секции читались бы как три независимых экрана, между которыми ничего общего.
 * Общее у них ровно всё: одна дверь загрузки, один редактор, одна разметка, один глагол удаления.
 *
 * ПЛЕЙСХОЛДЕР СТОИТ ВСЕГДА И НИЧЕГО НЕ ТРЕБУЕТ (V-4, дословно: «что бы он всегда был как
 * плейсхолдер но не обязательный»). Он ЛИТЕРАЛ ПОСЛЕ обхода списка, а не ветка: так он не может
 * пропасть ни на пустой полке, ни на полной, ни при отказе сервера.
 */

/** ЧЕРНОВИК ПЛИТКИ. Тот же для заведения и для правки — редактор один, и жест один. */
type Draft = {
  assetId: number;
  kind: AssetKind;
  name: string;
  mediaId: number;
  mediaUrl: string;
  colourCode: string;
  colourHex: string;
  note: string;
  derivedFromAssetId: number;
  repeatMm: string;
  rotationDeg: string;
};

const emptyDraft = (kind: AssetKind): Draft => ({
  assetId: 0,
  kind,
  name: '',
  mediaId: 0,
  mediaUrl: '',
  colourCode: '',
  colourHex: '',
  note: '',
  derivedFromAssetId: 0,
  repeatMm: '',
  rotationDeg: '',
});

const draftOf = (a: common_DesignAsset, kind: AssetKind): Draft => ({
  assetId: a.id ?? 0,
  kind,
  name: a.name ?? '',
  mediaId: a.mediaId ?? 0,
  mediaUrl: assetThumb(a),
  colourCode: a.colourCode ?? '',
  colourHex: a.colourHex ?? '',
  note: a.note ?? '',
  derivedFromAssetId: a.derivedFromAssetId ?? 0,
  repeatMm: a.repeatMm ? String(a.repeatMm) : '',
  rotationDeg: a.rotationDeg ? String(a.rotationDeg) : '',
});

export function AssetShelves({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const { dictionary } = useDictionary();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemove, setPendingRemove] = useState<common_DesignAsset | null>(null);
  const readOnly = !!disabled;

  const total = (band.assets ?? []).length;
  const full = total >= ASSETS_PER_CARD_MAX;

  /** Цвета, которыми ЭТА карточка уже рендерилась — совместимость с сохранёнными рецептами (V-5). */
  const recent = useMemo(
    () =>
      (band.colourRecipes ?? [])
        .map((r) => ({ hex: (r.hex ?? '').trim(), code: (r.code ?? '').trim() }))
        .filter((r) => hexIsPaintable(r.hex)),
    [band.colourRecipes],
  );

  const fabrics = useMemo(() => shelfAssets(band, ASSET_FABRIC), [band]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const nameTaken = draft ? draft.name.trim().length > 0 : false;

  function save() {
    if (!draft || !nameTaken) return;
    const takesRepeat = kindTakesRepeat(draft.kind);
    writes.upsertAsset.mutate(
      {
        assetId: draft.assetId,
        kind: draft.kind,
        name: draft.name.trim(),
        mediaId: draft.mediaId,
        colourCode: draft.colourCode.trim(),
        colourHex: draft.colourHex.trim(),
        note: draft.note.trim(),
        // ⚠ РАППОРТ, ПОВОРОТ И РОДИТЕЛЬ ОБНУЛЯЮТСЯ У НЕ-ПАТТЕРНА ЗДЕСЬ, А НЕ НАДЕЮТСЯ НА СЕРВЕР.
        // Сервер за них ОТКАЖЕТ (`asset_not_a_pattern`), и отказ пришёл бы человеку, который
        // всего лишь сменил род плитки в открытом редакторе и полей этих больше не видит.
        derivedFromAssetId: takesRepeat ? draft.derivedFromAssetId : 0,
        repeatMm: takesRepeat ? Number(draft.repeatMm) || 0 : 0,
        rotationDeg: takesRepeat ? Number(draft.rotationDeg) || 0 : 0,
      },
      { onSuccess: () => setDraft(null) },
    );
  }

  return (
    <>
      {ASSET_SHELVES.map((shelf) => {
        const rows = shelfAssets(band, shelf.kind);
        return (
          <div key={shelf.kind} data-asset-shelf={shelf.kind}>
            <GroupLabel
              action={
                <Text size='micro' variant='label' component='span'>
                  {rows.length === 0 ? 'none yet' : `${rows.length} on this card`}
                </Text>
              }
            >
              {shelf.title}
            </GroupLabel>

            {/* РЯД, А НЕ СЕТКА: полка читается одним взглядом слева направо, и её длина — это
                ответ на «сколько тканей у изделия». Переносящаяся сетка тот же ряд разбивает на
                строки, у которых нет смысла. */}
            <div className='flex flex-nowrap gap-3 overflow-x-auto pb-1'>
              {rows.map((a) => (
                <AssetCell
                  key={a.id}
                  asset={a}
                  kind={shelf.kind}
                  readOnly={readOnly}
                  selected={draft?.assetId === a.id}
                  marks={placementsOfAsset(band, a.id ?? 0).length}
                  onEdit={() => setDraft(draftOf(a, shelf.kind))}
                  onRemove={() => setPendingRemove(a)}
                  onMakePattern={
                    shelf.kind === ASSET_FABRIC
                      ? () =>
                          setDraft({
                            ...emptyDraft(ASSET_PATTERN),
                            // ПАТТЕРН ЗАИМСТВУЕТ КАРТИНКУ ТКАНИ, И ЭТО ВЕСЬ ЖЕСТ «сделать паттерн
                            // из загруженной ткани» (V-7): раппорт и поворот — то, что человек
                            // добавляет к лоскуту, чтобы он стал раскладкой.
                            name: `${assetLabel(a)} pattern`,
                            mediaId: a.mediaId ?? 0,
                            mediaUrl: assetThumb(a),
                            colourCode: a.colourCode ?? '',
                            colourHex: a.colourHex ?? '',
                            derivedFromAssetId: a.id ?? 0,
                            repeatMm: '60',
                          })
                      : undefined
                  }
                />
              ))}

              {/* ПЛЕЙСХОЛДЕР — ЛИТЕРАЛ, И ОН ПОСЛЕДНИЙ. */}
              <div className='flex w-[132px] shrink-0 flex-col gap-1'>
                {readOnly ? (
                  <div className='h-[148px] w-full border border-dashed border-borderColor' />
                ) : (
                  <MediaSlot
                    aspectRatio={['Custom']}
                    frameAspect='132/148'
                    label={shelf.addLabel}
                    hint={null}
                    purpose={`design · ${shelf.title} asset of this tech card`}
                    showVideos={false}
                    editMode
                    allowMultiple={false}
                    onSelect={(media) => {
                      const first = media[0];
                      if (!first?.id) return;
                      // ФАЙЛ ВЫБРАН — НО АССЕТА ЕЩЁ НЕТ. Имя обязательно (сервер отвергает
                      // безымянный), и спросить его надо ДО записи: плитка, заведённая молча под
                      // именем файла, назвалась бы «IMG_4471» и так и уехала бы в промпт.
                      setDraft({
                        ...emptyDraft(shelf.kind),
                        mediaId: first.id,
                        mediaUrl:
                          first.media?.thumbnail?.mediaUrl || first.media?.fullSize?.mediaUrl || '',
                      });
                    }}
                  />
                )}
                <Text size='nano' variant='label' component='span'>
                  {full ? `the card holds ${ASSETS_PER_CARD_MAX} assets` : 'optional'}
                </Text>
                <Text size='nano' variant='label' component='span'>
                  ⌘V · drop · browse
                </Text>
              </div>
            </div>

            {rows.length === 0 && (
              <Text size='micro' variant='inactive' component='p' className='normal-case'>
                {shelf.empty}
              </Text>
            )}
          </div>
        );
      })}

      {/* ═══ РЕДАКТОР — ИНЛАЙН, ОДИН НА ВСЕ ТРИ ПОЛКИ ═══════════════════════════════════════════
          Модалки здесь нет намеренно: у ассета шесть полей, а модалка на каждое касание плитки
          сделала бы полку экраном, из которого нельзя посмотреть на соседнюю полку. Редактор —
          линейка `FieldRow` внизу секции, а правимая плитка обведена: пара «что правлю» и «чем
          правлю» видна одновременно. */}
      {draft && !readOnly && (
        <div data-asset-editor>
          <GroupLabel
            action={
              <Pill tone='attention'>{draft.assetId ? 'editing' : 'new — not saved yet'}</Pill>
            }
          >
            {draft.assetId ? `${draft.kind} — ${assetLabel({ name: draft.name } as any)}` : `new ${draft.kind}`}
          </GroupLabel>

          <FieldRow label='name'>
            <div className='w-[220px]'>
              <Input
                name='asset-name'
                data-asset-name
                value={draft.name}
                maxLength={ASSET_NAME_MAX}
                autoFocus
                placeholder='main jersey, contrast rib, 15 mm eyelet…'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
              />
            </div>
            <Hint>
              required — the prompt cites this cloth by name and the sheet prints it. an unnamed
              asset reaches the model as the bare word «fabric».
            </Hint>
          </FieldRow>

          <FieldRow label='picture'>
            {draft.mediaUrl ? (
              <span className='block size-[44px] shrink-0 border border-borderColor'>
                <img
                  src={draft.mediaUrl}
                  alt=''
                  className='size-full object-cover'
                  loading='lazy'
                />
              </span>
            ) : null}
            {/* ⚠ РАМКЕ НУЖЕН РАЗМЕР, ИНАЧЕ ОНА БЕРЁТ ШИРИНУ КОНТЕЙНЕРА. Без `sizeClassName` слот
                растягивался на всю строку редактора и, держа пропорции, вырастал в полосатое поле
                высотой почти в экран — форма переставала читаться как форма. Замерено на снимке
                стенда; лечится размером, а не переносом строки. */}
            <MediaSlot
              compact
              aspectRatio={['Custom']}
              frameAspect='1/1'
              sizeClassName='w-[64px]'
              label={draft.mediaId ? 'change ▸' : 'pick ▸'}
              hint={null}
              purpose={`design · ${draft.kind} asset`}
              showVideos={false}
              allowMultiple={false}
              onSelect={(media) => {
                const first = media[0];
                if (!first?.id) return;
                patch({
                  mediaId: first.id,
                  mediaUrl:
                    first.media?.thumbnail?.mediaUrl || first.media?.fullSize?.mediaUrl || '',
                });
              }}
            />
            {draft.mediaId > 0 && (
              <Button
                variant='secondary'
                size='xs'
                onClick={() => patch({ mediaId: 0, mediaUrl: '' })}
              >
                remove
              </Button>
            )}
            <Hint>
              optional — a cloth may be known before it is photographed. the texture is what the
              render reads weave, sheen and drape from.
            </Hint>
          </FieldRow>

          <FieldRow label='colour'>
            <ColourPicker
              hex={draft.colourHex}
              recent={recent}
              onPick={(hex) => patch({ colourHex: hex })}
            >
              {/* СЛОВАРЬ КОЛОРВЕЕВ ВНУТРИ ТОГО ЖЕ ПОПОВЕРА: код и hex это ОДНО утверждение, и
                  разводить их по двум органам значило бы дать им разойтись. */}
              <DictionarySwatches
                code={draft.colourCode}
                onPick={(code, hex) => patch({ colourCode: code, colourHex: hex })}
              />
            </ColourPicker>
            <div className='w-[92px]'>
              <Input
                name='asset-colour-code'
                data-asset-code
                value={draft.colourCode}
                maxLength={32}
                placeholder='OLV'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  patch({ colourCode: e.target.value })
                }
              />
            </div>
            <Hint>the colourway code, when this cloth has one; the swatch is its screen value</Hint>
          </FieldRow>

          {kindTakesRepeat(draft.kind) && (
            <>
              <FieldRow label='built from'>
                {/* РОДИТЕЛЬ — ПРОИСХОЖДЕНИЕ, А НЕ КОПИЯ. Ткань можно удалить, паттерн переживёт её
                    со своей картинкой и своим раппортом (миграция ставит SET NULL). */}
                <select
                  data-asset-parent
                  className='h-[22px] min-w-[180px] border border-borderColor bg-bgColor px-[7px] text-default focus:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  value={String(draft.derivedFromAssetId || 0)}
                  onChange={(e) => patch({ derivedFromAssetId: Number(e.target.value) })}
                >
                  <option value='0'>— brought in on its own —</option>
                  {fabrics.map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      {assetLabel(f)}
                    </option>
                  ))}
                </select>
                <Hint>which cloth this pattern was built from</Hint>
              </FieldRow>

              <FieldRow label='repeat'>
                <div className='w-[80px]'>
                  <Input
                    name='asset-repeat'
                    data-asset-repeat
                    type='number'
                    value={draft.repeatMm}
                    placeholder='60'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      patch({ repeatMm: e.target.value })
                    }
                  />
                </div>
                <Text size='micro' variant='label' component='span'>
                  mm
                </Text>
                <div className='w-[80px]'>
                  <Input
                    name='asset-rotation'
                    data-asset-rotation
                    type='number'
                    value={draft.rotationDeg}
                    placeholder='0'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      patch({ rotationDeg: e.target.value })
                    }
                  />
                </div>
                <Text size='micro' variant='label' component='span'>
                  ° clockwise
                </Text>
                <Hint>
                  how large the repeat is on the finished garment, and how it sits. a number the
                  factory and the model can both act on, unlike «large».
                </Hint>
              </FieldRow>
            </>
          )}

          <FieldRow label='in words'>
            <div className='w-full max-w-[420px]'>
              <Textarea
                name='asset-note'
                data-asset-note
                value={draft.note}
                maxLength={ASSET_NOTE_MAX}
                autoGrow={false}
                rows={2}
                placeholder='brushed, slight sheen · matte gunmetal · 15 mm'
                className='resize-none'
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  patch({ note: e.target.value })
                }
              />
            </div>
          </FieldRow>

          <div className='flex items-center gap-2 pt-2'>
            <Button
              size='sm'
              data-asset-save
              loading={writes.upsertAsset.isPending}
              disabled={!nameTaken || writes.upsertAsset.isPending || (full && !draft.assetId)}
              onClick={save}
            >
              {draft.assetId ? 'save the asset' : 'add the asset'}
            </Button>
            <Button variant='secondary' size='sm' onClick={() => setDraft(null)}>
              cancel
            </Button>
            {/* ОТКАЗ НАЗВАН РЯДОМ С КНОПКОЙ, А НЕ ПОСЛЕ НАЖАТИЯ. Нажимаемая кнопка, которая молча
                ничего не делает, читается как сломанная. */}
            {!nameTaken && (
              <Text size='micro' variant='label' component='span' className='normal-case'>
                give it a name first — the sheet and the prompt cite it by that.
              </Text>
            )}
            {full && !draft.assetId && (
              <Text size='micro' variant='label' component='span' className='normal-case'>
                this card already holds {ASSETS_PER_CARD_MAX} assets.
              </Text>
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        open={pendingRemove != null}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          const target = pendingRemove;
          setPendingRemove(null);
          if (target?.id) {
            writes.deleteAsset.mutate(target.id);
            if (draft?.assetId === target.id) setDraft(null);
          }
        }}
        title='remove the asset'
        confirmLabel='remove it'
        width='sm'
      >
        <div className='space-y-2'>
          <Text size='control'>
            «{assetLabel(pendingRemove ?? undefined)}» leaves this card's shelves.
          </Text>
          {/* ЦЕНА НАЗЫВАЕТСЯ ЧИСЛОМ ДО, А НЕ ОБНАРУЖИВАЕТСЯ ПОСЛЕ: метки — это работа, сделанная
              руками на чужих кадрах, и удаление, стёршее восемь из них молча, невозможно было бы
              предсказать по тому, на что человек смотрит. */}
          {pendingRemove?.id != null && placementsOfAsset(band, pendingRemove.id).length > 0 && (
            <Text size='control'>
              {placementsOfAsset(band, pendingRemove.id).length} mark
              {placementsOfAsset(band, pendingRemove.id).length === 1 ? '' : 's'} drawn on the flats
              go with it — a mark is this asset's own statement about itself and means nothing once
              it is gone.
            </Text>
          )}
          <Text size='control'>
            The picture file stays in the library. A pattern built from this cloth stays too, with
            its parentage cleared.
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}

/**
 * ОДНА ПЛИТКА ПОЛКИ. Кадр рисует общий примитив, поэтому углы здесь не назначаются: ✕ справа
 * сверху, `edit` справа снизу, zoom — там же, где во всей студии. Владелец уже жаловался ровно на
 * то, что органы стоят «везде по разному».
 */
function AssetCell({
  asset,
  kind,
  readOnly,
  selected,
  marks,
  onEdit,
  onRemove,
  onMakePattern,
}: {
  asset: common_DesignAsset;
  kind: AssetKind;
  readOnly: boolean;
  selected: boolean;
  marks: number;
  onEdit: () => void;
  onRemove: () => void;
  onMakePattern?: () => void;
}): JSX.Element {
  const name = assetLabel(asset);
  const url = assetThumb(asset);
  const hex = (asset.colourHex ?? '').trim();
  return (
    <div className='flex w-[132px] shrink-0 flex-col gap-1' data-asset-cell={asset.id}>
      <PictureTile
        url={url}
        alt={name}
        aspect='132/148'
        fit='cover'
        selected={selected}
        className='w-full bg-bgColor'
        badge={kind === 'pattern' && asset.repeatMm ? `${asset.repeatMm} mm` : undefined}
        gallery={url ? { src: assetFull(asset), thumbnail: url, type: 'image', alt: name } : undefined}
        onEdit={
          readOnly ? undefined : { onClick: onEdit, ariaLabel: `edit ${name}`, title: 'edit this asset' }
        }
        onRemove={
          readOnly
            ? undefined
            : {
                onClick: onRemove,
                ariaLabel: `remove ${name}`,
                title: 'remove this asset and its marks',
              }
        }
      >
        {!url && (
          <div className='pointer-events-none absolute inset-x-0 bottom-1 z-20 px-1 text-center'>
            <Text size='nano' variant='label' component='span'>
              stated in words
            </Text>
          </div>
        )}
      </PictureTile>

      <div className='flex min-w-0 items-center gap-1'>
        {hex ? <Swatch hex={hex} size={10} /> : null}
        <Text size='nano' component='span' className='min-w-0 truncate font-bold uppercase'>
          {name}
        </Text>
      </div>
      <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
        {[(asset.colourCode ?? '').trim(), marks > 0 ? `${marks} marked` : '']
          .filter(Boolean)
          .join(' · ') || '—'}
      </Text>
      {onMakePattern && !readOnly && (
        <>
        {/* ⚠ ОДНОСТРОЧНАЯ И ПРИЖАТАЯ К НИЗУ. «make a pattern ▸» переносилось на вторую строку и
           делало ячейку ткани выше ячеек паттерна и фурнитуры — ровно ту неровность рядов, на
           которую владелец жаловался отдельным пунктом круга. `mt-auto` держит подвал ячейки на
           одной линии, `whitespace-nowrap` не даёт слову уехать вниз. */}
        <Button
          variant='secondary'
          size='xs'
          className='mt-auto whitespace-nowrap'
          data-make-pattern={asset.id}
          title='build a pattern out of this cloth: its repeat and how it sits'
          onClick={onMakePattern}
        >
          pattern ▸
        </Button>
        </>
      )}
    </div>
  );
}

/** Словарь колорвеев внутри поповера цвета. Пустой словарь говорит это словами, а не пустотой. */
function DictionarySwatches({
  code,
  onPick,
}: {
  code: string;
  onPick: (code: string, hex: string) => void;
}): JSX.Element {
  const { dictionary } = useDictionary();
  const colors = (dictionary?.colors ?? []).filter((c) => !c.archived && (c.code ?? '').trim());
  if (!colors.length) {
    return (
      <Text size='nano' variant='label' component='p' className='normal-case'>
        the colour dictionary is empty on this server — type a hex above.
      </Text>
    );
  }
  const current = (code ?? '').trim().toUpperCase();
  return (
    <div className='space-y-1'>
      <Text size='nano' variant='label' component='p' className='uppercase'>
        colourway dictionary
      </Text>
      <div className='flex max-h-[92px] flex-wrap gap-1 overflow-y-auto'>
        {colors.map((c) => {
          const value = (c.code ?? '').trim().toUpperCase();
          return (
            <button
              key={value}
              type='button'
              title={`${value}${c.name ? ` · ${c.name}` : ''}`}
              aria-label={`colourway ${value}`}
              data-dict-colour={value}
              onClick={() => onPick(value, (c.hex ?? '').trim())}
              className={cn(
                'size-[18px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                value === current ? 'border-2 border-textColor' : 'border-textInactiveColor',
              )}
              style={{ background: (c.hex ?? '').trim() || undefined }}
            />
          );
        })}
      </div>
    </div>
  );
}
