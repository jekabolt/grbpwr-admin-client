// СКЛЕЙКА ПО-РАЗМЕРНЫХ ВЫГРУЗОК. CLO кладёт припуск на шов только для текущего размера, поэтому
// конструктор выгружает размеры по одному; здесь пять файлов становятся одним чертежом, и в
// карточку уезжает он. Экран — список файлов с узнанными размерами и одно действие «merge».
import {
  decodeDxfBytes,
  encodeDxfBytes,
  mergeDxfSheets,
  type MergeResult,
} from 'lib/nesting/dxf/merge';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, ConfirmationModal, HeaderWarnings, type HeaderWarning, Pill, Text } from 'ui';
import { MAX_PATTERN_BYTES, formatBytes, patternFileError } from 'utils/pattern';
import { planSizeMerge, type SizeMergePlan } from './size-merge';
import { useDictionarySizeTokens } from './use-block-sizes';

/** Сколько листов принимаем за раз: размерный ряд, а не «всю папку». */
const MAX_SHEETS = 20;

type Built = {
  file: File;
  url: string;
  result: MergeResult;
  plan: SizeMergePlan;
  parseWarnings: string[];
};

// Имя склеенного файла собирается из НАЙДЕННЫХ размеров, а не из имён исходников: «allsizes-xs-s-
// m-l-xl.dxf» отвечает на вопрос «что внутри» без открытия. ASCII — имя едет в объектное
// хранилище и в цех, где кириллица в путях до сих пор ломается.
function mergedFileName(plan: SizeMergePlan): string {
  const sizes = [...new Set(plan.rows.filter((r) => !r.duplicateOf).flatMap((r) => r.sizes))]
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean);
  return sizes.length > 0 ? `allsizes-${sizes.join('-')}.dxf` : 'allsizes.dxf';
}

export function MergeSizesModal({
  open,
  onClose,
  onReady,
  initialFiles,
  scopeKey,
}: {
  open: boolean;
  onClose: () => void;
  /** Готовый файл — родитель грузит его в слот `scopeKey` (тот, на который бросили файлы). */
  onReady: (file: File, scopeKey?: string) => void;
  /** Файлы, уже брошенные на слот: склейка стартует с них, без своего выбора. */
  initialFiles?: File[];
  scopeKey?: string;
}) {
  const dictTokens = useDictionarySizeTokens();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `merge-sizes-${useId().replace(/:/g, '')}`;

  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ссылка на blob живёт ровно столько, сколько показывается: просмотрщик тянет файл обычным
  // fetch'ем, а неотозванная ссылка держит склейку в памяти вкладки до перезагрузки.
  useEffect(() => {
    return () => {
      if (built) URL.revokeObjectURL(built.url);
    };
  }, [built]);

  useEffect(() => {
    if (!open) {
      setPicked([]);
      setBuilt(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (picked.length === 0) return;
    let dead = false;
    const client = new NestingWorkerClient();
    setBusy(true);
    setError(null);
    (async () => {
      try {
        // Разбор — тот же воркер и те же допуски, что у раскладки: размеры и детали должны
        // читаться ровно так, как их прочтёт карточка после загрузки.
        const parsed = await client.parse(picked, {
          unit: 'auto',
          tol: NEST_DEFAULTS.tol,
          tolChain: NEST_DEFAULTS.tolChain,
        });
        if (dead) return;
        const names = picked.map((f) => f.name);
        const plan = planSizeMerge(parsed.pieces, names, dictTokens, parsed.detectedUnit);
        // Читаем БАЙТАМИ: `File.text()` декодировал бы cp1251-выгрузку как UTF-8 и подменил бы
        // кириллические имена блоков ромбиками — теми самыми именами, по которым карточка потом
        // сопоставляет детали кроя.
        const texts = await Promise.all(
          picked.map(async (f) => decodeDxfBytes(await f.arrayBuffer())),
        );
        if (dead) return;
        const result = mergeDxfSheets(
          names.map((name, i) => ({ name, text: texts[i] })),
          plan.offsets,
        );
        const file = new File([encodeDxfBytes(result.text)], mergedFileName(plan), {
          type: 'application/dxf',
        });
        if (dead) return;
        setBuilt({
          file,
          url: URL.createObjectURL(file),
          result,
          plan,
          parseWarnings: parsed.warnings,
        });
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!dead) setBusy(false);
        client.terminate();
      }
    })();
    return () => {
      dead = true;
      client.terminate();
    };
  }, [picked, dictTokens]);

  function handleFiles(list: FileList | File[] | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const bad = files
      .map((f) => ({ f, err: patternFileError(f, { dxfOnly: true }) }))
      .filter((x) => x.err);
    if (bad.length > 0) {
      setError(bad.map((x) => `${x.f.name}: ${x.err}`).join('; '));
      return;
    }
    // Размерный ряд длиннее двух десятков не бывает, а разбор — это воркер и мегабайты геометрии
    // на файл: промах мышью по всей папке не должен вешать вкладку на минуту.
    if (files.length > MAX_SHEETS) {
      setError(`${files.length} files: merge takes up to ${MAX_SHEETS}`);
      return;
    }
    setBuilt(null); // старую ссылку отзовёт эффект: у времени жизни blob'а один хозяин
    setError(null);
    setPicked(files);
  }

  // Брошенные на слот файлы: разбор стартует сразу, при каждом открытии с новой пачкой.
  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0) handleFiles(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFiles]);

  // Потолок стоит на СКЛЕЙКЕ, а не на исходниках: каждый файл по отдельности проходит проверку
  // размера, а их сумма — не обязательно. Собранный файл всё равно можно скачать из подвала.
  const tooBig = built != null && built.file.size > MAX_PATTERN_BYTES;
  // Один файл склеивать не с чем: получилась бы его же копия под новым именем.
  const singleSheet = picked.length === 1;

  // Всё, что не так со склейкой, — в шапке тела, не абзацами.
  const warnings: (HeaderWarning | null | undefined | false)[] = [
    error ? { text: error, error: true } : null,
    ...(built
      ? [
          ...built.parseWarnings,
          ...built.plan.warnings,
          ...built.result.warnings,
          ...(built.result.skipped.length > 0
            ? [`repeated blocks skipped: ${built.result.skipped.length}`]
            : []),
        ]
      : []),
  ];

  const hint = busy ? (
    'merging…'
  ) : singleSheet ? (
    'pick 2 or more size files'
  ) : tooBig && built ? (
    <>
      {formatBytes(built.file.size)}, over the {formatBytes(MAX_PATTERN_BYTES)} limit ·{' '}
      <a href={built.url} download={built.file.name} className='underline underline-offset-2'>
        download
      </a>
    </>
  ) : undefined;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
      onConfirm={() => {
        if (built) onReady(built.file, scopeKey);
      }}
      onCancel={() => {
        if (!busy) onClose();
      }}
      title={picked.length > 1 ? `merge ${picked.length} size files` : 'merge size files'}
      headerActions={<HeaderWarnings items={warnings} />}
      hideCancel
      confirmLabel='merge'
      confirmDisabled={!built || busy || tooBig || singleSheet}
      footerHint={hint}
      closeOnConfirm
    >
      <div className='space-y-1.5'>
        {picked.length === 0 ? (
          <>
            <input
              ref={inputRef}
              id={inputId}
              type='file'
              accept='.dxf,image/vnd.dxf'
              multiple
              className='sr-only'
              onChange={(e) => {
                handleFiles(e.target.files);
                if (inputRef.current) inputRef.current.value = '';
              }}
            />
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              + pick size files
            </Button>
          </>
        ) : (
          <div>
            {picked.map((f, i) => {
              const row = built?.plan.rows[i];
              return (
                <div
                  key={`${f.name}-${i}`}
                  className='flex items-baseline gap-1.5 border-b border-hairline py-1 last:border-b-0'
                >
                  <Text
                    size='micro'
                    component='span'
                    className='min-w-0 flex-1 truncate'
                    title={f.name}
                  >
                    {f.name}
                  </Text>
                  {row?.duplicateOf ? (
                    <Pill tone='warn' title={`same blocks as ${row.duplicateOf}`}>
                      duplicate, skipped
                    </Pill>
                  ) : (
                    row && row.sizes.length > 0 && <Pill tone='ink'>{row.sizes.join(', ')}</Pill>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
