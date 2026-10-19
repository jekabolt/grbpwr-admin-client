import { ASPECT_RATIOS } from 'constants/constants';
import getCroppedImg, {
  imageFormatOf,
  normaliseImageFormat,
  type CropFrame,
} from 'lib/features/getCropped';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactCrop, { PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button, CalloutBox, Text, EmptyCell, Close } from 'ui';
import './cropper.css';
import { EditorTopBar, editorToolClass, FREE_CHIP, RATIO_CHIPS, RatioChips } from './editor-mobile';

// Ratios are compared with a small tolerance rather than strict equality: ASPECT_RATIOS rounds
// 16:9 to 1.7778, but a caller-supplied ratio computes it as the repeating 16/9 = 1.77778… —
// exact equality would wrongly treat that as "no matching preset".
const RATIO_EPSILON = 0.005;
/** Рамка мельче этой доли от максимальной не имеет смысла: из неё выйдет марка, а не снимок. */
const MIN_SCALE = 0.1;
/** Минимальная рамка в экранных пикселях — чтобы её нельзя было схлопнуть в ничто. */
const MIN_FRAME_PX = 20;
const DEFAULT_LOCKED_ASPECT = 4 / 5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Максимальная рамка пропорции `ratio`, вписанная в коробку пропорции `boxRatio`, в долях
 * СТОРОН коробки. Проценты react-image-crop считаются так же (ширина от ширины, высота от
 * высоты), поэтому эта одна функция описывает и рельс, и ползунок, и пересчёт при смене
 * пропорции — рамке неоткуда разъехаться с цифрами под ней.
 */
function maxFrame(ratio: number | undefined, boxRatio: number) {
  if (!ratio) return { fw: 1, fh: 1 };
  return ratio >= boxRatio ? { fw: 1, fh: boxRatio / ratio } : { fw: ratio / boxRatio, fh: 1 };
}

/** Рамка в процентах: пропорция + размер (доля от максимальной) + центр. */
function buildCrop(
  ratio: number | undefined,
  boxRatio: number,
  scale: number,
  cx: number,
  cy: number,
): PercentCrop {
  const f = maxFrame(ratio, boxRatio);
  const width = clamp(f.fw * 100 * scale, 1, 100);
  const height = clamp(f.fh * 100 * scale, 1, 100);
  return {
    unit: '%',
    width,
    height,
    x: clamp(cx - width / 2, 0, 100 - width),
    y: clamp(cy - height / 2, 0, 100 - height),
  };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** «2400×1350» → «16:9». Когда стороны не сокращаются во что-то читаемое — «1.78:1». */
function ratioLabel(w: number, h: number): string {
  if (!w || !h) return '—';
  const d = gcd(w, h) || 1;
  const a = w / d;
  const b = h / d;
  return Math.max(a, b) > 30 ? `${(w / h).toFixed(2)}:1` : `${a}:${b}`;
}

/** Ближайшая табличная пропорция — чтобы у исходника и у замка была подпись, а не число. */
function presetLabel(value: number): string | undefined {
  return ASPECT_RATIOS.find((r) => Math.abs(r.value - value) < RATIO_EPSILON)?.label;
}

interface CropperInterface {
  selectedFile: string | undefined;
  /** `frame` — where the cut fell in the source (fractions), for hosts that pin marks to it. */
  saveCroppedImage: (croppedImage: string, frame?: CropFrame) => void;
  onCancel: () => void;
  /** Preset crop ratio (e.g. the target slot's ratio). */
  initialAspect?: number;
  /**
   * When true, initialAspect is a REQUIRED ratio (the caller's slot enforces it downstream, e.g.
   * an object-cover box) rather than just a convenient default — the ratio buttons are restricted
   * to that one ratio so the operator can't produce a crop that gets silently re-cropped later.
   */
  lockAspect?: boolean;
  /** When provided, shows a "use without crop" action that assigns the image as-is. */
  onUseOriginal?: () => void;
  /** Disables actions (e.g. while uploading). */
  busy?: boolean;
  /**
   * MIME type of the cropped output. Left out, the format is read off the source itself: the
   * `data:` envelope or the url's extension (`imageFormatOf`), and for a `blob:` url — which
   * carries no name at all — the blob's own type, read inside `getCroppedImg`. Callers that
   * already hold the file say it outright; the intake dialog does, it has `File.type`.
   */
  outputFormat?: string;
  /** Label of the confirm action. */
  saveLabel?: string;
  /** Label of the "use without crop" action. */
  originalLabel?: string;
  /** Drop the cropper's own "crop image" bar when the host dialog already titles the screen. */
  hideHeader?: boolean;
  /**
   * Подвальная строка о том, что кроп рождает НОВЫЙ файл. Значение по умолчанию верно во всех
   * четырёх местах, где живёт кроппер; хост, который знает контекст точнее (очередь, медиатека,
   * слот формы), передаёт свою.
   */
  /**
   * `mobile` — полноэкранная раскладка ниже `lg` (MEDIA-MOBILE, кадр 3): шапка «cancel · title ·
   * save», сцена на всю середину, чипы пропорций и одна строка инструментов. Хост сам решает,
   * когда её просить; по умолчанию — прежняя настольная раскладка, побайтово.
   */
  layout?: 'default' | 'mobile';
  /** Заголовок мобильной шапки. */
  title?: string;
}

export const MediaCropper: FC<CropperInterface> = ({
  selectedFile,
  saveCroppedImage,
  onCancel,
  initialAspect,
  lockAspect = false,
  onUseOriginal,
  busy = false,
  outputFormat,
  saveLabel = 'crop',
  // Кнопка называет ДЕЙСТВИЕ, а не его отсутствие: «без кадрирования» описывало состояние,
  // и рядом с «кадрировать» читалось как отказ, а не как второй способ закончить.
  originalLabel = 'use as is',
  hideHeader = false,
  layout = 'default',
  title = 'crop',
}) => {
  const { showMessage } = useSnackBarStore();

  // Жёсткое требование слота: пропорция одна, менять её нечем и не на что.
  const lockedAspect = lockAspect ? initialAspect ?? DEFAULT_LOCKED_ASPECT : undefined;
  // Без требования слота кадрирование начинается с ПОЛНОГО кадра «свободно»: пока оператор
  // не выбрал пропорцию, ничего не срезано. Раньше здесь молча вставало 4:5, и снимок 16:9
  // открывался уже наполовину отрезанным, без единого слова об этом.
  const startAspect = lockedAspect ?? initialAspect;

  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(startAspect);
  const [crop, setCrop] = useState<PercentCrop | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Новый снимок — новое всё: пропорция, поворот, рамка, ошибки.
  useEffect(() => {
    setNatural(null);
    setCrop(undefined);
    setRotation(0);
    setAspect(startAspect);
    setLoadFailed(false);
    setSaveError(null);
  }, [selectedFile, startAspect]);

  // Размеры исходника снимаются отдельной картинкой: рамку нельзя показать раньше, чем
  // известно, во что она упирается, а <img> на холсте появляется уже посчитанным.
  useEffect(() => {
    if (!selectedFile) return;
    let dead = false;
    const probe = new Image();
    probe.onload = () => {
      if (dead) return;
      setLoadFailed(false);
      setNatural({ w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.onerror = () => {
      if (!dead) setLoadFailed(true);
    };
    probe.src = selectedFile;
    return () => {
      dead = true;
    };
  }, [selectedFile, reloadKey]);

  /**
   * ═══ СЦЕНА МЕРЯЕТСЯ, КОГДА ОНА ПОЯВИЛАСЬ, А НЕ КОГДА СМОНТИРОВАЛСЯ КОМПОНЕНТ ═════════════════
   *
   * ⚠ ЗДЕСЬ СТОЯЛ `useLayoutEffect(..., [])` С `if (!el) return`, И ЭТО БЫЛ ВЕЧНЫЙ «LOADING THE
   * IMAGE» (владелец, r3 п.11: «выбрал картинку → сразу кроп → экран LOADING THE IMAGE навсегда»).
   *
   * ЗАМЕР НА СТЕНДЕ, а не догадка. `MediaRecropDialog` держит адрес источника в СВОЁМ состоянии и
   * заполняет его эффектом ПОСЛЕ первой отрисовки (сначала прямой адрес, потом блоб). Значит на
   * первом кадре `selectedFile === undefined`, и этот компонент выходит через `if (!selectedFile)
   * return null` — сцены в документе нет вовсе. А хуки идут ВЫШЕ раннего возврата (иначе React
   * #310), поэтому эффект с пустыми зависимостями отрабатывал ИМЕННО на том кадре: `stageRef.current`
   * пуст, `return` — и наблюдателя больше не заводит никто. `stage` навсегда `{0,0}`, `disp` навсегда
   * `null`, и ветка рисует «loading the image», хотя картинка загрузилась и её размеры уже стоят в
   * подвале («SOURCE 600×600 · 1:1»). Замерено пробой `probe-pattern.mjs` (сцена F, стенд одного
   * окна): дерево — `loading:false, frame:true`; тот же стенд на файле из HEAD — `loading:true,
   * frame:false` при ИЗМЕРЕННОЙ в документе сцене 866 × 442. То есть коробка была, а состояния не
   * было: дефект — в непроведённом измерении, а не в картинке и не в вёрстке.
   *
   * ⚠ И ЭТО НЕ ОДИН ЭКРАН. Кадр «`media` и `open` истинны в одном коммите» пишет `media/index.tsx`
   * прямо в разметке (`open={!!recropping}`), то есть кроп из просмотрщика медиатеки висел так же.
   * Шаг PATTERN такого кадра больше не производит (кроп открывается отдельным нажатием на углу), и
   * снять причину только там значило бы починить симптом одного вызывающего.
   *
   * ПОЧЕМУ CALLBACK-REF, А НЕ `[selectedFile]` В ЗАВИСИМОСТЯХ. Зависимость лечит ЭТОТ путь, но
   * повторяет ту же ставку: «к моменту эффекта узел уже в документе». Callback-ref вызывается самим
   * React'ом ровно тогда, когда узел появился и когда он исчез, — то есть измерение привязано к
   * СУЩЕСТВОВАНИЮ сцены, а не к номеру отрисовки, и следующий вызывающий с отложенным адресом не
   * воскресит дефект.
   */
  const roRef = useRef<ResizeObserver | null>(null);
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setStage((prev) =>
        Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  // Поворот меняет не картинку, а КАДР: у повёрнутого исходника стороны меняются местами,
  // поэтому дальше всё считается от повёрнутых размеров, а не от натуральных.
  const turned = rotation === 90 || rotation === 270;
  const srcW = natural ? (turned ? natural.h : natural.w) : 0;
  const srcH = natural ? (turned ? natural.w : natural.h) : 0;
  const boxRatio = srcH ? srcW / srcH : 1;

  const disp = useMemo(() => {
    if (!srcW || !srcH || !stage.w || !stage.h) return null;
    const w = Math.min(stage.w, stage.h * boxRatio);
    return { w, h: w / boxRatio };
  }, [srcW, srcH, stage.w, stage.h, boxRatio]);

  useEffect(() => {
    if (!natural || crop) return;
    setCrop(buildCrop(aspect, boxRatio, 1, 50, 50));
  }, [natural, crop, aspect, boxRatio]);

  // Форма текущей рамки: у выбранной пропорции это она сама, у «свободно» — то, что
  // оператор натянул руками. От неё считается «размер кадра», чтобы 100% всегда значило
  // «больше эта форма в снимок не влезет».
  const shapeAspect =
    aspect ?? (crop && crop.height > 0 ? (crop.width * srcW) / (crop.height * srcH) : boxRatio);
  const scale = crop
    ? clamp(crop.width / 100 / maxFrame(shapeAspect, boxRatio).fw, MIN_SCALE, 1)
    : 1;
  const center = crop
    ? { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }
    : { x: 50, y: 50 };

  /**
   * Рамка в пикселях исходника. Ровно эти числа уходят в canvas, поэтому подпись на рамке и
   * строка «результат» не оценка, а размер файла, который получится.
   */
  const rect = useMemo(() => {
    if (!crop || !srcW || !srcH) return null;
    const x = Math.round((crop.x / 100) * srcW);
    const y = Math.round((crop.y / 100) * srcH);
    let width = Math.round((crop.width / 100) * srcW);
    let height = Math.round((crop.height / 100) * srcH);
    if (aspect) {
      // Пропорция задаётся числом с округлением (16:9 = 1.7778), поэтому высота берётся от
      // ширины, а не из процентов: иначе результат уезжает от заявленной пропорции на пиксель.
      height = Math.max(1, Math.round(width / aspect));
      if (y + height > srcH) {
        height = srcH - y;
        width = Math.max(1, Math.round(height * aspect));
      }
    }
    width = clamp(width, 1, srcW - x);
    height = clamp(height, 1, srcH - y);
    return { x, y, width, height };
  }, [crop, srcW, srcH, aspect]);

  const ratios = useMemo(() => {
    const sorted = [...ASPECT_RATIOS].sort((a, b) => b.value - a.value);
    if (!lockedAspect) return sorted;
    const match = sorted.find((r) => Math.abs(r.value - lockedAspect) < RATIO_EPSILON);
    return [match ?? { label: `${lockedAspect.toFixed(2)}:1`, value: lockedAspect }];
  }, [lockedAspect]);

  const applyRatio = useCallback(
    (value: number | undefined) => {
      setAspect(value);
      // «Свободно» — это снятый замок, а не другая пропорция: рамка остаётся ровно там же,
      // просто у неё появляются боковые ручки. Числовая пропорция пересчитывает рамку — но
      // тоже не стирает её: размер и центр остаются, меняется только форма.
      if (value === undefined) return;
      if (natural) setCrop(buildCrop(value, boxRatio, scale, center.x, center.y));
    },
    [natural, boxRatio, scale, center.x, center.y],
  );

  const rotate = useCallback(
    (delta: number) => {
      if (!natural) return;
      const next = (rotation + delta + 360) % 360;
      const nextTurned = next === 90 || next === 270;
      const nw = nextTurned ? natural.h : natural.w;
      const nh = nextTurned ? natural.w : natural.h;
      setRotation(next);
      setCrop(buildCrop(aspect, nw / nh, scale, 50, 50));
    },
    [natural, rotation, aspect, scale],
  );

  const resetFrame = useCallback(() => {
    if (!natural) return;
    setRotation(0);
    setAspect(startAspect);
    setCrop(buildCrop(startAspect, natural.w / natural.h, 1, 50, 50));
    setSaveError(null);
  }, [natural, startAspect]);

  const handleSave = async () => {
    if (!selectedFile || !rect) return;
    setSaveError(null);
    try {
      /* ФОРМАТ НЕ ВЫБИРАЕТСЯ ЗДЕСЬ, А СПРАШИВАЕТСЯ. Раньше эта строка сама решала «`.webp` —
         значит webp, всё остальное — JPEG», и всякий PNG выходил из кропа JPEG'ом, то есть без
         прозрачности. Правило переехало в `imageFormatOf`, а неразобранный адрес (`blob:` —
         библиотека и повторный кроп тянут снимок блобом) кроп дорешает сам по типу блоба: имени
         у объектного адреса нет, а тип есть. */
      const format = normaliseImageFormat(outputFormat) ?? imageFormatOf(selectedFile);
      // Пропорция в getCroppedImg не передаётся намеренно: рамка уже посчитана в целых
      // пикселях, и подгонять её второй раз — значит разойтись с числом, которое подписано
      // на рамке.
      const croppedImage = await getCroppedImg(selectedFile, rect, undefined, format, rotation);
      saveCroppedImage(croppedImage, {
        x: rect.x / srcW,
        y: rect.y / srcH,
        w: rect.width / srcW,
        h: rect.height / srcH,
        rotation,
      });
    } catch (error) {
      console.error('Error cropping image:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'the browser could not cut the frame: the bucket may not have sent a CORS header, or the image is damaged.';
      setSaveError(message);
      showMessage(message, 'error');
    }
  };

  if (!selectedFile) return null;

  // Главная кнопка гаснет только вместе с причиной: раньше причина жила в тосте, до которого
  // при выключенной кнопке было не дойти.
  const blocked = loadFailed || !natural || !rect;
  // …но КАЖДАЯ ПРИЧИНА ГОВОРИТСЯ РОВНО ОДИН РАЗ. Отказ источника стоит красной коробкой прямо
  // над этими кнопками — там же, где «прочитать снова»; загрузка написана словом на самой сцене.
  // Здесь остаётся только то, чего не говорят больше нигде.

  const resultRatio = rect ? (aspect ? presetLabel(aspect) : undefined) : undefined;
  const resultLabel = rect ? resultRatio ?? ratioLabel(rect.width, rect.height) : '—';
  const mobile = layout === 'mobile';
  // Рамка во весь кадр без поворота — это тот же файл: копию такого «кропа» делать незачем.
  const noChange =
    !!rect &&
    rotation === 0 &&
    rect.x === 0 &&
    rect.y === 0 &&
    rect.width === srcW &&
    rect.height === srcH;

  const stageContent =
    disp && !loadFailed ? (
      <ReactCrop
        className='crop-rc'
        crop={crop}
        aspect={aspect}
        onChange={(pixelCrop, percentCrop) => {
          // Нажатие без протяжки библиотека объявляет рамкой 0×0 — то самое молчаливое
          // стирание кадра, из-за которого раньше приходилось начинать заново. Пустая
          // рамка не принимается: клик мимо оставляет всё как было, а протяжка растёт
          // из точки нажатия и приезжает сюда уже настоящей.
          if (pixelCrop.width < 1 || pixelCrop.height < 1) return;
          setCrop(percentCrop);
        }}
        ruleOfThirds
        minWidth={MIN_FRAME_PX}
        minHeight={MIN_FRAME_PX}
        disabled={busy}
      >
        <div style={{ width: disp.w, height: disp.h }} className='relative overflow-hidden'>
          <img
            src={selectedFile}
            alt=''
            draggable={false}
            className='select-none'
            style={
              turned
                ? {
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: disp.h,
                    height: disp.w,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    transform: `translate(-50%,-50%) rotate(${rotation}deg)`,
                  }
                : {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: disp.w,
                    height: disp.h,
                    transform: rotation === 180 ? 'rotate(180deg)' : undefined,
                  }
            }
          />
        </div>
      </ReactCrop>
    ) : loadFailed ? null : (
      // Про отказ источника сцена молчит: он сказан красной коробкой в подвале, вместе
      // с причиной и кнопкой «прочитать снова». Здесь остаётся только ожидание.
      <Text size='micro' variant='uppercase' className='text-bgColor'>
        loading the image
      </Text>
    );

  const loadFailedBox = loadFailed && (
    <CalloutBox tone='error'>
      <Text size='micro' component='span'>
        source not loading
      </Text>
      <Button
        type='button'
        variant='secondary'
        size='xs'
        className='ml-2 inline-block cursor-pointer align-middle'
        onClick={() => {
          setLoadFailed(false);
          setReloadKey((k) => k + 1);
        }}
      >
        load again
      </Button>
    </CalloutBox>
  );
  const saveErrorBox = saveError && !loadFailed && (
    <CalloutBox tone='error'>
      <Text size='micro' component='span'>
        <b>cropping failed.</b> {saveError}
      </Text>
    </CalloutBox>
  );

  const chipOptions = lockedAspect
    ? [{ key: ratios[0].label, label: ratios[0].label, value: ratios[0].value }]
    : [FREE_CHIP, ...RATIO_CHIPS];
  const selectedChip =
    aspect === undefined
      ? FREE_CHIP.key
      : chipOptions.find((o) => o.value !== undefined && Math.abs(o.value - aspect) < RATIO_EPSILON)
          ?.key;

  if (mobile) {
    return (
      <div className='flex h-full min-h-0 w-full flex-col'>
        <EditorTopBar
          title={title}
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={blocked || noChange}
          busy={busy}
          saveLabel={saveLabel}
        />
        <div className='crop-stage crop-stage-mobile relative min-h-0 flex-1 touch-none overflow-hidden p-6'>
          <div ref={stageRef} className='relative flex h-full w-full items-center justify-center'>
            {stageContent}
          </div>
        </div>
        {(loadFailedBox || saveErrorBox) && (
          <div className='shrink-0 px-2.5 pb-2'>
            {loadFailedBox}
            {saveErrorBox}
          </div>
        )}
        <div className='flex shrink-0 flex-col gap-2.5 border-t border-bgColor/20 pt-2.5 pb-3'>
          <RatioChips
            options={chipOptions}
            selected={selectedChip}
            disabled={!natural || busy}
            onSelect={(o) => applyRatio(o.value)}
          />
          <div className='flex items-center gap-1.5 px-2.5'>
            <Button
              type='button'
              variant={null}
              className={editorToolClass}
              onClick={() => rotate(90)}
              disabled={!natural || busy}
            >
              ↻ rotate
            </Button>
            <Button
              type='button'
              variant={null}
              className={editorToolClass}
              onClick={resetFrame}
              disabled={!natural || busy}
            >
              reset
            </Button>
            <span className='ml-auto text-control tabular-nums text-bgColor'>
              {!rect ? (
                <EmptyCell />
              ) : noChange ? (
                'no change'
              ) : (
                `${rect.width}×${rect.height} · ${resultLabel}`
              )}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col gap-2.5'>
      {!hideHeader && (
        <div className='flex items-center justify-between border-b border-hairline pb-2'>
          <Text component='h3' variant='uppercase' tracking='section' className='font-bold'>
            {title}
          </Text>
          <Close onClick={onCancel} />
        </div>
      )}
      <div className='crop-stage relative flex h-[62vh] w-full items-center justify-center overflow-hidden border border-borderColor bg-pageBg p-6'>
        <div ref={stageRef} className='relative flex h-full w-full items-center justify-center'>
          {stageContent}
        </div>
      </div>
      {loadFailedBox}
      {saveErrorBox}
      <RatioChips
        tone='light'
        options={chipOptions}
        selected={selectedChip}
        disabled={!natural || busy}
        onSelect={(o) => applyRatio(o.value)}
      />
      <div className='flex flex-wrap items-center gap-2 px-2.5'>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='cursor-pointer uppercase'
          onClick={() => rotate(90)}
          disabled={!natural || busy}
        >
          ↻ rotate
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='cursor-pointer uppercase'
          onClick={resetFrame}
          disabled={!natural || busy}
        >
          reset
        </Button>
        <Text size='micro' variant='label' component='span' className='tabular-nums'>
          {!rect ? (
            <EmptyCell />
          ) : noChange ? (
            'no change'
          ) : (
            `${rect.width}×${rect.height} · ${resultLabel}`
          )}
        </Text>
        <div className='ml-auto flex flex-wrap items-center gap-2'>
          {onUseOriginal && (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='cursor-pointer uppercase'
              onClick={onUseOriginal}
              disabled={busy}
            >
              {originalLabel}
            </Button>
          )}
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='cursor-pointer uppercase'
            onClick={onCancel}
            disabled={busy}
          >
            cancel
          </Button>
          <Button
            type='button'
            size='lg'
            variant='main'
            className='cursor-pointer uppercase'
            onClick={handleSave}
            disabled={blocked || busy || (noChange && !onUseOriginal)}
            loading={busy}
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
