import { widthModesOf } from './trace-measure';
import {
  CONSTRUCTION_DASH,
  COVER_GAP,
  DEFAULT_INK,
  GAUGE_REF,
  LOCK,
  RAIL_GAP,
  readInk,
  strokeGauge,
  strokeGeometry,
  strokeStep,
  type CubicSeg,
  type VectorStroke,
} from './vector-strokes';

/**
 * ═══ ЭКСПОРТ SVG — НАСТОЯЩИЙ ВЕКТОР, А НЕ СНИМОК ЭКРАНА ═══════════════════════════════════════
 *
 * G-10, дословно: «должен быть просто свг данлоуд экспорт который нам будет выдавать хороший
 * вектор без хуйни… вектор который есть сейчас не удволетворительный». «Хороший» здесь — не вкус:
 * владелец прислал собственный измеренный отчёт (`140-RASTER-TO-VECTOR-REPORT.md`) с QC-гейтом,
 * и этот модуль написан ПОД НЕГО.
 *
 * ── ЧЕМ ПРЕЖНИЙ ВЫХОД (`layerSvg`) НАРУШАЛ ЭТОТ ЖЕ ГЕЙТ ───────────────────────────────────────
 *
 * (а) ВШИВАЛ `<image href=…>` подложки — «FAIL n_image > 0» первой строкой гейта §9: файл, внутри
 *     которого лежит растр, вектором не является, чем бы ни были остальные его пути.
 * (б) КАЖДЫЙ ШОВ ЭКСПОРТИРОВАЛСЯ РАЗВЁРНУТОЙ ФИГУРОЙ СТЕЖКОВ. Строчка на экране рисуется
 *     `stitchPath` — сотнями отдельных `M…`-подпутей, по одному на прокол, — и ровно это уезжало
 *     в файл. Отчёт называет это «сотнями микропутей на месте одной строчки»: такой путь нельзя
 *     ни подвинуть, ни перешить, ни прочитать как строчку. Здесь шов — ОДИН путь с
 *     `stroke-dasharray`, и это единственная форма, в которой ритм остаётся ДАННЫМИ.
 * (в) НИ ГРУПП-СЛОЁВ, НИ `id`, НИ ЛЕСТНИЦЫ ТОЛЩИН — отчёт называет её «самой ценной частью
 *     post-process» и говорит, что этого не делает ни один продукт на рынке.
 * (г) КООРДИНАТЫ БЕЗ КВАНТОВАНИЯ: `d` нёс числа вида 4.199999999999999.
 *
 * ── ЦЕНА, КОТОРУЮ НАДО НАЗВАТЬ ВСЛУХ ─────────────────────────────────────────────────────────
 *
 * ФИГУРА ЗИГЗАГА, ОВЕРЛОКА, ФЛЭТЛОКА И ПОТАЙНОГО В ФАЙЛ НЕ УЕЗЖАЕТ. На экране они рисуются
 * настоящей геометрией (волна, зубцы, петли); в файле каждый становится ОДНИМ путём осевой линии
 * со своей толщиной. Это не потеря по недосмотру, а выбор из двух: либо редактируемая линия, либо
 * картинка стежков. Отчёт выбирает первое прямо («штрихи → одна открытая кривая с stroke-width»),
 * и тот, кому нужна картинка, берёт её флэтом — сплющенная картинка рисуется тем же рендерером,
 * что и экран, и фигуру сохраняет.
 *
 * ЧТО СОХРАНЯЕТСЯ ДАЖЕ У ЭТИХ ВИДОВ: положение, толщина, цвет и — там, где ритм ДЕЙСТВИТЕЛЬНО
 * периодичен вдоль линии (lockstitch, двойная игла, коверлок, построительный пунктир) — сам ритм,
 * через `stroke-dasharray`.
 *
 * ПАРА ДВОЙНОЙ ОТСТРОЧКИ ОСТАЁТСЯ ДВУМЯ ПУТЯМИ. Отчёт: «один path с dasharray двух параллельных
 * строчек не выражает, а объединённый нельзя двигать по отдельности». `double` и `cover` — это
 * ровно пара, и в файл они уходят вложенной `<g>` с двумя путями и суффиксами `id`.
 *
 * ── ЧЕГО ЗДЕСЬ НЕТ, ПО ТРЕБОВАНИЮ ГЕЙТА §9 ───────────────────────────────────────────────────
 * `<image>`, `<clipPath>`, `<mask>`, `<use>`, `<symbol>`, `<style>`, `class=`, квадратичных
 * кривых, `transform` на путях. Всё оформление — presentation-атрибутами, потому что Illustrator
 * при импорте разрешает CSS и выбрасывает его.
 */

/** Квант координат. Отчёт §7: шаг ≤ 0.05 px, то есть три знака при viewBox в пикселях. */
const FP = 3;

/**
 * Округление вниз до кванта. Не `toFixed` по месту: одно место округления на весь файл — это то,
 * чем детерминизм экспорта отличается от «почти одинаковых» файлов на двух нажатиях подряд.
 */
const q = (n: number) => {
  const v = Number(n.toFixed(FP));
  return Object.is(v, -0) ? 0 : v;
};

/**
 * ЛЕСТНИЦА ТОЛЩИН — ИМЕНА РОЛЕЙ ПО РАНГУ, А НЕ ПО СМЫСЛУ, И ЭТО СКАЗАНО ЧЕСТНО.
 *
 * Геометрия не знает, что толстая линия — контур изделия. Она знает только, что ЭТА линия толще
 * прочих; отчёт §7 и даёт лестницу именно так (контур 2 pt, подгибка 1 pt, швы 0.75, строчка 0.5)
 * и привязывает её КДЕ-кластеризацией. Имена ниже — перевод ранга в словарь чертёжника; если
 * чертёж нестандартный, имя соврёт, а ГЕОМЕТРИЯ — нет. Отчёт называет это прямо в списке «что
 * автоматика надёжно не чинит».
 */
const LADDER = ['body-outline', 'garment-panels', 'construction-seams', 'detail-lines'];

/** Группы, которые не выводятся из толщины: они выводятся из того, чем штрих объявлен. */
const ROLE_STITCH = 'topstitching';
const ROLE_CONSTRUCTION = 'fold-and-construction';

/** Виды, у которых ритм ДЕЙСТВИТЕЛЬНО периодичен вдоль линии и выражается пунктиром. */
const RHYTHMIC = new Set(['lock', 'double', 'cover']);
/** Виды, идущие парой параллельных строчек: в файл — двумя путями во вложенной группе. */
const PAIRED: Record<string, number> = { double: RAIL_GAP, cover: COVER_GAP };

export type SvgExportOptions = {
  width: number;
  height: number;
};

type Piece = {
  stroke: VectorStroke;
  /** Осевой путь в координатах файла. */
  d: string;
  /** Толщина нити в пикселях файла — то же число, которым линия нарисована на экране. */
  width: number;
  ink: string;
  dash: string;
  role: string;
  /** Полурасстояние между рельсами пары, px. Ноль — не пара. */
  rail: number;
};

/**
 * ПУНКТИР С КАЛИБРОВКОЙ ROUND-CAP (отчёт §6). При круглом наконечнике нарисованный прогон длиннее
 * заданного на толщину линии — по половине шапки с каждого конца, — поэтому измеренный ритм
 * переводится в атрибут так:
 *   `dash = max(run − w, 0.01)`, `gap = gap + w`.
 * Проверено round-trip'ом отчёта: растр 15.0/4.0 при периоде 19.0 возвращается как 13.0/6.0 —
 * период тот же 19.0. Без поправки строчка в файле шьётся заметно гуще, чем на плите.
 */
function dashOf(stroke: VectorStroke, stepPx: number, widthPx: number): string {
  if (stroke.dashed) {
    const run = CONSTRUCTION_DASH[0] * stepPx;
    const gap = CONSTRUCTION_DASH[1] * stepPx;
    return `${q(Math.max(run - widthPx, 0.01))} ${q(Math.max(gap + widthPx, 0.5))}`;
  }
  if (!RHYTHMIC.has(stroke.brush)) return '';
  const pitch = LOCK.pitch * stepPx;
  const run = pitch * LOCK.duty;
  const gap = pitch - run;
  return `${q(Math.max(run - widthPx, 0.01))} ${q(Math.max(gap + widthPx, 0.5))}`;
}

/**
 * СМЕЩЁННЫЙ ДУБЛЬ ШТРИХА — ВТОРОЙ РЕЛЬС ПАРЫ.
 *
 * Смещаются и якоря, и управляющие точки, поэтому кривая остаётся КУБИЧЕСКОЙ: точный офсет кубика
 * кубиком не выражается вовсе, а приближение по контрольному многоугольнику на расстоянии в
 * единицы пикселей отличается от точного на доли пикселя. Альтернатива — флэттен обеих рельс в
 * ломаную — стоила бы того самого «средняя длина сегмента < 3 px», которое гейт §9 помечает WARN.
 *
 * ⚠ НОРМАЛЬ СЧИТАЕТСЯ В ПИКСЕЛЯХ ФАЙЛА, А НЕ В ДОЛЯХ КАДРА. Кадр не квадратный; перпендикуляр,
 * построенный в долях, на плате 800×1000 наклонён — и «параллельные рельсы» разошлись бы веером.
 */
function railStroke(s: VectorStroke, w: number, h: number, dpx: number): VectorStroke {
  const P = s.pts.map(([x, y]) => [x * w, y * h] as [number, number]);
  const n = P.length;
  const normalAt = (i: number): [number, number] => {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  };
  const segNormal = (i: number): [number, number] => {
    const a = P[i];
    const b = P[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  };
  const pts = P.map(([x, y], i) => {
    const [nx, ny] = normalAt(i);
    return [(x + nx * dpx) / w, (y + ny * dpx) / h] as [number, number];
  });
  const segs = s.segs
    ? s.segs.map((c, i) => {
        if (!c) return null;
        const [nx, ny] = segNormal(i);
        return [
          (c[0] * w + nx * dpx) / w,
          (c[1] * h + ny * dpx) / h,
          (c[2] * w + nx * dpx) / w,
          (c[3] * h + ny * dpx) / h,
        ] as CubicSeg;
      })
    : undefined;
  return { ...s, pts, ...(segs ? { segs } : {}) };
}

/**
 * ОСЕВОЙ ПУТЬ ШТРИХА — ТЕМ ЖЕ РЕНДЕРЕРОМ, ЧТО РИСУЕТ ЭКРАН.
 *
 * `strokeGeometry` с подменённым видом на `plain` и снятым `dashed` возвращает ровно `curvePath`
 * (или `inkPath`) по тем же якорям — то есть ГОЛУЮ ОСЬ без фигуры шва. Второго форматировщика
 * путей здесь нет и быть не должно: он разошёлся бы с экранным первой же правкой, и файл начал бы
 * отличаться от того, что человек видел, — молча.
 */
function axisOf(s: VectorStroke, w: number, h: number): { d: string; width: number } {
  const g = strokeGeometry({ ...s, brush: 'plain', dashed: false }, w, h);
  return { d: g.d, width: g.strokeWidth };
}

/** Числа в `d` уже отформатированы рендерером до двух знаков; здесь — только страховка кванта. */
function quantise(d: string): string {
  return d.replace(/-?\d+(\.\d+)?(e[-+]?\d+)?/gi, (m) => String(q(Number(m))));
}

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * ВЕСЬ СЛОЙ КАК SVG. Возвращает разметку; пустой список даёт `null` — «файла нет» это ответ
 * вызывающего человеку, а не пустой файл, который он потом откроет и не поймёт.
 */
export function layerVectorSvg(strokes: VectorStroke[], opts: SvgExportOptions): string | null {
  const { width: w, height: h } = opts;
  if (!strokes.length || w <= 0 || h <= 0) return null;

  const pieces: Piece[] = [];
  for (const s of strokes) {
    const { d, width } = axisOf(s, w, h);
    if (!d) continue;
    const stepPx = (strokeStep(s) / GAUGE_REF) * w;
    pieces.push({
      stroke: s,
      d: quantise(d),
      width,
      ink: readInk(s.ink) ?? DEFAULT_INK,
      dash: dashOf(s, stepPx, width),
      role: '',
      rail: PAIRED[s.brush] ? (PAIRED[s.brush] * ((strokeGauge(s) / GAUGE_REF) * w)) / 2 : 0,
    });
  }
  if (!pieces.length) return null;

  /**
   * РОЛЬ. Два вопроса задаются ДО толщины, потому что отвечает на них сам документ, а не замер:
   * «это построительная линия?» (бит `dashed`, который выше ритма любой машины) и «это строчка?»
   * (вид шва). Всё остальное разбирается лестницей толщин.
   */
  const plainOnes = pieces.filter((p) => !p.stroke.dashed && p.stroke.brush === 'plain');
  const modes = widthModesOf(plainOnes.map((p) => p.width));
  // Ранг — по убыванию толщины: контур толще всех, драпировка тоньше всех.
  const byThick = [...modes].sort((a, b) => b - a);
  const rankOf = (v: number) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < byThick.length; i++) {
      const d = Math.abs(byThick[i] - v);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  for (const p of pieces) {
    if (p.stroke.dashed) p.role = ROLE_CONSTRUCTION;
    else if (p.stroke.brush !== 'plain') p.role = ROLE_STITCH;
    else {
      const r = rankOf(p.width);
      p.role = r < LADDER.length ? LADDER[r] : `pen-${String(r + 1).padStart(2, '0')}`;
    }
  }

  // Порядок групп фиксирован, а не «как встретилось»: два нажатия подряд обязаны дать один файл.
  const order = [...LADDER, ROLE_STITCH, ROLE_CONSTRUCTION];
  const roles = [...new Set(pieces.map((p) => p.role))].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
  });

  let index = 0;
  const body = roles
    .map((role) => {
      const mine = pieces.filter((p) => p.role === role);
      // Толщина ГРУППЫ — ступень лестницы (медиана её членов); у каждого пути стоит его
      // собственная, измеренная. Расхождения между ними нет: путь просто точнее ступени.
      const widths = mine.map((p) => p.width).sort((a, b) => a - b);
      const rung = widths[widths.length >> 1];
      const inks = new Set(mine.map((p) => p.ink));
      const groupInk = inks.size === 1 ? [...inks][0] : DEFAULT_INK;
      const paths = mine
        .map((p) => {
          index += 1;
          const id = `${role}_${String(index).padStart(2, '0')}`;
          const dash = p.dash ? ` stroke-dasharray="${p.dash}"` : '';
          const attrs = (extra: string) =>
            `fill="none" stroke="${p.ink}" stroke-width="${q(p.width)}"` +
            ` stroke-linecap="round" stroke-linejoin="round"${dash}${extra}`;
          if (!p.rail) return `<path id="${esc(id)}" d="${p.d}" ${attrs('')}/>`;
          // ПАРА — ДВА ПУТИ ВО ВЛОЖЕННОЙ ГРУППЕ. Связь их — группа и суффикс имени, потому что
          // подвинуть одну строчку из двух человек обязан уметь.
          const one = quantise(axisOf(railStroke(p.stroke, w, h, +p.rail), w, h).d);
          const two = quantise(axisOf(railStroke(p.stroke, w, h, -p.rail), w, h).d);
          return (
            `<g id="${esc(id)}">` +
            `<path id="${esc(id)}_pair1" d="${one}" ${attrs('')}/>` +
            `<path id="${esc(id)}_pair2" d="${two}" ${attrs('')}/>` +
            `</g>`
          );
        })
        .join('');
      return (
        `<g id="${esc(role)}" fill="none" stroke="${groupInk}" stroke-width="${q(rung)}"` +
        ` stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
      );
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `${body}</svg>`
  );
}
