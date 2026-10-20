import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { FacePoint } from './face-frame';

/**
 * ═══ FACE DETECT — MEDIAPIPE FACE LANDMARKER, LOADED ON THE PRESS ═══════════════════════════════
 *
 * `@mediapipe/tasks-vision` is imported dynamically, so the bundler puts it in its own chunk: the
 * model form does not carry it, the first white-bg press fetches it (then it stays warm for the tab).
 * The runtime fetches two more files at that moment, both PINNED:
 *   - the wasm from jsdelivr at the package's own version — loader and binary must match the JS
 *     (`TASKS_VISION_VERSION` = the exact version in package.json; bump both together);
 *   - the model `.task` from Google's model bucket, `float16/1` — the very file the offline golden
 *     (`tmp/plans/model-form/golden/face_landmarks.py`) runs, so the browser and the golden agree.
 *
 * IMAGE mode, one face, CPU (closest to the golden's python run). Landmarks come back normalised to
 * the picture; `faceFrame` (`./face-frame.ts`) takes them as they are.
 */

const TASKS_VISION_VERSION = '1.0.1';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
/** Bigger pictures are scaled down first: the detector reads 192–256 px anyway. */
const DETECT_MAX_PX = 4_000_000;

let landmarker: Promise<FaceLandmarker> | null = null;

function load(): Promise<FaceLandmarker> {
  if (!landmarker) {
    const loading = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
    })();
    landmarker = loading;
    // A failed load (offline, CDN blip) is not cached: the next press tries again.
    loading.catch(() => {
      if (landmarker === loading) landmarker = null;
    });
  }
  return landmarker;
}

/** The face's landmarks, normalised to the picture, or null when there is no face. */
export async function detectFace(bitmap: ImageBitmap): Promise<FacePoint[] | null> {
  const detector = await load();
  const w = bitmap.width;
  const h = bitmap.height;
  let source: ImageBitmap | HTMLCanvasElement = bitmap;
  if (w * h > DETECT_MAX_PX) {
    const s = Math.sqrt(DETECT_MAX_PX / (w * h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * s));
    canvas.height = Math.max(1, Math.round(h * s));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    source = canvas;
  }
  const face = detector.detect(source).faceLandmarks?.[0];
  return face?.length ? face.map(({ x, y }) => ({ x, y })) : null;
}
