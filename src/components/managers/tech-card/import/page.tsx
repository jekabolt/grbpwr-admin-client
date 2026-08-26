/**
 * ИМПОРТ ТЕХ-КАРТЫ ИЗ АРХИВА — двухшаговый экран: сначала СУХОЙ ПРОГОН, потом фиксация.
 *
 * Почему два шага, а не один: архив приезжает из другой базы, и часть ссылок в нём здесь не
 * разрешается (материала нет в каталоге, размера нет в словаре). Сухой прогон показывает это
 * ДО записи, чтобы человек решил, импортировать ли карту с дырами, а не обнаружил их потом.
 *
 * Заливка идёт МИМО сгенерированного клиента: 256-мегабайтный архив не помещается в одно
 * gRPC-сообщение, поэтому сервер выставил её обычным multipart-POST'ом.
 */
import { useMutation } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { TechCardImportReport } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { ImportReportCounters, ImportReportTable } from './import-report-table';

const UPLOAD_PATH = '/api/techcard-archive/upload';

/** Заголовок авторизации ровно тот же, что у всего api-слоя (`src/api/api.ts`) и у заливки
 *  файлов (`files/upload/transport.ts`): грпц-шлюз читает метаданные из `Grpc-Metadata-*`. */
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { 'Grpc-Metadata-Authorization': `Bearer ${token}` } : {};
}

function endpoint(): string {
  const base = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
  return `${base}${UPLOAD_PATH}`;
}

// report допускает отсутствие СОЗНАТЕЛЬНО: с EmitUnpopulated незаполненное сообщение приезжает
// ЯВНЫМ null, а не пропущенным ключом, и `?? {}` тут не спасает — пустой объект не удовлетворяет
// типу, у которого все поля объявлены (пусть и как `| undefined`).
type UploadResult = { importId: string; report?: TechCardImportReport };

/**
 * Отказ заливки словами. Сервер отвечает `{"error": "..."}` и для 413 присылает ГОТОВУЮ фразу
 * про потолок — показываем её. Своя фраза нужна только на случай, когда 413 пришёл не от нас,
 * а от инфраструктуры (прокси, который режет тело и отдаёт html): тогда читать нечего.
 */
async function uploadFailure(res: Response): Promise<string> {
  let serverSaid = '';
  try {
    const text = await res.text();
    if (text) {
      try {
        serverSaid = (JSON.parse(text) as { error?: string }).error ?? '';
      } catch {
        /* тело не json — так отвечает инфраструктура, а не приложение */
      }
    }
  } catch {
    /* тело не прочиталось */
  }
  if (serverSaid) return serverSaid;
  if (res.status === 413) return 'the archive is larger than the 256 MiB this server accepts';
  return `upload failed (${res.status})`;
}

/** Достаёт id карты из деталей отказа «уже импортировано» (google.rpc.ErrorInfo). */
function alreadyImportedCardId(error: unknown): number | null {
  const details = (error as { details?: unknown[] } | undefined)?.details;
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    const info = d as { reason?: unknown; metadata?: Record<string, unknown> };
    if (info.reason !== 'TECH_CARD_IMPORT_ALREADY_COMMITTED') continue;
    const raw = info.metadata?.tech_card_id;
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

export function TechCardImport() {
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  /**
   * ЧТО ПОКАЗЫВАТЬ, ХРАНИТСЯ ЯВНО, А НЕ ВЫВОДИТСЯ ИЗ ЗАПРОСА. Отключённый запрос в react-query
   * держит `isPending=true` вечно, поэтому «ждём выбор файла» нельзя отличить от «идёт заливка»
   * по флагам запроса. Здесь состояние экрана — это `result`: его нет, значит файла ещё не
   * было; мутации отвечают только за «прямо сейчас летит запрос».
   */
  const [result, setResult] = useState<UploadResult | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File): Promise<UploadResult> => {
      const form = new FormData();
      form.append('archive', file, file.name);
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      if (!res.ok) throw new Error(await uploadFailure(res));
      const body = (await res.json()) as { import_id?: string; report?: TechCardImportReport };
      if (!body.import_id) throw new Error('the server accepted the archive but named no import');
      return { importId: body.import_id, report: body.report ?? undefined };
    },
    onSuccess: (r) => setResult(r),
    onError: (e: unknown) =>
      showMessage(e instanceof Error ? e.message : 'upload failed', 'error'),
  });

  const commit = useMutation({
    mutationFn: (importId: string) => adminService.CommitTechCardImport({ importId }),
    onSuccess: (res) => {
      const id = res.techCardId ?? 0;
      if (!id) {
        showMessage('the import finished but named no card', 'error');
        return;
      }
      showMessage('tech card imported', 'success');
      navigate(`/tech-cards/${id}`);
    },
    onError: (error: unknown) => {
      // ПОВТОР — НЕ АВАРИЯ. Двойной клик и возврат на этот экран по «назад» дают тот же отказ,
      // и у него есть готовый ответ: карта уже существует, надо просто её открыть.
      const existing = alreadyImportedCardId(error);
      if (existing) {
        showMessage('this archive was already imported — opening the card', 'success');
        navigate(`/tech-cards/${existing}`);
        return;
      }
      showMessage(error instanceof Error ? error.message : 'import failed', 'error');
    },
  });

  function accept(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showMessage('only a .zip archive can be imported', 'error');
      return;
    }
    setFileName(file.name);
    setResult(null);
    upload.mutate(file);
  }

  function reset() {
    setResult(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  if (!canWrite(SECTION.techCards)) {
    return (
      <div className='flex flex-col items-center gap-4 py-20'>
        <Text variant='uppercase'>importing a tech card needs write access</Text>
        <Button asChild variant='main' size='lg' className='uppercase'>
          <Link to={ROUTES.techCards}>← back to tech cards</Link>
        </Button>
      </div>
    );
  }

  const lines = result?.report?.lines ?? [];
  const counters = result?.report?.counters ?? [];

  return (
    <div className='flex flex-col gap-2.5 pb-16'>
      <Toolbar>
        <Button asChild variant='secondary' size='sm'>
          <Link to={ROUTES.techCards}>←</Link>
        </Button>
        <Text component='h1' variant='uppercase' tracking='section' className='font-bold'>
          import tech card
        </Text>
        <ToolbarSpacer />
        {result ? (
          <Button type='button' variant='secondary' size='sm' onClick={reset}>
            choose another file
          </Button>
        ) : null}
      </Toolbar>

      <SectionStack>
        {!result ? (
          <Section
            title='archive'
            question='which .zip should this base read? nothing is written until you confirm.'
          >
            {/* Дропзона — <div>, а не <button>: внутрь кладётся текст в две строки, а кнопка в
                этой системе меряется по содержимому и ложится поверх соседей. Клавиатурный путь
                закрыт отдельной кнопкой ниже, а не ролью на контейнере. */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center gap-2.5 border border-dashed p-10 ${
                dragging ? 'border-textColor bg-bgZebra' : 'border-borderColor'
              }`}
            >
              <Text variant='uppercase'>
                {upload.isPending ? 'reading the archive…' : 'drop a .zip here'}
              </Text>
              <Text size='micro' variant='label'>
                {fileName || 'one archive, up to 256 MiB'}
              </Text>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                loading={upload.isPending}
                onClick={() => inputRef.current?.click()}
              >
                choose file
              </Button>
              <input
                ref={inputRef}
                type='file'
                accept='.zip,application/zip'
                className='hidden'
                onChange={(e) => accept(e.target.files)}
              />
            </div>
          </Section>
        ) : (
          <>
            {/* СЧЁТЧИКИ — БЕЗ `Section`: StatGrid уже своя поверхность (DESIGN.md), и обёртка
                дала бы коробку в коробке — самый заметный способ промахнуться мимо системы. */}
            <div className='flex flex-col gap-2.5'>
              <Text size='micro' variant='label'>
                a dry run — nothing is written until «import». {fileName}
                {result.report?.styleNumber ? ` · ${result.report.styleNumber}` : ''}
              </Text>
              <ImportReportCounters counters={counters} />
            </div>

            <Section
              title='report'
              question='every row the import could not take whole, and what closes it.'
              action={
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase'
                  loading={commit.isPending}
                  onClick={() => commit.mutate(result.importId)}
                >
                  import
                </Button>
              }
            >
              <ImportReportTable lines={lines} />
            </Section>
          </>
        )}
      </SectionStack>
    </div>
  );
}
