// Секция-аккордеон левого рейла модалки раскладки. НЕ `Section` и не бордерный `Accordion`:
// модалка — уже собственная поверхность, и блок внутри блока запрещён (DESIGN.md), поэтому
// шапка секции — ruled-заголовок (10px uppercase bold над 1px-рулём #ccc, вес «sub-group»
// из лестницы рулей), а не второй бокс.
//
// Шапка отвечает за свёрнутую секцию: справа — однострочная сводка-ответ («что кроим» →
// ткань и состав; «как кладём» → ширина/зазор/припуск), а состояние несёт Pill, ОБЯЗАННЫЙ
// быть парным к слову: РАЗНЫЕ состояния — РАЗНЫМИ глифами (✓ чисто, ! блокер,
// • предупреждения) плюс перечисление причин в title. Цвет сам по себе состояние не несёт
// (DESIGN.md: state is never carried by colour alone).
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

export type RailSectionStatus = {
  /** Блокирующие отказы внутри секции — с ними прогон или сохранение не пойдут. */
  blockers: string[];
  /** Предупреждения — видимые, но ничего не запрещающие. */
  warnings: string[];
};

export function ModalRailSection({
  index,
  title,
  summary,
  status,
  open,
  onToggle,
  onPin,
  children,
}: {
  index: number;
  title: string;
  /** Сводка-ответ секции одной строкой; показывается только в свёрнутом виде. */
  summary?: string;
  status: RailSectionStatus;
  open: boolean;
  onToggle: () => void;
  /**
   * Первое взаимодействие с СОДЕРЖИМЫМ секции (фокус или клик внутри). Владелец пинит на нём
   * авто-выбор открытой секции: пока оператор ничего не трогал, открытая секция может следовать
   * за первым блокером, но правка поля не должна кончаться тем, что секция схлопнется под
   * руками, когда блокер исчезнет.
   */
  onPin?: () => void;
  children: React.ReactNode;
}) {
  const { blockers, warnings } = status;
  const tone = blockers.length > 0 ? 'warn' : warnings.length > 0 ? 'attention' : 'ok';
  const reasons =
    tone === 'ok'
      ? 'ни ошибок, ни предупреждений'
      : [
          blockers.length > 0 ? `блокирует: ${blockers.join('; ')}` : '',
          warnings.length > 0 ? `предупреждения: ${warnings.join('; ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <section>
      <button
        type='button'
        aria-expanded={open}
        onClick={onToggle}
        className='flex w-full cursor-pointer items-center gap-2 border-b border-borderColor pb-0.5 text-left'
      >
        <Text
          size='micro'
          variant='label'
          tracking='group'
          component='span'
          className='shrink-0 font-bold uppercase'
        >
          {index} · {title}
        </Text>
        <span className='min-w-0 flex-1'>
          {!open && summary ? (
            <Text size='nano' variant='label' component='p' className='truncate text-right'>
              {summary}
            </Text>
          ) : null}
        </span>
        <Pill tone={tone} title={reasons} className='shrink-0'>
          {tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '•'}
        </Pill>
      </button>
      {open && (
        <div className='space-y-2.5 pt-1.5' onFocusCapture={onPin} onPointerDownCapture={onPin}>
          {children}
        </div>
      )}
    </section>
  );
}
