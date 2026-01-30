import { cn } from 'lib/utility';

interface Props {
  cover: 'screen' | 'container';
  color?: 'dark' | 'light' | 'highlight';
  disablePointerEvents?: boolean;
  onClick?: () => void;
}

export function Overlay({ cover, color = 'dark', disablePointerEvents = true, onClick }: Props) {
  return (
    <div
      className={cn('inset-0 z-20 h-screen', {
        'pointer-events-none': disablePointerEvents,
        'bg-overlay': color === 'dark',
        'bg-white/50': color === 'light',
        'bg-highlightColor mix-blend-screen': color === 'highlight',
        fixed: cover === 'screen',
        'absolute h-full': cover === 'container',
      })}
      onClick={onClick}
      aria-hidden='true'
    />
  );
}
