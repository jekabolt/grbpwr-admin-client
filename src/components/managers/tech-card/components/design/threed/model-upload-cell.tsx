import { adminService } from 'api/api';
import { getBase64File } from 'lib/features/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { stripDataUrlPrefix } from 'utils/pattern';

import { CELL_WIDTH, STRIP_FRAME_ASPECT } from '../render/strip-cell';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { MODEL_FILE_ACCEPT, modelFileError, modelUploadErrorMessage } from './model-file';

/**
 * ═══ ПРИНЕСТИ СВОЮ 3D-МОДЕЛЬ — ДВЕРЬ В ПОЛОСЕ `3D MODELS OF THIS CARD` (E-13) ═════════════════
 *
 * Владелец, дословно: «в 3D в 3D MODELS OF THIS CARD добавь возможность загрузить свою 3d модель».
 * До этой волны .glb попадал на карточку ровно одним путём — выходом ОПЛАЧЕННОГО прогона 3D.
 *
 * ═══ ПОЧЕМУ ЭТО НЕ `MediaSlot`, ХОТЯ ВЫГЛЯДИТ ИМ ═══════════════════════════════════════════════
 *
 * «Плейсхолдер ячейкой полосы» — устоявшийся приём (`+ flat` в `render/render-input-strip.tsx`), и
 * ЛИЦО здесь взято у него дословно. А вот МЕХАНИЗМ взять было нельзя, и это ЗАМЕРЕНО по трём его
 * собственным дверям, каждая из которых упирается в растр:
 *
 *   · БИБЛИОТЕКА. Клик открывает `MediaSelector` над медиатекой, а она рисует каждую строку
 *     `<img>`/`<video>`: `filterExtensionToContentType` (`lib/features/filterExtentions.ts`) знает
 *     семь расширений, и `glb` среди них нет — значит `isVideo` ложь, и строка модели рисуется
 *     битой картинкой. Пикер, который не может ПОКАЗАТЬ файл, не может им и выбрать.
 *   · ⌘V И БРОСОК. Оба идут через `useMediaIntake` → `filesOfKind(files, 'image')`, а это
 *     `f.type.startsWith('image/')` (`media/utils/usePasteFiles.ts`). У .glb тип
 *     `model/gltf-binary` или пусто — файл отбрасывается МОЛЧА, без единого слова на экране.
 *   · И ДАЖЕ ЕСЛИ БЫ ПРОШЁЛ. Приёмная модалка кропает кадр и грузит его `UploadContentImage` —
 *     тем самым глаголом, который GLB отвергает по построению («the image verb refuses a GLB …
 *     precisely so that no client can talk its way into the model branch»).
 *
 * Поэтому ячейка повторяет ЛИЦО пустого `MediaSlot` — та же полосатая поверхность, та же пунктирная
 * рамка, та же коробка 132 × 148, тот же перевод в чернила по наведению, тот же фокус-контур — и
 * меняет МЕХАНИЗМ на файловый вход, суженный до `.glb`, плюс приём броска.
 *
 * ⚠ СТРОКА ЖЕСТОВ НЕ ОБЕЩАЕТ ⌘V, И ЭТО НЕ ЭКОНОМИЯ, А ЧЕСТНОСТЬ. Буфер обмена файла модели не
 * несёт: браузер кладёт туда изображение или текст, и объявленный жест, который не сработает ни
 * разу, — это сломанная дверь по определению.
 *
 * ═══ ПОЧЕМУ ЭТО ХУК, ОТДАЮЩИЙ ДВА УЗЛА, А НЕ ОДИН КОМПОНЕНТ ═══════════════════════════════════
 *
 * Отказ здесь — ТЕКСТ В НЕСКОЛЬКО ПРЕДЛОЖЕНИЙ («модель 51 MB, потолок 50 MB, вот что с этим
 * делать»), и в колонке шириной 132 пикселя он встаёт красной стеной в восемь строк, которая выше
 * самого кадра. Замерено снимком. Место такому сообщению в системе одно — `CalloutBox` во всю
 * ширину блока, и он обязан стоять ВНЕ полосы.
 *
 * Значит у двери два узла в разных местах документа, и отдаются они тем же приёмом, каким этот же
 * файл-хозяин уже получает окно разреза (`useSplitToInput` → `split.modal`): хук держит состояние,
 * вызывающий ставит `cell` внутрь полосы, а `notice` — над ней. Дверь повтора при этом стоит В
 * САМОМ сообщении, а не в ячейке: разносить объяснение и действие по разным углам — ровно тот
 * дефект, за который в соседнем файле снесена дверь «split first ▸».
 *
 * ═══ ЗДЕСЬ НЕ ТРАТИТСЯ НИЧЕГО, И ЭТО СКАЗАНО НА ЭКРАНЕ ════════════════════════════════════════
 *
 * Ячейка стоит среди органов, каждый из которых стоит денег (прогон 3D — доллар с лишним), и
 * молчание читалось бы как «ещё одна кнопка генерации». Сама модель, встав в полосу, носит ТОТ ЖЕ
 * штамп «не куплено», что и рендер, принесённый руками, и штамп НЕ ИЗОБРЕТЁН ЗДЕСЬ — его чеканит
 * контракт: у строки `run_id = 0`, `run_kind = ""`, `run_rrev = 0`, и раздел печатает по ним
 * `no run · 3d model`, а второй строкой — `uploaded` из `source_class`.
 *
 * ═══ ЧТО ЭТА МОДЕЛЬ УМЕЕТ, А ЧЕГО НЕ УМЕЕТ ════════════════════════════════════════════════════
 *
 * Смотреть, держать, скачать. И НЕ БОЛЬШЕ: входом платного прогона она не становится ни при каком
 * жесте, и это решение, а не пробел. Сервер запирает его с двух сторон — вход прогона, чей
 * названный носитель не картинка, отвергается БЕСПЛАТНО до резерва (`input_not_a_picture`), а кадр
 * рода `threed` может стоять только в `threed`-слоте верстака, который не читает ни один отбор
 * входов (`designSelectBench` берёт flat- или render-слоты, никогда threed). Экран этому зеркало:
 * двери `mark ▸` у рода `threed` в разделе выходов нет вовсе.
 */

/** Глиф кадра. Куб, а не фотография: фотография обещала бы, что сюда кладут картинку. */
function ModelGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox='0 0 24 24'
      aria-hidden='true'
      className={cn('h-5 w-5', className)}
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
    >
      <path d='M12 2.75 20.5 7v10L12 21.25 3.5 17V7z' />
      <path d='M3.5 7 12 11.25 20.5 7' />
      <path d='M12 11.25v10' />
    </svg>
  );
}

export type BringOwnModel = {
  /** Ячейка полосы. Ставится ВНУТРЬ `Strip`, первой. */
  cell: JSX.Element;
  /** Сообщение об отказе во всю ширину блока, или `null`. Ставится НАД полосой. */
  notice: JSX.Element | null;
};

/**
 * ОДИН ФАЙЛ, ДВА ВЫЗОВА, В ЭТОМ ПОРЯДКЕ.
 *
 *   1. `UploadContentModel { raw }` — байты на полку медиатеки. Отдаёт `MediaFull`, у которого все
 *      три слота адреса указывают на один `.glb`, а ширина и высота нули: кадра, который можно
 *      было бы уменьшить, у модели нет.
 *   2. `RegisterDesignUpload { items: [{ media_id, kind: 'threed' }] }` — та же дверь, что заводит
 *      на карточку принесённый руками рендер. БЕЗ `ghost_view` (у модели нет вида: она и есть все
 *      виды сразу), БЕЗ `target` (слот верстака ей не адресуется) и с колорвеем НОЛЬ — не «ещё не
 *      проставлен», а «не сказано»: принесённая модель не заявляет цвета, и заявить его за
 *      человека значило бы приписать карточке решение, которого он не принимал.
 */
export function useBringOwnModel(techCardId: number): BringOwnModel {
  const { showMessage } = useSnackBarStore();
  const { registerUpload } = useDesignWrites(techCardId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'sending' | 'filing'>('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * ═══ БАЙТЫ УЖЕ НА ПОЛКЕ, А ЗАПИСЬ НА КАРТОЧКУ НЕ ПРОШЛА ═══════════════════════════════════
   *
   * Это отдельное состояние, а не «ошибка», и держать его надо. Между двумя вызовами лежит до
   * пятидесяти мегабайт: потеряй мы `media_id`, единственный путь назад — выбрать тот же файл и
   * отправить те же байты ещё раз. `client_request_id` хранится ВМЕСТЕ с ним и НЕ пересоздаётся:
   * сервер делает партию идемпотентной именно по нему, поэтому повтор сходится в одну строку, а
   * свежий id честно завёл бы вторую.
   */
  const [filed, setFiled] = useState<{ mediaId: number; requestId: string } | null>(null);

  /** Вторая половина жеста. Отдельной функцией ровно потому, что её повторяют в одиночку. */
  const fileOnCard = useCallback(
    async (mediaId: number, requestId: string) => {
      setBusy('filing');
      try {
        await registerUpload.mutateAsync({
          clientRequestId: requestId,
          items: [{ mediaId, ghostView: '', kind: 'threed', colorwayId: 0 }],
        });
        setFiled(null);
        setError(null);
        showMessage('the model is on the card', 'success');
      } catch {
        // `registerUpload` УЖЕ сказал своё слово снекбаром (общий `onError` полосы), и второе
        // всплывающее сообщение о том же отказе было бы одним фактом, сказанным дважды. Здесь
        // остаётся то, чего снекбар не умеет: сообщение, которое НЕ ИСЧЕЗАЕТ, и дверь повтора.
        setFiled({ mediaId, requestId });
        setError(
          'the model is stored but it did not land on the card. The bytes are safe — nothing needs uploading again.',
        );
      } finally {
        setBusy('');
      }
    },
    [registerUpload, showMessage],
  );

  const take = useCallback(
    async (file: File | undefined | null) => {
      if (!file || busy) return;
      setError(null);
      setFiled(null);
      // ⚠ ОТКАЗ ПРОИСХОДИТ ДО ВСЯКОГО ЗАПРОСА, И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ОН ЧИТАЕМ. Модель
      // крупнее потолка транспорта умирает голым `ResourceExhausted` (или HTTP 400 на теле), то
      // есть без единого слова, по которому человек мог бы что-то сделать. Довод целиком — у
      // `MAX_MODEL_BYTES` в `./model-file.ts`.
      const refusal = modelFileError(file);
      if (refusal) {
        setError(refusal);
        showMessage(refusal, 'error');
        return;
      }
      setBusy('sending');
      let mediaId = 0;
      const requestId = newClientRequestId();
      try {
        const raw = stripDataUrlPrefix(await getBase64File(file));
        const response = await adminService.UploadContentModel({ raw });
        mediaId = response.media?.id ?? 0;
        if (!mediaId) throw new Error('the model went up but came back without an id');
      } catch (e) {
        const message = modelUploadErrorMessage(e);
        setError(message);
        showMessage(message, 'error');
        setBusy('');
        return;
      }
      await fileOnCard(mediaId, requestId);
    },
    [busy, fileOnCard, showMessage],
  );

  const label = busy === 'sending' ? 'sending…' : busy === 'filing' ? 'filing…' : '+ 3d model';

  const cell = (
    <div data-model-upload='' className={cn('flex flex-col gap-1', CELL_WIDTH)}>
      {/* КАДР САМ И ЕСТЬ ДВЕРЬ, а не коробка с кнопкой под ней: тот же довод, что у пустого слота
          верстака — два органа на один слот заставляют выбирать между ними. */}
      <button
        type='button'
        aria-label='upload your own 3d model'
        aria-busy={busy ? true : undefined}
        /* ПОЛНАЯ ФРАЗА ПРО ДЕНЬГИ — ЗДЕСЬ. Подпись под кадром держит 24 знака нано-шрифта, и
           «free» это всё, что в неё помещается; предложение целиком стоит на самом кадре. */
        title='your own file, filed onto the card as it is — no generator is called and nothing is charged'
        disabled={!!busy}
        data-model-upload-door=''
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void take(e.dataTransfer?.files?.[0]);
        }}
        style={{ ...PLACEHOLDER_SURFACE, aspectRatio: STRIP_FRAME_ASPECT }}
        className={cn(
          placeholderClass({ dashed: true }),
          // ПОДПИСЬ — ЧИТАЕМЫЙ ТЕКСТ: `placeholderClass` красит содержимое в `textInactiveColor`
          // (#ccc), годный для рамок и выключенного, но на полосатом фоне дающий полтора к одному.
          // Здесь это единственное, что объясняет жест.
          'w-full cursor-pointer flex-col gap-1 px-2 text-center text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
          // Глиф прячется по ШИРИНЕ САМОЙ ЯЧЕЙКИ, а не по вкусу вызывающего — тем же приёмом, что
          // в `MediaSlot`: в узкой рамке он съедает строку подписи.
          '@container',
          dragging && 'border-textColor text-textColor',
          busy && 'cursor-wait',
        )}
      >
        <ModelGlyph className='hidden @[6rem]:block' />
        <span className='leading-tight'>{dragging && !busy ? 'drop the model' : label}</span>
      </button>

      <input
        ref={inputRef}
        type='file'
        accept={MODEL_FILE_ACCEPT}
        className='sr-only'
        aria-hidden='true'
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Сброс, чтобы повторный выбор ТОГО ЖЕ файла снова поднял `onChange`.
          e.target.value = '';
          void take(file);
        }}
      />

      {/* ⚠ ТРИ КОРОТКИЕ СТРОКИ, А НЕ ДВЕ ПЕРЕНЕСЁННЫЕ. Колонка — 132 пикселя, то есть около
          двадцати четырёх знаков нано-шрифта; всякая фраза длиннее ложится в две строки, и
          подпись из двух таких превращает ячейку в четырёхстрочный столбик выше соседей. Каждая
          строка здесь помещается целиком и говорит одно.
          ДЕНЬГИ НАЗЫВАЮТСЯ ЗДЕСЬ, А НЕ ПОДРАЗУМЕВАЮТСЯ: соседние органы этой вкладки покупают
          прогоны, и ячейка, промолчавшая о себе, читалась бы как ещё один из них. */}
      <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
        <b>bring your own</b> · free
      </Text>
      <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
        .glb up to 50 MB
      </Text>
      <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
        drop · browse
      </Text>
    </div>
  );

  const notice = error ? (
    <CalloutBox tone='error'>
      <div data-model-notice='' className='flex flex-wrap items-center gap-2'>
        {/* ПРЕДЕЛ ДЛИНЫ СТРОКИ. Коробка тянется во всю ширину блока — замерено 1096 пикселей,
            около полутора сотен знаков в строке. И `flex-1` здесь не нужен: без него дверь
            повтора встаёт СРАЗУ ЗА фразой, а не у противоположного края экрана. */}
        <Text size='micro' component='p' className='min-w-0 max-w-[78ch] normal-case'>
          {error}
        </Text>
        {filed && (
          /* ДВЕРЬ ПОВТОРА СТОИТ В САМОМ СООБЩЕНИИ. Объяснение без действия рядом — это самый
             дорогой вид мёртвого контрола: оно занимает место, где жест и ожидается. */
          <Button
            variant='secondary'
            size='xs'
            disabled={!!busy}
            onClick={() => void fileOnCard(filed.mediaId, filed.requestId)}
            title='the same bytes and the same request id — the server files this batch once, however many times it is asked'
          >
            file it again ▸
          </Button>
        )}
      </div>
    </CalloutBox>
  ) : null;

  return { cell, notice };
}
