import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { formatBytes, stripDataUrlPrefix } from 'utils/pattern';

import { RENDER_SHEET_ORDER } from '../render/model';
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
 * ═══ ОТКУДА ОКНО ЗНАЕТ КАРТОЧКУ ═══════════════════════════════════════════════════════════════
 *
 * Лист передаёт её пропом. Плитка студии — чужой примитив, у неё карточки нет; окно берёт её из
 * индекса моделей по СВОЕМУ адресу (`useModelCard`), куда её кладёт картинка полосы
 * (`DesignPicture.tech_card_id`). Не нашлась — двери снимка стоят инертными и говорят это словами,
 * а не файлят картинку на карточку 0.
 */
export function ThreedModelModal({
  url,
  title,
  onClose,
  techCardId,
}: {
  /** Адрес `.glb`. `null` — окно закрыто. */
  url: string | null;
  title?: string;
  onClose: () => void;
  /** The card a snapshot is filed onto. Omitted — read off the model index by the model's own url. */
  techCardId?: number;
}): JSX.Element {
  const [facts, setFacts] = useState<ModelFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const { showMessage } = useSnackBarStore();

  const indexed = useModelCard(url);
  const card = techCardId || indexed;
  const { registerUpload } = useDesignWrites(card);
  const apiRef = useRef<ModelViewerApi | null>(null);
  const [busy, setBusy] = useState<'' | 'shooting' | 'sending' | 'filing'>('');

  const loading = !!url && !facts && !error;

  // Новый адрес — новая загрузка: прошлые числа и прошлый отказ обязаны уйти, иначе окно покажет
  // вес чужой модели.
  useEffect(() => {
    setFacts(null);
    setError(null);
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
      setBusy('shooting');
      const sides = [...RENDER_SHEET_ORDER];
      const shot = mode === 'sides' ? api.snapshotSides(sides) : api.snapshot();
      const ghostView = mode === 'sides' ? '' : api.nearestSide();
      setBusy('sending');
      const response = await adminService.UploadContentImage({
        rawB64Image: stripDataUrlPrefix(shot.dataUrl),
        preserveOriginal: true,
      });
      mediaId = response.media?.id ?? 0;
      if (!mediaId) throw new Error('the snapshot went up but came back without an id');
      setBusy('filing');
      const item: WireUploadItem = {
        mediaId,
        ghostView,
        kind: 'threed',
        // «не сказано», как у принесённой модели: снимок не заявляет колорвея за человека.
        colorwayId: 0,
        // ОДИН ВИД — НЕ МУЛЬТИВЬЮ, и сервер это скажет сам (`ghost_view` + композит = отказ):
        // лист объявляется ТОЛЬКО четырьмя сторонами.
        compositeViews: mode === 'sides' ? sides : undefined,
        // Снимок ИДЁТ в промпты как любая картинка карточки: это не витринный кадр (D-24), а
        // материал, который режут и селектят.
        displayOnly: false,
      };
      await registerUpload.mutateAsync({ clientRequestId: requestId, items: [item] });
      showMessage(
        mode === 'sides'
          ? `four sides filed on the card as one multi-view (${sides.map(viewLabel).join(', ')}) — it stands in 3D MODELS OF THIS CARD and on the sheet’s 3D tab; split it to select a side`
          : `snapshot filed on the card${ghostView ? ` as a guess of ${viewLabel(ghostView)}` : ''} — it stands in 3D MODELS OF THIS CARD and on the sheet’s 3D tab`,
        'success',
      );
    } catch (e) {
      // `registerUpload` УЖЕ сказал своё слово снекбаром на втором шаге (общий `onError` полосы);
      // первый шаг и сама сцена говорят здесь.
      if (!mediaId) {
        showMessage(
          e instanceof Error && e.message ? e.message : 'the snapshot did not go up',
          'error',
        );
      }
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
            </>
          )}
          <Button asChild variant='secondary' size='xs'>
            <a href={url || '#'} target='_blank' rel='noopener noreferrer' download>
              download the file
            </a>
          </Button>
        </div>

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
