// ПРЕВЬЮ ЧЕТЫРЁХ СТОРОН ЛЕНТЫ — центр экрана (дизайн §4, план §9.3).
//
// Стороны рисует тот же `PaperSvg`, что лист схемы сборки: на экране ровно те примитивы, что уйдут
// в файл. Масштаб реальный (`PX_PER_MM`, 100 мм ленты = 100 мм экрана при 96 dpi) с зумом ×2 для
// глаза. Вид «после переворота» зеркалит ИЗНАНКИ средствами CSS — только показ, файл не меняется:
// так видно, лягут ли припуски лица и изнанки один на другой.
//
// Пока раскладки E6 нет, страница подаёт сюда заглушки `placeholderSide` — рамку ленты с пунктиром
// припуска и подписью стороны. Вход не меняется, когда придут настоящие стороны.
import type { PaperDoc, Prim } from '../assembly-print/paper';
import { PaperSvg } from '../assembly-print/paper-svg';

export const LABEL_W = 100;
export const LABEL_H = 30;
/** Припуск шва, мм: пунктир на x = 90 (припуск справа) или x = 10 (слева). */
export const SEAM_MM = 10;
const PX_PER_MM = 96 / 25.4;

export type Seam = 'right' | 'left';

export type PreviewSide = {
  /** `A-face`, `A-back`, `B-face`, `B-back`, `B2-face`… — ключ и data-атрибут для проб. */
  key: string;
  /** Подпись над стороной: `A · face`. */
  title: string;
  doc: PaperDoc;
  /** Изнанка — зеркалится в виде «после переворота». */
  back: boolean;
};

export type PreviewView = 'ribbon' | 'flipped';

/**
 * Заглушка стороны до раскладки E6: рамка 100×30, пунктир припуска, подпись. Экранная — текстовый
 * примитив здесь допустим, в файл заглушки не уходят.
 */
export function placeholderSide(title: string, seam: Seam, lines: string[]): PaperDoc {
  const x0 = seam === 'left' ? SEAM_MM : 0;
  const seamX = seam === 'left' ? SEAM_MM : LABEL_W - SEAM_MM;
  const prims: Prim[] = [
    { k: 'rect', x: 0, y: 0, w: LABEL_W, h: LABEL_H, sw: 0.15 },
    { k: 'rect', x: seamX, y: 0, w: 0, h: LABEL_H, sw: 0.15, dashed: true },
    { k: 'text', x: x0 + 3, y: 5, s: title.toUpperCase(), size: 6, bold: true },
    ...lines.map<Prim>((s, i) => ({ k: 'text', x: x0 + 3, y: 10 + i * 2.6, s, size: 5 })),
  ];
  return {
    w: LABEL_W,
    h: LABEL_H,
    prims,
    // Отчёт листа схемы сборки обязателен у PaperDoc; у стороны ленты свой придёт с E6.
    report: { form: 'route', sheetW: LABEL_W, sheetH: LABEL_H, crossings: 0, overWidth: false },
    fileStem: title.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
  };
}

export function SidesPreview({
  sides,
  view,
  zoom,
}: {
  sides: PreviewSide[];
  view: PreviewView;
  zoom: 1 | 2;
}) {
  return (
    <div className='flex flex-col gap-4 overflow-x-auto' data-care-preview=''>
      {sides.map((s) => {
        const mirrored = view === 'flipped' && s.back;
        return (
          <figure key={s.key} className='m-0 flex flex-col gap-1' data-side={s.key}>
            <figcaption className='text-micro uppercase tracking-label text-labelColor'>
              {s.title}
              {mirrored ? ' · mirrored (after the flip)' : ''}
            </figcaption>
            <div
              style={{
                width: s.doc.w * PX_PER_MM * zoom,
                height: s.doc.h * PX_PER_MM * zoom,
              }}
            >
              <div
                className='origin-top-left'
                style={{
                  width: `${s.doc.w}mm`,
                  transform: `${mirrored ? `translateX(${s.doc.w * PX_PER_MM * zoom}px) scaleX(-1) ` : ''}scale(${zoom})`,
                  transformOrigin: 'top left',
                }}
              >
                <PaperSvg doc={s.doc} />
              </div>
            </div>
          </figure>
        );
      })}
    </div>
  );
}
