// СКЛЕЙКА ПО-РАЗМЕРНЫХ ВЫГРУЗОК — экран.
//
// ЗАЧЕМ ОН ЕСТЬ. CLO кладёт припуск на шов только для ТЕКУЩЕГО размера: в выгрузке «все размеры»
// линия кроя во всех блоках одна, базового размера, и на старших размерах она местами заходит
// внутрь линии шва — кроить по ней значит резать по живому. Лечится это выгрузкой по одному
// размеру за раз, но тогда у карточки пять файлов вместо чертежа: раскладка, просмотр и печать
// считают их разными листами, а размерная полоска на плитке — пятью обрывками. Здесь пять
// файлов становятся одним, и в карточку уезжает он.
//
// ЧТО ОПЕРАТОР ВИДИТ ДО ЗАГРУЗКИ. Какие размеры узнались в именах блоков, сколько деталей принёс
// каждый файл, какие файлы оказались дублями (CLO повторяет предыдущий размер чаще, чем хочется
// верить), и сам склеенный чертёж нашим же листом — с переключением размера и слоя. Это тот же
// просмотр, которым карточка показывает уже загруженные выкройки, поэтому увиденное здесь и
// посчитанное потом не могут разойтись.
import {
  decodeDxfBytes,
  encodeDxfBytes,
  mergeDxfSheets,
  type MergeResult,
} from 'lib/nesting/dxf/merge';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { MAX_PATTERN_BYTES, formatBytes, patternFileError } from 'utils/pattern';
import { DxfSheetView } from './dxf-sheet-view';
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
}: {
  open: boolean;
  onClose: () => void;
  /** Готовый файл — родитель отдаёт его обычной модалке загрузки (имя, материал, upload). */
  onReady: (file: File) => void;
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

  function handleFiles(list: FileList | null) {
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
      setError(
        `files picked: ${files.length} — is that a size range? we don't merge more than ${MAX_SHEETS} at a time.`,
      );
      return;
    }
    setBuilt(null); // старую ссылку отзовёт эффект: у времени жизни blob'а один хозяин
    setError(null);
    setPicked(files);
  }

  const previewFiles = useMemo(
    () => (built ? [{ name: built.file.name, url: built.url }] : null),
    [built],
  );

  const sizes = built
    ? [...new Set(built.plan.rows.filter((r) => !r.duplicateOf).flatMap((r) => r.sizes))]
    : [];

  // Потолок стоит на СКЛЕЙКЕ, а не на исходниках: каждый файл по отдельности проходит проверку
  // размера, а их сумма — не обязательно. Узнать об этом на загрузке значило бы отдать оператору
  // отказ сервера вместо объяснения; кнопка «скачать» при этом остаётся — файл-то собран.
  const tooBig = built != null && built.file.size > MAX_PATTERN_BYTES;
  // Один файл склеивать не с чем: получилась бы его же копия под новым именем. Это не ошибка, а
  // не тот вход — для готового чертежа рядом стоит «+ DXF».
  const singleSheet = picked.length === 1;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
      onConfirm={() => {
        if (built) onReady(built.file);
      }}
      onCancel={() => {
        if (!busy) onClose();
      }}
      title='merge sizes into one DXF'
      confirmLabel='upload to the card'
      cancelLabel='cancel'
      confirmDisabled={!built || busy || tooBig || singleSheet}
      width='lg'
      closeOnConfirm
    >
      <div className='space-y-2.5'>
        <Text size='micro' variant='label' component='p'>
          CLO puts the seam allowance on the current size only — which is why the pattern maker
          exports the sizes one by one. here they are collected into one drawing: the geometry of
          every block is copied verbatim (notches, grainline, inner lines and text stay where they
          are), and the sizes are nested into one another, as in an “all sizes” export.
        </Text>

        <div className='flex flex-wrap items-center gap-1.5'>
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
            variant={picked.length === 0 ? 'main' : 'secondary'}
            size='xs'
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {picked.length === 0 ? '+ pick size files' : 'pick other files'}
          </Button>
          {busy && (
            <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
              parsing and merging…
            </Text>
          )}
          {built && (
            <Button asChild variant='secondary' size='xs'>
              <a href={built.url} download={built.file.name}>
                download the file
              </a>
            </Button>
          )}
        </div>

        {error && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              {error}
            </Text>
          </CalloutBox>
        )}

        {singleSheet && (
          <Text size='micro' variant='label' component='p'>
            one file picked — there is nothing to merge it with. a finished drawing is uploaded
            with the “+ DXF” button; what goes here is the PER-SIZE exports, one file per size.
          </Text>
        )}

        {tooBig && built && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              the merged file is {formatBytes(built.file.size)} — over the upload ceiling (
              {formatBytes(MAX_PATTERN_BYTES)}). it can't be uploaded to the card; download it and
              hand it to the pattern maker so the export comes out lighter (splines and inner
              lines are what usually bloats it).
            </Text>
          </CalloutBox>
        )}

        {picked.length > 0 && (
          <div className='border border-borderColor'>
            {picked.map((f, i) => {
              const row = built?.plan.rows[i];
              return (
                <div
                  key={`${f.name}-${i}`}
                  className='flex flex-wrap items-baseline gap-1.5 border-b border-hairline px-1.5 py-1 last:border-b-0'
                >
                  <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                    {f.name}
                  </Text>
                  <Text size='nano' variant='label' component='span'>
                    {formatBytes(f.size)}
                  </Text>
                  {row && row.sizes.length > 0 && (
                    <Pill tone={row.duplicateOf ? 'warn' : 'ink'}>{row.sizes.join(', ')}</Pill>
                  )}
                  {row && (
                    <Text size='nano' variant='label' component='span'>
                      pieces: {row.blocks}
                    </Text>
                  )}
                  {row?.duplicateOf && (
                    <Pill
                      tone='warn'
                      title={`the same blocks were already brought by ${row.duplicateOf}`}
                    >
                      duplicate — not included
                    </Pill>
                  )}
                  {!!row?.moved && (
                    <Pill tone='attention' title='the file was exported in its own coordinate system'>
                      pieces moved: {row.moved}
                    </Pill>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {built && (
          <>
            <div className='flex flex-wrap items-center gap-1.5 border-b border-borderColor pb-1'>
              <Text size='micro' component='span'>
                <b>merged:</b> blocks {built.result.blocks.length}
                {sizes.length > 0 ? `, sizes ${sizes.join(', ')}` : ''}
              </Text>
              {built.result.skipped.length > 0 && (
                <Pill
                  tone='warn'
                  title={built.result.skipped
                    .map((s) => `${s.block}: already brought by ${s.keptFrom}`)
                    .join('; ')}
                >
                  repeated blocks: {built.result.skipped.length}
                </Pill>
              )}
              {built.plan.maxShiftMm > 0 && (
                <Pill tone='attention'>
                  largest move: {built.plan.maxShiftMm.toFixed(0)} mm
                </Pill>
              )}
              <Text size='nano' variant='label' component='span' className='ml-auto'>
                {formatBytes(built.file.size)} · {built.file.name}
              </Text>
            </div>

            {[...built.parseWarnings, ...built.plan.warnings, ...built.result.warnings].map((w) => (
              <Text key={w} size='nano' component='p' className='text-error'>
                {w}
              </Text>
            ))}

            {/* Проверка глазами до загрузки: тот же лист, что показывает карточку. Размер и слой
                переключаются — если склейка перепутала кадры, это видно сразу, а не в цеху. */}
            {previewFiles && <DxfSheetView files={previewFiles} dictTokens={dictTokens} />}
          </>
        )}
      </div>
    </ConfirmationModal>
  );
}
