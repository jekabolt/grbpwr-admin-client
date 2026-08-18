// PDF-лист: view_url прямо в <object> — редирект в navigation-контексте легален, CORS не
// участвует. Мобильные браузеры показывают PDF внутри страницы неровно (iOS — первую страницу,
// часть Android — ничего), поэтому fallback-содержимое ведёт в новую вкладку, а «скачать» и так
// всегда висит на строке листа.
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { isSafePatternUrl, type PvSheet } from './manifest';

export function PdfSheet({ sheet }: { sheet: PvSheet }) {
  const url = (sheet.view_url ?? '').trim();
  // Пустая ссылка и ссылка не той формы — один и тот же тупик для читателя, но разные
  // причины, и вторая означает, что серверу нечего было подставить (см. isSafePatternUrl).
  if (!url || !isSafePatternUrl(url)) {
    return (
      <Text size='micro' variant='label' component='p'>
        the sheet has no file link
      </Text>
    );
  }
  return (
    <object
      data={url}
      type='application/pdf'
      className='h-[70vh] w-full border border-borderColor bg-bgColor'
      aria-label={sheet.name || sheet.filename || 'pattern (PDF)'}
    >
      <div className='flex h-40 w-full flex-col items-center justify-center gap-2 border border-borderColor bg-bgColor px-4'>
        <Text size='micro' variant='label' component='p' className='text-center'>
          the browser doesn't show a PDF inside the page
        </Text>
        <Button asChild variant='secondary' size='lg' className='flex min-h-11 items-center'>
          <a href={url} target='_blank' rel='noopener noreferrer'>
            open in a new tab
          </a>
        </Button>
      </div>
    </object>
  );
}
