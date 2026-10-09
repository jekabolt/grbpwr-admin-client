import { useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Toolbar } from 'ui/components/toolbar';
import { LABEL_KEY_MAX } from './labels-schema';
import type { LabelKind } from './tech-card-options';

/**
 * THE ADD DOOR OF A KEYED LIST — the construction-aspects picker (`details-editor.tsx`), shared by
 * LABELS and PACKAGING (02-DESIGN §2.4).
 *
 * At rest it is ONE dashed row, `+ label` / `+ item`, standing where the new card will appear. A
 * click replaces that row IN PLACE with the picker strip: a select of the known kinds not yet on the
 * card, an «or your own» input, `add`, `close`. There are never two add doors on screen at once.
 *
 * A typed name wins over the select (aspects rule). A name already on the card (case-blind, the
 * writers' rule) is not added twice; the picker stays open and says so in the input's title. Enter
 * in the input adds, Escape closes.
 */
export function KindPicker({
  noun,
  kinds,
  taken,
  example,
  onAdd,
  hasRows,
}: {
  /** `label` or `item` — the word on the door. */
  noun: string;
  kinds: LabelKind[];
  /** Keys already on the card. */
  taken: string[];
  /** Placeholder example for the custom name, e.g. `tax stamp`. */
  example: string;
  onAdd: (key: string) => void;
  /** Rows stand above: the door keeps one step (16px) away from the last one. */
  hasRows: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState('');
  const [own, setOwn] = useState('');
  const takenLc = new Set(taken.map((k) => k.trim().toLowerCase()));
  const remaining = kinds.filter((k) => !takenLc.has(k.key.toLowerCase()));
  const typed = own.trim();
  const key = typed || known;
  const duplicate = !!key && takenLc.has(key.toLowerCase());

  const close = () => {
    setOpen(false);
    setKnown('');
    setOwn('');
  };
  const add = () => {
    if (!key || duplicate) return;
    onAdd(key);
    close();
  };

  const gap = hasRows ? 'mt-4 ' : '';

  if (!open) {
    return (
      <button
        type='button'
        onClick={() => setOpen(true)}
        data-kind-add={noun}
        className={`${gap}flex w-full items-center border border-dashed border-borderColor bg-bgColor px-3 py-4 text-micro uppercase tracking-label text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor`}
      >
        + {noun}
      </button>
    );
  }

  return (
    <div data-kind-picker={noun} className={gap || undefined}>
      <Toolbar>
        {remaining.length > 0 && (
          <select
            aria-label={`${noun} kind`}
            value={known}
            onChange={(e) => setKnown(e.target.value)}
            data-kind-select={noun}
            className='min-h-[22px] w-52 appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none'
          >
            <option value=''>— pick a kind —</option>
            {remaining.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        )}
        <Input
          name={`new-${noun}`}
          aria-label={`your own ${noun}`}
          value={own}
          maxLength={LABEL_KEY_MAX}
          autoFocus
          aria-invalid={duplicate || undefined}
          title={duplicate ? `«${key}» is already on this card` : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOwn(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
          placeholder={`or your own, e.g. ${example}`}
          className='w-56'
          data-kind-own={noun}
        />
        <Button
          type='button'
          variant='secondary'
          size='xs'
          onClick={add}
          disabled={!key || duplicate}
          data-kind-confirm={noun}
        >
          add
        </Button>
        <Button type='button' variant='secondary' size='xs' onClick={close}>
          close
        </Button>
      </Toolbar>
    </div>
  );
}
