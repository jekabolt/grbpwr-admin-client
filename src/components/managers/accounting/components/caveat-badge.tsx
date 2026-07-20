import { cn } from 'lib/utility';
import Tooltip from 'ui/components/tooltip';

type Props = {
  text?: string;
  className?: string;
};

// Small "!" marker for AcctJournalEntry.hasCaveat (journal list "flags" column) and P&L/BS
// caveats — the full text sits behind a tooltip instead of bloating the row (§8.7: tooltip only
// where the term is genuinely non-obvious; 00-overview.md: "caveats видимы"). Renders nothing
// without text so callers can use it unconditionally, e.g.
// <CaveatBadge text={entry.hasCaveat ? entry.caveat : undefined} />.
export function CaveatBadge({ text, className }: Props) {
  if (!text) return null;
  return (
    <Tooltip
      trigger={
        <button
          type='button'
          aria-label={`caveat: ${text}`}
          className={cn(
            'inline-flex size-4 shrink-0 cursor-help items-center justify-center border border-error text-[10px] font-bold leading-none text-error',
            className,
          )}
        >
          !
        </button>
      }
    >
      <span className='block max-w-64 text-textBaseSize'>{text}</span>
    </Tooltip>
  );
}
