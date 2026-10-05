import type { DesignSplitFrame, common_DesignPicture } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { TILE_QUIET } from 'ui/components/tile-skin';

import { detectSplitOf } from './generation/detect-split-image';
import { newClientRequestId, useDesignWrites } from './use-design-band';
import { DESIGN_VIEW_KEYS, normaliseViewKey, viewLabel } from './views';

/**
 * THE SPLIT — one composite picture into several, and the cut happens ON THE SERVER.
 *
 * This modal ships FRAMES, never pixels. `SplitDesignPicture` cuts losslessly from the ORIGINAL
 * bytes; a client-side crop would re-encode a thumbnail the operator happened to be looking at and
 * file the result as if it were the original. That is why nothing here touches a canvas, and why
 * the only thing the OK button sends is four numbers and a word per frame.
 *
 * COORDINATES ARE NORMALISED 0..1 OF THE SOURCE IMAGE, which puts one hard requirement on the
 * stage: THE STAGE BOX MUST CARRY THE PICTURE'S OWN ASPECT RATIO. A frame at x=0.5 has to sit over
 * the same pixels the server will cut, and inside a box of the wrong shape it does not — the two
 * obvious CSS arrangements (`object-contain` in a fixed box, `object-cover` in a fixed box) each
 * put the same fraction in a different place, one by letterboxing and one by cropping. So the box
 * is given `aspect-ratio` from the media's own width/height, and the picture fills it exactly.
 *
 * ONE CUT IS ONE INTENT, AND THE INTENT CARRIES THE IDEMPOTENCY KEY. `client_request_id` is minted
 * when SPLIT is pressed and kept until it lands: a retry after a network timeout must return the
 * SAME crops rather than mint a second set. Editing a frame throws the key away — the frames are
 * different, so it is a different intent and deserves its own key.
 *
 * ANY PICTURE MAY BE CUT — compositeness is NOT a precondition here, and the door is not gated on
 * it. The server used to refuse a source whose `composite_views` was empty, and that column had
 * exactly one writer: the arrival of a generative run. With generation cut from the wave, NOTHING
 * sets it — `DesignUploadItem` is `{media_id, ghost_view}` and carries no such field — so a
 * hand-brought sheet of three flats could never have been cut at all. The refusal is being lifted
 * server-side; a client-side copy of it would keep the door locked after the lock is gone.
 *
 * WHICH PUTS THE WHOLE MEANING ON `view_key`. It is the ONLY place a person says what is on a
 * piece, so it is neither optional nor guessed: an unmarked frame cannot be sent, and no frame is
 * ever quietly pre-filled with `front`. A default here would be a label nobody chose, confirmed by
 * a tired human and frozen into a sheet version.
 */

/**
 * A picture that DECLARES it glues several views into one image.
 *
 * NOT a precondition of the split — see the header. It is read for two smaller things: the tile
 * badge, and the one rule that still depends on it, which is that a picture holding several views
 * may not be dropped into a bench slot, because a slot holds one view and this picture has none.
 * The column has no writer while generation is cut, so on beta this answers `false` everywhere.
 */
export function isComposite(picture: Pick<common_DesignPicture, 'compositeViews'>): boolean {
  return (picture.compositeViews ?? []).length > 0;
}

export type SplitFrameDraft = {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Empty is a legal frame on the wire, and it is still refused here — see `ready`. The wire is
   * permissive because an unnamed crop is a real thing; this screen is strict because it is the one
   * moment a person can say what a piece IS, and a frame that skips it produces a picture nobody
   * can address afterwards.
   */
  viewKey: string;
};

const MIN_SIDE = 0.02;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Four decimals, the same precision the card's annotation points are pinned at.
 *
 * Not cosmetic. A raw float round-trips as `0.30000000000000004` and, worse, a value small enough
 * to acquire an exponent (`1.2e-7`) is eleven bytes of decimal that cost real CPU downstream — the
 * annotation layer has already been bitten by exactly that. Four decimals of a normalised
 * coordinate is a fraction of a pixel on any image a person can look at.
 */
function round4(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

function toWireFrame(frame: SplitFrameDraft): DesignSplitFrame {
  return {
    x: { value: round4(frame.x) },
    y: { value: round4(frame.y) },
    w: { value: round4(frame.w) },
    h: { value: round4(frame.h) },
    viewKey: frame.viewKey,
  };
}

/**
 * `n` frames side by side, taking the guessed views off the composite in order.
 *
 * A 1.5% gutter at each edge and 3% between frames: a frame flush against the border cannot be
 * grabbed by its outer handle, and the whole point of the preset is that it is a starting position
 * to drag from, not an answer.
 */
function acrossPreset(n: number, views: readonly string[]): SplitFrameDraft[] {
  const span = 0.97 / n;
  return Array.from({ length: n }, (_, i) => ({
    x: 0.015 + i * span,
    y: 0.02,
    w: Math.max(MIN_SIDE, span - 0.03),
    h: 0.96,
    viewKey: guessedViewKey(views[i]),
  }));
}

/**
 * A seed for a frame's view, taken from the composite's own declared views.
 *
 * `composite_views` is an OPEN vocabulary on the wire, exactly like `source_class`, and the shared
 * `viewLabel` deliberately echoes an unknown key back rather than replacing it. That is right for
 * printing and wrong for seeding a picker: a value with no matching option leaves the Radix trigger
 * showing its placeholder while the frame quietly HOLDS a key, and the submit gate would then pass
 * a view nobody chose and the server may reject. So membership in the one dictionary is tested here
 * — a test against `./views`, not a second copy of it — and anything outside it seeds NO guess.
 */
function guessedViewKey(value?: string): string {
  const key = normaliseViewKey(value);
  return (DESIGN_VIEW_KEYS as readonly string[]).includes(key) ? key : '';
}

type DragMode = 'move' | 'l' | 'r' | 't' | 'b';

type DragState = {
  index: number;
  mode: DragMode;
  rect: DOMRect;
  originX: number;
  originY: number;
  frame: SplitFrameDraft;
};

/**
 * ═══ ONE FRAME EDITOR, TWO HOSTS (03.10, owner item 19, T20) ═══════════════════════════════════
 *
 * Owner, verbatim: «в LATEST GENERATION если мы имеем дело с не сплитнутой картинкой нам это прямо
 * в этом же блоке надо разметить и спилтнуть и кропнуть должны видеть то что на скриншоте и снизу
 * кнопка confirm».
 *
 * The frames, their drag, the idempotency key and the cut itself live here, once: `useSplitCut`
 * is the state and the write, `SplitStage` the sheet with its frames, `SplitSides` the popup's list
 * of sides. The popup (`SplitModal`, its other callers: the history, the input's crop) and the
 * bench's inline editor (`generation/inline-split.tsx`) are two shells over the same three, so the
 * RPC, its payload and the frame rules cannot drift apart.
 */
export function useSplitCut({
  techCardId,
  picture,
  mode = 'split',
  forInput,
  views,
  active,
  onTouch,
  onCut,
}: {
  techCardId: number;
  picture: common_DesignPicture;
  mode?: 'split' | 'crop';
  forInput: boolean;
  /**
   * The views the frames are seeded from, when the host knows better than the column: the bench
   * reads `readSplit`, which also names a `one` sheet the writer never stamped. Absent — the
   * picture's own `composite_views`, as the popup always did.
   */
  views?: readonly string[];
  /** Frames are re-seeded whenever this turns true (the popup's `open`) or the seed changes. */
  active: boolean;
  /** The person touched a frame or pressed the cut — the host's chance to pin what it shows. */
  onTouch?: () => void;
  /** The cut landed; the server's pieces. */
  onCut?: (pictures: common_DesignPicture[]) => void;
}) {
  const { splitPicture } = useDesignWrites(techCardId);
  const seed = (views ?? picture.compositeViews ?? []).join('|');
  const compositeViews = useMemo(() => (seed ? seed.split('|').map(guessedViewKey) : []), [seed]);

  /**
   * НАЧАЛЬНАЯ РАЗМЕТКА. В режиме кропа — ОДИН кадр, вписанный в середину с полями: рамка впритык к
   * краю не имеет наружной ручки, за которую её тянут, а кроп «как есть» — это не кроп.
   */
  const initial = useMemo(
    () =>
      mode === 'crop'
        ? [{ x: 0.1, y: 0.1, w: 0.8, h: 0.8, viewKey: '' }]
        : acrossPreset(Math.max(2, compositeViews.length || 2), compositeViews),
    [compositeViews, mode],
  );

  /**
   * ═══ THE DETECTOR'S SEED (05.10, owner item 11, R19, T26) ═══════════════════════════════════════
   * A sheet of N views is read once (`generation/detect-split.ts`: the empty columns between the
   * views) and its frames replace the equal columns — while nobody has touched a frame yet. A
   * CONFIDENT reading is what the bench's auto-cut presses `confirm` on (`inline-split.tsx`); an
   * unsure one only seeds the editor. `reset` returns to the detector's frames, not the columns.
   */
  const [detected, setDetected] = useState<{
    key: string;
    confident: boolean;
    frames: SplitFrameDraft[];
  } | null>(null);
  const [frames, setFrames] = useState<SplitFrameDraft[]>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /**
   * THE CUT LANDED, AND THE BAND HAS NOT COME BACK YET. The inline editor stays on screen until the
   * re-read brings the pieces; a second press in that gap would mint a NEW key (the old one is
   * spent) and cut the sheet twice. So a landed cut is TERMINAL for this picture (gate wave 3, W7):
   * no edit, drag or key re-arms it — only a new seed or picture, or the editor unmounting (the
   * popup unmounts on close). The ref answers the handlers between a landing and its re-render.
   */
  const [landed, setLandedState] = useState(false);
  const landedRef = useRef(false);
  const setLanded = useCallback((v: boolean) => {
    landedRef.current = v;
    setLandedState(v);
  }, []);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef(onTouch);
  touchRef.current = onTouch;

  /**
   * The idempotency key of the CURRENT frame set. Cleared whenever the frames move, because moved
   * frames are a different request and reusing the key would hand back the previous cut.
   */
  const requestIdRef = useRef('');

  /** A person moved, named, added or removed a frame since the seed — the detector stands back. */
  const touchedRef = useRef(false);

  const editFrames = useCallback((next: (prev: SplitFrameDraft[]) => SplitFrameDraft[]) => {
    if (landedRef.current) return;
    requestIdRef.current = '';
    touchedRef.current = true;
    touchRef.current?.();
    setFrames(next);
  }, []);

  // Reopening on another picture must not inherit the previous picture's frames.
  const pictureId = picture.id ?? 0;
  useEffect(() => {
    if (!active) return;
    requestIdRef.current = '';
    touchedRef.current = false;
    setFrames(initial);
    setSelected(null);
    setLanded(false);
  }, [active, initial, pictureId, setLanded]);

  const media = picture.media?.media;
  const src =
    media?.fullSize?.mediaUrl || media?.compressed?.mediaUrl || media?.thumbnail?.mediaUrl || '';

  /* The detector reads a SMALLER rendition, never the full size: the frames are normalised, so the
     rendition does not move them, and a bench of sheets does not decode originals. */
  const thumbW = media?.thumbnail?.width ?? 0;
  const detectSrc =
    media?.compressed?.mediaUrl || (thumbW >= 1000 ? media?.thumbnail?.mediaUrl : '') || '';
  const viewCount = compositeViews.length;
  const detectKey =
    mode === 'split' && detectSrc && viewCount >= 2 ? `${pictureId}|${detectSrc}|${seed}` : '';
  useEffect(() => {
    if (!active || !detectKey) return;
    const ac = new AbortController();
    detectSplitOf(detectSrc, viewCount, ac.signal)
      .then((found) => {
        if (ac.signal.aborted || !found) return;
        const seeded = found.frames.map((f, i) => ({
          ...f,
          viewKey: compositeViews[i] ?? '',
        }));
        setDetected({ key: detectKey, confident: found.confident, frames: seeded });
        if (touchedRef.current || landedRef.current) return;
        requestIdRef.current = '';
        setFrames(seeded);
      })
      .catch(() => {
        /* no pixels (network, decode) — the equal columns stand, the person cuts by hand */
      });
    return () => ac.abort();
    // `compositeViews` and `viewCount` are spelled by `seed`, which `detectKey` carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, detectKey, detectSrc]);
  const detection = detected && detected.key === detectKey ? detected : null;

  /**
   * The picture's own shape. Taken from the wire when the bucket knows it and re-read from the
   * decoded image otherwise, because the stage is only honest at the picture's ratio.
   */
  const [ratio, setRatio] = useState<number>(() => {
    const w = media?.fullSize?.width ?? 0;
    const h = media?.fullSize?.height ?? 0;
    return w > 0 && h > 0 ? w / h : 0;
  });

  /* Keyed by the NUMBERS, not the media object: the bench's editor outlives every 4 s re-read of
     the band, each of which hands a new object, and a wire without dimensions would reset the ratio
     the decoded image already gave (its `onLoad` does not fire again for the same src). */
  const wireW = media?.fullSize?.width ?? 0;
  const wireH = media?.fullSize?.height ?? 0;
  useEffect(() => {
    if (wireW > 0 && wireH > 0) setRatio(wireW / wireH);
  }, [wireW, wireH]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const dx = (event.clientX - drag.originX) / (drag.rect.width || 1);
      const dy = (event.clientY - drag.originY) / (drag.rect.height || 1);
      setFrames((prev) =>
        prev.map((frame, i) =>
          i === drag.index ? applyDrag(drag.frame, drag.mode, dx, dy) : frame,
        ),
      );
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag]);

  const startDrag = (index: number, dragMode: DragMode) => (event: React.PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || landedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    requestIdRef.current = '';
    touchedRef.current = true;
    touchRef.current?.();
    setSelected(index);
    setDrag({
      index,
      mode: dragMode,
      rect,
      originX: event.clientX,
      originY: event.clientY,
      frame: frames[index],
    });
  };

  /**
   * THE KEYBOARD'S DRAG (gate wave 3, W3): an arrow moves the focused frame one step, Shift+arrow
   * pulls its right / bottom edge — the same `applyDrag` the pointer uses, so the clamps and the
   * minimum side are one rule. Alt makes the step fine.
   */
  const nudge = (index: number, key: string, resize: boolean, fine: boolean) => {
    const step = fine ? 0.002 : 0.01;
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    setSelected(index);
    editFrames((prev) =>
      prev.map((f, j) =>
        j !== index
          ? f
          : resize
            ? applyDrag(applyDrag(f, 'r', dx, 0), 'b', 0, dy)
            : applyDrag(f, 'move', dx, dy),
      ),
    );
  };

  const viewless = frames.filter((f) => !f.viewKey).length;
  const pending = splitPicture.isPending;
  /**
   * EVERY frame must name its view, and a view-less frame BLOCKS the cut rather than being dropped
   * from it. Silently sending only the marked frames was the earlier behaviour and it is the worse
   * one: the operator draws four frames, presses the button, and gets three pictures with no event
   * anywhere saying which one went missing or why.
   */
  const ready = mode === 'crop' ? frames.length === 1 : frames.length > 0 && viewless === 0;

  const submit = (opts: { silent?: boolean } = {}) => {
    if (!ready || pending || landedRef.current) return;
    touchRef.current?.();
    if (!requestIdRef.current) requestIdRef.current = newClientRequestId();
    splitPicture.mutate(
      {
        pictureId: picture.id ?? 0,
        clientRequestId: requestIdRef.current,
        frames: frames.map(toWireFrame),
        // ⚠ КРОП НИКОГДА НЕ ПИШЕТ РОЛЕЙ. `for_input` — это слово, по которому СЕРВЕР решает,
        // заводить ли `design_reference(role = view_key)` каждому кадру; у кропа вида нет, роль
        // ему написалась бы пустая, а строку входа вызывающий заводит сам, ПЕРЕСТАВЛЯЯ её на
        // место исходной. Флаг вызывающего здесь не спрашивается вовсе — иначе он был бы вторым
        // мнением о том, чем режим кропа является.
        forInput: mode === 'crop' ? false : forInput,
        silent: opts.silent,
      },
      {
        onSuccess: (data) => {
          requestIdRef.current = '';
          setLanded(true);
          onCut?.(data.pictures ?? []);
        },
      },
    );
  };

  return {
    mode,
    frames,
    selected,
    setSelected,
    stageRef,
    src,
    ratio,
    setRatio,
    startDrag,
    nudge,
    initial,
    ready,
    viewless,
    pending,
    landed,
    /** The detector's reading of this sheet, once it is in (`null` before, or with no reading). */
    detection,
    /** The frames on screen are the detector's own, untouched by a person. */
    untouched: () => !touchedRef.current,
    error: splitPicture.isError
      ? (splitPicture.error as Error | null)?.message || 'the server refused without saying why'
      : null,
    submit: () => submit(),
    autoSubmit: () => submit({ silent: true }),
    reset: () => editFrames(() => detection?.frames ?? initial),
    addSide: () => editFrames((prev) => [...prev, { x: 0.4, y: 0.2, w: 0.2, h: 0.6, viewKey: '' }]),
    nameSide: (index: number, viewKey: string) =>
      editFrames((prev) => prev.map((f, j) => (j === index ? { ...f, viewKey } : f))),
    removeSide: (index: number) => {
      editFrames((prev) => prev.filter((_, j) => j !== index));
      setSelected(null);
    },
  };
}

export type SplitCut = ReturnType<typeof useSplitCut>;

/**
 * ТИХИЕ ОРГАНЫ `+ side` / `reset`: текст без рамки, как подпись группы. Окно сводится к одной
 * картинке и одному списку сторон; кнопок-пресетов нет (Q2: стороны заранее разложены по видам,
 * которые объявляет файл), поэтому две оставшиеся правки не должны спорить с картинкой.
 */
export const SPLIT_QUIET =
  'cursor-pointer text-micro uppercase tracking-label text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

/** `+ side` and `reset` — `+ side` only where a second frame means something (not in crop mode). */
export function SplitQuietActions({ cut, children }: { cut: SplitCut; children?: ReactNode }) {
  return (
    <span className='flex items-baseline gap-3'>
      {cut.mode === 'split' && (
        <button type='button' className={SPLIT_QUIET} onClick={cut.addSide}>
          + side
        </button>
      )}
      <button type='button' className={SPLIT_QUIET} onClick={cut.reset}>
        reset
      </button>
      {children}
    </span>
  );
}

/**
 * THE SHEET AND ITS FRAMES. `maxHeight` caps the stage's height (the popup's 380px; the bench's
 * own). `nameInFrame` — the bench's editor has no list of sides under the sheet: each frame's label
 * chip IS its view picker (a native select laid over the chip), and `✕` sits quietly in the frame's
 * other corner. The popup keeps its list (`SplitSides`), so its chips are plain labels.
 */
export function SplitStage({
  cut,
  maxHeight = 380,
  nameInFrame = false,
}: {
  cut: SplitCut;
  maxHeight?: number;
  nameInFrame?: boolean;
}) {
  const { frames, selected, ratio, src, mode } = cut;
  return (
    <div className='flex justify-center bg-bgSecondary p-2'>
      <div
        ref={cut.stageRef}
        data-split-stage=''
        className='relative w-full select-none overflow-hidden bg-bgColor'
        style={{
          aspectRatio: ratio > 0 ? String(ratio) : '3 / 2',
          maxWidth: ratio > 0 ? `${Math.round(maxHeight * ratio)}px` : `${maxHeight * 1.5}px`,
        }}
      >
        {src ? (
          <img
            src={src}
            alt=''
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                cut.setRatio(img.naturalWidth / img.naturalHeight);
              }
            }}
            className='absolute inset-0 block h-full w-full'
            style={{ objectFit: 'fill' }}
          />
        ) : null}

        {frames.map((frame, i) => {
          const named = !!frame.viewKey || mode === 'crop';
          const word = frame.viewKey
            ? viewLabel(frame.viewKey)
            : mode === 'crop'
              ? 'crop'
              : nameInFrame
                ? '— view —'
                : String(i + 1);
          const chipTone = named ? 'bg-textColor text-bgColor' : 'bg-bgColor text-labelColor';
          return (
            <div
              key={i}
              role='group'
              tabIndex={0}
              aria-label={`${word === '— view —' ? 'unnamed' : word} frame`}
              aria-description='arrows move it, shift and arrows resize it'
              data-split-frame={i}
              onPointerDown={cut.startDrag(i, 'move')}
              onFocus={(event) => {
                if (event.target === event.currentTarget) cut.setSelected(i);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (!event.key.startsWith('Arrow')) return;
                event.preventDefault();
                cut.nudge(i, event.key, event.shiftKey, event.altKey);
              }}
              className={cn(
                'group absolute cursor-move border border-textColor',
                'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
                named ? '' : 'border-dashed',
              )}
              style={{
                left: `${frame.x * 100}%`,
                top: `${frame.y * 100}%`,
                width: `${frame.w * 100}%`,
                height: `${frame.h * 100}%`,
                // ЛИНИЯ ОДНА, В 1px, И ПОД НЕЙ БЛЕДНЫЙ ОРЕОЛ: чёрная волосяная линия пропадает на тёмной
                // ткани, белый полупрозрачный пиксель снаружи держит её видимой на любом листе.
                // Выбранная сторона получает такой же пиксель внутри.
                boxShadow:
                  selected === i
                    ? '0 0 0 1px rgba(255,255,255,0.6), inset 0 0 0 1px rgba(255,255,255,0.85)'
                    : '0 0 0 1px rgba(255,255,255,0.6)',
              }}
            >
              {nameInFrame && mode === 'split' ? (
                /* THE CHIP IS THE PICKER: the word stays the chip the owner drew, and a native
                   select lies over it, transparent — one click names the side, no list below. Its
                   pointer-down stops here, so naming a side never starts a drag. */
                <span
                  data-split-chip={i}
                  onPointerDown={(event) => event.stopPropagation()}
                  className={cn(
                    'absolute left-0 top-0 z-10 inline-flex px-1.5 py-0.5 text-micro uppercase tracking-label',
                    'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-textColor',
                    chipTone,
                  )}
                >
                  <span data-split-word=''>{word}</span>
                  <select
                    aria-label={`view of side ${i + 1}`}
                    data-split-view={i}
                    value={frame.viewKey}
                    onChange={(event) => cut.nameSide(i, event.target.value)}
                    className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
                  >
                    {!frame.viewKey && <option value=''>— view —</option>}
                    {DESIGN_VIEW_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {viewLabel(key)}
                      </option>
                    ))}
                  </select>
                </span>
              ) : (
                <span
                  data-split-chip={i}
                  className={cn(
                    'pointer-events-none absolute left-0 top-0 px-1 text-nano uppercase',
                    chipTone,
                  )}
                >
                  {word}
                </span>
              )}
              {nameInFrame && mode === 'split' && (
                <button
                  type='button'
                  aria-label={`remove side ${i + 1}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => cut.removeSide(i)}
                  className={cn(
                    'absolute right-0 top-0 z-10 cursor-pointer bg-bgColor px-1 text-micro text-labelColor hover:text-textColor',
                    TILE_QUIET,
                  )}
                >
                  ✕
                </button>
              )}
              {/* КРАЙ ХВАТАЕТСЯ НЕВИДИМОЙ ПОЛОСОЙ. Видна только линия рамки в 1px; полоса 12px
                  стоит на ней поровну внутрь и наружу, поэтому край берётся так же легко, как
                  прежние сплошные ручки в 4px, но картинку они больше не закрашивают. */}
              {(['l', 'r', 't', 'b'] as const).map((edge) => (
                <span
                  key={edge}
                  aria-hidden
                  onPointerDown={cut.startDrag(i, edge)}
                  className={cn(
                    'absolute',
                    edge === 'l' && '-left-1.5 top-0 h-full w-3 cursor-ew-resize',
                    edge === 'r' && '-right-1.5 top-0 h-full w-3 cursor-ew-resize',
                    edge === 't' && '-top-1.5 left-0 h-3 w-full cursor-ns-resize',
                    edge === 'b' && '-bottom-1.5 left-0 h-3 w-full cursor-ns-resize',
                  )}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The popup's list of sides: a view picker and `✕` per frame, `+ side` / `reset` in the header. */
function SplitSides({ cut }: { cut: SplitCut }) {
  if (cut.mode === 'crop') {
    // В режиме кропа сторона одна и вида у неё нет, поэтому списка нет: остаётся только `reset`,
    // который возвращает рамку в исходное положение.
    return (
      <div className='flex justify-end'>
        <SplitQuietActions cut={cut} />
      </div>
    );
  }
  return (
    <div>
      <GroupLabel flush action={<SplitQuietActions cut={cut} />}>
        sides
      </GroupLabel>
      {cut.frames.map((frame, i) => (
        <Row
          key={i}
          label={`side ${i + 1}`}
          value={
            <span className='flex items-center justify-end gap-2'>
              {/* NO «— view —» ITEM IN THE LIST, AND THAT IS NOT A STYLE CHOICE. Radix refuses
                  a `Select.Item` whose value is the empty string — it THROWS during render, and
                  with no error boundary over this tab the throw takes the whole page with it,
                  not just the modal (measured: the body came back empty). «Nothing chosen» is
                  spelled by the ROOT holding '' and the trigger showing its placeholder, which
                  is the arrangement Radix does support. An unwanted side leaves by its ✕. */}
              <SelectComponent
                name={`split-frame-${i}`}
                value={frame.viewKey}
                placeholder='— view —'
                customWidth={140}
                items={DESIGN_VIEW_KEYS.map((key) => ({
                  value: key,
                  label: viewLabel(key),
                }))}
                onValueChange={(value) => cut.nameSide(i, value)}
              />
              <button
                type='button'
                aria-label={`remove side ${i + 1}`}
                onClick={() => cut.removeSide(i)}
                className='cursor-pointer px-1 text-labelColor hover:text-textColor'
              >
                ✕
              </button>
            </span>
          }
        />
      ))}
    </div>
  );
}

/**
 * THE SERVER'S REFUSAL, WHERE THE ACT WAS. The band's write seam also raises a snackbar, and a
 * snackbar is the wrong and only home for this one: it is gone in four seconds, the editor is still
 * open, and the operator is left pressing a button that keeps doing nothing.
 */
export function SplitError({ cut }: { cut: SplitCut }) {
  if (!cut.error) return null;
  return (
    <CalloutBox tone='error'>
      <b>the cut did not go through.</b> {cut.error}
    </CalloutBox>
  );
}

export function SplitModal({
  techCardId,
  picture,
  handle,
  open,
  onOpenChange,
  mode = 'split',
  note,
  forInput,
  views,
  onSplit,
}: {
  techCardId: number;
  picture: common_DesignPicture;
  /**
   * The views the frames are seeded from, when the caller read them (`readSplit` — the history's and
   * the bench's tiles). Absent — the picture's own `composite_views`, as before.
   */
  views?: readonly string[];
  /** The spoken address of the source — `upload 3 · b`. The caller knows the shelf ordinal. */
  handle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * ═══ ДВА РЕЖИМА ОДНОГО РЕЗА (J-8) ═══════════════════════════════════════════════════════
   *
   * Владелец, дословно: «в INPUT — REFERENCES должна быть возможность кропнуть картинку в
   * тамбнейле».
   *
   * `split` — то, чем это окно было всегда: разметить НЕСКОЛЬКО кадров, каждый обязан назвать
   * свой вид, из одной картинки выходит несколько.
   *
   * `crop` — РОВНО ОДИН кадр, и вид ему не нужен. Это не послабление проверки, а другой предмет:
   * вид кадра существует затем, чтобы сервер знал, в какой слот кладётся кусок и какую роль
   * писать в промпт; у кропа референса слота нет вовсе, и `for_input` едет `false`, поэтому
   * называть вид было бы требованием ради требования. Сервер такой кадр принимает: пустой
   * `view_key` — «a legal frame on the wire» (см. `toWireFrame` ниже), а `SplitPicture` режет из
   * оригинальных байтов независимо от вида.
   *
   * `+ side` в этом режиме не рисуется: он заводит второй кадр, то есть предлагал бы выйти из
   * режима нажатием на его собственную панель.
   */
  mode?: 'split' | 'crop';
  /** Строка, которую вызывающий обязан сказать ДО реза (цена жеста на его стороне: снятые
   *  указания, потерянные привязки). Пусто — вызывающему сказать нечего. */
  note?: ReactNode;
  /**
   * Едут ли кропы В ПРОМПТ. Не косметика и не удобство: по этому слову сервер решает, писать ли
   * им роли `design_reference`. Разрез на верстаке — раскладка видов по слотам, и промпт он
   * пополнять не должен (T-15); разрез из блока входа — должен.
   */
  forInput: boolean;
  /**
   * Кропы удавшегося разреза — вызывающему. Полоса и так перечитается (`invalidate` в шве
   * записи), но вызывающему сплита «во вход» нужны САМИ кропы с их `ghost_view`, чтобы завести
   * строки входа и роли: из перечитанной полосы их не выделить — там не написано, который разрез
   * их родил. Не задан — поведение прежнее: модалка закрылась, полоса перечиталась.
   */
  onSplit?: (pictures: common_DesignPicture[]) => void;
}) {
  const cut = useSplitCut({
    techCardId,
    picture,
    mode,
    forInput,
    views,
    active: open,
    onCut: (pictures) => {
      onOpenChange(false);
      // ПОСЛЕ закрытия, не до: колбэк заводит строки и роли, его снекбар и возможные отказы
      // ролей должны падать на экран, а не под ещё открытую модалку.
      onSplit?.(pictures);
    },
  });
  const { ready, viewless, frames, pending } = cut;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={cut.submit}
      onCancel={() => onOpenChange(false)}
      title={mode === 'crop' ? `crop ${handle || 'this picture'}` : 'split the picture into views'}
      confirmLabel={
        mode === 'crop'
          ? 'crop it'
          : ready
            ? `split into ${frames.length} picture${frames.length === 1 ? '' : 's'}`
            : viewless > 0
              ? 'name every side'
              : 'split'
      }
      confirmDisabled={!ready || pending}
      closeOnConfirm={false}
      width='lg'
    >
      <div className='space-y-stack'>
        {/* ЦЕНА ЖЕСТА, НАЗВАННАЯ ВЫЗЫВАЮЩИМ. Окно режет пиксели и о чужих привязках не знает;
            блок референсов знает — и обязан сказать про снятые указания ДО реза, а не снекбаром
            после. */}
        {note && (
          <CalloutBox tone='warning'>
            <Text size='micro' component='p'>
              {note}
            </Text>
          </CalloutBox>
        )}
        <SplitStage cut={cut} />
        <SplitSides cut={cut} />
        <SplitError cut={cut} />
      </div>
    </ConfirmationModal>
  );
}

/**
 * One drag step, computed from the frame as it was when the pointer went down rather than from the
 * frame as it is now. Accumulating deltas into the live frame drifts: a clamped edge would keep
 * eating movement it did not use and the frame would lag behind the pointer for the rest of the
 * gesture.
 */
function applyDrag(f: SplitFrameDraft, mode: DragMode, dx: number, dy: number): SplitFrameDraft {
  switch (mode) {
    case 'move': {
      return {
        ...f,
        x: clamp01(Math.min(f.x + dx, 1 - f.w)),
        y: clamp01(Math.min(f.y + dy, 1 - f.h)),
      };
    }
    case 'l': {
      const x = clamp01(Math.min(f.x + dx, f.x + f.w - MIN_SIDE));
      return { ...f, x, w: f.x + f.w - x };
    }
    case 'r': {
      const right = clamp01(Math.max(f.x + f.w + dx, f.x + MIN_SIDE));
      return { ...f, w: right - f.x };
    }
    case 't': {
      const y = clamp01(Math.min(f.y + dy, f.y + f.h - MIN_SIDE));
      return { ...f, y, h: f.y + f.h - y };
    }
    case 'b': {
      const bottom = clamp01(Math.max(f.y + f.h + dy, f.y + MIN_SIDE));
      return { ...f, h: bottom - f.y };
    }
    default:
      return f;
  }
}
