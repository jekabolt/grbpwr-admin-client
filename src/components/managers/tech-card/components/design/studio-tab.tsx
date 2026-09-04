import type { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { SECTION } from 'constants/routes';
import { useState, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { EditHistory } from 'ui/components/annotation/history';
import Text from 'ui/components/text';
import { Section, SectionStack } from 'ui/components/section';
import { ConstructionBomTable } from '../construction-bom-table';
import { ConstructionCalloutTable } from '../construction-callout-table';
import { ConstructionGeneralInfo } from '../construction-general-info';
import type { TechCardFormData } from '../schema';
import { ArtifactsPanel, type SheetCallout } from './artifacts-panel';
import { Bench } from './bench';
import { ColorwaySelect, useColorwayChoice } from './colorway-picker';
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
  navTo,
}: {
  techCardId?: number;
  disabled?: boolean;
  /**
   * ПЕРЕХОД НА СОСЕДНЮЮ ВКЛАДКУ — ЧУЖОЙ ПИСАТЕЛЬ, А НЕ СВОЙ.
   *
   * ⚠ ЗДЕСЬ СТОЯЛА ЗАПИСКА О СОБСТВЕННОЙ КОПИИ `navTo`, КОТОРУЮ ЯКОБЫ СНЕСЛИ ОТСЮДА. КОПИИ НЕ
   * БЫЛО НИ В ОДНОМ ВЫПУЩЕННОМ ДЕРЕВЕ: на предыдущем коммите (`a9470fe7`) этот файл не упоминает
   * ни `useSearchParams`, ни `goTab`, ни самого пропа — вкладка CONSTRUCTION приехала в студию
   * ЭТИМ коммитом, вместе с `navTo` сразу пропом. Записка описывала ход мысли, а не историю
   * файла, и читалась как замер.
   *
   * ПРАВИЛО ПРИ ЭТОМ ЖИВОЕ, И РАДИ НЕГО АБЗАЦ ОСТАЁТСЯ. Писатель `?tab=` ровно один и живёт у
   * владельца адреса (`components/index.tsx:453`), читатель у него тоже один — тот же файл берёт
   * оттуда активную вкладку. Заведи студия своё чтение `useSearchParams`, и писателей стало бы
   * два: первая же правка правила («не ронять ещё и `?bom=`», «пушить, а не replace») попала бы в
   * одного из двух, и вкладка вела бы себя по-разному в зависимости от того, какая кнопка её
   * открыла, — расхождение, которого не видно ни в типах, ни в сборке.
   *
   * Проп ОБЯЗАТЕЛЕН, а не «не задан — двери нет»: две двери отсюда («связать материал ›» в
   * спецификации и размерный ряд в общих сведениях) — это работа, а не украшение, и композитор,
   * смонтированный без адресата, обязан не собраться, а не тихо потерять их.
   */
  navTo: (tab: string, extra?: Record<string, string>) => void;
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

  /* ═══ ЧТО НУЖНО БЛОКАМ CONSTRUCTION, И ПОЧЕМУ ОНО ЧИТАЕТСЯ ЗДЕСЬ ══════════════════════════════
     ВСЕ ЧЕТЫРЕ ХУКА СТОЯТ ВЫШЕ РАННИХ ВОЗВРАТОВ (их два: «карточка ещё не создана» и «полоса
     грузится»). Ниже них число хуков зависело бы от загрузки — React отвечает ошибкой 310 и
     сносит вкладку в белое целиком; ровно этот довод записан у `useState` выше, и он тот же.

     СОСТОЯНИЕ НЕ ПЕРЕЕЗЖАЕТ ВМЕСТЕ С БЛОКАМИ, И ЭТО ГЛАВНОЕ. Все поля, которые они правят
     (`fit`, `categoryId`, `sizeIds`, `details[]`, `callouts[]`, `bomItems[]`), живут в ОДНОЙ форме
     тех-карты и берутся через `useFormContext`. Переезд — это смена места монтажа, а не второй
     путь к данным: ни один проп ниже не заводит копию состояния.

     ЧИТАЮЩИЙ СНИМОК КАРТОЧКИ — попадание в кэш: `index.tsx` держит тот же `useTechCard(numId)`
     под тем же ключом. Спецификации он нужен ради колорвейных рецептов (столбец «est usage»),
     которых в форме нет: их правят на вкладке колорвеев. */
  const { data: techCard } = useTechCard(techCardId);
  const { control } = useFormContext<TechCardFormData>();
  const purpose = useWatch({ control, name: 'purpose' }) as string | undefined;
  const isAux = purpose === 'TECH_CARD_PURPOSE_AUXILIARY';
  const { canWrite } = usePermissions();
  const canWriteCard = canWrite(SECTION.techCards);

  /* ═══ ЧЕЙ ЭТО РЕНДЕР — ОДНО ЧИСЛО НА ВСЮ СТУДИЮ, И ОНО ВЕРНУЛОСЬ (круг 19, C1) ═══════════════
     Владелец, круг 19: «колорвеи для рендеров … как пробрасывать паттерны … как сохранять».

     ⚠ КРУГ 16 СНЯЛ ЭТОТ ЖЕ ХУК ЕГО ЖЕ РУКАМИ (E-1 + E-16: «в MAKE A PATTERN оставь только имя
     убери колорвей», «в GENERATION — FABRIC RENDER мы полностью убираем колорвеи только имена
     остаются»), и два приказа мирятся ровно одним способом: ВОЗВРАЩАЕТСЯ ОСЬ, А НЕ ОРГАНЫ.
     Восстановленный орган отвечает на ОДИН вопрос — ЧЕЙ ЭТО РЕНДЕР — и ни на один больше. Ничего
     из выброшенного кругом 16 назад не едет: ряда колорвея на MAKE A PATTERN нет (прогон-плитка
     по-прежнему шлёт `colorway_id: 0`), чипов «worn by ROSSO» нет, засева тканью по ссылке
     `design_asset.colorway_id` нет, а имя цвета в рецепте остаётся СВОБОДНЫМ («только имена
     остаются»), а не артикульным жетоном. Второй сущности «рендерный колорвей» тоже нет: ось —
     это продуктовый колорвей карточки, тот самый, которым уже ключуются верстак, ворота 3D и
     история.

     ПОЧЕМУ ВЛАДЕЛЕЦ ХУКА — КОМПОЗИТОР, А НЕ ЭКРАН. Довод тот же, что у `kind`, и он записан в
     шапке самого хука: «ОДНО СОСТОЯНИЕ НА ВСЮ СТУДИЮ, И ЖИВЁТ ОНО У КОМПОЗИТОРА». Верстак
     рендеров ПИШЕТ FABRIC RENDER, ЧИТАЕТ 3D, а СЕРВЕР по нему собирает (`designSelectBench`);
     заведи второго владельца — и полоса входа 3D показывала бы ROSSO, пока прогон уезжает за
     OLIVE. Ровно поэтому число раздаётся вниз ПРОПОМ, а экраны его не выбирают. */
  const colorway = useColorwayChoice(techCardId, band);

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
          {/* ═══ CONSTRUCTION — СРАЗУ ПОД МУДБОРДОМ (K-8, довод у пропа `constructionAspects`) ═══
              Порядок читается как рассказ: сначала чем стиль выглядит, потом чем он собран.

              КРУГ 20, ПУНКТЫ 5-8. Владелец назвал цель ЦИТАТОЙ ЗАГОЛОВКА И ПОДЗАГОЛОВКА —
              «в CONSTRUCTION — described aspect by aspect; prints after the concept», то есть
              именно эту секцию СТУДИИ, а не одноимённую вкладку. Прошлая сессия собрала три блока
              (общие сведения, таблица указаний, спецификация) и смонтировала их на ВКЛАДКЕ
              CONSTRUCTION; здесь они переезжают на названное место, а со вкладки сняты. Монтаж
              ОДИН на каждый блок: два всегда-смонтированных писателя над одной формой — это
              дефект U-9 под новым именем.

              ЧЕТЫРЕ БЛОКА, А НЕ ОДИН С ЧЕТЫРЬМЯ ЯРУСАМИ ВНУТРИ. `Section` запрещает коробку в
              коробке дословно («A block NEVER contains another block», ui/components/section.tsx),
              а `ConstructionCalloutTable` и `ConstructionBomTable` рисуют СВОЙ `Section` каждая.
              Значит порядок владельца («общие сведения → аспекты → указания → спецификация»)
              выражается соседством в `SectionStack`, а не вложением: четыре блока подряд, между
              первым и третьим стоят аспекты — ровно то, что просит пункт 6.

              Слот аспектов по-прежнему может быть пуст (`components/index.tsx` отдаёт сюда свой
              единственный `DetailsEditor`); пустой он не рисует ни секции, ни отступа, а соседи
              рисуются в любом случае: общие сведения и спецификация — это поля формы, а не
              содержимое слота. */}
          <Section
            title='general information'
            question='— what this style is, before how it is made'
          >
            <ConstructionGeneralInfo
              isAux={isAux}
              readOnly={readOnly || !canWriteCard}
              onGoTab={navTo}
            />
          </Section>
          {constructionAspects && (
            <Section
              title='construction'
              question='— described aspect by aspect; prints after the concept'
            >
              {constructionAspects}
            </Section>
          )}
          <ConstructionCalloutTable frozen={readOnly} />
          <ConstructionBomTable techCard={techCard} canWrite={canWriteCard} onGoTab={navTo} />
          {/* ═══ ФИЛЬТР «ЧЕЙ ЭТО РЕНДЕР» — В РЯДУ ПРЕДСТАВЛЕНИЙ, НА ТРЁХ ВИДАХ ИЗ ПЯТИ ══════════
              ГЕЙТ — ЭТО ДВА РАЗНЫХ «НЕТ», И ОБА НАЗВАНЫ:
                · `flat` — у листа оси НЕТ ПО ПРИРОДЕ: чертёж один на все цвета, и колорвейного
                  верстака у флэтов не существует ни в базе, ни в контракте;
                · `pattern` — E-1, слово владельца круга 16 («в MAKE A PATTERN оставь только имя
                  убери колорвей»). Плитка ложится на полку карточки ничьей, прогон шлёт `0`, и
                  вернуть сюда селект значило бы отменить прямой приказ ради симметрии ряда.
              На остальных трёх орган стоит, потому что все трое ключуются ЭТИМ числом: рендер
              ПИШЕТ верстак, 3D его ЧИТАЕТ, перекрас родит картинки этого же колорвея.

              ПОЛОСА БЕЗ ПОЛОСЫ: `bandless` (сервер не умеет полосу) орган не рисует — читать
              `renderBenchColorwayIds` не у кого, а селект без точек и без верстака предлагал бы
              выбор, за которым ничего нет. */}
          <KindsStrip
            band={band}
            kind={kind}
            onKindChange={setKind}
            action={
              !bandless && (kind === 'render' || kind === 'threed' || kind === 'onmodel') ? (
                <ColorwaySelect band={band} choice={colorway} disabled={readOnly} />
              ) : null
            }
          />
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
                      ТРИЖДЫ — каждый раз потому, что переживал свою причину. Сегодня он такой, и
                      он ОДИН, а не «как у соседей»: круг 19 вернул ось на render / 3D / on-model,
                      а сюда НЕ вернул — E-1 стоит дословно («в MAKE A PATTERN оставь только имя
                      убери колорвей»). Прогон-плитка шлёт ноль, плитка ложится на полку карточки
                      ничьей, и это правильно: набивка — материал КАРТОЧКИ, её кладут на любой
                      колорвей на экране рендера. Ремоунт сторожил бы засев, которого тут нет. */}
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
                  {/* ═══ `key` — РЕМОУНТ ПРИ СМЕНЕ КОЛОРВЕИ, И ОН ВЕРНУЛСЯ ВМЕСТЕ С ОСЬЮ ══════
                      Круг 16 снял эту строку вместе с пикером: сторожить было нечего, потому что
                      переключать было нечего. Круг 19 вернул переключатель — значит вернулось и
                      событие, ради которого строка писалась.

                      ЧТО ИМЕННО ОНА СТОРОЖИТ, ТОЧНО: `useColourDraft` засевает рецепт ОДИН РАЗ ЗА
                      МОНТАЖ (`seeded`/`touched` — рефы), и это правило верное само по себе: рефетч
                      полосы иначе затирал бы наполовину сделанный выбор. Но «однажды за монтаж» и
                      «заново при смене цвета» — два РАЗНЫХ правила, и сложить их в одно условие
                      значило бы отменить первое. Без ремоунта экран под именем OLIVE показывал бы
                      рецепт ROSSO — и человек платил бы за него, читая чужое имя над кнопкой.

                      ⚠ ЭТО НЕ МАСКА НАД ПРОТУХШИМ КЭШЕМ, И ЭТО ПРОВЕРЕНО, А НЕ ПРИНЯТО НА ВЕРУ.
                      Кэшу здесь протухать негде: `useDesignBand` читается ОДИН РАЗ на всю студию и
                      ключуется карточкой, а не колорвеем; полоса приходит вниз пропом; всё
                      сужение по колорвею — чистые селекторы над этим объектом (`threedSides`,
                      `outputsOfKind`, `renderBenchOccupied`), которые пересчитываются от смены
                      аргумента сами. Единственное, что смену НЕ ПЕРЕЖИВАЕТ, — время жизни рефа
                      засева, а оно и есть монтаж.

                      ⚠ И ОН ТУПОЙ, НАЗЫВАЕМ ВСЛУХ: неотправленный рецепт ROSSO теряется, если
                      просто заглянуть в OLIVE. Это цена, а не дефект — за неё платят однажды и
                      видимо; замена (карта черновиков по колорвею внутри `useColourDraft`) —
                      удобство, и заводить его до того, как владелец переключателем попользовался,
                      значило бы усложнить механизм под догадку. */}
                  {/* ⚠ `colorwayArchived` — ОДИН ПРЕДИКАТ АРХИВА НА ВСЮ СТУДИЮ, ПОСЧИТАННЫЙ ХУКОМ
                      (`useColorwayChoice`), и три генеративных экрана получают ТОТ ЖЕ булев, что
                      рисует подпись `(archived)` в селекте. Поэтому подсказка органа и отказ двери
                      разойтись не могут — а до этой волны они и расходились: подсказка обещала
                      запрет, которого ворота не знали. Считать статус в трёх экранах заново значило
                      бы завести три места, где эта пара снова разъедется. */}
                  <RenderStudio
                    key={colorway.colorwayId}
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    onGoToKind={setKind}
                    colorwayId={colorway.colorwayId}
                    colorwayRef={colorway.current}
                    colorwayLabel={colorway.label}
                    colorwayArchived={colorway.archived}
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
                  {/* ⚠ 3D ПОЛУЧАЕТ ТО ЖЕ ЧИСЛО И ПО ТОЙ ЖЕ ПРИЧИНЕ, ПО КОТОРОЙ ЕГО У НЕГО ЗАБРАЛИ.
                      Круг 16: «оставь здесь прежнее умолчание, и вход 3D показывал бы 0 of 4 на
                      карточке с четырьмя готовыми рендерами» — верно ровно потому, что FABRIC
                      RENDER писал тогда ТОЛЬКО нулевой верстак. Теперь он пишет ТОТ, ЧТО НАЗВАН
                      сверху, и 3D обязано читать ТОТ ЖЕ: одно число на писателя и на читателя.

                      РЕМОУНТА ЗДЕСЬ НЕТ, И ЭТО НЕ ЗАБЫТАЯ СТРОКА. Черновик 3D — подача, модель,
                      тело, размер — НЕ ЦВЕТ: он про то, как вещь стоит в кадре, и обязан пережить
                      смену колорвея, а не быть за неё стёртым. Всё, что от колорвея зависит
                      (`threedSides`, ворота двери, тело прогона), — селекторы над полосой и
                      пересчитываются от смены пропа сами. */}
                  <ThreedStudio
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    onGoToKind={setKind}
                    colorwayId={colorway.colorwayId}
                    colorwayLabel={colorway.label}
                    colorwayArchived={colorway.archived}
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
                  {/* ⚠ РЕМОУНТА ЗДЕСЬ НЕТ, И ЭТО ЗАМЕРЕННОЕ РЕШЕНИЕ, А НЕ ЗАБЫТАЯ СТРОКА.
                      `key={colorwayId}` стоял здесь ровно один круг и был снят, потому что на ЭТОМ
                      экране он ничего не сторожил. Замер: `useTargetColourDraft` засевается
                      последним рецептом ВСЕЙ карточки (колорвеем не сужается), полоса входа
                      показывает медиа библиотеки, а не рендеры колорвея, и выходы тоже
                      общекарточные. То есть сторожить нечего — ни один seed не привязан к имени, —
                      а платить пришлось бы набранными снимками (`useRecolorSources`), выбранной
                      тканью и целевым цветом: смена имени в селекторе молча чистила бы четыре
                      загруженные фотографии.
                      ⚠ НА РЕНДЕРЕ РЕМОУНТ ОСТАЛСЯ, и это не расхождение: там `useColourDraft`
                      держит mount-scoped `seeded`, который смену колорвея пережить не может.
                      Довод «перекрас атрибутируется колорвеем» верен и не оспаривается — но он
                      про то, ЧТО пишется в прогон, а не про то, надо ли ронять форму. */}
                  {/* ⚠ ИМЯ И АРХИВ ЕДУТ СЮДА ПО ТОЙ ЖЕ ПРИЧИНЕ, ПО КОТОРОЙ СЮДА ЕДЕТ ЧИСЛО. Верстака
                      этот экран не читает, но `colorwayId` он ЗАМОРАЖИВАЕТ в прогоне — значит и
                      отказывать по имени обязан он же, а не только два соседа. */}
                  <OnModelStudio
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    colorwayId={colorway.colorwayId}
                    colorwayLabel={colorway.label}
                    colorwayArchived={colorway.archived}
                  />
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
