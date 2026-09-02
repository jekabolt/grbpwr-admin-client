import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
} from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import {
  ASSET_NAME_MAX,
  assetLabel,
  assetThumb,
  assetWornBy,
  placementsOfAsset,
} from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { colorwayLabel } from '../colorway-picker';
import { patternAssets } from './model';

/**
 * ═══ ТРЕТИЙ АКТ: ПАТТЕРНЫ ЭТОЙ КАРТОЧКИ — ЕЁ ТКАНИ (G-15) ═════════════════════════════════════
 *
 * Владелец, дословно: «как мы туда можем пробрасывать паттерны которые мы сделаем и как сохранять
 * паттерны». На прямой вопрос он определил и предмет: паттерн — бесшовная плитка, бесшовная плитка
 * — ТКАНЬ; делается один раз, живёт в библиотеке карточки, «в рендере и 3D выбирается как ткань
 * ЭТОГО КОЛОРВЕЯ».
 *
 * ЭТО И ЕСТЬ НЕДОСТАЮЩИЙ АКТ ЭКРАНА. Первые два («сделай плитку», «суди плитку») существовали;
 * третий — «плитка стала тканью карточки, и вот кто её носит» — не существовал НИГДЕ: после
 * «KEEP AS CLOTH» плитка исчезала с глаз и обнаруживалась только чипом в чужом ряду CLOTHS на
 * другой вкладке. Переименовать её было нельзя вообще ни в одном месте админки, хотя промпт
 * ЦИТИРУЕТ АССЕТ ПО ИМЕНИ — то есть «IMG_4471» уезжал в платный прогон как название ткани.
 *
 * ЧТО ЗДЕСЬ ЗАПИСЬ КАРТОЧКИ, А ЧТО НЕТ. Ряд «wear it» пишет `SetDesignAssetColorway` — факт о
 * стиле, переживающий прогон. Пометка `selected` на плитке (второй акт) — вердикт о КАРТИНКЕ.
 * Карточка законно держит помеченную плитку, которой нет в библиотеке, и библиотечную, которую
 * никто не помечал; складывать их в один знак нельзя.
 *
 * ЧИПА «NO COLOURWAY» В РЯДУ НЕТ, И ЭТО НЕ ЗАБЫТЫЙ СЛУЧАЙ. Назначение — заявление о КОЛОРВЕЕ
 * («этот цвет носит эту ткань»), а у безколорвейного верстака носителя нет: назначить ткань
 * «отсутствию колорвея» не на кого, и легаси-рендеры рецептом задним числом не перекрашиваются.
 * Снятие делается повторным нажатием на чип текущего носителя — там же, где назначение, тем же
 * пальцем.
 */

function Row({
  band,
  asset,
  colorways,
  disabled,
  techCardId,
}: {
  band: GetDesignBandResponse;
  asset: common_DesignAsset;
  colorways: common_AdminColorwayRef[];
  disabled?: boolean;
  techCardId: number;
}): JSX.Element {
  const { upsertAsset, deleteAsset, setAssetColorway } = useAssetWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(() => assetLabel(asset));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const id = asset.id ?? 0;
  const worn = assetWornBy(asset);
  const wearer = colorways.find((c) => (c.colorwayId ?? 0) === worn) ?? null;
  const marks = placementsOfAsset(band, id).length;

  /**
   * ПЕРЕИМЕНОВАНИЕ — `UpsertDesignAsset` С ЭХОМ ВСЕХ ПОЛЕЙ, И ЭТО НЕ ПЕДАНТИЧНОСТЬ.
   *
   * Upsert — ПОЛНАЯ ЗАМЕНА строки, а не патч: поле, которое вызывающий не назвал, приезжает нулём
   * и затирает сохранённое. Послать сюда только `{assetId, name}` значило бы вместе с именем стереть
   * `media_id` (плитка перестала бы существовать как картинка), `repeat_mm` («сгенерировано при 120
   * мм» разошлось бы с «положено при 120 мм» — ровно та пара, которую контракт требует держать
   * одним утверждением) и родословную.
   *
   * КОЛОРВЕЙ ПРИ ЭТОМ НЕ ЭХОИТСЯ И НЕ МОЖЕТ БЫТЬ ЭХНУТ: `UpsertDesignAsset` его SET-списком не
   * называет вовсе — ровно для того, чтобы назначение переживало переименование. Это и есть довод,
   * по которому у назначения отдельный глагол.
   */
  const rename = () => {
    const next = name.trim().slice(0, ASSET_NAME_MAX);
    if (!next || next === assetLabel(asset)) {
      setRenaming(false);
      setName(assetLabel(asset));
      return;
    }
    upsertAsset.mutate(
      {
        assetId: id,
        kind: asset.kind ?? '',
        name: next,
        mediaId: asset.mediaId ?? 0,
        colourCode: asset.colourCode ?? '',
        colourHex: asset.colourHex ?? '',
        note: asset.note ?? '',
        derivedFromAssetId: asset.derivedFromAssetId ?? 0,
        repeatMm: asset.repeatMm ?? 0,
        rotationDeg: asset.rotationDeg ?? 0,
        ordinal: asset.ordinal ?? 0,
      },
      { onSettled: () => setRenaming(false) },
    );
  };

  const wear = (colorwayId: number) => {
    if (writesOff || setAssetColorway.isPending) return;
    setAssetColorway.mutate({ assetId: id, colorwayId: colorwayId === worn ? 0 : colorwayId });
  };

  const url = assetThumb(asset);

  return (
    <div
      data-pattern-asset={id}
      data-worn-by={worn}
      className='flex flex-wrap items-start gap-3 border-b border-hairline py-1.5'
    >
      {/* ПРЕВЬЮ — ОДНА ПЛИТКА, НЕ СЦЕНА. Судят стык на сцене второго акта; здесь достаточно узнать
          ткань в лицо, и большой кадр отнял бы место у ряда, ради которого акт и заведён. */}
      {url ? (
        <img
          src={url}
          alt={assetLabel(asset)}
          className='size-[44px] shrink-0 border border-borderColor object-cover'
        />
      ) : (
        <span className='flex size-[44px] shrink-0 items-center justify-center border border-borderColor bg-bgZebra'>
          <Text size='nano' variant='label' component='span'>
            no img
          </Text>
        </span>
      )}

      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-center gap-2'>
          {renaming ? (
            <>
              <div className='w-[180px]'>
                <Input
                  name={`pattern-name-${id}`}
                  value={name}
                  maxLength={ASSET_NAME_MAX}
                  autoFocus
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    // МАТЧ ПО `e.key` ДЛЯ Enter/Escape ЗАКОНЕН: это НЕ буквы. Мёртвым на кириллице
                    // становится сравнение с БУКВОЙ — там нужен `e.code`; у управляющих клавиш
                    // `key` не зависит от раскладки вовсе.
                    if (e.key === 'Enter') rename();
                    if (e.key === 'Escape') {
                      setRenaming(false);
                      setName(assetLabel(asset));
                    }
                  }}
                />
              </div>
              <Button
                variant='secondary'
                size='xs'
                loading={upsertAsset.isPending}
                data-rename-save={id}
                onClick={rename}
              >
                save name
              </Button>
            </>
          ) : (
            <Text
              size='control'
              variant='uppercase'
              tracking='label'
              component='span'
              className='font-bold'
            >
              {assetLabel(asset)}
            </Text>
          )}
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {asset.repeatMm ? `${asset.repeatMm} mm repeat` : 'no repeat stated'}
            {marks ? ` · ${marks} mark${marks === 1 ? '' : 's'} on the flats` : ''}
          </Text>
          <span className='ml-auto flex shrink-0 flex-wrap items-center gap-1'>
            {writesOff ? (
              <InertDoor
                label='rename'
                reason={
                  disabled
                    ? 'this card is read-only for you — the library is card data'
                    : 'this server does not answer the design routes'
                }
              />
            ) : (
              !renaming && (
                <Button
                  variant='secondary'
                  size='xs'
                  data-rename={id}
                  onClick={() => {
                    setName(assetLabel(asset));
                    setRenaming(true);
                  }}
                  title='the prompt cites this fabric BY NAME, so «IMG_4471» reaches the model as the name of the cloth'
                >
                  rename
                </Button>
              )
            )}
            {writesOff ? null : (
              <Button
                variant='secondary'
                size='xs'
                data-delete-asset={id}
                onClick={() => setConfirmDelete(true)}
              >
                delete
              </Button>
            )}
          </span>
        </div>

        {/* ─── КТО ЭТО НОСИТ ─────────────────────────────────────────────────────────────── */}
        {colorways.length === 0 ? (
          <Text size='nano' variant='label' component='p' className='normal-case'>
            this card has no colourways — the pattern still reaches a render as a ticked cloth under
            FABRIC RENDER → FABRIC → CLOTHS.
          </Text>
        ) : (
          <div className='flex flex-wrap items-center gap-2'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='shrink-0 uppercase'
            >
              {wearer ? `worn by ${colorwayLabel(wearer)}` : 'not worn yet'}
            </Text>
            <ChipRow>
              {colorways.map((c) => {
                const cid = c.colorwayId ?? 0;
                const on = cid === worn;
                return (
                  <Chip
                    key={cid}
                    nonForm
                    selected={on}
                    pressed={on}
                    disabled={writesOff || setAssetColorway.isPending}
                    data-wear-cw={cid}
                    title={
                      on
                        ? `press again to take ${assetLabel(asset)} off ${colorwayLabel(c)} — it goes back to wearing its own colour`
                        : `make ${assetLabel(asset)} the fabric of ${colorwayLabel(c)}. One colourway wears one fabric, so this takes ${colorwayLabel(c)} off whatever else was wearing it`
                    }
                    onClick={() => wear(cid)}
                  >
                    {colorwayLabel(c)}
                    {on ? ' ✓' : ''}
                  </Chip>
                );
              })}
            </ChipRow>
          </div>
        )}
      </div>

      {/* ЦЕНА УДАЛЕНИЯ — СЛОВАМИ И ЧИСЛАМИ, как в render-input-strip. Каскад настоящий: сервер
          сносит вместе со строкой КАЖДУЮ её метку на флэтах. */}
      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`delete ${assetLabel(asset)}?`}
        confirmLabel='delete it'
        onConfirm={() => {
          setConfirmDelete(false);
          deleteAsset.mutate(id);
        }}
      >
        <Text size='micro' component='p' className='normal-case'>
          It leaves the card’s cloth shelf, so FABRIC RENDER can no longer tick it.
          {marks ? ` Its ${marks} mark${marks === 1 ? '' : 's'} on the flats go with it.` : ''}
          {wearer ? ` ${colorwayLabel(wearer)} goes back to wearing its own colour.` : ''} The
          PICTURE survives: the tile stays in the run’s history and in ARTIFACTS, and it can be kept
          again.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

export function PatternLibrary({
  band,
  techCardId,
  colorways,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  /** Колорвеи КАРТОЧКИ — приходят из общего состояния студии, вторым чтением не берутся. */
  colorways: common_AdminColorwayRef[];
  disabled?: boolean;
}): JSX.Element {
  const assets = useMemo(() => patternAssets(band), [band]);
  const dressed = assets.filter((a) => assetWornBy(a) > 0).length;

  return (
    <Section
      title='patterns of this card'
      question='— its fabrics; give one to a colourway and every render of that colour starts from it'
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {assets.length} kept
          {colorways.length ? ` · ${dressed} worn` : ''}
        </Text>
      }
    >
      {assets.length === 0 ? (
        <Text size='micro' variant='label' component='p' data-pattern-empty className='normal-case'>
          No pattern is kept yet. Generate one above and press KEEP IN LIBRARY — a kept tile becomes
          a fabric of this card: it outlives the run that made it, it carries the repeat it was made
          at, and it is what the prompt cites by name. A tile left in the feed reaches no render.
        </Text>
      ) : (
        assets.map((a) => (
          <Row
            key={a.id}
            band={band}
            asset={a}
            colorways={colorways}
            disabled={disabled}
            techCardId={techCardId}
          />
        ))
      )}
    </Section>
  );
}
