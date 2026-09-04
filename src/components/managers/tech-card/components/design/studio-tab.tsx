import type { common_TechCard } from 'api/proto-http/admin';
import { useState, type ReactNode } from 'react';
import type { EditHistory } from 'ui/components/annotation/history';
import Text from 'ui/components/text';
import { Section, SectionStack } from 'ui/components/section';
import { ArtifactsPanel, type SheetCallout } from './artifacts-panel';
import { Bench } from './bench';
import { GenerationStudio } from './generation';
import { KindsStrip, type DesignKind } from './kinds-strip';
import { RenderStudio, ThreedStudio } from './render';
import { GenerationHistory } from './generation';
import { DesignCapabilityProvider } from './capability';
import { MoodBoard } from './mood-board';
import { OnModelStudio } from './onmodel';
import { PatternStudio } from './pattern';
import { useStudioKindSwitch } from './history-recall';
import { PictureGalleryProvider } from './picture-tile';
import { PickModeProvider, usePickMode } from './pick-mode';
import { PickTray } from './band-feed';
import { ReferencesSection } from './references-section';
import { useDesignBand } from './use-design-band';

/**
 * THE STUDIO — the composed DESIGN band, and the only place that knows the order of its organs.
 *
 * The organs themselves are written independently against frozen signatures; this file is where
 * they meet. It holds no state of its own beyond the two providers, on purpose: anything it stored
 * would become a fifth place to look for the truth about a card.
 *
 * ONE READ FEEDS ALL OF THEM. `useDesignBand` is called here, once, and the band object is passed
 * down. Organs that called it separately would each get their own cache entry and the bench could
 * disagree with the feed about which instant of the card is on screen.
 */

/**
 * The pick banner. It belongs to neither the bench (which asks) nor the feed (which answers), so it
 * lives with the composer that owns both. It promises Esc in words, and `PickModeProvider` makes
 * that true with a document-level listener — the promise and its keeper are deliberately close.
 */
function PickBanner() {
  const { target, cancel } = usePickMode();
  if (!target) return null;
  return (
    <div className='sticky top-0 z-40 flex items-center justify-between gap-4 bg-textColor px-4 py-2'>
      <Text variant='selected' size='control'>
        choosing for {target.label} — click a picture in the band below
      </Text>
      <button type='button' className='uppercase underline' onClick={cancel}>
        esc to cancel
      </button>
    </div>
  );
}

export function StudioTab({
  techCardId,
  disabled,
  constructionAspects,
}: {
  techCardId?: number;
  disabled?: boolean;
  /**
   * ═══ АСПЕКТЫ СБОРКИ, ВСТАВЛЯЕМЫЕ ПОД МУДБОРД (K-8) ═══════════════════════════════════════════
   *
   * Владелец: «помести карточку CONSTRUCTION — described aspect by aspect; prints after the
   * concept под мудборд». Сейчас она стоит НАД ним, и не по решению этого файла: конец шапки
   * карточки (`components/index.tsx`) физически предшествует началу студии, а мудборд — первый
   * орган студии. Смежность «вплотную сверху» была ровно тем, что дал V-17 прошлой волной.
   *
   * ПОЧЕМУ ПРОП, А НЕ ИМПОРТ `DetailsEditor` ЗДЕСЬ. Редактор аспектов держит СВОЁ локальное
   * состояние показанных аспектов, и два всегда-смонтированных экземпляра уже расходились им
   * (U-9). Смонтировав второй здесь, мы получили бы ту же поломку под новым именем. Значит
   * экземпляр обязан остаться ОДИН, а переехать может только его МЕСТО — и отдать его может
   * только владелец шапки. Пока он этого не сделал, слот пуст и не рисует ничего: полустрочка
   * `{constructionAspects}` ниже — это `undefined`, а не пустая секция.
   *
   * `Section`-ОБЁРТКА ЖИВЁТ ЗДЕСЬ, А НЕ У ВЫЗЫВАЮЩЕГО, и это не мелочь: порядок и материал блоков
   * полосы DESIGN — решение этого файла (он и заведён как «единственное место, которое знает
   * порядок своих органов»). Вызывающий отдаёт СОДЕРЖИМОЕ; имя печатной секции, её вопрос и белый
   * грунт под ним назначаются тут. `DetailsEditor` рисует голый div — без обёртки его карточки
   * аспектов стояли бы прямо на сером грунте страницы (DESIGN.md, Filled-Block Rule).
   */
  constructionAspects?: ReactNode;
}) {
  // ВИД — состояние студии, как `state.kind` в прототипе. Живёт здесь, у композитора: полоса
  // представлений его показывает, а экраны читают, и третьего владельца у него быть не должно.
  //
  // СТОИТ ВЫШЕ ЛЮБОГО РАННЕГО ВОЗВРАТА, и это не стиль. Ниже них он простоял ровно один прогон, и
  // этого хватило: пока полоса грузится, компонент выходит раньше и хук не исполняется, а после
  // загрузки исполняется — хуков становится БОЛЬШЕ, чем в прошлый раз. React отвечает ошибкой 310
  // и сносит ВСЁ дерево: вкладка уходит в белое целиком, потому что границы ошибок над ней нет.
  const [kind, setKind] = useState<DesignKind>('flat');
  /* РЕКОЛ ПЕРЕКЛЮЧАЕТ ВИД СТУДИИ (V-12в, владелец: «если мы нажимаем на рекол из генерации
     допустим фабрик рендера оно должно переключатся на фабрик рендер а не пихать их во флеты»).
     Владелец вида — этот композитор, и второго источника правды заводить нельзя; поэтому наружу
     отдаётся не копия состояния, а ссылка на владельца. Без этой строки жест не врёт, а честно
     говорит «откройте вкладку сами» — но говорить это владельцу, который попросил обратного,
     было бы отказом, а не решением. */
  useStudioKindSwitch(techCardId ?? 0, kind, setKind);
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);
  /* ═══ КОЛОРВЕЯ У СТУДИИ БОЛЬШЕ НЕТ — E-1 + E-16 ═══════════════════════════════════════════
     Владелец: «в MAKE A PATTERN оставь только имя убери колорвей» и «в GENERATION — FABRIC RENDER
     мы полностью убираем колорвеи только имена остаются».

     ЗДЕСЬ СТОЯЛ `useColorwayChoice` — ВТОРОЕ СОСТОЯНИЕ СТУДИИ, — и снят он ЦЕЛИКОМ, а не заглушен
     в экранах. Довод не в чистоте: у хука было УМОЛЧАНИЕ («первый колорвей, у которого уже есть
     рендеры»), то есть студия открывалась на ИМЕНОВАННОМ верстаке сама. Сними органы, оставив
     хук, — и осталось бы невидимое состояние, которое никто не может ни увидеть, ни переключить:
     FABRIC RENDER писал бы слоты в верстак ROSSO, 3D читало бы его же, а человек не знал бы, что
     работает не на том, где лежит вся его история.

     ⚠ ОСЬ ПРИ ЭТОМ ЖИВА НА ПРОВОДЕ И В БАЗЕ. Теперь ВСЯ студия адресует безколорвейный верстак —
     `0`, законное и вечное значение, на котором стоит каждый рендер, сделанный до появления оси.
     Вход и прогон согласны ПО ПОСТРОЕНИЮ: одно число, потому что числа больше нет вовсе. */

  // A card that has not been created yet has no band and cannot have one: every write below is
  // keyed by tech_card_id. Saying so is more useful than rendering seven empty organs.
  if (!techCardId) {
    return (
      <SectionStack>
        <Section title='studio' question='— what this style looks like, before it is frozen'>
          <Text variant='inactive' size='control'>
            Save this tech card first. The studio hangs off the card, so there is nothing to hang it
            on yet.
          </Text>
        </Section>
      </SectionStack>
    );
  }

  if (isLoading) {
    return (
      <SectionStack>
        <Section title='studio'>
          <Text variant='inactive' size='control'>
            loading…
          </Text>
        </Section>
      </SectionStack>
    );
  }

  const readOnly = !!disabled;

  // WHAT SURVIVES A SERVER THAT DOES NOT SPEAK THE BAND.
  //
  // The moodboard, the kinds strip and the description are fields of the tech card form: they save
  // through the ordinary UpdateTechCard and touch not one design RPC. Hiding them behind the band
  // read — which is what an early return here would do — would mean that on a contour whose binary
  // predates the band, the studio is empty AND the old moodboard tab is folded away, i.e. the human
  // loses a screen that works. The band's own organs degrade; these three do not.
  const bandless = !serverSpeaks;

  return (
    <DesignCapabilityProvider value={!bandless}>
      {/* ОДИН ПРОСМОТРЩИК НА ВСЮ СТУДИЮ, и он монтируется ЗДЕСЬ, потому что это единственное
          место, откуда видны сразу все органы полосы: референсы, история прогонов, верстак.
          Владелец (круг 4, пункт 8): «что бы можно было в зум вью по всем картинкам из всех
          генераций итерироваться не только этой».

          До этого в полосе жило ПЯТЬ отдельных `MediaViewer`, и каждый получал свой список — тот,
          что в истории, получал список ОДНОГО прогона. Стрелка «дальше» упиралась в край прогона
          не по решению, а потому что дальше ничего не было передано. Ряд собирают сами плитки
          (`PictureTile`), а порядок берётся из документа, поэтому листается ровно то, что видно. */}
      <PictureGalleryProvider techCardId={techCardId} band={band}>
      <PickModeProvider>
        {/* `FixContextProvider` здесь БОЛЬШЕ НЕ МОНТИРУЕТСЯ: цикл починки снят (S-15), взводить
            контекст стало некому. Сам `fix-context.tsx` жив — `generation-form` читает
            `useFixContext` и получает инертный дефолт («no fix armed»), что и задумано его же
            шапкой как отказоустойчивая поза вне провайдера. */}
        <PickBanner />
        <SectionStack>
          {/* ПОРЯДОК — ПРОТОТИПА, И СВЕРЕН СО СБОРЩИКОМ (`proto.html:3875-3893`), А НЕ С ПАМЯТЬЮ:
                topRow → moodboard → kinds → references → ГЕНЕРАЦИЯ → SLOTS → concept.
              Шапка карточки (`topRowHtml`) стоит выше, в `index.tsx`: она первый ряд СТУДИИ.
              Генерация — это форма запуска, история прогонов и пустое состояние, и собирает их
              `GenerationStudio` по правилу самого прототипа (`briefContent`).
              Полоса листа и предупреждение о смеси — части блока слотов (`slotsHtml` зовёт
              `sheetbarHtml` и `mixwarnHtml` в своей шапке), поэтому стоят вплотную над верстаком.
              Верстак ПОСЛЕДНИЙ: сначала материал, потом сборка. Описание — после всего, оно
              пишется по тому, что выше.
              КОЛОНКИ UPLOADS ЗДЕСЬ БОЛЬШЕ НЕТ — снесена решением владельца (R-18). Прототип её
              ещё несёт; расхождение сознательное и записано в описи `qa-parity.mjs`. Принесённое
              руками входит через слот «+ reference» блока INPUT и через «+ add …» пустых слотов
              верстака; кадры сплита приезжают во вход уже с ролью вида (R-17), поэтому полки им
              не нужно. Единственная роль полки, которую больше некому играть, — отвечать режиму
              выбора за пачечные картинки — живёт в `PickTray` над верстаком. */}
          <MoodBoard techCardId={techCardId} disabled={readOnly} />
          {/* CONSTRUCTION — СРАЗУ ПОД МУДБОРДОМ (K-8, довод у пропа `constructionAspects`).
              Порядок читается как рассказ: сначала чем стиль выглядит, потом чем он собран.
              Слот пуст, пока `components/index.tsx` не отдаст сюда свой единственный
              `DetailsEditor`; пустой он не рисует ни секции, ни отступа. */}
          {constructionAspects && (
            <Section
              title='construction'
              question='— described aspect by aspect; prints after the concept'
            >
              {constructionAspects}
            </Section>
          )}
          <KindsStrip band={band} kind={kind} onKindChange={setKind} />
          {bandless ? (
            <Section title='bench' question='— the flats this style is drawn from'>
              <Text variant='inactive' size='control'>
                {error
                  ? `The bench could not be read: ${error.message}`
                  : 'This server does not serve the design band yet, so the bench and the ' +
                    'reference roles are not available here. The moodboard and the description ' +
                    'above save normally.'}
              </Text>
            </Section>
          ) : (
            <>
              {/* ВХОДНАЯ СЕКЦИЯ ПЕРЕКЛЮЧАЕТСЯ ВМЕСТЕ С ВИДОМ — это правило самого прототипа
                  (`proto.html:3891`, «референсы рисуются только у FLAT; в render и 3D они в одном
                  клике, не на экране»): у рендера вход — слоты верстака, у 3D — рендеры. */}
              {kind === 'flat' && (
                <>
                  {/* ЯКОРЬ #design-input — снаружи, а не внутри блока: файл референсов чужой
                      (дорожка E2), а на якорь смотрят двери «+ add files» пустой студии и свёрнутой
                      формы генерации, которые до сноса полки вели на #design-uploads. Обёртка —
                      законный ребёнок SectionStack: это flex с gap, и div наследует ритм 24px. */}
                  <div id='design-input'>
                    <ReferencesSection techCardId={techCardId} band={band} disabled={readOnly} />
                  </div>
                  {/* Чип `fix: …` стоял здесь, над формой. Ушёл вместе с циклом починки (S-15):
                      взводить заявку больше нечем, а чип без писателя — орган, который не может
                      загореться никогда. */}
                  <GenerationStudio band={band} techCardId={techCardId} disabled={readOnly} />
                </>
              )}
              {/* ═══ PATTERN — ТРЕТИЙ ГЕНЕРАТИВНЫЙ ЭКРАН, ПО ТОЙ ЖЕ СБОРКЕ (K-13) ═════════════
                  Экран плюс ОБЩАЯ история прогонов — ровно как у рендера и 3D ниже, и не ради
                  симметрии: `GenerationHistory` монтирует `useRunPolling`, то есть это ЕДИНСТВЕННОЕ
                  место полосы, откуда перечитывается живой прогон. Вид без неё показывал бы
                  «making a tile…» вечно — до тех пор, пока человек не тронет карточку сам.
                  Лента при этом одна на карточку и показывает все рода: прогон-плитка стоит в ней
                  теми же деньгами и тем же временем, что рендер, и заводить ей вторую историю
                  значило бы завести второй ответ на вопрос «во что обошлась эта карточка». */}
              {kind === 'pattern' && (
                <>
                  {/* ПАТТЕРН НЕ ПОКАЗЫВАЕТ ПИКЕРА И РЕМОУНТА НЕ ТРЕБУЕТ, и довод переписан УЖЕ
                      ДВАЖДЫ — оба раза потому, что переживал свою причину. Сегодня он такой:
                      колорвеи нет НИ НА ОДНОМ из этих экранов (E-1, E-16 круга 16), прогон шлёт
                      ноль, и плитка ложится на полку карточки ничьей. Ось при этом жива на
                      проводе и в базе — снят только орган выбора. */}
                  <PatternStudio band={band} techCardId={techCardId} disabled={readOnly} />
                  {/* ЛЕНТА ОТКРЫВАЕТСЯ НА СВОЁМ РОДЕ, А НЕ НА «ALL» (J-12). Переключатель при этом
                      остаётся — владелец просил «с возможностью переключить», — и `defaultRep`
                      это именно НАЧАЛЬНОЕ положение, к которому лента возвращается при смене
                      карточки, а не запрет. */}
                  {/* ═══ И ЗАКРЫТОЙ (E-21) ═══════════════════════════════════════════════════
                      Владелец: «в PATTERN GENERATION HISTORY по дефолту заколапшена».
                      Довод общий для четырёх вкладок и записан один раз — у пропа `defaultOpen`
                      в `generation-history.tsx`: над лентой здесь стоит `PATTERNS OF THIS CARD`,
                      то есть те же плитки крупнее и ближе к работе. Свёрнута только ЧАСТЬ БЛОКА:
                      опрос живого прогона идёт, и шапка продолжает называть его. */}
                  <GenerationHistory
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    defaultRep='pattern'
                    defaultOpen={false}
                  />
                </>
              )}
              {/* У РЕНДЕРА И 3D СВОЙ ЭКРАН И ТА ЖЕ ИСТОРИЯ ПРОГОНОВ: прототип собирает их как
                  `studioRenderHtml() + generationHistoryHtml() + slotsHtml()`. Полки загрузок в
                  этих видах нет — принесённый руками файл кладут во флэт. */}
              {kind === 'render' && (
                <>
                  {/* ЗДЕСЬ СТОЯЛ `key={colorwayId}` — РЕМОУНТ ПРИ СМЕНЕ КОЛОРВЕИ, чтобы черновик
                      рецепта не показал под новым именем рецепт предыдущего и не был за него
                      оплачен. Переключать больше нечего: пикер снят (E-16), студия всегда стоит
                      на нулевом верстаке, и ремоунт сторожил бы событие, которого не бывает. */}
                  <RenderStudio
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    onGoToKind={setKind}
                  />
                  {/* J-18: «в GENERATION HISTORY по дефолту должен быть фильтр по фабрик
                      рендерам с возможностью переключить».
                      E-22: «в FABRIC RENDER GENERATION HISTORY по дефолту заколапшена» — над ней
                      стоит `RENDERS OF THIS CARD`. */}
                  <GenerationHistory
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    defaultRep='render'
                    defaultOpen={false}
                  />
                </>
              )}
              {kind === 'threed' && (
                <>
                  {/* ⚠ `colorway` СНЯТ И ЗДЕСЬ, ХОТЯ ВЛАДЕЛЕЦ 3D НЕ НАЗЫВАЛ. Это не расширение
                      его слова, а его СЛЕДСТВИЕ: 3D строится из рендер-верстака ВЫБРАННОГО цвета
                      (`threedSides`), а заполняет этот верстак FABRIC RENDER — и он теперь пишет
                      только безколорвейный. Оставь здесь прежнее умолчание, и вход 3D показывал бы
                      «0 of 4» на карточке с четырьмя готовыми рендерами. Проп необязателен, и его
                      отсутствие читается ровно как `colorwayId = 0`. */}
                  <ThreedStudio
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    onGoToKind={setKind}
                  />
                  {/* E-23: «в 3D GENERATION HISTORY по дефолту заколапшена и также в on model».
                      Над ней стоит `3D MODELS OF THIS CARD`. */}
                  <GenerationHistory
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    defaultRep='threed'
                    defaultOpen={false}
                  />
                </>
              )}
              {/* ═══ ON MODEL — ПЕРЕКРАС ФОТОГРАФИИ НА ЖИВОМ ЧЕЛОВЕКЕ (K-17) ══════════════════
                  Ячейка полосы была МЁРТВОЙ и объясняла, почему такого экрана нет; теперь он есть,
                  и объяснение снято вместе с механизмом (см. `kinds-strip.tsx`).
                  История — та же и по той же причине, что у трёх соседей выше: без неё
                  `useRunPolling` не смонтирован, и перекрас показывал бы `pending` бесконечно. */}
              {kind === 'onmodel' && (
                <>
                  <OnModelStudio band={band} techCardId={techCardId} disabled={readOnly} />
                  {/* J-31: «GENERATION HISTORY в этой вкладке по дефолту сортирует в on model».
                      E-23, вторая половина: «и также в on model» — над ней стоит
                      `ON-MODEL PICTURES OF THIS CARD`. */}
                  <GenerationHistory
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    defaultRep='onmodel'
                    defaultOpen={false}
                  />
                </>
              )}
              {/* ПОЛОСА ЛИСТА И ПРЕДУПРЕЖДЕНИЕ О СМЕСИ БОЛЬШЕ НЕ СТОЯТ ЗДЕСЬ. Это строки ШАПКИ
                  блока слотов (`slotsHtml` зовёт `sheetbarHtml` и `mixwarnHtml` внутри себя), и
                  тремя отдельными блоками они читались как три равновесных заявления, хотя два из
                  них — про третье. Монтирует их теперь `Bench`. */}
              {/* ⚠ ЛОТОК ВЫБОРА СМОНТИРОВАН, НО ВЗВЕСТИ ЕГО БОЛЬШЕ НЕЧЕМ — сказать это прямо честнее,
                  чем оставить прежнее объяснение. J-15 снял все три двери `pick.start` (стороны,
                  детали, ячейка минта), и других вызывающих у режима нет: `PickTray` теперь всегда
                  рисует null, а `PickModeProvider` держит только свой Esc.

                  ПОЧЕМУ ОРГАН ВСЁ РАВНО ЗДЕСЬ: снос `pick-mode.tsx` целиком — отдельный след, и
                  он про Esc-обработчик, а не про эту волну. Оставлено ПОД ГЕЙТОМ FLAT вместе с
                  верстаком, чтобы мёртвый орган хотя бы не монтировался на четырёх чужих вкладках.

                  Жест «картинка полосы → слот» при этом ЖИВ и идёт встречным направлением: пикер
                  «— slot —» под плиткой (`slot-picker.tsx`) пишет `SetDesignBenchSlot` напрямую,
                  минуя режим выбора вовсе. */}
              {/* ═══ СЕКЦИЯ ASSETS СНЯТА С ЭКРАНА ЦЕЛИКОМ (Y-11) ═══════════════════════════════
                  Владелец, дословно: «ASSETS в студио давай пока полностью выпилим». Слово «пока»
                  здесь несущее: снимается ЭКРАН, а не подсистема. Серверные ручки
                  (`UpsertDesignAsset`, `DeleteDesignAsset`, обе про метки) и поля полосы
                  (`band.assets`, `band.assetPlacements`) стоят нетронутыми на СЕРВЕРЕ, и карточки,
                  у которых ассеты уже заведены, читаются как читались.
                  ЕДИНСТВЕННЫЙ ЧИТАТЕЛЬ, КОТОРЫЙ ОТ ЭТОГО МОГ ОСИРОТЕТЬ, — ряд CLOTHS в FABRIC
                  RENDER: он берёт ткани с полки, а заводила их только эта секция. Поэтому дверь
                  загрузки фактуры не исчезла, а ПЕРЕЕХАЛА в «input — flats of this card» (Y-12),
                  и цепочка «загрузили → chip в CLOTHS → `params.colour.fabrics`» осталась целой.
                  ЧЕГО БОЛЬШЕ НЕТ НИГДЕ: разметка тканей на флэтах (`assetPlacement`) и полка
                  фурнитуры. ⚠ КРУГ 15 (J-21) ДОВЁЛ ПЕРВОЕ ДО КОНЦА: клиент больше не ЧИТАЕТ метки
                  вовсе — `parts` уезжает пустым, и промпт рендера перестал сужаться разметкой,
                  которой ни один экран не показывает. Таблица и ручки сервера живы; удаление
                  данных — отдельное решение владельца.
                  Полка паттернов при этом ВЕРНУЛАСЬ и живёт на вкладке PATTERN
                  (`patterns of this card`), где ей и место. */}
              {/* ═══ ВЕРСТАК СТОИТ ТОЛЬКО НА FLAT — ОДНА СТРОКА, ТРИ ПУНКТА ВЛАДЕЛЬЦА ══════════
                  J-14 («во вкладке паттернс мы не должны показывать FLAT SLOTS в принципе»),
                  J-18 («во вкладке FABRIC RENDER нам не нужен FLAT SLOTS») и J-30 («в 3Д вкладке
                  не должно показывать FLAT SLOTS так же и во вкладке ON MODEL») — это ОДИН орган,
                  смонтированный СНАРУЖИ переключателя вида, и потому видимый на всех пяти.
                  Плоские слоты — вход ФЛЭТА: лист и тех-пак читают их, а рендер, паттерн, 3D и
                  перекраска берут вход из своих собственных полос («input — flats of this card»,
                  «input — renders by view»). Гейт стоит ЗДЕСЬ, а не внутри `Bench`, потому что род
                  знает композитор — сам верстак читает ровно одну полосу и про вкладку не знает.

                  `RecallBenchIntake` (в `generation-history.tsx`) пишет слоты ЧЕРЕЗ API, а не
                  через этот орган, поэтому рекол на вкладке рендера не задет. */}
              {kind === 'flat' && (
                <>
                  <PickTray band={band} />
                  <Bench techCardId={techCardId} band={band} disabled={readOnly} />
                </>
              )}
            </>
          )}
        </SectionStack>
      </PickModeProvider>
      </PictureGalleryProvider>
    </DesignCapabilityProvider>
  );
}

/**
 * ARTIFACTS is a second root over the SAME band read, not a second band. It is kept in this file so
 * that the two tabs cannot drift into calling different reads — the failure that would produce is
 * two tabs of one card showing different plates and different marks for the same picture.
 *
 * IT ALSO CARRIES THE DRAWING EDITOR, and the two props below are the whole of what that needs. The
 * editor is mounted over ARTIFACTS rather than in the studio because `mood-callouts.tsx` holds the
 * studio's single `useFieldArray` over `callouts` and the editor holds one of its own — and in
 * react-hook-form 7.62 two instances over one name do not synchronise. This tab holds none.
 *
 * ⚠ РИСОВАНИЕ БОЛЬШЕ НЕ ЖИВЁТ В МОДАЛКЕ. T-21 круга 4, владелец дословно: «для выставления
 * колаутов не нужна модалка оно должно быть инлайн и высота картинок должна быть больше».
 * Выноски ставятся прямо на плите панели, кадры выросли, а составная дверь «take in + draw ▸»
 * стала однотактной. Довод про два `useFieldArray` при этом НЕ УСТАРЕЛ и остаётся причиной, по
 * которой редактор живёт здесь, а не в студии: он про владение полем формы, а не про модалку.
 */
export function ArtifactsTab({
  techCardId,
  disabled,
  techCard,
  calloutHistory,
}: {
  techCardId?: number;
  disabled?: boolean;
  /** The loaded card: the editor resolves a `media_id` to a picture through it. */
  techCard?: common_TechCard;
  /**
   * The form's ONE undo history over `callouts`. It belongs to the page because the page is what
   * resets it when the form is re-seeded from the server; a history minted down here would outlive
   * that reset and hand back callouts the card no longer holds.
   */
  calloutHistory?: EditHistory<SheetCallout>;
}) {
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);

  if (!techCardId) {
    return (
      <SectionStack>
        {/* НИ «ВЕРСИЙ», НИ «МИНТА»: подсистема версий листа снята целиком (V-22), и обещать их с
            пустого экрана значило бы звать человека к органу, которого нет. Ждёт эта заглушка
            ровно одного — сохранённой карточки: пластины живут в её медиа, а у несохранённой
            карточки медиа некуда положить. */}
        <Section title='artifacts' question='— the pictures of this card, and the sheet the factory prints'>
          <Text variant='inactive' size='control'>
            Save this tech card first — pictures are kept on a card that exists.
          </Text>
        </Section>
      </SectionStack>
    );
  }

  if (isLoading) {
    return (
      <SectionStack>
        <Section title='artifacts'>
          <Text variant='inactive' size='control'>
            loading…
          </Text>
        </Section>
      </SectionStack>
    );
  }

  // Same rule as the studio: the LIVE DOCUMENT — the card's plates and their callouts — is form
  // data and needs no design RPC at all. Only the generated pictures and the shelves of assets do.
  // So the panel is mounted either way and is told, once, whether the band answered; refusing to
  // mount it would take the callout editor away from every card on a contour without the band.
  return (
    <DesignCapabilityProvider value={serverSpeaks}>
      <ArtifactsPanel
        techCardId={techCardId}
        band={band}
        disabled={!!disabled}
        techCard={techCard}
        calloutHistory={calloutHistory}
      />
    </DesignCapabilityProvider>
  );
}
