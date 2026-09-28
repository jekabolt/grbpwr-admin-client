// МИНИМАЛЬНЫЙ PDF-ПИСАТЕЛЬ СОСТАВНИКОВ (план §6.6, решение §0.1). Устройство — pdf-writer.md.
//
// Почему не jsPDF: копии зашиты в страницы, а сторона состава в кривых — 20–100 КБ. jsPDF пишет
// содержимое в каждую страницу заново (300 копий × 2 стороны = десятки МБ на колорвей). Здесь каждая
// уникальная сторона лежит в файле ОДИН раз — Form XObject, — а страница только ссылается на общий
// поток `q /Sn Do Q` своей стороны: копия стоит ~70 байт (объект страницы + строка xref).
//
// Примитивы — в мм листа с началом сверху; матрица формы `[k 0 0 -k 0 H]` (k = 72/25,4) переводит их
// в точки PDF с осью вверх, поэтому числа идут в поток как есть, толщины и пунктир — тоже в мм.
// Шрифтов в файле нет вообще: примитив `text` лента не использует, и писатель его не принимает.
import { zlibSync } from 'fflate';
import type { PathCmd, Prim } from '../assembly-print/paper';

export type PdfInput = {
  pageWmm: number;
  pageHmm: number;
  /** Уникальные стороны: ключ → примитивы в мм листа. */
  sides: ReadonlyMap<string, readonly Prim[]>;
  /** Страницы по порядку — ключи сторон; одна сторона может стоять на любом числе страниц. */
  pages: readonly string[];
};

const K = 72 / 25.4;

/** Число в потоке: 0,001 мм (глифы шейпера уже округлены до 1 мкм), без экспоненты и «-0». */
function n(v: number, digits = 3): string {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  if (!Number.isFinite(r)) throw new Error(`pdf-writer: not a number (${v})`);
  if (r === 0) return '0';
  return r.toFixed(digits).replace(/\.?0+$/, '');
}

/** Матрица и размеры страницы — 6 знаков: 72/25,4 до 3 знаков дал бы 0,012 мм сдвига на 95 мм. */
const n6 = (v: number) => n(v, 6);

const JOIN = { miter: 0, round: 1 } as const;
const BEZ = 0.5522847498;

function pathOps(d: readonly PathCmd[]): string {
  let s = '';
  for (const c of d) {
    switch (c[0]) {
      case 'M':
        s += `${n(c[1])} ${n(c[2])} m\n`;
        break;
      case 'L':
        s += `${n(c[1])} ${n(c[2])} l\n`;
        break;
      case 'C':
        s += `${n(c[1])} ${n(c[2])} ${n(c[3])} ${n(c[4])} ${n(c[5])} ${n(c[6])} c\n`;
        break;
      case 'Z':
        s += 'h\n';
        break;
    }
  }
  return s;
}

/** Оператор отрисовки: заливка / штрих / оба; evenodd — со звёздочкой. */
const paintOp = (fill: boolean, stroke: boolean, evenOdd = false) =>
  fill && stroke ? (evenOdd ? 'B*' : 'B') : fill ? (evenOdd ? 'f*' : 'f') : stroke ? 'S' : 'n';

/** Поток стороны: примитивы → операторы PDF (единицы — мм листа, ось y вниз). */
export function sideContent(prims: readonly Prim[]): string {
  let s = '0 g 0 G 0 J\n';
  for (const p of prims) {
    switch (p.k) {
      case 'text':
        throw new Error(
          'pdf-writer: text primitives are not supported — the label prints outlines only',
        );
      case 'rect': {
        const stroke = p.sw > 0;
        if (stroke) s += `${n(p.sw)} w 0 j\n`;
        if (p.dashed) s += '[1 1] 0 d\n';
        s += `${n(p.x)} ${n(p.y)} ${n(p.w)} ${n(p.h)} re ${paintOp(!!p.fill, stroke)}\n`;
        if (p.dashed) s += '[] 0 d\n';
        break;
      }
      case 'line':
        s += `${n(p.w)} w ${n(p.x1)} ${n(p.y1)} m ${n(p.x2)} ${n(p.y2)} l S\n`;
        break;
      case 'poly': {
        if (!p.pts.length) break;
        const stroke = p.sw > 0;
        if (stroke) s += `${n(p.sw)} w ${JOIN[p.join ?? 'miter']} j\n`;
        s += p.pts.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join('\n') + '\n';
        s += p.closed ? `h ${paintOp(!!p.fill, stroke)}\n` : 'S\n';
        break;
      }
      case 'circle': {
        const { cx, cy, r } = p;
        const c = r * BEZ;
        const stroke = p.sw > 0;
        if (stroke) s += `${n(p.sw)} w\n`;
        // Как у SVG-читателя: не залитый круг — белый внутри.
        if (!p.fill) s += '1 g\n';
        s +=
          `${n(cx + r)} ${n(cy)} m ` +
          `${n(cx + r)} ${n(cy + c)} ${n(cx + c)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c ` +
          `${n(cx - c)} ${n(cy + r)} ${n(cx - r)} ${n(cy + c)} ${n(cx - r)} ${n(cy)} c ` +
          `${n(cx - r)} ${n(cy - c)} ${n(cx - c)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c ` +
          `${n(cx + c)} ${n(cy - r)} ${n(cx + r)} ${n(cy - c)} ${n(cx + r)} ${n(cy)} c h ` +
          `${paintOp(true, stroke)}\n`;
        if (!p.fill) s += '0 g\n';
        break;
      }
      case 'path': {
        const sw = p.sw ?? 0;
        const stroke = sw > 0;
        if (stroke) s += `${n(sw)} w ${JOIN[p.join ?? 'miter']} j\n`;
        s += pathOps(p.d) + paintOp(!!p.fill, stroke, p.fillRule === 'evenodd') + '\n';
        break;
      }
    }
  }
  return s;
}

// ---------- сборка файла ----------

const enc = new TextEncoder();

/** PDF как байты. Синтаксис — только ASCII: смещения xref считаются по байтам. */
export function writePdf(input: PdfInput): Uint8Array {
  const { pageWmm, pageHmm, sides, pages } = input;
  if (!pages.length) throw new Error('pdf-writer: a file needs at least one page');
  const Wpt = pageWmm * K;
  const Hpt = pageHmm * K;

  const chunks: Uint8Array[] = [];
  let size = 0;
  const offsets: number[] = []; // offsets[i] — объект i + 1
  const put = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(bytes);
    size += bytes.length;
  };
  let next = 1;
  const reserve = () => next++;
  const obj = (id: number, body: string | Uint8Array[]) => {
    offsets[id - 1] = size;
    put(`${id} 0 obj\n`);
    if (typeof body === 'string') put(body);
    else body.forEach(put);
    put('\nendobj\n');
  };
  const stream = (id: number, dict: string, data: Uint8Array) =>
    obj(id, [
      enc.encode(`<< ${dict} /Length ${data.length} >>\nstream\n`),
      data,
      enc.encode('\nendstream'),
    ]);

  // Заголовок + бинарный комментарий (файл — двоичный для почты/FTP).
  put('%PDF-1.4\n');
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const catalogId = reserve();
  const pagesId = reserve();

  // Уникальные стороны, в порядке первого появления на страницах.
  const used = [...new Set(pages)];
  const nameOf = new Map<string, string>();
  const formOf = new Map<string, number>();
  const drawOf = new Map<string, number>();
  used.forEach((key, i) => {
    const prims = sides.get(key);
    if (!prims) throw new Error(`pdf-writer: page refers to an unknown side "${key}"`);
    const name = `S${i + 1}`;
    nameOf.set(key, name);
    const body = sideContent(prims);
    const formId = reserve();
    stream(
      formId,
      `/Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 ${n(pageWmm)} ${n(pageHmm)}]` +
        ` /Matrix [${n6(K)} 0 0 ${n6(-K)} 0 ${n6(Hpt)}] /Resources << >> /Filter /FlateDecode`,
      zlibSync(enc.encode(body), { level: 9 }),
    );
    formOf.set(key, formId);
    // Поток страницы — общий для всех копий стороны.
    const drawId = reserve();
    stream(drawId, '', enc.encode(`q /${name} Do Q`));
    drawOf.set(key, drawId);
  });

  const pageIds: number[] = [];
  for (const key of pages) {
    // Страница — ссылка на общий поток своей стороны; содержимое стороны не повторяется.
    const contents = drawOf.get(key)!;
    const id = reserve();
    obj(id, `<< /Type /Page /Parent ${pagesId} 0 R /Contents ${contents} 0 R >>`);
    pageIds.push(id);
  }

  const xobjects = used.map((k) => `/${nameOf.get(k)} ${formOf.get(k)} 0 R`).join(' ');
  obj(
    pagesId,
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}]` +
      ` /MediaBox [0 0 ${n6(Wpt)} ${n6(Hpt)}] /Resources << /XObject << ${xobjects} >> >> >>`,
  );
  obj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const xrefAt = size;
  let xref = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let i = 0; i < next - 1; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  put(xref);
  put(`trailer\n<< /Size ${next} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
