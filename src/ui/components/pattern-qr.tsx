import { QRCodeSVG } from 'qrcode.react';

// A print-friendly QR code (crisp SVG, no async/canvas timing) pointing at a URL — used in
// the tech-pack to link each size's PDF выкройка so the factory can scan straight to it.
export function PatternQR({ value, size = 72 }: { value: string; size?: number }) {
  if (!value?.trim()) return null;
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level='M'
      marginSize={2}
      bgColor='#ffffff'
      fgColor='#000000'
    />
  );
}
