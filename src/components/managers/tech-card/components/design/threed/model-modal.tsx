import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { formatBytes } from 'utils/pattern';

import { RENDER_SHEET_ORDER, benchName } from '../render/model';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { viewLabel } from '../views';
import { useModelCard } from './model-index';
import { ModelViewer, type ModelFacts, type ModelViewerApi } from './model-viewer';
import type { WireUploadItem } from './wire';

/**
 * ═══ ОКНО ПРОСМОТРА МОДЕЛИ ════════════════════════════════════════════════════════════════════
 *
 * ФОРМА СПИСАНА С `dxf-quick-view-modal`, И НАРОЧНО ДОСЛОВНО: та же оболочка `ConfirmationModal`
 * `width='lg' hideActions`, та же шапка «имя · вес + `download the file`», та же коробка сцены с
 * рамкой, тот же необязывающий слой «грузится» поверх живого кадра. Второй диалект крупного
 * просмотра завёл бы человека в окно, которое закрывается и скачивает не так, как соседнее.
 *
 * ⚠ ССЫЛКА НА ФАЙЛ СТОИТ ВЫШЕ СЦЕНЫ И НЕ ЗАВИСИТ ОТ НЕЁ. Это не украшение шапки: WebGL может быть
 * выключен, модель может не поместиться в память, разбор может упасть на битом контейнере — и в
 * каждом из этих случаев человеку всё ещё нужно забрать файл, за который заплачено. Орган, живущий
 * внутри удавшегося просмотра, в этих случаях исчезает вместе с ним.
 *
 * ═══ КРУГ 19 (D-26): СНИМОК С РАКУРСА — ЗДЕСЬ, ПОТОМУ ЧТО ЗДЕСЬ СЦЕНА ═══════════════════════════
 *
 * Владелец, дословно: «в THE SHEET 3д можно что бы было посмотреть и сделать снапшот с
 * определенного ракурса и сохранить его такой же функционал должен быть в студио и потом эти
 * артефакты с 3д можно тоже добавлять в THE SHEET 3д что бы они там отображались и если ты сделал
 * снапшот из 3д он сохраняется как мультивью в студио и так отображается в 3D MODELS OF THIS CARD
 * как мултивью где мы уже можем селектить что нам надо».
 *
 * ОДНО ОКНО НА ОБА ЭКРАНА, И ПОЭТОМУ ОДИН ЖЕСТ. Это окно открывает плитка студии (`PictureTile`
 * по J-29) и плита листа (ARTIFACTS · 3D); снимок живёт в нём, а не в каждом из хозяев, — и
 * «такой же функционал в студии» верно по построению, а не потому, что два экрана переписали
 * одну кнопку одинаково.
 *
 * ДВА СНИМКА, ПОТОМУ ЧТО ДВЕ ФРАЗЫ ВЛАДЕЛЬЦА ПРО РАЗНОЕ:
 *   · «с определенного ракурса» — ОДИН кадр, как камера стоит сейчас. Регистрируется картинкой
 *     рода `threed` с ДОГАДКОЙ о стороне (`ghost_view` — ближайшая из четырёх к ракурсу, пусто с
 *     верха/низа), без `composite_views`: один вид не мультивью, и сервер откажет ему в этом
 *     (`ghost_view` вместе с композитом — отказ);
 *   · «сохраняется как мультивью» — ЛИСТ из четырёх сторон, снятых камерой по кругу
 *     (`RENDER_SHEET_ORDER`: перед, бок L, спинка, бок R), объявленный `composite_views` из тех же
 *     четырёх. В студии он стоит в 3D MODELS OF THIS CARD мультивью-плиткой с углом `split`, и
 *     после разреза стороны селектятся как любые другие.
 *
 * ⚠ РОД — `threed`, А НЕ `render`, И ЭТО ВЫБОР ПО СЛОВУ ВЛАДЕЛЬЦА. Он назвал место: «в 3D MODELS OF
 * THIS CARD», а тот раздел читает ровно `outputsOfKind(band, 'threed')`. Цена названа: кроп
 * наследует род, и плита, вырезанная из такого листа, в РЕНДЕР-слот верстака не встанет (сервер
 * читает туда только `render`). Кто захочет резать снимок на рендер-плиты, файлит его `render` —
 * это одно слово в `items`, и оно здесь не выбрано, а не забыто.
 *
 * ═══ ДВА ВЫЗОВА, В ЭТОМ ПОРЯДКЕ, КАК У «ПРИНЕСТИ СВОЮ МОДЕЛЬ» ═════════════════════════════════
 *
 *   1. `UploadContentImage { raw, preserve_original }` — PNG на полку медиатеки, байт в байт;
 *   2. `RegisterDesignUpload { items: [{ media_id, kind: 'threed', … }] }` — на карточку.
 *
 * `client_request_id` минтится на намерение и переживает повтор второго шага: полка уже держит
 * байты, и свежий id завёл бы на карточке вторую строку.
 *
 * ⚠ ПЕРВЫЙ ВЫЗОВ БЕРЁТ КОНВЕРТ ЦЕЛИКОМ — `data:image/png;base64,…`. Соседний по папке
 * `UploadContentModel` берёт ГОЛЫЙ base64 (у него поля объявлены `bytes`), и одна общая функция
 * `stripDataUrlPrefix`, уместная там, стояла здесь и роняла КАЖДЫЙ снимок серверным отказом.
 * Разбор — у самого поля, ниже.
 *
 * ⚠ РАКУРСОВ СТОЛЬКО, СКОЛЬКО НАЖАТИЙ: «snapshot this angle» снимает камеру КАК ОНА СТОИТ, и
 * каждое нажатие — свой `client_request_id`, своя картинка на полке и своя строка на карточке.
 * Отдельного органа «сними ещё один ракурс» поэтому нет и не нужно: жест уже повторяемый.
 *
 * ═══ ОТКУДА ОКНО ЗНАЕТ КАРТОЧКУ ═══════════════════════════════════════════════════════════════
 *
 * Лист передаёт её пропом. Плитка студии — чужой примитив, у неё карточки нет; окно берёт её из
 * индекса моделей по СВОЕМУ адресу (`useModelCard`), куда её кладёт картинка полосы
 * (`DesignPicture.tech_card_id`). Не нашлась — двери снимка стоят инертными и говорят это словами,
 * а не файлят картинку на карточку 0.
 *
 * ═══ И ПОД КАКОЙ ЦВЕТ — ТОЖЕ ОТ ВЫЗЫВАЮЩЕГО (r3f) ═════════════════════════════════════════════
 *
 * ЗДЕСЬ СТОЯЛО `colorwayId: 0` С ДОВОДОМ «снимок не заявляет колорвея за человека», И ЭТОТ ДОВОД
 * УНОСИЛ СНИМОК С ЭКРАНА. Полка 3D СУЖЕНА целью студии (`outputsOfKind(band, 'threed', scope)` в
 * `render/outputs.tsx`), то есть показывает ровно тот цвет, на котором человек стоит. Снимок,
 * заявленный нулём, попадал на верстак `sample` — и на полке ROSSO, откуда его только что сняли,
 * не появлялся вовсе: нажатие выглядело съеденным, а кадр, за который заплачено, находился только
 * переключением цвета.
 *
 * ⚠ «НЕ ЗАЯВЛЯТЬ» ЗДЕСЬ НЕВОЗМОЖНО В ПРИНЦИПЕ: `colorway_id` — число, и `0` это НЕ «молчание», а
 * ИМЯ ВЕРСТАКА СЕМПЛА (`SAMPLE_WORD` в `render/model.ts`), такое же полноправное, как `ROSSO`.
 * Значит выбор не между «сказать» и «промолчать», а между «сказать то, на что человек смотрит» и
 * «сказать `sample` за него». Цель приезжает пропом от того, кто её знает, — и она же печатается
 * словом под дверями, чтобы утверждение было видно ДО нажатия, а не выводилось из пропажи кадра.
 *
 * ⚠ СЕРВЕР ЭТО ПРИНИМАЕТ И ГРАНИЦУ ДЕРЖИТ САМ: `DesignPictureKindTakesColorway` включает `threed`
 * (`internal/entity/design.go`), а чужой колорвей отказывается словами в той же транзакции, что и
 * вставка (`RegisterUpload`, `internal/store/design/pictures.go`). Клиенту здесь нечего проверять
 * второй раз — и незачем: он не знает списка колорвеев карточки, а вызывающий знает.
 */
export function ThreedModelModal({
  url,
  title,
  onClose,
  techCardId,
  colorwayId = 0,
  colorwayLabel = '',
}: {
  /** Адрес `.glb`. `null` — окно закрыто. */
  url: string | null;
  title?: string;
  onClose: () => void;
  /** The card a snapshot is filed onto. Omitted — read off the model index by the model's own url. */
  techCardId?: number;
  /**
   * ЧЕЙ ЭТО СНИМОК — колорвей, под которым он ляжет на карточку. `0` = верстак семпла, и это
   * умолчание для всякого вызывающего, у которого цели нет: он и раньше файлил нулём.
   */
  colorwayId?: number;
  /** Как этот колорвей зовётся на экране. Пусто у оси 0 — окно называет её `sample` само. */
  colorwayLabel?: string;
}): JSX.Element {
  const [facts, setFacts] = useState<ModelFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const { showMessage } = useSnackBarStore();

  const indexed = useModelCard(url);
  const card = techCardId || indexed;
  /**
   * КАК ЗОВЁТСЯ ЦЕЛЬ — ОДНО СЛОВО НА ПОДПИСЬ И НА ОБЕ ПОДСКАЗКИ. `benchName()` — то же написание
   * `sample`, что у ворот, селекта и полосы (`render/model.ts`); второе написание в органе
   * разошлось бы с отказом молча. Номер вместо имени (`#5`) — тот же запасной, что у
   * `colourwayName` полки: колорвей, которого карточка больше не перечисляет, обязан оставаться
   * НАЗЫВАЕМЫМ, иначе подпись пустеет ровно там, где она и нужна.
   */
  const targetName = colorwayId > 0 ? colorwayLabel.trim() || `#${colorwayId}` : benchName();
  const { registerUpload } = useDesignWrites(card);
  const apiRef = useRef<ModelViewerApi | null>(null);
  const [busy, setBusy] = useState<'' | 'shooting' | 'sending' | 'filing'>('');
  /**
   * ПОЧЕМУ СНИМОК НЕ ДОЕХАЛ — словами сервера, на экране, до следующей попытки. Отдельно от
   * `error`: тот означает «модель не открылась здесь» и ЗАМЕЩАЕТ сцену, а отказ снимка приходит на
   * живой сцене, которую человек как раз крутит, и гасить её нечем и незачем.
   */
  const [refusal, setRefusal] = useState<string | null>(null);

  const loading = !!url && !facts && !error;

  // Новый адрес — новая загрузка: прошлые числа и прошлый отказ обязаны уйти, иначе окно покажет
  // вес чужой модели, а полоса — отказ, полученный на другой.
  useEffect(() => {
    setFacts(null);
    setError(null);
    setRefusal(null);
    setElapsed(0);
    startedAt.current = Date.now();
  }, [url]);

  /**
   * ⚠ СЧЁТЧИК СЕКУНД — НЕ УКРАШЕНИЕ, А ЕДИНСТВЕННОЕ, ЧТО ОТЛИЧАЕТ ЗАГРУЗКУ ОТ ЗАВИСАНИЯ.
   *
   * Веса файла до его прихода НЕ ЗНАЕТ НИКТО: `common.MediaInfo` несёт только `media_url`, `width`
   * и `height` — байтов на проводе нет ни у одной картинки. Потолок модели при этом 64 МиБ
   * (`maxModelPayloadBytes` в `internal/bucket/nonraster.go`), то есть неподвижное слово
   * «загружается» может стоять на экране очень долго и совершенно честно. Бегущая секунда говорит
   * то единственное, что здесь вообще можно утверждать: работа идёт и идёт вот столько.
   */
  useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  /**
   * Почему дверь снимка мертва — или `null`, когда она живая. Одна причина за раз, самая ранняя
   * по пути: без сцены снимать нечего, без карточки — некуда.
   */
  const snapshotInert = !facts
    ? 'the model is not on screen yet'
    : !card
      ? 'this window was opened without a card to file the snapshot onto'
      : busy
        ? 'a snapshot is on its way'
        : null;

  async function takeSnapshot(mode: 'angle' | 'sides') {
    const api = apiRef.current;
    if (!api || snapshotInert) return;
    const requestId = newClientRequestId();
    let mediaId = 0;
    try {
      setRefusal(null);
      setBusy('shooting');
      const sides = [...RENDER_SHEET_ORDER];
      const shot = mode === 'sides' ? api.snapshotSides(sides) : api.snapshot();
      const ghostView = mode === 'sides' ? '' : api.nearestSide();
      setBusy('sending');
      const response = await adminService.UploadContentImage({
        /**
         * ═══ КОНВЕРТ ЕДЕТ ЦЕЛИКОМ: `data:image/png;base64,…`, А НЕ ГОЛЫЕ БАЙТЫ ══════════════════
         *
         * ЗДЕСЬ СТОЯЛ `stripDataUrlPrefix(shot.dataUrl)`, И СНИМОК НЕ РАБОТАЛ НИ РАЗУ. Сервер
         * читает это поле РОВНО как конверт и отказывает дословно: «invalid base64 image format:
         * expected 'data:[mediatype];base64,[data]'» (`rawImageFromDataURL` в
         * `apisrv/admin/content.go`, и та же фраза во второй раз — `getB64ImageFromString` в
         * `bucket/image.go`). Он режет строку по `;base64,` и берёт медиатип из головы; без головы
         * резать нечего, и до байтов дело не доходит вовсе.
         *
         * ⚠ СНЯТЬ ПРЕФИКС БЫЛО НЕ ОПЕЧАТКОЙ, А ПЕРЕНОСОМ ЧУЖОГО ПРАВИЛА. Рядом, в этой же папке,
         * `model-upload-cell` снимает его ПРАВИЛЬНО — но у `UploadContentModel` поля `raw` и
         * `preview` объявлены `bytes`, а grpc-gateway ждёт в JSON голый base64 без конверта. Два
         * соседних вызова, две РАЗНЫЕ формы одного и того же — и функция с общим именем
         * (`stripDataUrlPrefix`) выглядела уместной у обоих.
         *
         * ЧЕМ ЭТО ЗАКРЕПЛЕНО: остальные вызывающие `UploadContentImage` шлют конверт целиком —
         * `uploadRaster` (`modals/use-edit-layer.ts`) и общая загрузка медиатеки
         * (`media/utils/useUploadMedia.ts`). Теперь так шлют ВСЕ ТРИ.
         */
        rawB64Image: shot.dataUrl,
        preserveOriginal: true,
      });
      mediaId = response.media?.id ?? 0;
      if (!mediaId) throw new Error('the snapshot went up but came back without an id');
      setBusy('filing');
      const item: WireUploadItem = {
        mediaId,
        ghostView,
        kind: 'threed',
        // ЦЕЛЬ, НА КОТОРУЮ ЧЕЛОВЕК СМОТРИТ, — разбор в шапке файла. Ноль здесь не «молчание», а
        // верстак семпла, и он остаётся умолчанием для вызывающего без цели.
        colorwayId,
        // ОДИН ВИД — НЕ МУЛЬТИВЬЮ, и сервер это скажет сам (`ghost_view` + композит = отказ):
        // лист объявляется ТОЛЬКО четырьмя сторонами.
        compositeViews: mode === 'sides' ? sides : undefined,
        // Снимок ИДЁТ в промпты как любая картинка карточки: это не витринный кадр (D-24), а
        // материал, который режут и селектят.
        displayOnly: false,
      };
      await registerUpload.mutateAsync({ clientRequestId: requestId, items: [item] });
      /* ИМЯ ЦЕЛИ СТОИТ И В ИТОГЕ, А НЕ ТОЛЬКО ПОД ДВЕРЬЮ. «It stands in 3D MODELS OF THIS CARD»
         верно ТОЛЬКО на этом цвете: полка сужена целью студии, и фраза без имени обещала бы кадр
         на любом открытом верстаке. */
      showMessage(
        mode === 'sides'
          ? `four sides filed on the card under ${targetName} as one multi-view (${sides.map(viewLabel).join(', ')}) — it stands in 3D MODELS OF THIS CARD and on the sheet’s 3D tab; split it to select a side`
          : `snapshot filed on the card under ${targetName}${ghostView ? ` as a guess of ${viewLabel(ghostView)}` : ''} — it stands in 3D MODELS OF THIS CARD and on the sheet’s 3D tab`,
        'success',
      );
    } catch (e) {
      /**
       * ═══ ОТКАЗ ОСТАЁТСЯ НА ЭКРАНЕ СЛОВАМИ, А НЕ УЛЕТАЕТ СЕКУНДАМИ СНЕКБАРА ═══════════════════
       *
       * Здесь стоял ОДИН `showMessage(..., 'error')`, и его хватало ровно до того дня, когда отказ
       * оказался постоянным: строка «invalid base64 image format: expected …» — это то, что сервер
       * отвечал НА КАЖДОЕ нажатие, а всплывашка уносила её через несколько секунд, оставляя
       * человека в окне, где кнопка снова живая и снова ничего не делает. Полоса держит слова
       * сервера до следующей попытки — ровно как `RunRefusal` держит отказ прогона.
       *
       * СЛОВА СЕРВЕРА — ДОСЛОВНО, В КАВЫЧКАХ И БЕЗ ПЕРЕСКАЗА: только они называют причину
       * (`requestHandler` достаёт `message` из тела ответа). Наша проза говорит ровно одно — НА
       * КАКОМ шаге это случилось; `mediaId` отвечает на это точно: до него отказала полка, после
       * него карточка. Кавычки нужны затем же, зачем они у `RunRefusal`: видно, где кончается наша
       * фраза и начинается чужая, — иначе строка сервера читается как наш текст и «починить» её
       * идут в этот файл.
       *
       * ⚠ ПУСТЫЕ КАВЫЧКИ НЕ ПЕЧАТАЮТСЯ. Сетевой сбой доезжает и вовсе без слов, и «the server
       * answered: «»» было бы утверждением, что сервер что-то сказал.
       */
      const words = e instanceof Error ? e.message.trim() : '';
      const step = mediaId
        ? 'the picture is on the shelf, but filing it on the card did not go through'
        : 'the snapshot did not go up';
      setRefusal(
        words ? `${step} — the server answered: «${words}»` : `${step}, and no words came back`,
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <ConfirmationModal
      open={url != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={onClose}
      title={title || '3d model'}
      width='lg'
      hideActions
    >
      {/* ЯКОРЬ ПРОБЫ: «открылось окно МОДЕЛИ, а не общий просмотрщик картинок». Обе поверхности —
          `role=dialog`, и различить их по роли нельзя. */}
      <div className='space-y-2' data-threed-model=''>
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='min-w-0 flex-1 truncate'>
            {facts
              ? [
                  formatBytes(facts.bytes),
                  `${facts.meshes} mesh${facts.meshes === 1 ? '' : 'es'}`,
                  `${facts.triangles.toLocaleString('en-US')} triangles`,
                  facts.size.join(' × '),
                ].join(' · ')
              : error
                ? 'the file did not open here'
                : `loading the model… ${elapsed}s`}
          </Text>
          {/* ═══ ДВЕ ДВЕРИ СНИМКА — В ШАПКЕ, РЯДОМ СО СКАЧИВАНИЕМ ═══════════════════════════════
              Оба органа отвечают на один вопрос — «что забрать из этого окна»: файл как он есть,
              кадр как стоит, лист из четырёх сторон. Мёртвая дверь называет причину заголовком, а
              не исчезает: отсутствие учило бы, что снимка здесь не бывает вовсе. */}
          {!error && (
            <>
              <Button
                variant='secondary'
                size='xs'
                data-snapshot-door='angle'
                disabled={!!snapshotInert}
                aria-busy={busy ? true : undefined}
                title={
                  snapshotInert
                    ? `snapshot this angle — ${snapshotInert}`
                    : 'one picture, as the camera stands now, filed on the card as a 3D picture with a guess of which side it is'
                }
                onClick={() => void takeSnapshot('angle')}
              >
                {busy && busy !== 'shooting' ? `${busy}…` : 'snapshot this angle'}
              </Button>
              <Button
                variant='secondary'
                size='xs'
                data-snapshot-door='sides'
                disabled={!!snapshotInert}
                aria-busy={busy ? true : undefined}
                title={
                  snapshotInert
                    ? `snapshot 4 sides — ${snapshotInert}`
                    : 'front, side L, back and side R in one multi-view sheet, filed on the card — split it on STUDIO to select the sides'
                }
                onClick={() => void takeSnapshot('sides')}
              >
                snapshot 4 sides
              </Button>
              {/* ═══ КУДА ЭТО ЛЯЖЕТ — СЛОВОМ, ДО НАЖАТИЯ, А НЕ ПО ПРОПАЖЕ КАДРА ═════════════════
                  ТИХАЯ ПОДПИСЬ, А НЕ КНОПКА И НЕ ВЫБОР: цель здесь не назначается, а СООБЩАЕТСЯ —
                  её держит экран, который это окно открыл (полка 3D сужена ею же). Селект рядом с
                  дверями завёл бы вторую цель, спорящую с той, на которую человек смотрит.

                  ⚠ И ОНА СТОИТ ВСЕГДА, В ТОМ ЧИСЛЕ У ВЫЗЫВАЮЩЕГО БЕЗ ЦЕЛИ. `sample` — такое же
                  имя верстака, как `ROSSO`, и «files under sample» это факт, а не заглушка;
                  прятать строку там, где цель не названа, значило бы молчать ровно в том случае,
                  ради которого она заведена. */}
              {/* Размер — `micro`, как у строки фактов слева: это ВТОРАЯ тихая строка того же
                  ряда, и два размера тихого текста в одном ряду читаются как две разные важности
                  там, где важность одна. `nano` в системе занят бейджами и номерами. */}
              <Text
                size='micro'
                variant='label'
                component='span'
                data-probe='snapshot-target'
                className='shrink-0'
                title={`both snapshots are filed on this card under ${targetName} — the colourway the screen that opened this window is standing on`}
              >
                files under {targetName}
              </Text>
            </>
          )}
          <Button asChild variant='secondary' size='xs'>
            <a href={url || '#'} target='_blank' rel='noopener noreferrer' download>
              download the file
            </a>
          </Button>
        </div>

        {/* ═══ ОТКАЗ СНИМКА — ПОД ЕГО ЖЕ ДВЕРЬМИ, СЛОВАМИ СЕРВЕРА, ДО СЛЕДУЮЩЕЙ ПОПЫТКИ ══════════
            Форма та же, что у `RunRefusal` полосы генерации: `CalloutBox tone='error'`, слова
            сервера в кавычках, наша проза — только про шаг. Сцена под ней остаётся живой: снимок
            не удался, а модель открыта, и крутить её никто не мешает — и обе двери снова живые,
            потому что исправление отказа часто НЕ второе нажатие (перевыбрать ракурс, дождаться
            карточки). */}
        {refusal && (
          <CalloutBox tone='error'>
            <Text
              size='micro'
              component='p'
              data-probe='snapshot-refusal'
              className='min-w-0 normal-case'
            >
              {refusal}
            </Text>
          </CalloutBox>
        )}

        {error ? (
          /* СЛОВАМИ, А НЕ ПУСТОТОЙ. Пустая рамка на месте сцены читается как «сломался сервер», а
             сервер модель отдал: она лежит в бакете и её ссылка выше по-прежнему работает. */
          /* Та же высота, что у сцены: окно не обязано прыгать в размере оттого, что файл не
             открылся. */
          <div className='flex h-[70vh] w-full flex-col items-center justify-center gap-1 border border-borderColor bg-bgColor px-4 text-center'>
            <Text size='micro' variant='label' component='p'>
              this model could not be opened here — the file is intact and can be downloaded
            </Text>
            <Text size='nano' variant='label' component='p' className='normal-case'>
              {error}
            </Text>
          </div>
        ) : (
          <div className='relative'>
            {url && (
              <div className='h-[70vh] w-full border border-borderColor bg-bgColor'>
                <ModelViewer
                  url={url}
                  onReady={setFacts}
                  onError={setError}
                  onApi={(api) => {
                    apiRef.current = api;
                  }}
                />
              </div>
            )}
            {loading && (
              <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
                <Text size='micro' variant='label'>
                  loading the model…
                </Text>
              </div>
            )}
          </div>
        )}

        {/* ЖЕСТЫ НАЗЫВАЮТСЯ ТОЛЬКО ТАМ, ГДЕ ИХ ЕСТЬ НА ЧЁМ СДЕЛАТЬ. Строка «покрутите модель» под
            сообщением о том, что модель не открылась, — обещание органа, которого на экране нет. */}
        {!error && (
          <Text size='nano' variant='label' component='p' className='normal-case'>
            Drag to orbit, scroll to zoom, right-drag to pan. A snapshot is filed on the card as a
            3D picture; four sides make a multi-view you can split and select on STUDIO.
          </Text>
        )}
      </div>
    </ConfirmationModal>
  );
}
