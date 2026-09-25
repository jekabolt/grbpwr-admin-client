import { cn } from 'lib/utility';
import { Pill } from 'ui/components/pill';

/**
 * ═══ ОДНА ОБЁРТКА ПОДСВЕТКИ «DRAFTED» НА ВСЮ СТУДИЮ ════════════════════════════════════════════
 *
 * Тон — тот же, что у баннера «an unsaved draft was found» (`CalloutBox tone='warning'`): синяя
 * рамка, лёгкий синий фон, синий текст. Синий в этом админе значит «в полёте, нужен человек»,
 * и черновик модели — ровно это. Не красный: красный значит убыток.
 *
 * Обёртка НЕ меняет примитивы поля: Textarea/Input/Select внутри остаются собой; класс ложится на
 * рамку снаружи, а текст внутри красится через `[&_textarea]`/`[&_input]`, чтобы не трогать их
 * пропсы. Пилюля `drafted` стоит в углу обёртки и не ловит указатель.
 *
 * Одна кнопка «accept all N ▸» живёт в блоке CONSTRUCTION DRAFT; на поле кнопок нет намеренно
 * (правило владельца: не плодить кнопки; правка поля сама снимает подсветку).
 */
export const DRAFTED_CLASS =
  'border border-warning bg-warning/5 [&_textarea]:text-warning [&_input]:text-warning [&_select]:text-warning';

export function DraftedField({
  live,
  children,
  className,
  pill = true,
}: {
  live: boolean;
  children: React.ReactNode;
  className?: string;
  /** Показывать ли угловую пилюлю (в тесных строках её ставит лейбл, а не обёртка). */
  pill?: boolean;
}) {
  return (
    <div className={cn('relative', live && DRAFTED_CLASS, className)} data-drafted={live || undefined}>
      {children}
      {live && pill && (
        <Pill tone='attention' className='pointer-events-none absolute right-1.5 top-1.5 bg-bgColor'>
          drafted
        </Pill>
      )}
    </div>
  );
}
