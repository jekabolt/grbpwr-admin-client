// ПОЛЯ ПРАВКИ В ПОЛОСЕ ПОД ЛЕНТОЙ (R-11). Кнопки «save» нет нигде: Enter или уход фокуса
// записывают в форму (→ автосейв карточки), Escape возвращает как было и закрывает полосу. Полоса,
// которую закрыли сменой колорвея, размера или стороны, записывает годный недописанный черновик
// тоже — правка не теряется молча.
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import Text from 'ui/components/text';

/** Появление полосы правки: 150 мс прозрачности; при reduced-motion — сразу (global.css). */
export const SWAP = 'composition-line-in';

const FIELD =
  'block w-full rounded-none border border-textColor bg-bgColor px-[7px] py-[3px] uppercase placeholder:text-labelColor focus:outline-none';

/**
 * Черновик значения: синхронизируется с формой, пока его не трогали; `commit` пишет только
 * изменённое; снятие компонента записывает то, что не записано и не отменено.
 */
function useDraft(value: string, onCommit: (text: string) => void) {
  const [draft, setDraft] = useState(value);
  const base = useRef(value);
  const latest = useRef({ draft, onCommit });
  latest.current = { draft, onCommit };
  useEffect(() => {
    if (value !== base.current) {
      base.current = value;
      latest.current.draft = value;
      setDraft(value);
    }
  }, [value]);
  const commit = () => {
    const { draft: d, onCommit: write } = latest.current;
    if (d === base.current) return;
    base.current = d;
    write(d);
  };
  const cancel = () => {
    latest.current.draft = base.current;
    setDraft(base.current);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => commit(), []);
  return { draft, setDraft, commit, cancel };
}

/** Одна строка: Enter — записать и закрыть, уход фокуса — записать, Escape — отменить и закрыть. */
export function DraftInput({
  value,
  placeholder,
  maxLength,
  ariaLabel,
  onCommit,
  onClose,
}: {
  value: string;
  placeholder?: string;
  maxLength?: number;
  ariaLabel: string;
  onCommit: (text: string) => void;
  onClose: () => void;
}) {
  const d = useDraft(value, onCommit);
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={d.draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => d.setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          d.commit();
          onClose();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          d.cancel();
          onClose();
        }
      }}
      onBlur={d.commit}
      className={cn(FIELD, 'min-h-[22px]')}
    />
  );
}

/** Несколько строк (строка поля = строка ленты): уход фокуса — записать, Escape — отменить. */
export function DraftLines({
  lines,
  rows,
  placeholder,
  ariaLabel,
  hint,
  onCommit,
  onClose,
}: {
  lines: readonly string[];
  rows: number;
  placeholder?: string;
  ariaLabel: string;
  hint?: string;
  onCommit: (text: string) => void;
  onClose: () => void;
}) {
  const d = useDraft(lines.join('\n'), onCommit);
  return (
    <div className='flex flex-col gap-1.5'>
      <textarea
        autoFocus
        aria-label={ariaLabel}
        value={d.draft}
        rows={Math.max(rows, d.draft.split('\n').length)}
        placeholder={placeholder}
        onChange={(e) => d.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            d.cancel();
            onClose();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            d.commit();
            onClose();
          }
        }}
        onBlur={d.commit}
        className={cn(FIELD, 'resize-none')}
      />
      {hint ? (
        <Text size='micro' variant='label'>
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
