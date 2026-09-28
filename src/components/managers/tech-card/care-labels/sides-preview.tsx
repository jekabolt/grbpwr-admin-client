// ПРЕВЬЮ ЧЕТЫРЁХ СТОРОН ЛЕНТЫ — центр экрана (дизайн §4, план §9.3).
//
// Стороны рисует тот же `PaperSvg`, что лист схемы сборки: на экране ровно те примитивы, что уйдут
// в файл. Масштаб реальный (`PX_PER_MM`, 100 мм ленты = 100 мм экрана при 96 dpi) с зумом ×2 для
// глаза. Вид «после переворота» зеркалит ИЗНАНКИ средствами CSS — только показ, файл не меняется:
// так видно, лягут ли припуски лица и изнанки один на другой.
//
// Стороны — настоящая раскладка E6 из плана печати (`print-job.ts` → `planPrint`): те же примитивы,
// что уйдут в PDF и svg/. Текст на ленте — контуры, поэтому под каждой стороной лежит скрытая
// текстовая строка (`data-side-text`): её читают экранный диктор и пробы.
import type { PaperDoc } from '../assembly-print/paper';
import { PaperSvg } from '../assembly-print/paper-svg';

const PX_PER_MM = 96 / 25.4;

export type PreviewSide = {
  /** `A-face`, `A-back`, `B-face`, `B-back`, `B2-face`… — ключ и data-атрибут для проб. */
  key: string;
  /** Подпись над стороной: `A · face`. */
  title: string;
  doc: PaperDoc;
  /** Изнанка — зеркалится в виде «после переворота». */
  back: boolean;
  /** Что написано на стороне (контуры не читаются) — для диктора и проб. */
  text?: string;
};

export type PreviewView = 'ribbon' | 'flipped';

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
            {s.text ? (
              <span className='sr-only' data-side-text=''>
                {s.text}
              </span>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
