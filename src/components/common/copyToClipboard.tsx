import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { FC, useEffect, useState } from 'react';

interface CopyToClipboardProps {
  text: string;
  displayText?: string;
}

export const CopyToClipboard: FC<CopyToClipboardProps> = ({ text, displayText }) => {
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500); // Reset copied status after 1.5 seconds
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
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div>{displayText || text}</div>
      <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
        <IconButton
          onClick={handleCopy}
          color='primary'
          size='small'
          style={{ padding: 0, paddingLeft: '5px', visibility: isPrinting ? 'hidden' : 'visible' }}
        >
          {copied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
        </IconButton>
      </Tooltip>
    </div>
  );
};
