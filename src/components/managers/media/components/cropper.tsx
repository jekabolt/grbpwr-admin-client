import { ASPECT_RATIOS } from 'constants/constants';
import getCroppedImg from 'lib/features/getCropped';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactCrop, { PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import { Row } from 'ui/components/row';
import { SideRailGroup, SideRailItem } from 'ui/components/side-rail';
import Text from 'ui/components/text';
import './cropper.css';

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
  saveCroppedImage: (croppedImage: string) => void;
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
   * MIME type of the cropped output. Defaults to guessing from the source url's extension, which
   * only works for library media — a pasted or dropped file arrives as a `blob:` url with no
   * extension at all, and guessing JPEG there flattens a screenshot's transparency without asking.
   * Callers that know the source type (the intake dialog does — it holds the File) pass it.
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
  footerNote?: ReactNode;
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
  footerNote,
}) => {
  const { showMessage } = useSnackBarStore();

  // Жёсткое требование слота: пропорция одна, менять её нечем и не на что.
  const lockedAspect = lockAspect ? (initialAspect ?? DEFAULT_LOCKED_ASPECT) : undefined;
  // Без требования слота кадрирование начинается с ПОЛНОГО кадра «свободно»: пока оператор
  // не выбрал пропорцию, ничего не срезано. Раньше здесь молча вставало 4:5, и снимок 16:9
  // открывался уже наполовину отрезанным, без единого слова об этом.
  const startAspect = lockedAspect ?? initialAspect;

  const stageRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    const el = stageRef.current;
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
    return () => ro.disconnect();
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

  const applyScale = useCallback(
    (next: number) => {
      if (!natural) return;
      setCrop(buildCrop(shapeAspect, boxRatio, clamp(next, MIN_SCALE, 1), center.x, center.y));
    },
    [natural, shapeAspect, boxRatio, center.x, center.y],
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

  const recenter = useCallback(() => {
    if (!natural) return;
    setCrop(buildCrop(shapeAspect, boxRatio, scale, 50, 50));
  }, [natural, shapeAspect, boxRatio, scale]);

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
      const format = outputFormat ?? (selectedFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
      // Пропорция в getCroppedImg не передаётся намеренно: рамка уже посчитана в целых
      // пикселях, и подгонять её второй раз — значит разойтись с числом, которое подписано
      // на рамке.
      const croppedImage = await getCroppedImg(selectedFile, rect, undefined, format, rotation);
      saveCroppedImage(croppedImage);
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
  const blockedReason = !loadFailed && natural && !rect ? 'no frame set' : null;

  const lostShare = rect && srcW && srcH ? 1 - (rect.width * rect.height) / (srcW * srcH) : 0;
  const lostLabel = rect
    ? lostShare > 0.005
      ? `−${Math.round(lostShare * 100)}%`
      : 'full'
    : '—';
  const resultRatio = rect ? (aspect ? presetLabel(aspect) : undefined) : undefined;
  const resultLabel = rect ? (resultRatio ?? ratioLabel(rect.width, rect.height)) : '—';
  const sourceRatio = srcW && srcH ? (presetLabel(srcW / srcH) ?? ratioLabel(srcW, srcH)) : '—';
  const capBelow = (crop?.y ?? 0) < 6;

  return (
    <div className='flex w-full flex-col gap-3'>
      {!hideHeader && (
        <div className='flex items-center justify-between border-b border-hairline pb-2'>
          {/* Заголовок ПАНЕЛИ, а не страницы: 12px жирным прописным, как `SectionHeader`.
              18px в этой системе отданы одному заголовку страницы. */}
          <Text component='h3' variant='uppercase' tracking='section' className='font-bold'>
            crop image
          </Text>
          <Button className='cursor-pointer py-1' onClick={onCancel}>
            [x]
          </Button>
        </div>
      )}

      <div className='grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_224px] lg:items-start'>
        <div className='min-w-0'>
          <div className='crop-stage relative flex aspect-[3/2] max-h-[52vh] w-full items-center justify-center overflow-hidden border border-borderColor bg-bgSecondary p-3'>
            <div aria-hidden className='pointer-events-none absolute inset-0 bg-textColor/55' />
            <div ref={stageRef} className='relative flex h-full w-full items-center justify-center'>
              {disp && !loadFailed ? (
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
                  renderSelectionAddon={() =>
                    rect ? (
                      <span
                        className={cn(
                          'pointer-events-none absolute -left-px whitespace-nowrap bg-textColor px-1 text-nano uppercase tracking-label text-bgColor',
                          capBelow ? 'top-0' : 'bottom-full mb-0.5',
                        )}
                      >
                        {rect.width}×{rect.height} · {resultLabel}
                      </span>
                    ) : null
                  }
                >
                  <div
                    style={{ width: disp.w, height: disp.h }}
                    className='relative overflow-hidden'
                  >
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
              )}
            </div>
          </div>
          <Text size='nano' variant='label' className='mt-1.5'>
            drag the frame to move it, the handles resize it, a drag across the image draws a new
            one · the gesture is the same for every ratio, “free” only takes the lock off · the
            rule-of-thirds guides are always on
          </Text>
        </div>

        <div className='flex flex-col'>
          {/* Капсом — только метка группы. Требование слота это фраза, а не метка, поэтому оно
              стоит рядом обычным текстом. */}
          <SideRailGroup
            flush
            action={
              lockedAspect ? (
                <Text size='nano' variant='label' component='span'>
                  the slot requires {ratios[0].label}
                </Text>
              ) : undefined
            }
          >
            ratios
          </SideRailGroup>
          {ratios.map((r) => {
            const f = maxFrame(r.value, boxRatio);
            const w = Math.round(srcW * Math.min(1, f.fw * scale));
            const h = Math.round(srcH * Math.min(1, f.fh * scale));
            return (
              <SideRailItem
                key={r.label}
                className='text-control uppercase tracking-label'
                selected={aspect !== undefined && Math.abs(aspect - r.value) < RATIO_EPSILON}
                onClick={() => applyRatio(r.value)}
                label={
                  <span className='flex items-center gap-1.5'>
                    <RatioGlyph width={r.value * 100} height={100} size={12} />
                    {r.label}
                    {lockedAspect ? ' *' : ''}
                  </span>
                }
                count={natural ? `${w}×${h}` : '—'}
              />
            );
          })}

          {!lockedAspect && (
            <>
              <SideRailGroup>no ratio</SideRailGroup>
              <SideRailItem
                className='text-control uppercase tracking-label'
                selected={aspect === undefined}
                onClick={() => applyRatio(undefined)}
                label={
                  <span className='flex items-center gap-1.5'>
                    <span
                      aria-hidden
                      className='inline-block h-2 w-3 shrink-0 border border-dashed border-current'
                    />
                    free
                  </span>
                }
                count={aspect === undefined && rect ? `${rect.width}×${rect.height}` : undefined}
              />
              <Text size='nano' variant='label' className='mt-1'>
                not a ratio, but the absence of one
              </Text>
            </>
          )}

          <SideRailGroup>frame</SideRailGroup>
          <div className='flex items-baseline justify-between gap-2'>
            <Text size='nano' variant='label' component='span'>
              frame size
            </Text>
            <Text size='micro' component='span' className='tabular-nums'>
              {Math.round(scale * 100)}%
            </Text>
          </div>
          <div className='mt-1 flex items-center gap-1.5'>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              className='cursor-pointer'
              onClick={() => applyScale(scale - 0.1)}
              disabled={!natural || scale <= MIN_SCALE + 0.001}
            >
              −
            </Button>
            <input
              type='range'
              min={MIN_SCALE * 100}
              max={100}
              step={1}
              value={Math.round(scale * 100)}
              disabled={!natural}
              aria-label='frame size'
              className='crop-range h-4 min-w-0 flex-1'
              onChange={(e) => applyScale(Number(e.target.value) / 100)}
            />
            <Button
              type='button'
              variant='secondary'
              size='xs'
              className='cursor-pointer'
              onClick={() => applyScale(scale + 0.1)}
              disabled={!natural || scale >= 0.999}
            >
              +
            </Button>
          </div>
          <div className='mt-1.5 flex flex-wrap gap-1'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              onClick={() => rotate(-90)}
              disabled={!natural}
            >
              ↺ 90°
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              onClick={() => rotate(90)}
              disabled={!natural}
            >
              ↻ 90°
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              onClick={recenter}
              disabled={!natural}
            >
              centre frame
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              onClick={resetFrame}
              disabled={!natural}
            >
              reset frame
            </Button>
          </div>

          <SideRailGroup>what you get</SideRailGroup>
          <SummaryRow label='source' value={natural ? `${srcW}×${srcH} · ${sourceRatio}` : '—'} />
          <SummaryRow
            label='result'
            value={rect ? `${rect.width}×${rect.height} · ${resultLabel}` : '—'}
          />
          <SummaryRow label='area' value={lostLabel} />
          <SummaryRow label='rotation' value={rotation ? `${rotation}°` : 'none'} />
        </div>
      </div>

      <div className='flex flex-col gap-2 border-t border-hairline pt-2.5'>
        {loadFailed && (
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              <b>the source will not load.</b> There is nothing for the browser to cut: the image
              never opened — the bucket may not have sent a CORS header, or the url is dead.
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
        )}
        {saveError && !loadFailed && (
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              <b>cropping failed.</b> {saveError}
            </Text>
          </CalloutBox>
        )}

        <Text size='nano' variant='label'>
          {footerNote ??
            'cropping does not touch the source: the frame produces a NEW file, and that is the one that goes to the bucket.'}
        </Text>

        <div className='flex flex-wrap items-center gap-2'>
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
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {rect ? `${rect.width}×${rect.height}` : '—'}
          </Text>
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            {blockedReason && (
              <Text size='micro' variant='label' component='span'>
                {blockedReason}
              </Text>
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
              disabled={blocked || busy}
              loading={busy}
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Row
      className='py-0.5'
      label={
        <Text size='nano' variant='label' component='span' tracking='label' className='uppercase'>
          {label}
        </Text>
      }
      value={
        <Text size='micro' component='span'>
          {value}
        </Text>
      }
    />
  );
}
