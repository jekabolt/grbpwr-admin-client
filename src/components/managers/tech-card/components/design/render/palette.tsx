import type { GetDesignBandResponse, common_DesignAsset } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import {
  ASSET_FABRIC,
  ASSETS_PER_CARD_MAX,
  assetFull,
  assetIsPattern,
  assetLabel,
  assetThumb,
  clothShelf,
  fabricUses,
  unmanagedAssets,
} from '../assets/model';
import { ColourPicker } from '../assets/colour-picker';
import { useAssetWrites } from '../assets/use-assets';
import { PictureTile } from '../picture-tile';
import { ClothIsRow } from './cloth-is';
import type { ColourDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { COLOUR_NAME_MAX, fabricStatement, hexIsPaintable, statedWords } from './model';

/**
 * TEXTURE & COLOUR — what a render is clothed and coloured with, and the ONLY place on the band
 * where the card's cloth is brought in, chosen, named and thrown away.
 *
 * ═══ E-7 + E-8 ARE ONE MOVE, AND SPLITTING THEM WOULD HAVE MISSED BOTH ════════════════════════
 *
 * Владелец, дословно:
 *   E-7 — «в фабрик рендере в INPUT — FLATS OF THIS CARD убери CLOTH плейсхолдер давай эту все
 *          настройку сделаем в GENERATION — FABRIC RENDER»;
 *   E-8 — «в GENERATION — FABRIC RENDER сделай более интуитивный выбор текстуры и цвета с помощью
 *          импакбл во первых переименуй там FABRIC в texsture & color дай там возможность создать
 *          новую текстуру что или пикером выбрать из пиктограмок и нормальный пикер цвета».
 *
 * ЧТО БЫЛО НЕ ТАК — ЗАМЕР ПО ЭКРАНУ, А НЕ ВПЕЧАТЛЕНИЕ. Ткань карточки жила в ЧЕТЫРЁХ комнатах:
 *   1. ЗАВОДИЛАСЬ плейсхолдером `+ cloth` внутри ленты «input — flats of this card» — то есть
 *      среди ЧЕРТЕЖЕЙ, под заголовком, который называет чертежи;
 *   2. НАЗЫВАЛАСЬ на вкладке PATTERN, в блоке `patterns of this card`;
 *   3. ОТДАВАЛАСЬ колорвею там же, чипами носки;
 *   4. ВЫБИРАЛАСЬ для прогона здесь — ВЫПАДАЮЩИМ СПИСКОМ ИМЁН под одной плиткой.
 * Четыре места, один предмет. И четвёртое было хуже прочих: это единственная точка полосы, где
 * КАРТИНКУ выбирали по её ИМЕНИ. «cloth 3» и «cloth 4» — не ответ на вопрос «какая из них».
 *
 * ЧТО СТОИТ ТЕПЕРЬ — ДВЕ КОМНАТЫ ВМЕСТО ЧЕТЫРЁХ:
 *   · ЗДЕСЬ ткань ЗАВОДЯТ, ВЫБИРАЮТ и УБИРАЮТ с карточки, и здесь же красят прогон;
 *   · на PATTERN плитку ДЕЛАЮТ и ИМЕНУЮТ (E-15).
 * Комнаты 3 (носка колорвею) больше нет вовсе — E-1/E-16 сняли колорвей с обоих экранов, а E-15
 * прямо говорит, что `keep` не значит «стала текстурой рендера».
 *
 * ═══ ПОЧЕМУ ПИКТОГРАММЫ, А НЕ СПИСОК — ЭТО ГЛАВНОЕ РЕШЕНИЕ ЭКРАНА ═════════════════════════════
 *
 * Ткань опознают ГЛАЗОМ. Вся полоса DESIGN уже так и устроена: верстак, лента входа, выходы,
 * артефакты — везде картинку выбирают, ткнув в картинку. `Select` имён был здесь единственным
 * исключением, и он же был единственным местом, где человек обязан был помнить, что значит
 * «cloth 3». Сетка `Tiles` — то же самое, что он уже умеет, ровно тем же жестом.
 *
 * ⚠ ПОВЕРХНОСТЬ ВЫБИРАЕТ МЫШЬЮ, А ЧИП — ВСЕМ ОСТАЛЬНЫМ, И ЭТО НЕ ДВА ОРГАНА НА ОДНО ДЕЙСТВИЕ.
 * Тот же приём, что у самого примитива с зумом, и его довод дословно: «Поверхность остаётся
 * жестом мыши („ткнуть в картинку“), а именем, фокусом и объявлением владеет угловая кнопка».
 * Поверхность `PictureTile` — `tabIndex={-1} aria-hidden`, то есть клавиатуре и читалке экрана
 * её нет вовсе; выбор ткани, живущий ТОЛЬКО на ней, был бы органом не для всех (PRODUCT.md, WCAG
 * AA). Поэтому объявленный орган выбора — чип с ИМЕНЕМ ткани под кадром: он в табе, он называет
 * предмет вслух, и он же несёт состояние заливкой (DESIGN.md: выбранный чип заливается ink).
 *
 * ⚠ И СОСТОЯНИЕ НЕ НЕСЁТСЯ ОДНОЙ ЗАЛИВКОЙ. Выбранная ткань несёт ТРИ независимых носителя: чип
 * залит, кадр обведён 2px (`selected`), и на кадре стоит словесный ярлык «in this run». Правило
 * PRODUCT.md («state is never carried by colour alone») здесь не формальность: сетка монохромная,
 * и толстая рамка на миниатюре набивки читается плохо.
 *
 * ═══ ЧТО ПРИЕХАЛО СЮДА ИЗ ЛЕНТЫ ВХОДА, ПОИМЁННО (E-7) ════════════════════════════════════════
 *
 *   · дверь `+ texture` (`MediaSlot`: библиотека, ⌘V, бросок файла) — ВМЕСТЕ со своим потолком
 *     активов, его причиной словами и второй проверкой на подтверждении модалки;
 *   · дверь `make a pattern ▸` — вторая половина K-16 («или же оно должно предлагать сделать это
 *     как паттерн»);
 *   · `✕` на кадре — снятие ткани С КАРТОЧКИ, со своим вопросом и своей ценой (у паттерна она
 *     другая: сделать его заново — платный прогон);
 *   · имя `cloth N` для новой ткани.
 * Лента входа при этом стала тем, что написано на её заголовке: ЧЕРТЕЖИ.
 *
 * ⚠ ДВА ✕ ОДНОГО РЯДА ЗНАЧАТ РАЗНОЕ, И РАЗНИЦА НАЗВАНА У КАЖДОГО. `✕` НА КАДРЕ — «убрать ткань
 * с карточки» (запись карточки, необратимая). Снять ткань С ЭТОГО ПРОГОНА — повторное нажатие на
 * её чип, ровно как у всякого чипа полосы. Один глиф на два акта был бы худшим, что можно сделать
 * на выпущенной карточке.
 *
 * ПРОВОД НЕ ИЗМЕНИЛСЯ НИ ОДНИМ ПОЛЕМ. `params.colour = {fabrics, fabricMediaId, code, hex, words,
 * source}` собирается там же, где собирался (`render-studio.tsx`), из того же черновика, теми же
 * дверями (`draft.typed` / `draft.echo({from:'cloths'})`), и `fabrics` по-прежнему длины 0 или 1.
 *
 * ⚠ ПЛИТКА РИСУЕТ ТО, ЧТО УЕДЕТ, А НЕ СВОЙ ВЫБОР. Выбранная читается из `draft.recipe.fabrics[0]`
 * — того самого объекта, который читают ворота, строка денег и модалка «what the model gets».
 * Экран, у которого выбор хранится отдельно от посылки, однажды покажет одно, а купит другое.
 */

/**
 * ИМЯ НОВОЙ ТКАНИ. Приехало из ленты входа вместе с дверью (E-7) и не переписано ни на знак:
 * `taken` — ВЕСЬ ряд, ткани и паттерны вместе, потому что имя обязано быть уникально по тому, что
 * ВИДНО и что уезжает в промпт. Первое свободное, а не «сколько есть + 1»: после удаления второй
 * из трёх счётчик выдал бы занятое имя, и две разные ткани уехали бы в промпт под одним словом.
 */
function nextClothName(taken: common_DesignAsset[]): string {
  const names = new Set(taken.map((a) => (a.name ?? '').trim().toLowerCase()));
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    if (!names.has(`cloth ${n}`)) return `cloth ${n}`;
  }
  return `cloth ${taken.length + 1}`;
}

/** Пиктограмма — квадрат. Лоскут и набивка сами квадратные; портретная рамка резала бы их зря. */
const TEXTURE_ASPECT = '1/1';

/**
 * ═══ СЕТКА ТЕКСТУР ════════════════════════════════════════════════════════════════════════════
 *
 * Ширина дорожки 104px — та же, что у плит `also shown` в референсах, и по той же причине: это
 * наименьший кадр, на котором фактура ткани ещё различима, а раппорт набивки читается как раппорт.
 * Крупнее — и четыре ткани заняли бы экран; мельче — и сетка перестала бы отвечать на свой вопрос.
 */
function TextureGrid({
  band,
  techCardId,
  state,
  disabled,
  onMakePattern,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  state: ColourDraft;
  disabled?: boolean;
  onMakePattern?: () => void;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const [pendingRemove, setPendingRemove] = useState<common_DesignAsset | null>(null);

  /* ОДНА ФУНКЦИЯ НА ЧИТАТЕЛЯ И ПИСАТЕЛЯ (Д-1): ровно та полка, которую наполняет дверь `+ texture`
     ниже, — ткани И паттерны. Порядок — паттерны первыми: владелец сказал «выбрать паттерн», и
     плитка набивки на этом экране главнее фотографии лоскута. */
  const shelf = useMemo(() => {
    const all = clothShelf(band);
    return [...all.filter(assetIsPattern), ...all.filter((a) => !assetIsPattern(a))];
  }, [band]);

  const chosenId = (state.recipe.fabrics ?? [])[0]?.assetId ?? 0;

  /**
   * ПОТОЛОК СЧИТАЕТСЯ ПО ВСЕЙ КАРТОЧКЕ — ОН ЗЕРКАЛО СЕРВЕРНОГО: `UpsertDesignAsset` отвергает
   * 41-й ассет карточки независимо от полки. Но ОТЧЁТ раздельный (Д-2): сколько мест держит эта
   * сетка и сколько — то, чего она не показывает; иначе человек читает «40 активов», не имея ни
   * одного способа освободить место и ни одного слова о том, чем оно занято.
   */
  const totalAssets = (band.assets ?? []).length;
  const unmanaged = useMemo(() => unmanagedAssets(band), [band]);
  const full = totalAssets >= ASSETS_PER_CARD_MAX;
  const fullReason =
    unmanaged.length === 0
      ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, all of them in this grid — remove one to make room`
      : shelf.length === 0
        ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, and every one of them is hardware from the removed ASSETS shelves — nothing on this screen can free a place, so this card cannot take a texture`
        : `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets: ${shelf.length} in this grid and ${unmanaged.length} hardware from the removed ASSETS shelves, which no screen can remove any more — free a place by removing a texture here`;

  /** Выбрать или снять. `0` — «этот прогон ткани не заявляет»; полка при этом не тронута. */
  const pick = (id: number) =>
    state.echo({ from: 'cloths', fabrics: id > 0 ? fabricUses(band, [id]) : [] });

  return (
    <>
      <Tiles min={104}>
        {shelf.map((a) => {
          const id = a.id ?? 0;
          const name = assetLabel(a);
          const url = assetThumb(a);
          const on = id === chosenId;
          const pattern = assetIsPattern(a);
          return (
            <div key={id} className='flex min-w-0 flex-col gap-1' data-texture={id}>
              <PictureTile
                url={url}
                alt={name}
                aspect={TEXTURE_ASPECT}
                /* `cover`, не `contain`: у лоскута и у плитки набивки края нет, и поля вокруг
                   показывали бы фактуру мельче, чем она есть. */
                fit='cover'
                selected={on}
                className='w-full bg-bgColor'
                /* ⚠ ЯРЛЫК — ТРЕТИЙ НОСИТЕЛЬ СОСТОЯНИЯ, а не украшение: заливка чипа и толщина
                   рамки — оба зрительные, и на миниатюре набивки рамка читается плохо. */
                badge={on ? 'in this run' : undefined}
                /* ПОВЕРХНОСТЬ ВЫБИРАЕТ — ЖЕСТОМ МЫШИ. Объявленный орган — чип ниже; довод целиком
                   в шапке файла. */
                onOpen={disabled ? undefined : () => pick(on ? 0 : id)}
                gallery={
                  url
                    ? { src: assetFull(a) || url, thumbnail: url, type: 'image', alt: name }
                    : undefined
                }
                /* ⚠ `✕` ЗДЕСЬ — «УБРАТЬ ТКАНЬ С КАРТОЧКИ», а не «снять с этого прогона». Второе
                   делается повторным нажатием на чип. Приехало из ленты входа (E-7) вместе со
                   своим вопросом: убрать эту дверь было бы дешевле — и оставило бы единственного
                   писателя тканей БЕЗ отката, потому что снять ткань больше негде во всей админке. */
                onRemove={
                  disabled
                    ? undefined
                    : {
                        onClick: () => setPendingRemove(a),
                        ariaLabel: `remove ${name} from this card`,
                        title: pattern
                          ? 'remove this pattern from the card'
                          : 'remove this cloth from the card',
                      }
                }
              />
              {/* ОБЪЯВЛЕННЫЙ ОРГАН ВЫБОРА: имя ткани, в табе, с заливкой в состоянии. */}
              <Chip
                nonForm
                selected={on}
                pressed={on}
                disabled={disabled}
                data-texture-pick={id}
                title={
                  on
                    ? `press again — this run then states no texture. ${name} stays on the card`
                    : `this run is rendered in ${name}`
                }
                onClick={() => pick(on ? 0 : id)}
              >
                <span className='block max-w-full truncate'>{name}</span>
              </Chip>
              {/* ВТОРАЯ СТРОКА ТОЛЬКО ТОГДА, КОГДА ЕЙ ЕСТЬ ЧТО СКАЗАТЬ. Род называется словом лишь
                  у паттерна: ткань — умолчание этой сетки, а на глаз лоскут от набивки не отличить.
                  Раппорт — настоящий факт, и он тоже не читается с картинки. */}
              {pattern && (
                <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                  {['pattern', a.repeatMm ? `${a.repeatMm} mm` : ''].filter(Boolean).join(' · ')}
                </Text>
              )}
            </div>
          );
        })}

        {!disabled && (
          <div className='flex min-w-0 flex-col gap-1' data-texture-add={full ? 'inert' : 'live'}>
            {/* ═══ ДВЕРЬ НА ПОТОЛКЕ ГАСНЕТ, А НЕ ГЛОТАЕТ (Д-2) ═══════════════════════════════
                Здесь стоял живой `MediaSlot`, а отказ жил ПОСЛЕДНЕЙ строкой обработчика: человек
                проходил приёмную модалку целиком — превью, кроп, подтверждение — и не происходило
                НИЧЕГО, без единого слова. Теперь на потолке рисуется мёртвый кадр с причиной. */}
            {full ? (
              <span data-inert={fullReason} title={fullReason} className='block w-full'>
                <span
                  style={{ ...PLACEHOLDER_SURFACE, aspectRatio: TEXTURE_ASPECT }}
                  className={`${placeholderClass({ dashed: true })} w-full`}
                >
                  + texture
                </span>
              </span>
            ) : (
              <MediaSlot
                aspectRatio={['Custom']}
                frameAspect={TEXTURE_ASPECT}
                label='+ texture'
                hint={null}
                purpose='design · cloth texture of this tech card'
                showVideos={false}
                editMode
                onSelect={(media) => {
                  const first = media[0];
                  if (!first?.id) return;
                  /* ВТОРАЯ ПРОВЕРКА ПОТОЛКА, И ОНА ГОВОРИТ ВСЛУХ. Дверь погашена по полосе,
                     прочитанной ЭТИМ рендером, а между её отрисовкой и подтверждением модалки
                     стоит целая прогулка человека: соседняя вкладка успевает добрать потолок. */
                  if (totalAssets >= ASSETS_PER_CARD_MAX) {
                    showMessage(fullReason, 'error');
                    return;
                  }
                  writes.upsertAsset.mutate({
                    // `assetId: 0` заводит. Род — УТВЕРЖДЕНИЕ этой двери: она стоит под подписью
                    // TEXTURE, значит через неё приходит ткань. По пикселям это не восстановимо.
                    assetId: 0,
                    kind: ASSET_FABRIC,
                    name: nextClothName(shelf),
                    mediaId: first.id,
                  });
                }}
              />
            )}
            <Text size='nano' variant='label' component='span' className='normal-case'>
              {full
                ? unmanaged.length === 0
                  ? `${ASSETS_PER_CARD_MAX} of ${ASSETS_PER_CARD_MAX} — remove one`
                  : `${ASSETS_PER_CARD_MAX} of ${ASSETS_PER_CARD_MAX} — ${shelf.length} here, ${unmanaged.length} hardware`
                : '⌘V · drop · browse'}
            </Text>
            {/* ═══ ВТОРАЯ ДВЕРЬ (K-16) ═══════════════════════════════════════════════════════
                Дословно владелец: «на плейсхолдере фабрик можно выбрать из библиотеки или же оно
                должно предлагать сделать это как паттерн». Две двери, «или же», на одной ячейке.
                Она НЕ гаснет на потолке активов: сделать плитку можно всегда, упрётся только
                дверь `keep` на PATTERN, и упрётся своими словами. */}
            {onMakePattern && (
              /* ⚠ `w-full` НЕСУЩИЙ, А НЕ УБОРКА. `<button>` внутри дорожки грида меряется ПО
                 СОДЕРЖИМОМУ и вылезает за её 104px, ложась на соседнюю плитку; ровно этот дефект
                 однажды уже был оплачен в `Tiles`. Ширину задаёт дорожка, а не подпись. */
              <Button
                variant='secondary'
                size='xs'
                className='w-full'
                onClick={onMakePattern}
                title='go to STUDIO → PATTERN: one picture in, a seamless repeating tile out. It comes back into this grid once it is named'
              >
                make a pattern ▸
              </Button>
            )}
          </div>
        )}
      </Tiles>

      {/* ПУСТАЯ ПОЛКА УЧИТ ЭКРАНУ, А НЕ СООБЩАЕТ «ЗДЕСЬ НИЧЕГО НЕТ»: обе двери стоят рядом. */}
      {shelf.length === 0 && (
        <Text size='micro' variant='label' component='p' data-texture-empty className='normal-case'>
          No texture on this card yet. Bring a photograph of the cloth in with <b>+ texture</b>, or
          make a repeating tile out of one on STUDIO → PATTERN. A run states no texture perfectly
          legally — then the colour and the words below build the cloth on their own.
        </Text>
      )}

      {/* ПРИЧИНА ПОТОЛКА — ВИДИМОЙ СТРОКОЙ, А НЕ ТОЛЬКО ПОДСКАЗКОЙ: подсказка требует НАВЕСТИ на
          кадр, а человек, у которого дверь погасла, смотрит на неё и уходит. */}
      {full && (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          {fullReason}.
        </Text>
      )}

      <ConfirmationModal
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={`remove ${pendingRemove ? assetLabel(pendingRemove) : 'this texture'}?`}
        confirmLabel='remove'
        onConfirm={() => {
          const id = pendingRemove?.id ?? 0;
          if (id > 0) writes.deleteAsset.mutate(id);
          setPendingRemove(null);
        }}
      >
        <div className='flex flex-col gap-2'>
          {/* УДАЛЕНИЕ ПАТТЕРНА ДОРОЖЕ УДАЛЕНИЯ ТКАНИ, И ЭТО НАДО СКАЗАТЬ ДО «ok». Ткань заводится
              этой же дверью заново из той же картинки; плитку надо СГЕНЕРИРОВАТЬ заново, и это
              стоит денег. Одинаковый вопрос на два разных по цене жеста учил бы нажимать не глядя. */}
          {assetIsPattern(pendingRemove ?? undefined) && (
            <Text size='control'>
              This one is a <b>pattern</b>: making it again is a paid run on STUDIO → PATTERN.
            </Text>
          )}
          <Text size='control'>
            The picture file stays in the library. Runs already made keep their own frozen copy of
            this cloth, so their history stays readable.
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}

/**
 * ═══ ЦВЕТ — ТА ЖЕ ПИКТОГРАММА, ТОЛЬКО ЗАМЕШАННАЯ РУКАМИ ═══════════════════════════════════════
 *
 * Тот же квадрат 104px, что у текстур, залитый выбранным цветом: на этом ряду текстура и цвет —
 * ОДНОРОДНЫЕ предметы («квадрат, на который можно посмотреть»), и это ровно то, чем они являются
 * для промпта. Незакрашиваемое значение — ПОЛОСАТОЕ, никогда не чёрное и не белое: квадрат,
 * закрасивший неизвестный цвет, врёт так, что глаз верит целиком.
 *
 * ПИКЕР ТОТ ЖЕ САМЫЙ (`assets/colour-picker`) — квадрат насыщенности, полоса тона, поле hex,
 * пипетка там, где браузер её даёт, и плашки рецептов, которыми ЭТА карточка уже печаталась.
 * «Нормальный пикер цвета» из E-8 — это он, и второго здесь не заводится: два органа на один
 * предмет расходятся первой же правкой.
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
      className='flex w-[104px] shrink-0 flex-col gap-1'
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
              style={{ aspectRatio: TEXTURE_ASPECT, background: (recipe.hex ?? '').trim() }}
            />
          ) : (
            <span
              data-colour-swatch
              style={{ ...PLACEHOLDER_SURFACE, aspectRatio: TEXTURE_ASPECT }}
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
  techCardId,
  onMakePattern,
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
  /** Полка ткани теперь ЗАПИСЫВАЕТСЯ здесь (E-7), и записи адресуются карточкой. */
  techCardId: number;
  /** K-16: уход на вкладку PATTERN со второй двери. Не задан — двери нет вовсе. */
  onMakePattern?: () => void;
  disabled?: boolean;
}): JSX.Element {
  const state = draft;
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);
  /** ЖИВАЯ КОМПОЗИЦИЯ — ТА ЖЕ ФУНКЦИЯ, ЧТО УЕДЕТ НА ПРОВОД. Второе написание склейки обещало бы
   *  человеку одно, а покупало бы другое; поэтому подпись читает `statedWords`, а не собирается. */
  const willSay = statedWords(state);
  const clothAbove = stated.photo;
  const colourAbove = !stated.photo && stated.colour;

  return (
    <div>
      {/* ═══ ОДНА ГРУППА НА ДВА ОДНОРОДНЫХ ПРЕДМЕТА (E-8) ════════════════════════════════════
          `GroupLabel` — вес «под-группа» лестницы DESIGN.md (1px `#cccccc`), на ступень выше
          рулёных рядов ниже (`#e6e6e6`). Это верный вес: текстура с цветом теперь самая крупная
          вещь блока, а `cloth is` и `in words` — её свойства. Второй белой коробки при этом не
          заводится: блок в блоке запрещён, и группа рисуется ЛИНИЕЙ, а не рамкой. */}
      {/* ⚠ ЯКОРЯ `data-*` НА `GroupLabel` НЕТ И БЫТЬ НЕ МОЖЕТ: примитив принимает ЗАКРЫТЫЙ список
          пропов и лишние молча выбрасывает — атрибут не доехал бы до DOM, а проба на нём была бы
          ВАКУУМНО ЗЕЛЁНОЙ. Заголовок группы проверяется текстом; коробку объявляет ряд ниже
          (`data-fabric-pair`) и сама секция (`id='design-fabric-menu'`). */}
      <GroupLabel
        flush
        action={
          <Text size='micro' variant='label' component='span' className='normal-case'>
            a texture, a colour, or both — one texture per run
          </Text>
        }
      >
        texture &amp; colour
      </GroupLabel>

      <FieldRow label='texture' data-fabric-pair className='items-start'>
        <div className='min-w-0 flex-1'>
          <TextureGrid
            band={band}
            techCardId={techCardId}
            state={state}
            disabled={disabled}
            onMakePattern={onMakePattern}
          />
        </div>
      </FieldRow>

      <FieldRow label='colour' className='items-start'>
        <ColourTile band={band} state={state} disabled={disabled} />
        {/* ⚠ ЗДЕСЬ СТОЯЛА ОБЩАЯ СТРОКА ПОРЯДКА СТАРШИНСТВА (`fabricAuthority`), И ОНА СНЯТА С
            ЭКРАНА — E-2. Она говорила ПРАВИЛО («the photo states the material · the picked colour
            overrides the photo’s colour · the words state what neither of them states»), а тремя
            рядами ниже то же самое говорилось ВТОРОЙ раз, применительно к этому прогону. Владелец
            жаловался ровно на невидимость этого утверждения — и невидимо оно было потому, что было
            размазано на три тихие копии. Осталась ОДНА, у чипов прозрачности, там, где принимают
            отменяемое ею решение.

            ⚠ ФУНКЦИЯ ЖИВА И ПРОДОЛЖАЕТ ПИТАТЬ ВТОРУЮ ПОВЕРХНОСТЬ — модалку «what the model gets»,
            где опись читают целиком. Гарантия «одна поверхность не разойдётся с другой» при этом
            не потеряна и держится тем же, чем держалась: ОБЕ читают `clothWordsRank`. Проба
            сверяет `data-words-rank` экрана с `data-fabric-authority` модалки. */}
      </FieldRow>

      {/* ── WHAT THE CLOTH IS — H-13. Свойство ТОЙ ЖЕ ткани, что в сетке, и уезжает в то же поле
          провода, что слова ниже. ⚠ РЯД ЗНАЕТ ПРО ФОТОГРАФИЮ (E-2): именно у него стоит теперь
          единственная строка о том, кто кого перебивает. */}
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
        {/* ⚠ ЗДЕСЬ СТОЯЛА ТРЕТЬЯ КОПИЯ ОДНОГО УТВЕРЖДЕНИЯ О СТАРШИНСТВЕ (E-2). Владелец про него:
            «этого не видно» — и он был прав дважды: сказано было тихо И в трёх местах сразу
            (подсказка этого ряда, абзац под плитками, ряд `cloth is` молчал). Три тихих экземпляра
            складываются не в громкость, а в шум. Утверждение переехало ЦЕЛИКОМ и ровно одно — к
            чипам прозрачности, то есть туда, где принимают решение, которое оно отменяет. Здесь
            осталось то, чего не говорит никто другой: как это поле склеивается с соседним. */}
        <Hint>free text; it is joined to the opacity and the weight above into one sentence</Hint>
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
              ? 'nothing added — legal; the texture above already states the material'
              : colourAbove
                ? 'nothing added — only a colour is stated above, so the material is left to the model'
                : 'nothing added — and nothing above states the cloth yet either'}
        </Text>
      </div>
    </div>
  );
}
