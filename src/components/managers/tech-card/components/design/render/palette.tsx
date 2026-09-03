import type { GetDesignBandResponse, common_DesignAsset } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import {
  assetFull,
  assetIsPattern,
  assetLabel,
  assetThumb,
  clothShelf,
  fabricUses,
} from '../assets/model';
import { ColourPicker } from '../assets/colour-picker';
import { PictureTile } from '../picture-tile';
import { ClothIsRow } from './cloth-is';
import type { ColourDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { COLOUR_NAME_MAX, clothWordsRank, fabricAuthority, fabricStatement, hexIsPaintable, statedWords } from './model';
import { STRIP_FRAME_ASPECT } from './strip-cell';

/**
 * FABRIC — what a render is coloured and clothed with.
 *
 * ═══ ОДНА СТРОКА, ДВА ПЛЕЙСХОЛДЕРА (J-20) ════════════════════════════════════════════════════
 *
 * Владелец, дословно: «в GENERATION — FABRIC RENDER COLOURWAY и фабрик должен быть в одной строке
 * настройки как два плейсхолдера типо в один можно селектором выбрать паттерн в другой можно
 * выбрать цвет пикером а не так как сейчас у нас должно быть в одной строке а не в 3 COLOURWAY
 * CLOTHS COLOUR я не понимаю зачем там 3 вообще двух достаточно, FIT полностью убираем отсюда».
 *
 * ЧТО ЗДЕСЬ СТОЯЛО И ЧТО С НИМ СТАЛО — ПОИМЁННО, чтобы следующий читатель не восстановил снятое:
 *
 *   · РЯД `COLOURWAY` (`ColorwayPicker`, чипы) — ПЕРЕЕХАЛ В ШАПКУ БЛОКА. Ось колорвея не снята:
 *     ею ключуются верстак рендеров, список выходов, ворота 3D и `params.colorway_id`. Но она не
 *     НАСТРОЙКА этого прогона, она его АДРЕС — «чей это рендер», — и адрес живёт в заголовочной
 *     линейке блока (`Section action`), где DESIGN.md и держит фильтры. Строк настройки стало две
 *     меньше, а модель круга 12–14 не переписана молча.
 *   · РЯД `FABRIC` («wears», чипы `SetDesignAssetColorway`) — СНЯТ. Это была запись КАРТОЧКИ под
 *     заголовком `generation`, и тот же жест целиком живёт на вкладке PATTERN, в блоке
 *     `patterns of this card` (`data-wear-cw`): именно туда владелец и просил свести «как мы
 *     пробрасываем паттерны». Двух мест для одного факта не остаётся.
 *   · РЯД `CLOTHS` (мультивыбор чипами) — СТАЛ ПЛИТКОЙ PATTERN, и выбор сузился до ОДНОЙ ткани.
 *     Это не потеря, а следствие J-21: несколько тканей имели смысл ровно потому, что каждая
 *     объявляла СВОИ ЧАСТИ изделия (`parts`, из меток на флэтах). Меток больше нет — и промпт с
 *     двумя тканями печатал бы «the division is yours to make», то есть две ткани без разделения.
 *     Один слот честнее, чем список, который нечем разделить.
 *   · РЯД `COLOUR` (свотч + hex + имя) — СТАЛ ПЛИТКОЙ COLOUR. Пикер тот же самый
 *     (`assets/colour-picker`), у него внутри и своё поле hex, и плашки прошлых рецептов карточки;
 *     сменилось только ЛИЦО кнопки — плитка вместо квадрата 22px (проп `face`).
 *   · РЯД `FIT` — СНЯТ ЦЕЛИКОМ. Он был read-only и объяснял, почему его нельзя править.
 *
 * ЧТО ОСТАЛОСЬ ПОД ПАРОЙ ПЛИТОК И ПОЧЕМУ ЭТО НЕ «ТРЕТИЙ ИСТОЧНИК»: ряды `CLOTH IS` (прозрачность,
 * граммаж) и `IN WORDS` — это СВОЙСТВА той же ткани, а не четвёртое место, где её выбирают. Оба
 * пришли прошлым кругом по прямой просьбе владельца («сказать что ткань полупрозрачная»), и оба
 * уезжают в то же поле провода.
 *
 * ПРОВОД НЕ ИЗМЕНИЛСЯ НИ ОДНИМ ПОЛЕМ. `params.colour = {fabrics, fabricMediaId, code, hex, words,
 * source}` собирается там же, где собирался (`render-studio.tsx`), из того же черновика, теми же
 * дверями (`draft.typed` / `draft.echo({from:'cloths'})`). Единственная разница — `fabrics` теперь
 * длины 0 или 1, а `parts` внутри каждой пусты (J-21).
 *
 * ⚠ ПЛИТКА РИСУЕТ ТО, ЧТО УЕДЕТ, А НЕ СВОЙ ВЫБОР. Лицо читается из `draft.recipe.fabrics[0]` —
 * того самого объекта, который читают ворота, строка денег и модалка «what the model gets».
 * Экран, у которого выбор хранится отдельно от посылки, однажды покажет одно, а купит другое.
 */

/** Radix запрещает пустое значение пункта, а пустое, доехавшее до `Select.Root`, стирает выбор. */
const NO_CLOTH = '__none__';

/**
 * ═══ ПЛИТКА ТКАНИ ═════════════════════════════════════════════════════════════════════════════
 *
 * Кадр — та же коробка 132×148, что у всех входных лент полосы (`STRIP_FRAME_ASPECT`), поэтому
 * глаз читает эти два места как ВХОДЫ, а не как иллюстрации. `cover`, не `contain`: у лоскута и у
 * плитки набивки края нет, поля вокруг показывали бы фактуру мельче, чем она есть.
 */
function PatternTile({
  band,
  state,
  disabled,
}: {
  band: GetDesignBandResponse;
  state: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  /* ОДНА ФУНКЦИЯ НА ЧИТАТЕЛЯ И ПИСАТЕЛЯ (Д-1): ровно та полка, которую наполняет дверь `+ cloth`
     в INPUT, — ткани И паттерны. Порядок — паттерны первыми: владелец сказал «выбрать паттерн», и
     плитка набивки на этом экране главнее фотографии лоскута. */
  const shelf = useMemo(() => {
    const all = clothShelf(band);
    return [...all.filter(assetIsPattern), ...all.filter((a) => !assetIsPattern(a))];
  }, [band]);

  const chosenId = (state.recipe.fabrics ?? [])[0]?.assetId ?? 0;
  const chosen: common_DesignAsset | undefined = shelf.find((a) => (a.id ?? 0) === chosenId);

  /** Замороженная копия ткани, которая УЕХАЛА БЫ прямо сейчас — она и подписывает плитку. */
  const use = (state.recipe.fabrics ?? [])[0];
  const name = chosen ? assetLabel(chosen) : (use?.name ?? '').trim();
  const url = chosen ? assetThumb(chosen) : '';

  const pick = (id: number) =>
    state.echo({ from: 'cloths', fabrics: id > 0 ? fabricUses(band, [id]) : [] });

  return (
    <div
      data-fabric-tile='pattern'
      data-tile-state={chosenId > 0 ? 'filled' : 'empty'}
      className='flex w-[132px] shrink-0 flex-col gap-1'
    >
      {chosenId > 0 ? (
        <PictureTile
          url={url}
          alt={name || 'cloth'}
          aspect={STRIP_FRAME_ASPECT}
          fit='cover'
          className='w-full bg-bgColor'
          gallery={
            url
              ? { src: assetFull(chosen), thumbnail: url, type: 'image', alt: name || 'cloth' }
              : undefined
          }
          /* ✕ ЗДЕСЬ ЗНАЧИТ «ЭТОТ ПРОГОН ТКАНИ НЕ ЗАЯВЛЯЕТ», а не «убрать ткань с карточки». Полка
             не тронута: снятие — это `fabrics: []` в черновике одного прогона. */
          onRemove={
            disabled
              ? undefined
              : {
                  onClick: () => pick(0),
                  ariaLabel: 'clear the cloth of this run',
                  title: 'clear — this run states no cloth. The card keeps it',
                }
          }
        />
      ) : (
        <div
          style={{ ...PLACEHOLDER_SURFACE, aspectRatio: STRIP_FRAME_ASPECT }}
          className={`${placeholderClass({ dashed: true })} w-full`}
        >
          + pattern
        </div>
      )}

      {/* СЕЛЕКТОР — ПОД КАДРОМ И ВО ВСЮ ЕГО ШИРИНУ. Владелец: «в один можно селектором выбрать
          паттерн». Кадр показывает СОСТОЯНИЕ, селектор делает ВЫБОР; один орган на две роли
          означал бы плитку, которую нельзя ни сменить с клавиатуры, ни объявить читалке. */}
      <SelectComponent
        name='design-fabric-pattern'
        value={chosenId > 0 ? String(chosenId) : NO_CLOTH}
        placeholder='— pattern —'
        disabled={disabled || shelf.length === 0}
        items={[
          { value: NO_CLOTH, label: '— pattern —' },
          ...shelf.map((a) => ({
            value: String(a.id ?? 0),
            label: `${assetLabel(a)}${assetIsPattern(a) ? '' : ' · cloth'}`,
          })),
        ]}
        onValueChange={(value: string) => pick(value === NO_CLOTH ? 0 : Number(value) || 0)}
        fullWidth
      />

      <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
        {chosenId > 0
          ? `${name}${use?.mediaId ? '' : ' · no photo'}`
          : shelf.length === 0
            ? 'none on this card — add one under INPUT → CLOTH above'
            : 'optional'}
      </Text>
    </div>
  );
}

/**
 * ═══ ПЛИТКА ЦВЕТА ═════════════════════════════════════════════════════════════════════════════
 *
 * Тот же кадр, залитый выбранным цветом. Незакрашиваемое значение — ПОЛОСАТОЕ, никогда не чёрное
 * и не белое: квадрат, закрасивший неизвестный цвет, врёт так, что глаз верит целиком (правило
 * `Swatch` на всю полосу, здесь оно просто крупнее).
 *
 * ИМЯ ЦВЕТА — ВТОРАЯ ПОЛОВИНА ОДНОГО ЗАЯВЛЕНИЯ, а не отдельная настройка: промпт цитирует их
 * ПАРОЙ («colourway dusty rose — the exact value is #a41f22»), поэтому поле стоит в той же
 * колонке, под своей плиткой. Поля hex здесь НЕТ намеренно: оно живёт внутри пикера, и второй
 * вход одной величины на одном экране — тот самый дефект, который уже стоил купленного прогона.
 */
function ColourTile({
  band,
  state,
  disabled,
}: {
  band: GetDesignBandResponse;
  state: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);
  const paintable = hexIsPaintable(recipe.hex);

  const recent = useMemo(
    () =>
      (band.colourRecipes ?? [])
        .map((r) => ({ hex: (r.hex ?? '').trim(), code: (r.code ?? '').trim() }))
        .filter((r) => hexIsPaintable(r.hex)),
    [band.colourRecipes],
  );

  return (
    <div
      data-fabric-tile='colour'
      data-tile-state={stated.colour ? 'filled' : 'empty'}
      className='flex w-[132px] shrink-0 flex-col gap-1'
    >
      <ColourPicker
        hex={recipe.hex ?? ''}
        disabled={disabled}
        recent={recent}
        label='pick the colour of this run'
        /* ⚠ ПИКЕР — ТИПОВАННЫЙ ВХОД, А НЕ ЭХО. Человек, открывший его и выбравший значение, сделал
           ОСОЗНАННОЕ заявление; это ранг 2 порядка старшинства, и он обязан пережить последующий
           выбор ткани. «Производное» — то, что приезжает САМО, а не то, во что ткнули пальцем. */
        onPick={(hex) => state.typed({ hex })}
        /* Прошлый рецепт возвращается ЦЕЛИКОМ — значение и имя: плашка обещает пару, которая на
           карточке была, и вернуть половину значило бы собрать пару, которой не было никогда. */
        onPickRecent={(hex, code) => state.typed({ hex, code })}
        face={
          paintable ? (
            <span
              data-colour-swatch
              aria-hidden='true'
              className='block w-full border border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              style={{ aspectRatio: STRIP_FRAME_ASPECT, background: (recipe.hex ?? '').trim() }}
            />
          ) : (
            <span
              data-colour-swatch
              style={{ ...PLACEHOLDER_SURFACE, aspectRatio: STRIP_FRAME_ASPECT }}
              className={`${placeholderClass({ dashed: true })} w-full`}
            >
              + colour
            </span>
          )
        }
      />

      <Input
        name='design-colour-name'
        data-colour-name
        /* ПОДПИСЬ ДЛЯ СКРИНРИДЕРА: `<label for>` в этой колонке нет, а соседнее поле «in words»
           звучало бы так же — «edit text». */
        aria-label='colour name'
        maxLength={COLOUR_NAME_MAX}
        value={recipe.code ?? ''}
        disabled={disabled}
        placeholder='dusty rose'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => state.typed({ code: e.target.value })}
      />

      <div className='flex min-w-0 flex-wrap items-center gap-1'>
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {paintable ? (recipe.hex ?? '').trim() : stated.colour ? 'named, no value' : 'optional'}
        </Text>
        {!disabled && stated.colour && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('colour')}>
            clear
          </Button>
        )}
      </div>
    </div>
  );
}

export function Palette({
  disabled,
  /** Supplied by `RenderStudio`, so the palette and the studio's gate read one draft. */
  draft,
  band,
}: {
  band: GetDesignBandResponse;
  /**
   * ⚠ ОБЯЗАТЕЛЕН, И ЭТО ПОЧИНКА МЁРТВОГО ПИСАТЕЛЯ, А НЕ УЖЕСТОЧЕНИЕ РАДИ СТРОГОСТИ. Проп был
   * необязательным, а рядом безусловно звался `useColourDraft` — ЦЕЛЫЙ ВТОРОЙ ЧЕРНОВИК, который
   * выбрасывался всегда. Мёртвый он был не весь: смонтируй кто-нибудь `Palette` без пропа, и ряд
   * CLOTH IS писал бы в `own.cloth`, которого не композирует НИКТО, — «сохранено, но не поехало».
   * Состояние подаёт студия; ворота и палитра обязаны читать ОДИН черновик.
   */
  draft: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  const state = draft;
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);
  /** ЖИВАЯ КОМПОЗИЦИЯ — ТА ЖЕ ФУНКЦИЯ, ЧТО УЕДЕТ НА ПРОВОД. Второе написание склейки обещало бы
   *  человеку одно, а покупало бы другое; поэтому подпись читает `statedWords`, а не собирается. */
  const willSay = statedWords(state);
  /**
   * КТО ПЕРЕБЬЁТ ЭТИ СЛОВА — ВЫЧИСЛЯЕТ МОДЕЛЬ, ЭКРАН ТОЛЬКО ГОВОРИТ (H-13). Довод и построчное
   * условие из `renderprompt.go` — у `clothWordsRank`.
   */
  const rank = clothWordsRank(recipe);
  /** Подпись порядка старшинства — одна пара «состояние + текст» на обе поверхности. */
  const authority = fabricAuthority(recipe);

  const clothAbove = stated.photo;
  const colourAbove = !stated.photo && stated.colour;

  return (
    <div>
      {/* ── ОДНА СТРОКА, ДВА ПЛЕЙСХОЛДЕРА (J-20). Ряды COLOURWAY / CLOTHS / COLOUR были тремя
             ответами на один вопрос «из чего этот рендер»; здесь их два, и оба — предметы, а не
             поля: плитка ткани и плитка цвета. */}
      <FieldRow label='fabric' data-fabric-pair className='items-start'>
        <div className='flex flex-wrap items-start gap-3'>
          <PatternTile band={band} state={state} disabled={disabled} />
          <ColourTile band={band} state={state} disabled={disabled} />
        </div>
        {/* ⚠ ПОРЯДОК СТАРШИНСТВА — ФУНКЦИЯ РЕЦЕПТА, А НЕ КОНСТАНТА, и он же печатается в модалке
            «what the model gets». `data-fabric-authority` не украшение: он даёт пробе сверить ДВЕ
            поверхности между собой, а не каждую с ожидаемым текстом по отдельности. */}
        <div className='w-full pl-[100px]'>
          <Text
            size='micro'
            variant='label'
            component='p'
            data-fabric-authority={authority.state}
            className='normal-case'
          >
            {authority.text}
          </Text>
        </div>
      </FieldRow>

      {/* ── WHAT THE CLOTH IS — H-13. Свойство ТОЙ ЖЕ ткани, что в плитке, и уезжает в то же поле
          провода, что слова ниже. */}
      <ClothIsRow draft={state} disabled={disabled} />

      {/* ── THE WORDS — the lowest rank, and a legal statement entirely on its own. */}
      <FieldRow label='in words'>
        <div className='w-full max-w-[420px]'>
          <Input
            name='design-fabric-words'
            value={recipe.words ?? ''}
            disabled={disabled}
            placeholder='fine rib jersey, matte…'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.typed({ words: e.target.value })
            }
          />
        </div>
        {!disabled && stated.words && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('words')}>
            clear
          </Button>
        )}
        <Hint>
          {rank.governs
            ? 'with no cloth photograph riding, these words build the material: weave, weight, surface, drape'
            : 'against the cloth photograph above these words are description, not instruction'}
        </Hint>
      </FieldRow>

      {/* ═══ ОДНА ЖИВАЯ ПОДПИСЬ — ЧТО ИМЕННО УЕДЕТ СЛОВАМИ ═══════════════════════════════════════
          Не «предпросмотр» и не украшение: два контрола выше пишут ОДНО поле провода, и порядок
          клауз в нём человек иначе не увидит до самой картинки. Строка показывает результат ДО
          денег теми же словами, что и модалка «what the model gets», потому что читает ту же
          функцию. Пустая композиция — законный ответ, и он тоже назван вслух. */}
      <div className='space-y-0.5 pl-[100px] pt-1'>
        <Text
          size='micro'
          variant='label'
          component='p'
          data-stated-words={willSay ? 'stated' : 'nothing'}
          className='normal-case'
        >
          {willSay
            ? `goes to the model as: «${willSay}»`
            : clothAbove
              ? 'nothing added — legal; the cloth above already states the material'
              : colourAbove
                ? 'nothing added — only a colour is stated above, so the material is left to the model'
                : 'nothing added — and nothing above states the cloth yet either'}
        </Text>

        {willSay && (
          <Text
            size='micro'
            variant='label'
            component='p'
            data-words-rank={rank.governs ? 'governs' : 'outranked'}
            className='normal-case'
          >
            {rank.governs
              ? '…and the model builds the weave, the weight, the surface and the drape from these words: a stated colour states colour and nothing else.'
              : '…but the cloth photograph above states transparency, weight and drape itself, so against it these words are description, not instruction. Take the cloth off to let them govern the material.'}
          </Text>
        )}
      </div>
    </div>
  );
}
