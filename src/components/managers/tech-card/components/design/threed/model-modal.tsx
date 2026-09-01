import { useEffect, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { formatBytes } from 'utils/pattern';

import { ModelViewer, type ModelFacts } from './model-viewer';

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
 */
export function ThreedModelModal({
  url,
  title,
  onClose,
}: {
  /** Адрес `.glb`. `null` — окно закрыто. */
  url: string | null;
  title?: string;
  onClose: () => void;
}): JSX.Element {
  const [facts, setFacts] = useState<ModelFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

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
      <div className='space-y-2'>
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
                <ModelViewer url={url} onReady={setFacts} onError={setError} />
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
            Drag to orbit, scroll to zoom, right-drag to pan.
          </Text>
        )}
      </div>
    </ConfirmationModal>
  );
}
