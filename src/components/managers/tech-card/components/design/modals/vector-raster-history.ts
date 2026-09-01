import {
  RASTER_UNDO_BYTES,
  RASTER_UNDO_DEPTH,
  gestureBox,
  rasterCtx,
  type RasterLayer,
} from './vector-raster';
import type { VectorStroke } from './vector-strokes';

/**
 * ОДНА ЛЕНТА ОТМЕНЫ НА ДВА МАТЕРИАЛА — ЛИНИИ И ПИКСЕЛИ.
 *
 * ДВЕ СТОПКИ ПОД ОДНОЙ КЛАВИШЕЙ — ЭТО НЕ ДВЕ ОТМЕНЫ, А НЕПРЕДСКАЗУЕМАЯ. Пока у слоя были только
 * штрихи, ⌘Z означал ровно одно. С появлением пикселей соблазн завести вторую стопку велик и
 * ошибочен: человек не помнит, какой из двух материалов он трогал предпоследним, и «отменить»
 * начало бы возвращать то одно, то другое без всякой видимой причины. Поэтому лента ОДНА и
 * упорядочена временем: ⌘Z снимает последнее сделанное, чем бы оно ни было.
 *
 * ── ЧЕМ ПЛАТИТ ШАГ ПО РАСТРУ И ПОЧЕМУ ПОТОЛОК НАЗВАН ВСЛУХ ─────────────────────────────────
 *
 * Шаг по линиям — это копия массива штрихов, десятки килобайт. Шаг по растру — это ПИКСЕЛИ, и
 * полный снимок холста 1600×2000 весит 12.8 МБ; двадцать таких съели бы четверть гигабайта на
 * двадцати мазках. Поэтому запоминается не холст, а ПРЯМОУГОЛЬНИК, КОТОРЫЙ ЖЕСТ ЗАТРОНУЛ, в двух
 * копиях — до и после. Точка кистью радиуса 12 стоит 5 КБ, а не 12 МБ.
 *
 * Прямоугольник считается по НЕПУСТЫМ пикселям буфера жеста, а не по следу руки: мягкий край
 * кисти выходит за след на радиус, и коробка по следу обрезала бы возврат ровно по кромке пятна —
 * дефект, который виден только на второй отмене и выглядит как «отмена оставила ободок».
 *
 * ДВА ПОТОЛКА, ОБА НАЗВАННЫЕ: глубина (`RASTER_UNDO_DEPTH`) и память (`RASTER_UNDO_BYTES`). Первый
 * сработавший вытесняет самый старый шаг. Молчаливая потеря истории хуже честной границы, поэтому
 * `depth` и `bytes` отдаются наружу — рейка печатает их рядом с кнопкой.
 */

/** Шаг по линиям: полный список штрихов ДО жеста. Он дёшев и копируется целиком. */
type LinesStep = { kind: 'lines'; before: VectorStroke[]; after: VectorStroke[] };

/** Шаг по растру: затронутый прямоугольник в двух состояниях. */
type PixelsStep = {
  kind: 'pixels';
  x: number;
  y: number;
  w: number;
  h: number;
  before: ImageData;
  after: ImageData;
  bytes: number;
};

export type TimelineStep = LinesStep | PixelsStep;

/** Что вернула отмена: список штрихов, «пиксели уже на месте», или пустая лента. */
export type UndoResult = { kind: 'lines'; strokes: VectorStroke[] } | { kind: 'pixels' } | null;

export type TimelineState = {
  /** Сколько шагов лежит в отмене и сколько в возврате. */
  depth: number;
  redoDepth: number;
  /** Сколько памяти держат растровые шаги, в байтах. */
  bytes: number;
  /** Хоть один шаг вытеснен потолком — граница перестала быть теоретической. */
  evicted: boolean;
};

const EMPTY: TimelineState = { depth: 0, redoDepth: 0, bytes: 0, evicted: false };

export class EditTimeline {
  private past: TimelineStep[] = [];
  private future: TimelineStep[] = [];
  private evicted = false;

  state(): TimelineState {
    return {
      depth: this.past.length,
      redoDepth: this.future.length,
      bytes: this.bytes(),
      evicted: this.evicted,
    };
  }

  private bytes(): number {
    let n = 0;
    for (const s of [...this.past, ...this.future]) if (s.kind === 'pixels') n += s.bytes;
    return n;
  }

  reset(): void {
    this.past = [];
    this.future = [];
    this.evicted = false;
  }

  /**
   * НОВЫЙ ШАГ УБИВАЕТ ВОЗВРАТ, и это не упущение, а линейная история — та же, что у всякого
   * редактора без ветвления: нарисовать после отмены значит выбрать другую ветку.
   */
  private push(step: TimelineStep): void {
    this.past.push(step);
    this.future = [];
    this.trim();
  }

  private trim(): void {
    while (this.past.length > RASTER_UNDO_DEPTH) {
      this.past.shift();
      this.evicted = true;
    }
    // Память меряется по ОБЕИМ стопкам: возврат держит те же пиксели, и считать только отмену
    // значило бы врать вдвое ровно тогда, когда человек много отменял.
    while (this.bytes() > RASTER_UNDO_BYTES && this.past.length > 1) {
      this.past.shift();
      this.evicted = true;
    }
  }

  /** Запомнить список штрихов ДО правки. Зовётся ПЕРЕД мутацией, как и прежняя история. */
  recordLines(before: readonly VectorStroke[], after: readonly VectorStroke[]): void {
    this.push({ kind: 'lines', before: before.slice(), after: after.slice() });
  }

  /**
   * ЗАПОМНИТЬ РАСТРОВЫЙ ЖЕСТ — И САМОМУ ЖЕ ЕГО ПРИМЕНИТЬ. Порядок «снять до → изменить → снять
   * после» ОБЯЗАТЕЛЕН, и здесь он не соглашение между двумя вызовами, а одна функция: вызывающий,
   * перепутавший порядок, записал бы «до», равное «после», и ⌘Z молча перестал бы возвращать —
   * дефект, который виден только через два действия после того, как он совершён.
   *
   * Коробка берётся у самого жеста (`gestureBox`), а не ищется проходом по холсту: см. довод у
   * `RasterLayer.bounds` — честный поиск стоил бы 3.2 млн итераций и снимка в 12.8 МБ на КАЖДОЕ
   * отпускание кнопки.
   *
   * Возвращает `false`, если жест не тронул ничего: пустой шаг в ленте — это ⌘Z, который «ничего
   * не сделал», а такой отмене человек не верит уже никогда.
   */
  recordGesture(layer: RasterLayer, apply: () => void): boolean {
    const box = gestureBox(layer);
    if (!box) {
      apply();
      return false;
    }
    const ctx = rasterCtx(layer.doc);
    const before = ctx.getImageData(box.x, box.y, box.w, box.h);
    apply();
    const after = ctx.getImageData(box.x, box.y, box.w, box.h);
    const bytes = box.w * box.h * 4 * 2;
    this.push({ kind: 'pixels', ...box, before, after, bytes });
    return true;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Отменить последнее. Пиксели возвращаются ЗДЕСЬ, прямо в холст; линии возвращаются ВЫЗЫВАЮЩЕМУ,
   * потому что живут в состоянии React. Итог назван родом, а не отличается по `null`: «пустая
   * лента» и «шаг был по пикселям» — разные события, и вызывающий, который их путает, перерисовкой
   * экрана заплатит ровно за первое.
   */
  undo(layer: RasterLayer | null): UndoResult {
    const step = this.past.pop();
    if (!step) return null;
    this.future.push(step);
    if (step.kind === 'lines') return { kind: 'lines', strokes: step.before };
    if (layer) rasterCtx(layer.doc).putImageData(step.before, step.x, step.y);
    return { kind: 'pixels' };
  }

  redo(layer: RasterLayer | null): UndoResult {
    const step = this.future.pop();
    if (!step) return null;
    this.past.push(step);
    if (step.kind === 'lines') return { kind: 'lines', strokes: step.after };
    if (layer) rasterCtx(layer.doc).putImageData(step.after, step.x, step.y);
    return { kind: 'pixels' };
  }

  /** Что именно вернёт следующая отмена — рейка называет материал словом, а не глаголом «undo». */
  nextUndoKind(): 'lines' | 'pixels' | null {
    return this.past[this.past.length - 1]?.kind ?? null;
  }
  nextRedoKind(): 'lines' | 'pixels' | null {
    return this.future[this.future.length - 1]?.kind ?? null;
  }
}

export const emptyTimelineState = () => EMPTY;

