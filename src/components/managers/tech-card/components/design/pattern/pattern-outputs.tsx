import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { ASSET_PATTERN, assetLabel } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { SELECT_MARK_NOT_STATED, pictureIsSelected, serverStatesSelected } from '../render';
import { Strip, StripCell } from '../render/strip-cell';
import { useDesignWrites } from '../use-design-band';
import {
  SEAM_WORDS,
  assetOfMedia,
  nextPatternName,
  patternOutputs,
  pictureFull,
  pictureThumb,
  repeatOfRun,
  seamWarningOf,
  shelfIsFull,
} from './model';
import { SPANS, ScaleStrip, TileGrid } from './tile-preview';

/**
 * ═══ ПЛИТКИ ЭТОЙ КАРТОЧКИ — ОДНА В ФОКУСЕ, ОСТАЛЬНЫЕ РЯДОМ ════════════════════════════════════
 *
 * ФОРМА ВЫБРАНА ПОД ВОПРОС, А НЕ ПОД СИММЕТРИЮ С СОСЕДЯМИ. У рендеров и турнтейблов выход — РЯД
 * равноправных кадров, между которыми выбирают («renders of this card»). У плитки выход другой:
 * ОДНА картинка, о которой надо принять решение, и это решение требует БОЛЬШОЙ сцены — на плитке
 * 132 пикселя шириной вопрос «оно тайлится» не имеет ответа вовсе. Поэтому здесь сцена плюс
 * рельс: в фокусе одна плитка со всеми дверями, ряд под ней только переключает фокус.
 *
 * ЧТО РЕШАЕТСЯ НА ЭТОЙ СЦЕНЕ, В ТОМ ПОРЯДКЕ, В КОТОРОМ ЭТО РЕШАЮТ:
 *   1. «оно вообще тайлится» — 3×3 (`TileGrid`);
 *   2. «того ли размера» — линейка (`ScaleStrip`), в раппорте ТОГО прогона, который сделал плитку;
 *   3. «берём» — пометка `selected`, ровно как у фабрик-рендеров (K-15);
 *   4. «пользуемся» — плитка кладётся на полку ткани карточки, и с этого места её видит
 *      FABRIC RENDER (K-13, хвост).
 *
 * ТРЕТЬЕ И ЧЕТВЁРТОЕ — РАЗНЫЕ УТВЕРЖДЕНИЯ, И СКЛЕИВАТЬ ИХ НЕЛЬЗЯ. `selected` — вердикт о картинке:
 * он ничего не запрещает, ничего не открывает и сужает список в ARTIFACTS. Ассет на полке — ФАКТ О
 * СТИЛЕ: он переживает прогон, несёт раппорт и попадает в промпт следующего рендера. Карточка
 * законно держит помеченную плитку, которой нет на полке (её ещё обдумывают), и плитку на полке,
 * которую никто не помечал (её уже используют).
 */

/**
 * Ширина сцены. 132px рельса — не сцена; ниже примерно трёхсот пикселей 3×3 не решает ничего, а
 * выше — правая колонка кончается на середине и под дверями остаётся мёртвое поле (замерено на
 * снимке при 380px). 320 — верх того, что читается как один блок.
 */
const STAGE = 'w-full max-w-[320px] shrink-0';

export function PatternOutputs({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element | null {
  // ХУКИ ВЫШЕ ЛЮБОГО РАННЕГО ВОЗВРАТА, безусловно: хук под ним менял бы их число между отрисовками
  // и сносил дерево целиком (React #310 — эта полоса за это уже платила).
  const speaks = serverSpeaksDesign();
  const { setPictureSelected } = useDesignWrites(techCardId);
  const { upsertAsset } = useAssetWrites(techCardId);
  const outputs = useMemo(() => patternOutputs(band), [band]);
  /** Плитка в фокусе. `null` — «не выбирали», и тогда фокус на новейшей. */
  const [focusId, setFocusId] = useState<number | null>(null);
  const [edges, setEdges] = useState(false);
  const [spanMm, setSpanMm] = useState(SPANS[1].mm);

  const focused = useMemo(() => {
    if (!outputs.length) return null;
    return outputs.find((o) => o.picture.id === focusId) ?? outputs[0];
  }, [outputs, focusId]);

  if (!outputs.length || !focused) return null;

  const picture: common_DesignPicture = focused.picture;
  const run = focused.run;
  const mediaId = picture.media?.id ?? 0;
  const url = pictureFull(picture);
  const repeat = repeatOfRun(run);
  const seam = seamWarningOf(run);
  const chosen = pictureIsSelected(picture);
  // Знает ли ОТВЕТИВШИЙ БИНАРЬ про метку вообще. С `EmitUnpopulated` сервер, у которого поле есть,
  // шлёт его на каждой картинке (как `false`), поэтому одной плиты хватает как правдивой пробы.
  const carries = serverStatesSelected(picture);
  const writesOff = !!disabled || !speaks;
  const onShelf = assetOfMedia(band, mediaId);
  const shelfFull = shelfIsFull(band);
  const marked = outputs.filter((o) => pictureIsSelected(o.picture)).length;

  return (
    <Section
      title='tiles'
      question='— fresh from the runs: judge the join, keep what works'
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {outputs.length} tile{outputs.length === 1 ? '' : 's'}
          {carries ? ` · ${marked} selected` : ''}
        </Text>
      }
    >
      <span data-pattern-act='judge' hidden />
      {!carries && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>this server does not state the mark at all.</b> `DesignPicture.selected` is on this
            contract, and a server that knows it sends it on every picture — this one sent nothing,
            which means a binary older than the field. Nothing is broken; the card simply has no
            record of which tile was chosen, and the door below stays shut until the server catches
            up.
          </Text>
        </CalloutBox>
      )}

      <div className='flex flex-wrap items-start gap-4'>
        {/* ─────────────────────────── СЦЕНА: 3×3 ─────────────────────────── */}
        <div className={STAGE}>
          <GroupLabel
            flush
            action={
              <Chip
                nonForm
                selected={edges}
                pressed={edges}
                data-probe='tile-edges'
                onClick={() => setEdges((v) => !v)}
                title={
                  edges
                    ? 'take the lines off — a line drawn along a join covers the very pixels the join is judged by'
                    : 'draw hairlines along the joins. They cover what they point at, so they are off by default; the ticks outside the frame already say where to look'
                }
              >
                tile edges
              </Chip>
            }
          >
            three by three
          </GroupLabel>
          <TileGrid url={url} alt={`tile from run ${run.id ?? ''}`} edges={edges} />
          <Text size='nano' variant='label' component='p' className='normal-case'>
            nine copies of one tile — look along the ticks for a line, a shift, or a border.
          </Text>
        </div>

        {/* ─────────────────────────── СЦЕНА: РАЗМЕР И ДВЕРИ ─────────────────────────── */}
        <div data-probe='stage-scale' className='min-w-[280px] flex-1'>
          <GroupLabel
            flush
            action={
              <ChipRow>
                {SPANS.map((s) => (
                  <Chip
                    key={s.mm}
                    nonForm
                    selected={spanMm === s.mm}
                    pressed={spanMm === s.mm}
                    onClick={() => setSpanMm(s.mm)}
                    title={`lay the tile across ${s.label} of cloth — ${s.what}`}
                  >
                    {s.label}
                  </Chip>
                ))}
              </ChipRow>
            }
          >
            at its repeat
          </GroupLabel>
          <ScaleStrip url={url} repeatMm={repeat} spanMm={spanMm} />
          <Text size='nano' variant='label' component='p' className='normal-case'>
            {repeat > 0 ? (
              <>
                made at <b>{repeat} mm</b> — {(spanMm / repeat).toFixed(1)} tiles across {spanMm} mm
                of cloth ({SPANS.find((s) => s.mm === spanMm)?.what}). The strip and the rule share
                one scale, so the count is true; neither is life-size on your screen.
              </>
            ) : (
              <>
                this run stated no repeat, so there is no scale to draw. The tile is still a tile.
              </>
            )}
          </Text>

          {/* ⚠ ПРЕДУПРЕЖДЕНИЕ О ШВЕ — РЯДОМ С 3×3, А НЕ В ИСТОРИИ. Строка истории говорит `done`,
              потому что прогон и правда завершился и был оплачен; шов померен ОТДЕЛЬНО и стоит на
              попытке. Читатель, который смотрит только на прогон, о нём не узнает вовсе. */}
          {seam && (
            /* ⚠ АТРИБУТ СТОИТ НА `Text`, А НЕ НА `CalloutBox`: примитив коробки принимает ровно
               три пропа и ЛИШНИЕ МОЛЧА ВЫБРАСЫВАЕТ — то есть `data-*` на нём не доезжает до DOM
               вовсе. Замерено: проба, приколоченная к коробке, не находила предупреждение,
               которое человек на экране видит. */
            <CalloutBox tone='warning' className='mt-2'>
              <Text size='micro' component='p' data-probe='seam-warning' className='normal-case'>
                <b>this tile does not join cleanly.</b> {SEAM_WORDS}
              </Text>
            </CalloutBox>
          )}

          <div className='mt-2 flex flex-wrap items-center gap-2 border-t border-hairline pt-2'>
            {/* ─── ПОМЕТКА, ТЕМ ЖЕ ЖЕСТОМ, ЧТО У ФАБРИК-РЕНДЕРОВ (K-15) ─── */}
            {!carries ? (
              <InertDoor label='select' reason={SELECT_MARK_NOT_STATED} />
            ) : writesOff ? (
              <InertDoor
                label={chosen ? 'un-select' : 'select'}
                reason={
                  disabled
                    ? 'this card is read-only for you — the mark is an edit of the card'
                    : 'this server does not answer the design routes'
                }
              />
            ) : (
              /* ═══ ПОМЕТКА ДЕМОТИРОВАНА ДО ЧИПА, И ЭТО НЕ КОСМЕТИКА (G-15) ══════════════════
                 Здесь стояли ДВА органа на один факт — кнопка `select` и Pill `selected` рядом с
                 ней, — плюс абзац, объяснявший, чем `selected` отличается от «на полке». Владелец
                 просил снять ровно эту сложность. Чип-тоггл говорит СОСТОЯНИЕ И ЖЕСТ одним телом
                 (заливка ink = помечено), а разница двух пометок ушла в его `title` — читается
                 тем, кто спросил, и не занимает экран у тех, кто не спрашивал.
                 ⚠ САМУ ПОМЕТКУ СНЯТЬ НЕЛЬЗЯ: у неё живой потребитель — ARTIFACTS (W-14) сужает
                 сегмент PATTERNS ровно по ней. Снести орган, оставив фильтр, значило бы оставить
                 переключатель, который никто не может взвести. */
              <Chip
                nonForm
                selected={chosen}
                pressed={chosen}
                data-tile-selected={chosen ? '1' : '0'}
                disabled={setPictureSelected.isPending}
                onClick={() =>
                  setPictureSelected.mutate({ pictureId: picture.id ?? 0, selected: !chosen })
                }
                title={
                  chosen
                    ? 'chosen — ARTIFACTS narrows its PATTERNS list to the chosen tiles. Press again to take the mark off. It is a verdict about the PICTURE; keeping a tile in the library is a fact about the STYLE, and a tile can carry either, both or neither'
                    : 'mark this tile as chosen — ARTIFACTS narrows its PATTERNS list to the chosen ones. It is a verdict about the PICTURE and it neither keeps nor uses the tile anywhere'
                }
              >
                selected
              </Chip>
            )}

            {/* ─── ПОЛКА ТКАНИ: ОТСЮДА ПЛИТКУ ВИДИТ FABRIC RENDER (K-13, хвост) ─── */}
            {onShelf ? (
              <Pill tone='ok' title={`kept in this card's library as ${assetLabel(onShelf)} — rename it and give it to a colourway below`}>
                in the library · {assetLabel(onShelf)}
              </Pill>
            ) : writesOff ? (
              <InertDoor
                label='keep in library'
                reason={
                  disabled
                    ? 'this card is read-only for you — the library is card data'
                    : 'this server does not answer the design routes'
                }
              />
            ) : shelfFull ? (
              <InertDoor
                label='keep in library'
                reason='this card already holds its 40 assets — delete one in PATTERNS OF THIS CARD below, or under FABRIC RENDER → INPUT → CLOTH, before keeping another'
              />
            ) : (
              <Button
                variant='main'
                size='sm'
                disabled={upsertAsset.isPending || mediaId <= 0}
                onClick={() =>
                  upsertAsset.mutate({
                    assetId: 0,
                    kind: ASSET_PATTERN,
                    name: nextPatternName(band),
                    mediaId,
                    // РАППОРТ НАСЛЕДУЕТСЯ ОТ ПРОГОНА, а не набирается заново: контракт
                    // `DesignPatternParams` требует, чтобы «сгенерировано при 120 мм» и «положено
                    // при 120 мм» остались одним утверждением об одной ткани.
                    repeatMm: repeat,
                  })
                }
                title='keep this tile as a fabric of the card — below it can be renamed and given to a colourway, and every render of that colourway then starts from it'
              >
                KEEP IN LIBRARY
              </Button>
            )}
          </div>

          <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
            run {run.id ?? '—'}
            {repeat > 0 ? ` · ${repeat} mm` : ' · no repeat stated'} ·{' '}
            {(picture.sourceClass ?? '').trim() || 'ai'}
            {onShelf ? (
              <>
                {' '}
                · kept as <b>{assetLabel(onShelf)}</b>
              </>
            ) : (
              ' · a kept tile becomes a fabric of this card; a tile left here reaches no render'
            )}
          </Text>
        </div>
      </div>

      {/* ─────────────────────────── РЕЛЬС ─────────────────────────── */}
      {outputs.length > 1 && (
        <>
          <GroupLabel>every tile on this page of the feed</GroupLabel>
          <Strip>
            {outputs.map(({ picture: p, run: r }) => {
              const on = p.id === picture.id;
              const rep = repeatOfRun(r);
              return (
                <StripCell
                  key={p.id}
                  emphasis={on}
                  src={pictureThumb(p)}
                  alt={`tile from run ${r.id ?? ''}`}
                  gallery={
                    p.media && mediaFullViewerSrc(p.media)
                      ? mediaFullToViewerItem(p.media)
                      : undefined
                  }
                  badge={pictureIsSelected(p) ? 'selected' : undefined}
                  lines={[
                    `run ${r.id ?? '—'}${rep ? ` · ${rep} mm` : ''}`,
                    seamWarningOf(r) ? 'join measured as visible' : '',
                  ]}
                  action={
                    on ? (
                      <Pill tone='ink'>on the stage</Pill>
                    ) : (
                      <Button
                        variant='secondary'
                        size='xs'
                        data-focus-tile={p.id}
                        onClick={() => setFocusId(p.id ?? null)}
                      >
                        show
                      </Button>
                    )
                  }
                />
              );
            })}
          </Strip>
        </>
      )}

      <Text size='nano' variant='label' component='p' className='normal-case'>
        this page of the feed, newest run first — not every tile this card has ever produced.
      </Text>
    </Section>
  );
}
