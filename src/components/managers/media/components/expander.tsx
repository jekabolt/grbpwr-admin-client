import { ASPECT_RATIOS } from 'constants/constants';
import { cn } from 'lib/utility';
import { FC, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Input from 'ui/components/input';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import { Row } from 'ui/components/row';
import { SideRailGroup, SideRailItem } from 'ui/components/side-rail';
import Text from 'ui/components/text';

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

/** Потолок равномерного поля — половина короткой стороны. Дальше поле шире самого снимка. */
const UNIFORM_MAX_FRACTION = 0.5;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** «2400×1350» → «16:9». Когда стороны не сокращаются во что-то читаемое — «1.78:1». */
function ratioLabel(w: number, h: number): string {
  if (!w || !h) return '—';
  const d = gcd(w, h) || 1;
  const a = w / d;
  const b = h / d;
  return Math.max(a, b) > 30 ? `${(w / h).toFixed(2)}:1` : `${a}:${b}`;
}

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
  footerNote?: ReactNode;
}

export const MediaExpander: FC<ExpanderProps> = ({
  selectedFile,
  saveExpandedImage,
  onCancel,
  busy,
  outputFormat,
  saveLabel = 'create expanded copy',
  hideHeader,
  footerNote,
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

  const stageRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── геометрия ───────────────────────────────────────────────────────────────────────────────
  const srcW = pixels?.width ?? 0;
  const srcH = pixels?.height ?? 0;
  const outW = srcW ? srcW + margins.left + margins.right : 0;
  const outH = srcH ? srcH + margins.top + margins.bottom : 0;

  /**
   * Кадр результата на экране, В ПИКСЕЛЯХ. Считается замером сцены, а не CSS-пропорцией: доли
   * внутри кадра адресуют МЕСТА на снимке, и кадр, чья форма разошлась с формой результата хотя
   * бы на процент, показывает пипетке не ту точку, по которой щёлкнули.
   */
  const disp = useMemo(() => {
    if (!outW || !outH || !stage.w || !stage.h) return null;
    const r = outW / outH;
    const w = Math.min(stage.w, stage.h * r);
    return { w, h: w / r };
  }, [outW, outH, stage.w, stage.h]);

  const scale = disp && outW ? disp.w / outW : 0;

  const uniformMax = srcW && srcH ? Math.round(Math.min(srcW, srcH) * UNIFORM_MAX_FRACTION) : 0;
  /** Равномерное поле показывается числом только когда все четыре стороны равны. */
  const uniform =
    margins.top === margins.right && margins.right === margins.bottom && margins.bottom === margins.left
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
      ? 'nothing is added yet'
      : megapixels > MAX_IMAGE_MEGAPIXELS
        ? `${megapixels.toFixed(1)} MP — over the ${MAX_IMAGE_MEGAPIXELS} MP ceiling`
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
   * ПОРЯДОК ПОЛЕЙ — ПО ОСЯМ, А НЕ ПО СОКРАЩЁННОЙ ЗАПИСИ CSS. В сетке 2×2 «top right bottom left»
   * ставит LEFT в правую нижнюю клетку — подпись слева, поле справа, и рука тянется не туда.
   * Осевой порядок кладёт левое поле левее правого, а верхнее выше нижнего, и вдобавок
   * проговаривает то, что делает рельс пропорций: он добавляет ровно по ОДНОЙ оси.
   */
  const sides: Array<{ key: keyof Margins; label: string }> = [
    { key: 'left', label: 'left' },
    { key: 'right', label: 'right' },
    { key: 'top', label: 'top' },
    { key: 'bottom', label: 'bottom' },
  ];

  return (
    <div className='flex flex-col gap-3.5'>
      {!hideHeader && (
        <div className='flex items-center justify-between border-b border-hairline pb-2'>
          <Text component='h3' variant='uppercase' tracking='section' className='font-bold'>
            expand image
          </Text>
          <Button className='cursor-pointer py-1' onClick={onCancel}>
            [x]
          </Button>
        </div>
      )}

      <div className='grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_224px] lg:items-start'>
        <div className='min-w-0'>
          <div className='relative flex aspect-[3/2] max-h-[52vh] w-full items-center justify-center overflow-hidden border border-borderColor bg-bgSecondary p-3'>
            <div ref={stageRef} className='relative flex h-full w-full items-center justify-center'>
              {pixels && disp && !loadError ? (
                // РАМКА РЕЗУЛЬТАТА, залитая выбранным цветом. Это не подложка сцены, а сам файл,
                // который получится: то, что видно здесь, и то, что уедет в бакет, — один кадр.
                // Обводка в 1px — ГРАНИЦА ФАЙЛА, и без неё экран врёт о своём предмете: поле по
                // умолчанию белое, сцена под ним почти белая, и «насколько я расширил» на глаз
                // не читается вовсе. Обводка — хрома сцены, в пиксели она не попадает.
                <div
                  data-probe='result-frame'
                  className='relative outline outline-1 outline-borderColor'
                  style={{ width: disp.w, height: disp.h, background }}
                >
                  <img
                    src={selectedFile}
                    alt=''
                    draggable={false}
                    data-probe='source-frame'
                    className={cn('absolute select-none', picking && 'cursor-crosshair')}
                    style={{
                      left: margins.left * scale,
                      top: margins.top * scale,
                      width: srcW * scale,
                      height: srcH * scale,
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
                  {/* ГДЕ КОНЧАЕТСЯ ФОТОГРАФИЯ. Поле может совпасть с краем снимка по цвету —
                      белый фон на белом поле это норма, а не исключение, — и тогда без этой
                      линии не видно ВООБЩЕ НИЧЕГО из того, что делает экран. Линия — хрома
                      сцены и в файл не попадает. */}
                  <span
                    aria-hidden
                    className='pointer-events-none absolute border border-dashed border-textColor/60'
                    style={{
                      left: margins.left * scale,
                      top: margins.top * scale,
                      width: srcW * scale,
                      height: srcH * scale,
                    }}
                  />
                </div>
              ) : loadError ? null : (
                <Text size='micro' variant='label' className='uppercase'>
                  loading the image
                </Text>
              )}
            </div>
          </div>

          {/* Одна строка под сценой, два состояния. Во взведённой пипетке она показывает цвет
              ПОД КУРСОРОМ — читать hex в рельсе, глядя на курсор в сцене, невозможно. */}
          {picking ? (
            <Text size='nano' variant='label' className='mt-1.5' data-probe='pick-hint'>
              <span
                aria-hidden
                className='mr-1 inline-block h-2.5 w-2.5 translate-y-px border border-borderColor align-baseline'
                style={{ background: hoverHex ?? background }}
              />
              sampling {hoverHex ?? '— move over the picture'} · click to keep it, esc to cancel ·
              the colour is averaged over 5×5 pixels so a jpeg’s noise does not become a seam
            </Text>
          ) : (
            <Text size='nano' variant='label' className='mt-1.5'>
              the dashed line is where the photograph ends · a ratio writes the four margins below,
              and typing into them is the same thing said by hand · the source is never cut
            </Text>
          )}
        </div>

        <div className='flex flex-col'>
          <SideRailGroup flush>ratios</SideRailGroup>
          {[...ASPECT_RATIOS]
            .sort((a, b) => b.value - a.value)
            .map((r) => {
              const m = srcW && srcH ? marginsForRatio(srcW, srcH, r.value) : NO_MARGINS;
              const w = srcW + m.left + m.right;
              const h = srcH + m.top + m.bottom;
              return (
                <SideRailItem
                  key={r.label}
                  className='text-control uppercase tracking-label'
                  selected={!!outH && Math.abs(outW / outH - r.value) < RATIO_EPSILON}
                  onClick={() => applyRatio(r.value)}
                  label={
                    <span className='flex items-center gap-1.5'>
                      <RatioGlyph width={r.value * 100} height={100} size={12} />
                      {r.label}
                    </span>
                  }
                  count={pixels ? `${w}×${h}` : '—'}
                />
              );
            })}
          <Text size='nano' variant='label' className='mt-1'>
            padding only — a ratio is reached by adding, never by cutting
          </Text>

          <SideRailGroup>margins</SideRailGroup>
          <div className='flex items-baseline justify-between gap-2'>
            <Text size='nano' variant='label' component='span'>
              all four sides
            </Text>
            <Text size='micro' component='span' className='tabular-nums'>
              {uniform === null ? 'uneven' : `${uniform} px`}
            </Text>
          </div>
          <div className='mt-1 flex items-center gap-1.5'>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              className='cursor-pointer'
              onClick={() => applyUniform((uniform ?? 0) - Math.max(1, Math.round(uniformMax / 20)))}
              disabled={!pixels || (uniform ?? 0) <= 0}
            >
              −
            </Button>
            <input
              type='range'
              min={0}
              max={uniformMax || 100}
              step={1}
              value={uniform ?? 0}
              disabled={!pixels}
              aria-label='margin on all four sides'
              className='crop-range h-4 min-w-0 flex-1'
              onChange={(e) => applyUniform(Number(e.target.value))}
            />
            <Button
              type='button'
              variant='secondary'
              size='xs'
              className='cursor-pointer'
              onClick={() => applyUniform((uniform ?? 0) + Math.max(1, Math.round(uniformMax / 20)))}
              disabled={!pixels || (uniform ?? 0) >= uniformMax}
            >
              +
            </Button>
          </div>

          <div className='mt-1.5 grid grid-cols-2 gap-1'>
            {sides.map((s) => (
              <label key={s.key} className='flex items-center gap-1'>
                <Text
                  size='nano'
                  variant='label'
                  component='span'
                  tracking='label'
                  className='w-10 shrink-0 uppercase'
                >
                  {s.label}
                </Text>
                <Input
                  type='number'
                  min={0}
                  step={1}
                  value={String(margins[s.key])}
                  disabled={!pixels}
                  aria-label={`${s.label} margin in pixels`}
                  data-probe={`margin-${s.key}`}
                  className='tabular-nums'
                  onChange={(e: { target: { value: string } }) => setSide(s.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className='mt-1.5 flex flex-wrap gap-1'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              onClick={centre}
              disabled={!pixels || sum(margins) === 0}
            >
              centre the picture
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              onClick={() => setMargins(NO_MARGINS)}
              disabled={!pixels || sum(margins) === 0}
            >
              no margins
            </Button>
          </div>

          <SideRailGroup>background</SideRailGroup>
          <div className='flex items-center gap-1.5'>
            {/* Тот же приём, что у палитры полосы DESIGN: нативный `input[type=color]` лежит
                прозрачным поверх квадрата в 1px обводке. Своего пикера цвета в системе нет и
                быть не должно — нативный приносит с собой и клавиатуру, и системную пипетку. */}
            <span className='relative inline-flex h-[22px] w-[22px] shrink-0 border border-borderColor focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-textColor'>
              <span aria-hidden className='h-full w-full' style={{ background }} />
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
            <Input
              type='text'
              value={hexDraft}
              disabled={!pixels}
              spellCheck={false}
              aria-label='background colour, hex'
              data-probe='hex-input'
              aria-invalid={normaliseHex(hexDraft) === undefined}
              className='tabular-nums uppercase'
              onChange={(e: { target: { value: string } }) => {
                setHexDraft(e.target.value);
                // Цвет применяется, ТОЛЬКО когда набранное — цвет. Иначе на каждом промежуточном
                // «#f» поле бы перекрашивалось в чёрное, и набрать hex руками было бы нельзя.
                const hex = normaliseHex(e.target.value);
                if (hex) setBackground(hex);
              }}
            />
          </div>
          <div className='mt-1.5 flex flex-wrap gap-1'>
            <Button
              type='button'
              variant={picking ? 'main' : 'secondary'}
              size='sm'
              className='cursor-pointer'
              aria-pressed={picking}
              data-probe='pick-toggle'
              onClick={() => {
                setPicking((p) => !p);
                setHoverHex(null);
              }}
              disabled={!pixels}
            >
              {picking ? 'picking — esc' : 'pick from the picture'}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              data-probe='white'
              onClick={() => commit(DEFAULT_BACKGROUND)}
              disabled={!pixels || background === DEFAULT_BACKGROUND}
            >
              white
            </Button>
          </div>

          <SideRailGroup>what you get</SideRailGroup>
          <SummaryRow
            label='source'
            value={pixels ? `${srcW}×${srcH} · ${ratioLabel(srcW, srcH)}` : '—'}
          />
          <SummaryRow
            label='result'
            value={pixels ? `${outW}×${outH} · ${ratioLabel(outW, outH)}` : '—'}
          />
          <SummaryRow
            label='added'
            value={pixels && sum(margins) ? `${outW - srcW}×${outH - srcH} px` : 'nothing'}
          />
          <SummaryRow label='background' value={<span className='uppercase'>{background}</span>} />
        </div>
      </div>

      <div className='flex flex-col gap-2 border-t border-hairline pt-2.5'>
        {loadError && (
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              <b>the source will not load.</b> There is nothing for the browser to draw on: the
              image never opened — the bucket may not have sent a CORS header, or the url is dead.
            </Text>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              className='ml-2 inline-block cursor-pointer align-middle'
              onClick={() => setReloadKey((k) => k + 1)}
            >
              load again
            </Button>
          </CalloutBox>
        )}
        {saveError && !loadError && (
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              <b>expanding failed.</b> {saveError}
            </Text>
          </CalloutBox>
        )}

        <Text size='nano' variant='label'>
          {footerNote ??
            'expanding does not touch the source: the margins produce a NEW file, and that is the one that goes to the bucket.'}
        </Text>

        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {pixels ? `${outW}×${outH}` : '—'}
          </Text>
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            {blockedReason && (
              <Text size='micro' variant='label' component='span' data-probe='blocked'>
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
