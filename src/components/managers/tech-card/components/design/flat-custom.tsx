import type { ReactNode } from 'react';
import { Button } from 'ui/components/button';

/**
 * ═══ `custom` РЯДОМ С GENERATE (T18 / T19, слово владельца 03.10) ══════════════════════════════
 *
 * Владелец, дословно: «в INPUT — REFERENCES во флетах one picture & per picture view настройки
 * должны быть рядом с кнопкой generate будет кнопка custom и там мы можем выбрать one picture или
 * per picture и так же FRONT / BACK / SIDE LEFT / SIDE RIGHT» и «теперь по дефолту мы генерируем
 * one image и FRONT BACK SIDE LEFT SIDE RIGHT».
 *
 * Закрыто — одна тихая дверь `custom ▸` и больше ничего: прогон по умолчанию (`flat-input.ts`,
 * `DEFAULT_FLAT_*`) не требует ни одного решения. Открыто — под рядом запуска, своей строкой:
 * раскладка, четыре стороны и чипы деталей (деталь и виды взаимно исключают друг друга, T07, и
 * видеть это надо в одном месте — иначе галка детали молча снимала бы спрятанные виды).
 *
 * ⚠ ЗАКРЫТАЯ ДВЕРЬ НЕ ПРЯЧЕТ НЕСТАНДАРТНЫЙ ВЫБОР МОЛЧА. Закрытие ничего не сбрасывает, и платный
 * прогон с выбором, которого не видно, — ловушка. Поэтому, пока выбор отличается от умолчания,
 * дверь несёт точку (`custom • ▸`): один глиф, без слов.
 *
 * Отдельный файл — ради пробы (`scripts/flat-custom-probe.mjs`): ряд тянет форму, кэш и автосейв,
 * а дверь с панелью рендерится в разметку сама по себе.
 */
export function FlatCustom({
  open,
  onToggle,
  modified,
  summary,
  after,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** Выбор отличается от умолчания (четыре стороны, один лист, без деталей). */
  modified: boolean;
  /** Точный выбор словами (`flatChoiceSummary`) — `title` двери, пока выбор не умолчание (W1). */
  summary?: string;
  /** Что стоит в ряду сразу за дверью (опись `what the model gets ▸`). */
  after?: ReactNode;
  /** Раскладка, стороны, детали — рисуются только открытыми. */
  children: ReactNode;
}): JSX.Element {
  return (
    <>
      <Button
        variant='secondary'
        size='sm'
        aria-expanded={open}
        data-flat-custom={modified ? 'modified' : ''}
        title={
          modified
            ? `custom: ${summary ?? 'not the default run'}`
            : 'default run: four views in one picture'
        }
        onClick={onToggle}
      >
        <span className='text-micro'>
          {modified ? 'custom •' : 'custom'} {open ? '▾' : '▸'}
        </span>
      </Button>
      {after}
      {/* `basis-full` — своя строка внутри переносимого ряда запуска: открытие не сдвигает
          GENERATE и опись вбок. */}
      {open && (
        <div className='flex basis-full flex-wrap items-center gap-2' data-flat-views=''>
          {children}
        </div>
      )}
    </>
  );
}
