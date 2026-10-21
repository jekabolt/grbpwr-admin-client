import type { ReactNode } from 'react';
import type { PrintOrient } from 'components/managers/print/scope';

export const TECHPACK_PAGE_PX = {
  land: { width: 1123, height: 794 },
  port: { width: 794, height: 1123 },
} as const;

export type TechpackPageProps = {
  techCard: import('api/proto-http/admin').common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
};

export function TechpackPaper({
  orient,
  docline,
  children,
}: {
  orient: PrintOrient;
  docline: string;
  children: ReactNode;
}) {
  const page = TECHPACK_PAGE_PX[orient];
  return (
    <article
      className='tp-sheet relative flex shrink-0 break-after-page flex-col overflow-hidden border border-borderColor bg-bgColor px-11 pb-14 pt-13 print:border-0'
      data-orient={orient}
      style={{ width: page.width, height: page.height }}
    >
      <div className='tp-docline absolute inset-x-11 top-4 truncate text-center text-nano uppercase tracking-label text-labelColor'>
        {docline}
      </div>
      <div className='tp-body flex min-h-0 flex-1 flex-col'>{children}</div>
      <div
        className='tp-count absolute bottom-4 right-11 text-nano tabular-nums text-labelColor'
        data-page-count=''
      />
    </article>
  );
}
