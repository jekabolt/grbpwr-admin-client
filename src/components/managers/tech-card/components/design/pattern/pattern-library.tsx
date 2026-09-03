import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
} from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import { Tiles } from 'ui/components/tiles';
import Text from 'ui/components/text';

import { ASSET_NAME_MAX, ASSET_PATTERN, assetFull, assetLabel, assetThumb, assetWornBy } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { runIsOnPage } from '../bench-kinds';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { colorwayLabel } from '../colorway-picker';
import { PictureTile } from '../picture-tile';
import { Strip, StripCell } from '../render/strip-cell';
import {
  SEAM_WORDS,
  assetOfMedia,
  nextPatternName,
  patternAssets,
  patternOutputs,
  pictureFull,
  pictureThumb,
  repeatOfRun,
  seamWarningOf,
  shelfIsFull,
} from './model';

/**
 * ═══ ПАТТЕРНЫ ЭТОЙ КАРТОЧКИ — ЕЁ ТКАНИ, И ТЕПЕРЬ ЭТО ВЕСЬ ВТОРОЙ АКТ ЭКРАНА (G-15 + J-12) ═════
 *
 * Владелец, круг 15, дословно: «блок TILES вообще не нужен должен быть удобный просмотр с зумом и
 * тд можно просто оставить блок PATTERNS OF THIS CARD и там сделать более большие карточки
 * паттернов и все». И раньше, про предмет: паттерн — бесшовная плитка, бесшовная плитка — ТКАНЬ;
 * делается один раз, живёт в библиотеке карточки, «в рендере и 3D выбирается как ткань ЭТОГО
 * КОЛОРВЕЯ».
 *
 * ═══ ПОЧЕМУ РЯДЫ 44 px СТАЛИ КАРТОЧКАМИ 220 px ═══════════════════════════════════════════════
 *
 * Здесь стоял список строк с миниатюрой 44 px. Он отвечал на «как эту ткань зовут и кто её носит»
 * и НЕ МОГ ответить на единственный вопрос, который к паттерну вообще есть: СТЫК ВИДЕН? На сорока
 * четырёх пикселях его нет ни у одной плитки. Пока рядом стоял блок TILES со сценой 3×3, разделение
 * труда было честным; блок снят — и вопрос обязан был переехать сюда вместе со своим местом.
 *
 * ЛИЦО КАРТОЧКИ — ПЛИТКА, НАРИСОВАННАЯ 2×2 (`background-repeat`, `background-size: 50% 50%`).
 * Это не украшение и не «превью раппорта»: при 220 px каждая копия ≈ 110 px, а ЕДИНСТВЕННЫЙ
 * перекрёсток четырёх копий приходится ровно на центр лица — самое видное место карточки. Плитка,
 * которая не стыкуется, выдаёт себя крестом посреди картинки, и её не надо никуда открывать.
 *
 * ЗУМ — ОБЩИЙ ПРОСМОТРЩИК СТУДИИ, И ЭТО ВТОРАЯ ПОЛОВИНА «удобного просмотра». Кадр отдаётся
 * ПОЛНЫМ (`assetFull`), а не миниатюрой: замощённое мыло читается как испорченный файл. В
 * просмотрщике живут колесо к курсору, пинч, перетаскивание и восьмикратное увеличение
 * (`media-viewer-zoom.tsx`), а стрелки листают ВСЁ, что на экране, потому что ряд собирает
 * `PictureGalleryProvider` в порядке документа.
 *
 * ═══ ⚠ ДВЕРЬ `KEEP` ЖИВА И СТОИТ ЗДЕСЬ, В ПОЛОСЕ «MADE EARLIER, NOT KEPT» ════════════════════
 *
 * Снести её вместе с блоком TILES было НЕЛЬЗЯ, и это не осторожность, а арифметика: сервер
 * плитку на полку карточки НЕ КЛАДЁТ — прогон отдаёт картинку в ленту, а ассет заводит человек
 * (`UpsertDesignAsset`). Автоматическая посадка при закрытии прогона — правка бэкенда, которой на
 * бете нет. Без этой двери каждый оплаченный прогон паттерна становился бы картинкой, которую ни
 * один рендер не увидит никогда.
 *
 * Поэтому «блок TILES не нужен» исполнен как СНОС БЛОКА, а не как снос акта: плитки, вернувшиеся
 * из прогонов и не положенные на полку, стоят полосой ВНУТРИ этого блока, под своей подписью, с
 * зумом и одной кнопкой. Полоса исчезает целиком, когда таких плиток нет, — а это нормальное
 * состояние карточки, где всё положено.
 *
 * ЧТО ЗДЕСЬ ЗАПИСЬ КАРТОЧКИ, А ЧТО НЕТ. Чипы носки пишут `SetDesignAssetColorway` — факт о стиле,
 * переживающий прогон, и после J-20 это ЕДИНСТВЕННОЕ место админки, где он ставится. Пометка
 * `selected` на картинке (вердикт о КАДРЕ) сюда не переехала и не должна: её читает и ставит
 * ARTIFACTS, там же, где она и фильтрует.
 *
 * ЧИПА «NO COLOURWAY» В РЯДУ НЕТ, И ЭТО НЕ ЗАБЫТЫЙ СЛУЧАЙ. Назначение — заявление о КОЛОРВЕЕ
 * («этот цвет носит эту ткань»), а у безколорвейного верстака носителя нет. Снятие делается
 * повторным нажатием на чип текущего носителя — там же, где назначение, тем же пальцем.
 */

/**
 * ЛИЦО КАРТОЧКИ. Квадрат, замощённый плиткой 2×2.
 *
 * ⚠ `background-size: 50% 50%` — ЭТО РОВНО ЧЕТЫРЕ КОПИИ, а не «примерно четыре»: доля считается от
 * коробки, а коробка квадратная, поэтому у копий тот же квадрат, что у самой плитки, и стык не
 * растянут. Стоило бы взять `contain` или пиксели — и вертикальный период разошёлся бы с
 * горизонтальным на карточке любой другой ширины, то есть крест в центре перестал бы быть стыком.
 */
function TiledFace({ url, alt }: { url: string; alt: string }): JSX.Element {
  return (
    <div
      role='img'
      aria-label={`${alt} — the tile repeated four times, so the join runs through the middle`}
      data-tiled-face
      className='h-full w-full bg-bgColor'
      style={{
        backgroundImage: `url(${JSON.stringify(url)})`,
        backgroundSize: '50% 50%',
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

function Card({
  asset,
  colorways,
  disabled,
  techCardId,
  seam,
  runId,
}: {
  asset: common_DesignAsset;
  colorways: common_AdminColorwayRef[];
  disabled?: boolean;
  techCardId: number;
  /** Сервер померил стык этой плитки и нашёл его видимым. Читается с ПРОГОНА, не с ассета. */
  seam: boolean;
  /** Прогон, сделавший плитку, если он ещё на странице ленты. `0` — спрашивать не у кого. */
  runId: number;
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

  /**
   * ПЕРЕИМЕНОВАНИЕ — `UpsertDesignAsset` С ЭХОМ ВСЕХ ПОЛЕЙ, И ЭТО НЕ ПЕДАНТИЧНОСТЬ.
   *
   * Upsert — ПОЛНАЯ ЗАМЕНА строки, а не патч: поле, которое вызывающий не назвал, приезжает нулём
   * и затирает сохранённое. Послать сюда только `{assetId, name}` значило бы вместе с именем стереть
   * `media_id` (плитка перестала бы существовать как картинка), `repeat_mm` и родословную.
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

  const thumb = assetThumb(asset);
  const full = assetFull(asset) || thumb;
  const label = assetLabel(asset);

  return (
    <div data-pattern-asset={id} data-worn-by={worn} className='flex flex-col gap-1'>
      {/* ПЛИТКА — «СВОЯ ПОВЕРХНОСТЬ», а не блок в блоке: у неё одна рамка от `PictureTile` и
          никакого второго border+bg вокруг (DESIGN.md, «блок не содержит блока»). */}
      {full ? (
        <PictureTile
          url={full}
          alt={label}
          aspect='1/1'
          className='w-full'
          face={<TiledFace url={full} alt={label} />}
          gallery={{ src: full, thumbnail: thumb || full, type: 'image', alt: label }}
        />
      ) : (
        <div className='flex aspect-square w-full items-center justify-center border border-borderColor bg-bgZebra'>
          <Text size='nano' variant='label' component='span' className='uppercase'>
            no image
          </Text>
        </div>
      )}

      {/* ─── ИМЯ. Промпт ЦИТИРУЕТ ткань по нему, поэтому оно правится прямо здесь. ─────────── */}
      <div className='flex min-w-0 flex-wrap items-center gap-1'>
        {renaming ? (
          <>
            <div className='min-w-0 flex-1'>
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
              save
            </Button>
          </>
        ) : (
          <Text
            size='control'
            variant='uppercase'
            tracking='label'
            component='span'
            className='min-w-0 break-words font-bold'
          >
            {label}
          </Text>
        )}
      </div>

      <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
        {wearer ? `worn by ${colorwayLabel(wearer)}` : 'not worn yet'}
        {/* ЛЕГАСИ-ЧИСЛО ПОКАЗЫВАЕТСЯ ТОЛЬКО ТОГДА, КОГДА ОНО ЕСТЬ. Новые паттерны его не несут
            (J-12 снял ряд SCALE, и `repeat_mm` уезжает нулём), а у старых оно настоящее и
            по-прежнему доезжает в промпт многоткани — молчать о нём было бы потерей. */}
        {asset.repeatMm ? ` · ${asset.repeatMm} mm` : ''}
        {runId > 0 ? ` · run ${runId}` : ''}
      </Text>

      {/* ⚠ ВЕРДИКТ О СТЫКЕ — РЯДОМ С ПЛИТКОЙ, А НЕ В ИСТОРИИ. Строка ленты говорит `done`, потому
          что прогон и правда завершился и был оплачен; шов сервер померил ОТДЕЛЬНО и записал на
          попытке. Читатель, который смотрит только на прогон, о нём не узнает вовсе. */}
      {seam && (
        <span>
          <Pill tone='warn' title={SEAM_WORDS}>
            join measured as visible
          </Pill>
        </span>
      )}

      {/* ─── КТО ЭТО НОСИТ ──────────────────────────────────────────────────────────────────── */}
      {colorways.length === 0 ? (
        <Text size='nano' variant='label' component='p' className='normal-case'>
          this card has no colourways — any render can still pick this pattern under FABRIC RENDER.
        </Text>
      ) : (
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
                    ? `press again to take ${label} off ${colorwayLabel(c)} — it goes back to wearing its own colour`
                    : `make ${label} the fabric of ${colorwayLabel(c)}. One colourway wears one fabric, so this takes ${colorwayLabel(c)} off whatever else was wearing it`
                }
                onClick={() => wear(cid)}
              >
                {colorwayLabel(c)}
                {on ? ' ✓' : ''}
              </Chip>
            );
          })}
        </ChipRow>
      )}

      <div className='mt-auto flex flex-wrap items-center gap-1 pt-0.5'>
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
      </div>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`delete ${label}?`}
        confirmLabel='delete it'
        onConfirm={() => {
          setConfirmDelete(false);
          deleteAsset.mutate(id);
        }}
      >
        <Text size='micro' component='p' className='normal-case'>
          It leaves the card’s cloth shelf, so FABRIC RENDER can no longer pick it.
          {wearer ? ` ${colorwayLabel(wearer)} goes back to wearing its own colour.` : ''} The
          PICTURE survives: the tile stays in the run’s history and in ARTIFACTS, and it can be kept
          again from the strip below.
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
  const { upsertAsset } = useAssetWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const assets = useMemo(() => patternAssets(band), [band]);
  const outputs = useMemo(() => patternOutputs(band), [band]);
  const dressed = assets.filter((a) => assetWornBy(a) > 0).length;

  /**
   * ПРОГОН, СДЕЛАВШИЙ ПЛИТКУ, ИЩЕТСЯ ПО МЕДИА — у ассета нет `picture_id`, у него `media_id`.
   * Прогон, вытесненный со страницы ленты, здесь не найдётся, и это честный ответ «спросить не у
   * кого»: вердикт о стыке живёт на попытках прогона, а не на ассете.
   */
  const runOfAsset = useMemo(() => {
    const m = new Map<number, { seam: boolean; runId: number }>();
    for (const { picture, run } of outputs) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0 && !m.has(mediaId)) {
        m.set(mediaId, { seam: seamWarningOf(run), runId: run.id ?? 0 });
      }
    }
    return m;
  }, [outputs]);

  /** Плитки, вернувшиеся из прогонов и НЕ положенные на полку. Пусто — полосы нет вовсе. */
  const unkept = useMemo(
    () => outputs.filter(({ picture }) => !assetOfMedia(band, picture.media?.id ?? 0)),
    [outputs, band],
  );

  const shelfFull = shelfIsFull(band);

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
          No pattern is kept yet. Attach a picture above and press GENERATE — what comes back is
          kept here, it can be renamed, and the colourway that wears it starts every render from it.
        </Text>
      ) : (
        /* 220 px — НИЖНЯЯ ГРАНИЦА, ПРИ КОТОРОЙ ЛИЦО ЕЩЁ ОТВЕЧАЕТ НА СВОЙ ВОПРОС: каждая из
           четырёх копий ≈ 110 px, и стык в центре читается без наведения. Дорожка `1fr` растит
           карточки дальше на широком экране, где места и правда больше. */
        <Tiles min={220}>
          {assets.map((a) => {
            const found = runOfAsset.get(a.mediaId ?? 0);
            return (
              <Card
                key={a.id}
                asset={a}
                colorways={colorways}
                disabled={disabled}
                techCardId={techCardId}
                seam={!!found?.seam}
                runId={found?.runId ?? 0}
              />
            );
          })}
        </Tiles>
      )}

      {/* ═══ ПЛИТКИ, КОТОРЫЕ ВЕРНУЛИСЬ И НЕ ЛЕГЛИ НА ПОЛКУ ══════════════════════════════════════
          Полоса — не «второй список паттернов», а НЕЗАКОНЧЕННОЕ ДЕЛО: за эти картинки уже
          заплачено, и до нажатия кнопки ни один рендер их не увидит. Её нет вовсе, когда таких
          картинок нет, — и это нормальное состояние прибранной карточки. */}
      {unkept.length > 0 && (
        <>
          <GroupLabel
            action={
              <Text size='micro' variant='label' component='span' className='normal-case'>
                paid for, but no render can use one until it is kept
              </Text>
            }
          >
            made earlier, not kept
          </GroupLabel>
          <Strip>
            {unkept.map(({ picture, run }) => {
              const mediaId = picture.media?.id ?? 0;
              const full = pictureFull(picture);
              /* РАППОРТ НАСЛЕДУЕТСЯ ОТ ПРОГОНА, а не выдумывается: у плитки, сделанной ДО J-12,
                 он настоящий и доезжает в промпт многоткани. Прогон вне страницы ленты ответить
                 не может — и тогда дверь закрыта, а не пишет ноль наугад. */
              const known = runIsOnPage(band, run);
              const repeat = known ? repeatOfRun(run) : 0;
              return (
                <StripCell
                  key={picture.id}
                  src={pictureThumb(picture)}
                  alt={`tile from run ${run.id ?? ''}`}
                  cellPictureId={picture.id}
                  gallery={
                    full
                      ? {
                          src: full,
                          thumbnail: pictureThumb(picture),
                          type: 'image',
                          alt: `tile from run ${run.id ?? ''}`,
                        }
                      : undefined
                  }
                  lines={[
                    `${(run.id ?? 0) > 0 ? `run ${run.id}` : 'no run'}${repeat ? ` · ${repeat} mm` : ''}`,
                    seamWarningOf(run) ? 'join measured as visible' : '',
                  ]}
                  action={
                    writesOff ? (
                      <InertDoor
                        label='keep'
                        reason={
                          disabled
                            ? 'this card is read-only for you — the library is card data'
                            : 'this server does not answer the design routes'
                        }
                      />
                    ) : shelfFull ? (
                      <InertDoor
                        label='keep'
                        reason='this card already holds its 40 assets — delete a pattern above, or a cloth under FABRIC RENDER → INPUT → CLOTH, before keeping another'
                      />
                    ) : !known ? (
                      <InertDoor
                        label='keep'
                        reason='the run that made this tile is off this page of the feed, so its repeat cannot be read — and a fabric kept without one would send an invented 0 mm into every render of it. Press `show all` in GENERATION HISTORY to bring that run back, then keep it from here'
                      />
                    ) : (
                      <Button
                        variant='secondary'
                        size='xs'
                        data-keep-tile={picture.id}
                        disabled={upsertAsset.isPending || mediaId <= 0}
                        onClick={() =>
                          upsertAsset.mutate({
                            assetId: 0,
                            kind: ASSET_PATTERN,
                            name: nextPatternName(band),
                            mediaId,
                            repeatMm: repeat,
                          })
                        }
                        title='keep this tile as a fabric of the card — above it can be renamed and given to a colourway, and every render of that colourway then starts from it'
                      >
                        keep
                      </Button>
                    )
                  }
                />
              );
            })}
          </Strip>
        </>
      )}
    </Section>
  );
}
