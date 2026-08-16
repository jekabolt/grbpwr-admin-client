import { cn } from 'lib/utility';

/**
 * Пропорция, нарисованная самой пропорцией: пустой прямоугольник тех же отношений сторон,
 * в 1px обводке текущего цвета.
 *
 * До этого форму кадра сообщала ЗАЛИВКА подписи под плиткой — `bg-red-600` у 16:9,
 * `bg-orange-500` у 4:3, `bg-yellow-400` у 1:1 и так далее по радуге. Это была единственная
 * раскраска-категория в приложении, стояла она на каждом снимке медиатеки, и цвет там не нёс
 * ни одного состояния: DESIGN.md отдаёт красный, синий и зелёный под «сломано», «в работе» и
 * «готово», и ни подо что больше. Глиф решает ту же задачу монохромом и вдобавок читается
 * без легенды: узкий вертикальный прямоугольник — это портрет, длинный горизонтальный —
 * панорама, и знать, что «9:16» значит первое, для этого не нужно.
 *
 * Размер задаётся ДЛИННОЙ стороной, поэтому в столбце разных пропорций глифы стоят в общей
 * габаритной сетке, а не скачут.
 */
export function RatioGlyph({
  ratio,
  width,
  height,
  size = 12,
  className,
}: {
  /** Строка вида «4:5». Если её нет, считается из width/height. */
  ratio?: string;
  width?: number;
  height?: number;
  /** Длинная сторона глифа в пикселях. */
  size?: number;
  className?: string;
}) {
  let w = width;
  let h = height;
  if ((!w || !h) && ratio) {
    const [a, b] = ratio.split(':').map(Number);
    if (a > 0 && b > 0) {
      w = a;
      h = b;
    }
  }
  if (!w || !h) return null;

  const long = Math.max(w, h);
  const box = { width: Math.max(3, Math.round((w / long) * size)), height: Math.max(3, Math.round((h / long) * size)) };

  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 border border-current align-[-1px]', className)}
      style={box}
    />
  );
}
