import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import { Tiles } from 'ui/components/tiles';
import Text from 'ui/components/text';

import { ASSET_NAME_MAX, ASSET_PATTERN, assetFull, assetLabel, assetThumb } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { runIsOnPage } from '../bench-kinds';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { useElapsed } from '../generation';
import { PictureTile } from '../picture-tile';
import { useDesignWrites } from '../use-design-band';
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
 * ═══ ⚠ ПЛИТКА САДИТСЯ НА ПОЛКУ САМА. `KEEP` — ПОДБОРЩИК ЛЕГАСИ, А НЕ ПУТЬ СОХРАНЕНИЯ ══════════
 *
 * ⚠⚠ ЗДЕСЬ СТОЯЛО ПРЯМО ПРОТИВОПОЛОЖНОЕ УТВЕРЖДЕНИЕ, И ОНО БЫЛО ЛОЖНЫМ. Дословно: «сервер плитку
 * на полку карточки НЕ КЛАДЁТ — прогон отдаёт картинку в ленту, а ассет заводит человек;
 * автоматическая посадка — правка бэкенда, которой на бете нет». Оно было написано ЗА КРУГ ДО
 * ТОГО, как эта правка приехала, и с тех пор пережило её молча.
 *
 * ЧТО НА САМОМ ДЕЛЕ, СВЕРЕНО НА `origin/beta` (круг 19): `keepPatternTx`
 * (`internal/store/design/assets.go:167`) вызывается из транзакции, ЗАКРЫВАЮЩЕЙ ПРОГОН
 * (`queue.go:897`, при `run.Kind == pattern`), и заводит `design_asset{kind:pattern, name,
 * media_id, repeat_mm, colorway_id}` из замороженного `params.pattern.name` прогона и живой
 * колонки `run.colorway_id`. То есть КАЖДЫЙ НАЗВАННЫЙ ПРОГОН ПАТТЕРНА СТАНОВИТСЯ СТРОКОЙ ПОЛКИ
 * САМ, без единого нажатия. Имя же теперь есть всегда: пустое поле на экране-делателе уезжает
 * как `pattern N` (разбор — у `fallbackName` в `pattern-studio.tsx`).
 *
 * ПОЧЕМУ ЛОЖНАЯ ШАПКА СТОИЛА ДЕНЕГ, А НЕ ТОЛЬКО ТОЧНОСТИ. Владелец спросил ДОСЛОВНО: «как
 * сохранять паттерны» — при том, что они сохраняются сами. Вопрос родился из СЛОВАРЯ этого
 * экрана: счётчик писал `N kept`, полоса зовётся `made earlier, not kept`, у двери `keep`
 * тултип «name this tile». Три органа хором учили, что сохранение — ручной жест. Круг 19 снял
 * первое (`N kept` → `N` в заголовке общей секции) и свёл делателя и полку в ОДИН блок, чтобы
 * плитка появлялась там же, где стояла пунктирная дыра прогона. Второе и третье остались, потому
 * что относятся к настоящему остатку — см. ниже.
 *
 * ЧТО ТОГДА ПОДБИРАЕТ `KEEP`, И ПОЧЕМУ ДВЕРЬ НЕ СНЕСЕНА. Ровно два рода плиток, у которых полка
 * не завелась: (a) прогоны, ЗАМОРОЖЕННЫЕ ДО КРУГА 15, — у них в `params` нет имени вовсе, и
 * `keepPatternTx` их пропускает (`assets.go:169-173`); (b) прогоны, упёршиеся в `library_full`.
 * Полоса исчезает целиком, когда таких плиток нет, — а это нормальное состояние любой карточки,
 * заведённой после круга 15.
 *
 * ═══ E-15 — ЧТО ЗНАЧИТ `KEEP` ТЕПЕРЬ, И ЧЕГО ОНО БОЛЬШЕ НЕ ЗНАЧИТ ════════════════════════════
 *
 * Владелец, дословно: «если мы сделали keep в PATTERNS OF THIS CARD это не значит что надо их
 * сразу добавлять как текстуру в рендер это значит что мы его просто проименовали и он тогда
 * должен появлять в артефактах».
 *
 * ДВЕ ПРАВКИ, ОБЕ БУКВАЛЬНЫЕ:
 *
 *   1. `KEEP` БОЛЬШЕ НЕ ДЕЛАЕТ ПЛИТКУ ТЕКСТУРОЙ РЕНДЕРА. Механизмом этого были ЧИПЫ НОСКИ
 *      (`SetDesignAssetColorway`, «worn by ROSSO»): назначенная колорвею ткань ЗАСЕВАЛА подачу
 *      рендера сама (`useColourDraft` → `fabricOfColorway`), то есть открытие экрана уже несло
 *      выбранную текстуру, которую человек не выбирал. Чипы сняты целиком. Это не расширение
 *      слова владельца, а его исполнение: он назвал ровно тот эффект, который они производили, и
 *      той же волной снял колорвеи с обоих экранов (E-1/E-16), после чего у носки не осталось ни
 *      одного читателя вовсе.
 *      ⚠ КОЛОНКА `design_asset.colorway_id` ЖИВА И НЕ ТРОНУТА. Снят ОРГАН; данные, ручка
 *      `SetDesignAssetColorway` и FK на месте, и удаление данных — отдельное решение владельца.
 *      Значение, проставленное раньше, просто больше нигде не читается.
 *
 *   2. `KEEP` ТЕПЕРЬ ЖЕ КЛАДЁТ ПЛИТКУ В АРТЕФАКТЫ. «Проименовали → появляется в артефактах» —
 *      это ровно пометка `selected`: сегмент PATTERNS панели ARTIFACTS сужается по ней
 *      (`artifacts-panel.tsx`, `bandPlates`), и до этой правки названная плитка в него не
 *      попадала, если на карточке была помечена хоть одна другая. Поэтому дверь пишет ДВА факта
 *      одним нажатием — ассет полки и пометку кадра, — и говорит об этом на себе.
 *
 * ⚠ ДВЕ ЗАПИСИ, И ВТОРАЯ МОЖЕТ ОТКАЗАТЬ ОТДЕЛЬНО. Транзакции на пару у клиента нет и быть не
 * может: это два разных глагола сервера. Порядок выбран так, что ЧАСТИЧНЫЙ ИСХОД БЕЗВРЕДЕН —
 * сначала ассет (без него плитка не ткань карточки вовсе), потом пометка (без неё плитка просто
 * не сузила сегмент). Обратный порядок оставил бы помеченный кадр без ассета, то есть артефакт,
 * которого нет на полке.
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
  disabled,
  techCardId,
  seam,
}: {
  asset: common_DesignAsset;
  disabled?: boolean;
  techCardId: number;
  /** Сервер померил стык этой плитки и нашёл его видимым. Читается с ПРОГОНА, не с ассета. */
  seam: boolean;
}): JSX.Element {
  const { upsertAsset, deleteAsset } = useAssetWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(() => assetLabel(asset));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const id = asset.id ?? 0;

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

  const thumb = assetThumb(asset);
  const full = assetFull(asset) || thumb;
  const label = assetLabel(asset);

  return (
    <div data-pattern-asset={id} className='flex flex-col gap-1'>
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

      {/* ⚠ СТРОКА «worn by ROSSO» СНЯТА ВМЕСТЕ С ЧИПАМИ НОСКИ (E-15). Она называла факт, у
          которого не осталось ни одного читателя, — а подпись под фактом без читателя учит, что
          механизм жив. Осталось то, чего не видно на картинке. */}
      {/* ⚠ ПОЛОВИНА `run N` СНЯТА (круг 19). Владелец: «сделай его максимально простым сейчас
          там хуй пойми что». Номер прогона — АДРЕС В ЛЕНТЕ, а не свойство ткани: он ничего не
          говорит о плитке, отличается у двух одинаковых и пропадает сам, стоит прогону уехать со
          страницы истории (тогда строка молча становилась короче — то есть подпись под плиткой
          зависела от пагинации СОСЕДНЕГО блока). Осталось `N mm`, и только когда оно есть.

          ЛЕГАСИ-ЧИСЛО ПОКАЗЫВАЕТСЯ ТОЛЬКО ТОГДА, КОГДА ОНО ЕСТЬ. Новые паттерны его не несут
          (J-12 снял ряд SCALE, и `repeat_mm` уезжает нулём), а у старых оно настоящее и
          по-прежнему доезжает в промпт многоткани — молчать о нём было бы потерей. */}
      {!!asset.repeatMm && (
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {`${asset.repeatMm} mm`}
        </Text>
      )}

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

      {/* ═══ ЗДЕСЬ СТОЯЛ РЯД ЧИПОВ НОСКИ, И ОН СНЯТ ПО СЛОВУ ВЛАДЕЛЬЦА (E-15) ═══════════════
          Разбор целиком — в шапке файла. Коротко: чип «ROSSO» делал эту плитку ТЕКСТУРОЙ
          РЕНДЕРА того цвета — подача засевалась ею сама, — а владелец сказал, что `keep` значит
          «проименовали», и ничего больше. Вместе с чипами ушла и строка «worn by …»: подпись
          под фактом, которого никто не читает, учит, что механизм жив. */}

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
          It leaves the card’s texture shelf, so FABRIC RENDER can no longer pick it. The PICTURE
          survives: the tile stays in the run’s history and in ARTIFACTS, and it can be kept again
          from the strip below.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

/**
 * ═══ ПУНКТИРНАЯ ПЛИТКА ЖИВОГО ПРОГОНА — ДЫРА ФОРМЫ ОТВЕТА (круг 19) ══════════════════════════
 *
 * Здесь у прогона была СТРОКА в блоке-делателе: «a pattern is being made · 0:42 — it lands in
 * PATTERNS OF THIS CARD when the provider answers». Она ОБЕЩАЛА СЛОВАМИ, где появится плитка, —
 * стоя при этом в другой секции, чем названная. Дыра формы плитки, стоящая в самой сетке первой,
 * говорит то же самое и не может соврать: готовая плитка встанет ровно сюда.
 *
 * ОТДЕЛЬНЫМ КОМПОНЕНТОМ РАДИ ХУКА: `useElapsed` тикает раз в секунду, и вызванный в теле полки он
 * перерисовывал бы вместе с собой ВСЮ сетку, включая замощённые лица всех сохранённых плиток.
 * Здесь он перерисовывает одну ячейку.
 */
function PendingTile({ startedAt }: { startedAt?: string | null }): JSX.Element {
  const elapsed = useElapsed(startedAt ?? undefined);
  return (
    <div data-pattern-pending className='flex flex-col gap-1'>
      <Placeholder dashed aspect='square' className='w-full' />
      <Text size='nano' variant='label' component='span'>
        {elapsed || '0:00'}
      </Text>
    </div>
  );
}

export function PatternLibrary({
  band,
  techCardId,
  disabled,
  live,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ЖИВЫЕ ПРОГОНЫ ПАТТЕРНА, СЧИТАННЫЕ ВЫЗЫВАЮЩИМ. Пропом, а не вторым чтением полосы: делатель
   * уже держит этот список ради собственного `pending`, и второй `patternRuns(band).filter(...)`
   * был бы вторым ответом на вопрос «что сейчас в работе» — с шансом разойтись на одном кадре.
   */
  live?: common_DesignRun[];
}): JSX.Element {
  const { upsertAsset } = useAssetWrites(techCardId);
  /**
   * ВТОРАЯ ПОЛОВИНА ЖЕСТА `KEEP` (E-15): пометка кадра, по которой ARTIFACTS сужает свой сегмент
   * PATTERNS. Отдельный глагол сервера, поэтому и отдельная мутация; порядок и цена частичного
   * исхода — в шапке файла.
   */
  const { setPictureSelected } = useDesignWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const assets = useMemo(() => patternAssets(band), [band]);
  const outputs = useMemo(() => patternOutputs(band), [band]);

  /**
   * ПРОГОН, СДЕЛАВШИЙ ПЛИТКУ, ИЩЕТСЯ ПО МЕДИА — у ассета нет `picture_id`, у него `media_id`.
   * Прогон, вытесненный со страницы ленты, здесь не найдётся, и это честный ответ «спросить не у
   * кого»: вердикт о стыке живёт на попытках прогона, а не на ассете.
   */
  const seamOfAsset = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const { picture, run } of outputs) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0 && !m.has(mediaId)) m.set(mediaId, seamWarningOf(run));
    }
    return m;
  }, [outputs]);

  /** Плитки, вернувшиеся из прогонов и НЕ положенные на полку. Пусто — полосы нет вовсе. */
  const unkept = useMemo(
    () => outputs.filter(({ picture }) => !assetOfMedia(band, picture.media?.id ?? 0)),
    [outputs, band],
  );

  const shelfFull = shelfIsFull(band);
  const pending = live ?? [];

  return (
    /* ═══ СВОЕЙ СЕКЦИИ У ПОЛКИ БОЛЬШЕ НЕТ (круг 19) ═══════════════════════════════════════════
       Владелец: «переделай юай создания паттернов сделай его максимально простым сейчас там хуй
       пойми что». Полка была ВТОРЫМ белым блоком на сером грунте, и между ней и делателем стояли
       24 пикселя `SectionStack` — то есть вход и выход одной вещи читались как два равновесных
       заявления. Теперь это тело ОДНОЙ секции `patterns`, а её заголовок и счётчик принадлежат
       `PatternStudio`.

       ЧТО УШЛО ВМЕСТЕ С СЕКЦИЕЙ:
         · ЗАГОЛОВОК `patterns of this card` — секция называется `patterns`, и повторять слово
           «карточки» внутри карточки незачем;
         · ВОПРОС-ПОДЗАГОЛОВОК «— the tiles it has named; each one is an artifact and a texture
           FABRIC RENDER can pick». Проза, и вдобавок неверная в главном слове: плитки называет
           не человек («it has named»), а прогон, а полку заводит сервер;
         · СЧЁТЧИК `N kept`. Слово `kept` учило, что сохранение — ручной жест, которого на самом
           деле нет; в заголовке общей секции стоит просто `N` (разбор — в шапке файла);
         · ПУСТОЕ СОСТОЯНИЕ — абзац «No pattern is named yet. Attach a picture above and press
           GENERATE…». Он пересказывал словами ряд, стоящий В ТРЁХ САНТИМЕТРАХ ВЫШЕ: пустая рамка
           `+ picture` рядом с инертной дверью GENERATE и есть пустое состояние этого экрана, и
           она показывает жест вместо того, чтобы его описывать. */
    <>
      {/* ЛИНИЯ ПОЯВЛЯЕТСЯ ВМЕСТЕ С ТЕМ, ЧТО ОНА ОТБИВАЕТ, И НИКОГДА РАНЬШЕ. Правило лестницы:
          1px `hairline` — ВНУТРЕННЯЯ линия между рядами блока (DESIGN.md, «две серых»). Линия над
          пустым полем — это обещание содержимого, которого нет. */}
      {(assets.length > 0 || pending.length > 0) && (
        /* 220 px — НИЖНЯЯ ГРАНИЦА, ПРИ КОТОРОЙ ЛИЦО ЕЩЁ ОТВЕЧАЕТ НА СВОЙ ВОПРОС: каждая из
           четырёх копий ≈ 110 px, и стык в центре читается без наведения. Дорожка `1fr` растит
           карточки дальше на широком экране, где места и правда больше. */
        <div className='border-t border-hairline pt-3'>
          <Tiles min={220}>
            {/* ЖИВЫЕ — ПЕРВЫМИ, И ЭТО НЕ «новое сверху», А АДРЕС ОТВЕТА. Готовая плитка встаёт
                в голову списка (полоса отдаёт ассеты новейшими вперёд), значит пунктирная дыра
                обязана стоять там же, иначе плитка появится не на месте своей дыры. */}
            {pending.map((r) => (
              <PendingTile key={r.id ?? `live-${r.startedAt ?? ''}`} startedAt={r.startedAt ?? r.createdAt} />
            ))}
            {assets.map((a) => (
              <Card
                key={a.id}
                asset={a}
                disabled={disabled}
                techCardId={techCardId}
                seam={!!seamOfAsset.get(a.mediaId ?? 0)}
              />
            ))}
          </Tiles>
        </div>
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
                paid for, but unnamed — a nameless tile is in no artifact and in no texture grid
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
                        reason='this card already holds its 40 assets — delete a pattern above, or a texture under FABRIC RENDER → TEXTURE & COLOUR, before naming another'
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
                        disabled={
                          upsertAsset.isPending || setPictureSelected.isPending || mediaId <= 0
                        }
                        onClick={() => {
                          /* ⚠ ПОРЯДОК НЕСУЩИЙ, И ЭТО ПРО ЧАСТИЧНЫЙ ИСХОД (E-15). Транзакции на
                             два глагола сервера у клиента нет; значит одна из двух записей может
                             пройти в одиночку. Ассет ПЕРВЫМ: без него плитка не ткань карточки
                             вовсе, и оставшаяся одна пометка дала бы артефакт, которого нет на
                             полке. Обратный порядок стоил бы ровно этого. */
                          upsertAsset.mutate({
                            assetId: 0,
                            kind: ASSET_PATTERN,
                            name: nextPatternName(band),
                            mediaId,
                            repeatMm: repeat,
                          });
                          /* «и он тогда должен появлять в артефактах» — дословно. Сегмент
                             PATTERNS панели ARTIFACTS сужается по `selected`, поэтому названная
                             плитка без пометки в него не попадала, стоило пометить любую другую. */
                          const pictureId = picture.id ?? 0;
                          if (pictureId > 0) {
                            setPictureSelected.mutate({ pictureId, selected: true });
                          }
                        }}
                        title='name this tile: it is filed on the card’s texture shelf, listed in ARTIFACTS, and offered in the texture grid of FABRIC RENDER. It is offered there — it does not become the texture of anything by itself'
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
    </>
  );
}
