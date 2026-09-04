import type { GetDesignBandResponse, common_Color, common_DesignColourRecipe } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import { ColourPicker } from '../assets/colour-picker';
import { ASSETS_PER_CARD_MAX, ASSET_FABRIC, clothShelf } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { PictureTile } from '../picture-tile';
import type { ColourDraft } from '../render/drafts';
import { FieldRow } from '../render/field-row';
import { colourSubtitle, hexIsPaintable } from '../render/model';
import type { ClothChoice } from './model';

/**
 * ═══ TEXTURE & COLOUR НА ON MODEL — ТОТ ЖЕ РЯД, ЧТО НА FABRIC RENDER (D-14) ═══════════════════
 *
 * Владелец, дословно: «ON MODEL так же должен принимать колор и текстур инпут как FABRIC RENDER».
 *
 * ЧТО СТОЯЛО ЗДЕСЬ И ЧЕМ ЭТО ОТЛИЧАЛОСЬ (J-31). Заголовок-заявление (плитка + свотч + две строки
 * слов), под ним ряд `pattern` из плиток 56×63 — ТОЛЬКО набивки — и ниже, отдельным рядом,
 * `colour`: 22-пиксельный свотч, поле hex, кнопка clear. Три ряда на два предмета, ни одного
 * общего пикселя с соседним экраном, и дверь принести ткань — только на FABRIC RENDER. Владелец
 * увидел на двух вкладках два разных органа для одного вопроса «во что переодеть».
 *
 * ЧТО СТОИТ ТЕПЕРЬ — РЯД D-8 ДОСЛОВНО: группа `texture & colour`, одна строка: сетка текстур слева
 * (дорожка 104px, квадрат, ярлык «in this run», объявленный чип), плитка цвета справа (те же
 * 104px, тот же пикер, то же лицо `+ colour`), дверь `+ texture` в той же сетке. Мера, кегль,
 * порядок и слова — из `render/palette.tsx`, потому что «как FABRIC RENDER» — это сравнение, и
 * сравнение выдерживает только то, что собрано из того же.
 *
 * ⚠ СОБРАНО ИЗ ТЕХ ЖЕ ПРИМИТИВОВ, А НЕ ИЗ ТЕХ ЖЕ КОМПОНЕНТОВ, И ЭТО ВРЕМЕННО. `TextureGrid` и
 * `ColourTile` палитры — модульно-приватные и пишут в `ColourDraft` через `echo({from:'cloths'})`,
 * который ЗДЕСЬ отбрасывает ткань по решению J-31 (см. `./drafts.ts`: невидимая засеянная ткань
 * открывала ворота при пустом цвете). Этому экрану нужны те же органы с ЯВНЫМИ входами — «какие
 * плитки, какая выбрана, что делать по нажатию». Как только `palette.tsx` их экспортирует
 * (`TextureGrid`/`ColourTile` с пропами `choices`/`chosen`/`onPick`), этот файл сжимается до их
 * вызова; до тех пор ряд собран из `Tiles`, `PictureTile`, `Chip`, `MediaSlot`, `ColourPicker`
 * и `FieldRow` — тех же, из которых собрана палитра, — и держит те же якоря состояния.
 *
 * ═══ ЧЕМ ОН ОТЛИЧАЕТСЯ ОТ ПАЛИТРЫ, И КАЖДОЕ ОТЛИЧИЕ — РЕШЕНИЕ, А НЕ НЕДОДЕЛКА ══════════════════
 *
 *  · ВЫБОР — ЧИСЛО, НЕ РЕЦЕПТ. Плитка выбирается в `useClothChoice` (id ассета), а не в черновик
 *    цвета, и по-прежнему НЕ засевается прошлым прогоном: набивка — заказ, а не свойство карточки,
 *    и подставить вчерашнюю в сегодняшний платный прогон значило бы купить её второй раз молча.
 *    Палитра засевает ткань, потому что у рендера ткань — свойство изделия.
 *  · У ЦВЕТА НЕТ ИМЕНИ (E-11, владелец: «текстфилд NAME не нужен»). Плитка цвета — без поля под
 *    ней, плашка прошлого рецепта возвращает ТОЛЬКО значение. Второй половины выключателя нет.
 *  · СНЯТЬ ТЕКСТУРУ С КАРТОЧКИ ЗДЕСЬ НЕЛЬЗЯ. Угла `✕` на плитке нет: полкой управляют на FABRIC
 *    RENDER, и второй уничтожающий орган на втором экране — это второй вопрос «удалить?» с другим
 *    текстом. Снять с ПРОГОНА — повторное нажатие чипа, как в палитре.
 *  · РЯДА `cloth is` НЕТ: граммаж и прозрачность ткани на фотографии видны, объявлять их словами
 *    значило бы спорить со снимком (H-13, довод у `useTargetColourDraft`).
 *
 * ФОРМА: БЛОК В БЛОКЕ ЗАПРЕЩЁН. Секция `generation — on model` остаётся одной коробкой; группа
 * рисуется линией (`GroupLabel`, 1px `#ccc`), ряд — линией `#e6e6e6` (`FieldRow`). Ни второй
 * рамки, ни заливки, кроме штриховки пустоты.
 */

/** Квадрат — та же мера, что у сетки текстур палитры (`TEXTURE_ASPECT`, приватная там). */
const TEXTURE_ASPECT = '1/1';

/**
 * ИМЯ НОВОЙ ТКАНИ — то же правило, что у двери `+ texture` палитры (`nextClothName`, приватная
 * там): первое свободное «cloth N» по ВСЕЙ полке. После удаления второй из трёх счётчик «сколько
 * есть + 1» выдал бы занятое имя, и две разные ткани уехали бы в промпт под одним словом.
 */
function nextClothName(taken: { name?: string }[]): string {
  const names = new Set(taken.map((a) => (a.name ?? '').trim().toLowerCase()));
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    if (!names.has(`cloth ${n}`)) return `cloth ${n}`;
  }
  return `cloth ${taken.length + 1}`;
}

export function ClothRow({
  band,
  techCardId,
  choices,
  chosen,
  draft,
  colour,
  colors,
  disabled,
  onPick,
}: {
  band: GetDesignBandResponse;
  /** Дверь `+ texture` ЗАПИСЫВАЕТ полку, и записи адресуются карточкой. */
  techCardId: number;
  choices: readonly ClothChoice[];
  chosen: ClothChoice | null;
  /** Черновик цвета — то, что пишет плитка цвета. Тот же тип и та же дверь, что у палитры. */
  draft: ColourDraft;
  /** ТЕЛО ЗАПРОСА, а не черновик: строка под рядом обязана описывать то, что уедет. */
  colour: common_DesignColourRecipe;
  colors?: readonly common_Color[];
  disabled?: boolean;
  /** `0` снимает текстуру с прогона; полка при этом не тронута. */
  onPick: (assetId: number) => void;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  /** Первая выключенная плитка — её причину экран печатает словами под сеткой. */
  const blocked = choices.find((c) => !!c.blocked) ?? null;

  /** Потолок — серверный и по ВСЕЙ карточке (`UpsertDesignAsset` отвергает 41-й ассет). */
  const totalAssets = (band.assets ?? []).length;
  const full = totalAssets >= ASSETS_PER_CARD_MAX;
  const fullReason = `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets — make room by removing a texture on FABRIC RENDER, the one place a texture is taken off the card`;
  const shelf = useMemo(() => clothShelf(band), [band]);

  return (
    <div>
      {/* ⚠ ЯКОРЯ `data-*` НА `GroupLabel` НЕТ: примитив принимает закрытый список пропов. Заголовок
          проверяется текстом; коробку объявляет ряд ниже (`data-cloth-row`) и секция над ним
          (`id='design-onmodel-menu'`). */}
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

      {/* ОДНОЙ СТРОКОЙ (D-8, повторено здесь дословно): подпись ряда — `texture`, потому что
          заголовок группы строкой выше уже сказал «texture & colour»; плитка цвета называет себя
          сама, дверью `+ colour`. Плитка цвета ровно 104px — минимальная колонка `Tiles`, так что
          обе стоят по одной сетке. */}
      <FieldRow label='texture' className='items-start' data-cloth-row>
        <div className='flex min-w-0 flex-1 items-start gap-2'>
          <div className='min-w-0 flex-1' data-cloth-grid>
            <Tiles min={104}>
              {choices.map((choice) => {
                const on = chosen?.assetId === choice.assetId;
                const shut = disabled || !!choice.blocked;
                return (
                  <div
                    key={choice.assetId}
                    className='flex min-w-0 flex-col gap-1'
                    data-cloth-tile={choice.assetId}
                    data-cloth-blocked={choice.blocked || undefined}
                  >
                    <PictureTile
                      url={choice.thumb}
                      alt={choice.name}
                      aspect={TEXTURE_ASPECT}
                      /* `cover`, не `contain`: у лоскута и у плитки набивки края нет, и поля
                         вокруг показывали бы фактуру мельче, чем она есть. */
                      fit='cover'
                      selected={on}
                      /* Выключенная плитка приглушается КАДРОМ, а не всей колонкой: чип под ней
                         обязан остаться читаемым — на нём и стоит причина. */
                      dim={!!choice.blocked}
                      className='w-full bg-bgColor'
                      /* ЯРЛЫК — ТРЕТИЙ НОСИТЕЛЬ СОСТОЯНИЯ: заливка чипа и толщина рамки — оба
                         зрительные, и на миниатюре набивки рамка читается плохо. */
                      badge={on ? 'in this run' : undefined}
                      /* ПОВЕРХНОСТЬ ВЫБИРАЕТ — ЖЕСТОМ МЫШИ. Объявленный орган — чип ниже. */
                      onOpen={shut ? undefined : () => onPick(on ? 0 : choice.assetId)}
                      gallery={
                        choice.thumb
                          ? {
                              src: choice.full || choice.thumb,
                              thumbnail: choice.thumb,
                              type: 'image',
                              alt: choice.name,
                            }
                          : undefined
                      }
                    />
                    <Chip
                      nonForm
                      selected={on}
                      pressed={on}
                      disabled={shut}
                      data-cloth-pick={choice.assetId}
                      title={
                        choice.blocked ||
                        (on
                          ? `press again — this run then states no texture. ${choice.name} stays on the card`
                          : `the garment on every photograph is re-made in ${choice.name}`)
                      }
                      onClick={() => onPick(on ? 0 : choice.assetId)}
                    >
                      <span className='block max-w-full truncate'>{choice.name}</span>
                    </Chip>
                    {/* Вторая строка только у паттерна: ткань — умолчание сетки, а раппорт уезжает
                        в промпт числом («repeats every N mm»), то есть это часть заказа. */}
                    {choice.pattern && (
                      <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                        {['pattern', choice.repeatMm ? `${choice.repeatMm} mm` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    )}
                  </div>
                );
              })}

              {!disabled && (
                <div
                  className='flex min-w-0 flex-col gap-1'
                  data-cloth-add={full ? 'inert' : 'live'}
                >
                  {/* ДВЕРЬ НА ПОТОЛКЕ ГАСНЕТ, А НЕ ГЛОТАЕТ (Д-2): человек не проходит приёмную
                      модалку ради «ничего не произошло». Живая дверь — та же, что `+ texture` на
                      FABRIC RENDER: библиотека / ⌘V / бросок, и та же запись — ткань на полку. */}
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
                        // Вторая проверка потолка говорит вслух: между отрисовкой и подтверждением
                        // модалки соседняя вкладка успевает добрать потолок.
                        if (totalAssets >= ASSETS_PER_CARD_MAX) {
                          showMessage(fullReason, 'error');
                          return;
                        }
                        writes.upsertAsset.mutate({
                          // `assetId: 0` заводит. Род — утверждение этой двери: она стоит под
                          // подписью TEXTURE, значит через неё приходит ткань.
                          assetId: 0,
                          kind: ASSET_FABRIC,
                          name: nextClothName(shelf),
                          mediaId: first.id,
                        });
                      }}
                    />
                  )}
                  <Text size='nano' variant='label' component='span' className='normal-case'>
                    {full ? `${ASSETS_PER_CARD_MAX} of ${ASSETS_PER_CARD_MAX} — full` : '⌘V · drop · browse'}
                  </Text>
                </div>
              )}
            </Tiles>

            {/* ПРИЧИНА ВЫКЛЮЧЕННОЙ ПЛИТКИ — СЛОВАМИ, а не только наведением: выключенный чип из
                таба выпадает, `title` читалке не достаётся. Строка одна на всю сетку: плитка,
                совпавшая со снимком, бывает одна за раз. */}
            {blocked && (
              <Text size='micro' variant='label' component='p' className='normal-case'>
                <b>one texture is unavailable:</b> {blocked.blocked}
              </Text>
            )}
            {/* На карточке только для чтения двери нет вовсе, и без единой строки пустая сетка
                читалась бы как «блок не загрузился». Признание пустоты, а не урок (F-19). */}
            {choices.length === 0 && disabled && (
              <Text size='micro' variant='label' component='p' data-cloth-empty className='normal-case'>
                No texture on this card.
              </Text>
            )}
            {full && (
              <Text size='micro' variant='label' component='p' className='normal-case'>
                {fullReason}.
              </Text>
            )}
          </div>

          <OnModelColourTile band={band} draft={draft} disabled={disabled} />
        </div>

        {/* ОДНА СТРОКА, ГОВОРЯЩАЯ, ЧТО ИМЕННО ПРОИЗОЙДЁТ СО СНИМКОМ, — на месте снятого
            заголовка-заявления, под рядом, как «goes to the model as» у палитры. Читает ТЕЛО
            запроса (`colour`), потому что порядок старшинства назван здесь ТЕМИ ЖЕ словами, что
            в платном промпте: при названных текстуре И цвете сервер говорит модели «the colour
            stated above governs the colour of the cloth: re-tint the cloth of image 2 to it».
            Отступ — колонка подписи ряда (92px + 8px), чтобы строка читалась продолжением ряда. */}
        <div className='w-full pl-[100px]'>
          <Text
            size='micro'
            variant='label'
            component='p'
            data-cloth-says
            className='normal-case'
          >
            {clothSubtitle(chosen, colour, colors)}
          </Text>
        </div>
      </FieldRow>
    </div>
  );
}

/**
 * ПЛИТКА ЦВЕТА — ТА ЖЕ, ЧТО В ПАЛИТРЕ, БЕЗ ПОЛЯ ИМЕНИ (E-11).
 *
 * Квадрат 104px, залитый выбранным цветом; незакрашиваемое значение — ПОЛОСАТОЕ, никогда не
 * чёрное и не белое. Пикер тот же самый (`assets/colour-picker`): квадрат насыщенности, полоса
 * тона, поле hex, пипетка и плашки рецептов, которыми эта карточка уже печаталась. Второго поля
 * hex под плиткой нет намеренно: оно живёт внутри пикера, и второй вход одной величины на одном
 * экране — тот дефект, который уже стоил купленного прогона.
 *
 * ⚠ ЗАПОЛНЕННОСТЬ ЧИТАЕТСЯ ПО ЗНАЧЕНИЮ, А НЕ ПО `fabricStatement`: тот считает цвет названным и
 * при одном лишь `code`, а `code` в этот черновик ЗАСЕВАЕТСЯ прошлым рецептом и на этом экране
 * не показывается нигде (у двери на провод он стирается — `wireColour` в `./studio.tsx`). Плитка,
 * читающая `fabricStatement`, стояла бы «filled» и с кнопкой clear над пустым квадратом.
 */
function OnModelColourTile({
  band,
  draft,
  disabled,
}: {
  band: GetDesignBandResponse;
  draft: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  const hex = (draft.recipe.hex ?? '').trim();
  const paintable = hexIsPaintable(hex);

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
      data-tile-state={paintable ? 'filled' : 'empty'}
      className='flex w-[104px] shrink-0 flex-col gap-1'
    >
      <ColourPicker
        hex={hex}
        disabled={disabled}
        recent={recent}
        label='pick the colour of this run'
        /* Пикер — ТИПОВАННЫЙ вход (ранг 2): осознанное заявление, которое обязано пережить
           последующий выбор текстуры. */
        onPick={(next) => draft.typed({ hex: next })}
        /* ⚠ ПЛАШКА ПРОШЛОГО РЕЦЕПТА ВОЗВРАЩАЕТ ТОЛЬКО ЗНАЧЕНИЕ (E-11): имя на этом экране негде
           увидеть и нечем снять, а промпт процитировал бы его вслух. Измерено `qa-k2` (31). */
        onPickRecent={(next) => draft.typed({ hex: next })}
        face={
          paintable ? (
            <span
              data-colour-swatch
              aria-hidden='true'
              className='block w-full border border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              style={{ aspectRatio: TEXTURE_ASPECT, background: hex }}
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
      <div className='flex min-w-0 flex-wrap items-center gap-1'>
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {paintable ? hex : 'optional'}
        </Text>
        {!disabled && paintable && (
          <Button variant='secondary' size='xs' onClick={() => draft.clear('colour')}>
            clear
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * ОДНА СТРОКА, ГОВОРЯЩАЯ, ЧТО ИМЕННО ПРОИЗОЙДЁТ СО СНИМКОМ.
 *
 * ⚠ ПОРЯДОК СТАРШИНСТВА НАЗВАН ТЕМИ ЖЕ СЛОВАМИ, ЧТО В ПЛАТНОМ ПРОМПТЕ. Экран и промпт — одна пара
 * «состояние + текст»; разойдясь, они дали бы человеку и модели две разные инструкции об одном
 * прогоне.
 */
function clothSubtitle(
  chosen: ClothChoice | null,
  colour: common_DesignColourRecipe,
  colors: readonly common_Color[] | undefined,
): string {
  const tinted = !!(colour.code ?? '').trim() || !!(colour.hex ?? '').trim();
  // ИМЯ ТКАНИ СТОИТ В СТРОКЕ ТЕМИ ЖЕ СЛОВАМИ, ЧТО У ДЕНЕГ (`recolorShape`): «re-clothed in …».
  // Два органа, называющие один прогон разными словами, — это два утверждения, которые
  // расходятся молча; здесь они читают одно тело и говорят одной фразой.
  const cloth = chosen ? `re-clothed in ${chosen.name || 'the picked texture'}` : '';
  if (chosen && tinted) {
    return `${cloth}, re-tinted to ${(colour.code ?? '').trim() || (colour.hex ?? '').trim()}: the texture states the cloth and its print; the colour re-tints it. Nothing else in the photograph moves: the same person, pose, light and crop.`;
  }
  if (chosen) {
    return `${cloth}: its weave and print follow the folds already in the photograph. Nothing else in the frame moves.`;
  }
  if (tinted || (colour.words ?? '').trim()) {
    return `${colourSubtitle(colour, colors)}: the cloth on the photograph is kept and re-tinted, not replaced.`;
  }
  return 'nothing stated yet: pick a texture, a colour, or both.';
}
