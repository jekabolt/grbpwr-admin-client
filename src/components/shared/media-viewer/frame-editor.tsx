import {
  ExpandHandles,
  type ExpandDragMode,
} from 'components/managers/media/components/expand-handles';
import {
  DEFAULT_BACKGROUND,
  FILL_SWATCHES,
  loadSourcePixels,
  marginsForRatio,
  NO_MARGINS,
  type Margins,
  type SourcePixels,
} from 'components/managers/media/utils/getExpanded';
import getCroppedImg, {
  imageFormatOf,
  normaliseImageFormat,
  type CropFrame,
} from 'lib/features/getCropped';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button, Input, Text } from 'ui';
import './frame-editor.css';

export type FrameEditorKind = 'crop' | 'expand';
export type FrameAspect = 'free' | '3:4' | '4:5' | '1:1';

export interface FrameEditorHandle {
  kind: FrameEditorKind;
  setKind(k: FrameEditorKind): void;
  aspect: FrameAspect;
  setAspect(a: FrameAspect): void;
  dirty: boolean;
  busy: boolean;
  error?: string;
  reset(): void;
  apply(): Promise<{ dataUrl: string; frame?: CropFrame } | null>;
}

type StageSize = { w: number; h: number };
type CropRect = { x: number; y: number; width: number; height: number };
type ExpandFreeze = { k: number; x: number; y: number; margins: Margins; anchor: boolean };

type FrameEditorInternal = {
  pixels: SourcePixels | null;
  crop: PercentCrop | undefined;
  cropAspect: number | undefined;
  cropDisplay: StageSize | null;
  margins: Margins;
  background: string;
  edgeBackground: string;
  hoverBackground: string | null;
  picking: boolean;
  stageRef: (element: HTMLDivElement | null) => void;
  expandFrame: { k: number; x: number; y: number; w: number; h: number } | null;
  changeCrop(next: PercentCrop): void;
  changeMargins(next: Margins): void;
  beginExpandDrag(mode: ExpandDragMode): void;
  endExpandDrag(): void;
  setBackground(next: string): void;
  setHoverBackground(next: string | null): void;
  setPicking(next: boolean): void;
  reload(): void;
};

export type FrameEditor = FrameEditorHandle & FrameEditorInternal;

const ASPECTS: Record<Exclude<FrameAspect, 'free'>, number> = {
  '3:4': 3 / 4,
  '4:5': 4 / 5,
  '1:1': 1,
};
const ASPECT_OPTIONS: FrameAspect[] = ['free', '3:4', '4:5', '1:1'];
const KIND_OPTIONS: FrameEditorKind[] = ['crop', 'expand'];
const SNAP_PRESETS = Object.values(ASPECTS);
const RATIO_EPSILON = 0.005;
const MIN_FRAME_PX = 24;
const MIN_SCALE = 0.1;
const STAGE_PAD = 24;
const EXPAND_FIT = 0.82;
const MAX_IMAGE_MEGAPIXELS = 40;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sumMargins = (margins: Margins) =>
  margins.top + margins.right + margins.bottom + margins.left;

function maxFrame(ratio: number | undefined, boxRatio: number) {
  if (!ratio) return { width: 1, height: 1 };
  return ratio >= boxRatio
    ? { width: 1, height: boxRatio / ratio }
    : { width: ratio / boxRatio, height: 1 };
}

function buildCrop(
  ratio: number | undefined,
  boxRatio: number,
  scale = 1,
  centreX = 50,
  centreY = 50,
): PercentCrop {
  const maximum = maxFrame(ratio, boxRatio);
  const width = clamp(maximum.width * 100 * scale, 1, 100);
  const height = clamp(maximum.height * 100 * scale, 1, 100);
  return {
    unit: '%',
    width,
    height,
    x: clamp(centreX - width / 2, 0, 100 - width),
    y: clamp(centreY - height / 2, 0, 100 - height),
  };
}

function reshapeCrop(
  current: PercentCrop | undefined,
  ratio: number,
  boxRatio: number,
): PercentCrop {
  if (!current || current.height <= 0) return buildCrop(ratio, boxRatio);
  const currentRatio = (current.width * boxRatio) / current.height;
  const currentMaximum = maxFrame(currentRatio, boxRatio);
  const scale = clamp(current.width / 100 / currentMaximum.width, MIN_SCALE, 1);
  return buildCrop(
    ratio,
    boxRatio,
    scale,
    current.x + current.width / 2,
    current.y + current.height / 2,
  );
}

function cropRect(
  crop: PercentCrop | undefined,
  width: number,
  height: number,
  aspect: number | undefined,
): CropRect | null {
  if (!crop || !width || !height) return null;
  const x = Math.round((crop.x / 100) * width);
  const y = Math.round((crop.y / 100) * height);
  let frameWidth = Math.round((crop.width / 100) * width);
  let frameHeight = Math.round((crop.height / 100) * height);

  if (aspect) {
    frameHeight = Math.max(1, Math.round(frameWidth / aspect));
    if (y + frameHeight > height) {
      frameHeight = height - y;
      frameWidth = Math.max(1, Math.round(frameHeight * aspect));
    }
  }

  return {
    x,
    y,
    width: clamp(frameWidth, 1, width - x),
    height: clamp(frameHeight, 1, height - y),
  };
}

function aspectForRatio(ratio: number): FrameAspect {
  const match = (Object.entries(ASPECTS) as Array<[Exclude<FrameAspect, 'free'>, number]>).find(
    ([, value]) => Math.abs(value - ratio) < RATIO_EPSILON,
  );
  return match?.[0] ?? 'free';
}

function averageEdgeColour(pixels: SourcePixels): string {
  const inset = 3;
  const xs = [inset, pixels.width / 2, pixels.width - 1 - inset];
  const ys = [inset, pixels.height / 2, pixels.height - 1 - inset];
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (const y of ys) {
    for (const x of xs) {
      if (x === pixels.width / 2 && y === pixels.height / 2) continue;
      const hex = pixels.sampleAt(x, y);
      red += parseInt(hex.slice(1, 3), 16);
      green += parseInt(hex.slice(3, 5), 16);
      blue += parseInt(hex.slice(5, 7), 16);
      count += 1;
    }
  }

  const channel = (value: number) =>
    clamp(Math.round(value / count), 0, 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export function useFrameEditor({
  src,
  initialKind = 'crop',
}: {
  src: string;
  initialKind?: FrameEditorKind;
}): FrameEditor {
  const [kind, setKindState] = useState<FrameEditorKind>(initialKind);
  const [aspect, setAspectState] = useState<FrameAspect>('free');
  const [pixels, setPixels] = useState<SourcePixels | null>(null);
  const [crop, setCrop] = useState<PercentCrop>();
  const [margins, setMargins] = useState<Margins>(NO_MARGINS);
  const [background, setBackgroundState] = useState(DEFAULT_BACKGROUND);
  const [hoverBackground, setHoverBackground] = useState<string | null>(null);
  const [picking, setPickingState] = useState(false);
  const [stage, setStage] = useState<StageSize>({ w: 0, h: 0 });
  const [freeze, setFreeze] = useState<ExpandFreeze | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [exportError, setExportError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  const resizeObserver = useRef<ResizeObserver | null>(null);
  const stageRef = useCallback((element: HTMLDivElement | null) => {
    resizeObserver.current?.disconnect();
    resizeObserver.current = null;
    if (!element) return;
    const read = () => {
      const bounds = element.getBoundingClientRect();
      setStage((current) =>
        Math.abs(current.w - bounds.width) < 0.5 && Math.abs(current.h - bounds.height) < 0.5
          ? current
          : { w: bounds.width, h: bounds.height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    resizeObserver.current = observer;
  }, []);

  useEffect(() => () => resizeObserver.current?.disconnect(), []);

  useEffect(() => {
    setKindState(initialKind);
    setAspectState('free');
    setCrop(undefined);
    setMargins(NO_MARGINS);
    setBackgroundState(DEFAULT_BACKGROUND);
    setHoverBackground(null);
    setPickingState(false);
    setFreeze(null);
    setExportError(undefined);
  }, [initialKind, src]);

  useEffect(() => {
    let cancelled = false;
    setPixels(null);
    setLoadError(undefined);
    setLoading(true);

    if (!src) {
      setLoadError('image source is empty');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    loadSourcePixels(src)
      .then((next) => {
        if (cancelled) return;
        setPixels(next);
        setCrop(buildCrop(undefined, next.width / next.height));
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoadError(reason instanceof Error ? reason.message : 'the image did not load');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, src]);

  const cropAspect = aspect === 'free' ? undefined : ASPECTS[aspect];
  const boxRatio = pixels ? pixels.width / pixels.height : 1;

  useEffect(() => {
    if (pixels && !crop) setCrop(buildCrop(undefined, pixels.width / pixels.height));
  }, [crop, pixels]);

  const rect = useMemo(
    () => cropRect(crop, pixels?.width ?? 0, pixels?.height ?? 0, cropAspect),
    [crop, cropAspect, pixels],
  );

  const cropDisplay = useMemo(() => {
    if (!pixels || !stage.w || !stage.h) return null;
    const availableWidth = Math.max(0, stage.w - STAGE_PAD * 2);
    const availableHeight = Math.max(0, stage.h - STAGE_PAD * 2);
    const width = Math.min(availableWidth, availableHeight * boxRatio);
    return width > 0 ? { w: width, h: width / boxRatio } : null;
  }, [boxRatio, pixels, stage.h, stage.w]);

  const outWidth = pixels ? pixels.width + margins.left + margins.right : 0;
  const outHeight = pixels ? pixels.height + margins.top + margins.bottom : 0;
  const fittedScale =
    outWidth && outHeight && stage.w && stage.h
      ? Math.max(
          0,
          Math.min((stage.w - STAGE_PAD * 2) / outWidth, (stage.h - STAGE_PAD * 2) / outHeight),
        ) * EXPAND_FIT
      : 0;
  const expandScale = freeze?.k ?? fittedScale;
  const expandWidth = outWidth * expandScale;
  const expandHeight = outHeight * expandScale;
  const expandX = freeze
    ? freeze.x - (freeze.anchor ? (margins.left - freeze.margins.left) * expandScale : 0)
    : (stage.w - expandWidth) / 2;
  const expandY = freeze
    ? freeze.y - (freeze.anchor ? (margins.top - freeze.margins.top) * expandScale : 0)
    : (stage.h - expandHeight) / 2;
  const expandFrame =
    pixels && expandScale > 0
      ? { k: expandScale, x: expandX, y: expandY, w: expandWidth, h: expandHeight }
      : null;

  const cropDirty =
    !!rect &&
    !!pixels &&
    (rect.x !== 0 || rect.y !== 0 || rect.width !== pixels.width || rect.height !== pixels.height);
  const expandDirty = sumMargins(margins) > 0;
  const dirty = kind === 'crop' ? cropDirty : expandDirty;

  const setKind = useCallback(
    (next: FrameEditorKind) => {
      setKindState(next);
      setPickingState(false);
      setHoverBackground(null);
      setFreeze(null);
      setExportError(undefined);
      if (!pixels || aspect === 'free') return;
      const ratio = ASPECTS[aspect];
      if (next === 'crop') {
        setCrop((current) => reshapeCrop(current, ratio, pixels.width / pixels.height));
      } else {
        setMargins(marginsForRatio(pixels.width, pixels.height, ratio));
      }
    },
    [aspect, pixels],
  );

  const setAspect = useCallback(
    (next: FrameAspect) => {
      setAspectState(next);
      setExportError(undefined);
      if (!pixels || next === 'free') return;
      const ratio = ASPECTS[next];
      if (kind === 'crop') {
        setCrop((current) => reshapeCrop(current, ratio, pixels.width / pixels.height));
      } else {
        setMargins(marginsForRatio(pixels.width, pixels.height, ratio));
      }
    },
    [kind, pixels],
  );

  const changeCrop = useCallback((next: PercentCrop) => {
    setCrop(next);
    setExportError(undefined);
  }, []);

  const changeMargins = useCallback(
    (next: Margins) => {
      setMargins(next);
      setExportError(undefined);
      if (pixels) {
        const width = pixels.width + next.left + next.right;
        const height = pixels.height + next.top + next.bottom;
        setAspectState(height > 0 ? aspectForRatio(width / height) : 'free');
      }
    },
    [pixels],
  );

  const beginExpandDrag = useCallback(
    (mode: ExpandDragMode) => {
      if (!expandFrame) return;
      setFreeze({
        k: expandFrame.k,
        x: expandFrame.x,
        y: expandFrame.y,
        margins,
        anchor: mode !== 'photo',
      });
    },
    [expandFrame, margins],
  );

  const endExpandDrag = useCallback(() => setFreeze(null), []);

  const setBackground = useCallback((next: string) => {
    setBackgroundState(next);
    setHoverBackground(null);
    setExportError(undefined);
  }, []);

  const setPicking = useCallback((next: boolean) => {
    setPickingState(next);
    setHoverBackground(null);
  }, []);

  const reset = useCallback(() => {
    setAspectState('free');
    setPickingState(false);
    setHoverBackground(null);
    setFreeze(null);
    setExportError(undefined);
    if (!pixels) return;
    if (kind === 'crop') {
      setCrop(buildCrop(undefined, pixels.width / pixels.height));
    } else {
      setMargins(NO_MARGINS);
      setBackgroundState(DEFAULT_BACKGROUND);
    }
  }, [kind, pixels]);

  const apply = useCallback(async () => {
    if (!pixels || !dirty) return null;
    setExporting(true);
    setExportError(undefined);

    try {
      if (kind === 'crop') {
        if (!rect) return null;
        const format = normaliseImageFormat(imageFormatOf(pixels.dataUrl));
        const dataUrl = await getCroppedImg(pixels.dataUrl, rect, undefined, format);
        return {
          dataUrl,
          frame: {
            x: rect.x / pixels.width,
            y: rect.y / pixels.height,
            w: rect.width / pixels.width,
            h: rect.height / pixels.height,
            rotation: 0,
          },
        };
      }

      const megapixels = (outWidth * outHeight) / 1_000_000;
      if (megapixels > MAX_IMAGE_MEGAPIXELS) {
        throw new Error(
          `expanded frame is ${megapixels.toFixed(1)} MP; maximum is ${MAX_IMAGE_MEGAPIXELS} MP`,
        );
      }
      const format = imageFormatOf(pixels.dataUrl) === 'image/webp' ? 'image/webp' : 'image/jpeg';
      return { dataUrl: pixels.expand(margins, background, format) };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'the frame could not be exported';
      setExportError(message);
      throw reason;
    } finally {
      setExporting(false);
    }
  }, [background, dirty, kind, margins, outHeight, outWidth, pixels, rect]);

  const edgeBackground = useMemo(
    () => (pixels ? averageEdgeColour(pixels) : DEFAULT_BACKGROUND),
    [pixels],
  );

  return {
    kind,
    setKind,
    aspect,
    setAspect,
    dirty,
    busy: loading || exporting,
    error: loadError ?? exportError,
    reset,
    apply,
    pixels,
    crop,
    cropAspect,
    cropDisplay,
    margins,
    background,
    edgeBackground,
    hoverBackground,
    picking,
    stageRef,
    expandFrame,
    changeCrop,
    changeMargins,
    beginExpandDrag,
    endExpandDrag,
    setBackground,
    setHoverBackground,
    setPicking,
    reload: () => setReloadKey((current) => current + 1),
  };
}

function CropStage({ editor }: { editor: FrameEditor }) {
  if (!editor.pixels || !editor.cropDisplay) return null;
  return (
    <ReactCrop
      className='frame-editor-crop'
      crop={editor.crop}
      aspect={editor.cropAspect}
      minWidth={MIN_FRAME_PX}
      minHeight={MIN_FRAME_PX}
      disabled={editor.busy}
      onChange={(pixelCrop, percentCrop) => {
        if (pixelCrop.width >= 1 && pixelCrop.height >= 1) editor.changeCrop(percentCrop);
      }}
    >
      <div
        className='relative overflow-hidden'
        style={{ width: editor.cropDisplay.w, height: editor.cropDisplay.h }}
      >
        <img
          src={editor.pixels.dataUrl}
          alt=''
          draggable={false}
          className='absolute inset-0 h-full w-full select-none'
        />
      </div>
    </ReactCrop>
  );
}

function ExpandStage({ editor }: { editor: FrameEditor }) {
  const { expandFrame, pixels } = editor;
  if (!pixels || !expandFrame) return null;

  const pointToSource = (event: {
    clientX: number;
    clientY: number;
    currentTarget: HTMLImageElement;
  }) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * pixels.width,
      y: ((event.clientY - bounds.top) / bounds.height) * pixels.height,
    };
  };

  return (
    <div
      className='frame-editor-expand-frame absolute'
      style={{
        left: expandFrame.x,
        top: expandFrame.y,
        width: expandFrame.w,
        height: expandFrame.h,
        background: editor.background,
      }}
    >
      <img
        src={pixels.dataUrl}
        alt=''
        draggable={false}
        className={cn('absolute select-none', editor.picking && 'cursor-crosshair')}
        style={{
          left: editor.margins.left * expandFrame.k,
          top: editor.margins.top * expandFrame.k,
          width: pixels.width * expandFrame.k,
          height: pixels.height * expandFrame.k,
          maxWidth: 'none',
          maxHeight: 'none',
        }}
        onPointerMove={(event) => {
          if (!editor.picking) return;
          const point = pointToSource(event);
          if (point) editor.setHoverBackground(pixels.sampleAt(point.x, point.y));
        }}
        onPointerLeave={() => editor.picking && editor.setHoverBackground(null)}
        onClick={(event) => {
          if (!editor.picking) return;
          const point = pointToSource(event);
          if (!point) return;
          editor.setBackground(pixels.sampleAt(point.x, point.y));
          editor.setPicking(false);
        }}
      />
      <ExpandHandles
        touch
        cornersOnly
        tone='dark'
        labels={false}
        margins={editor.margins}
        srcW={pixels.width}
        srcH={pixels.height}
        scale={expandFrame.k}
        mirror={false}
        presets={SNAP_PRESETS}
        maxMegapixels={MAX_IMAGE_MEGAPIXELS}
        pickMode={editor.picking}
        disabled={editor.busy}
        onChange={editor.changeMargins}
        onDragStart={editor.beginExpandDrag}
        onDragEnd={editor.endExpandDrag}
      />
    </div>
  );
}

export function FrameEditorStage({
  editor,
  className,
}: {
  editor: FrameEditor;
  className?: string;
}): JSX.Element {
  const waiting = editor.busy && !editor.pixels;
  const failed = !!editor.error && !editor.pixels;

  return (
    <div
      ref={editor.stageRef}
      className={cn(
        'relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden bg-textColor',
        className,
      )}
      aria-busy={editor.busy}
    >
      {waiting ? (
        <Text size='micro' component='span' className='text-bgColor/60'>
          loading image
        </Text>
      ) : failed ? (
        <div className='flex flex-col items-center gap-2.5 px-block text-center'>
          <Text size='micro' component='span' className='text-error'>
            {editor.error}
          </Text>
          <Button
            type='button'
            variant={null}
            className='min-h-11 cursor-pointer border border-bgColor/20 px-3 text-micro text-bgColor focus-visible:outline-bgColor'
            onClick={editor.reload}
          >
            retry
          </Button>
        </div>
      ) : editor.kind === 'crop' ? (
        <CropStage editor={editor} />
      ) : (
        <ExpandStage editor={editor} />
      )}
    </div>
  );
}

function renderEditorChip({
  children,
  selected,
  disabled,
  tone,
  onClick,
}: {
  children: string;
  selected: boolean;
  disabled: boolean;
  tone: 'dark' | 'light';
  onClick: () => void;
}) {
  return (
    <Button
      key={children}
      type='button'
      role='radio'
      variant={null}
      aria-checked={selected}
      disabled={disabled}
      className={cn(
        'min-h-11 cursor-pointer border px-2.5 text-micro tracking-label disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'dark'
          ? cn(
              'border-bgColor/20 text-bgColor/60 focus-visible:outline-bgColor',
              selected && 'border-bgColor text-bgColor',
            )
          : cn(
              'border-borderColor text-labelColor hover:text-textColor',
              selected && 'border-textColor text-textColor',
            ),
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function FillControls({ editor, tone }: { editor: FrameEditor; tone: 'dark' | 'light' }) {
  const swatches = [FILL_SWATCHES[0], editor.edgeBackground];
  const ink = tone === 'dark' ? 'text-bgColor' : 'text-textColor';
  const quiet = tone === 'dark' ? 'text-bgColor/60' : 'text-labelColor';
  const rule = tone === 'dark' ? 'border-bgColor/20' : 'border-borderColor';
  const focus = tone === 'dark' ? 'focus-visible:outline-bgColor' : undefined;

  return (
    <div className='flex items-center gap-1.5' aria-label='fill'>
      <Text size='micro' component='span' className={cn('mr-1 shrink-0', quiet)}>
        fill
      </Text>
      {swatches.map((colour, index) => (
        <Button
          key={`${colour}-${index}`}
          type='button'
          variant={null}
          aria-label={index === 0 ? 'white fill' : 'edge fill'}
          aria-pressed={!editor.picking && editor.background === colour}
          disabled={!editor.pixels || editor.busy}
          className={cn(
            'flex size-11 shrink-0 cursor-pointer items-center justify-center border disabled:opacity-40',
            rule,
            focus,
          )}
          onClick={() => {
            editor.setBackground(colour);
            editor.setPicking(false);
          }}
        >
          <span
            aria-hidden
            className={cn(
              'size-6 border border-borderColor',
              !editor.picking &&
                editor.background === colour &&
                (tone === 'dark' ? 'outline-bgColor' : 'outline-textColor'),
              !editor.picking &&
                editor.background === colour &&
                'outline outline-1 outline-offset-2',
            )}
            style={{ background: colour }}
          />
        </Button>
      ))}
      <Button
        type='button'
        variant={null}
        aria-label='pick fill from image'
        aria-pressed={editor.picking}
        disabled={!editor.pixels || editor.busy}
        className={cn(
          'flex min-h-11 cursor-pointer items-center border px-3 text-micro disabled:opacity-40',
          rule,
          editor.picking ? ink : quiet,
          focus,
        )}
        onClick={() => editor.setPicking(!editor.picking)}
      >
        pick
      </Button>
      <label
        className={cn(
          'relative flex size-11 shrink-0 cursor-pointer items-center justify-center border focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
          rule,
          tone === 'dark' ? 'focus-within:outline-bgColor' : 'focus-within:outline-textColor',
        )}
      >
        <span
          aria-hidden
          className='size-6 border border-borderColor'
          style={{ background: editor.hoverBackground ?? editor.background }}
        />
        <Input
          type='color'
          aria-label='custom fill'
          value={editor.background}
          disabled={!editor.pixels || editor.busy}
          className='absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed'
          onChange={(event: { target: { value: string } }) =>
            editor.setBackground(event.target.value)
          }
        />
      </label>
    </div>
  );
}

function renderFrameEditorPanel({
  editor,
  tone,
}: {
  editor: FrameEditor;
  tone: 'dark' | 'light';
}): JSX.Element {
  const disabled = !editor.pixels || editor.busy;
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-stack p-3',
        tone === 'dark'
          ? 'border-t border-bgColor/20 bg-textColor text-bgColor'
          : 'border-l border-borderColor bg-bgColor text-textColor',
      )}
    >
      <div role='radiogroup' aria-label='frame mode' className='flex flex-wrap gap-1.5'>
        {KIND_OPTIONS.map((kind) =>
          renderEditorChip({
            children: kind,
            selected: editor.kind === kind,
            disabled,
            tone,
            onClick: () => editor.setKind(kind),
          }),
        )}
      </div>
      <div role='radiogroup' aria-label='frame aspect' className='flex flex-wrap gap-1.5'>
        {ASPECT_OPTIONS.map((aspect) =>
          renderEditorChip({
            children: aspect,
            selected: editor.aspect === aspect,
            disabled,
            tone,
            onClick: () => editor.setAspect(aspect),
          }),
        )}
      </div>
      {editor.kind === 'expand' && <FillControls editor={editor} tone={tone} />}
    </div>
  );
}

export { renderFrameEditorPanel as FrameEditorPanel };
