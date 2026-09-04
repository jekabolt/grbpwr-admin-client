import { adminService } from 'api/api';
import { getBase64File } from 'lib/features/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { formatBytes, stripDataUrlPrefix } from 'utils/pattern';

import { InertDoor } from '../bench-slot';
import { TILE_CORNER, TILE_QUIET } from '../picture-tile';
import { CELL_WIDTH, STRIP_FRAME_ASPECT } from '../render/strip-cell';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { MODEL_FILE_ACCEPT, isGlbFile, modelFileError, modelUploadErrorMessage } from './model-file';

/**
 * ═══ ПРИНЕСТИ СВОЮ 3D-МОДЕЛЬ — ДВЕРЬ В ПОЛОСЕ `3D MODELS OF THIS CARD` (E-13) ═════════════════
 *
 * Владелец, дословно: «в 3D в 3D MODELS OF THIS CARD добавь возможность загрузить свою 3d модель».
 * До этой волны .glb попадал на карточку ровно одним путём — выходом ОПЛАЧЕННОГО прогона 3D.
 *
 * ═══ МОДЕЛЬ И ЕЁ ПРЕВЬЮ — ОДИН ОБЪЕКТ, ОДИН ВЫЗОВ (круг 18, D-29) ═══════════════════════════
 *
 * Владелец, дословно: «загрузка своей 3д модели должна принимать .glb + превью-картинку как ОДИН
 * объект».
 *
 * ЧТО СТОЯЛО ЗДЕСЬ. Дверь брала ОДИН файл и отправляла его В МОМЕНТ ВЫБОРА: `.glb` уходил в
 * `UploadContentModel` сразу, а превью подсунуть было некуда — ни входа, ни второго вызова.
 * Модель вставала в полосу словом «3d model» в пустом кадре, и снимок с ракурса к ней можно было
 * только сделать потом, из окна модели. Измерено на стенде (`tmp/dsgprobe/d18r-probe.mjs`, E1/E2):
 * вход без `multiple`, второй файл он не принимает по построению.
 *
 * ЧТО ДАЁТ СЕРВЕР. `UploadContentModelRequest.preview` — необязательный растр (JPEG, PNG, WebP),
 * проверенный по байтам так же строго, как сама модель, и ОДНА строка медиа на выходе: полный
 * слот — `.glb`, сжатый и миниатюра — превью. «ONE CALL, ONE ROW, OR NOTHING: a preview that fails
 * after the model went up takes the model back with it». То есть «один объект» на проводе уже
 * есть; клиентская половина — дать человеку ОДНУ дверь на оба файла и не послать их двумя
 * загрузками подряд с окном рассинхрона между ними.
 *
 * ПОЭТОМУ ЯЧЕЙКА СТАЛА ПОДНОСОМ, А НЕ ВЫКЛЮЧАТЕЛЕМ. Файлы — оба или один — ЛОЖАТСЯ в кадр
 * (бросок, выбор в диалоге с `multiple`, в один жест или в два), кадр показывает, что в нём есть
 * (превью — картинкой, модель — именем и весом), и ОДНА дверь `file it ▸` отправляет пару одним
 * запросом. Без двери отправка происходила бы в момент, когда пара ещё может быть неполной, — а
 * «принесите второй файл» после первого запроса — это и есть два объекта. Модель без превью
 * по-прежнему законна (контракт: «Empty = no preview»), и дверь это говорит подсказкой; превью без
 * модели отправить нечего, и дверь стоит погашенной с этой причиной.
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
 *     тем самым глаголом, который GLB отвергает по построению. И превью здесь по той же причине
 *     НЕ проходит через приёмную модалку: она заводит ОТДЕЛЬНУЮ строку медиа, а превью обязано
 *     ехать байтами ВНУТРИ запроса модели — иначе это второй объект.
 *
 * Поэтому ячейка повторяет ЛИЦО пустого `MediaSlot` — та же полосатая поверхность, та же пунктирная
 * рамка, та же коробка 132 × 148, тот же перевод в чернила по наведению, тот же фокус-контур — и
 * меняет МЕХАНИЗМ на файловый вход, суженный до `.glb` и трёх растров, плюс приём броска.
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

/**
 * ПРЕВЬЮ — ТРИ РАСТРА, КОТОРЫЕ ПРИНИМАЕТ СЕРВЕР: «sniffed by magic bytes (JPEG, PNG or WebP — the
 * three a canvas snapshot produces; an animated GIF, a vector, a model or a video in that field is
 * refused)». Здесь — предполётная вежливость по типу и расширению; байты нюхает сервер.
 */
const PREVIEW_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PREVIEW_EXT = /\.(jpe?g|png|webp)$/i;
const PREVIEW_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
/** Что предлагает файловый диалог: модель И её превью, в один заход. */
export const MODEL_PAIR_ACCEPT = `${MODEL_FILE_ACCEPT},${PREVIEW_ACCEPT}`;

export function isPreviewFile(file: File): boolean {
  return PREVIEW_TYPES.includes(file.type.toLowerCase()) || PREVIEW_EXT.test(file.name);
}

/** Что лежит в кадре. Оба поля пусты — дверь в покое. */
type Staged = { model: File | null; preview: File | null };
const NOTHING: Staged = { model: null, preview: null };

/** Слово состояния подноса — для якоря `data-model-staged` и для проб. */
function stagedWord(s: Staged): string {
  if (s.model && s.preview) return 'model+preview';
  if (s.model) return 'model';
  if (s.preview) return 'preview';
  return '';
}

export type BringOwnModel = {
  /** Ячейка полосы. Ставится ВНУТРЬ `Strip`, первой. */
  cell: JSX.Element;
  /** Сообщение об отказе во всю ширину блока, или `null`. Ставится НАД полосой. */
  notice: JSX.Element | null;
};

/**
 * ОДНА ПАРА ФАЙЛОВ, ДВА ВЫЗОВА, В ЭТОМ ПОРЯДКЕ.
 *
 *   1. `UploadContentModel { raw, preview? }` — байты модели И превью на полку медиатеки ОДНИМ
 *      запросом. Отдаёт `MediaFull`: полный слот — `.glb` (ширина и высота нули), сжатый и
 *      миниатюра — превью, когда оно послано, и снова `.glb`, когда нет.
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
  /** Что лежит в кадре и ещё не отправлено. */
  const [staged, setStaged] = useState<Staged>(NOTHING);
  /** Адрес превью для лица кадра — объектный URL, живущий ровно столько, сколько файл в кадре. */
  const [previewUrl, setPreviewUrl] = useState('');
  /**
   * ═══ БАЙТЫ УЖЕ НА ПОЛКЕ, А ЗАПИСЬ НА КАРТОЧКУ НЕ ПРОШЛА ═══════════════════════════════════
   *
   * Это отдельное состояние, а не «ошибка», и держать его надо. Между двумя вызовами лежит до
   * пятидесяти мегабайт: потеряй мы `media_id`, единственный путь назад — выбрать те же файлы и
   * отправить те же байты ещё раз. `client_request_id` хранится ВМЕСТЕ с ним и НЕ пересоздаётся:
   * сервер делает партию идемпотентной именно по нему, поэтому повтор сходится в одну строку, а
   * свежий id честно завёл бы вторую.
   */
  const [filed, setFiled] = useState<{ mediaId: number; requestId: string } | null>(null);

  useEffect(() => {
    if (!staged.preview) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(staged.preview);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [staged.preview]);

  /** Вторая половина жеста. Отдельной функцией ровно потому, что её повторяют в одиночку. */
  const fileOnCard = useCallback(
    async (mediaId: number, requestId: string) => {
      setBusy('filing');
      try {
        await registerUpload.mutateAsync({
          clientRequestId: requestId,
          items: [
            {
              mediaId,
              ghostView: '',
              kind: 'threed',
              colorwayId: 0,
              // Модель не лист: видов в ней не «склеено», она и есть все виды сразу.
              compositeViews: [],
              // И не «только для показа» (D-24): это предмет карточки, а не файл для витрины.
              displayOnly: false,
            },
          ],
        });
        setFiled(null);
        setError(null);
        // Поднос опустошается только по факту записи: до неё файлы человека остаются в кадре.
        setStaged(NOTHING);
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

  /**
   * ПОЛОЖИТЬ ФАЙЛЫ В КАДР. Каждый файл раскладывается по своему месту — модель к модели, растр к
   * превью, — и второй файл того же рода ЗАМЕНЯЕТ первый: человек, принёсший не тот снимок,
   * приносит другой тем же жестом. Чужой файл отвергается словами, но не роняет соседей из того
   * же броска: пара «модель + notes.txt» оставляет модель в кадре.
   *
   * ⚠ ОТКАЗ ПО РАЗМЕРУ ПРОИСХОДИТ ДО ВСЯКОГО ЗАПРОСА, И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ОН ЧИТАЕМ.
   * Модель крупнее потолка транспорта умирает голым `ResourceExhausted`, то есть без единого
   * слова, по которому человек мог бы что-то сделать. Довод целиком — у `MAX_MODEL_BYTES`.
   */
  const take = useCallback(
    (files: readonly File[]) => {
      if (busy || !files.length) return;
      setError(null);
      setFiled(null);
      const next: Staged = { ...staged };
      const refusals: string[] = [];
      for (const file of files) {
        if (isGlbFile(file)) {
          const refusal = modelFileError(file);
          if (refusal) refusals.push(refusal);
          else next.model = file;
        } else if (isPreviewFile(file)) {
          next.preview = file;
        } else {
          refusals.push(
            `${file.name} is neither a .glb nor a JPEG, PNG or WebP preview — this door takes a model and its still picture, nothing else.`,
          );
        }
      }
      setStaged(next);
      if (refusals.length) {
        setError(refusals.join(' '));
        showMessage(refusals[0], 'error');
      }
    },
    [busy, staged, showMessage],
  );

  /** ОТПРАВИТЬ ПАРУ — одним запросом, с превью или без. */
  const send = useCallback(async () => {
    if (!staged.model || busy) return;
    setError(null);
    setFiled(null);
    setBusy('sending');
    let mediaId = 0;
    const requestId = newClientRequestId();
    try {
      const raw = stripDataUrlPrefix(await getBase64File(staged.model));
      // `undefined`, а не пустая строка: поле не едет вовсе, и это ровно «Empty = no preview»
      // контракта; пустая строка была бы тем же самым, сказанным лишним байтом.
      const preview = staged.preview
        ? stripDataUrlPrefix(await getBase64File(staged.preview))
        : undefined;
      const response = await adminService.UploadContentModel({ raw, preview });
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
  }, [staged, busy, fileOnCard, showMessage]);

  const discard = () => {
    setStaged(NOTHING);
    setError(null);
  };

  const has = stagedWord(staged);
  const word =
    busy === 'sending'
      ? 'sending…'
      : busy === 'filing'
        ? 'filing…'
        : dragging
          ? 'drop the files'
          : staged.model
            ? staged.model.name
            : '+ 3d model';

  const cell = (
    <div
      data-model-upload=''
      data-model-staged={has || undefined}
      className={cn('flex flex-col gap-1', CELL_WIDTH)}
    >
      {/* КАДР САМ И ЕСТЬ ДВЕРЬ, а не коробка с кнопкой под ней: тот же довод, что у пустого слота
          верстака — два органа на один слот заставляют выбирать между ними. Кадр остаётся дверью и
          с файлами внутри: вторая половина пары ложится в него тем же жестом. `group` кормит тихий
          угол ✕ по закону углов примитива плитки. */}
      <div className='group relative'>
        <button
          type='button'
          aria-label='upload your own 3d model, with a preview picture'
          aria-busy={busy ? true : undefined}
          /* ПОЛНАЯ ФРАЗА ПРО ДЕНЬГИ — ЗДЕСЬ. Подпись под кадром держит 24 знака нано-шрифта, и
             «free» это всё, что в неё помещается; предложение целиком стоит на самом кадре. */
          title={
            has
              ? 'drop or pick the other half here — the frame keeps what it has and replaces only what you bring'
              : 'your own .glb and a preview picture beside it: both go up in one request and land on the card as one row. No generator is called, nothing is charged'
          }
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
            take(Array.from(e.dataTransfer?.files ?? []));
          }}
          style={{ ...PLACEHOLDER_SURFACE, aspectRatio: STRIP_FRAME_ASPECT }}
          className={cn(
            placeholderClass({ dashed: true }),
            // ПОДПИСЬ — ЧИТАЕМЫЙ ТЕКСТ: `placeholderClass` красит содержимое в `textInactiveColor`
            // (#ccc), годный для рамок и выключенного, но на полосатом фоне дающий полтора к одному.
            // Здесь это единственное, что объясняет жест.
            'relative w-full cursor-pointer flex-col gap-1 overflow-hidden px-2 text-center text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            // Глиф прячется по ШИРИНЕ САМОЙ ЯЧЕЙКИ, а не по вкусу вызывающего — тем же приёмом, что
            // в `MediaSlot`: в узкой рамке он съедает строку подписи.
            '@container',
            dragging && 'border-textColor text-textColor',
            busy && 'cursor-wait',
          )}
        >
          {previewUrl ? (
            /* ПРЕВЬЮ — ЛИЦОМ КАДРА, как встанет в полосу после записи: человек видит ту же плитку,
               что увидит через секунду, а не обещание её. `contain` на белом: снимок с ракурса —
               предмет на фоне, и поля честнее обрезки. */
            <img
              src={previewUrl}
              alt=''
              className='absolute inset-0 h-full w-full bg-bgColor object-contain'
            />
          ) : (
            <>
              <ModelGlyph className='hidden @[6rem]:block' />
              <span className='line-clamp-2 break-all leading-tight'>{word}</span>
            </>
          )}
          {/* ЯРЛЫК — ТОТ ЖЕ, ЧТО У ПЛИТКИ (левый верх, чернила): говорит, что в кадре лежит, когда
              лицом стоит снимок и слово с кадра ушло. */}
          {previewUrl && (
            <span className='pointer-events-none absolute left-1 top-1 inline-block bg-textColor px-1.5 py-0.5'>
              <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
                {staged.model ? 'model + preview' : 'preview only'}
              </Text>
            </span>
          )}
        </button>
        {/* ВЫЛОЖИТЬ ИЗ КАДРА — тихий угол по закону углов плитки: верх справа, ✕, появляется по
            наведению. Ничего не отправлялось, поэтому вопроса нет. */}
        {has && !busy && (
          <button
            type='button'
            aria-label='take the staged files out of the frame'
            title='take the files out of the frame — nothing was sent'
            data-model-discard=''
            onClick={discard}
            className={cn('absolute right-1 top-1 z-20 py-0.5 leading-none', TILE_CORNER, TILE_QUIET)}
          >
            ✕
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type='file'
        multiple
        accept={MODEL_PAIR_ACCEPT}
        className='sr-only'
        aria-hidden='true'
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Сброс, чтобы повторный выбор ТОГО ЖЕ файла снова поднял `onChange`.
          e.target.value = '';
          take(files);
        }}
      />

      {/* ⚠ ТРИ КОРОТКИЕ СТРОКИ, А НЕ ДВЕ ПЕРЕНЕСЁННЫЕ. Колонка — 132 пикселя, то есть около
          двадцати четырёх знаков нано-шрифта; всякая фраза длиннее ложится в две строки, и
          подпись из двух таких превращает ячейку в четырёхстрочный столбик выше соседей. Каждая
          строка здесь помещается целиком и говорит одно.
          ДЕНЬГИ НАЗЫВАЮТСЯ ЗДЕСЬ, А НЕ ПОДРАЗУМЕВАЮТСЯ: соседние органы этой вкладки покупают
          прогоны, и ячейка, промолчавшая о себе, читалась бы как ещё один из них.
          С файлами в кадре строки называют ЧТО ЛЕЖИТ — модель с весом, превью с именем, — а третью
          строку занимает дверь. */}
      {has ? (
        <>
          <Text size='nano' variant='label' component='span' className='min-w-0 truncate' title={staged.model?.name}>
            {staged.model ? `${staged.model.name} · ${formatBytes(staged.model.size)}` : 'no model yet'}
          </Text>
          <Text size='nano' variant='label' component='span' className='min-w-0 truncate' title={staged.preview?.name}>
            {staged.preview ? `preview · ${staged.preview.name}` : 'no preview · optional'}
          </Text>
          {/* РЯД ДВЕРЕЙ — по правилу полосы (F-14): одна кнопка `secondary/xs` во всю ширину ячейки,
              прижатая к низу. Модели нет — та же дверь стоит погашенной С ПРИЧИНОЙ, а не пропадает:
              человек, положивший один снимок, обязан прочитать, чего не хватает. */}
          <div data-cell-doors='' className='mt-auto pt-0.5'>
            {staged.model ? (
              <Button
                data-model-file=''
                variant='secondary'
                size='xs'
                className='w-full'
                disabled={!!busy}
                onClick={() => void send()}
                title={
                  staged.preview
                    ? 'the model and its preview go up in ONE request and land on the card as one row — nothing is charged'
                    : 'the model goes up without a preview; every list draws it as «3d model» until a still is added — nothing is charged'
                }
              >
                {busy === 'sending' ? 'sending…' : busy === 'filing' ? 'filing…' : 'file it ▸'}
              </Button>
            ) : (
              <span data-model-file='' className='flex w-full [&>span]:flex [&>span]:w-full [&_button]:w-full'>
                <InertDoor
                  label='file it ▸'
                  reason='no model yet — a preview alone is not a model. Drop the .glb onto the frame and the pair goes up together'
                />
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
            <b>bring your own</b> · free
          </Text>
          <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
            .glb + a preview picture
          </Text>
          <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
            drop · browse
          </Text>
        </>
      )}
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
