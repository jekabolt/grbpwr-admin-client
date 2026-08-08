// DXF-лист публичной страницы: JSON-хоп за presigned-URL, затем тот же DxfSheetView, что и в
// админской модалке (SVG-контуры, безопасно на телефоне; WebGL-вьювер сюда не тащим).
//
// DxfSheetView — ЛЕНИВЫЙ чанк: парсер, воркер и геометрия не грузятся, пока швея не открыла
// именно DXF. PDF-листы и сама страница обходятся без него.
//
// Ошибка на любом шаге (хоп не ответил, DXF не разобрался) — сообщение, а НЕ тупик: кнопка
// «скачать» живёт на строке листа в sheet-list и работает при сломанном рендере (тот же
// договор деградации, что у dxf-quick-view-modal).
import { Suspense, lazy, useEffect, useState } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import type { NestingFile } from 'components/managers/tech-card/components/nesting/use-nesting';
import { resolvePatternUrl, type PvSheet } from './manifest';

const DxfSheetView = lazy(() =>
  import('components/managers/tech-card/components/nesting/dxf-sheet-view').then((m) => ({
    default: m.DxfSheetView,
  })),
);

export function DxfSheet({
  sheet,
  dictTokens,
}: {
  sheet: PvSheet;
  dictTokens: { has(token: string): boolean };
}) {
  const [files, setFiles] = useState<NestingFile[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    setFiles(null);
    setFailed(false);
    const view = (sheet.view_url ?? '').trim();
    if (!view) {
      setFailed(true);
      return;
    }
    resolvePatternUrl(view)
      .then((url) => {
        if (dead) return;
        setFiles([{ name: sheet.filename || sheet.name || 'выкройка.dxf', url }]);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
  }, [sheet]);

  if (failed) {
    return (
      <CalloutBox tone='error'>
        <Text size='micro' component='p'>
          не удалось открыть DXF — скачайте файл и откройте его в CAD
        </Text>
      </CalloutBox>
    );
  }
  if (!files) {
    return (
      <Text size='micro' variant='label' component='p'>
        получение файла…
      </Text>
    );
  }
  return (
    <Suspense
      fallback={
        <Text size='micro' variant='label' component='p'>
          загрузка просмотра DXF…
        </Text>
      }
    >
      <DxfSheetView files={files} dictTokens={dictTokens} touchTargets />
    </Suspense>
  );
}
