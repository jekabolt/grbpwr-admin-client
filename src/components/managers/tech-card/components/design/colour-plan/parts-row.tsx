import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX } from 'react';
import { Chip } from 'ui/components/chip';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import { assetById, assetLabel, assetThumb } from '../assets/model';
import { ColourPicker } from '../assets/colour-picker';
import { VectorModal } from '../modals/vector-modal';
import { PictureTile } from '../picture-tile';
import { benchSides } from '../render/model';
import { FieldRow, Hint, Swatch } from '../render/field-row';
import { viewLabel } from '../views';
import {
  COLOUR_WORDS_MAX,
  type ColourPlanDoc,
  type PlanCloth,
  type PlanColour,
  type PlanMap,
  type PlanSwatch,
  mapBadge,
  mapState,
  planColours,
  planHex,
  sendableMaps,
} from './model';
import type { ColourPlanWrites } from './use-colour-plan';

/**
 * ═══ THE PARTS ROW — «какие цвета ты использовал, и какая текстура какого цвета» ═══════════════
 *
 * Владелец, дословно: «потом когда ты порисовали закрасил что каким цветом то у тебя дальше в меню
 * показывает какие цвета ты использовал и там можно выбрать какие текстуры какого цвета».
 *
 * ДВА ЯРУСА, И ОБА ЧИТАЮТ ОДНО. Сверху — виды карточки плитками: у покрашенного стоит ярлык
 * «N colours», у устаревшего — `stale`, дверь у каждого одна и называется `paint`. Снизу — по
 * СТРОКЕ НА ПОКРАШЕННЫЙ ЦВЕТ: образец, hex, доля, назначенная ткань, свой цвет и слова.
 *
 * ⚠ ВТОРОГО ПИКЕРА ТКАНИ ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО. Строка ВЗВОДИТ существующую сетку текстур
 * («select ▸»), и следующий тычок в плитку сетки назначает ткань этой строке. Собственная сетка на
 * каждой строке была бы ложным расщеплением: две решётки, выбирающие одно и то же из одной полки,
 * различающиеся лишь тем, у кого сосед не задан, — и у второй не было бы ни двери `+ texture`, ни
 * `make a pattern`, ни потолка активов, ни удаления с карточки.
 */

function DroppedNote(hexes: string[]): string {
  if (hexes.length === 1) return `${hexes[0]} is no longer on the map — its cloth was dropped`;
  return `${hexes.length} colours are no longer on the map — their cloths were dropped`;
}

export function PartsRow({
  band,
  techCardId,
  plan,
  writes,
  armed,
  onArm,
  painting,
  onPaint,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  /** Документ плана. `undefined` — сервер про него не говорит; ряда нет вовсе (см. `Palette`). */
  plan: ColourPlanDoc;
  writes: ColourPlanWrites;
  /**
   * ВЗВЕДЁННЫЙ ЦВЕТ — состояние ЭКРАНА, а не плана: он живёт ровно между «выбрал строку» и «ткнул
   * в плитку». Хранится у `Palette`, потому что читают его двое — эта ведомость и сетка текстур, —
   * и второе хранилище развело бы подсветку строки с поведением сетки.
   */
  armed: string;
  onArm: (hex: string) => void;
  /**
   * ВИД, КОТОРЫЙ СЕЙЧАС КРАСЯТ, — И ХРАНИТ ЕГО РОДИТЕЛЬ. Дверей у покраски ДВЕ: плитка вида здесь
   * и одна кнопка `paint the parts ▸` в заголовке группы, а живут они в разных компонентах. Одна
   * переменная на две двери — единственный способ не получить два открытых редактора.
   */
  painting: string;
  onPaint: (view: string) => void;
  disabled?: boolean;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();

  const sides = useMemo(() => benchSides(band).filter((s) => !!s.picture), [band]);
  const mapOf = useMemo(() => {
    const m = new Map<string, PlanMap>();
    for (const one of plan.maps) m.set(one.view, one);
    return m;
  }, [plan.maps]);
  const colours = useMemo(() => planColours(band, plan), [band, plan]);
  const assets = useMemo(() => assetById(band), [band]);

  const side = sides.find((s) => s.view === painting) ?? null;
  const paintingMap = painting ? mapOf.get(painting) : undefined;

  /**
   * ЗАПИСЬ ПЛАНА — ОДНА ДВЕРЬ НА ОБА ЖЕСТА (покрасил / назначил). Она же ЧИСТИТ НАЗНАЧЕНИЯ,
   * осиротевшие перекраской: цвет, которого больше нет ни на одной палитре, — это утверждение о
   * ничём, и сервер такую строку не примет («a cloth whose hex appears on no map»). Что именно
   * выброшено, говорится вслух: молча исчезнувшая ткань читается как «я назначал, а оно не
   * сохранилось».
   */
  const commit = async (maps: PlanMap[], cloths: PlanCloth[]): Promise<boolean> => {
    const alive = new Set<string>();
    for (const m of maps) for (const s of m.palette) alive.add(s.hex);
    const kept = cloths.filter((c) => alive.has(c.hex));
    const dropped = cloths.filter((c) => !alive.has(c.hex)).map((c) => c.hex);
    const saved = await writes.save({ maps, cloths: kept });
    if (saved && dropped.length > 0) showMessage(DroppedNote(dropped), 'success');
    return !!saved;
  };

  /** Карта этого вида заменена целиком. Прежняя уходит вместе со своим media id — новая покраска. */
  const acceptMap = async (
    view: string,
    baseMediaId: number,
    map: { mediaId: number; url: string; palette: PlanSwatch[] },
  ): Promise<boolean> => {
    writes.rememberMapUrl(map.mediaId, map.url);
    const next: PlanMap[] = [
      ...plan.maps.filter((m) => m.view !== view),
      {
        mediaId: map.mediaId,
        view,
        baseMediaId,
        palette: map.palette,
        /* ТОЛЬКО ЧТО ЗАГРУЖЕННАЯ ПОКРАСКА — единственный случай, когда адрес и наличие знает
           клиент, а не провод: файл ушёл секунду назад, ответ несёт его адрес, и лента ещё не
           перечиталась. Заполняем оба поля здесь, чтобы плитка не мигала флэтом до следующего
           чтения; после него те же два значения приедут с сервера и совпадут. */
        url: map.url,
        gone: false,
      },
    ];
    /* ⚠ ОТВЕТ ВОЗВРАЩАЕТСЯ РЕДАКТОРУ, А НЕ ГЛОТАЕТСЯ. Отказ CAS — это чужая покраска, сохранённая
       минуту назад; закрыв на нём модалку, мы выбросили бы работу, которая ещё на экране. */
    return commit(next, plan.cloths);
  };

  const dropMap = async (view: string) => {
    await commit(
      plan.maps.filter((m) => m.view !== view),
      plan.cloths,
    );
  };

  /** Правка одной строки назначения. Отсутствующая строка заводится, опустевшая — уходит. */
  const setCloth = async (hex: string, patch: Partial<PlanCloth>) => {
    const key = planHex(hex);
    const prev = plan.cloths.find((c) => c.hex === key) ?? {
      hex: key,
      assetId: 0,
      colourHex: '',
      words: '',
      parts: '',
    };
    const next: PlanCloth = { ...prev, ...patch, hex: key };
    const rest = plan.cloths.filter((c) => c.hex !== key);
    const stated = next.assetId > 0 || next.colourHex !== '' || next.words !== '';
    /* ⚠ СТРОКА, НИЧЕГО НЕ ГОВОРЯЩАЯ, НЕ ХРАНИТСЯ. Контракт требует хотя бы одного из трёх
       (`asset_id` / `colour_hex` / `words`), и `parts` в эту тройку НЕ входит: назвать деталь
       словом «cuffs», не сказав, из чего она, — это метка, указывающая в тишину. */
    await commit(plan.maps, stated ? [...rest, next] : rest);
  };

  return (
    <>
      <FieldRow label='parts' data-colour-parts className='items-start'>
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          {/* ── ЯРУС ПЕРВЫЙ: ВИДЫ. Плитка = вид, дверь = `paint`, ярлык = состояние карты. */}
          <Tiles min={104}>
            {sides.map((s) => {
              const map = mapOf.get(s.view);
              const state = map ? mapState(band, map) : undefined;
              const stored = map ? writes.mapUrl(map.mediaId) : '';
              const flat =
                s.picture?.media?.media?.thumbnail?.mediaUrl ||
                s.picture?.media?.media?.compressed?.mediaUrl ||
                '';
              return (
                <div key={s.view} className='flex min-w-0 flex-col gap-1' data-colour-side={s.view}>
                  <PictureTile
                    /* ПОРЯДОК ТРЁХ АДРЕСОВ — ЭТО ТРИ РАЗНЫХ ЗНАНИЯ, А НЕ ТРИ ПОПЫТКИ.
                       `map.url` — то, что сказал ПРОВОД: лента отдаёт карту вместе с её
                       `MediaFull`, поэтому покраска переживает перезагрузку и открывается на
                       доводку. (Эта строка и закрыла дыру, которая здесь была названа вслух:
                       раньше `DesignColourMap` нёс один `media_id`, читать медиа по номеру
                       контракт не умел, и после F5 на плитке стоял флэт.)
                       `stored` — сессионный кэш: он нужен ровно на один промежуток, между
                       загрузкой файла и следующим чтением ленты, когда провод ещё не знает.
                       `flat` — «карты нет вовсе», и это законное состояние, а не отказ.
                       ⚠ У карты в состоянии `lost` `url` пуст ПО ПРАВУ: сервер сказал, что строка
                       медиа снесена. Тогда стоит флэт, а бэйдж называет потерю — подставлять сюда
                       что-либо ещё значило бы рисовать покраску, которой нет. */
                    url={map?.url || stored || flat}
                    alt={`${viewLabel(s.view)} flat`}
                    aspect='4/5'
                    badge={map ? mapBadge(band, map) : undefined}
                    selected={!!map && state === 'ok'}
                    className='w-full bg-bgColor'
                    onEdit={
                      disabled
                        ? undefined
                        : {
                            onClick: () => onPaint(s.view),
                            ariaLabel: `paint the ${viewLabel(s.view)} colour map`,
                            title: map
                              ? 'open this colour map again — the palette comes back with it'
                              : 'flood this drawing part by part in flat colours',
                          }
                    }
                    editLabel='paint'
                    onRemove={
                      disabled || !map
                        ? undefined
                        : {
                            onClick: () => void dropMap(s.view),
                            ariaLabel: `drop the ${viewLabel(s.view)} colour map`,
                            title:
                              'drop this colour map — the colours only it carried leave the menu with it',
                          }
                    }
                  />
                  <div className='flex min-w-0 flex-wrap items-center gap-1'>
                    <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                      {viewLabel(s.view)}
                    </Text>
                    {state === 'stale' && <Pill tone='warn'>stale</Pill>}
                  </div>
                  {/* ОБРАЗЦЫ ПОД ПЛИТКОЙ — ЕДИНСТВЕННОЕ, ЧЕМ ПОКРАШЕННОЕ ВИДНО ПОСЛЕ
                      ПЕРЕЗАГРУЗКИ. Не украшение: без них карта, чьи байты некому показать, ничем
                      не отличалась бы от непокрашенного вида. */}
                  {map && map.palette.length > 0 && (
                    <div className='flex min-w-0 flex-wrap gap-0.5'>
                      {map.palette.map((sw) => (
                        <Swatch key={sw.hex} hex={sw.hex} size={10} title={sw.hex} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Tiles>

          {/* ── ЯРУС ВТОРОЙ: ЦВЕТА. Ряд на цвет — и ни одной строки, когда красить ещё не начали:
              пустая ведомость под пустыми плитками была бы двумя способами сказать «ничего нет». */}
          {colours.length > 0 && (
            <div className='flex flex-col' data-colour-rows={colours.length}>
              {colours.map((c) => (
                <ColourRow
                  key={c.hex}
                  colour={c}
                  name={c.cloth && c.cloth.assetId > 0 ? assetLabel(assets.get(c.cloth.assetId)) : ''}
                  thumb={
                    c.cloth && c.cloth.assetId > 0 ? assetThumb(assets.get(c.cloth.assetId)) : ''
                  }
                  armed={armed === c.hex}
                  disabled={disabled}
                  onArm={() => onArm(armed === c.hex ? '' : c.hex)}
                  onColour={(hex) => void setCloth(c.hex, { colourHex: planHex(hex) })}
                  onWords={(words) => void setCloth(c.hex, { words })}
                  onDropCloth={() => void setCloth(c.hex, { assetId: 0 })}
                />
              ))}
            </div>
          )}

          {sendableMaps(band, plan).length === 0 && plan.maps.length > 0 && (
            <Hint>
              no colour map travels with this run — repaint the stale views or drop them
            </Hint>
          )}
        </div>
      </FieldRow>

      {/* ═══ РЕДАКТОР В РЕЖИМЕ КАРТЫ. Тот же самый, суженный пропом — довод целиком в его шапке. */}
      {side && (
        <VectorModal
          open
          onOpenChange={(open) => !open && onPaint('')}
          techCardId={techCardId}
          band={band}
          base={side.picture}
          mode='colour'
          colourLabel={viewLabel(side.view)}
          mapSrc={paintingMap ? writes.mapUrl(paintingMap.mediaId) : ''}
          /* ПАЛИТРА ПРОШЛОГО ЗАХОДА ЗАСЕВАЕТ КАНДИДАТОВ. Иначе доработка карты потеряла бы каждый
             цвет, которого сегодня не касались: скан считает только записанные чернила. */
          seedInks={paintingMap?.palette.map((s) => s.hex)}
          onColourMap={(map) =>
            acceptMap(side.view, side.picture?.media?.id ?? 0, {
              mediaId: map.mediaId,
              url: map.url,
              palette: map.palette,
            })
          }
        />
      )}
    </>
  );
}

/**
 * ОДНА СТРОКА ВЕДОМОСТИ. Четыре носителя на одну строку — образец, hex, доля и то, чем деталь
 * сделана, — и ни один из них не несёт состояния ОДНИМ ЦВЕТОМ: назначенная ткань названа именем,
 * ненавешенная — пилюлей `unassigned`, случайный мазок — пилюлей `stray` с числом пикселей.
 */
function ColourRow({
  colour,
  name,
  thumb,
  armed,
  disabled,
  onArm,
  onColour,
  onWords,
  onDropCloth,
}: {
  colour: PlanColour;
  name: string;
  thumb: string;
  armed: boolean;
  disabled?: boolean;
  onArm: () => void;
  onColour: (hex: string) => void;
  onWords: (words: string) => void;
  onDropCloth: () => void;
}): JSX.Element {
  const cloth = colour.cloth;
  return (
    <div
      data-colour-row={colour.hex}
      data-colour-stated={colour.stated ? 'yes' : 'no'}
      className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'
    >
      <Swatch hex={colour.hex} size={22} title={colour.hex} />
      <Text size='micro' component='span' className='w-[68px] shrink-0 uppercase tabular-nums'>
        {colour.hex}
      </Text>
      <Text
        size='nano'
        variant='label'
        component='span'
        className='w-[44px] shrink-0 tabular-nums'
        title={`${colour.px} px of the painted area, on ${colour.views.map(viewLabel).join(', ')}`}
      >
        {colour.stray ? `${colour.px} px` : `${Math.round(colour.share * 100)}%`}
      </Text>

      {colour.stray ? (
        /* СЛУЧАЙНЫЙ МАЗОК НАЗЫВАЕТСЯ И НЕ ТРЕБУЕТ НИЧЕГО. Выбросить его молча значило бы ответить
           «я красил, а его нет»; требовать за него ткань — держать дверь закрытой ради пятна. */
        <Pill tone='mut'>stray · not sent</Pill>
      ) : (
        <>
          {/* ТКАНЬ — ВЗВЕДЕНИЕМ СЕТКИ, А НЕ ВТОРОЙ СЕТКОЙ. Довод в шапке файла. */}
          {cloth && cloth.assetId > 0 ? (
            <span className='flex min-w-0 items-center gap-1'>
              <PictureTile
                url={thumb}
                alt={name}
                aspect='1/1'
                fit='cover'
                className='w-[40px] shrink-0'
              />
              <Text size='micro' component='span' className='min-w-0 max-w-[140px] truncate'>
                {name || 'a cloth'}
              </Text>
              {!disabled && (
                <Chip
                  nonForm
                  dashed
                  onClick={onDropCloth}
                  title={`take ${name || 'this cloth'} off ${colour.hex}`}
                >
                  ✕
                </Chip>
              )}
            </span>
          ) : (
            <Pill tone={colour.stated ? 'mut' : 'warn'}>
              {colour.stated ? 'no texture' : 'unassigned'}
            </Pill>
          )}

          <Chip
            nonForm
            selected={armed}
            pressed={armed}
            disabled={disabled}
            data-colour-arm={colour.hex}
            onClick={onArm}
            title={
              armed
                ? 'press a tile in the grid above to give this colour that texture — press here again to stop'
                : `choose the texture of ${colour.hex} from the grid above`
            }
          >
            {armed ? 'pick a tile above…' : 'select ▸'}
          </Chip>

          {/* СВОЙ ЦВЕТ ЭТОЙ ДЕТАЛИ — тот же пикер, что у прогона, и второго здесь не заводится. */}
          <ColourPicker
            hex={cloth?.colourHex ?? ''}
            disabled={disabled}
            label={`the colour of the parts painted ${colour.hex}`}
            onPick={onColour}
            face={
              <span
                aria-hidden='true'
                data-colour-plain={cloth?.colourHex ?? ''}
                className='block h-[22px] w-[22px] border border-textColor'
                style={{ background: (cloth?.colourHex || 'transparent') as string }}
              />
            }
          />

          <div className='min-w-0 max-w-[220px] flex-1'>
            <Input
              name={`colour-words-${colour.hex}`}
              aria-label={`what the parts painted ${colour.hex} are made of, in words`}
              maxLength={COLOUR_WORDS_MAX}
              value={cloth?.words ?? ''}
              disabled={disabled}
              placeholder='ribbed knit…'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onWords(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
