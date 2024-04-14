import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { FC, useState } from 'react';

interface CopyToClipboardProps {
  text: string;
}

export const CopyToClipboard: FC<CopyToClipboardProps> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500); // Reset copied status after 1.5 seconds
      })
      .catch((err) => console.error('Failed to copy: ', err));
  };

  return (
    <div style={{ display: 'flex' }}>
      <div>{text}</div>
      <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
        <IconButton
          onClick={handleCopy}
          color='primary'
          size='small'
          style={{ padding: 0, paddingLeft: '5px' }}
        >
          {copied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
        </IconButton>
      </Tooltip>
    </div>
  );
};
