import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Placeholder } from 'ui/components/placeholder';
import { Tiles } from 'ui/components/tiles';
import Text from 'ui/components/text';

import {
  ASSETS_PER_CARD_MAX,
  ASSET_NAME_MAX,
  ASSET_PATTERN,
  assetFull,
  assetLabel,
  assetThumb,
} from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { runIsOnPage } from '../bench-kinds';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { AskModal, Counter, EmptyState, GROUP_GAP } from '../core';
import { useElapsed } from '../generation';
import { formatMoney } from '../generation/money';
import { PictureTile } from '../picture-tile';
import { useDesignWrites } from '../use-design-band';
import {
  assetOfMedia,
  nextPatternName,
  patternAssets,
  patternOutputs,
  patternTwin,
  pictureFull,
  pictureThumb,
  repeatOfRun,
  seamWarningOf,
  shelfIsFull,
} from './model';
import { CornerLabel, GoToStep, LockLine, TiledFace } from './organs';

/**
 * ═══ THE SHELF — `TILES ON THIS CARD`, and under it what was paid for and not kept ═════════════
 *
 * The second half of the PATTERN block: the tiles this card keeps, one card each, large enough
 * that the ONE question a tile ever gets — does the join show? — is answered on its face. The
 * face is the tile laid out 2×2, the verdict stands in the corner where it is seen, and the
 * colourway the tile is worn by is bound right under it.
 *
 * ═══ A NAMED RUN LANDS ON THE SHELF BY ITSELF ═══════════════════════════════════════════════════
 *
 * `keepPatternTx` (server) files the `pattern` asset in the transaction that closes the run, from
 * the frozen `params.pattern.name`. Nothing here is a save path. The two client writers of the
 * asset table are `rename` and the legacy `keep it` door under `made earlier, not kept`, which
 * adopts exactly two kinds of orphan: runs frozen before the name existed, and runs that hit
 * `library_full`. That strip is absent on a tidy card, and that is the normal state.
 *
 * ═══ WORN BY IS A FACT, NOT AN EFFECT (E-15, B-26) ═════════════════════════════════════════════
 *
 * The chips write `SetDesignAssetColorway` and read it back; they do NOT seed the render's cloth
 * (`fabricOfColorway` has no callers) — that seeding is what the old chips were removed for, and
 * the owner asked the FACT back («привязать паттерн к колорвею»), not the effect.
 */

/** Whether the tile's join was measured, and how. Read off the RUN (the attempt row), not the asset. */
type Verdict = 'seamless' | 'join visible' | undefined;

function Card({
  asset,
  band,
  techCardId,
  disabled,
  verdict,
  autoRename,
  onRenameTaken,
}: {
  asset: common_DesignAsset;
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  verdict: Verdict;
  /** `keep it` just filed this tile — open its name for the second thought right away. */
  autoRename?: boolean;
  onRenameTaken?: () => void;
}): JSX.Element {
  const { upsertAsset, deleteAsset } = useAssetWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const id = asset.id ?? 0;
  const label = assetLabel(asset);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(label);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!autoRename) return;
    setName(label);
    setRenaming(true);
    onRenameTaken?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRename]);

  const twin = renaming ? patternTwin(band, name, id) : undefined;

  /**
   * RENAME IS `UpsertDesignAsset` WITH EVERY FIELD ECHOED. Upsert REPLACES the row: a field not
   * named arrives as zero and wipes what was saved — `media_id` (the tile would stop being a
   * picture), `repeat_mm`, the parentage. The colourway is NOT echoed and cannot be: the upsert's
   * SET list does not name it, exactly so a rename survives the binding.
   */
  const rename = () => {
    const next = name.trim().slice(0, ASSET_NAME_MAX);
    if (!next || next === label) {
      setRenaming(false);
      setName(label);
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

  const thumb = assetThumb(asset);
  const full = assetFull(asset) || thumb;
  const mm = asset.repeatMm ?? 0;

  /* WHAT IS LOST WITH THE TILE — computed once, read by the question and by nothing else: the
     act itself only deletes the row. The picture is not among the losses: it goes back to
     «made earlier, not kept», and the sentence says so first. */
  const losses = ['its name', mm ? `its ${mm} mm repeat` : ''].filter(Boolean);
  const lossPhrase =
    losses.length > 1
      ? `${losses.slice(0, -1).join(', ')} and ${losses[losses.length - 1]} are not kept with it.`
      : `${losses[0]} is not kept with it.`;

  return (
    <div data-pattern-asset={id} className='flex min-w-0 flex-col gap-1'>
      {full ? (
        <PictureTile
          url={full}
          alt={label}
          aspect='1/1'
          className='w-full'
          face={<TiledFace url={full} alt={label} />}
          gallery={{ src: full, thumbnail: thumb || full, type: 'image', alt: label }}
          /* ═══ RENAME И ✕ — УГЛОВЫЕ ОРГАНЫ КАДРА (владелец, r3 п.19) ══════════════════════════
             Дословно: «RENAME и ✕ — на картинку, не кнопками снизу». Оба стояли ПОД плиткой
             отдельным рядом, то есть на сетке из десяти плиток внизу каждой висела пара кнопок —
             двадцать органов, видимых всегда. Углы `PictureTile` тихие: они появляются по
             наведению И по фокусу, а на устройстве без наведения видны всегда, и это тот же орган,
             которым на соседних экранах студии режут, зумят и правят.
             ⚠ ЯКОРЬ ПРОБЫ ПЕРЕЕХАЛ НА `aria-label`: угол примитива данных-атрибутов не принимает,
             а заводить их ему ради одного экрана значило бы править общий орган под частный
             случай. Имя при этом читаемое, а не служебное. */
          onEdit={{
            onClick: () => {
              if (renaming) rename();
              else {
                setName(label);
                setRenaming(true);
              }
            },
            ariaLabel: renaming ? `save the new name of ${label}` : `rename ${label}`,
            title:
              writesOff
                ? disabled
                  ? 'this card is read-only for you — the library is card data'
                  : 'this server does not answer the design routes'
                : 'the prompt cites this fabric BY NAME, so «IMG_4471» reaches the model as the name of the cloth',
            disabled: writesOff,
            pending: upsertAsset.isPending,
          }}
          editLabel={renaming ? 'done' : 'rename'}
          onRemove={{
            onClick: () => setAsking(true),
            ariaLabel: `delete ${label}`,
            title: writesOff
              ? disabled
                ? 'this card is read-only for you — the library is card data'
                : 'this server does not answer the design routes'
              : `delete ${label}`,
            disabled: writesOff,
          }}
        >
          {/* THE VERDICT ON THE FACE, where it is seen. Solid for a wrap that closes, dashed for
              a join that shows; no red — red in this admin means loss. Absent when the run that
              made the tile is off this page of the feed: the verdict lives on its attempt row,
              and a verdict nobody measured is not printed. */}
          {verdict === 'seamless' && (
            <CornerLabel at='bl' data-verdict='seamless'>
              seamless
            </CornerLabel>
          )}
          {verdict === 'join visible' && (
            <CornerLabel at='bl' gap data-verdict='join visible'>
              join visible
            </CornerLabel>
          )}
          <CornerLabel at='br'>pattern</CornerLabel>
        </PictureTile>
      ) : (
        <div className='flex aspect-square w-full items-center justify-center border border-borderColor bg-bgZebra'>
          <Text size='nano' variant='label' component='span' className='uppercase'>
            no image
          </Text>
        </div>
      )}

      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className='min-w-0 truncate font-bold'
        title={label}
      >
        {label}
      </Text>
      {/* The legacy repeat is shown only when it exists: new tiles travel with 0 (the model
          picks the density), old ones carry a real number that still reaches the cloth prompt. */}
      {mm > 0 && (
        <Text size='nano' variant='label' component='span'>
          {`${mm} mm`}
        </Text>
      )}

      {/* ⚠ РЯД КНОПОК ПОД ПЛИТКОЙ ОСТАЛСЯ ТОЛЬКО У КАДРА, КОТОРОГО НЕТ. Углы живут НА картинке, и
          у строки без картинки вешать их некуда — а переименовать и удалить её надо тем более
          (именно она чаще всего и есть ошибка). Это не второй способ сделать одно: у плитки с
          кадром этого ряда нет вовсе. */}
      {!full && (
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
            <>
              <Button
                variant='secondary'
                size='xs'
                data-rename={id}
                aria-expanded={renaming}
                loading={upsertAsset.isPending}
                onClick={() => {
                  if (renaming) rename();
                  else {
                    setName(label);
                    setRenaming(true);
                  }
                }}
              >
                {renaming ? 'done' : 'rename'}
              </Button>
              <span className='flex-1' />
              <Button
                variant='secondary'
                size='xs'
                data-delete-asset={id}
                aria-label={`delete ${label}`}
                onClick={() => setAsking(true)}
              >
                ✕
              </Button>
            </>
          )}
        </div>
      )}

      {renaming && (
        <div className='flex flex-col gap-0.5'>
          <Input
            name={`pattern-name-${id}`}
            value={name}
            maxLength={ASSET_NAME_MAX}
            autoFocus
            aria-label='new name for this tile'
            placeholder='twill repeat'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              // Enter/Escape are not letters: `e.key` is layout-independent for them.
              if (e.key === 'Enter') rename();
              if (e.key === 'Escape') {
                setRenaming(false);
                setName(label);
              }
            }}
          />
          {/* ADVICE, NOT A GATE: an old row is being corrected, not a new one filed. The gate's
              phrase is about the new tile and is not repeated here on purpose. */}
          {twin && (
            <Text size='nano' variant='label' component='span' data-rename-twin=''>
              another tile on this card already carries this name
            </Text>
          )}
        </div>
      )}

      <AskModal
        open={asking}
        title='delete a named tile'
        sentence={
          <>
            the picture goes back to «made earlier, not kept». {lossPhrase}
          </>
        }
        verb='delete the tile'
        onClose={() => setAsking(false)}
        onDo={() => {
          setAsking(false);
          deleteAsset.mutate(id);
        }}
      />
    </div>
  );
}

/**
 * THE HOLE OF A LIVE RUN — the shape of the answer, standing where the answer will land. A screen
 * that does not change after the click reads as «nothing happened», and the next thing a person
 * does is pay twice. Its own component because of the hook: `useElapsed` ticks once a second and
 * must redraw one cell, not every tiled face on the shelf.
 */
function PendingTile({ startedAt }: { startedAt?: string | null }): JSX.Element {
  const elapsed = useElapsed(startedAt ?? undefined);
  return (
    <div data-pattern-pending className='flex flex-col gap-1'>
      <Placeholder dashed aspect='square' className='w-full' label={`running ${elapsed || '0:00'}`} />
    </div>
  );
}

export function PatternLibrary({
  band,
  techCardId,
  disabled,
  live,
  hasSource,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Live pattern runs, counted by the caller — one answer to «what is in flight» per screen. */
  live?: common_DesignRun[];
  /** Is a source attached above? The empty shelf's one line says what to do next. */
  hasSource: boolean;
}): JSX.Element {
  const { upsertAsset } = useAssetWrites(techCardId);
  const { setPictureSelected } = useDesignWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const assets = useMemo(() => patternAssets(band), [band]);
  const outputs = useMemo(() => patternOutputs(band), [band]);

  /** The run that made each tile, found by MEDIA — the asset holds `media_id`, not a picture id. */
  const verdictOf = useMemo(() => {
    const m = new Map<number, Verdict>();
    for (const { picture, run } of outputs) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0 && !m.has(mediaId)) {
        m.set(mediaId, seamWarningOf(run) ? 'join visible' : 'seamless');
      }
    }
    return m;
  }, [outputs]);

  /** Came back from a run and did not land on the shelf. Empty — the group is not drawn. */
  const unkept = useMemo(
    () => outputs.filter(({ picture }) => !assetOfMedia(band, picture.media?.id ?? 0)),
    [outputs, band],
  );

  const shelfFull = shelfIsFull(band);
  const pending = live ?? [];
  /* `keep it` files the tile under a minted name and opens the rename on it as soon as the band
     brings it back — the name is asked where it will be typed, not as a refusal over a paid frame. */
  const [renameMedia, setRenameMedia] = useState(0);

  return (
    <>
      <GroupLabel
        className={GROUP_GAP}
        action={
          <span data-tiles-count=''>
            <Counter n={assets.length} noun='tile' />
          </span>
        }
      >
        tiles on this card
      </GroupLabel>

      {assets.length === 0 && pending.length === 0 ? (
        /* ═══ ПУСТАЯ ПОЛКА — ОДНА СТРОКА, БЕЗ ДВЕРИ (владелец, r3 п.17) ═════════════════════
           Дословно: «пустое состояние TILES ON THIS CARD — без кнопки “ATTACH A PICTURE ›”».
           Дверь вела в тот же пикер, что ячейка SOURCE PICTURE, стоящая на том же экране двумя
           линейками выше и уже пустая с подписью `+ picture`: второй орган на тот же жест. Строка
           при этом по-прежнему говорит, ЧТО делать дальше, — просто словами, а не кнопкой. */
        <div data-shelf-empty=''>
          <EmptyState>
            {hasSource
              ? 'no tile is kept on this card yet · run GENERATE above'
              : 'no tile is kept on this card yet · fill SOURCE PICTURE above to make one'}
          </EmptyState>
        </div>
      ) : (
        /* 186 px is the floor at which the face still answers its question: each of the four
           copies ≈ 93 px, and the join in the centre reads without hovering. */
        <Tiles min={186} data-pattern-shelf=''>
          {pending.map((r) => (
            <PendingTile
              key={r.id ?? `live-${r.startedAt ?? ''}`}
              startedAt={r.startedAt ?? r.createdAt}
            />
          ))}
          {assets.map((a) => (
            <Card
              key={a.id}
              asset={a}
              band={band}
              techCardId={techCardId}
              disabled={disabled}
              verdict={verdictOf.get(a.mediaId ?? 0)}
              autoRename={renameMedia > 0 && (a.mediaId ?? 0) === renameMedia}
              onRenameTaken={() => setRenameMedia(0)}
            />
          ))}
        </Tiles>
      )}

      {/* ═══ PAID FOR, NOT KEPT ════════════════════════════════════════════════════════════════
          Not a second list of patterns but UNFINISHED BUSINESS: these pictures are paid for, and
          until the door is pressed no render sees them. Absent when there are none. */}
      {unkept.length > 0 && (
        <>
          <GroupLabel className={GROUP_GAP} action={<Counter n={unkept.length} noun='tile' />}>
            made earlier, not kept
          </GroupLabel>
          {shelfFull && (
            <LockLine
              reason={`this card already holds its ${ASSETS_PER_CARD_MAX} assets · delete a tile above, or a texture on FABRIC RENDER`}
            >
              <GoToStep kind='render' label='fabric render ›' techCardId={techCardId} />
            </LockLine>
          )}
          <Tiles min={186} data-pattern-unkept=''>
            {unkept.map(({ picture, run }) => {
              const mediaId = picture.media?.id ?? 0;
              const full = pictureFull(picture);
              const alt = `tile of run ${run.id ?? ''}`;
              /* The repeat is INHERITED from the run, never invented: a tile made before the
                 SCALE row went carries a real number that reaches the cloth prompt. A run off
                 this page of the feed cannot answer — and then the door is shut, not zeroed. */
              const known = runIsOnPage(band, run);
              const repeat = known ? repeatOfRun(run) : 0;
              const cost = formatMoney(run.priceActual ?? run.priceEstimate, run.currency);
              return (
                <div key={picture.id} data-unkept-tile={picture.id} className='flex min-w-0 flex-col gap-1'>
                  {full ? (
                    <PictureTile
                      url={full}
                      alt={alt}
                      aspect='1/1'
                      className='w-full'
                      face={<TiledFace url={full} alt={alt} />}
                      gallery={{ src: full, thumbnail: pictureThumb(picture) || full, type: 'image', alt }}
                    >
                      <CornerLabel at='bl' gap>
                        not kept
                      </CornerLabel>
                      <CornerLabel at='br'>pattern</CornerLabel>
                    </PictureTile>
                  ) : (
                    <Placeholder aspect='square' className='w-full' label='no image' />
                  )}
                  <Text
                    size='micro'
                    variant='uppercase'
                    tracking='label'
                    component='span'
                    className='min-w-0 truncate font-bold'
                  >
                    {(run.id ?? 0) > 0 ? `run ${run.id}` : 'no run'}
                  </Text>
                  <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                    {`${cost || 'not priced'} · not on the shelf`}
                  </Text>
                  <div className='flex flex-wrap items-center gap-1'>
                    {writesOff ? (
                      <InertDoor
                        label='keep it'
                        reason={
                          disabled
                            ? 'this card is read-only for you — the library is card data'
                            : 'this server does not answer the design routes'
                        }
                      />
                    ) : shelfFull ? (
                      /* Dimmed under the bar above, which already names the reason. */
                      <Button variant='secondary' size='xs' disabled data-keep-tile={picture.id}>
                        keep it
                      </Button>
                    ) : !known ? (
                      <InertDoor
                        label='keep it'
                        reason='the run that made this tile is off this page of the feed, so its repeat cannot be read — press «show all» in GENERATION HISTORY to bring that run back, then keep it from here'
                      />
                    ) : (
                      <Button
                        variant='secondary'
                        size='xs'
                        data-keep-tile={picture.id}
                        disabled={
                          upsertAsset.isPending || setPictureSelected.isPending || mediaId <= 0
                        }
                        onClick={() => {
                          /* ORDER IS LOAD-BEARING (E-15): two verbs, no transaction. The asset
                             FIRST — without it the tile is no cloth of the card, and a lone
                             «selected» mark would be an artifact that is not on the shelf. */
                          setRenameMedia(mediaId);
                          upsertAsset.mutate({
                            assetId: 0,
                            kind: ASSET_PATTERN,
                            name: nextPatternName(band),
                            mediaId,
                            repeatMm: repeat,
                          });
                          const pictureId = picture.id ?? 0;
                          if (pictureId > 0) {
                            setPictureSelected.mutate({ pictureId, selected: true });
                          }
                        }}
                        title='name this tile: it is filed on the card’s texture shelf, listed in ARTIFACTS, and offered in the texture grid of FABRIC RENDER — offered there, not made the texture of anything by itself'
                      >
                        keep it
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Tiles>
        </>
      )}
    </>
  );
}
