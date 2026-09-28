// ТЕКСТ В КРИВЫЕ для составников. Лента печатается термотрансфером из PDF/SVG, где шрифтов нет:
// каждый знак — контур глифа (`path` в мм листа). Так печать не зависит от того, что стоит у
// типографии, и CJK не превращается в «тофу».
//
// Три шрифта, грузятся лениво и один раз:
// - FeatureMono-Regular — всё не-CJK (10 латинских языков, цифры, `%`, пробел). Моноширинный:
//   0,6 em на знак, поэтому `55% ` в китайской строке остаётся моноширинным, как на макете;
// - NotoSansSC-care / NotoSansJP-care — CJK-знаки строк `cn` / `jp`. Два сабсета, а не один:
//   общие иероглифы (麻, 絹 …) имеют региональные формы, и шрифт выбирается ЯЗЫКОМ СТРОКИ.
//   Сабсеты режет scripts/care-labels/build-cjk-subset.sh, в каждом только знаки своего языка.
//
// Нет глифа (charToGlyphIndex === 0) — MissingGlyphError с адресом {ch, font, text}; раскладка
// превращает его в блок экрана. Никогда не рисуем .notdef.
import latinUrl from '@/fonts/FeatureMono-Regular.ttf?url';
import jpUrl from '@/fonts/NotoSansJP-care.otf?url';
import scUrl from '@/fonts/NotoSansSC-care.otf?url';
import type { Font } from 'opentype.js';
import type { PathCmd } from 'components/managers/tech-card/assembly-print/paper';
import type { LabelLang } from './phrases';

export type CareFont = 'FeatureMono-Regular' | 'NotoSansSC-care' | 'NotoSansJP-care';

export type ShapedRun = { widthMm: number; glyphs: PathCmd[] };

export type Shaper = {
  /**
   * Контуры строки: перо стартует в (x, y), y — базовая линия; всё в мм листа, ось y вниз.
   * `lang` — язык строки ленты (`en` … `pl`, `cn`, `jp`): только `cn`/`jp` дают CJK-шрифт.
   */
  run(text: string, lang: LabelLang, sizePt: number, x?: number, y?: number): ShapedRun;
  /** Ширина строки, мм (сумма advanceWidth). Проверяет глифы так же, как `run`. */
  width(text: string, lang: LabelLang, sizePt: number): number;
};

export class MissingGlyphError extends Error {
  readonly ch: string;
  readonly font: CareFont;
  readonly text: string;
  /** Позиция знака в строке (в кодовых точках). */
  readonly index: number;
  constructor(ch: string, font: CareFont, text: string, index: number) {
    const cp = (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
    super(`no glyph for "${ch}" (U+${cp}) in ${font} at ${index} of "${text}"`);
    this.name = 'MissingGlyphError';
    this.ch = ch;
    this.font = font;
    this.text = text;
    this.index = index;
  }
}

/** CJK-диапазоны — те же, что у build-cjk-subset.sh: знаки отсюда идут в CJK-шрифт языка строки. */
export function isCjk(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x3000 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef)
  );
}

export const PT_MM = 25.4 / 72;

/** Контур глифа в единицах шрифта, y вверх; квадратичные сегменты TrueType уже подняты в кубы. */
type GlyphShape = { adv: number; cmds: PathCmd[] };

type LoadedFont = { name: CareFont; font: Font; upm: number; cache: Map<string, GlyphShape> };

function shapeOf(f: LoadedFont, ch: string, text: string, index: number): GlyphShape {
  const hit = f.cache.get(ch);
  if (hit) return hit;
  const gi = f.font.charToGlyphIndex(ch);
  if (!gi) throw new MissingGlyphError(ch, f.name, text, index);
  const glyph = f.font.glyphs.get(gi);
  const cmds: PathCmd[] = [];
  let cx = 0;
  let cy = 0;
  for (const c of glyph.path.commands) {
    switch (c.type) {
      case 'M':
        cmds.push(['M', c.x, c.y]);
        cx = c.x;
        cy = c.y;
        break;
      case 'L':
        cmds.push(['L', c.x, c.y]);
        cx = c.x;
        cy = c.y;
        break;
      case 'C':
        cmds.push(['C', c.x1, c.y1, c.x2, c.y2, c.x, c.y]);
        cx = c.x;
        cy = c.y;
        break;
      case 'Q':
        // Квадратичная Безье точно равна кубической с точками P0 + ⅔(Q − P0) и P + ⅔(Q − P).
        cmds.push([
          'C',
          cx + (2 / 3) * (c.x1 - cx),
          cy + (2 / 3) * (c.y1 - cy),
          c.x + (2 / 3) * (c.x1 - c.x),
          c.y + (2 / 3) * (c.y1 - c.y),
          c.x,
          c.y,
        ]);
        cx = c.x;
        cy = c.y;
        break;
      case 'Z':
        cmds.push(['Z']);
        break;
    }
  }
  const shape = { adv: glyph.advanceWidth ?? 0, cmds };
  f.cache.set(ch, shape);
  return shape;
}

/** 1 мкм: точнее принтер не различит, а короткие числа — это размер SVG/PDF. */
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export type FontBytes = { latin: ArrayBuffer; sc: ArrayBuffer; jp: ArrayBuffer };

/** Шейпер из байтов шрифтов (стенд проб кормит его с диска). */
export async function shaperFromBytes(bytes: FontBytes): Promise<Shaper> {
  const { parse } = await import('opentype.js');
  const load = (name: CareFont, buf: ArrayBuffer): LoadedFont => {
    const font = parse(buf);
    return { name, font, upm: font.unitsPerEm, cache: new Map() };
  };
  const latin = load('FeatureMono-Regular', bytes.latin);
  const sc = load('NotoSansSC-care', bytes.sc);
  const jp = load('NotoSansJP-care', bytes.jp);

  const fontFor = (ch: string, lang: LabelLang): LoadedFont => {
    if (!isCjk(ch)) return latin;
    if (lang === 'cn') return sc;
    if (lang === 'jp') return jp;
    // CJK в латинской строке — не угадываем регион: FeatureMono его не знает, и это честный блок.
    return latin;
  };

  const walk = (
    text: string,
    lang: LabelLang,
    sizePt: number,
    each?: (s: GlyphShape, f: LoadedFont, penMm: number, k: number) => void,
  ): number => {
    const em = sizePt * PT_MM;
    let pen = 0;
    let i = 0;
    for (const ch of text) {
      const f = fontFor(ch, lang);
      const s = shapeOf(f, ch, text, i);
      const k = em / f.upm;
      each?.(s, f, pen, k);
      pen += s.adv * k;
      i++;
    }
    return pen;
  };

  return {
    width: (text, lang, sizePt) => walk(text, lang, sizePt),
    run(text, lang, sizePt, x = 0, y = 0) {
      const glyphs: PathCmd[] = [];
      const widthMm = walk(text, lang, sizePt, (s, _f, pen, k) => {
        const X = (u: number) => r3(x + pen + u * k);
        const Y = (v: number) => r3(y - v * k); // шрифт — y вверх, лист — y вниз
        for (const c of s.cmds) {
          if (c[0] === 'Z') glyphs.push(['Z']);
          else if (c[0] === 'C')
            glyphs.push(['C', X(c[1]), Y(c[2]), X(c[3]), Y(c[4]), X(c[5]), Y(c[6])]);
          else glyphs.push([c[0], X(c[1]), Y(c[2])]);
        }
      });
      return { widthMm, glyphs };
    },
  };
}

async function bytesOf(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

let shared: Promise<Shaper> | null = null;

/** Шейпер приложения: три шрифта из бандла (Vite отдаёт адреса), грузятся один раз на вкладку. */
export function createShaper(): Promise<Shaper> {
  if (!shared) {
    shared = Promise.all([bytesOf(latinUrl), bytesOf(scUrl), bytesOf(jpUrl)]).then(
      ([latin, sc, jp]) => shaperFromBytes({ latin, sc, jp }),
    );
    // Упавшая загрузка (сеть) не должна залипнуть до перезагрузки вкладки.
    shared.catch(() => {
      shared = null;
    });
  }
  return shared;
}
