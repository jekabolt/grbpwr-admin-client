import { CheckCircledIcon, ClipboardCopyIcon } from '@radix-ui/react-icons';
import * as Tooltip from '@radix-ui/react-tooltip';
import { FC, useEffect, useState } from 'react';

import Text from './text';

interface CopyToClipboardProps {
  text: string;
  cutText?: boolean;
}

export const CopyToClipboard: FC<CopyToClipboardProps> = ({ text, cutText }) => {
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((err) => console.error('Failed to copy: ', err));
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

  return (
    <div className='flex items-center'>
      <Text>{cutText ? text.slice(0, 4) + '...' + text.slice(-4) : text}</Text>
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type='button'
              onClick={handleCopy}
              className='inline-flex p-0 pl-1.5 text-textColor hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-textColor/50'
              style={{ visibility: isPrinting ? 'hidden' : 'visible' }}
              aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              {copied ? (
                <CheckCircledIcon className='h-4 w-4' />
              ) : (
                <ClipboardCopyIcon className='h-4 w-4' />
              )}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side='top'
              sideOffset={4}
              className='rounded border border-textInactiveColor bg-bgColor px-2 py-1 text-sm text-textColor shadow'
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
  );
};
