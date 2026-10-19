import { cn } from 'lib/utility';
import { FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CalloutBox,
  Close,
  EmptyCell,
  Input,
  RatioGlyph,
  SideRailGroup,
  Text,
  ViewSwitch,
  type ViewSwitchOption,
} from 'ui';

import {
  DEFAULT_BACKGROUND,
  loadSourcePixels,
  marginsForRatio,
  normaliseHex,
  NO_MARGINS,
  type Margins,
  type SourcePixels,
} from '../utils/getExpanded';
import { MAX_IMAGE_MEGAPIXELS } from '../utils/useUploadMedia';
import { FREE_CHIP, RatioChips, type RatioOption } from './editor-mobile';
import { ExpandHandles, type ExpandDragMode } from './expand-handles';

/**
 * ОБРАТНЫЙ КРОП — «расширить рамку и залить поля цветом».
 *
 * ЗЕРКАЛО КРОППЕРА, И НАМЕРЕННО ЕГО ЖЕ ГРАММАТИКА: та же двухколонка «сцена + рельс», тот же
 * рельс пропорций с теми же глифами, та же сводка «what you get», тот же подвал. Оператор,
 * знающий кроп, не учит второй орган — он узнаёт первый, у которого знак поменялся.
 *
 * ОДНА ПРАВДА — ЧЕТЫРЕ ЧИСЛА. Состояние этого экрана целиком описывается полями сверху, справа,
 * снизу и слева в пикселях исходника. Рельс пропорций и ползунок равномерного поля НИЧЕГО не
 * хранят: они ПИШУТ эти четыре числа. Поэтому здесь нет режимов, из которых нужно выходить, нет
 * состояния «выбрана пропорция, но числа другие», и нет вопроса, что победит при сохранении.
 * Правил ровно два: «пропорция считается от исходника» (значит, идемпотентна) и «рельс подсвечен
 * тогда, когда результат ДЕЙСТВИТЕЛЬНО этой пропорции» — даже если числа набиты руками.
 *
 * ПОЧЕМУ ПРОПОРЦИИ ПЕРВЫМИ. Обратный кроп в этой мастерской нужен ровно за тем, чтобы снимок
 * НЕПРАВИЛЬНОЙ формы приехал в витринный слот, не потеряв подол: кроп до 4:5 срезает вещь, поля
 * до 4:5 её сохраняют. Всё остальное («дай воздуха по кругу») — второй по частоте случай, и
 * стоит вторым.
 *
 * РЕЗУЛЬТАТ — НОВЫЙ ФАЙЛ. Исходник не трогается, как и у кропа; сказано в подвале.
 */

const RATIO_EPSILON = 0.005;

/**
 * Плитки пропорций настольного рельса, 5 в ряд. Свой список, а не `ASPECT_RATIOS`: там нет 3:2 и
 * 2:3, а кроппер, который читает общий список, менять нельзя. Значения точные (16/9, а не 1.7778):
 * по ним же щёлкает привязка перетаскивания, и округлённое число давало бы кадр на пиксель мимо.
 */
const RATIO_TILES: Array<{ label: string; value: number }> = [
  { label: '2:1', value: 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
  { label: '4:3', value: 4 / 3 },
  { label: '5:4', value: 5 / 4 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 },
];
const SNAP_PRESETS = RATIO_TILES.map((r) => r.value);

const MARGIN_VIEWS: ViewSwitchOption<'equal' | 'sides'>[] = [
  { value: 'equal', label: 'equal' },
  { value: 'sides', label: 'each side' },
];

/** Доля сцены, которую кадр занимает в покое: остальное — место, куда тянуть ручку. */
const STAGE_FIT = 0.82;
/** Отступ сцены и высота строки размера под кадром, px. */
const STAGE_PAD = 24;
const READOUT_H = 24;
/** Перевписывание кадра после отпускания. */
const SETTLE_MS = 180;
const SETTLE =
  'transition-[left,top,width,height] duration-180 ease-out motion-reduce:transition-none';

/** Замороженная геометрия сцены на время перетаскивания. */
type StageFreeze = { k: number; x: number; y: number; m: Margins; anchor: boolean };

/** Потолок равномерного поля — половина короткой стороны. Дальше поле шире самого снимка. */
const UNIFORM_MAX_FRACTION = 0.5;

const sum = (m: Margins) => m.top + m.right + m.bottom + m.left;

interface ExpanderProps {
  /** Адрес исходника. Пиксели берутся через прокси, как и у кроппера. */
  selectedFile: string | undefined;
  /** Отдаёт готовый data URL нового файла. Загрузку делает хост. */
  saveExpandedImage: (dataUrl: string) => void;
  onCancel: () => void;
  /** Блокирует действия (например, пока идёт загрузка). */
  busy?: boolean;
  /** MIME результата. По умолчанию угадывается по расширению исходника, как у кроппера. */
  outputFormat?: string;
  saveLabel?: string;
  /** Снять собственную шапку, когда экран уже озаглавлен диалогом. */
  hideHeader?: boolean;
  /**
   * `mobile` — полноэкранная раскладка ниже `lg` (MEDIA-MOBILE, кадр 3'): шапка, сцена, чипы
   * пропорций и строка заливки. По умолчанию — прежняя настольная раскладка.
   */
  layout?: 'default' | 'mobile';
  /** Заголовок мобильной шапки. */
  title?: string;
}

export const MediaExpander: FC<ExpanderProps> = ({
  selectedFile,
  saveExpandedImage,
  onCancel,
  busy,
  outputFormat,
  saveLabel = 'create expanded copy',
  hideHeader,
  layout = 'default',
  title = 'expand',
}) => {
  const [pixels, setPixels] = useState<SourcePixels | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [margins, setMargins] = useState<Margins>(NO_MARGINS);
  const [background, setBackground] = useState<string>(DEFAULT_BACKGROUND);
  /** Что набито в поле hex прямо сейчас — может быть незавершённым и потому не цветом. */
  const [hexDraft, setHexDraft] = useState<string>(DEFAULT_BACKGROUND);
  const [picking, setPicking] = useState(false);
  const [hoverHex, setHoverHex] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [stage, setStage] = useState({ w: 0, h: 0 });

  // ── источник ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    setPixels(null);
    setLoadError(null);
    loadSourcePixels(selectedFile)
      .then((p) => {
        if (!cancelled) setPixels(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'the image did not load');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFile, reloadKey]);

  // Новый снимок — новые поля. Иначе поля предыдущего кадра молча уезжают на следующий, и
  // «результат» показывает размер, которого никто не просил.
  useEffect(() => {
    setMargins(NO_MARGINS);
    setBackground(DEFAULT_BACKGROUND);
    setHexDraft(DEFAULT_BACKGROUND);
    setPicking(false);
    setSaveError(null);
  }, [selectedFile]);

  // Callback-ref, а не эффект с пустыми зависимостями: у экспанда две раскладки (настольная и
  // мобильная), и сцена меняет узел, когда меняется раскладка. Замер привязан к самому узлу.
  const roRef = useRef<ResizeObserver | null>(null);
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  // ── геометрия ───────────────────────────────────────────────────────────────────────────────
  const srcW = pixels?.width ?? 0;
  const srcH = pixels?.height ?? 0;
  const outW = srcW ? srcW + margins.left + margins.right : 0;
  const outH = srcH ? srcH + margins.top + margins.bottom : 0;

  const uniformMax = srcW && srcH ? Math.round(Math.min(srcW, srcH) * UNIFORM_MAX_FRACTION) : 0;
  /** Равномерное поле показывается числом только когда все четыре стороны равны. */
  const uniform =
    margins.top === margins.right &&
    margins.right === margins.bottom &&
    margins.bottom === margins.left
      ? margins.top
      : null;

  const applyRatio = useCallback(
    (value: number) => {
      if (!srcW || !srcH) return;
      setMargins(marginsForRatio(srcW, srcH, value));
    },
    [srcW, srcH],
  );

  const applyUniform = useCallback((v: number) => {
    const n = Math.max(0, Math.round(v));
    setMargins({ top: n, right: n, bottom: n, left: n });
  }, []);

  const setSide = useCallback((side: keyof Margins, raw: string) => {
    const n = Math.max(0, Math.round(Number(raw)));
    setMargins((prev) => ({ ...prev, [side]: Number.isFinite(n) ? n : 0 }));
  }, []);

  /** Поля, которые оставляют снимок по центру рамки, не меняя её размера. */
  const centre = useCallback(() => {
    setMargins((prev) => {
      const h = prev.left + prev.right;
      const v = prev.top + prev.bottom;
      const left = Math.floor(h / 2);
      const top = Math.floor(v / 2);
      return { left, right: h - left, top, bottom: v - top };
    });
  }, []);

  // ── пипетка ─────────────────────────────────────────────────────────────────────────────────
  //
  // Взять можно только С САМОГО СНИМКА: обработчик висит на кадре фотографии, а не на всей сцене.
  // Поле сцены уже залито выбранным цветом, и «пипетка по полю» вернула бы тот же цвет обратно —
  // жест, который не может ничего изменить, но выглядит работающим.
  const commit = useCallback((hex: string) => {
    setBackground(hex);
    setHexDraft(hex);
  }, []);

  useEffect(() => {
    if (!picking) return;
    // `Escape` сравнивается по `key` намеренно: это не буква, у неё нет раскладки, и на
    // кириллице она не превращается в другой символ.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPicking(false);
        setHoverHex(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [picking]);

  const pointToSource = useCallback(
    (e: { clientX: number; clientY: number; currentTarget: Element }) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        x: ((e.clientX - r.left) / r.width) * srcW,
        y: ((e.clientY - r.top) / r.height) * srcH,
      };
    },
    [srcW, srcH],
  );

  // ── что мешает сохранить ────────────────────────────────────────────────────────────────────
  const megapixels = (outW * outH) / 1_000_000;
  const blockedReason = !pixels
    ? undefined
    : sum(margins) === 0
      ? 'no margins'
      : megapixels > MAX_IMAGE_MEGAPIXELS
        ? `${megapixels.toFixed(1)} MP · max ${MAX_IMAGE_MEGAPIXELS}`
        : undefined;
  const blocked = !pixels || !!blockedReason;

  const handleSave = () => {
    if (!pixels || blocked) return;
    setSaveError(null);
    try {
      const format =
        outputFormat ?? (selectedFile?.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
      saveExpandedImage(pixels.expand(margins, background, format));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'the canvas refused the image');
    }
  };

  /**
   * Нативный `input[type=color]` прозрачным поверх квадрата — одна точка входа для обеих
   * раскладок: на настольной это квадрат рядом с hex, на мобильной — образец `+`.
   */
  const colourWell = (className: string, face: ReactNode) => (
    <span
      className={cn(
        'relative inline-flex shrink-0 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
        className,
      )}
    >
      {face}
      <input
        type='color'
        aria-label='background colour'
        data-probe='colour-input'
        value={background}
        disabled={!pixels}
        className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
        onChange={(e) => commit(e.target.value)}
      />
    </span>
  );
  // ── настольная сцена: вписать в покое, заморозить на перетаскивании ─────────────────────────
  //
  // В покое кадр занимает ~82% сцены — остаток и есть место, куда тянуть. На перетаскивании
  // масштаб и положение кадра замораживаются в момент нажатия: иначе кадр перевписывается под
  // курсором на каждом движении, и край убегает от руки. Ручка двигает свой край ровно на дельту
  // курсора (противоположный край стоит), перенос фото оставляет кадр на месте. После отпускания
  // — перевписать с переходом 180 мс (под reduced-motion без перехода, это делает CSS).
  const [freeze, setFreeze] = useState<StageFreeze | null>(null);
  const [settling, setSettling] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [marginView, setMarginView] = useState<'equal' | 'sides'>('sides');
  const settleTimer = useRef<number | undefined>(undefined);
  const settle = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    setSettling(true);
    settleTimer.current = window.setTimeout(() => setSettling(false), SETTLE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const fitK =
    outW && outH && stage.w && stage.h
      ? Math.max(
          0,
          Math.min((stage.w - STAGE_PAD * 2) / outW, (stage.h - STAGE_PAD * 2 - READOUT_H) / outH),
        ) * STAGE_FIT
      : 0;
  const k = freeze?.k ?? fitK;
  const frameW = outW * k;
  const frameH = outH * k;
  const frameX = freeze
    ? freeze.x - (freeze.anchor ? (margins.left - freeze.m.left) * k : 0)
    : (stage.w - frameW) / 2;
  const frameY = freeze
    ? freeze.y - (freeze.anchor ? (margins.top - freeze.m.top) * k : 0)
    : (stage.h - frameH - READOUT_H) / 2;

  const edgeHex = useMemo(() => (pixels ? edgeColour(pixels) : DEFAULT_BACKGROUND), [pixels]);

  const matched =
    sum(margins) > 0 && outH > 0
      ? RATIO_TILES.find((r) => Math.abs(outW / outH - r.value) < RATIO_EPSILON)
      : undefined;
  const total = sum(margins);
  const over = !!pixels && megapixels > MAX_IMAGE_MEGAPIXELS;

  // Grabbed mid-transition: freeze what is on screen, not the final React geometry.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const beginDrag = useCallback(
    (mode: ExpandDragMode) => {
      window.clearTimeout(settleTimer.current);
      let at = { k, x: frameX, y: frameY };
      const el = frameRef.current;
      const parent = el?.parentElement;
      if (settling && el && parent && outW > 0) {
        const fr = el.getBoundingClientRect();
        const sr = parent.getBoundingClientRect();
        if (fr.width > 0) at = { k: fr.width / outW, x: fr.left - sr.left, y: fr.top - sr.top };
      }
      setSettling(false);
      setFreeze({ ...at, m: margins, anchor: mode !== 'photo' });
    },
    [frameX, frameY, k, margins, outW, settling],
  );
  const endDrag = useCallback(() => {
    setFreeze(null);
    settle();
  }, [settle]);

  if (layout === 'mobile') {
    const off = !pixels || busy;
    const maxSide = Math.max(margins.top, margins.right, margins.bottom, margins.left);
    const ratioNow = !pixels
      ? undefined
      : total === 0
        ? 'as is'
        : matched
          ? matched.label
          : `${(outW / outH).toFixed(3)} · free`;
    const marginNow =
      total === 0
        ? '0 px'
        : uniform !== null
          ? `${uniform} px`
          : `${margins.top} ${margins.right} ${margins.bottom} ${margins.left}`;
    const ratioOptions: RatioOption[] = [
      {
        key: 'as-is',
        label: 'as is',
        value: srcW && srcH ? srcW / srcH : 1,
      },
      FREE_CHIP,
      ...RATIO_TILES.map((r) => ({ key: r.label, label: r.label, value: r.value })),
    ];
    const selectedChip = !pixels || total === 0 ? 'as-is' : matched?.label ?? FREE_CHIP.key;

    const mobileSideField = (side: keyof Margins, letter: string) => (
      <label className='flex items-center gap-1'>
        <Input
          type='number'
          min={0}
          step={1}
          value={String(margins[side])}
          disabled={off}
          aria-label={`${side} margin`}
          data-probe={`margin-${side}`}
          className='h-11 text-right tabular-nums'
          onChange={(e: { target: { value: string } }) => setSide(side, e.target.value)}
        />
        <Text size='micro' variant='label' component='span' className='w-2 shrink-0'>
          {letter}
        </Text>
      </label>
    );

    const mobileSwatch = (
      label: string,
      hex: string,
      pressed: boolean,
      onClick: () => void,
      glyph = '',
    ) => (
      <Button
        type='button'
        variant={null}
        aria-label={label}
        aria-pressed={pressed}
        disabled={off}
        className='flex size-11 shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed'
        onClick={onClick}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-7 items-center justify-center border border-borderColor text-control',
            pressed && 'outline outline-1 outline-offset-2 outline-textColor',
          )}
          style={hex ? { background: hex } : undefined}
        >
          {glyph}
        </span>
      </Button>
    );

    return (
      <div className='flex h-full min-h-0 w-full flex-col bg-bgColor text-textColor'>
        <div className='flex min-h-11 shrink-0 items-center border-b border-hairline px-block'>
          <Text component='h2' variant='uppercase' tracking='section' className='font-bold'>
            {title}
          </Text>
        </div>

        <div className='grid min-h-0 flex-1 grid-rows-[minmax(0,46fr)_minmax(0,54fr)]'>
          <div
            ref={stageRef}
            data-probe='stage'
            className='relative min-h-0 touch-none overflow-hidden bg-pageBg'
          >
            {pixels && k > 0 && !loadError ? (
              <div
                data-probe='result-frame'
                ref={frameRef}
                className={cn('absolute outline outline-1 outline-borderColor', settling && SETTLE)}
                style={{ left: frameX, top: frameY, width: frameW, height: frameH, background }}
              >
                <img
                  src={selectedFile}
                  alt=''
                  draggable={false}
                  data-probe='source-frame'
                  className={cn(
                    'absolute select-none',
                    picking && 'cursor-crosshair',
                    settling && SETTLE,
                  )}
                  style={{
                    left: margins.left * k,
                    top: margins.top * k,
                    width: srcW * k,
                    height: srcH * k,
                    maxWidth: 'none',
                    maxHeight: 'none',
                  }}
                  onPointerMove={(e) => {
                    if (!picking) return;
                    const p = pointToSource(e);
                    if (p) setHoverHex(pixels.sampleAt(p.x, p.y));
                  }}
                  onPointerLeave={() => picking && setHoverHex(null)}
                  onClick={(e) => {
                    if (!picking) return;
                    const p = pointToSource(e);
                    if (!p) return;
                    commit(pixels.sampleAt(p.x, p.y));
                    setPicking(false);
                    setHoverHex(null);
                  }}
                />
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute border border-dashed border-textColor/60',
                    settling && SETTLE,
                  )}
                  style={{
                    left: margins.left * k,
                    top: margins.top * k,
                    width: srcW * k,
                    height: srcH * k,
                  }}
                />
                <ExpandHandles
                  touch
                  margins={margins}
                  srcW={srcW}
                  srcH={srcH}
                  scale={k}
                  mirror={mirror}
                  presets={SNAP_PRESETS}
                  maxMegapixels={MAX_IMAGE_MEGAPIXELS}
                  pickMode={picking}
                  disabled={busy}
                  settling={settling}
                  onChange={setMargins}
                  onDragStart={beginDrag}
                  onDragEnd={endDrag}
                  onNudge={settle}
                />
                <Text
                  size='micro'
                  variant='label'
                  component='span'
                  data-probe='readout'
                  className='absolute left-1/2 top-full mt-2.5 -translate-x-1/2 whitespace-nowrap tabular-nums'
                >
                  {picking ? (
                    <>
                      <span
                        aria-hidden
                        className='mr-1 inline-block size-2.5 translate-y-px border border-borderColor'
                        style={{ background: hoverHex ?? background }}
                      />
                      <span className='uppercase'>{hoverHex ?? background}</span>
                    </>
                  ) : (
                    <>
                      <span className={cn(freeze ? 'text-textColor' : 'text-textColor/80')}>
                        {outW} × {outH}
                      </span>
                      {matched && ` · ${matched.label}`}
                    </>
                  )}
                </Text>
              </div>
            ) : loadError ? (
              <div className='absolute inset-0 flex items-center justify-center p-block'>
                <CalloutBox tone='error'>
                  <Text size='micro' component='span'>
                    load failed
                  </Text>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    className='ml-2 inline-block cursor-pointer align-middle'
                    onClick={() => setReloadKey((n) => n + 1)}
                  >
                    retry
                  </Button>
                </CalloutBox>
              </div>
            ) : (
              <div className='absolute inset-0 flex items-center justify-center'>
                <Text size='micro' variant='label' className='uppercase'>
                  loading image
                </Text>
              </div>
            )}
          </div>

          <div className='flex min-h-0 flex-col border-t border-hairline bg-bgColor'>
            <div className='flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto px-block py-block'>
              <section className='flex flex-col'>
                <SideRailGroup
                  flush
                  action={
                    <Text size='micro' variant='label' component='span' data-probe='ratio-now'>
                      {ratioNow ?? <EmptyCell />}
                    </Text>
                  }
                >
                  ratio
                </SideRailGroup>
                <div className='-mx-block mt-1.5'>
                  <RatioChips
                    tone='light'
                    options={ratioOptions}
                    selected={selectedChip}
                    disabled={off}
                    onSelect={(o) => {
                      if (o.key === 'as-is') {
                        setMargins(NO_MARGINS);
                        settle();
                      } else if (o.value !== undefined && o.key !== FREE_CHIP.key) {
                        applyRatio(o.value);
                        settle();
                      }
                    }}
                  />
                </div>
              </section>

              <section className='flex flex-col gap-2.5'>
                <SideRailGroup
                  flush
                  action={
                    <Text
                      size='micro'
                      variant='label'
                      component='span'
                      className='tabular-nums'
                      data-probe='margin-now'
                    >
                      {marginNow}
                    </Text>
                  }
                >
                  margins
                </SideRailGroup>
                <div className='flex items-center justify-between'>
                  <ViewSwitch
                    quiet
                    label='margin mode'
                    value={marginView}
                    disabled={off}
                    options={MARGIN_VIEWS}
                    className='min-h-11'
                    onChange={setMarginView}
                  />
                  <Button
                    type='button'
                    variant={null}
                    aria-pressed={mirror}
                    data-probe='mirror'
                    disabled={off}
                    className={cn(
                      'min-h-11 cursor-pointer border-b px-1 py-0.5 text-control uppercase tracking-label',
                      mirror
                        ? 'border-textColor text-textColor'
                        : 'border-transparent text-labelColor hover:text-textColor',
                    )}
                    onClick={() => setMirror((v) => !v)}
                  >
                    mirror
                  </Button>
                </div>

                {marginView === 'equal' ? (
                  <div className='flex justify-end'>
                    <label className='flex w-28 items-center gap-1'>
                      <Input
                        type='number'
                        min={0}
                        step={1}
                        value={String(uniform ?? maxSide)}
                        disabled={off}
                        aria-label='all sides'
                        data-probe='margin-all'
                        className='h-11 text-right tabular-nums'
                        onChange={(e: { target: { value: string } }) =>
                          applyUniform(Number(e.target.value) || 0)
                        }
                      />
                      <Text size='micro' variant='label' component='span'>
                        px
                      </Text>
                    </label>
                  </div>
                ) : (
                  <div className='grid grid-cols-3 items-center gap-1.5'>
                    <div />
                    {mobileSideField('top', 'T')}
                    <div />
                    {mobileSideField('left', 'L')}
                    <div aria-hidden className='h-10 border border-dashed border-borderColor' />
                    {mobileSideField('right', 'R')}
                    <div />
                    {mobileSideField('bottom', 'B')}
                    <div />
                  </div>
                )}

                {total > 0 && (
                  <div className='flex gap-4'>
                    <Button
                      type='button'
                      variant='underline'
                      className='min-h-11 cursor-pointer text-control uppercase tracking-label text-labelColor'
                      disabled={off}
                      onClick={() => {
                        centre();
                        settle();
                      }}
                    >
                      centre
                    </Button>
                    <Button
                      type='button'
                      variant='underline'
                      className='min-h-11 cursor-pointer text-control uppercase tracking-label text-labelColor'
                      disabled={off}
                      onClick={() => {
                        setMargins(NO_MARGINS);
                        settle();
                      }}
                    >
                      reset
                    </Button>
                  </div>
                )}
              </section>

              <section className='flex flex-col gap-2.5'>
                <SideRailGroup
                  flush
                  action={
                    <Text size='micro' variant='label' component='span' className='uppercase'>
                      {background}
                    </Text>
                  }
                >
                  background
                </SideRailGroup>
                <div className='flex items-center gap-1.5'>
                  {mobileSwatch(
                    'white',
                    DEFAULT_BACKGROUND,
                    !picking && background === DEFAULT_BACKGROUND,
                    () => commit(DEFAULT_BACKGROUND),
                  )}
                  {mobileSwatch(
                    'edge colour',
                    edgeHex,
                    !picking && background === edgeHex && edgeHex !== DEFAULT_BACKGROUND,
                    () => commit(edgeHex),
                  )}
                  {mobileSwatch(
                    'pick colour',
                    '',
                    picking,
                    () => {
                      setPicking((p) => !p);
                      setHoverHex(null);
                    },
                    '⌖',
                  )}
                  <div className='flex min-w-0 flex-1 items-center gap-1.5'>
                    {colourWell(
                      'size-11 items-center justify-center focus-within:outline-textColor',
                      <span
                        aria-hidden
                        className='size-7 border border-borderColor'
                        style={{ background }}
                      />,
                    )}
                    <Input
                      type='text'
                      value={hexDraft}
                      disabled={off}
                      spellCheck={false}
                      aria-label='hex colour'
                      data-probe='hex-input'
                      aria-invalid={normaliseHex(hexDraft) === undefined}
                      className='h-11 min-w-0 tabular-nums uppercase'
                      onChange={(e: { target: { value: string } }) => {
                        setHexDraft(e.target.value);
                        const hex = normaliseHex(e.target.value);
                        if (hex) setBackground(hex);
                      }}
                    />
                  </div>
                </div>
              </section>

              {saveError && !loadError && (
                <CalloutBox tone='error'>
                  <Text size='micro' component='span'>
                    {saveError}
                  </Text>
                </CalloutBox>
              )}
            </div>

            <div className='flex shrink-0 flex-col gap-2.5 border-t border-hairline bg-bgColor px-block pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
              <div className='flex items-baseline justify-between gap-2 tabular-nums'>
                <Text variant='label' component='span'>
                  {pixels ? `${srcW}×${srcH} →` : <EmptyCell />}
                </Text>
                <Text component='span' data-probe='result'>
                  {pixels ? (
                    `${outW}×${outH}${matched ? ` · ${matched.label}` : ''}`
                  ) : (
                    <EmptyCell />
                  )}
                </Text>
              </div>
              {over && blockedReason && (
                <Text size='micro' variant='errorLabel' component='span' data-probe='blocked'>
                  {blockedReason}
                </Text>
              )}
              <div className='grid grid-cols-[auto_1fr] items-center gap-3'>
                <Button
                  type='button'
                  variant={null}
                  className='min-h-11 cursor-pointer px-1 text-control uppercase tracking-label text-labelColor'
                  onClick={onCancel}
                  disabled={busy}
                >
                  cancel
                </Button>
                <Button
                  type='button'
                  size='lg'
                  variant='main'
                  className='min-h-11 cursor-pointer uppercase'
                  data-probe='save'
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
      </div>
    );
  }
  const ratioNow = !pixels
    ? undefined
    : total === 0
      ? 'as is'
      : matched
        ? matched.label
        : `${(outW / outH).toFixed(3)} · free`;
  const marginNow =
    total === 0
      ? '0 px'
      : uniform !== null
        ? `${uniform} px`
        : `${margins.top} ${margins.right} ${margins.bottom} ${margins.left}`;
  const maxSide = Math.max(margins.top, margins.right, margins.bottom, margins.left);
  const off = !pixels || busy;

  const sideField = (side: keyof Margins, letter: string) => (
    <label className='flex items-center gap-1'>
      <Input
        type='number'
        min={0}
        step={1}
        value={String(margins[side])}
        disabled={off}
        aria-label={`${side} margin`}
        data-probe={`margin-${side}`}
        className='text-right tabular-nums'
        onChange={(e: { target: { value: string } }) => setSide(side, e.target.value)}
      />
      <Text size='micro' variant='label' component='span' className='w-2 shrink-0'>
        {letter}
      </Text>
    </label>
  );

  const tile = (
    key: string,
    label: string,
    glyph: { w: number; h: number },
    selected: boolean,
    onClick?: () => void,
  ) => {
    const face = (
      <>
        <RatioGlyph
          width={glyph.w || 1}
          height={glyph.h || 1}
          size={24}
          className={key === 'free' ? 'border-dashed' : undefined}
        />
        <span className='whitespace-nowrap text-control uppercase'>{label}</span>
      </>
    );
    const skin = cn(
      'flex min-h-14.5 flex-col items-center justify-end gap-1.5 px-1 pt-2 pb-1.5',
      selected ? 'bg-textColor text-bgColor' : 'text-textColor',
    );
    // FREE — индикатор, а не команда: «свободная» форма — это просто поля, не попавшие ни в одну
    // пропорцию. Нажимать на него нечего, поэтому это не кнопка.
    if (!onClick) {
      return (
        <div key={key} className={skin} data-probe={`ratio-${key}`} data-selected={selected}>
          {face}
        </div>
      );
    }
    return (
      <Button
        key={key}
        type='button'
        variant={null}
        aria-pressed={selected}
        disabled={off}
        data-probe={`ratio-${key}`}
        className={cn(
          skin,
          'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'hover:bg-pageBg',
        )}
        onClick={onClick}
      >
        {face}
      </Button>
    );
  };

  const swatch = (
    label: string,
    hex: string,
    pressed: boolean,
    onClick: () => void,
    glyph = '',
  ) => (
    <Button
      type='button'
      variant={null}
      aria-label={label}
      aria-pressed={pressed}
      disabled={off}
      className='flex shrink-0 cursor-pointer p-0.5 disabled:cursor-not-allowed'
      onClick={onClick}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-7 items-center justify-center border border-borderColor text-control',
          pressed && 'outline outline-1 outline-offset-2 outline-textColor',
        )}
        style={hex ? { background: hex } : undefined}
      >
        {glyph}
      </span>
    </Button>
  );

  const textLink = 'cursor-pointer text-control uppercase tracking-label text-labelColor';

  return (
    <div className='flex flex-col'>
      {!hideHeader && (
        <div className='flex items-center justify-between border-b border-hairline pb-2'>
          <Text component='h3' variant='uppercase' tracking='section' className='font-bold'>
            expand image
          </Text>
          <Close onClick={onCancel} />
        </div>
      )}

      <div className='grid min-h-0 grid-cols-1 lg:h-[78vh] lg:grid-cols-[minmax(0,1fr)_22.5rem]'>
        <div
          ref={stageRef}
          data-probe='stage'
          className='relative h-[52vh] min-w-0 touch-none overflow-hidden bg-pageBg lg:h-auto'
        >
          {pixels && k > 0 && !loadError ? (
            // РАМКА РЕЗУЛЬТАТА, залитая выбранным цветом: то, что видно здесь, и то, что уедет в
            // бакет, — один кадр. Обводка — граница файла, хрома сцены, в пиксели не попадает.
            <div
              data-probe='result-frame'
              ref={frameRef}
              className={cn('absolute outline outline-1 outline-borderColor', settling && SETTLE)}
              style={{ left: frameX, top: frameY, width: frameW, height: frameH, background }}
            >
              <img
                src={selectedFile}
                alt=''
                draggable={false}
                data-probe='source-frame'
                className={cn(
                  'absolute select-none',
                  picking && 'cursor-crosshair',
                  settling && SETTLE,
                )}
                style={{
                  left: margins.left * k,
                  top: margins.top * k,
                  width: srcW * k,
                  height: srcH * k,
                  maxWidth: 'none',
                  maxHeight: 'none',
                }}
                onMouseMove={(e) => {
                  if (!picking) return;
                  const p = pointToSource(e);
                  if (p) setHoverHex(pixels.sampleAt(p.x, p.y));
                }}
                onMouseLeave={() => picking && setHoverHex(null)}
                onClick={(e) => {
                  if (!picking) return;
                  const p = pointToSource(e);
                  if (!p) return;
                  commit(pixels.sampleAt(p.x, p.y));
                  setPicking(false);
                  setHoverHex(null);
                }}
              />
              {/* Где кончается фотография: поле может совпасть с краем снимка по цвету. */}
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute border border-dashed border-textColor/60',
                  settling && SETTLE,
                )}
                style={{
                  left: margins.left * k,
                  top: margins.top * k,
                  width: srcW * k,
                  height: srcH * k,
                }}
              />
              <ExpandHandles
                margins={margins}
                srcW={srcW}
                srcH={srcH}
                scale={k}
                mirror={mirror}
                presets={SNAP_PRESETS}
                maxMegapixels={MAX_IMAGE_MEGAPIXELS}
                pickMode={picking}
                disabled={busy}
                settling={settling}
                onChange={setMargins}
                onDragStart={beginDrag}
                onDragEnd={endDrag}
                onNudge={settle}
              />
              <Text
                size='micro'
                variant='label'
                component='span'
                data-probe='readout'
                className='absolute left-1/2 top-full mt-2.5 -translate-x-1/2 whitespace-nowrap tabular-nums'
              >
                {picking ? (
                  <>
                    <span
                      aria-hidden
                      className='mr-1 inline-block size-2.5 translate-y-px border border-borderColor'
                      style={{ background: hoverHex ?? background }}
                    />
                    <span className='uppercase'>{hoverHex ?? background}</span>
                  </>
                ) : (
                  <>
                    <span className={cn(freeze ? 'text-textColor' : 'text-textColor/80')}>
                      {outW} × {outH}
                    </span>
                    {matched && ` · ${matched.label}`}
                  </>
                )}
              </Text>
            </div>
          ) : loadError ? (
            <div className='absolute inset-0 flex items-center justify-center p-block'>
              <CalloutBox tone='error'>
                <Text size='micro' component='span'>
                  source will not load
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  className='ml-2 inline-block cursor-pointer align-middle'
                  onClick={() => setReloadKey((n) => n + 1)}
                >
                  load again
                </Button>
              </CalloutBox>
            </div>
          ) : (
            <div className='absolute inset-0 flex items-center justify-center'>
              <Text size='micro' variant='label' className='uppercase'>
                loading the image
              </Text>
            </div>
          )}
        </div>

        <div className='flex min-h-0 flex-col border-hairline lg:border-l'>
          <div className='flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto px-block pt-block pb-2'>
            <section className='flex flex-col'>
              <SideRailGroup
                flush
                action={
                  <Text size='micro' variant='label' component='span' data-probe='ratio-now'>
                    {ratioNow ?? <EmptyCell />}
                  </Text>
                }
              >
                ratio
              </SideRailGroup>
              <div className='mt-1.5 grid grid-cols-5 gap-0.5'>
                {tile('as-is', 'as is', { w: srcW, h: srcH }, !!pixels && total === 0, () => {
                  setMargins(NO_MARGINS);
                  settle();
                })}
                {tile(
                  'free',
                  'free',
                  { w: outW || srcW, h: outH || srcH },
                  !!pixels && total > 0 && !matched,
                )}
                {RATIO_TILES.map((r) => {
                  const m = srcW && srcH ? marginsForRatio(srcW, srcH, r.value) : NO_MARGINS;
                  return tile(
                    r.label,
                    r.label,
                    {
                      w: srcW ? srcW + m.left + m.right : r.value,
                      h: srcH ? srcH + m.top + m.bottom : 1,
                    },
                    matched?.label === r.label,
                    () => {
                      applyRatio(r.value);
                      settle();
                    },
                  );
                })}
              </div>
            </section>

            <section className='flex flex-col gap-2.5'>
              <SideRailGroup
                flush
                action={
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='tabular-nums'
                    data-probe='margin-now'
                  >
                    {marginNow}
                  </Text>
                }
              >
                margins
              </SideRailGroup>
              <div className='flex items-center justify-between'>
                <ViewSwitch
                  quiet
                  label='margin mode'
                  value={marginView}
                  disabled={off}
                  options={MARGIN_VIEWS}
                  onChange={setMarginView}
                />
                <Button
                  type='button'
                  variant={null}
                  aria-pressed={mirror}
                  data-probe='mirror'
                  disabled={off}
                  className={cn(
                    'cursor-pointer border-b px-0 py-0.5 text-control uppercase tracking-label',
                    mirror
                      ? 'border-textColor text-textColor'
                      : 'border-transparent text-labelColor hover:text-textColor',
                  )}
                  onClick={() => setMirror((v) => !v)}
                >
                  mirror
                </Button>
              </div>

              {marginView === 'equal' ? (
                <div className='flex items-center gap-2.5'>
                  <input
                    type='range'
                    min={0}
                    max={Math.max(uniformMax, maxSide) || 100}
                    step={1}
                    value={uniform ?? maxSide}
                    disabled={off}
                    aria-label='all sides'
                    className='crop-range h-4 min-w-0 flex-1'
                    onChange={(e) => applyUniform(Number(e.target.value))}
                  />
                  <label className='flex w-21 shrink-0 items-center gap-1'>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      value={String(uniform ?? maxSide)}
                      disabled={off}
                      aria-label='all sides'
                      data-probe='margin-all'
                      className='text-right tabular-nums'
                      onChange={(e: { target: { value: string } }) =>
                        applyUniform(Number(e.target.value) || 0)
                      }
                    />
                    <Text size='micro' variant='label' component='span'>
                      px
                    </Text>
                  </label>
                </div>
              ) : (
                <div className='grid grid-cols-3 items-center gap-1.5'>
                  <div />
                  {sideField('top', 'T')}
                  <div />
                  {sideField('left', 'L')}
                  <div aria-hidden className='h-10 border border-dashed border-borderColor' />
                  {sideField('right', 'R')}
                  <div />
                  {sideField('bottom', 'B')}
                  <div />
                </div>
              )}

              {total > 0 && (
                <div className='flex gap-4'>
                  <Button
                    type='button'
                    variant='underline'
                    className={textLink}
                    disabled={off}
                    onClick={() => {
                      centre();
                      settle();
                    }}
                  >
                    centre
                  </Button>
                  <Button
                    type='button'
                    variant='underline'
                    className={textLink}
                    disabled={off}
                    onClick={() => {
                      setMargins(NO_MARGINS);
                      settle();
                    }}
                  >
                    reset
                  </Button>
                </div>
              )}
            </section>

            <section className='flex flex-col gap-2.5'>
              <SideRailGroup
                flush
                action={
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    {background}
                  </Text>
                }
              >
                background
              </SideRailGroup>
              <div className='flex items-center gap-1.5'>
                {swatch(
                  'white',
                  DEFAULT_BACKGROUND,
                  !picking && background === DEFAULT_BACKGROUND,
                  () => commit(DEFAULT_BACKGROUND),
                )}
                {swatch(
                  'edge colour',
                  edgeHex,
                  !picking && background === edgeHex && edgeHex !== DEFAULT_BACKGROUND,
                  () => commit(edgeHex),
                )}
                {swatch(
                  'pick from photo',
                  '',
                  picking,
                  () => {
                    setPicking((p) => !p);
                    setHoverHex(null);
                  },
                  '⌖',
                )}
                <div className='flex min-w-0 flex-1 items-center gap-1.5'>
                  {colourWell(
                    'size-7 border border-borderColor focus-within:outline-textColor',
                    <span aria-hidden className='h-full w-full' style={{ background }} />,
                  )}
                  <Input
                    type='text'
                    value={hexDraft}
                    disabled={off}
                    spellCheck={false}
                    aria-label='hex colour'
                    data-probe='hex-input'
                    aria-invalid={normaliseHex(hexDraft) === undefined}
                    className='min-w-0 tabular-nums uppercase'
                    onChange={(e: { target: { value: string } }) => {
                      setHexDraft(e.target.value);
                      // Цвет применяется, только когда набранное — цвет: иначе на «#f» поле
                      // перекрашивалось бы в чёрное, и набрать hex руками было бы нельзя.
                      const hex = normaliseHex(e.target.value);
                      if (hex) setBackground(hex);
                    }}
                  />
                </div>
              </div>
            </section>
          </div>

          <div className='flex shrink-0 flex-col gap-2.5 border-t border-hairline bg-bgColor px-block pt-3.5 pb-4'>
            <div className='flex items-baseline justify-between gap-2 tabular-nums'>
              <Text variant='label' component='span'>
                {pixels ? `${srcW}×${srcH} →` : <EmptyCell />}
              </Text>
              <Text component='span' data-probe='result'>
                {pixels ? `${outW}×${outH}${matched ? ` · ${matched.label}` : ''}` : <EmptyCell />}
              </Text>
            </div>
            {over && blockedReason && (
              <Text size='micro' variant='errorLabel' component='span' data-probe='blocked'>
                {blockedReason}
              </Text>
            )}
            {saveError && !loadError && (
              <CalloutBox tone='error'>
                <Text size='micro' component='span'>
                  {saveError}
                </Text>
              </CalloutBox>
            )}
            <div className='grid grid-cols-[1fr_2fr] gap-1.5'>
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
                data-probe='save'
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
    </div>
  );
};

/** Средний цвет каймы снимка: восемь точек по краю (углы и середины сторон), отступ 3 px. */
function edgeColour(p: SourcePixels): string {
  const inset = 3;
  const xs = [inset, p.width / 2, p.width - 1 - inset];
  const ys = [inset, p.height / 2, p.height - 1 - inset];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const y of ys) {
    for (const x of xs) {
      if (x === p.width / 2 && y === p.height / 2) continue;
      const hex = p.sampleAt(x, y);
      r += parseInt(hex.slice(1, 3), 16);
      g += parseInt(hex.slice(3, 5), 16);
      b += parseInt(hex.slice(5, 7), 16);
      n += 1;
    }
  }
  const h2 = (v: number) =>
    Math.min(255, Math.max(0, Math.round(v / n)))
      .toString(16)
      .padStart(2, '0');
  return normaliseHex(`${h2(r)}${h2(g)}${h2(b)}`) ?? DEFAULT_BACKGROUND;
}
