/**
 * ═══ FACE FRAME — THE PASSPORT FRAME FROM FACE LANDMARKS ═════════════════════════════════════════
 *
 * Pure: no DOM, no imports (the golden check `tmp/plans/model-form/golden/face-frame.mjs` runs this
 * very file under node, on the landmarks `golden/face_landmarks.py` dumps). Input: the MediaPipe
 * FaceLandmarker points of ONE face, normalised to the photo (x / width, y / height), and the photo's
 * size in pixels. The detector itself is `./face-detect.ts`, lazy.
 *
 * THE RULE (SPEC-UNIFORM; reference = Vanya's approved beta photo, media 1340): every model photo is
 * the same 3:4 frame with the eye line at 32.08 % of its height, the chin at 55.86 % and the face
 * centre in the middle — so faces align across the MODELS list whatever the hair does (the mask
 * width of `auto-frame.ts` reads long hair as a 100 %-wide head). Measured on the face:
 *   eye    = mean y of the eye corners 33, 133, 362, 263;   chin = y of 152;
 *   centre = midpoint x of the face-oval sides 234 and 454;
 *   height = (chin − eye) / (0.5586 − 0.3208),  width = height · 3/4;
 *   top    = eye − 0.3208 · height,             left  = centre − width / 2.
 *
 * THE FRAME MAY LEAVE THE PHOTO. Prod sources are tight crops: crown, shoulders or sides are often
 * outside. That part is OUTPAINTED by the caller (an `extend` run, per side) — never edge-filled,
 * never white. An outpaint that invents most of a side invents the person, though, so each side's
 * missing share is capped (MAX_MISSING_SHARE of that side of the frame). Past the cap the frame
 * SHRINKS about the eye line and the face centre: the face gets bigger than the reference (owner OK
 * for the tight selfies, Jeka / German), the eye line stays where every other photo has it.
 *   Closed form, not a loop: a side's missing share is `a − b / size` (a = the frame share between
 *   that edge and the face anchor, b = the photo's room on that side of the anchor), so each side
 *   caps the size at b / (a − cap). The top never binds: its share, 0.3208, is under the cap.
 *
 * AN EDGE THAT MISSES BY A HAIR IS NOT AN OUTPAINT. A frame that fits after ≤ FIT_SLACK shrink and
 * ≤ FIT_SLACK slide is moved inside (eye and chin move ≤ 1 %; the golden tolerance is 1.5 %): no paid
 * run for a rounding sliver.
 *
 * NO FRAME (null → the caller's mask route, `auto-frame.ts`): a face too small to measure, an eye, the
 * chin or the centre outside the photo (the face itself is cut), or a cap that would blow the face up
 * past MIN_SCALE of the reference size.
 */

export type FacePoint = { readonly x: number; readonly y: number };

export type FrameRect = { x: number; y: number; w: number; h: number };

export type FrameSides = { top: number; bottom: number; left: number; right: number };

export type FaceFrame = {
  /** The 3:4 frame in source pixels; it leaves the photo where `missing` says. */
  rect: FrameRect;
  /** The frame in whole source pixels — the canvas an extend has to fill. */
  box: FrameRect;
  /** The photo's part inside the frame, whole pixels (`box` ∩ photo). */
  visible: FrameRect;
  /** Whole source pixels of `box` outside the photo, per side: visible + missing = box. */
  missing: FrameSides;
  /** Frame size against the reference face size: 1, less where the cap shrank it. */
  scale: number;
  /** The measures, source pixels. */
  face: { eye: number; chin: number; cx: number; width: number };
};

/** Eye line, share of the frame height (reference photo). */
export const EYE_SHARE = 0.3208;
/** Chin, share of the frame height (reference photo). */
export const CHIN_SHARE = 0.5586;
/** Face centre, share of the frame width. */
export const CENTRE_SHARE = 0.5;
/** Frame width / height. */
export const FRAME_ASPECT = 3 / 4;
/** The most of one frame side an outpaint may invent. */
export const MAX_MISSING_SHARE = 0.35;
/** Below this share of the reference size the face would fill the frame: no frame. */
export const MIN_SCALE = 0.6;
/** A frame this close to fitting (shrink, then slide, as a share of its side) is fitted inside. */
export const FIT_SLACK = 0.01;
/** Eye-to-chin below this many pixels is too small to measure. */
const MIN_FACE_PX = 32;

const EYE_POINTS = [33, 133, 362, 263] as const;
const CHIN_POINT = 152;
const SIDE_POINTS = [234, 454] as const;
const NEEDED = Math.max(...EYE_POINTS, CHIN_POINT, ...SIDE_POINTS) + 1;

const finite = (...v: number[]) => v.every(Number.isFinite);

/** The measures of the face in source pixels, or null when the points are not a usable face. */
export function faceMeasures(
  landmarks: ArrayLike<FacePoint>,
  w: number,
  h: number,
): FaceFrame['face'] | null {
  if (!(w > 0 && h > 0) || !finite(w, h) || landmarks.length < NEEDED) return null;
  let eye = 0;
  for (const i of EYE_POINTS) eye += landmarks[i].y * h;
  eye /= EYE_POINTS.length;
  const chin = landmarks[CHIN_POINT].y * h;
  const a = landmarks[SIDE_POINTS[0]].x * w;
  const b = landmarks[SIDE_POINTS[1]].x * w;
  const cx = (a + b) / 2;
  if (!finite(eye, chin, cx)) return null;
  return { eye, chin, cx, width: Math.abs(b - a) };
}

/** The reference-size frame (scale 1), before the cap — what `face_batch.py` computes. */
export function referenceFrame(face: FaceFrame['face']): FrameRect {
  const fh = (face.chin - face.eye) / (CHIN_SHARE - EYE_SHARE);
  const fw = fh * FRAME_ASPECT;
  return { x: face.cx - CENTRE_SHARE * fw, y: face.eye - EYE_SHARE * fh, w: fw, h: fh };
}

/** The frame of height `fh`, anchored on the eye line and the face centre. */
function anchored(face: FaceFrame['face'], fh: number): FrameRect {
  const fw = fh * FRAME_ASPECT;
  return { x: face.cx - CENTRE_SHARE * fw, y: face.eye - EYE_SHARE * fh, w: fw, h: fh };
}

/** The largest scale (≤ 1) at which no side misses more than the cap. */
function capScale(face: FaceFrame['face'], ref: FrameRect, w: number, h: number): number {
  const cap = MAX_MISSING_SHARE;
  // [frame share from the anchor to that edge, the photo's room from the anchor to it, the side].
  const sides: [number, number, number][] = [
    [EYE_SHARE, face.eye, ref.h],
    [1 - EYE_SHARE, h - face.eye, ref.h],
    [CENTRE_SHARE, face.cx, ref.w],
    [1 - CENTRE_SHARE, w - face.cx, ref.w],
  ];
  let k = 1;
  for (const [share, room, side] of sides) {
    if (share > cap) k = Math.min(k, room / ((share - cap) * side));
  }
  return k;
}

/** Moved inside the photo when it is within FIT_SLACK of fitting; otherwise unchanged. */
function fitInside(face: FaceFrame['face'], r: FrameRect, w: number, h: number): FrameRect {
  const outside = r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h;
  if (!outside) return r;
  const k = Math.min(1, w / r.w, h / r.h);
  if (k < 1 - FIT_SLACK) return r;
  const s = anchored(face, r.h * k);
  const dx = s.x < 0 ? -s.x : Math.min(0, w - (s.x + s.w));
  const dy = s.y < 0 ? -s.y : Math.min(0, h - (s.y + s.h));
  if (Math.abs(dx) > FIT_SLACK * s.w || Math.abs(dy) > FIT_SLACK * s.h) return r;
  // Clamped exactly onto the photo (float drift must not leave a 1 px «missing» edge).
  const x = Math.min(Math.max(0, s.x + dx), w - s.w);
  const y = Math.min(Math.max(0, s.y + dy), h - s.h);
  return { x, y, w: s.w, h: s.h };
}

export function faceFrame(landmarks: ArrayLike<FacePoint>, w: number, h: number): FaceFrame | null {
  const face = faceMeasures(landmarks, w, h);
  if (!face) return null;
  // The face itself must be in the photo: a cut chin or eye has no honest frame.
  if (!(face.eye > 0 && face.chin < h && face.cx > 0 && face.cx < w)) return null;
  if (face.chin - face.eye < MIN_FACE_PX) return null;

  const ref = referenceFrame(face);
  const k = capScale(face, ref, w, h);
  if (!(k >= MIN_SCALE)) return null;
  const rect = fitInside(face, k < 1 ? anchored(face, ref.h * k) : ref, w, h);
  if (!finite(rect.x, rect.y, rect.w, rect.h) || !(rect.w > 0 && rect.h > 0)) return null;

  const x0 = Math.round(rect.x);
  const y0 = Math.round(rect.y);
  const x1 = Math.round(rect.x + rect.w);
  const y1 = Math.round(rect.y + rect.h);
  const vx0 = Math.max(0, x0);
  const vy0 = Math.max(0, y0);
  const vx1 = Math.min(w, x1);
  const vy1 = Math.min(h, y1);
  if (!(vx1 > vx0 && vy1 > vy0)) return null;
  return {
    rect,
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    visible: { x: vx0, y: vy0, w: vx1 - vx0, h: vy1 - vy0 },
    missing: {
      top: Math.max(0, -y0),
      bottom: Math.max(0, y1 - h),
      left: Math.max(0, -x0),
      right: Math.max(0, x1 - w),
    },
    scale: rect.h / ref.h,
    face,
  };
}

/** Whether any of the frame is outside the photo (an extend has to fill it). */
export function needsExtend(frame: FaceFrame): boolean {
  const m = frame.missing;
  return m.top > 0 || m.bottom > 0 || m.left > 0 || m.right > 0;
}
