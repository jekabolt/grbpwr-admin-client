import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { Fragment, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import type { Representation } from '../bench-kinds';
import { pictureHandle } from '../handles';
import { renderHostOf, useRenderHost } from '../render/render-tile';
import { CropDeck } from './crop-deck';
import { outputPlan, type OutputPlan } from './run-gallery';
import { GapPill } from './run-panel';
import {
  expectedTileCount,
  isRunLive,
  isTextRun,
  runOutcomeNote,
  runOutputText,
  runStatus,
} from './run-state';
import { RunTile } from './run-tile';
import { thumbUrl } from './thumb';

/**
 * ═══ WHAT A RUN BROUGHT BACK — ONE BLOCK, TWO HOSTS (26.09, O-53) ═══════════════════════════════
 *
 * This is the outputs block of a history row (`RunRow` in `generation-history.tsx`), moved here
 * whole so the latest-generation workbench under GENERATE (`latest-generation.tsx`) draws the SAME
 * thing: the live dashed tiles, the grid of `RunTile`s, the open deck's pieces right after their
 * sheet, and «nothing came back». Owner, verbatim: «там мы уже можем непосредственно делать все
 * тоже самое что и в GENERATION HISTORY». Two copies of this block would be two places where a
 * split, a deck or a slot mark behaves differently the first time one of them is touched.
 *
 * WHAT STAYS WITH THE HOST: the deck that is open (`openDeck` — one per host, H-10), the viewer
 * group the tiles zoom through (`galleryKey`/`galleryIndexOf`), the split modal (`onSplit`) and the
 * elapsed clock (`elapsed` — the host already runs one for its state word, and a second timer per
 * row would tick the same text twice a second).
 */

/** The tile track of the outputs grid — the mock-up's `.fgrid` (`minmax(148px, 1fr)`). */
const TRACK = 148;

/**
 * THE WORKBENCH'S TRACK IS THE BLOCK IT STANDS IN. It sits at the bottom of INPUT — REFERENCES,
 * whose reference grid runs on `minmax(190px, 1fr)` (`references-section.tsx`); a second grid of
 * a different width in the same block would put two columns of different size one above the other.
 */
const WORKBENCH_TRACK = 190;

/**
 * DOES THIS RUN DRAW ANYTHING UNDER IT AT ALL — the same chain `RunOutputs` walks, as a yes/no.
 * The history row reads it for ONE thing: the gap between the outputs and its meta line exists
 * only when there are outputs (`mt-2.5`), and a component cannot tell its parent it rendered null.
 */
export function runOutputsShown(run: common_DesignRun): boolean {
  if (isTextRun(run)) return true;
  if (isRunLive(run)) return expectedTileCount(run) > 0;
  if ((run.pictures ?? []).length > 0) return true;
  const status = runOutcomeNote(run);
  return !(status.startsWith('failed') || status.startsWith('cancelled'));
}

export function RunOutputs({
  band,
  techCardId,
  run,
  rep,
  cardFit,
  elapsed,
  dim,
  disabled,
  galleryKey,
  galleryIndexOf,
  openDeck,
  onDeck,
  onZoomPicture,
  onSplit,
  workbench,
  plan: planProp,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  run: common_DesignRun;
  /** The kind of the RUN, said once per row — every tile of it inherits it (E-12). */
  rep: Representation | null;
  cardFit: string;
  /** `0:14` since the run started — the host's clock (see the file's head). */
  elapsed: string;
  /** Приглушить кадры: строка стоит на полке архива и на неё смотрят, а не работают ею (J-22). */
  dim?: boolean;
  disabled?: boolean;
  galleryKey: string;
  /** picture id → its offset in the host's gallery group. Absent = no showable address. */
  galleryIndexOf: Map<number, number>;
  /** THE HOST'S ONE OPEN DECK, or `null` (H-10). */
  openDeck: number | null;
  onDeck: (rootId: number) => void;
  onZoomPicture?: (pictureId: number) => void;
  onSplit: (picture: common_DesignPicture) => void;
  /**
   * THE HOST IS THE WORKBENCH UNDER GENERATE, not a history row. It changes two things: the grid
   * runs on the block's 190px track instead of the history's 148px, and each tile's editor asks
   * «overwrite or save as new» (`RunTile` → `VectorModal.replace`, O-53 phase 2). The doors and the
   * deck are otherwise the history's own.
   */
  workbench?: boolean;
  /**
   * HOW THE ROW IS DRAWN — its cards and their decks (`outputPlan`). The workbench hands in its
   * own, drawn by the heads of replacement chains and reused for its viewer row and deck memory;
   * absent, the history's plan of every picture the run produced.
   */
  plan?: OutputPlan;
}) {
  /**
   * Развёрнут ли ОТВЕТ текстового прогона (D-2). Отдельно от `meta ▸` строки: та дверь показывает,
   * что прогону ДАЛИ, эта — что он ВЕРНУЛ. Свой `useState`, а не `<details>`: свёрнутый `<details>`
   * меряется как видимый, и проба «текста на экране нет» зеленела бы на закрытом экране.
   */
  const [textOpen, setTextOpen] = useState(false);

  const runId = run.id ?? 0;
  const live = isRunLive(run);
  /** EVERY PICTURE THE RUN PRODUCED, UNFILTERED (T-14): a stamped picture is marked, never dropped. */
  const pictures = run.pictures ?? [];
  /** The cards of this row and the pieces behind each (H-10) — see `outputPlan`. */
  const plan = useMemo(() => planProp ?? outputPlan(pictures), [planProp, pictures]);
  /**
   * O-63 (D-62): ON FABRIC RENDER A RENDER RUN'S TILES CARRY THE RENDER DOORS (`RunTile` → the render
   * tile), and `expand ▸` / `fold ▾` is one of them — so a deck of such a tile draws no door of its
   * own (`hostDoor`), exactly as RENDERS OF THIS CARD drew it. Anywhere else: `null`, no change.
   */
  const renderHost = useRenderHost(rep);
  const status = runOutcomeNote(run);
  /** ПРОГОН, КОТОРЫЙ ОТВЕЧАЕТ СЛОВАМИ (D-2): черновик идеи возвращает текст, не картинки. */
  const textRun = isTextRun(run);
  const outputText = runOutputText(run);
  const expected = expectedTileCount(run);
  const track = workbench ? WORKBENCH_TRACK : TRACK;

  /* ═══ WHAT CAME BACK — the mock-up's `histOutputs` ═══════════════════════════════════════════
     A run in flight: dashed cells, `running 0:12` in the first while it runs, `reserved` in the
     rest — the same grammar as an intake slot, NOT a button (nothing to press). A text run: its
     draft, folded. Pictures: one grid, the open deck's pieces as ordinary cards right after their
     sheet (H-10). Nothing at all: the dashed pill `nothing came back`. A failed or cancelled row
     with nothing under it says nothing more: its pill already states the outcome (S-10). */
  if (!runOutputsShown(run)) return null;

  if (textRun) {
    return (
      <div data-run-text={runId}>
        {live ? (
          <Text size='micro' variant='label' component='p'>
            writing the draft — {elapsed}
          </Text>
        ) : outputText ? (
          <>
            <Button
              variant='secondary'
              size='xs'
              data-run-text-toggle={runId}
              onClick={() => setTextOpen((v) => !v)}
              aria-expanded={textOpen}
            >
              {textOpen ? 'hide the draft ▾' : 'read the draft ▸'} · {outputText.length} characters
            </Button>
            {textOpen && (
              /* ПРОЗА МЕРИТСЯ СТРОКОЙ, А НЕ БЛОКОМ: `max-w-[75ch]` + `break-words` держат любой
                 ответ модели внутри колонки; страницу вбок этот орган не двигает (D-4). */
              <Text
                size='micro'
                component='p'
                className='mt-1 max-w-[75ch] whitespace-pre-wrap break-words bg-bgZebra px-2 py-1.5'
              >
                {outputText}
              </Text>
            )}
          </>
        ) : (
          status === 'done' && (
            <GapPill title='the run finished and stored no text'>finished with no text</GapPill>
          )
        )}
      </div>
    );
  }

  if (live) {
    // `runOutputsShown` has already said `expected > 0` for a live run.
    return (
      <Tiles min={track}>
        {Array.from({ length: expected }, (_, i) => (
          <Tile
            key={i}
            dashed
            media={
              <div
                className='flex w-full items-center justify-center bg-bgSecondary'
                style={{ aspectRatio: '4 / 5' }}
              >
                <Text
                  size='nano'
                  variant='label'
                  component='span'
                  className='uppercase tracking-label'
                >
                  {i === 0 && runStatus(run) === 'running' ? `running ${elapsed}` : 'reserved'}
                </Text>
              </div>
            }
          />
        ))}
      </Tiles>
    );
  }

  if (pictures.length > 0) {
    return (
      /* ОДИН ГРИД, А НЕ ГРИД В ГРИДЕ (H-10): куски открытой колоды встают обычными карточками в тот
         же ряд, сразу за своим листом. Фрагмент не создаёт DOM-узла, поэтому `[&>*]:min-w-0` у
         `Tiles` по-прежнему достаётся самим плиткам. */
      <Tiles min={track}>
        {plan.cards.map(({ picture, members }) => {
          const pictureId = picture.id ?? 0;
          // Кусок рисуется ТОЛЬКО под своим листом: план уже разложил их по колодам.
          const deckOpen = openDeck === pictureId;
          const tile = (
            <RunTile
              band={band}
              techCardId={techCardId}
              picture={picture}
              siblings={pictures}
              workbench={workbench}
              rep={rep}
              cardFit={cardFit}
              runFit={(run.fitAtLaunch ?? '').trim()}
              dim={dim}
              disabled={disabled}
              galleryKey={galleryKey}
              galleryIndex={galleryIndexOf.get(pictureId)}
              /* ПЕРВЫЙ КЛИК АНКОЛАПСИТ, ВТОРОЙ ОТКРЫВАЕТ ЗУМ (J-2): роль только у листа СВЁРНУТОЙ
                 колоды; у раскрытой лист — обычная карточка ряда. */
              onOpen={members.length && !deckOpen ? () => onDeck(pictureId) : undefined}
              onZoom={onZoomPicture}
              onSplit={onSplit}
            />
          );
          if (!members.length) return <Fragment key={pictureId}>{tile}</Fragment>;
          return (
            <Fragment key={pictureId}>
              <CropDeck
                rootId={pictureId}
                count={members.length}
                peeks={members.map((member) => ({
                  id: member.id ?? 0,
                  url: thumbUrl(member.media),
                  alt: pictureHandle(member),
                }))}
                /* ШИРИНА ОДНОЙ ДОРОЖКИ через собственную коробку колоды: свёрнутая занимает ДВЕ
                   дорожки (`span 2`) с 8px зазора между ними. Кадр — `4/5` `PictureTile`. */
                sheetWidth='calc((100% - 8px) / 2)'
                frameAspect='4/5'
                style={deckOpen ? undefined : { gridColumn: 'span 2' }}
                open={deckOpen}
                onToggle={() => onDeck(pictureId)}
                hostDoor={!!renderHostOf(renderHost, picture)}
              >
                {tile}
              </CropDeck>
              {deckOpen &&
                members.map((member) => (
                  <RunTile
                    key={member.id}
                    band={band}
                    techCardId={techCardId}
                    picture={member}
                    siblings={pictures}
                    workbench={workbench}
                    rep={rep}
                    cardFit={cardFit}
                    runFit={(run.fitAtLaunch ?? '').trim()}
                    dim={dim}
                    disabled={disabled}
                    galleryKey={galleryKey}
                    galleryIndex={galleryIndexOf.get(member.id ?? 0)}
                    deckMemberOf={pictureId}
                    onZoom={onZoomPicture}
                    onSplit={onSplit}
                  />
                ))}
            </Fragment>
          );
        })}
      </Tiles>
    );
  }

  return <GapPill title='the run finished and returned no picture'>nothing came back</GapPill>;
}
