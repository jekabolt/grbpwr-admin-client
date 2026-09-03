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

/**
 * ОДИН ЖЕСТ, ТРОНУВШИЙ ОБА МАТЕРИАЛА, — ОДИН ШАГ ЛЕНТЫ.
 *
 * «Удалить внутри области» режет линии И выгрызает пиксели. Записанные двумя шагами, они требуют
 * ДВУХ ⌘Z, и первое же нажатие возвращает половину: линии на месте, дырка в фотографии осталась.
 * Человек видит состояние, которого никогда не создавал, и следующее сохранение закрепляет его.
 * Составной шаг — не удобство, а условие того, что отмена отменяет ЖЕСТ, а не его внутренности.
 */
type BothStep = {
  kind: 'both';
  before: VectorStroke[];
  after: VectorStroke[];
  x: number;
  y: number;
  w: number;
  h: number;
  pixelsBefore: ImageData;
  pixelsAfter: ImageData;
  bytes: number;
};

/**
 * ЧЕТВЁРТЫЙ РОД ШАГА — САМ ЛИСТ (круг 15, J-34: «ctrl z после кропа не работает»).
 *
 * ⚠ ЧЕМ ОН ОТЛИЧАЕТСЯ ОТ ВСЕХ ПРЕДЫДУЩИХ И ПОЧЕМУ ЛЕНТУ БОЛЬШЕ НЕ НАДО СНОСИТЬ. Три прежних рода
 * адресуют ПИКСЕЛИ ВНУТРИ ХОЛСТА прямоугольником `{x,y,w,h}`; кроп меняет сам холст, и шаг ниже
 * по стопке, применённый к холсту другого размера, лёг бы не на своё место. Ровно поэтому круг
 * G-4 ленту сносил (`timeline.reset()`), и это было ОСОЗНАННОЕ решение, а не упущение.
 *
 * Снос отменяется не смягчением того довода, а его закрытием: шаг `sheet` держит СТАРЫЙ ОБЪЕКТ
 * `RasterLayer`, а не его копию. `expandRasterLayer` создаёт НОВЫЙ холст и старого не трогает —
 * значит прямоугольники шагов ниже по стопке продолжают адресовать ровно те пиксели, в которых
 * они были записаны, и исполняются только ПОСЛЕ того, как `sheet` вернул им их холст. Порядок
 * ленты и есть доказательство: до `sheet` дойти, не сняв всё, что легло после него, нельзя.
 *
 * ЦЕНА НАЗВАНА И ПОСЧИТАНА. Шаг держит два полноразмерных холста и потому обязан весить в общем
 * счёте: `bytes = (before.w·h + after.w·h)·4`. Лист 1600×2000 — это 12.8 МБ за холст, то есть
 * пять кропов подряд упираются в потолок 64 МБ и начинают вытеснять самые старые шаги. Это
 * честная граница, а не молчаливый рост: `trim()` считает по НАЛИЧИЮ ПОЛЯ `bytes`, а не по
 * перечислению родов, — новый род попал в счёт сам, без правки счётчика.
 */
type SheetStep = {
  kind: 'sheet';
  /** Холст ДО кропа. `null` — рисунок с нуля, где пиксельного канала не было вовсе. */
  beforeLayer: RasterLayer | null;
  afterLayer: RasterLayer | null;
  beforeStrokes: VectorStroke[];
  afterStrokes: VectorStroke[];
  beforeRatio: number;
  afterRatio: number;
  /**
   * БЫЛ ЛИ ЛИСТ ОТЛИЧЕН ОТ ПОДЛОЖКИ ДО ЭТОГО ШАГА И ПОСЛЕ НЕГО.
   *
   * Флаг запирает «save the drawing only»: форма, сохранённая без картинки, при следующем открытии
   * проигрывает натуральным пропорциям подложки, и рисунок приезжает сплющенным. Запомнить его
   * ЗДЕСЬ, а не выводить при отмене из формы холста, — единственный способ не гадать: отменивший
   * свой единственный кроп человек обязан снова получить обычное сохранение, а отменивший второй
   * кроп из двух — не обязан, потому что лист всё ещё не подложка.
   */
  beforeExpanded: boolean;
  afterExpanded: boolean;
  bytes: number;
};

export type TimelineStep = LinesStep | PixelsStep | BothStep | SheetStep;

/** Что вернула отмена: список штрихов, «пиксели уже на месте», оба разом, или пустая лента. */
export type UndoResult =
  | { kind: 'lines'; strokes: VectorStroke[] }
  | { kind: 'pixels' }
  | { kind: 'both'; strokes: VectorStroke[] }
  /**
   * ЛИСТ ЛЕНТА ВЕРНУТЬ САМА НЕ МОЖЕТ. Пиксели она кладёт в холст своими руками, потому что холст
   * ей передали; холст же живёт в `rasterRef` модалки вместе с формой платы и списком штрихов, и
   * подменить их может только тот, кто ими владеет. Поэтому род `sheet` — единственный, который
   * отдаёт наружу ВСЁ состояние листа разом: подменить его половинами значило бы кадр, в котором
   * штрихи уже новые, а холст ещё старый.
   */
  | {
      kind: 'sheet';
      layer: RasterLayer | null;
      strokes: VectorStroke[];
      ratio: number;
      expanded: boolean;
    }
  | null;

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

/**
 * ИЗМЕНИЛИСЬ ЛИ БАЙТЫ НА САМОМ ДЕЛЕ.
 *
 * Наличие коробки жеста означает лишь «рука где-то прошла», а не «документ стал другим». Стирание
 * уже прозрачного места, мазок нулевой непрозрачности, ластик по пустоте — всё это давало коробку
 * и потому считалось правкой: слой помечался грязным, и сохранение грузило на сервер полноразмерный
 * PNG, ничем не отличающийся от прежнего. Хуже того, лента набивалась шагами, чьё ⌘Z ничего не
 * делает, — а такой отмене человек перестаёт верить после первого же раза.
 *
 * Цена честного ответа — один проход по коробке ЖЕСТА (не по холсту): десятки тысяч байт там, где
 * поиск коробки стоил бы миллионы. См. довод у `RasterLayer.bounds`.
 */
function sameBytes(a: ImageData, b: ImageData): boolean {
  const x = a.data;
  const y = b.data;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}

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

  /**
   * СКОЛЬКО ПАМЯТИ ДЕРЖИТ ЛЕНТА.
   *
   * ⚠ ЗДЕСЬ БЫЛ ДЕФЕКТ: считались только шаги рода `pixels`, а составные (`both`) держат ДВА
   * `ImageData` ровно так же и не попадали в счёт вовсе. Потолок в 64 МБ обходился молча: один
   * ластик по фотографии с линиями рождает именно составной шаг, двадцать четыре таких шага на
   * плите 1600×2000 — это около 600 МБ при счётчике, честно показывающем ноль.
   *
   * Поэтому сумма спрашивает НАЛИЧИЕ ПОЛЯ, а не род шага: следующий род, если он появится, попадёт
   * в счёт сам, а перечисление родов пришлось бы дописывать — и его бы забыли, как забыли этот.
   */
  private bytes(): number {
    let n = 0;
    for (const s of [...this.past, ...this.future]) if ('bytes' in s) n += s.bytes;
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
   * Запомнить СМЕНУ ЛИСТА. Зовётся ПОСЛЕ того, как новый холст построен, и получает ОБА объекта.
   *
   * ⚠ `beforeLayer` НЕ КОПИРУЕТСЯ, И ЭТО НЕСУЩЕЕ. Копия стоила бы ещё один полноразмерный холст и,
   * что важнее, РАЗОШЛАСЬ БЫ с прямоугольниками шагов ниже по стопке: те адресуют пиксели ИМЕННО
   * этого объекта, и `putImageData` в копию оставил бы оригинал нетронутым. Владелец объекта
   * после кропа — лента: модалка на него больше не ссылается, пока отмена его не вернёт.
   */
  recordSheet(args: {
    beforeLayer: RasterLayer | null;
    afterLayer: RasterLayer | null;
    beforeStrokes: readonly VectorStroke[];
    afterStrokes: readonly VectorStroke[];
    beforeRatio: number;
    afterRatio: number;
    beforeExpanded: boolean;
    afterExpanded: boolean;
  }): void {
    const px = (l: RasterLayer | null) => (l ? l.w * l.h * 4 : 0);
    this.push({
      kind: 'sheet',
      beforeLayer: args.beforeLayer,
      afterLayer: args.afterLayer,
      beforeStrokes: args.beforeStrokes.slice(),
      afterStrokes: args.afterStrokes.slice(),
      beforeRatio: args.beforeRatio,
      afterRatio: args.afterRatio,
      beforeExpanded: args.beforeExpanded,
      afterExpanded: args.afterExpanded,
      bytes: px(args.beforeLayer) + px(args.afterLayer),
    });
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
    /**
     * ЖЕСТ ПО ОДНИМ ПИКСЕЛЯМ — ЧАСТНЫЙ СЛУЧАЙ ЖЕСТА ПО ДВУМ МАТЕРИАЛАМ, а не отдельный механизм.
     *
     * Здесь стояла ВТОРАЯ КОПИЯ той же арифметики: снять «до», применить, снять «после», сравнить
     * байты, положить шаг. Копия и повела себя как копия — мутационный прогон показал, что у неё
     * НЕТ СТОРОЖА вовсе: проба пустого жеста ходит через `recordCombined` (им пользуются все
     * пиксельные инструменты), а этой веткой остался один «смягчить внутри». Сломать её можно было
     * молча, и ни одна из ста трёх проб не покраснела бы.
     *
     * Два места, считающие одно и то же, разошлись бы и по существу: любое правило про «что
     * считается изменением» пришлось бы чинить дважды, и второй раз бы забыли.
     */
    return this.recordCombined(layer, [], [], false, apply).pixels;
  }

  /**
   * ЗАПИСАТЬ ЖЕСТ, ТРОНУВШИЙ ОБА МАТЕРИАЛА, ОДНИМ ШАГОМ.
   *
   * Пиксели меняет `apply`, линии вызывающий уже посчитал сам (они живут в состоянии React, и
   * трогать его отсюда лента не вправе). Итог называет, что именно изменилось, — вызывающему это
   * нужно, чтобы не врать человеку в сообщении и не грузить на сервер неизменившийся растр.
   *
   * Когда изменился ровно один материал, кладётся ОБЫЧНЫЙ шаг того рода: составной шаг с пустой
   * половиной был бы ⌘Z, который делает вид, что вернул больше, чем вернул.
   */
  recordCombined(
    layer: RasterLayer | null,
    linesBefore: readonly VectorStroke[],
    linesAfter: readonly VectorStroke[],
    /* ПРИЗНАК ПРИХОДИТ СНАРУЖИ, а не выводится сравнением ссылок: резчик линий возвращает НОВЫЙ
       массив и когда ничего не вырезал, поэтому `before !== after` означало бы «изменилось» на
       каждом промахе. Кто резал — тот и знает, срезал ли он что-нибудь. */
    linesChanged: boolean,
    apply: (() => void) | null,
  ): { lines: boolean; pixels: boolean } {
    const box = layer && apply ? gestureBox(layer) : null;
    if (!layer || !apply || !box) {
      if (apply) apply();
      if (linesChanged) this.recordLines(linesBefore, linesAfter);
      return { lines: linesChanged, pixels: false };
    }
    const ctx = rasterCtx(layer.doc);
    const before = ctx.getImageData(box.x, box.y, box.w, box.h);
    apply();
    const after = ctx.getImageData(box.x, box.y, box.w, box.h);
    const pixelsChanged = !sameBytes(before, after);
    if (pixelsChanged && linesChanged) {
      this.push({
        kind: 'both',
        before: linesBefore.slice(),
        after: linesAfter.slice(),
        ...box,
        pixelsBefore: before,
        pixelsAfter: after,
        bytes: box.w * box.h * 4 * 2,
      });
    } else if (pixelsChanged) {
      this.push({ kind: 'pixels', ...box, before, after, bytes: box.w * box.h * 4 * 2 });
    } else if (linesChanged) {
      this.recordLines(linesBefore, linesAfter);
    }
    return { lines: linesChanged, pixels: pixelsChanged };
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
    if (step.kind === 'sheet') {
      return {
        kind: 'sheet',
        layer: step.beforeLayer,
        strokes: step.beforeStrokes,
        ratio: step.beforeRatio,
        expanded: step.beforeExpanded,
      };
    }
    if (step.kind === 'both') {
      if (layer) rasterCtx(layer.doc).putImageData(step.pixelsBefore, step.x, step.y);
      return { kind: 'both', strokes: step.before };
    }
    if (layer) rasterCtx(layer.doc).putImageData(step.before, step.x, step.y);
    return { kind: 'pixels' };
  }

  redo(layer: RasterLayer | null): UndoResult {
    const step = this.future.pop();
    if (!step) return null;
    this.past.push(step);
    if (step.kind === 'lines') return { kind: 'lines', strokes: step.after };
    if (step.kind === 'sheet') {
      return {
        kind: 'sheet',
        layer: step.afterLayer,
        strokes: step.afterStrokes,
        ratio: step.afterRatio,
        expanded: step.afterExpanded,
      };
    }
    if (step.kind === 'both') {
      if (layer) rasterCtx(layer.doc).putImageData(step.pixelsAfter, step.x, step.y);
      return { kind: 'both', strokes: step.after };
    }
    if (layer) rasterCtx(layer.doc).putImageData(step.after, step.x, step.y);
    return { kind: 'pixels' };
  }

  /** Что именно вернёт следующая отмена — рейка называет материал словом, а не глаголом «undo». */
  nextUndoKind(): 'lines' | 'pixels' | 'both' | 'sheet' | null {
    return this.past[this.past.length - 1]?.kind ?? null;
  }
  nextRedoKind(): 'lines' | 'pixels' | 'both' | 'sheet' | null {
    return this.future[this.future.length - 1]?.kind ?? null;
  }
}

export const emptyTimelineState = () => EMPTY;

