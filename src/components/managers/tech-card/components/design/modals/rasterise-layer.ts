import { urlToDataUrl } from 'lib/features/getCropped';

import type { RasterLayer } from './vector-raster';
import {
  DEFAULT_INK,
  DEFAULT_RATIO,
  readInk,
  strokeGeometry,
  type VectorStroke,
} from './vector-strokes';

/**
 * THE ONE RASTERISER — «base picture + strokes» into a PNG data URL, and there is deliberately no
 * second one.
 *
 * It was born as a private callback inside `vector-modal.tsx`, whose only exit was minting a NEW
 * picture (`edit ▸ → save as picture`). W-10 gave it a second caller: a FIX run wants each marked
 * plate handed to the model ALREADY MARKED UP, so `fix-markup.tsx` rasterises «plate + layer» at
 * launch and sends the result as extra input media. The function moved OUT rather than being
 * copied, because two places drawing the same strokes with two canvases drift silently — a line
 * weight nudged in one of them and the model would receive marks the editor never showed.
 *
 * THE BASE IS RE-FETCHED THROUGH THE CORS PROXY rather than reused from any `<img>` on screen: a
 * media-server image painted onto a canvas TAINTS it, and `toDataURL` on a tainted canvas throws a
 * SecurityError. That is the same dance the cropper and the zoom viewer already do.
 */

/** The widest raster this produces. Past it a line drawing gains no readable detail. */
export const RASTER_MAX_W = 1600;

/**
 * The width of a raster with NO base picture underneath, and the box the SVG download opens at.
 * One number on purpose: a drawing from nothing should come back the same size it exports at.
 */
export const RASTER_FALLBACK_W = 800;

/**
 * ЛИСТ И КАРТИНКА ПОД НИМ ГОВОРЯТ РАЗНУЮ ФОРМУ. Отдельный род ошибки, а не `Error`: вызывающий
 * обязан уметь отличить это от «прокси не отдал байты» — первое чинится растром, второе повтором.
 */
export class SceneShapeMismatch extends Error {
  constructor(
    readonly naturalRatio: number,
    readonly sheetRatio: number,
  ) {
    super(
      `the sheet says ${sheetRatio.toFixed(3)} but the picture underneath is ${naturalRatio.toFixed(3)} — flattening would squash the drawing instead of growing the sheet`,
    );
    this.name = 'SceneShapeMismatch';
  }
}

export type SceneInput = {
  /** The picture underneath, or '' — a drawing from nothing rasterises onto white alone. */
  baseSrc?: string;
  strokes: readonly VectorStroke[];
  /** The frame's width/height ratio; only consulted when there is no base to measure. */
  ratio?: number;
  /**
   * ПИКСЕЛЬНЫЙ КАНАЛ СЛОЯ, КОГДА ОН ЗАВЕДЁН, — И ТОГДА ПОДЛОЖКА НЕ РИСУЕТСЯ ВОВСЕ.
   *
   * Растр заводится КОПИЕЙ подложки (см. `vector-raster.ts`), то есть уже содержит её пиксели —
   * вместе с дырками, которые в ней прогрыз ластик. Нарисовать подложку ещё раз под ним значило бы
   * заклеить каждую дырку оригиналом: ластик работал бы на экране и переставал работать на
   * картинке, которую сохраняют. Поэтому здесь ветка, а не наложение.
   */
  raster?: RasterLayer | null;
};

/**
 * Base + strokes on one canvas — the composite BEFORE anything is asked of it.
 *
 * Split out of `rasteriseStrokesOverBase` for the eyedropper, and split rather than copied for the
 * reason stated at the top of this file: two canvases drawing the same strokes drift silently, and
 * a picker that sampled its own private redraw could hand back a colour the screen never showed.
 * The picker reads pixels off this canvas; the flatten asks the very same canvas for its PNG.
 */
export async function composeScene({ baseSrc, strokes, ratio, raster }: SceneInput): Promise<{
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}> {
  let image: HTMLImageElement | null = null;
  if (baseSrc && !raster) {
    const dataUrl = await urlToDataUrl(baseSrc);
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    /**
     * ⚠ ФОРМА ЛИСТА, ПРОТИВОРЕЧАЩАЯ ПОДЛОЖКЕ, — ЭТО ОТКАЗ, А НЕ ПОВОД СПЛЮЩИТЬ (круг 15, J-32).
     *
     * Ниже размер холста берётся у НАТУРАЛЬНЫХ размеров картинки, а штрихи кладутся долями
     * НОВОГО кадра. Когда документ говорит форму 1.046, а картинка остаётся 0.8, эти два
     * утверждения несовместимы, и прежний код молча выбирал второе: лист не рос вовсе, а рисунок
     * сплющивался в 1/1.3075. Замерено на стенде: аплоад 800×1000 там, где выросший лист дал бы
     * 1046×1000, граница цвета на 0.499 вместо 0.381.
     *
     * СТОРОЖ СТОИТ У ОРГАНА, А НЕ У ВЫЗЫВАЮЩЕГО — тот же урок, что у `assertKnownStrokeKeys`.
     * После того как кроп стал заводить растр, этот путь недостижим; но недостижимость держится
     * на двух ветках в соседнем файле, а сплющивание было МОЛЧАЛИВЫМ, и молчаливым оно вернулось
     * бы при первой же третьей ветке.
     */
    const nat = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0;
    if (ratio && nat && Math.abs(nat - ratio) > 1e-3) {
      throw new SceneShapeMismatch(nat, ratio);
    }
    image = img;
  }
  const naturalW = raster?.w ?? image?.naturalWidth ?? 0;
  const naturalH = raster?.h ?? image?.naturalHeight ?? 0;
  const w = Math.min(RASTER_MAX_W, naturalW > 0 ? naturalW : RASTER_FALLBACK_W);
  const h = Math.max(
    1,
    Math.round(
      naturalW > 0 && naturalH > 0 ? (w * naturalH) / naturalW : w / (ratio || DEFAULT_RATIO),
    ),
  );

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('this browser refused a drawing canvas');

  // A FLAT IS INK ON PAPER. Flattening onto transparency gives a file that reads as an empty
  // rectangle wherever it is shown on a dark ground, so the ground is painted first — the same
  // white the editor stages the drawing on. ДЫРКА ОТ ЛАСТИКА НА ФЛЭТЕ — БУМАГА, А НЕ ПРОЗРАЧНОСТЬ,
  // и это то же решение, а не его исключение: слой хранит дырку альфой (см. `exportRasterPng`),
  // флэт показывает то, что под ней видно, и под ней бумага.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (raster) ctx.drawImage(raster.doc, 0, 0, w, h);
  else if (image) ctx.drawImage(image, 0, 0, w, h);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const g = strokeGeometry(stroke, w, h);
    if (!g.d) continue;
    const path = new Path2D(g.d);
    // ЦВЕТ — У КАЖДОГО ШТРИХА СВОЙ, а не один чёрный на весь холст. Прежний `strokeStyle` стоял
    // ОДИН РАЗ до цикла: покрашенный слой сплющивался бы в чёрный именно там, где растр и делается
    // — на пути «сохранить как картинку» и на входе прогона FIX.
    ctx.strokeStyle = readInk(stroke.ink) ?? DEFAULT_INK;
    ctx.lineWidth = g.strokeWidth;
    ctx.setLineDash(g.dash ? g.dash.split(' ').map(Number) : []);
    for (const dy of g.offsets) {
      ctx.save();
      ctx.translate(0, dy);
      ctx.stroke(path);
      ctx.restore();
    }
  }
  ctx.setLineDash([]);
  return { canvas, ctx, w, h };
}

/** Paint base + strokes into one canvas and hand back a PNG data URL. */
export async function rasteriseStrokesOverBase(input: SceneInput): Promise<string> {
  const { canvas } = await composeScene(input);
  return canvas.toDataURL('image/png');
}

/**
 * ПИПЕТКА: цвет ПОД ТОЧКОЙ, долями кадра, `#rrggbb`.
 *
 * Берётся из ТОГО ЖЕ композита, что уходит в плоскую картинку, — значит из подложки тоже, а не
 * только из своих штрихов. Это и было требование владельца: пипетка обязана брать цвет с холста,
 * а холст под рукой это в первую очередь фотография или флэт, поверх которых и рисуют.
 *
 * Холст, испачканный чужим origin, `getImageData` не отдаёт вовсе (SecurityError), поэтому база
 * приезжает сюда ТЕМ ЖЕ путём, что у флэттена, — через прокси, data-URL'ом (см. шапку файла).
 * Отказ возвращается как `null`, а не как исключение: пипетка — жест, а не транзакция, и падать
 * посреди рисования ей нечем.
 */
export async function pickSceneInk(
  input: SceneInput,
  at: [number, number],
): Promise<string | null> {
  try {
    const { ctx, w, h } = await composeScene(input);
    const x = Math.min(w - 1, Math.max(0, Math.round(at[0] * w)));
    const y = Math.min(h - 1, Math.max(0, Math.round(at[1] * h)));
    const d = ctx.getImageData(x, y, 1, 1).data;
    // Полностью прозрачный пиксель — не цвет: белая подложка кладётся первой, так что это может
    // случиться только на холсте, которого нет.
    if (d[3] === 0) return null;
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(d[0])}${hex(d[1])}${hex(d[2])}`;
  } catch {
    return null;
  }
}
