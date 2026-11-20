import { CheckCircledIcon, ClipboardCopyIcon } from '../icons';
import * as Tooltip from '@radix-ui/react-tooltip';
import { type FC, type ReactNode, useEffect, useState } from 'react';

import { cn } from 'lib/utility';
import Text from './text';

type CopySource =
  | { text: string; getText?: never }
  | { text?: never; getText: () => string | Promise<string> };

type CopyToClipboardProps = CopySource & {
  cutText?: boolean;
  iconOnly?: boolean;
  icon?: ReactNode;
  label?: string;
  copiedLabel?: string;
  className?: string;
  onCopy?: (text: string) => void;
  onError?: (error: unknown, phase: 'resolve' | 'copy') => void;
};

export const CopyToClipboard: FC<CopyToClipboardProps> = ({
  text,
  getText,
  cutText,
  iconOnly,
  icon,
  label,
  copiedLabel = 'Copied!',
  className,
  onCopy,
  onError,
}) => {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const markCopied = (value: string) => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy?.(value);
  };

  // Safari drops the user gesture after a network await, so the clipboard write must start
  // inside the click: a ClipboardItem with a pending blob, writeText as the fallback.
  const copyLater = async (resolve: () => string | Promise<string>) => {
    setCopying(true);
    let pending: Promise<string>;
    try {
      pending = Promise.resolve(resolve());
    } catch (error) {
      pending = Promise.reject(error);
    }
    let written: Promise<void> | null = null;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const blob = pending.then((t) => new Blob([t], { type: 'text/plain' }));
        blob.catch(() => undefined);
        written = navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      }
    } catch {
      written = null;
    }
    let value: string;
    try {
      value = await pending;
    } catch (error) {
      written?.catch(() => undefined);
      if (onError) onError(error, 'resolve');
      else console.error('Failed to resolve copy text: ', error);
      setCopying(false);
      return;
    }
    try {
      try {
        if (!written) throw new Error('no clipboard item');
        await written;
      } catch {
        await navigator.clipboard.writeText(value);
      }
      markCopied(value);
    } catch (error) {
      if (onError) onError(error, 'copy');
      else console.error('Failed to copy: ', error);
    } finally {
      setCopying(false);
    }
  };

  const handleCopy = async () => {
    setCopying(true);
    let value: string;
    try {
      value = getText ? await getText() : text ?? '';
    } catch (error) {
      if (onError) onError(error, 'resolve');
      else console.error('Failed to resolve copy text: ', error);
      setCopying(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCopy?.(value);
    } catch (error) {
      if (onError) onError(error, 'copy');
      else console.error('Failed to copy: ', error);
    } finally {
      setCopying(false);
    }
  };

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const idleLabel = label ?? 'Copy to clipboard';
  const shownText = text ?? '';

  return (
    <div className={cn('flex items-center', className)}>
      {!iconOnly && (
        <Text>{cutText ? shownText.slice(0, 4) + '...' + shownText.slice(-4) : shownText}</Text>
      )}
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type='button'
              onClick={getText ? () => void copyLater(getText) : handleCopy}
              disabled={copying}
              className={cn(
                'inline-flex p-0 text-textColor hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-textColor/50 disabled:text-borderColor',
                !iconOnly && 'pl-1.5',
              )}
              style={{ visibility: isPrinting ? 'hidden' : 'visible' }}
              aria-label={label ?? (copied ? copiedLabel : idleLabel)}
            >
              {copied ? (
                <CheckCircledIcon className='h-4 w-4' />
              ) : (
                icon ?? <ClipboardCopyIcon className='h-4 w-4' />
              )}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side='top'
              sideOffset={4}
              className='rounded-none border border-borderColor bg-bgColor px-2 py-1 text-textBaseSize text-textColor shadow-[var(--shadow-popover)]'
            >
              {copied ? copiedLabel : idleLabel}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
  );
};
