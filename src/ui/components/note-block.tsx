import { type ChangeEventHandler, type ComponentProps, useRef } from 'react';

import { cn } from 'lib/utility';

export type NoteBlockProps = Omit<ComponentProps<'textarea'>, 'onChange'> & {
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  /** Top-left door: pick a text file; its text goes to `onUploadText`. */
  uploadLabel?: string;
  onUploadText?: (text: string) => void;
  /** File types the upload door offers. */
  accept?: string;
  /** Top-right door, ink: open the note in full. */
  openLabel?: string;
  onOpen?: () => void;
  /** Classes of the yellow block; `className` goes to the textarea. */
  blockClassName?: string;
};

/**
 * The note of the fill system (Lekalo): a yellow (`note`) block, 128px tall, no frame. The textarea
 * IS the block's body — borderless on the yellow, its placeholder in `noteInk` at the bottom left.
 * Two word-doors in the top corners: upload a text file (`noteInk`) and open in full (ink).
 */
export function NoteBlock({
  uploadLabel,
  onUploadText,
  accept = '.txt,.md,text/plain,text/markdown',
  openLabel,
  onOpen,
  blockClassName,
  className,
  ...textarea
}: NoteBlockProps) {
  const file = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const { ref: outerRef, ...rest } = textarea;
  return (
    <div
      // The empty yellow is the field too: a click anywhere on it lands in the textarea.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, textarea, input')) area.current?.focus();
      }}
      className={cn(
        'flex min-h-32 cursor-text flex-col gap-2 bg-note p-2 text-textBaseSize',
        blockClassName,
      )}
    >
      {(uploadLabel || openLabel) && (
        <div className='flex items-start justify-between gap-3'>
          {uploadLabel && onUploadText ? (
            <>
              <button
                type='button'
                onClick={() => file.current?.click()}
                className='cursor-pointer text-noteInk hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink'
              >
                {uploadLabel}
              </button>
              <input
                ref={file}
                type='file'
                accept={accept}
                hidden
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = '';
                  if (!picked) return;
                  void picked.text().then(onUploadText);
                }}
              />
            </>
          ) : (
            <span />
          )}
          {openLabel && onOpen && (
            <button
              type='button'
              onClick={onOpen}
              className='cursor-pointer text-ink hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink'
            >
              {openLabel}
            </button>
          )}
        </div>
      )}
      <textarea
        {...rest}
        ref={(node) => {
          area.current = node;
          if (typeof outerRef === 'function') outerRef(node);
          else if (outerRef) outerRef.current = node;
        }}
        className={cn(
          'mt-auto min-h-4.5 w-full resize-none appearance-none field-sizing-content rounded-none border-0 bg-transparent p-0 text-ink outline-none placeholder:text-noteInk',
          className,
        )}
      />
    </div>
  );
}
