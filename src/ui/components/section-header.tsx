import { cn } from 'lib/utility';
import Text from 'ui/components/text';

/**
 * The reference's section grammar: a RULE, not a box.
 *
 *   IDENTIFICATION  — what this style is
 *   ═══════════════════════════════════════
 *   [field] [field]
 *
 * This replaces the local `Section` wrappers (`<section class="border p-4">` +
 * `<Text size="large">`) that every manager grew its own copy of. Box-in-box was the
 * single biggest visual difference from the reference.
 *
 * `question` is the grey trailing clause that says what the section is FOR — use it,
 * it is most of why the reference reads as explained rather than merely labelled.
 */
export function SectionHeader({
  title,
  question,
  action,
  className,
}: {
  title: string;
  question?: React.ReactNode;
  /** Right-aligned control (a button, a count, a filter). */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-2.5 flex flex-wrap items-baseline gap-2 border-b-2 border-textColor pb-1 ${className ?? ''}`}
    >
      {/* `min-w-0` + `break-words` — НЕСУЩАЯ ПАРА, а не уборка, и ровно та же, что уже вшита в
          `Tiles`. У флекс-элемента `min-width: auto`, то есть «не уже своего содержимого», а у
          нерасторжимой строки min-content — весь заголовок целиком: он вылезает из ряда и тянет
          за собой ГОРИЗОНТАЛЬНЫЙ СКРОЛЛ ВСЕЙ СТРАНИЦЫ. Пока сюда приходили короткие константы,
          этого не было видно; с именем из словаря (роль в библиотеке файлов — до 255 знаков, и
          одним словом) замерено 2030px прокрутки при окне 1500. Перенос выбран вместо обрезки
          намеренно: заголовок здесь единственное место, где имя названо, и обрезать его значило
          бы прятать то, ради чего раздел открыли. */}
      <Text
        component='h3'
        variant='uppercase'
        tracking='section'
        className='min-w-0 break-words font-bold'
      >
        {title}
      </Text>
      {question && (
        <Text size='micro' variant='label' component='span'>
          {question}
        </Text>
      )}
      {action && <div className='ml-auto flex items-center gap-1.5'>{action}</div>}
    </div>
  );
}

/**
 * ═══ A HEADER NEVER FRAMES ITS WORDS (owner, item 38) ═══════════════════════════════════════
 *
 * «у блоков никогда не должно быть текста в кнопках или в прямоугольной рамке только обычный
 * текст или текст с подчеркиванием». The aside of a block or group header — a count, a status, a
 * step number — is PLAIN TEXT in the same metric as the underlined doors beside it (`Button`
 * `variant='underline' size='xs'`: micro, uppercase, label tracking), so a note and a door sit on
 * one line without one of them reading as a box. A `Pill` keeps its place in the BODY of a block;
 * in a header it is replaced by this. The pill's tone survives as the text colour.
 */
const NOTE_TONE = {
  mut: 'text-labelColor',
  ink: 'text-textColor',
  warn: 'text-error',
  attention: 'text-warning',
  ok: 'text-success',
} as const;

export type HeaderNoteTone = keyof typeof NOTE_TONE;

/** The plain-text metric every header aside and quiet header control shares. */
export const HEADER_TEXT = 'whitespace-nowrap text-micro uppercase tracking-label';

export function HeaderNote({
  tone = 'mut',
  className,
  children,
  ...rest
}: {
  tone?: HeaderNoteTone;
  className?: string;
  children: React.ReactNode;
  [k: string]: unknown;
}) {
  return (
    <span {...rest} className={cn(HEADER_TEXT, NOTE_TONE[tone], className)}>
      {children}
    </span>
  );
}

/**
 * `3 of 5 steps` / `7 pictures` / `2+ runs` — a header count as plain text. `noun` is the
 * singular; the plural follows the total when there is one (`1 of 6 sides`), else the count.
 */
export function HeaderCount({
  n,
  noun,
  plural,
  total,
  atLeast,
  ...rest
}: {
  n: number;
  noun: string;
  plural?: string;
  total?: number;
  /** The number is a floor (`2+`): not everything counted has been read yet. */
  atLeast?: boolean;
  className?: string;
  title?: string;
  [k: string]: unknown;
}) {
  const word = (total ?? n) === 1 && !atLeast ? noun : plural ?? `${noun}s`;
  const count = `${n}${atLeast ? '+' : ''}`;
  return (
    <HeaderNote {...rest}>
      {total != null ? `${count} of ${total} ${word}` : `${count} ${word}`}
    </HeaderNote>
  );
}
