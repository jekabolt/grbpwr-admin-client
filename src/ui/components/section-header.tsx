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
      <Text component='h3' variant='uppercase' tracking='section' className='font-bold'>
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
