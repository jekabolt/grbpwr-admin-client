import type { ReactNode } from 'react';
import { cn } from 'lib/utility';
import { Button } from 'ui';
import type { Tool } from './use-camera';

type DockTool = {
  id: Tool | 'sticky' | 'shape' | 'text' | 'connector' | 'section' | 'marker';
  name: string;
  key: string;
  /** Not built yet: drawn disabled, and the label says which PR brings it. */
  arrives?: string;
  icon: ReactNode;
};

const TOOLS: DockTool[] = [
  { id: 'select', name: 'Select', key: 'V', icon: <path d='M3 2l9 5-4 1.2L6.6 12z' /> },
  {
    id: 'hand',
    name: 'Hand',
    key: 'H',
    icon: (
      <path d='M5 8V3.5a1 1 0 012 0V7m0-4.5a1 1 0 012 0V7m0-3.5a1 1 0 012 0V8m0-2.5a1 1 0 012 0V10a4 4 0 01-4 4H8.5a4 4 0 01-3.3-1.7L3 9a1 1 0 011.6-1.2L5 8.5' />
    ),
  },
  {
    id: 'sticky',
    name: 'Sticky',
    key: 'S',
    arrives: 'PR 02',
    icon: (
      <>
        <path d='M2.5 2.5h11v7l-4 4h-7z' />
        <path d='M9.5 13.5v-4h4' />
      </>
    ),
  },
  {
    id: 'shape',
    name: 'Shape',
    key: 'R',
    arrives: 'PR 02',
    icon: (
      <>
        <rect x='2' y='2' width='8' height='8' />
        <circle cx='10.5' cy='10.5' r='3.5' />
      </>
    ),
  },
  { id: 'text', name: 'Text', key: 'T', arrives: 'PR 02', icon: <path d='M3 3.5h10M8 3.5v10' /> },
  {
    id: 'connector',
    name: 'Connector',
    key: 'X',
    arrives: 'PR 03',
    icon: <path d='M2.5 13.5L13 3M8.5 3H13v4.5' />,
  },
  {
    id: 'section',
    name: 'Section',
    key: '⇧S',
    arrives: 'PR 03',
    icon: (
      <>
        <rect x='2' y='4' width='12' height='9.5' />
        <path d='M2 2.5h5' />
      </>
    ),
  },
  {
    id: 'marker',
    name: 'Marker',
    key: 'M',
    arrives: 'PR 03',
    icon: <path d='M10.5 2.5l3 3-7.5 7.5H3v-3z' />,
  },
];

/** The bottom dock. Select and Hand work; the rest show what is coming and do nothing yet. */
export function ToolDock({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <div
      role='toolbar'
      aria-label='Tools'
      className='absolute bottom-4 left-1/2 flex -translate-x-1/2 border border-borderColor bg-bgColor'
      // The dock is chrome, not canvas: a press here must not start a pan underneath.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TOOLS.map((t, i) => {
        const active = t.id === tool;
        const label = `${t.name} (${t.key})${t.arrives ? `, ${t.arrives}` : ''}`;
        return (
          <span key={t.id} className='flex'>
            {i === 2 && <span aria-hidden className='mx-0.5 my-1.5 w-px bg-hairline' />}
            <Button
              variant={active ? 'simple' : 'simpleReverse'}
              title={label}
              aria-label={label}
              aria-pressed={t.arrives ? undefined : active}
              disabled={!!t.arrives}
              onClick={() => !t.arrives && onTool(t.id as Tool)}
              className={cn(
                'flex h-10 w-10 flex-col items-center justify-center gap-px',
                active
                  ? 'hover:bg-textColor hover:text-bgColor'
                  : 'hover:bg-pageBg disabled:text-borderColor disabled:hover:bg-bgColor',
              )}
            >
              <svg
                aria-hidden
                width='16'
                height='16'
                viewBox='0 0 16 16'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.3'
              >
                {t.icon}
              </svg>
              <span className='text-nano'>{t.key}</span>
            </Button>
          </span>
        );
      })}
    </div>
  );
}
