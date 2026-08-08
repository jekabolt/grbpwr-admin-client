// Листы выбранной группы: строка = тач-мишень, раскрывающая просмотр прямо под собой.
// «Скачать» — отдельный <a href={download_url}> БЕЗ fetch: качается навигацией браузера и
// потому обязан выживать при любом сломанном рендере (парс DXF, PDF-плагин, что угодно).
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { formatBytes } from 'utils/pattern';
import { DxfSheet } from './dxf-sheet';
import { PdfSheet } from './pdf-sheet';
import { isSafePatternUrl, type PvSheet } from './manifest';

// Тип листа решает манифест (ext от серверного сниффа байтов); имя файла — запасной сигнал на
// случай пустого поля, той же логикой по хвосту пути, что и isDxfUrl в utils/pattern.
function sheetKind(sheet: PvSheet): 'dxf' | 'pdf' | 'unknown' {
  const ext = (sheet.ext ?? '').trim().toLowerCase();
  if (ext === 'dxf') return 'dxf';
  if (ext === 'pdf') return 'pdf';
  const name = (sheet.filename ?? '').toLowerCase();
  if (name.endsWith('.dxf')) return 'dxf';
  if (name.endsWith('.pdf')) return 'pdf';
  return 'unknown';
}

// Подпись размера строки. Пустой size_name (size_id 0) означает ровно одно: лист не подшит ни
// под какой размер. ЧТО ЭТО ЗНАЧИТ ПО СУЩЕСТВУ — решает формат, и путать эти два случая нельзя:
// у DXF размеры лежат в именах блоков и переключаются прямо в просмотре («градуированный»), а у
// PDF внутри переключать нечего, там это просто «без размера». Сказать про PDF «градуированный»
// значило бы пообещать переключатель, которого не будет.
function sizeLabel(sheet: PvSheet, kind: 'dxf' | 'pdf' | 'unknown'): string {
  const named = (sheet.size_name ?? '').trim();
  if (named) return named;
  return kind === 'dxf' ? 'градуированный' : 'без размера';
}

function SheetBody({
  sheet,
  kind,
  dictTokens,
}: {
  sheet: PvSheet;
  kind: 'dxf' | 'pdf' | 'unknown';
  dictTokens: { has(token: string): boolean };
}) {
  if (kind === 'dxf') return <DxfSheet sheet={sheet} dictTokens={dictTokens} />;
  if (kind === 'pdf') return <PdfSheet sheet={sheet} />;
  return (
    <Text size='micro' variant='label' component='p'>
      просмотр этого формата не поддерживается — скачайте файл
    </Text>
  );
}

export function SheetList({
  sheets,
  dictTokens,
}: {
  sheets: PvSheet[];
  dictTokens: { has(token: string): boolean };
}) {
  // Один раскрытый лист за раз: на телефоне два DXF-парса рядом — это два воркера и два
  // больших SVG, а сравнивать листы бок о бок с экрана 6" всё равно никто не будет.
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (sheets.length === 0) {
    return (
      <Text size='micro' variant='label' component='p'>
        в этой группе нет листов
      </Text>
    );
  }

  return (
    <div>
      {sheets.map((sheet, i) => {
        const key = (sheet.line_key ?? '').trim() || `#${i}`;
        const open = openKey === key;
        // Ссылка идёт в <a href> — только http(s), см. isSafePatternUrl.
        const raw = (sheet.download_url ?? '').trim();
        const download = isSafePatternUrl(raw) ? raw : '';
        const kind = sheetKind(sheet);
        return (
          <div key={key} className='border-b border-hairline last:border-b-0'>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={() => setOpenKey(open ? null : key)}
                aria-expanded={open}
                className='min-h-11 min-w-0 flex-1 cursor-pointer py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <Text component='p' className='truncate'>
                  {open ? '− ' : '+ '}
                  {(sheet.name ?? '').trim() || (sheet.filename ?? '').trim() || 'лист'}
                </Text>
                <Text size='micro' variant='label' component='p' className='truncate'>
                  {[
                    (sheet.filename ?? '').trim(),
                    sizeLabel(sheet, kind),
                    sheet.version ? `v${sheet.version}` : '',
                    sheet.size_bytes ? formatBytes(sheet.size_bytes) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </button>
              {download && (
                <Button asChild variant='secondary' size='lg' className='flex min-h-11 shrink-0 items-center'>
                  <a href={download}>скачать</a>
                </Button>
              )}
            </div>
            {open && (
              <div className='pb-2.5'>
                <SheetBody sheet={sheet} kind={kind} dictTokens={dictTokens} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
