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
